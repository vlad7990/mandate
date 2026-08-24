import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getAnthropic } from "@/lib/anthropic";
import {
  promoteCompanyContextToClient,
  resolveClientId,
} from "@/lib/clients/resolve-client";
import {
  ROLE_ANALYSIS_SCHEMA,
  ROLE_ANALYSIS_SYSTEM_PROMPT,
  splitAnalysis,
  type RoleAnalysis,
} from "./role-analysis";
import { signInIntakeAgent } from "@/lib/agents/session";
import { applySkillsToPrompt } from "@/lib/skills/skill-injector";
import { captureSeamError } from "@/lib/observability/sentry";
import { safeFailureMessage } from "./agent-errors";
import {
  INTAKE_AGENT_UNAVAILABLE_SENTENCE,
  INTAKE_FAILED_SENTENCE,
  INTAKE_SUBJECT,
  type IntakeTrigger,
} from "./intake-failure";

const ANALYSIS_MODEL = "claude-sonnet-4-6";

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
          // No-op: after() callbacks cannot mutate response cookies. Read-only is fine
          // because the auth cookie is already valid for the duration of the human half.
        },
      },
    }
  );
}

// ────────────────────────────────────────────────────────────────────────
// The seam (086): the INTAKE AGENT's session, signed in per run — the
// parser split, INVERTED. The recruiter's act (opening the mandate:
// the optimistic INSERT, the placeholders, the brief) has already
// landed before this runs. The agent judges the one-line brief,
// UPDATEs the mandate row under its own name (title, company,
// calibration, context — never client_id, never created_by), records
// the event, signs out, and RETURNS the analysis — because the client
// bookkeeping the judgment enables (resolve_client, the client_id
// link, the context promotion) touches the CLIENTS registry the
// negative matrix refuses to agents, and stays the recruiter's act in
// the after() context below.
// ────────────────────────────────────────────────────────────────────────

export type IntakeRunResult =
  | { status: "ready"; analysis: RoleAnalysis }
  /** Not eligible: project missing or outside the agent's org-bound
   * reach. */
  | { status: "unavailable" }
  /** The Intake Agent refused to sign in — suspended from /ops or
   * credentials absent. Nothing was analyzed and NOTHING WAS
   * DESTROYED (D5): the mandate keeps its placeholders and its
   * one-line brief. Fire-and-forget — the sentence lives in the
   * server log; the mandate stays honestly at "Analyzing…". */
  | { status: "agent_unavailable"; reason: string }
  /** Analysis or persistence failed; logged. */
  | { status: "failed" };

export async function runIntakeAnalysisAndPersist(
  projectId: string,
  oneLineInput: string,
  trigger: IntakeTrigger = "create"
): Promise<IntakeRunResult> {
  const session = await signInIntakeAgent();
  if (!session.ok) {
    console.error(
      `[analyze-role] The Intake Agent could not run — an operator has ` +
        `suspended it or its credentials are absent. The mandate keeps its ` +
        `one-line brief. (${session.reason})`
    );
    return { status: "agent_unavailable", reason: session.reason };
  }

  try {
    const supabase = session.client;

    const { data: project, error } = await supabase
      .from("projects")
      .select("id, organization_id")
      .eq("id", projectId)
      .maybeSingle<{ id: string; organization_id: string | null }>();
    if (error || !project) return { status: "unavailable" };

    // The skills gap's third sighting, closed (§56's standing one-liner):
    // recruiter-authored skills reach intake for the first time. The
    // agent's own session is the client — inside after() there are no
    // cookies, and omitting it silently strips every skill (§30's
    // lesson); skills_agent_select (074) makes the read lawful. At
    // intake time the mandate has no client_id yet, so client-scoped
    // skills stay quiet by design — search skills and this project's
    // role skills fire.
    const system = await applySkillsToPrompt(ROLE_ANALYSIS_SYSTEM_PROMPT, {
      projectId,
      organizationId: project.organization_id,
      client: supabase,
    });

    let parsed: RoleAnalysis;
    try {
      const anthropic = getAnthropic();
      const response = await anthropic.messages.create({
        model: ANALYSIS_MODEL,
        max_tokens: 1024,
        system,
        messages: [{ role: "user", content: oneLineInput }],
        output_config: {
          format: {
            type: "json_schema",
            schema: ROLE_ANALYSIS_SCHEMA,
          },
        },
      });
      const textBlock = response.content.find((b) => b.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        throw new Error("Anthropic response contained no text block");
      }
      parsed = JSON.parse(textBlock.text) as RoleAnalysis;
    } catch (err) {
      captureSeamError("[analyze-role] agent analysis failed", err);
      return { status: "failed" };
    }

    const { calibration_model, company_context } = splitAnalysis(parsed);

    const { error: updateErr } = await supabase
      .from("projects")
      .update({
        title: parsed.role_title,
        company_name: parsed.company_name,
        calibration_model,
        // The mandate's frozen copy. The client gets the canonical one
        // in the human half.
        company_context,
        // Cleared atomically with the title landing (090: D1), so a slow
        // run arriving after the poller's timeout marker leaves no stale
        // failure sentence on a mandate that is now analyzed.
        intake_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", projectId);
    if (updateErr) {
      captureSeamError("[analyze-role] failed to persist the analysis", updateErr);
      return { status: "failed" };
    }

    // The trail (D4): a length and a boolean — the brief's text never
    // rides the trail, and client resolution is NOT claimed here (it
    // is the recruiter's subsequent act).
    const { error: eventErr } = await supabase.rpc("record_agent_event", {
      p_event_type: "intake_analyzed",
      p_project_id: projectId,
      p_detail: {
        agent_kind: "intake",
        trigger,
        input_chars: oneLineInput.length,
        company_identified:
          typeof parsed.company_name === "string" &&
          parsed.company_name.trim().length > 0,
      },
    });
    if (eventErr) {
      captureSeamError("[analyze-role] failed to record the intake event", eventErr);
    }

    return { status: "ready", analysis: parsed };
  } finally {
    // Persist nothing (D3): revoke the run's session from GoTrue's ledger.
    await session.signOut();
  }
}

/**
 * Failure bookkeeping is the HUMAN's (090: D2): the agent's writes
 * stay judgment-only, and the marker that turns a stuck skeleton into
 * an honest failed state is written here under the recruiter's own
 * cookie session — the markGenerationFailed precedent. Guarded on the
 * analysis still being absent so a landed run is never clobbered;
 * idempotent and self-protective like its job-spec sibling.
 */
async function markIntakeFailed(
  projectId: string,
  sentence: string
): Promise<void> {
  try {
    const supabase = await createReadOnlySupabaseClient();
    await supabase
      .from("projects")
      .update({
        intake_error: safeFailureMessage(sentence, INTAKE_SUBJECT),
        updated_at: new Date().toISOString(),
      })
      .eq("id", projectId)
      .is("calibration_model->>role_title", null);
  } catch (err) {
    console.error("[analyze-role] failed to mark the intake failure", err);
  }
}

/**
 * The full intake flow inside after(): the agent's judgment (above),
 * then the HUMAN half — client resolution and promotion under the
 * recruiter's own cookie session, exactly as before 086. A refused or
 * failed agent run marks the mandate honestly (090) and returns: the
 * placeholders and the brief survive, and the client bookkeeping
 * simply doesn't happen (a mandate with an unresolved client, not a
 * failed mandate).
 */
export async function analyzeAndStoreRole(
  projectId: string,
  oneLineInput: string,
  trigger: IntakeTrigger = "create"
): Promise<void> {
  const run = await runIntakeAnalysisAndPersist(projectId, oneLineInput, trigger);
  if (run.status === "agent_unavailable") {
    await markIntakeFailed(projectId, INTAKE_AGENT_UNAVAILABLE_SENTENCE);
    return;
  }
  if (run.status === "failed") {
    await markIntakeFailed(projectId, INTAKE_FAILED_SENTENCE);
    return;
  }
  // `unavailable`: the project is missing or out of reach — there is no
  // row this session could honestly mark.
  if (run.status !== "ready") return;

  const parsed = run.analysis;
  const supabase = await createReadOnlySupabaseClient();

  // This is the moment the mandate stops being "Analyzing…" and acquires a
  // real company, so it is the moment its client can be resolved. Before
  // 049 the company was only ever a string on this row.
  const { data: project } = await supabase
    .from("projects")
    .select("organization_id, created_by")
    .eq("id", projectId)
    .maybeSingle<{ organization_id: string | null; created_by: string | null }>();

  const clientId = await resolveClientId(supabase, {
    organizationId: project?.organization_id ?? null,
    companyName: parsed.company_name,
    createdBy: project?.created_by ?? null,
  });

  if (clientId) {
    const { error } = await supabase
      .from("projects")
      .update({ client_id: clientId })
      .eq("id", projectId);
    if (error) {
      captureSeamError("[analyze-role] failed to link the client", error.message);
    }
  }

  // Forward the research to the client so the next mandate here starts warm.
  const { company_context } = splitAnalysis(parsed);
  await promoteCompanyContextToClient(supabase, {
    clientId,
    companyContext: company_context,
  });
}
