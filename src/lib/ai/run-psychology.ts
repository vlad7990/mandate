import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAnthropic } from "@/lib/anthropic";
import {
  PSYCHOLOGY_SCHEMA,
  PSYCHOLOGY_SYSTEM_PROMPT,
  type CandidatePsychology,
} from "./psychology-agent";
import { applySkillsToPrompt } from "@/lib/skills/skill-injector";
import { wrapWithRecruiterContext } from "./recruiter-context";
import { signInPsychologyAgent } from "@/lib/agents/session";
import { captureSeamError } from "@/lib/observability/sentry";

const PSYCHOLOGY_MODEL = "claude-sonnet-4-6";

export type PsychologyInput = {
  candidate: {
    candidate_id: string;
    full_name: string;
    current_title: string | null;
    current_company: string | null;
    archetype: string | null;
    profile: unknown;
    evaluation: unknown;
  };
  /** Up to ~10 recent recruiter notes for behavioural context. */
  recruiter_notes: Array<{
    note_type: string;
    content: string;
    created_at: string;
  }>;
};

export type RunPsychologyContext = {
  projectId: string;
  organizationId: string | null;
  /**
   * Optional recruiter-supplied context to bias the agent. Prepended
   * to the system prompt as a "Recruiter context" block; the seam
   * persists it alongside the result so the next render can show what
   * shaped this generation.
   */
  recruiterContext?: string;
  /** Pre-built client for the skill read — the agent's own session
   * (081). Rides ctx, never input: `input` is serialised wholesale
   * into the model prompt. */
  skillClient?: SupabaseClient;
};

export async function runPsychology(
  input: PsychologyInput,
  ctx: RunPsychologyContext
): Promise<CandidatePsychology> {
  const anthropic = getAnthropic();
  const userPrompt = JSON.stringify(input, null, 2);
  const baseSystem = await applySkillsToPrompt(PSYCHOLOGY_SYSTEM_PROMPT, {
    projectId: ctx.projectId,
    organizationId: ctx.organizationId,
    client: ctx.skillClient,
  });
  const system = wrapWithRecruiterContext(baseSystem, ctx.recruiterContext);

  const response = await anthropic.messages.create({
    model: PSYCHOLOGY_MODEL,
    max_tokens: 2500,
    system,
    messages: [{ role: "user", content: userPrompt }],
    output_config: {
      format: {
        type: "json_schema",
        schema: PSYCHOLOGY_SCHEMA,
      },
    },
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Psychology response contained no text block");
  }

  const partial = JSON.parse(textBlock.text) as Omit<
    CandidatePsychology,
    "generated_at"
  >;
  return {
    ...partial,
    generated_at: new Date().toISOString(),
  };
}

// ────────────────────────────────────────────────────────────────────────
// The seam (081): the PSYCHOLOGY AGENT's session, signed in per run.
// The recruiter's action keeps the gate, the ownership assertion, and
// the recruiterContext hand-off; the reads (including the SELECT-only
// candidate_notes grant), the context-wrapped model call, the TWO
// writes and the trail event all run under the agent's own RLS, and
// the run signs out persisting nothing.
// ────────────────────────────────────────────────────────────────────────

export type PsychologyRunResult =
  | { status: "ready"; profile: CandidatePsychology }
  /** Not eligible: candidate missing, wrong project, or outside the
   * agent's org-bound reach. */
  | { status: "unavailable" }
  /** The Psychology Agent refused to sign in — suspended from /ops or
   * credentials absent. Nothing was generated, and NOTHING WAS
   * DESTROYED (D5): the existing profile AND psychology_context stand
   * untouched. */
  | { status: "agent_unavailable"; reason: string }
  /** Generation or persistence failed; logged. */
  | { status: "failed" };

export async function runPsychologyAndPersist(
  candidateId: string,
  projectId: string,
  recruiterContext?: string
): Promise<PsychologyRunResult> {
  const session = await signInPsychologyAgent();
  if (!session.ok) {
    captureSeamError(
      `[psychology] generation skipped: ${session.reason}. ` +
        "Any existing profile stands; the panel keeps rendering it."
    );
    return { status: "agent_unavailable", reason: session.reason };
  }

  try {
    return await runUnderAgentSession(
      session.client,
      candidateId,
      projectId,
      recruiterContext
    );
  } finally {
    // Persist nothing (D3): revoke the run's session from GoTrue's ledger.
    await session.signOut();
  }
}

async function runUnderAgentSession(
  supabase: SupabaseClient,
  candidateId: string,
  projectId: string,
  recruiterContext?: string
): Promise<PsychologyRunResult> {
  const [candidateQ, notesQ, projectQ] = await Promise.all([
    supabase
      .from("candidates")
      .select(
        "id, project_id, full_name, current_title, current_company, archetype, cv_structured"
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
      }>(),
    supabase
      .from("candidate_notes")
      .select("note_type, content, created_at")
      .eq("candidate_id", candidateId)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("projects")
      .select("organization_id")
      .eq("id", projectId)
      .single<{ organization_id: string | null }>(),
  ]);

  if (candidateQ.error || !candidateQ.data) return { status: "unavailable" };
  if (projectQ.error || !projectQ.data) return { status: "unavailable" };
  if (candidateQ.data.project_id !== projectId) return { status: "unavailable" };

  const candidate = candidateQ.data;
  const cv = (candidate.cv_structured ?? {}) as Record<string, unknown>;
  type NoteRow = { note_type: string; content: string; created_at: string };
  const notes = ((notesQ.data ?? []) as NoteRow[]).map((n) => ({
    note_type: n.note_type,
    content: n.content,
    created_at: n.created_at,
  }));

  let profile: CandidatePsychology;
  try {
    profile = await runPsychology(
      {
        candidate: {
          candidate_id: candidate.id,
          full_name: candidate.full_name,
          current_title: candidate.current_title,
          current_company: candidate.current_company,
          archetype: candidate.archetype,
          profile: cv,
          evaluation: cv["evaluation"] ?? null,
        },
        recruiter_notes: notes,
      },
      {
        projectId,
        organizationId: projectQ.data.organization_id,
        recruiterContext,
        skillClient: supabase,
      }
    );
  } catch (err) {
    captureSeamError("[psychology] agent generation failed", err);
    return { status: "failed" };
  }

  // The two-write shape, in today's order: profile first, then the
  // context that shaped it (set, or cleared when the recruiter gave
  // none). Both single-key replaces through the RLS-bound RPC — no
  // pre-clear anywhere (D5).
  const { error: profileErr } = await supabase.rpc("update_cv_structured_field", {
    p_candidate_id: candidateId,
    p_project_id: projectId,
    p_key: "psychology",
    p_value: profile,
  });
  if (profileErr) {
    captureSeamError(
      "[psychology] failed to persist the profile for candidate",
      candidateId,
      profileErr
    );
    return { status: "failed" };
  }

  const trimmed = recruiterContext?.trim();
  const { error: contextErr } = await supabase.rpc("update_cv_structured_field", {
    p_candidate_id: candidateId,
    p_project_id: projectId,
    p_key: "psychology_context",
    p_value: trimmed ? trimmed : null,
  });
  if (contextErr) {
    // The profile landed; a stale context is logged, not fatal — the
    // same window today's action carries.
    captureSeamError(
      "[psychology] failed to persist the recruiter context for candidate",
      candidateId,
      contextErr
    );
  }

  // The trail (D4): one event per LANDED profile, the trigger named,
  // the context as a BOOLEAN — the text lives in psychology_context.
  const { error: eventErr } = await supabase.rpc("record_agent_event", {
    p_event_type: "candidate_profiled",
    p_project_id: projectId,
    p_candidate_id: candidateId,
    p_detail: {
      agent_kind: "psychology",
      trigger: "psychology" in cv ? "regenerate" : "generate",
      replaced_existing: "psychology" in cv,
      has_recruiter_context: Boolean(trimmed),
    },
  });
  if (eventErr) {
    captureSeamError(
      "[psychology] failed to record the profile event",
      candidateId,
      eventErr
    );
  }

  return { status: "ready", profile };
}
