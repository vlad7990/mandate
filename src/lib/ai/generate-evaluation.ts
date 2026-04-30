import "server-only";
import { getAnthropic } from "@/lib/anthropic";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  CANDIDATE_EVALUATION_SCHEMA,
  CANDIDATE_EVALUATION_SYSTEM_PROMPT,
  type CandidateEvaluation,
} from "./candidate-evaluation";
import {
  type CandidateProfile,
  type FitDimensions,
} from "./cv-parsing";
import {
  DIMENSION_KEYS,
  type DimensionWeights,
} from "./onboarding-analysis";
import {
  type CalibrationModel,
  type CompanyContext,
} from "./role-analysis";
import { TIER_BANDS, type Tier } from "@/lib/ranking/scoring-engine";

const EVAL_MODEL = "claude-sonnet-4-6";

// We expose the evaluation through the candidate's existing
// cv_structured JSONB column under the `evaluation` key. That keeps the
// schema migration-free and avoids a join on every profile render.
export const EVALUATION_KEY = "evaluation" as const;

export type CvStructuredWithEvaluation = Partial<CandidateProfile> & {
  [EVALUATION_KEY]?: CandidateEvaluation;
};

type EvaluationInputCompetitor = {
  candidate_id: string;
  full_name: string;
  current_title: string | null;
  current_company: string | null;
  archetype: string | null;
  rank: number | null;
  overall_score: number | null;
  tier: Tier | null;
  tier_label: string | null;
  fit_dimensions: FitDimensions | null;
};

type EvaluationInput = {
  subject: {
    candidate_id: string;
    full_name: string;
    current_title: string | null;
    current_company: string | null;
    archetype: string | null;
    profile: Partial<CandidateProfile>;
    rank: number | null;
    overall_score: number | null;
    tier: Tier | null;
  };
  role: {
    role_title: string;
    company_name: string;
    calibration: Partial<CalibrationModel>;
    company: Partial<CompanyContext>;
    weights: DimensionWeights | null;
  };
  competitors: EvaluationInputCompetitor[];
};

// ────────────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────────────

/**
 * Generate the executive evaluation report for a single candidate.
 *
 * Caching: callers should check `cv_structured.evaluation` before
 * invoking this — generation is ~6–10s and costs an Anthropic call. The
 * page-level wrapper in `ensureCandidateEvaluation` does that gating.
 */
export async function generateCandidateEvaluation(
  input: EvaluationInput
): Promise<CandidateEvaluation> {
  const anthropic = getAnthropic();
  const userPrompt = JSON.stringify(input, null, 2);

  const response = await anthropic.messages.create({
    model: EVAL_MODEL,
    max_tokens: 3500,
    system: CANDIDATE_EVALUATION_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
    output_config: {
      format: {
        type: "json_schema",
        schema: CANDIDATE_EVALUATION_SCHEMA,
      },
    },
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Evaluation response contained no text block");
  }

  const partial = JSON.parse(textBlock.text) as Omit<
    CandidateEvaluation,
    "schema_version" | "generated_at" | "role_title" | "company_name"
  >;

  return {
    ...partial,
    schema_version: 1,
    generated_at: new Date().toISOString(),
    role_title: input.role.role_title,
    company_name: input.role.company_name,
  };
}

// ────────────────────────────────────────────────────────────────────────
// First-visit gate
// ────────────────────────────────────────────────────────────────────────

/**
 * Idempotently ensure a candidate has an evaluation report. Reads the
 * candidate row + project context + top 3 other ranked candidates,
 * generates the report if missing, persists it back into
 * cv_structured.evaluation, and returns the parsed evaluation.
 *
 * Returns null when the candidate's CV hasn't been parsed yet — there's
 * nothing meaningful for the agent to evaluate, and the page already
 * shows a "parse in flight" banner in that case.
 *
 * Failures are logged and return null. The page renders the rest of the
 * profile uninterrupted; a manual regenerate button can re-trigger the
 * call later.
 */
export async function ensureCandidateEvaluation(
  candidateId: string,
  projectId: string
): Promise<CandidateEvaluation | null> {
  const supabase = await createServerSupabaseClient();

  const { data: candidate, error: cErr } = await supabase
    .from("candidates")
    .select(
      "id, project_id, full_name, current_title, current_company, archetype, cv_structured, cv_processing"
    )
    .eq("id", candidateId)
    .single<{
      id: string;
      project_id: string;
      full_name: string;
      current_title: string | null;
      current_company: string | null;
      archetype: string | null;
      cv_structured: unknown;
      cv_processing: boolean;
    }>();

  if (cErr || !candidate) return null;
  if (candidate.project_id !== projectId) return null;
  if (candidate.cv_processing) return null;

  const cvStructured = (candidate.cv_structured ?? {}) as CvStructuredWithEvaluation;
  const profile = cvStructured as Partial<CandidateProfile>;

  // Need at least the profile core to evaluate against.
  if (!profile.fit_dimensions || !profile.summary) return null;

  // Cache hit — return existing report without re-running the agent.
  const existing = cvStructured[EVALUATION_KEY];
  if (existing && existing.schema_version === 1) {
    return existing;
  }

  // Cache miss — build the input and call the agent.
  const { data: project, error: pErr } = await supabase
    .from("projects")
    .select("id, title, company_name, calibration_model, company_context")
    .eq("id", projectId)
    .single<{
      id: string;
      title: string;
      company_name: string;
      calibration_model: Partial<CalibrationModel> | null;
      company_context: Partial<CompanyContext> | null;
    }>();

  if (pErr || !project) return null;

  // Subject's own score row (rank, tier, overall) for the comparison panel.
  const { data: subjectScore } = await supabase
    .from("candidate_scores")
    .select("rank_position, overall_score, tier")
    .eq("project_id", projectId)
    .eq("candidate_id", candidateId)
    .maybeSingle<{
      rank_position: number | null;
      overall_score: number | null;
      tier: string | null;
    }>();

  // Top three OTHER ranked candidates in the project, by rank ascending.
  const { data: rivalScoreRows } = await supabase
    .from("candidate_scores")
    .select(
      "candidate_id, rank_position, overall_score, tier, technical_score, domain_score, leadership_score, regulatory_score, transformation_score"
    )
    .eq("project_id", projectId)
    .neq("candidate_id", candidateId)
    .order("rank_position", { ascending: true })
    .limit(3);

  const competitors: EvaluationInputCompetitor[] = [];
  if (rivalScoreRows && rivalScoreRows.length > 0) {
    const rivalIds = rivalScoreRows.map((r) => r.candidate_id);
    const { data: rivalCandidates } = await supabase
      .from("candidates")
      .select("id, full_name, current_title, current_company, archetype")
      .in("id", rivalIds);

    const byId = new Map(
      (rivalCandidates ?? []).map((r) => [
        r.id,
        r as {
          id: string;
          full_name: string;
          current_title: string | null;
          current_company: string | null;
          archetype: string | null;
        },
      ])
    );

    for (const score of rivalScoreRows) {
      const cand = byId.get(score.candidate_id);
      if (!cand) continue;
      const tier = (score.tier as Tier | null) ?? null;
      competitors.push({
        candidate_id: cand.id,
        full_name: cand.full_name,
        current_title: cand.current_title,
        current_company: cand.current_company,
        archetype: cand.archetype,
        rank: score.rank_position,
        overall_score: score.overall_score,
        tier,
        tier_label: tier ? TIER_BANDS[tier].label : null,
        fit_dimensions: extractFit(score),
      });
    }
  }

  const calibration = (project.calibration_model ?? {}) as Partial<CalibrationModel>;
  const company = (project.company_context ?? {}) as Partial<CompanyContext>;
  const weights = (calibration.dimension_weights ?? null) as DimensionWeights | null;

  const evaluation = await safeGenerate({
    subject: {
      candidate_id: candidate.id,
      full_name: candidate.full_name,
      current_title: candidate.current_title,
      current_company: candidate.current_company,
      archetype: candidate.archetype,
      profile,
      rank: subjectScore?.rank_position ?? null,
      overall_score: subjectScore?.overall_score ?? null,
      tier: (subjectScore?.tier as Tier | null) ?? null,
    },
    role: {
      role_title: calibration.role_title ?? project.title,
      company_name: company.company_name ?? project.company_name,
      calibration,
      company,
      weights,
    },
    competitors,
  });

  if (!evaluation) return null;

  // Persist by spreading the existing JSON so we never clobber the
  // parser-produced fields. The candidate may also have legacy keys we
  // don't know about — the spread preserves them.
  const next: CvStructuredWithEvaluation = {
    ...cvStructured,
    [EVALUATION_KEY]: evaluation,
  };

  const { error: updateError } = await supabase
    .from("candidates")
    .update({
      cv_structured: next,
      updated_at: new Date().toISOString(),
    })
    .eq("id", candidateId);

  if (updateError) {
    console.error(
      "[evaluation] failed to persist evaluation for candidate",
      candidateId,
      updateError
    );
    // Still return the in-memory evaluation so the page renders it on
    // this request — the next visit will retry persistence.
    return evaluation;
  }

  return evaluation;
}

async function safeGenerate(
  input: EvaluationInput
): Promise<CandidateEvaluation | null> {
  try {
    return await generateCandidateEvaluation(input);
  } catch (err) {
    console.error("[evaluation] agent generation failed", err);
    return null;
  }
}

function extractFit(score: {
  technical_score: number | null;
  domain_score: number | null;
  leadership_score: number | null;
  regulatory_score: number | null;
  transformation_score: number | null;
}): FitDimensions | null {
  const dims = [
    score.technical_score,
    score.domain_score,
    score.leadership_score,
    score.regulatory_score,
    score.transformation_score,
  ];
  if (dims.some((v) => typeof v !== "number")) return null;
  return {
    technical: score.technical_score ?? 0,
    domain: score.domain_score ?? 0,
    leadership: score.leadership_score ?? 0,
    regulatory: score.regulatory_score ?? 0,
    transformation: score.transformation_score ?? 0,
  };
}

// Re-export so callers don't need a second import for the dimension keys.
export { DIMENSION_KEYS };
