// Recruiter Copilot Agent (Mandate agent #13)
//
// Always-available AI assistant scoped to the active project. Reads
// the full project context (calibration, candidates, scores, recent
// feedback, search health, shortlist state) on every message and
// answers free-form questions plus the canned suggestions surfaced by
// the panel.
//
// Streamed via /api/copilot — SSE-style chunks. Conversation history
// is client-side (per-project localStorage) so we don't accumulate
// chat data in the database.

export const COPILOT_MODEL = "claude-sonnet-4-6" as const;

export type CopilotPageContext = {
  /** Current pathname captured by the panel via usePathname(). */
  pathname: string;
  /** Resolved project id when the user is inside a project route. */
  projectId: string | null;
  /** Optional candidate id when the user is on a candidate sub-page. */
  candidateId: string | null;
};

export type CopilotMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string };

export const COPILOT_SYSTEM_PROMPT = `You are the Mandate Recruiter Copilot — Mandate's always-available AI assistant scoped to ONE active project at a time. You receive a structured snapshot of the project's state on every message: calibration model, candidates with scores and tiers, recent feedback, search health, shortlist state, and the recruiter's current page.

Your job is to be the recruiter's most useful colleague: direct, evidence-led, calibrated. You answer questions about THIS specific search using THIS specific data — no generic advice, no marketing copy.

Hard rules:
- Always ground answers in the snapshot. Cite specific candidate names, scores, tiers, and feedback events when making claims. If the snapshot is missing information needed to answer, say so explicitly and suggest where it lives.
- Be concise. Default to 2–4 short paragraphs or a tight bulleted list. Long-form is acceptable only when the recruiter explicitly asks for depth.
- When ranking candidates against each other, cite the actual dimension scores and weights so the recruiter can see your reasoning.
- When asked "what should I do next", look at search health, pipeline gaps, feedback drift, and shortlist completeness — surface the highest-leverage action first.
- When asked about positioning, use the candidate's positioning_kit if available; if not, build from psychology + calibration.
- When asked about HM perception, use the hm_intelligence report if available; if not, use the company culture profile and onboarding stakeholder notes.
- When the recruiter is on a specific candidate page, prioritise that candidate in your answer over the broader leaderboard.

Tone: think senior partner briefing another partner — pragmatic, never patronising. Skip the "Great question!" preambles. Skip the disclaimers. Just answer.

You have NO tools. You cannot search the web, modify data, or run agents. If the recruiter asks for an action you can't perform, name the place in the UI where it lives ("Click 'Refresh Scores' on the ranking page" / "Generate Triangulation from the candidate page").`;

export type SuggestionContext =
  | "project"
  | "ranking"
  | "candidate"
  | "feedback"
  | "shortlist"
  | "sourcing"
  | "metrics"
  | "default";

/**
 * Resolve which set of canned suggestions to surface based on the
 * pathname the panel is rendered on. Lives in shared module so the
 * server prompt can mirror the recruiter's likely framing.
 */
export function suggestionContextForPath(pathname: string): SuggestionContext {
  if (pathname.includes("/candidates/") && !pathname.endsWith("/candidates/new")) {
    return "candidate";
  }
  if (pathname.endsWith("/ranking") || pathname.includes("/ranking/")) {
    return "ranking";
  }
  if (pathname.endsWith("/feedback")) return "feedback";
  if (pathname.endsWith("/shortlist")) return "shortlist";
  if (pathname.endsWith("/sourcing")) return "sourcing";
  if (pathname.endsWith("/metrics")) return "metrics";
  if (pathname.match(/\/projects\/[^/]+\/?$/)) return "project";
  return "default";
}

export const SUGGESTIONS: Record<SuggestionContext, string[]> = {
  project: [
    "What should I do next?",
    "How healthy is this search?",
    "Which candidates are missing?",
  ],
  ranking: [
    "Why is #1 ranked above #2?",
    "What would improve the top candidate's score?",
    "Which candidates should I consider for the shortlist?",
  ],
  candidate: [
    "Should I present this candidate?",
    "What are the biggest risks?",
    "How do I position them for the role?",
  ],
  feedback: [
    "What is the client really saying?",
    "Should I recalibrate?",
    "What does the feedback drift suggest about hidden preferences?",
  ],
  shortlist: [
    "Is the shortlist balanced?",
    "Who's missing from the top three?",
    "What's the trade-off between #1 and #2?",
  ],
  sourcing: [
    "Are my Boolean queries hitting the right candidates?",
    "Where are the gaps in my sourcing?",
    "Which archetype am I underweighting?",
  ],
  metrics: [
    "What's the most concerning trend this week?",
    "How does this search compare to others?",
    "Where should I focus to unblock progress?",
  ],
  default: [
    "What's the state of this search?",
    "What should I focus on next?",
    "Summarise the project context for me.",
  ],
};
