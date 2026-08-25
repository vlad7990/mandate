import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getAnthropic } from "@/lib/anthropic";
import { agentErrorMessage, safeFailureMessage } from "./agent-errors";
import {
  INTERVIEWER_PROMPT_VERSION,
  INTERVIEWER_SYSTEM_PROMPT,
  MAINSTREAM_PLAN_SCHEMA,
  computeDimensionCoverage,
  normalizeMainstreamPlan,
} from "./interviewer-agent";
import { DIMENSION_KEYS, type DimensionWeights } from "./onboarding-analysis";
import { signInInterviewer } from "@/lib/agents/session";
import { applySkillsToPrompt } from "@/lib/skills/skill-injector";
import { captureSeamError } from "@/lib/observability/sentry";

/**
 * The mainstream interview-plan orchestrator (116, gate §125 slice one).
 * The 037/EI pipeline's shape with the mainstream sources — job spec,
 * projects.calibration_model, the candidate's own record — and one
 * deliberate improvement: every agent-session write carries
 * `{count: "exact"}` and refuses on zero rows (§129's law; the EI twin
 * predates it). Failure bookkeeping stays HUMAN (090 doctrine): the
 * agent never writes generation_error — the requester's read-only
 * cookie client does, in markFailed.
 */
const SUBJECT = "Interview-plan generation";

const INTERVIEWER_UNAVAILABLE_SENTENCE =
  "The Interviewer Agent could not run — an operator has suspended it or its credentials are absent. Retry when it is restored.";

export const INTERVIEWER_MODEL = "claude-sonnet-4-6";

export type InterviewPlanTrigger = "initial" | "regenerate";

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

export async function generateAndStoreProjectInterviewPlan(
  planRowId: string,
  projectId: string,
  candidateId: string,
  trigger: InterviewPlanTrigger = "regenerate"
): Promise<void> {
  const session = await signInInterviewer();
  if (!session.ok) {
    console.error(
      `[generate-interview-plan] The Interviewer Agent could not run — ` +
        `an operator has suspended it or its credentials are absent. ` +
        `The placeholder is marked. (${session.reason})`
    );
    await markFailed(planRowId, projectId, candidateId, INTERVIEWER_UNAVAILABLE_SENTENCE);
    return;
  }

  try {
    await generateUnderAgentSession(
      session.client,
      planRowId,
      projectId,
      candidateId,
      trigger
    );
  } finally {
    await session.signOut();
  }
}

async function generateUnderAgentSession(
  supabase: Awaited<ReturnType<typeof createReadOnlySupabaseClient>>,
  planRowId: string,
  projectId: string,
  candidateId: string,
  trigger: InterviewPlanTrigger
): Promise<void> {
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, title, company_name, calibration_model, company_context, organization_id")
    .eq("id", projectId)
    .maybeSingle();

  if (projectError || !project) {
    await markFailed(
      planRowId,
      projectId,
      candidateId,
      agentErrorMessage(projectError ?? new Error("Project not visible"), SUBJECT)
    );
    return;
  }

  const weights = (
    project.calibration_model as { dimension_weights?: DimensionWeights } | null
  )?.dimension_weights;
  if (!weights) {
    // The action gates on this before allocating; said again here so a
    // race cannot produce a plan scored against nothing.
    await markFailed(
      planRowId,
      projectId,
      candidateId,
      "This mandate has no calibration yet — run intake and onboarding first."
    );
    return;
  }

  const { data: spec } = await supabase
    .from("job_specs")
    .select("id, version, is_final, content_json")
    .eq("project_id", projectId)
    .order("is_final", { ascending: false })
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: candidate, error: candidateError } = await supabase
    .from("candidates")
    .select(
      "id, full_name, current_title, current_company, location, cv_structured, recruiter_assessment"
    )
    .eq("id", candidateId)
    .maybeSingle();

  if (candidateError || !candidate) {
    await markFailed(
      planRowId,
      projectId,
      candidateId,
      agentErrorMessage(candidateError ?? new Error("Candidate not visible"), SUBJECT)
    );
    return;
  }

  const { data: scores } = await supabase
    .from("candidate_scores")
    .select(
      "overall_score, tier, technical_score, domain_score, leadership_score, regulatory_score, transformation_score"
    )
    .eq("candidate_id", candidateId)
    .eq("project_id", projectId)
    .maybeSingle();

  const cv = (candidate.cv_structured ?? {}) as Record<string, unknown>;
  const userPrompt = JSON.stringify(
    {
      mandate: {
        role_title: project.title,
        company_name: project.company_name,
        calibration_dimension_weights: weights,
        company_context: project.company_context ?? null,
      },
      job_spec: spec
        ? { version: spec.version, is_final: spec.is_final, content: spec.content_json }
        : null,
      candidate: {
        full_name: candidate.full_name,
        current_title: candidate.current_title,
        current_company: candidate.current_company,
        location: candidate.location,
        summary: cv.summary ?? null,
        roles: cv.roles ?? null,
        fit_dimensions: cv.fit_dimensions ?? null,
        archetype: candidate.cv_structured
          ? ((candidate.cv_structured as Record<string, unknown>).archetype ?? null)
          : null,
        recruiter_assessment: candidate.recruiter_assessment ?? null,
        scores: scores ?? null,
      },
    },
    null,
    2
  );

  try {
    const systemPrompt = await applySkillsToPrompt(INTERVIEWER_SYSTEM_PROMPT, {
      projectId,
      organizationId: project.organization_id as string,
      client: supabase,
    });

    const anthropic = getAnthropic();
    const response = await anthropic.messages.create({
      model: INTERVIEWER_MODEL,
      max_tokens: 8000,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
      output_config: {
        format: { type: "json_schema", schema: MAINSTREAM_PLAN_SCHEMA },
      },
    });

    const textBlock = response.content.find(
      (b): b is Extract<(typeof response.content)[number], { type: "text" }> =>
        b.type === "text"
    );
    if (!textBlock) {
      throw new Error("Empty completion from upstream");
    }

    const plan = normalizeMainstreamPlan(JSON.parse(textBlock.text));

    // Strip dimension keys the calibration does not know, then compute
    // coverage authoritatively — the agent proposes, the app reports.
    const knownKeys = new Set<string>(DIMENSION_KEYS);
    const cleanedStages = plan.stages.map((s) => ({
      ...s,
      assigned_dimensions: s.assigned_dimensions.filter((k) => knownKeys.has(k)),
    }));
    const finalContent = {
      overview: plan.overview,
      stages: cleanedStages,
      dimension_coverage: computeDimensionCoverage(weights, cleanedStages),
    };

    // §129: `{count:"exact"}` + zero-row refusal — RLS filtering the
    // write to nothing must never read as success.
    const { error: updateError, count: updateCount } = await supabase
      .from("interview_plans")
      .update(
        {
          content_json: finalContent,
          source_spec_id: spec?.id ?? null,
          is_generating: false,
          generation_error: null,
          prompt_version: INTERVIEWER_PROMPT_VERSION,
          model_version: INTERVIEWER_MODEL,
          updated_at: new Date().toISOString(),
        },
        { count: "exact" }
      )
      .eq("id", planRowId);

    if (updateError) {
      throw new Error(`Failed to persist the plan: ${updateError.message}`);
    }
    if ((updateCount ?? 0) === 0) {
      throw new Error(
        "The Interviewer Agent could not persist the plan: the write matched no row the agent may update."
      );
    }

    const uncovered = finalContent.dimension_coverage
      .filter((c) => c.weight >= 3 && c.covered_by.length === 0)
      .map((c) => c.dimension_key);

    const { error: eventError } = await supabase.rpc("record_agent_event", {
      p_event_type: "interview_plan_generated",
      p_project_id: projectId,
      p_candidate_id: candidateId,
      p_detail: {
        agent_kind: "interviewer",
        trigger,
        stage_count: finalContent.stages.length,
        uncovered_dimensions: uncovered,
      },
    });
    if (eventError) {
      console.error("[generate-interview-plan] trail event failed", eventError);
    }
  } catch (err) {
    captureSeamError("[generate-interview-plan] generation failed", err);
    await markFailed(planRowId, projectId, candidateId, agentErrorMessage(err, SUBJECT));
  }
}

/**
 * Terminal failed state — clears is_generating and records the failure
 * event, both under the REQUESTER's read-only cookie client (090: the
 * agent never writes its own failure). Never re-throws.
 */
async function markFailed(
  planRowId: string,
  projectId: string,
  candidateId: string,
  errorMessage: string
): Promise<void> {
  try {
    const supabase = await createReadOnlySupabaseClient();
    await supabase
      .from("interview_plans")
      .update({
        is_generating: false,
        generation_error: safeFailureMessage(errorMessage, SUBJECT),
        updated_at: new Date().toISOString(),
      })
      .eq("id", planRowId);

    const { error: eventError } = await supabase.rpc("record_activity_event", {
      p_event_type: "interview_plan_generation_failed",
      p_project_id: projectId,
      p_candidate_id: candidateId,
      p_detail: {},
    });
    if (eventError) {
      console.error("[generate-interview-plan] failure event refused", eventError);
    }
  } catch (err) {
    console.error("[generate-interview-plan] failed to mark failure", err);
  }
}
