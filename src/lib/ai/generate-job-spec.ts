import "server-only";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { getAnthropic } from "@/lib/anthropic";
import { signInRoleSpecAgent } from "@/lib/agents/session";
import { captureSeamError } from "@/lib/observability/sentry";
import { agentErrorMessage, safeFailureMessage } from "./agent-errors";
import {
  JOB_SPEC_SCHEMA,
  JOB_SPEC_SYSTEM_PROMPT,
  sectionsToMarkdown,
  type JobSpecSections,
} from "./job-spec-analysis";
import type { CalibrationModel, CompanyContext } from "./role-analysis";
import type { OnboardingResponses } from "./onboarding-analysis";
import { applySkillsToPrompt } from "@/lib/skills/skill-injector";

const JOB_SPEC_MODEL = "claude-sonnet-4-6";

/**
 * How this generator names itself in a failure a recruiter reads. The
 * `generation_error` column is rendered verbatim with a Retry CTA, so
 * whatever lands in it outlives the request — see `agent-errors.ts`.
 */
const SUBJECT = "Job-spec generation";

/**
 * Read-only SSR client for use inside `after()` callbacks. Mirrors the
 * pattern in analyze-role.ts — `after()` fires post-response so the
 * cookie writer cannot mutate response headers, but reads work fine.
 */
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
          /* read-only: see analyze-role.ts */
        },
      },
    }
  );
}

type ProjectContext = {
  organization_id: string | null;
  calibration_model: Partial<CalibrationModel> | null;
  company_context: Partial<CompanyContext> | null;
  onboarding_responses: Partial<OnboardingResponses> | null;
};

/** How the run was asked for — the trail names it (092: D4). */
export type JobSpecTrigger = "initial" | "regenerate";

/**
 * The refusal sentence (092: D5) — lands in generation_error via the
 * HUMAN half and is rendered verbatim with the Retry CTA.
 */
const ROLESPEC_UNAVAILABLE_SENTENCE =
  "The Role Spec Agent could not run — an operator has suspended it or its credentials are absent. Write the spec by hand, or retry when it is restored.";

/**
 * Generate a job spec for a project and persist it onto an existing
 * placeholder row in `job_specs` (caller is responsible for inserting the
 * placeholder and passing its id, so the editor can poll a known row).
 *
 * The seam (092): the ROLE SPEC AGENT's session, signed in per run —
 * the sixteenth principal. The split stands as built: the recruiter's
 * action allocated the versioned placeholder (their act, the
 * idempotence latch); the agent reads the project and the placeholder
 * it lawfully sees, judges with skills riding ITS session, and lands
 * content + is_generating:false on the row through 092's double-pinned
 * UPDATE (it can neither touch a finalized spec nor finalize one).
 * FAILURE BOOKKEEPING STAYS HUMAN (the 090 doctrine):
 * markGenerationFailed keeps the recruiter's cookie session, so a
 * failed row keeps content_json='{}' and the editor renders an empty
 * spec the recruiter can fill manually rather than a stuck spinner.
 */
export async function generateAndStoreJobSpec(
  specRowId: string,
  projectId: string,
  trigger: JobSpecTrigger = "regenerate"
): Promise<void> {
  const session = await signInRoleSpecAgent();
  if (!session.ok) {
    console.error(
      `[generate-job-spec] The Role Spec Agent could not run — an operator ` +
        `has suspended it or its credentials are absent. The placeholder is ` +
        `marked; the recruiter can write the spec by hand. (${session.reason})`
    );
    // The marker is the HUMAN's bookkeeping — the agent has no session
    // to sign with, which is the tell (090: D2).
    await markGenerationFailed(specRowId, ROLESPEC_UNAVAILABLE_SENTENCE);
    return;
  }

  try {
    await generateUnderAgentSession(session.client, specRowId, projectId, trigger);
  } finally {
    // Persist nothing (D3): revoke the run's session from GoTrue's ledger.
    await session.signOut();
  }
}

async function generateUnderAgentSession(
  supabase: SupabaseClient,
  specRowId: string,
  projectId: string,
  trigger: JobSpecTrigger
): Promise<void> {
  const { data: project, error: fetchError } = await supabase
    .from("projects")
    .select(
      "organization_id, calibration_model, company_context, onboarding_responses"
    )
    .eq("id", projectId)
    .single<ProjectContext>();

  if (fetchError || !project) {
    const message = `Failed to load project ${projectId} for spec generation: ${fetchError?.message ?? "not found"}`;
    // The detail survives in the throw; the column is user-facing.
    await markGenerationFailed(specRowId, agentErrorMessage(fetchError, SUBJECT));
    throw new Error(message);
  }

  const userPrompt = JSON.stringify(
    {
      role_context: project.calibration_model ?? {},
      company_context: project.company_context ?? {},
      onboarding: project.onboarding_responses ?? {},
      dimension_weights:
        project.calibration_model?.dimension_weights ?? null,
    },
    null,
    2
  );

  let sections: JobSpecSections;
  try {
    const anthropic = getAnthropic();
    // Skills ride the AGENT's session (092: D6 — §50 doctrine), no
    // longer borrowing the recruiter's cookies inside after().
    const system = await applySkillsToPrompt(JOB_SPEC_SYSTEM_PROMPT, {
      projectId,
      organizationId: project.organization_id,
      client: supabase,
    });
    const response = await anthropic.messages.create({
      model: JOB_SPEC_MODEL,
      max_tokens: 4096,
      system,
      messages: [{ role: "user", content: userPrompt }],
      output_config: {
        format: {
          type: "json_schema",
          schema: JOB_SPEC_SCHEMA,
        },
      },
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("Job-spec response contained no text block");
    }

    sections = JSON.parse(textBlock.text) as JobSpecSections;
  } catch (err) {
    await markGenerationFailed(specRowId, agentErrorMessage(err, SUBJECT));
    throw err;
  }

  const markdown = sectionsToMarkdown(sections);

  // Final persist step. Wrapped in try/catch/finally so any failure here
  // (Supabase 5xx, RLS denial, network blip) still transitions the row to a
  // terminal state instead of stranding it on is_generating=true. The
  // finally clause is a last-ditch belt-and-braces: if the catch path itself
  // somehow failed before reaching markGenerationFailed (extremely rare —
  // markGenerationFailed already swallows its own errors), we make one more
  // attempt to clear the flag.
  let cleared = false;
  try {
    const { error: updateError } = await supabase
      .from("job_specs")
      .update({
        content: markdown,
        content_json: sections,
        is_generating: false,
        generation_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", specRowId);

    if (updateError) {
      throw new Error(`Failed to persist generated job spec: ${updateError.message}`);
    }
    cleared = true;

    // The trail (092: D4): the trigger, the version, a sections count
    // — never the spec's text. Best-effort after the landing.
    const { data: specRow } = await supabase
      .from("job_specs")
      .select("version")
      .eq("id", specRowId)
      .maybeSingle<{ version: number }>();
    const { error: eventErr } = await supabase.rpc("record_agent_event", {
      p_event_type: "job_spec_generated",
      p_project_id: projectId,
      p_detail: {
        agent_kind: "rolespec",
        trigger,
        version: specRow?.version ?? null,
        sections: Object.keys(sections).length,
      },
    });
    if (eventErr) {
      captureSeamError(
        "[generate-job-spec] failed to record the spec event",
        eventErr
      );
    }
  } catch (err) {
    await markGenerationFailed(specRowId, agentErrorMessage(err, SUBJECT));
    cleared = true;
    throw err;
  } finally {
    if (!cleared) {
      // Catch path failed before reaching markGenerationFailed. Try once more.
      await markGenerationFailed(
        specRowId,
        "Generation failed during persistence (unrecoverable)."
      );
    }
  }
}

/**
 * Transition a placeholder row to a terminal failed state: clear
 * is_generating so the polling UI stops, and write the error message so
 * the dedicated error view can surface it with a Retry CTA. Idempotent
 * and self-protective — a failure inside this helper is logged and
 * swallowed so callers can rely on it never re-throwing.
 */
async function markGenerationFailed(
  specRowId: string,
  errorMessage: string
): Promise<void> {
  try {
    const supabase = await createReadOnlySupabaseClient();
    await supabase
      .from("job_specs")
      .update({
        is_generating: false,
        generation_error: safeFailureMessage(errorMessage, SUBJECT),
        updated_at: new Date().toISOString(),
      })
      .eq("id", specRowId);
  } catch (err) {
    console.error(
      "[generate-job-spec] failed to mark generation as failed",
      err
    );
  }
}
