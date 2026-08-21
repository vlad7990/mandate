import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAnthropic } from "@/lib/anthropic";
import {
  POSITIONING_SCHEMA,
  POSITIONING_SYSTEM_PROMPT,
  type PositioningResult,
} from "./positioning-agent";
import { applySkillsToPrompt } from "@/lib/skills/skill-injector";
import { signInPositioningAgent } from "@/lib/agents/session";

const POSITIONING_MODEL = "claude-sonnet-4-6";

export type PositioningInput = {
  role: {
    role_title: string;
    company_name: string;
    calibration: unknown;
    company_context: unknown;
  };
  candidate: {
    candidate_id: string;
    full_name: string;
    current_title: string | null;
    current_company: string | null;
    archetype: string | null;
    profile: unknown;
    /** AI evaluation if available — gives the agent a head start. */
    evaluation: unknown;
    /** Recruiter override read, when present. */
    recruiter_assessment: unknown;
  };
  /** Up to ~10 recent feedback rows so the agent can adapt to client preferences. */
  recent_feedback: Array<{
    feedback_type: string;
    summary: string | null;
    content: string;
    created_at: string;
  }>;
};

export type RunPositioningContext = {
  projectId: string;
  organizationId: string | null;
  /** Pre-built client for the skill read — the agent's own session
   * (078). Rides ctx, never input: `input` is serialised wholesale
   * into the model prompt. */
  skillClient?: SupabaseClient;
};

export async function runPositioning(
  input: PositioningInput,
  ctx: RunPositioningContext
): Promise<PositioningResult> {
  const anthropic = getAnthropic();
  const userPrompt = JSON.stringify(input, null, 2);
  const system = await applySkillsToPrompt(POSITIONING_SYSTEM_PROMPT, {
    projectId: ctx.projectId,
    organizationId: ctx.organizationId,
    client: ctx.skillClient,
  });

  const response = await anthropic.messages.create({
    model: POSITIONING_MODEL,
    max_tokens: 3000,
    system,
    messages: [{ role: "user", content: userPrompt }],
    output_config: {
      format: {
        type: "json_schema",
        schema: POSITIONING_SCHEMA,
      },
    },
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Positioning response contained no text block");
  }

  const partial = JSON.parse(textBlock.text) as Omit<
    PositioningResult,
    "generated_at"
  >;
  return {
    ...partial,
    generated_at: new Date().toISOString(),
  };
}

// ────────────────────────────────────────────────────────────────────────
// The seam (078): the POSITIONING AGENT's session, signed in per run.
// The recruiter's action keeps the gate and the candidate/project
// assertion; everything judgment-shaped — the input reads, the
// skill-injected model call, the kit write, the trail event — runs
// under the agent's own RLS and signs out persisting nothing.
// ────────────────────────────────────────────────────────────────────────

export type PositioningRunResult =
  | { status: "ready"; result: PositioningResult }
  /** Not eligible: candidate missing, wrong project, or outside the
   * agent's org-bound reach. */
  | { status: "unavailable" }
  /** The Positioning Agent refused to sign in — suspended from /ops or
   * credentials absent. Nothing was generated and NOTHING WAS DESTROYED
   * (D5): any existing kit stands untouched. */
  | { status: "agent_unavailable"; reason: string }
  /** Generation or persistence failed; logged. */
  | { status: "failed" };

export async function runPositioningAndPersist(
  candidateId: string,
  projectId: string
): Promise<PositioningRunResult> {
  const session = await signInPositioningAgent();
  if (!session.ok) {
    console.error(
      `[positioning] generation skipped: ${session.reason}. ` +
        "Any existing kit stands; the panel keeps rendering it."
    );
    return { status: "agent_unavailable", reason: session.reason };
  }

  try {
    return await runUnderAgentSession(session.client, candidateId, projectId);
  } finally {
    // Persist nothing (D3): revoke the run's session from GoTrue's ledger.
    await session.signOut();
  }
}

async function runUnderAgentSession(
  supabase: SupabaseClient,
  candidateId: string,
  projectId: string
): Promise<PositioningRunResult> {
  const [projectQ, candidateQ, feedbackQ] = await Promise.all([
    supabase
      .from("projects")
      .select(
        "id, title, company_name, calibration_model, company_context, organization_id"
      )
      .eq("id", projectId)
      .single<{
        id: string;
        title: string;
        company_name: string;
        calibration_model: unknown;
        company_context: unknown;
        organization_id: string | null;
      }>(),
    supabase
      .from("candidates")
      .select(
        "id, project_id, full_name, current_title, current_company, archetype, cv_structured, recruiter_assessment"
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
        recruiter_assessment: unknown;
      }>(),
    supabase
      .from("feedback")
      .select("feedback_type, content, interpreted, created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  if (projectQ.error || !projectQ.data) return { status: "unavailable" };
  if (candidateQ.error || !candidateQ.data) return { status: "unavailable" };
  if (candidateQ.data.project_id !== projectId) return { status: "unavailable" };

  const project = projectQ.data;
  const candidate = candidateQ.data;
  const cv = (candidate.cv_structured ?? {}) as Record<string, unknown>;
  const replacedExisting = "positioning_kit" in cv;

  type FbRow = {
    feedback_type: string;
    content: string;
    interpreted: { summary?: string } | null;
    created_at: string;
  };
  const recentFeedback = ((feedbackQ.data ?? []) as FbRow[]).map((f) => ({
    feedback_type: f.feedback_type,
    content: f.content,
    summary: f.interpreted?.summary ?? null,
    created_at: f.created_at,
  }));

  const input: PositioningInput = {
    role: {
      role_title: project.title,
      company_name: project.company_name,
      calibration: project.calibration_model ?? {},
      company_context: project.company_context ?? {},
    },
    candidate: {
      candidate_id: candidate.id,
      full_name: candidate.full_name,
      current_title: candidate.current_title,
      current_company: candidate.current_company,
      archetype: candidate.archetype,
      profile: cv,
      evaluation: cv["evaluation"] ?? null,
      recruiter_assessment: candidate.recruiter_assessment ?? null,
    },
    recent_feedback: recentFeedback,
  };

  let result: PositioningResult;
  try {
    result = await runPositioning(input, {
      projectId,
      organizationId: project.organization_id,
      skillClient: supabase,
    });
  } catch (err) {
    console.error("[positioning] agent generation failed", err);
    return { status: "failed" };
  }

  // Persist atomically through the RLS-bound RPC — one key, the
  // neighbours (the parser's fields, the evaluator's report) untouched.
  // No pre-clear anywhere (D5): the old kit exists until the moment the
  // new one lands.
  const { error: writeErr } = await supabase.rpc("update_cv_structured_field", {
    p_candidate_id: candidateId,
    p_project_id: projectId,
    p_key: "positioning_kit",
    p_value: result,
  });
  if (writeErr) {
    console.error(
      "[positioning] failed to persist the kit for candidate",
      candidateId,
      writeErr
    );
    return { status: "failed" };
  }

  // The trail (D4): one event per LANDED kit, the trigger named.
  const { error: eventErr } = await supabase.rpc("record_agent_event", {
    p_event_type: "candidate_positioned",
    p_project_id: projectId,
    p_candidate_id: candidateId,
    p_detail: {
      agent_kind: "positioner",
      trigger: replacedExisting ? "regenerate" : "generate",
      replaced_existing: replacedExisting,
    },
  });
  if (eventErr) {
    console.error(
      "[positioning] failed to record the positioning event",
      candidateId,
      eventErr
    );
  }

  return { status: "ready", result };
}
