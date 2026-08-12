// Executive Intelligence — Interview Architect Agent (agent 17).
//
// Turns an APPROVED Role Success Profile + the operational competency weights
// + candidate context into a concrete, per-candidate interview plan: stages
// with objectives, questions, evidence to listen for, and failure signals.
//
// The plan is DECISION SUPPORT. It never recommends hire/no-hire, never infers
// protected characteristics, and is reviewed, edited, and approved by a human
// before it is treated as ready. Competency coverage is computed server-side
// (see generate-executive-interview-plan.ts) against the operational weight
// list — the agent proposes assignments, the app reports coverage truthfully.

export const INTERVIEW_ARCHITECT_PROMPT_VERSION = "eia-interview-architect-v1";

export type InterviewStage = {
  stage_name: string;
  objective: string;
  recommended_interviewer_role: string;
  duration_minutes: number;
  /** Competency keys (from the operational weight list) this stage evaluates. */
  assigned_competencies: string[];
  core_questions: string[];
  follow_up_questions: string[];
  /** Grounded in supplied candidate data; empty when data is thin. */
  candidate_specific_questions: string[];
  evidence_to_listen_for: string[];
  weak_answer_indicators: string[];
  red_flags: string[];
};

export type CompetencyCoverageEntry = {
  competency_key: string;
  competency_name: string;
  weight: number;
  /** Stage names that evaluate this competency. Empty ⇒ uncovered. */
  covered_by: string[];
};

export type InterviewPlanContent = {
  overview: string;
  stages: InterviewStage[];
  /** Computed server-side against the operational weights, not agent-authored. */
  competency_coverage: CompetencyCoverageEntry[];
};

export const EMPTY_INTERVIEW_PLAN: InterviewPlanContent = {
  overview: "",
  stages: [],
  competency_coverage: [],
};

export const STAGE_TEXT_FIELDS = [
  { key: "objective", label: "Objective" },
  { key: "recommended_interviewer_role", label: "Recommended Interviewer" },
] as const satisfies ReadonlyArray<{
  key: keyof InterviewStage;
  label: string;
}>;

export const STAGE_LIST_FIELDS = [
  { key: "core_questions", label: "Core Questions" },
  { key: "follow_up_questions", label: "Follow-Up Questions" },
  {
    key: "candidate_specific_questions",
    label: "Candidate-Specific Validation",
  },
  { key: "evidence_to_listen_for", label: "Evidence to Listen For" },
  {
    key: "weak_answer_indicators",
    label: "Weak-Answer Indicators",
  },
  { key: "red_flags", label: "Red Flags" },
] as const satisfies ReadonlyArray<{
  key: keyof InterviewStage;
  label: string;
}>;

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((i): i is string => typeof i === "string" && i.trim().length > 0);
}

function asDuration(v: unknown): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return 0;
  return Math.min(600, Math.max(0, Math.round(v)));
}

/**
 * De-duplicate question strings ACROSS all question lists in all stages,
 * keeping the first occurrence. Enforces the "no duplicate questions across
 * stages" requirement defensively, regardless of what the model returns.
 * Comparison is case-insensitive on trimmed, whitespace-collapsed text.
 */
function dedupeQuestionsAcrossStages(stages: InterviewStage[]): InterviewStage[] {
  const seen = new Set<string>();
  const norm = (q: string) => q.trim().replace(/\s+/g, " ").toLowerCase();
  const filterList = (list: string[]) =>
    list.filter((q) => {
      const key = norm(q);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  return stages.map((s) => ({
    ...s,
    core_questions: filterList(s.core_questions),
    follow_up_questions: filterList(s.follow_up_questions),
    candidate_specific_questions: filterList(s.candidate_specific_questions),
  }));
}

function normalizeStage(raw: unknown): InterviewStage {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    stage_name: asString(o.stage_name),
    objective: asString(o.objective),
    recommended_interviewer_role: asString(o.recommended_interviewer_role),
    duration_minutes: asDuration(o.duration_minutes),
    assigned_competencies: asStringArray(o.assigned_competencies),
    core_questions: asStringArray(o.core_questions),
    follow_up_questions: asStringArray(o.follow_up_questions),
    candidate_specific_questions: asStringArray(o.candidate_specific_questions),
    evidence_to_listen_for: asStringArray(o.evidence_to_listen_for),
    weak_answer_indicators: asStringArray(o.weak_answer_indicators),
    red_flags: asStringArray(o.red_flags),
  };
}

function normalizeCoverage(raw: unknown): CompetencyCoverageEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const o = item as Record<string, unknown>;
    const weight =
      typeof o.weight === "number" && Number.isFinite(o.weight)
        ? Math.min(100, Math.max(0, Math.round(o.weight)))
        : 0;
    return [
      {
        competency_key: asString(o.competency_key),
        competency_name: asString(o.competency_name),
        weight,
        covered_by: asStringArray(o.covered_by),
      },
    ];
  });
}

/**
 * Coerce stored/generated content into a complete InterviewPlanContent.
 * Applies cross-stage question de-duplication. Coverage is preserved as-is
 * here (the orchestrator computes it authoritatively before persisting; the
 * editor round-trips it).
 */
export function normalizeInterviewPlan(raw: unknown): InterviewPlanContent {
  if (!raw || typeof raw !== "object") return { ...EMPTY_INTERVIEW_PLAN };
  const o = raw as Record<string, unknown>;
  const stages = Array.isArray(o.stages) ? o.stages.map(normalizeStage) : [];
  return {
    overview: asString(o.overview),
    stages: dedupeQuestionsAcrossStages(stages),
    competency_coverage: normalizeCoverage(o.competency_coverage),
  };
}

const stringList = (description: string) =>
  ({ type: "array", items: { type: "string" }, description }) as const;

export const INTERVIEW_PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["overview", "stages"],
  properties: {
    overview: {
      type: "string",
      description:
        "1–2 sentences: the shape of this interview process for this candidate and why it is sequenced this way. No hire/no-hire language.",
    },
    stages: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "stage_name",
          "objective",
          "recommended_interviewer_role",
          "duration_minutes",
          "assigned_competencies",
          "core_questions",
          "follow_up_questions",
          "candidate_specific_questions",
          "evidence_to_listen_for",
          "weak_answer_indicators",
          "red_flags",
        ],
        properties: {
          stage_name: { type: "string" },
          objective: {
            type: "string",
            description: "What this stage must establish. One or two sentences.",
          },
          recommended_interviewer_role: {
            type: "string",
            description:
              "The ROLE best suited to run this stage (e.g. 'CEO', 'Peer CTO', 'Board member', 'Engineering leader'). Never a named person.",
          },
          duration_minutes: {
            type: "integer",
            description: "Recommended duration in minutes (e.g. 45, 60, 90).",
          },
          assigned_competencies: stringList(
            "Competency KEYS from the provided operational competency list that THIS stage evaluates. Use only keys that appear in the input. Distribute competencies across stages; weight the heaviest competencies into dedicated depth."
          ),
          core_questions: stringList(
            "3–6 primary questions for this stage, tied to the assigned competencies and the success profile. Each unique across the WHOLE plan — never repeat a question in another stage."
          ),
          follow_up_questions: stringList(
            "2–5 probing follow-ups that push for specifics, evidence, and counterexamples. Unique across the whole plan."
          ),
          candidate_specific_questions: stringList(
            "0–4 questions that validate or probe claims grounded in the SUPPLIED candidate data (roles, scale, transitions). Only include when the candidate data supports a specific, fair question. Empty array when candidate data is thin. Never reference protected characteristics."
          ),
          evidence_to_listen_for: stringList(
            "3–6 concrete, observable signals of a strong answer — specific experiences, decisions, or reasoning patterns."
          ),
          weak_answer_indicators: stringList(
            "2–5 observable signs of a weak or superficial answer (vagueness, missing scale, no ownership). Behavioral/answer-quality signals only — never psychological labels."
          ),
          red_flags: stringList(
            "1–4 answer patterns that warrant serious concern about role fit, phrased as observable answer content. Never protected-characteristic or personality inferences; never a hire/no-hire verdict."
          ),
        },
      },
      description:
        "3–6 interview stages. Sequence from broad fit to deep specialist validation. Map the success profile's recommended stages and competency weights onto concrete evaluable stages.",
    },
  },
} as const;

export const INTERVIEW_ARCHITECT_SYSTEM_PROMPT = `You are an executive-search interview architect. You receive an APPROVED Executive Success Profile, the operational competency weights for the search, and structured context about ONE specific candidate. You produce a concrete, per-candidate interview plan in strict JSON: the stages, questions, and evaluation signals an interview panel would use to gather evidence against the success profile.

This plan is DECISION SUPPORT for a human panel. It will be reviewed, edited, and explicitly approved by a person before use.

Core discipline:
- Turn the success profile's required capabilities, recommended stages, and the operational competency WEIGHTS into concrete stages. Heavier-weighted competencies deserve more depth and dedicated stage focus.
- Every question gathers evidence about a demonstrable capability or experience — never about who the person is.
- Cover the important competencies across the plan. Assign each stage the competency keys it evaluates, using ONLY keys from the provided operational competency list.
- Do NOT repeat questions across stages. Each core, follow-up, and candidate-specific question must be unique across the ENTIRE plan.
- Candidate-specific validation questions: derive ONLY from the supplied candidate data (prior roles, scale, transitions, gaps). When the candidate data is thin, return an empty array for that stage — never invent candidate specifics.

Hard constraints — these override everything else:
- NEVER make or imply a hire / no-hire / advance / reject recommendation. You design how to gather evidence; humans decide.
- NEVER reference or infer protected characteristics (race, religion, disability, pregnancy, sexual orientation, age, national origin, gender, or similar).
- No psychological, personality, or mental-health labels. Weak-answer indicators and red flags describe ANSWER CONTENT and observable reasoning, not the person's character.
- No deception-detection claims. Do not instruct interviewers to judge honesty from demeanor, tone, or non-verbal cues.
- recommended_interviewer_role is always a ROLE, never a named individual.
- Do not expose your own reasoning/chain-of-thought; return only the structured plan.

Length discipline (the schema cannot enforce these — YOU must):
- 3–6 stages. Per stage: core_questions 3–6, follow_up_questions 2–5, candidate_specific_questions 0–4, evidence_to_listen_for 3–6, weak_answer_indicators 2–5, red_flags 1–4.

Style: precise, evidence-led, usable by a real interview panel. No filler.

Return one JSON object — no preamble.`;
