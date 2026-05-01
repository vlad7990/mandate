import { NextResponse } from "next/server";
import { getAnthropic } from "@/lib/anthropic";

/**
 * Public landing-page Intake demo. No auth, in-memory rate limited per
 * IP (10 reqs / 1h). Calls Claude with the web_search tool so the
 * model can ground role context in the company's recent public moves.
 *
 * Returns a strict JSON shape the marketing simulator renders into
 * the Bloomberg-style readout.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEMO_MODEL = "claude-sonnet-4-6";
const RATE_LIMIT_PER_HOUR = 10;
const WINDOW_MS = 60 * 60 * 1000;
const WEB_SEARCH_MAX_USES = 3;
const MAX_INPUT_LENGTH = 800;

// Module-scoped Map. Survives across requests on a single Lambda /
// Node instance — adequate for the closed-beta marketing surface.
// Pre-public-launch we'll swap this for Upstash or similar (item on
// CLAUDE.md PRE-LAUNCH CHECKLIST). Keep ENTRY_TTL grooming so the
// Map can't grow unbounded under attack.
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

function getClientIp(req: Request): string {
  // Vercel sets x-forwarded-for; fall back to x-real-ip; finally a
  // string sentinel so unknown clients still get rate limited as one.
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return "anon";
}

function checkRateLimit(ip: string): {
  allowed: boolean;
  remaining: number;
  resetAt: number;
} {
  const now = Date.now();

  // Lazy GC — drop expired entries each call. Keeps the Map small
  // without a separate timer thread.
  for (const [k, v] of buckets) {
    if (v.resetAt <= now) buckets.delete(k);
  }

  const existing = buckets.get(ip);
  if (!existing || existing.resetAt <= now) {
    const fresh = { count: 1, resetAt: now + WINDOW_MS };
    buckets.set(ip, fresh);
    return {
      allowed: true,
      remaining: RATE_LIMIT_PER_HOUR - 1,
      resetAt: fresh.resetAt,
    };
  }

  if (existing.count >= RATE_LIMIT_PER_HOUR) {
    return { allowed: false, remaining: 0, resetAt: existing.resetAt };
  }

  existing.count += 1;
  return {
    allowed: true,
    remaining: RATE_LIMIT_PER_HOUR - existing.count,
    resetAt: existing.resetAt,
  };
}

const DEMO_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "role_title",
    "company_name",
    "seniority",
    "function",
    "inferred_scope",
    "missing_information",
    "calibration_weights",
    "boolean_queries",
  ],
  properties: {
    role_title: {
      type: "string",
      description: "Clean formal title in title case.",
    },
    company_name: {
      type: "string",
      description:
        "Official company name. If the brief doesn't name a company, return 'Unspecified'.",
    },
    seniority: {
      type: "string",
      description:
        "One of: 'IC', 'Manager', 'Director', 'VP', 'C-Suite'. Pick the closest match.",
    },
    function: {
      type: "string",
      description:
        "Primary function: 'Engineering', 'Product', 'Operations', 'Risk', 'Finance', 'Data/AI', 'Sales', 'Marketing', 'People', 'Other'.",
    },
    inferred_scope: {
      type: "string",
      description: "1–2 sentences on the role's likely scope and seniority context.",
    },
    missing_information: {
      type: "array",
      items: { type: "string" },
      description:
        "0–6 critical gaps the recruiter must clarify (compensation, geography, team size, reporting line, mandate timeline). Be conservative.",
    },
    calibration_weights: {
      type: "object",
      additionalProperties: false,
      required: [
        "technical",
        "domain",
        "leadership",
        "regulatory",
        "transformation",
      ],
      properties: {
        technical: { type: "integer" },
        domain: { type: "integer" },
        leadership: { type: "integer" },
        regulatory: { type: "integer" },
        transformation: { type: "integer" },
      },
      description:
        "Each integer in 0–10. Differentiate — don't return all-fives.",
    },
    boolean_queries: {
      type: "array",
      items: { type: "string" },
      description:
        "Exactly 3 LinkedIn-style Boolean queries: an exact match, a broad match, and an adjacent / competitor search.",
    },
  },
} as const;

const DEMO_SYSTEM_PROMPT = `You are the Mandate Intake Agent running as a public landing-page demo. You have the web_search tool — use it 1–3 times to ground the role context in the named company's recent public posture (industry, regulatory weight, transformation programs). Then return one JSON object conforming strictly to the provided schema.

Hard rules:
- Output ONLY the JSON object — no preamble, no markdown.
- If the brief doesn't name a company, set company_name to "Unspecified" and skip web_search.
- calibration_weights: every integer 0–10. Differentiate — at least one ≥7 and one ≤4 unless the brief genuinely demands flat weights.
- boolean_queries: exactly 3 strings. First is exact match (tight title + 2–3 anchor skills). Second is broad (looser titles + adjacent skills). Third targets adjacent / competitor talent. Use parentheses, AND/OR, and quoted phrases.
- missing_information: be conservative — only flag truly critical gaps. Compensation range, geography, team size, reporting line, mandate timeline are common candidates.
- inferred_scope: 1–2 sentences, recruiter-facing tone, no marketing copy.

Speed matters — this is a live demo. Aim for fewer searches when the role is straightforward.`;

export async function POST(req: Request): Promise<Response> {
  const ip = getClientIp(req);
  const rate = checkRateLimit(ip);
  if (!rate.allowed) {
    const retrySeconds = Math.max(
      1,
      Math.ceil((rate.resetAt - Date.now()) / 1000)
    );
    return NextResponse.json(
      {
        error:
          "Rate limit reached for this IP. The simulator allows 10 requests per hour to keep the public demo fair. Try again later.",
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(retrySeconds),
          "X-RateLimit-Limit": String(RATE_LIMIT_PER_HOUR),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(Math.floor(rate.resetAt / 1000)),
        },
      }
    );
  }

  let body: { role_input?: unknown };
  try {
    body = (await req.json()) as { role_input?: unknown };
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  const raw = body.role_input;
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return NextResponse.json(
      { error: "Provide `role_input` as a non-empty string." },
      { status: 400 }
    );
  }

  const trimmed = raw.trim().slice(0, MAX_INPUT_LENGTH);

  try {
    const anthropic = getAnthropic();
    const response = await anthropic.messages.create({
      model: DEMO_MODEL,
      max_tokens: 2500,
      system: DEMO_SYSTEM_PROMPT,
      messages: [{ role: "user", content: trimmed }],
      tools: [
        {
          type: "web_search_20250305",
          name: "web_search",
          max_uses: WEB_SEARCH_MAX_USES,
        },
      ],
      output_config: {
        format: {
          type: "json_schema",
          schema: DEMO_SCHEMA,
        },
      },
    });

    // Final assistant text block carries the JSON. Earlier blocks are
    // server_tool_use / web_search_tool_result pairs we don't need
    // to forward to the public client.
    const textBlocks = response.content.filter(
      (b): b is Extract<typeof b, { type: "text" }> => b.type === "text"
    );
    const last = textBlocks[textBlocks.length - 1];
    if (!last) {
      throw new Error("Empty completion from upstream");
    }

    const parsed = JSON.parse(last.text) as Record<string, unknown>;
    return NextResponse.json(parsed, {
      headers: {
        "X-RateLimit-Limit": String(RATE_LIMIT_PER_HOUR),
        "X-RateLimit-Remaining": String(rate.remaining),
        "X-RateLimit-Reset": String(Math.floor(rate.resetAt / 1000)),
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Demo failed.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
