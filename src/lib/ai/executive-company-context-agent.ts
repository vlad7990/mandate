// Executive Intelligence — Company Context Agent (agent 15).
//
// Web-search-grounded company operating context for executive due diligence.
// Distinct from the recruiter-facing Company Intelligence Agent: this brief
// answers "what does it take to succeed as a senior executive at THIS
// company at THIS stage" — operating complexity, stage norms, regulatory
// posture, governance landscape — and feeds the Executive Role Architect.
//
// Stored on `executive_searches.company_context` (JSONB).
//
// Safety posture: output describes the company and role environment only.
// It never characterizes candidates, never infers protected characteristics,
// and is labeled decision support wherever rendered.

export const EXECUTIVE_COMPANY_CONTEXT_PROMPT_VERSION =
  "eia-company-context-v1";

export type ExecutiveCompanyContext = {
  /** ISO timestamp the context was generated. */
  generated_at: string;
  /** 2–3 paragraphs: strategic posture, stage, and operating reality. */
  operating_summary: string;
  /** 1–2 paragraphs: what this company stage/scale demands from executives. */
  stage_and_scale_demands: string;
  /** 1–2 paragraphs: regulatory and governance environment. */
  regulatory_and_governance: string;
  /** 3–8 short themes the incoming executive must contend with. */
  operating_challenges: string[];
  /** 2–6 named executives/board figures the role will work with. */
  key_stakeholders: Array<{
    name: string;
    title: string;
    relevance_to_role: string;
  }>;
  /** 3–8 dated recent events material to the mandate. */
  recent_context: Array<{
    date: string;
    headline: string;
    significance: string;
  }>;
  /** URLs actually fetched via web_search — attached server-side. */
  sources: string[];
};

export const EXECUTIVE_COMPANY_CONTEXT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "operating_summary",
    "stage_and_scale_demands",
    "regulatory_and_governance",
    "operating_challenges",
    "key_stakeholders",
    "recent_context",
  ],
  properties: {
    operating_summary: {
      type: "string",
      description:
        "2–3 paragraphs on the company's current strategic posture, stage, and operating reality. Ground every claim in the search results with named programs and dated events. Written for an executive-assessment audience, not marketing.",
    },
    stage_and_scale_demands: {
      type: "string",
      description:
        "1–2 paragraphs on what this company's stage, scale, and trajectory demand from a senior executive: operating rhythm, resource constraints, growth or turnaround pressure, decision speed.",
    },
    regulatory_and_governance: {
      type: "string",
      description:
        "1–2 paragraphs on the regulatory environment and governance landscape (board composition, ownership pressure, compliance obligations). If the company is lightly regulated, say so explicitly.",
    },
    operating_challenges: {
      type: "array",
      items: { type: "string" },
      description:
        "3–8 short themes (≤8 words each) the incoming executive must contend with, drawn from the research. Examples: 'Legacy platform modernization', 'Post-acquisition integration', 'Regulatory remediation program'.",
    },
    key_stakeholders: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "title", "relevance_to_role"],
        properties: {
          name: { type: "string" },
          title: { type: "string" },
          relevance_to_role: {
            type: "string",
            description:
              "1 sentence on why this person matters to the role being scoped (manager, peer, board member, likely sponsor).",
          },
        },
      },
      description:
        "2–6 named executives or board figures the role will interact with. Empty array only if research surfaced no names.",
    },
    recent_context: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["date", "headline", "significance"],
        properties: {
          date: {
            type: "string",
            description: "ISO date when known (YYYY-MM-DD), else year (YYYY).",
          },
          headline: { type: "string" },
          significance: {
            type: "string",
            description:
              "1 sentence on what this means for the executive mandate.",
          },
        },
      },
      description:
        "3–8 most relevant dated events, newest first: funding, leadership changes, regulatory actions, major deals.",
    },
  },
} as const;

export const EXECUTIVE_COMPANY_CONTEXT_SYSTEM_PROMPT = `You are a company-context analyst supporting executive due diligence, with the \`web_search\` tool. You receive an executive search brief — company name, role title, stage, industry — and research the company in real time, then synthesise one Company Operating Context brief in strict JSON.

Your output supports human assessment of what an executive ROLE requires. It is decision support, never a decision.

Research protocol — cover these five dimensions with distinct queries:
1. Strategic posture and stage — funding/ownership, growth trajectory, business model reality.
2. Operating complexity — org scale, geographic footprint, platform/legacy burden, transformation programs.
3. Regulatory and governance environment — regulators, board composition, ownership pressure, compliance events.
4. Leadership landscape — the named executives and board figures this role would work with.
5. Recent material events — last 12 months: funding, leadership changes, regulatory actions, major deals.

Search budget: 4–6 high-leverage searches. Prioritise primary sources (company site, official filings, reputable financial/trade press) over aggregators.

Hard constraints — these override everything:
- Describe the COMPANY and the ROLE ENVIRONMENT only. Never characterize, evaluate, or speculate about any individual candidate.
- Never infer or reference protected characteristics of any person (race, religion, disability, pregnancy, sexual orientation, age, national origin, or similar).
- No psychological or mental-health characterizations of any named person.
- NEVER fabricate. If research yields no signal for a section, say so explicitly inside that section. Ground every claim in the search results, preferring named sources and dates.

Length discipline (the schema cannot enforce these — YOU must):
- operating_summary: 2–3 paragraphs. stage_and_scale_demands / regulatory_and_governance: 1–2 paragraphs each.
- operating_challenges: 3–8 short themes. key_stakeholders: 2–6 entries. recent_context: 3–8 items, newest first.

Style: direct, evidence-led, calibrated — the way a due-diligence partner briefs a board. No marketing copy.

Return one JSON object — no preamble.`;
