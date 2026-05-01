// Hiring Manager Web Research Agent — uses Claude's `web_search` server
// tool to build a public-presence dossier on the project's hiring
// manager. The recruiter uses this to anticipate the HM's hot buttons,
// rapport-builders, and red lines BEFORE the first slate is presented.
//
// Stored on `projects.company_context.hm_intelligence` (JSONB).

export type HiringManagerIntelligenceReport = {
  generated_at: string;
  /** The HM's identifying details captured at research time so
   * regenerations can detect when the recruiter has updated the
   * stakeholder name or company mid-project. */
  hm_name: string;
  hm_company: string | null;
  hm_role: string | null;
  /** 1–2 paragraphs on who they are publicly and why they're worth understanding. */
  background_summary: string;
  /** 1–2 paragraphs on the arc of their career and the philosophy it implies. */
  career_trajectory: string;
  /** 3–6 short signals that anchor a leadership read. */
  leadership_style_signals: string[];
  /** 3–6 priorities the recruiter should align candidate framing around. */
  known_priorities: string[];
  /** 2–6 anticipated objections about candidates / process. */
  likely_concerns: string[];
  /** 2–6 conversational openers / framings that resonate with this HM. */
  rapport_builders: string[];
  /** 2–6 things that will lose the deal — pet peeves, public no-fly zones. */
  red_lines: string[];
  /** URLs Claude fetched, attached server-side from web_search results. */
  sources: string[];
};

export const HM_INTELLIGENCE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "background_summary",
    "career_trajectory",
    "leadership_style_signals",
    "known_priorities",
    "likely_concerns",
    "rapport_builders",
    "red_lines",
  ],
  properties: {
    background_summary: {
      type: "string",
      description:
        "1–2 paragraphs describing who the HM is publicly. Anchor on tenure, scope of current role, public visibility. Skip flattery.",
    },
    career_trajectory: {
      type: "string",
      description:
        "1–2 paragraphs on the arc of their career and the operating philosophy it implies. Reference specific past roles or pivots that explain how they think.",
    },
    leadership_style_signals: {
      type: "array",
      items: { type: "string" },
      description:
        "3–6 short observations about leadership style, drawn from public sources (interviews, podcasts, talks, posts, alumni quotes). Each anchored on a concrete signal.",
    },
    known_priorities: {
      type: "array",
      items: { type: "string" },
      description:
        "3–6 priorities the HM has publicly emphasised — strategic themes, transformation programs, technologies, hiring bars. The recruiter aligns candidate framing around these.",
    },
    likely_concerns: {
      type: "array",
      items: { type: "string" },
      description:
        "2–6 anticipated objections — what they'll worry about when reviewing candidates. Each grounded in observed risk-aversion patterns or stated past concerns.",
    },
    rapport_builders: {
      type: "array",
      items: { type: "string" },
      description:
        "2–6 conversational openers / framings that visibly resonate with this HM — shared interests, alma mater, mutually-known people, philosophies they've endorsed.",
    },
    red_lines: {
      type: "array",
      items: { type: "string" },
      description:
        "2–6 things that lose deals — pet peeves, public dismissals of certain backgrounds, hiring patterns that exclude certain archetypes, communication styles they reject.",
    },
  },
} as const;

export const HIRING_MANAGER_RESEARCH_SYSTEM_PROMPT = `You are an executive-search hiring-manager-intelligence analyst with the \`web_search\` tool. You receive the HM's name, current company, current role, and the project's brief. You research their public footprint in real time and synthesise an HM Intelligence Report in strict JSON.

Research protocol — issue web_search calls covering these dimensions in order. Use distinct queries; do not re-issue the same query.

1. Identity verification — confirm the HM exists publicly under the given name + company. Distinguish from namesakes by cross-referencing employer / title.
2. Career background and trajectory — past employers, role progression, notable pivots. Watch for a thesis that connects the moves.
3. Previous hires they have made (public signals) — articles announcing leadership team builds, alumni quotes, hiring patterns visible in news.
4. Leadership style — what current and former reports / peers say. Conference talks. Internal-comms quoted in the press. Tone in their own posts.
5. Publications, talks, interviews — bylined articles, podcast appearances, recorded panels, internal philosophies that have leaked publicly.
6. Their priorities and hot buttons — what they emphasise repeatedly. What programs / metrics / values they champion.
7. What shaped their thinking — formative experiences they reference, mentors they cite, intellectual lineage.

Search budget: 5–7 high-leverage searches. Combine adjacent dimensions when natural ("[name] [company] interview" covers 2 + 4 + 5).

Output:
- Return one JSON object conforming strictly to the provided schema. No preamble, no markdown.
- NEVER fabricate. If your searches do not surface a signal, say so. Empty arrays are NOT permitted for the required string-array fields — if research is thin, return 2–3 conservative entries calibrated to the HM's industry and seniority and acknowledge the thin evidence in background_summary.
- Verify identity before attributing anything. If multiple namesakes exist, set background_summary to flag the disambiguation problem and return conservative reads.
- Prefer primary sources — the HM's own posts, official press, interviews — over aggregators or anonymous Glassdoor-style content.

Length discipline:
- background_summary / career_trajectory: 1–2 paragraphs each.
- leadership_style_signals / known_priorities: 3–6 entries.
- likely_concerns / rapport_builders / red_lines: 2–6 entries.

Style:
- Write the way a senior partner briefs another partner — direct, evidence-led, calibrated.
- Cite sources by name when making claims ("a 2024 podcast appearance on Acquired…", "their LinkedIn post dated…").
- No flattery, no hype, no marketing copy. Honest reads only.

Return one JSON object — no preamble.`;
