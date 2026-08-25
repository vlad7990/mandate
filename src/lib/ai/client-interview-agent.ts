// The Interviewer Agent's CLIENT face (117, client-interview slice).
//
// Composes a structured question set for the CLIENT — the hiring
// organization — from what the mandate PROVABLY lacks: the
// calibration's own missing_information residue from intake, and the
// provable calibration gaps. The gap list is computed SERVER-side
// (computeMandateGaps) and passed INTO the prompt; on return, every
// question's cited gap is checked against that list and questions
// citing gaps the mandate does not have are STRIPPED
// (finalizeClientInterview). The agent phrases; it cannot invent what
// the mandate lacks. Gap coverage is computed here, authoritatively —
// the agent proposes, the app reports.
//
// The set is DECISION SUPPORT and a DRAFT until a human approves it
// through the database's own door. It never asks about a named
// candidate's worth, never touches protected characteristics, and
// nothing reaches the client until approval puts it on the portal.

import type { CalibrationModel } from "./role-analysis";
import { DIMENSION_KEYS, type DimensionWeights } from "./onboarding-analysis";

export const CLIENT_INTERVIEW_PROMPT_VERSION = "client-interview-v1";

export type MandateGapKind = "missing_info" | "onboarding" | "calibration";

export type MandateGap = {
  /** Stable id the agent must cite (e.g. "missing_info:2"). */
  id: string;
  /** Human sentence: what the mandate lacks. */
  label: string;
  kind: MandateGapKind;
};

export type ClientInterviewQuestion = {
  /** Assigned server-side after stripping — "q01", "q02", … */
  id: string;
  question: string;
  why_it_matters: string;
  /** The gap this question addresses — always one of the computed list. */
  gap_id: string;
  gap_label: string;
};

export type GapCoverageEntry = {
  gap_id: string;
  gap_label: string;
  kind: MandateGapKind;
  /** Question ids addressing this gap. Empty ⇒ uncovered. */
  question_ids: string[];
};

export type ClientInterviewContent = {
  intro: string;
  questions: ClientInterviewQuestion[];
  /** Computed server-side against the gap list, not agent-authored. */
  gap_coverage: GapCoverageEntry[];
};

export const EMPTY_CLIENT_INTERVIEW: ClientInterviewContent = {
  intro: "",
  questions: [],
  gap_coverage: [],
};

/**
 * What the mandate PROVABLY lacks, computed from its own record — no
 * agent judgment involved. Three sources, each verifiable in the row:
 *
 *   * every `calibration_model.missing_information` item, verbatim —
 *     intake's own conservative list (the "Information required" rail);
 *   * an absent onboarding questionnaire — priorities were inferred,
 *     never confirmed by the client;
 *   * the calibration's weights: absent entirely, or so flat that
 *     "what matters most" is provably not yet established.
 *
 * Returns [] when the mandate has no calibration at all — the caller
 * refuses generation with the honest run-intake-first sentence rather
 * than asking the client to fill a void the desk hasn't mapped.
 */
export function computeMandateGaps(
  calibration: Partial<CalibrationModel> | null | undefined,
  onboarding: Record<string, unknown> | null | undefined
): MandateGap[] {
  if (!calibration || typeof calibration !== "object") return [];

  const gaps: MandateGap[] = [];

  const missing = Array.isArray(calibration.missing_information)
    ? calibration.missing_information.filter(
        (m): m is string => typeof m === "string" && m.trim().length > 0
      )
    : [];
  missing.forEach((item, i) => {
    gaps.push({
      id: `missing_info:${i + 1}`,
      label: item.trim(),
      kind: "missing_info",
    });
  });

  const onboardingDone =
    onboarding != null &&
    typeof onboarding === "object" &&
    Object.keys(onboarding).length > 0;
  if (!onboardingDone) {
    gaps.push({
      id: "onboarding:absent",
      label:
        "The onboarding questionnaire was never completed — must-haves, anti-patterns and priorities are inferred, not confirmed.",
      kind: "onboarding",
    });
  }

  const weights = calibration.dimension_weights;
  if (!weights || typeof weights !== "object") {
    gaps.push({
      id: "calibration:unweighted",
      label:
        "The scoring model has no dimension weights yet — what to evaluate candidates against is not established.",
      kind: "calibration",
    });
  } else {
    const values = DIMENSION_KEYS.map((k) => {
      const v = (weights as DimensionWeights)[k];
      return typeof v === "number" && Number.isFinite(v) ? v : 0;
    });
    const spread = Math.max(...values) - Math.min(...values);
    if (spread < 2) {
      gaps.push({
        id: "calibration:undifferentiated",
        label:
          "The five dimension weights are nearly flat — which capabilities matter most on this mandate is not yet established.",
        kind: "calibration",
      });
    }
  }

  return gaps;
}

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

type RawQuestion = {
  question: string;
  why_it_matters: string;
  gap_id: string;
};

/** Coerce the model's raw JSON into a list of candidate questions. */
export function normalizeClientInterviewDraft(raw: unknown): {
  intro: string;
  questions: RawQuestion[];
} {
  if (!raw || typeof raw !== "object") return { intro: "", questions: [] };
  const o = raw as Record<string, unknown>;
  const questions = Array.isArray(o.questions)
    ? o.questions.flatMap((item): RawQuestion[] => {
        if (!item || typeof item !== "object") return [];
        const q = item as Record<string, unknown>;
        const question = asString(q.question).trim();
        if (!question) return [];
        return [
          {
            question,
            why_it_matters: asString(q.why_it_matters).trim(),
            gap_id: asString(q.gap_id).trim(),
          },
        ];
      })
    : [];
  return { intro: asString(o.intro).trim(), questions };
}

/**
 * The server-side strip + coverage (gate D2). Questions citing a gap
 * the mandate does not have are DROPPED; survivors get stable ids and
 * the denormalized gap label; coverage is computed from what survived.
 * Duplicate question text is dropped, first occurrence kept.
 */
export function finalizeClientInterview(
  draft: { intro: string; questions: RawQuestion[] },
  gaps: MandateGap[]
): ClientInterviewContent {
  const gapById = new Map(gaps.map((g) => [g.id, g]));
  const seen = new Set<string>();
  const questions: ClientInterviewQuestion[] = [];

  for (const q of draft.questions) {
    const gap = gapById.get(q.gap_id);
    if (!gap) continue;
    const key = q.question.trim().replace(/\s+/g, " ").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    questions.push({
      id: `q${String(questions.length + 1).padStart(2, "0")}`,
      question: q.question,
      why_it_matters: q.why_it_matters,
      gap_id: gap.id,
      gap_label: gap.label,
    });
  }

  const gap_coverage: GapCoverageEntry[] = gaps.map((g) => ({
    gap_id: g.id,
    gap_label: g.label,
    kind: g.kind,
    question_ids: questions.filter((q) => q.gap_id === g.id).map((q) => q.id),
  }));

  return { intro: draft.intro, questions, gap_coverage };
}

/** Coerce stored content back into the full shape (for rendering). */
export function normalizeClientInterview(raw: unknown): ClientInterviewContent {
  if (!raw || typeof raw !== "object") return { ...EMPTY_CLIENT_INTERVIEW };
  const o = raw as Record<string, unknown>;
  const questions = Array.isArray(o.questions)
    ? o.questions.flatMap((item): ClientInterviewQuestion[] => {
        if (!item || typeof item !== "object") return [];
        const q = item as Record<string, unknown>;
        const question = asString(q.question);
        const id = asString(q.id);
        if (!question || !id) return [];
        return [
          {
            id,
            question,
            why_it_matters: asString(q.why_it_matters),
            gap_id: asString(q.gap_id),
            gap_label: asString(q.gap_label),
          },
        ];
      })
    : [];
  const gap_coverage = Array.isArray(o.gap_coverage)
    ? o.gap_coverage.flatMap((item): GapCoverageEntry[] => {
        if (!item || typeof item !== "object") return [];
        const g = item as Record<string, unknown>;
        const gap_id = asString(g.gap_id);
        if (!gap_id) return [];
        const kind = asString(g.kind);
        return [
          {
            gap_id,
            gap_label: asString(g.gap_label),
            kind: (["missing_info", "onboarding", "calibration"] as const).includes(
              kind as MandateGapKind
            )
              ? (kind as MandateGapKind)
              : "missing_info",
            question_ids: Array.isArray(g.question_ids)
              ? g.question_ids.filter((v): v is string => typeof v === "string")
              : [],
          },
        ];
      })
    : [];
  return { intro: asString(o.intro), questions, gap_coverage };
}

export const CLIENT_INTERVIEW_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["intro", "questions"],
  properties: {
    intro: {
      type: "string",
      description:
        "1–2 sentences addressed to the client: why the search team is asking these questions now. Plain, courteous, no jargon, no verdict language.",
    },
    questions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["question", "why_it_matters", "gap_id"],
        properties: {
          question: {
            type: "string",
            description:
              "One clear question the CLIENT can answer from their own knowledge of the role, team and company. Specific enough that the answer closes the cited gap.",
          },
          why_it_matters: {
            type: "string",
            description:
              "One sentence, client-facing: how the answer sharpens the search. Never mentions internal scoring mechanics.",
          },
          gap_id: {
            type: "string",
            description:
              "The id of the gap this question addresses — EXACTLY one id from the supplied gap list. Questions citing anything else are discarded.",
          },
        },
      },
      description:
        "4–10 questions. Cover every supplied gap with at least one question where a client could plausibly answer it; a gap may take two questions when it is broad (e.g. compensation structure + range). Never pad.",
    },
  },
} as const;

export const CLIENT_INTERVIEW_SYSTEM_PROMPT = `You are an executive-search consultant preparing to interview YOUR CLIENT — the hiring organization — partway through a search. You receive the mandate's context (role, company, job spec if one exists, current calibration) and a list of GAPS: things the mandate's own record provably lacks, each with a stable id. You produce a short, structured question set in strict JSON that a recruiter will review, approve, and put in front of the client.

The question set is DECISION SUPPORT for the search team and will be explicitly approved by a person before the client ever sees it.

Core discipline:
- Every question must cite exactly one gap_id from the supplied list. Questions citing anything else are discarded by the server. Do not invent gaps.
- Ask what the CLIENT can actually answer: facts about the role, team, reporting line, budget, timeline, priorities, success criteria. Not things only candidates could know.
- Phrase for a busy executive: direct, concrete, one thing per question, no search-industry jargon.
- Cover every gap where a client answer is plausible. If a gap cannot be closed by asking the client, leave it uncovered rather than forcing a bad question.

Hard constraints — these override everything else:
- NEVER ask for or imply a hire / no-hire / advance / reject judgment on any candidate, and never ask the client to compare or rank named candidates.
- NEVER reference or invite protected characteristics (race, religion, disability, pregnancy, sexual orientation, age, national origin, gender, or similar) — including proxies like "cultural background" or "life stage".
- No questions about a named individual's worth, personality, or private circumstances.
- Do not expose internal machinery (weights, scores, agents) in question or rationale text.
- Do not expose your own reasoning/chain-of-thought; return only the structured set.

Length discipline (the schema cannot enforce these — YOU must): 4–10 questions; intro 1–2 sentences; why_it_matters exactly one sentence.

Style: precise, courteous, immediately usable in a client conversation. No filler.

Return one JSON object — no preamble.`;
