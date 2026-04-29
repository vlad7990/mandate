// Shared types, schema, and prompt for the Shortlist Submission Report.
// Client-safe — components import the section types and helpers; the
// server-only generator imports the schema + prompt for the Anthropic
// call.

export type ShortlistCandidateBrief = {
  candidate_id: string;
  full_name: string;
  rank: number | null;
  overall_score: number | null;
  headline: string;
  /** 3 short bullets — what makes them stand out for THIS role. */
  strengths: string[];
  /** 1–2 risks the recruiter should flag in the submission. */
  risks: string[];
  /** 1 sentence trade-off vs. the slate's other candidates. */
  tradeoff: string;
  /** "advance", "pause", or "hold" — recommendation tone. */
  recommendation: "advance" | "pause" | "hold";
};

export type ShortlistReport = {
  /** 2–3 sentence executive summary opening the submission. */
  executive_summary: string;
  /** Why this slate vs. alternatives — 1–2 sentences. */
  slate_rationale: string;
  /** One brief per candidate, ordered exactly as the slate. */
  candidates: ShortlistCandidateBrief[];
  /** "If you pick X vs Y" scenario analysis — 2–4 callouts. */
  scenarios: Array<{
    headline: string;
    detail: string;
  }>;
  /** Single recommended next step (e.g. "Schedule round 1 with Marcus first"). */
  next_step: string;
};

export const SHORTLIST_REPORT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "executive_summary",
    "slate_rationale",
    "candidates",
    "scenarios",
    "next_step",
  ],
  properties: {
    executive_summary: {
      type: "string",
      description:
        "2–3 sentences opening the submission to the hiring manager. State the role, the strength of the slate, and the dominant theme. Plain prose; no bullets.",
    },
    slate_rationale: {
      type: "string",
      description:
        "1–2 sentences on why these specific candidates were selected vs. other ranked options, referencing the role's most heavily weighted dimensions.",
    },
    candidates: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "candidate_id",
          "full_name",
          "rank",
          "overall_score",
          "headline",
          "strengths",
          "risks",
          "tradeoff",
          "recommendation",
        ],
        properties: {
          candidate_id: {
            type: "string",
            description: "Must match one of the candidate_id values supplied in the input.",
          },
          full_name: { type: "string" },
          rank: { type: ["integer", "null"] },
          overall_score: { type: ["number", "null"] },
          headline: {
            type: "string",
            description:
              "1 sentence positioning. Combines current title/company with the standout signal (scale, transformation, regulatory).",
          },
          strengths: {
            type: "array",
            items: { type: "string" },
            description:
              "Exactly 3 short bullets (3–8 words each). What makes this candidate stand out for THIS role's calibration.",
          },
          risks: {
            type: "array",
            items: { type: "string" },
            description:
              "1–2 risks worth flagging in the submission. Honest, not aggressive — the hiring manager needs an accurate picture.",
          },
          tradeoff: {
            type: "string",
            description:
              "One sentence positioning this candidate vs. the others in the slate. Reference at least one peer by name.",
          },
          recommendation: {
            type: "string",
            enum: ["advance", "pause", "hold"],
            description:
              "advance = lead the submission with this candidate. pause = strong but a softer position in the slate. hold = include for breadth but not the front-runner.",
          },
        },
      },
      description:
        "One brief per candidate in the slate, in slate order. Length must match the input slate exactly — never add or drop.",
    },
    scenarios: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["headline", "detail"],
        properties: {
          headline: {
            type: "string",
            description:
              "Short hypothetical, e.g. 'If you pick Marcus over Sarah'.",
          },
          detail: {
            type: "string",
            description:
              "1–2 sentences on the trade-off implied by that pick — what gets stronger, what becomes a risk.",
          },
        },
      },
      description:
        "2–4 'If you pick X vs Y' scenarios. Cover the dominant trade-offs the hiring manager will weigh.",
    },
    next_step: {
      type: "string",
      description:
        "One sentence recommended next step — typically a sequencing call (who to schedule first, what to ask).",
    },
  },
} as const;

export const SHORTLIST_REPORT_SYSTEM_PROMPT = `You are an executive-search senior partner writing a submission report for a hiring manager. The recruiter has selected a small slate (typically 3 candidates) from a larger ranked pool. Your job is to produce a tight, honest, hiring-manager-grade brief.

Inputs (JSON):
  role_context     — title, inferred scope, role structure
  company_context  — company name, industry, business model
  calibration      — role weights + onboarding signals
  recruiter_narrative — optional prose the recruiter wrote; weave its voice into the executive_summary if non-empty
  slate            — ordered candidate briefs (parsed profile, score, rank)

Output strictly conforms to the provided JSON schema.

Style rules:
- Honest before flattering. The hiring manager benefits from a clear-eyed read on each candidate, not marketing copy.
- Never invent strengths or risks not supported by the supplied data.
- Reference candidates by full_name in prose, not by id.
- Strengths must be 3 items per candidate; risks 1–2 items.
- Recommendations: at most one "advance" per slate. The advance is the front-runner; everyone else is "pause" or "hold".
- scenarios cover at least 2 of the most important trade-offs (e.g. transformation depth vs regulatory caution; immediate availability vs strategic alignment).
- next_step is concrete — a name + a sequencing instruction.

Return one JSON object — no preamble, no markdown.`;

/**
 * Render the structured report as plain text (markdown-lite) for the
 * "Copy Report" CTA. Optimised for paste into email / Slack / Notion.
 */
export function reportToCopyText(
  report: ShortlistReport,
  context: {
    role_title: string;
    company_name: string;
    recruiter_narrative: string | null;
  }
): string {
  const lines: string[] = [];
  lines.push(`# Submission · ${context.role_title} @ ${context.company_name}`);
  lines.push("");
  lines.push(`## Executive summary`);
  lines.push(report.executive_summary);
  if (context.recruiter_narrative?.trim()) {
    lines.push("");
    lines.push(`> ${context.recruiter_narrative.trim().replace(/\n/g, "\n> ")}`);
  }
  lines.push("");
  lines.push(`## Slate rationale`);
  lines.push(report.slate_rationale);
  lines.push("");
  for (const c of report.candidates) {
    const rankLabel =
      typeof c.rank === "number" ? ` · Rank #${String(c.rank).padStart(2, "0")}` : "";
    const scoreLabel =
      typeof c.overall_score === "number"
        ? ` · ${c.overall_score.toFixed(1)}/10`
        : "";
    lines.push(`## ${c.full_name}${rankLabel}${scoreLabel}`);
    lines.push(`Recommendation: ${c.recommendation.toUpperCase()}`);
    lines.push(c.headline);
    lines.push("");
    lines.push(`**Strengths**`);
    for (const s of c.strengths) lines.push(`- ${s}`);
    lines.push("");
    lines.push(`**Risks**`);
    for (const r of c.risks) lines.push(`- ${r}`);
    lines.push("");
    lines.push(`**Trade-off vs slate**`);
    lines.push(c.tradeoff);
    lines.push("");
  }
  if (report.scenarios.length > 0) {
    lines.push(`## Scenarios`);
    for (const s of report.scenarios) {
      lines.push(`- **${s.headline}** — ${s.detail}`);
    }
    lines.push("");
  }
  lines.push(`## Recommended next step`);
  lines.push(report.next_step);
  return lines.join("\n").trim();
}

/**
 * Coerce an unknown JSONB blob from the database into a ShortlistReport.
 * Returns null when the report hasn't been generated yet
 * (report_content defaults to '{}'::jsonb on new rows).
 */
export function normalizeReport(raw: unknown): ShortlistReport | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Partial<ShortlistReport>;
  if (!obj.executive_summary || !Array.isArray(obj.candidates)) return null;
  return obj as ShortlistReport;
}
