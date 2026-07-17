import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getAnthropic } from "@/lib/anthropic";
import {
  INTERVIEW_ARCHITECT_SYSTEM_PROMPT,
  INTERVIEW_PLAN_SCHEMA,
  normalizeInterviewPlan,
  type CompetencyCoverageEntry,
  type InterviewPlanContent,
} from "./executive-interview-architect-agent";
import { recordExecutiveAuditEvent } from "@/lib/executive/audit";

export const INTERVIEW_ARCHITECT_MODEL = "claude-sonnet-4-6";

/** Read-only SSR client for after() callbacks — see generate-job-spec.ts. */
async function createReadOnlySupabaseClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {
          /* read-only */
        },
      },
    }
  );
}

type OperationalWeight = {
  competency_key: string;
  competency_name: string;
  weight: number;
  definition: string;
};

/**
 * Compute competency coverage authoritatively from the OPERATIONAL weight list
 * (source of truth) against the stages' assigned competencies. The agent's own
 * coverage claims are ignored — we report which operational competencies are
 * actually evaluated by at least one stage, and which are not.
 */
export function computeCoverage(
  weights: OperationalWeight[],
  stages: InterviewPlanContent["stages"]
): CompetencyCoverageEntry[] {
  return weights
    .map((w) => {
      const covered_by = stages
        .filter((s) => s.assigned_competencies.includes(w.competency_key))
        .map((s) => s.stage_name)
        .filter((n) => n.trim().length > 0);
      return {
        competency_key: w.competency_key,
        competency_name: w.competency_name,
        weight: w.weight,
        covered_by,
      };
    })
    .sort((a, b) => b.weight - a.weight);
}

/**
 * Generate a per-candidate interview plan and persist it onto an existing
 * placeholder row in executive_interview_plans. Terminal-state discipline
 * mirrors the success-profile orchestrator: every failure clears
 * is_generating and writes generation_error.
 */
export async function generateAndStoreInterviewPlan(
  planRowId: string,
  searchId: string,
  candidateId: string,
  actorId: string | null
): Promise<void> {
  const supabase = await createReadOnlySupabaseClient();

  const { data: search, error: searchError } = await supabase
    .from("executive_searches")
    .select(
      "id, organization_id, company_name, role_title, role_family, industry, business_situation, company_context, company_context_status"
    )
    .eq("id", searchId)
    .single();

  if (searchError || !search) {
    const msg = `Failed to load search ${searchId}: ${searchError?.message ?? "not found"}`;
    await markFailed(planRowId, msg);
    throw new Error(msg);
  }

  // The approved success profile is the required foundation.
  const { data: profile, error: profileError } = await supabase
    .from("role_success_profiles")
    .select("id, content_json")
    .eq("search_id", searchId)
    .eq("status", "approved")
    .maybeSingle();

  if (profileError) {
    const msg = `Failed to load approved success profile: ${profileError.message}`;
    await markFailed(planRowId, msg);
    throw new Error(msg);
  }
  if (!profile) {
    const msg =
      "No approved success profile for this search. Approve a success profile before generating an interview plan.";
    await markFailed(planRowId, msg);
    throw new Error(msg);
  }

  // Operational competency weights (source of truth), joined to the library
  // for names + definitions.
  const { data: weightRows, error: weightError } = await supabase
    .from("executive_search_competencies")
    .select("weight, rationale, executive_competencies(key, name, definition)")
    .eq("search_id", searchId)
    .order("weight", { ascending: false });

  if (weightError) {
    const msg = `Failed to load competency weights: ${weightError.message}`;
    await markFailed(planRowId, msg);
    throw new Error(msg);
  }

  // PostgREST types a nested embed as an array even for a to-one relation, so
  // accept either shape and take the first row.
  type CompetencyEmbed = { key: string; name: string; definition: string };
  const weights: OperationalWeight[] = (
    (weightRows ?? []) as unknown as Array<{
      weight: number;
      executive_competencies: CompetencyEmbed | CompetencyEmbed[] | null;
    }>
  ).flatMap((r) => {
    const comp = Array.isArray(r.executive_competencies)
      ? r.executive_competencies[0]
      : r.executive_competencies;
    return comp
      ? [
          {
            competency_key: comp.key,
            competency_name: comp.name,
            weight: r.weight,
            definition: comp.definition,
          },
        ]
      : [];
  });

  // Candidate context — only structured, non-sensitive fields. Thin data is
  // fine; the agent is instructed to omit candidate-specific questions then.
  const { data: candidate, error: candidateError } = await supabase
    .from("candidates")
    .select(
      "id, full_name, current_title, current_company, location, cv_structured, recruiter_assessment"
    )
    .eq("id", candidateId)
    .single();

  if (candidateError || !candidate) {
    const msg = `Failed to load candidate ${candidateId}: ${candidateError?.message ?? "not found"}`;
    await markFailed(planRowId, msg);
    throw new Error(msg);
  }

  const userPrompt = JSON.stringify(
    {
      search: {
        company_name: search.company_name,
        role_title: search.role_title,
        role_family: search.role_family,
        industry: search.industry,
        business_situation: search.business_situation,
        company_operating_context:
          search.company_context_status === "ready" ? search.company_context : null,
      },
      approved_success_profile: profile.content_json,
      operational_competency_weights: weights.map((w) => ({
        competency_key: w.competency_key,
        competency_name: w.competency_name,
        weight: w.weight,
        definition: w.definition,
      })),
      candidate: {
        current_title: candidate.current_title,
        current_company: candidate.current_company,
        location: candidate.location,
        cv_structured: candidate.cv_structured,
        recruiter_assessment: candidate.recruiter_assessment,
      },
    },
    null,
    2
  );

  let content: InterviewPlanContent;
  try {
    const anthropic = getAnthropic();
    const response = await anthropic.messages.create({
      model: INTERVIEW_ARCHITECT_MODEL,
      max_tokens: 8000,
      system: INTERVIEW_ARCHITECT_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
      output_config: {
        format: { type: "json_schema", schema: INTERVIEW_PLAN_SCHEMA },
      },
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("Interview-architect response contained no text block");
    }
    content = normalizeInterviewPlan(JSON.parse(textBlock.text));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "AI call failed.";
    await markFailed(planRowId, msg);
    await recordExecutiveAuditEvent(supabase, {
      organizationId: search.organization_id,
      searchId,
      planId: planRowId,
      actorId,
      eventType: "interview_plan_generation_failed",
      detail: { candidate_id: candidateId, error: msg },
    });
    throw err;
  }

  // Drop competency assignments the model invented (not in the operational
  // list), then compute coverage authoritatively from the operational weights.
  const knownKeys = new Set(weights.map((w) => w.competency_key));
  const cleanedStages = content.stages.map((s) => ({
    ...s,
    assigned_competencies: s.assigned_competencies.filter((k) => knownKeys.has(k)),
  }));
  const finalContent: InterviewPlanContent = {
    ...content,
    stages: cleanedStages,
    competency_coverage: computeCoverage(weights, cleanedStages),
  };

  let cleared = false;
  try {
    const { error: updateError } = await supabase
      .from("executive_interview_plans")
      .update({
        content_json: finalContent,
        is_generating: false,
        generation_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", planRowId);
    if (updateError) {
      throw new Error(`Failed to persist interview plan: ${updateError.message}`);
    }
    cleared = true;

    const uncovered = finalContent.competency_coverage.filter(
      (c) => c.covered_by.length === 0
    ).length;
    await recordExecutiveAuditEvent(supabase, {
      organizationId: search.organization_id,
      searchId,
      planId: planRowId,
      actorId,
      eventType: "interview_plan_generated",
      detail: {
        candidate_id: candidateId,
        source_profile_id: profile.id,
        model_version: INTERVIEW_ARCHITECT_MODEL,
        stage_count: finalContent.stages.length,
        uncovered_competencies: uncovered,
      },
    });
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Failed to persist interview plan.";
    await markFailed(planRowId, msg);
    cleared = true;
    throw err;
  } finally {
    if (!cleared) {
      await markFailed(
        planRowId,
        "Generation failed during persistence (unrecoverable)."
      );
    }
  }
}

/** Terminal failed state — clears is_generating, never re-throws. */
async function markFailed(planRowId: string, errorMessage: string): Promise<void> {
  try {
    const supabase = await createReadOnlySupabaseClient();
    await supabase
      .from("executive_interview_plans")
      .update({
        is_generating: false,
        generation_error: errorMessage,
        updated_at: new Date().toISOString(),
      })
      .eq("id", planRowId);
  } catch (err) {
    console.error("[generate-interview-plan] failed to mark failure", err);
  }
}
