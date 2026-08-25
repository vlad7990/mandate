import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getAnthropic } from "@/lib/anthropic";
import { agentErrorMessage, safeFailureMessage } from "./agent-errors";
import {
  CLIENT_INTERVIEW_PROMPT_VERSION,
  CLIENT_INTERVIEW_SCHEMA,
  CLIENT_INTERVIEW_SYSTEM_PROMPT,
  computeMandateGaps,
  finalizeClientInterview,
  normalizeClientInterviewDraft,
} from "./client-interview-agent";
import { signInInterviewer } from "@/lib/agents/session";
import { applySkillsToPrompt } from "@/lib/skills/skill-injector";
import { captureSeamError } from "@/lib/observability/sentry";

/**
 * The client-interview orchestrator (117, client-interview slice). The
 * Interviewer's second face: same principal, same session discipline as
 * generate-interview-plan.ts — every agent-session write carries
 * `{count: "exact"}` and refuses on zero rows (§129's law), and failure
 * bookkeeping stays HUMAN (090 doctrine): the agent never writes
 * generation_error — the requester's read-only cookie client does, in
 * markFailed.
 *
 * The gap list is computed server-side BEFORE the model call and passed
 * into the prompt; the strip on return discards any question citing a
 * gap the mandate does not have (gate D2).
 */
const SUBJECT = "Client-interview generation";

const INTERVIEWER_UNAVAILABLE_SENTENCE =
  "The Interviewer Agent could not run — an operator has suspended it or its credentials are absent. Retry when it is restored.";

const NO_GAPS_SENTENCE =
  "This mandate has no provable gaps — intake left no missing information and the calibration is established. There is nothing to ask the client.";

export const CLIENT_INTERVIEW_MODEL = "claude-sonnet-4-6";

export type ClientInterviewTrigger = "initial" | "regenerate";

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

export async function generateAndStoreClientInterview(
  interviewRowId: string,
  projectId: string,
  trigger: ClientInterviewTrigger = "regenerate"
): Promise<void> {
  const session = await signInInterviewer();
  if (!session.ok) {
    console.error(
      `[generate-client-interview] The Interviewer Agent could not run — ` +
        `an operator has suspended it or its credentials are absent. ` +
        `The placeholder is marked. (${session.reason})`
    );
    await markFailed(interviewRowId, projectId, INTERVIEWER_UNAVAILABLE_SENTENCE);
    return;
  }

  try {
    await generateUnderAgentSession(
      session.client,
      interviewRowId,
      projectId,
      trigger
    );
  } finally {
    await session.signOut();
  }
}

async function generateUnderAgentSession(
  supabase: Awaited<ReturnType<typeof createReadOnlySupabaseClient>>,
  interviewRowId: string,
  projectId: string,
  trigger: ClientInterviewTrigger
): Promise<void> {
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select(
      "id, title, company_name, calibration_model, onboarding_responses, company_context, organization_id"
    )
    .eq("id", projectId)
    .maybeSingle();

  if (projectError || !project) {
    await markFailed(
      interviewRowId,
      projectId,
      agentErrorMessage(projectError ?? new Error("Project not visible"), SUBJECT)
    );
    return;
  }

  if (!project.calibration_model) {
    // The action gates on this before allocating; said again here so a
    // race cannot compose questions against a mandate intake never met.
    await markFailed(
      interviewRowId,
      projectId,
      "This mandate has no calibration yet — run intake first."
    );
    return;
  }

  // What the mandate provably lacks — server-computed, never the
  // agent's opinion (gate D2). An empty list is an honest refusal, not
  // an empty question set.
  const gaps = computeMandateGaps(
    project.calibration_model,
    project.onboarding_responses as Record<string, unknown> | null
  );
  if (gaps.length === 0) {
    await markFailed(interviewRowId, projectId, NO_GAPS_SENTENCE);
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

  const userPrompt = JSON.stringify(
    {
      mandate: {
        role_title: project.title,
        company_name: project.company_name,
        calibration_model: project.calibration_model,
        company_context: project.company_context ?? null,
      },
      job_spec: spec
        ? { version: spec.version, is_final: spec.is_final, content: spec.content_json }
        : null,
      gaps: gaps.map((g) => ({ id: g.id, label: g.label, kind: g.kind })),
    },
    null,
    2
  );

  try {
    const systemPrompt = await applySkillsToPrompt(
      CLIENT_INTERVIEW_SYSTEM_PROMPT,
      {
        projectId,
        organizationId: project.organization_id as string,
        client: supabase,
      }
    );

    const anthropic = getAnthropic();
    const response = await anthropic.messages.create({
      model: CLIENT_INTERVIEW_MODEL,
      max_tokens: 4000,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
      output_config: {
        format: { type: "json_schema", schema: CLIENT_INTERVIEW_SCHEMA },
      },
    });

    const textBlock = response.content.find(
      (b): b is Extract<(typeof response.content)[number], { type: "text" }> =>
        b.type === "text"
    );
    if (!textBlock) {
      throw new Error("Empty completion from upstream");
    }

    // Strip questions citing gaps the mandate does not have, then
    // compute coverage authoritatively — the agent proposes, the app
    // reports.
    const draft = normalizeClientInterviewDraft(JSON.parse(textBlock.text));
    const finalContent = finalizeClientInterview(draft, gaps);

    if (finalContent.questions.length === 0) {
      throw new Error(
        "The Interviewer returned no question that cites a real gap — nothing usable to store."
      );
    }

    // §129: `{count:"exact"}` + zero-row refusal — RLS filtering the
    // write to nothing must never read as success.
    const { error: updateError, count: updateCount } = await supabase
      .from("client_interviews")
      .update(
        {
          content_json: finalContent,
          is_generating: false,
          generation_error: null,
          prompt_version: CLIENT_INTERVIEW_PROMPT_VERSION,
          model_version: CLIENT_INTERVIEW_MODEL,
          updated_at: new Date().toISOString(),
        },
        { count: "exact" }
      )
      .eq("id", interviewRowId);

    if (updateError) {
      throw new Error(`Failed to persist the question set: ${updateError.message}`);
    }
    if ((updateCount ?? 0) === 0) {
      throw new Error(
        "The Interviewer Agent could not persist the question set: the write matched no row the agent may update."
      );
    }

    const uncovered = finalContent.gap_coverage
      .filter((c) => c.question_ids.length === 0)
      .map((c) => c.gap_id);

    // The Interviewer's composing act reuses interview_plan_generated —
    // the ruled 29-type allowlist is untouched; plan_scope tells the
    // two faces apart in the same trail.
    const { error: eventError } = await supabase.rpc("record_agent_event", {
      p_event_type: "interview_plan_generated",
      p_project_id: projectId,
      p_detail: {
        agent_kind: "interviewer",
        plan_scope: "client_interview",
        trigger,
        question_count: finalContent.questions.length,
        gap_count: gaps.length,
        uncovered_gaps: uncovered,
      },
    });
    if (eventError) {
      console.error("[generate-client-interview] trail event failed", eventError);
    }
  } catch (err) {
    captureSeamError("[generate-client-interview] generation failed", err);
    await markFailed(interviewRowId, projectId, agentErrorMessage(err, SUBJECT));
  }
}

/**
 * Terminal failed state — clears is_generating and records the failure
 * event, both under the REQUESTER's read-only cookie client (090: the
 * agent never writes its own failure). Never re-throws.
 */
async function markFailed(
  interviewRowId: string,
  projectId: string,
  errorMessage: string
): Promise<void> {
  try {
    const supabase = await createReadOnlySupabaseClient();
    await supabase
      .from("client_interviews")
      .update({
        is_generating: false,
        generation_error: safeFailureMessage(errorMessage, SUBJECT),
        updated_at: new Date().toISOString(),
      })
      .eq("id", interviewRowId);

    const { error: eventError } = await supabase.rpc("record_activity_event", {
      p_event_type: "client_interview_generation_failed",
      p_project_id: projectId,
      p_detail: {},
    });
    if (eventError) {
      console.error("[generate-client-interview] failure event refused", eventError);
    }
  } catch (err) {
    console.error("[generate-client-interview] failed to mark failure", err);
  }
}
