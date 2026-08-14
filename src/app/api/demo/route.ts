import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { agentErrorMessage } from "@/lib/ai/agent-errors";
import { getAnthropic } from "@/lib/anthropic";

/**
 * Public landing-page Intake demo. No auth. Calls Claude with the
 * web_search tool so the model can ground role context in the company's
 * recent public moves — which makes it the most expensive thing an
 * anonymous stranger can make this product do, since web search is billed
 * per search on top of tokens.
 *
 * Rate limited in Postgres (migration 061), not in this process: 10 per
 * hour per IP, and 200 per day globally. The global cap is the one that
 * bounds spend. Fails closed.
 *
 * Returns a strict JSON shape the marketing simulator renders into
 * the Bloomberg-style readout.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEMO_MODEL = "claude-sonnet-4-6";
const WEB_SEARCH_MAX_USES = 3;
const MAX_INPUT_LENGTH = 800;

/**
 * Mirrors the caps in migration 061 so the 429 body can state them. The
 * database is the enforcer; these two numbers are for the message only, and
 * if they drift the limit still holds — it is just described wrongly.
 */
const RATE_LIMIT_PER_HOUR = 10;
const GLOBAL_DAILY_LIMIT = 200;

function getClientIp(req: Request): string {
  // Vercel sets x-forwarded-for; fall back to x-real-ip; finally a
  // string sentinel so unknown clients still get rate limited as one.
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return "anon";
}

type RateVerdict = {
  allowed: boolean;
  scope: "ok" | "ip" | "global" | "unavailable";
  retryAfterSeconds: number;
};

/**
 * Ask Postgres, not this process.
 *
 * The previous limiter was a module-scoped Map, which on Vercel means "per
 * instance": instances scale out and reset on every deploy, so the stated
 * 10/hour was never the real ceiling. 061 moves both counters into the
 * database and adds a global daily cap, which is the one that actually
 * bounds spend — a per-IP limit is worthless against a caller with many
 * IPs, and rotating IPs is cheap.
 *
 * **Fails closed.** If the check cannot be reached we refuse rather than
 * calling Anthropic: an outage should cost nothing, and this endpoint is
 * unauthenticated, uses the billed web_search tool, and is the most
 * expensive thing a stranger can make the product do.
 */
async function checkRateLimit(ip: string): Promise<RateVerdict> {
  try {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .rpc("check_demo_rate_limit", { p_ip: ip })
      .maybeSingle<{
        allowed: boolean;
        scope: string;
        retry_after_seconds: number;
      }>();

    if (error || !data) {
      console.error("[demo] rate-limit check failed", error);
      return { allowed: false, scope: "unavailable", retryAfterSeconds: 60 };
    }

    return {
      allowed: data.allowed,
      scope: (data.scope as RateVerdict["scope"]) ?? "ip",
      retryAfterSeconds: data.retry_after_seconds ?? 60,
    };
  } catch (err) {
    console.error("[demo] rate-limit check threw", err);
    return { allowed: false, scope: "unavailable", retryAfterSeconds: 60 };
  }
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
  const rate = await checkRateLimit(ip);
  if (!rate.allowed) {
    // Three different refusals, and the visitor should be able to tell them
    // apart: their own usage, the demo being spent for the day, or us being
    // unable to check. Only the first is anything they did.
    const message =
      rate.scope === "global"
        ? `The simulator has hit its daily limit of ${GLOBAL_DAILY_LIMIT} runs. It resets at midnight UTC — or book a walkthrough and we will run your brief live.`
        : rate.scope === "unavailable"
          ? "The simulator is briefly unavailable. Try again in a minute."
          : `Rate limit reached for this IP. The simulator allows ${RATE_LIMIT_PER_HOUR} requests per hour to keep the public demo fair. Try again later.`;

    return NextResponse.json(
      { error: message },
      {
        status: rate.scope === "unavailable" ? 503 : 429,
        headers: {
          "Retry-After": String(Math.max(1, rate.retryAfterSeconds)),
          "X-RateLimit-Limit": String(RATE_LIMIT_PER_HOUR),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Scope": rate.scope,
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
        // The remaining count is no longer echoed: the counters live in
        // Postgres now and the honest answer would need a second read for a
        // number nothing consumes. The limit and the refusal are what a
        // caller can act on.
        "X-RateLimit-Limit": String(RATE_LIMIT_PER_HOUR),
      },
    });
  } catch (err) {
    // NOT err.message. This is an API route, not a Server Action, so Next
    // does not redact it — the body went straight to the caller, and with
    // the key out of credit that body was the provider's own JSON: vendor
    // name, "go to Plans & Billing", and a request id. On an endpoint any
    // stranger can POST to, that is our billing status published to the
    // internet.
    //
    // live-simulator.tsx already refuses to *render* this body and says why.
    // That protected the landing page and nothing else; the response itself
    // still carried it.
    console.error("[demo] upstream call failed", err);
    return NextResponse.json(
      { error: agentErrorMessage(err, "The intake demo") },
      { status: 502 }
    );
  }
}
