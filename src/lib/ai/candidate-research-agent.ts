// Candidate Web Research Agent — uses Claude's `web_search` server tool
// to build a public-presence dossier on a candidate. The recruiter uses
// this to validate CV claims, surface thought-leadership, flag risk
// signals, and prepare talking points for outreach.
//
// Stored on `candidates.cv_structured.candidate_intelligence` (JSONB).

export type ThoughtLeadershipItem = {
  title: string;
  url: string;
  /** 1 sentence on what the piece argues / contributes. */
  summary: string;
};

export type CandidateIntelligenceReport = {
  generated_at: string;
  /** 1–2 paragraphs on how the candidate presents publicly. */
  public_profile: string;
  /** 1–2 paragraphs on the arc of the career — narrative, not list. */
  career_narrative: string;
  /** 0–6 thought-leadership items with URLs Claude actually fetched. */
  thought_leadership: ThoughtLeadershipItem[];
  /** 2–6 short positive signals. */
  reputation_signals: string[];
  /** 0–6 risk signals — things the recruiter should probe. */
  risk_signals: string[];
  /** 2–6 concrete talking points to lead with on outreach. */
  talking_points: string[];
  /** 0–100 — how findable + credible the candidate is publicly. */
  web_presence_score: number;
  /** URLs Claude fetched, attached server-side from web_search results. */
  sources: string[];
};

export const CANDIDATE_INTELLIGENCE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "public_profile",
    "career_narrative",
    "thought_leadership",
    "reputation_signals",
    "risk_signals",
    "talking_points",
    "web_presence_score",
  ],
  properties: {
    public_profile: {
      type: "string",
      description:
        "1–2 paragraphs describing how the candidate presents publicly today. Tone, visibility, what they emphasise. Ground in observed signals (LinkedIn headline, conference bios, podcast appearances, profile copy).",
    },
    career_narrative: {
      type: "string",
      description:
        "1–2 paragraphs on the arc of the career — the story their public presence tells. Include shifts in focus, repeating themes, and the framing they use to describe their own trajectory.",
    },
    thought_leadership: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "url", "summary"],
        properties: {
          title: { type: "string" },
          url: {
            type: "string",
            description:
              "Direct URL to the piece. Must come from a search result Claude actually fetched.",
          },
          summary: {
            type: "string",
            description:
              "1 sentence on the substantive argument or contribution.",
          },
        },
      },
      description:
        "0–6 substantive items: published articles, recorded talks, interviews, podcast appearances, technical posts. Skip puff pieces and boilerplate company announcements.",
    },
    reputation_signals: {
      type: "array",
      items: { type: "string" },
      description:
        "2–6 short positive signals. Each anchored on a concrete observation (an award, a venture-backed exit named in press, a speaking slot at a tier-1 conference). Skip generic praise.",
    },
    risk_signals: {
      type: "array",
      items: { type: "string" },
      description:
        "0–6 things the recruiter should probe — controversial public takes, role gaps the public record can't explain, repeat short tenures visible from LinkedIn, public disputes. Empty array when none surface.",
    },
    talking_points: {
      type: "array",
      items: { type: "string" },
      description:
        "2–6 concrete openers for the recruiter's first message — recent talks, mutual connections visible publicly, shared interests, recent posts. Each should be specific enough that the candidate would recognise the recruiter has done their homework.",
    },
    web_presence_score: {
      type: "integer",
      description:
        "0–100. 90+ = prolific public voice with verified track record; 60–80 = present and findable; 30–60 = limited but credible footprint; <30 = essentially invisible. Calibrate against role seniority — a 30-year veteran with no public footprint is a meaningful signal; a 5-year IC with the same is not.",
    },
  },
} as const;

export const CANDIDATE_INTELLIGENCE_SYSTEM_PROMPT = `You are an executive-search candidate-intelligence analyst with the \`web_search\` tool. You receive the candidate's name, current title, current company, and parsed CV. You research their public footprint in real time, then synthesise a single Candidate Intelligence Report in strict JSON.

Research protocol — issue web_search calls covering these dimensions in order. Use distinct queries; do not waste a search re-issuing the same query.

1. Identity verification — confirm the candidate exists publicly under the given name + company. Distinguish from namesakes by cross-referencing employer / title / location.
2. LinkedIn presence and recent activity — recent posts, comments, articles. Tone, frequency, themes.
3. Publications, talks, interviews — conference appearances, podcasts, bylined articles, op-eds.
4. News mentions — press releases, deal announcements, panel quotes, hiring announcements.
5. GitHub / technical contributions — when relevant to the role (engineering / data / AI).
6. Previous-company reputation — context on how their former employers are perceived in the market.
7. Public commentary on their field — calibrated takes, controversial positions, intellectual posture.

Search budget: 5–7 high-leverage searches. Combine adjacent dimensions when natural ("[name] [company] interview" covers 2 + 3 + 4).

Output:
- Return one JSON object conforming strictly to the provided schema. No preamble, no markdown.
- NEVER fabricate. If your searches do not surface a signal for a section, say so explicitly. Empty arrays are permitted for thought_leadership, risk_signals.
- Verify identity before attributing anything. If multiple namesakes exist and you can't disambiguate, set web_presence_score low and call it out in public_profile.
- Calibrate web_presence_score honestly. The score is interpretive, not just a search-hit count.
- Prefer primary sources (the candidate's own posts, official press) over aggregators.

Length discipline:
- public_profile / career_narrative: 1–2 paragraphs each.
- thought_leadership: 0–6 entries with verified URLs.
- reputation_signals / talking_points: 2–6 entries.
- risk_signals: 0–6 entries.

Style:
- Write the way a senior partner briefs another partner — direct, evidence-led, calibrated.
- Cite sources by name when making claims ("a 2025 Bloomberg interview…", "their LinkedIn post on X dated Y…").
- No flattery, no hype, no marketing copy. Honest reads only.

Return one JSON object — no preamble.`;
