import "server-only";
import { getAnthropic } from "@/lib/anthropic";
import {
  PRESCREEN_SCHEMA,
  PRESCREEN_SYSTEM_PROMPT,
  type PrescreenJudgment,
  type PrescreenStatus,
} from "./prescreen";
import { signInPrescreenAgent } from "@/lib/agents/session";
import { applySkillsToPrompt } from "@/lib/skills/skill-injector";
import {
  computeEvidenceCoverage,
  unresolvedDimensions,
} from "@/lib/candidates/evidence-coverage";
import {
  buildPrescreenUpdate,
  type TranscriptTurn,
} from "@/lib/comms/prescreen-merge";
import { detectHardEscalation } from "@/lib/comms/engagement-merge";
import {
  DEFAULT_COMMS_POLICY,
  type CommsPolicy,
} from "@/lib/outreach/strategy-policy";
import { captureSeamError } from "@/lib/observability/sentry";

const PRESCREEN_MODEL = "claude-sonnet-4-6";

export type PrescreenInput = {
  role_context: {
    title: string;
    company_name: string;
  };
  /** The gap, computed BEFORE the model was called. */
  coverage: Array<{
    dimension: string;
    status: string;
    evidence: string | null;
    source: string | null;
  }>;
  thread: TranscriptTurn[];
  prescreen: {
    status: string;
    question_set: unknown;
    professional_evidence: unknown;
    interest_profile: unknown;
  } | null;
  today: string;
};

export async function generatePrescreenJudgment(
  input: PrescreenInput,
  options?: { system?: string }
): Promise<PrescreenJudgment> {
  const anthropic = getAnthropic();
  const response = await anthropic.messages.create({
    model: PRESCREEN_MODEL,
    max_tokens: 2000,
    system: options?.system ?? PRESCREEN_SYSTEM_PROMPT,
    messages: [{ role: "user", content: JSON.stringify(input, null, 2) }],
    output_config: {
      format: {
        type: "json_schema",
        schema: PRESCREEN_SCHEMA,
      },
    },
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Pre-screen response contained no text block");
  }
  return JSON.parse(textBlock.text) as PrescreenJudgment;
}

// ────────────────────────────────────────────────────────────────────────
// The seam (101): the PRE-SCREEN AGENT's session, signed in per act —
// the TWENTY-FOURTH principal, the Engage arc's fifth, at the D2
// counsel boundary: the agent COMPUTES the evidence gap (pure
// function, before any model spend), DRAFTS the invitation and one
// question per unknown (the human sends it through the 099 service),
// and STRUCTURES what came back — transcript copied from the thread
// DETERMINISTICALLY, evidence and interest captured in two tracks
// with NO VERDICT (the clamp strips score-shaped keys; the harness
// probes the landed jsonb). The spec-§10 hard gates run first on the
// latest inbound; a suppressed person and a terminal pre-screen
// (complete / abandoned / escalated) are refused before any spend.
// The trail carries COUNTS; the session signs out in a finally.
// ────────────────────────────────────────────────────────────────────────

export type PrescreenRunResult =
  | { status: "updated"; prescreenStatus: PrescreenStatus }
  | { status: "unavailable" }
  | { status: "dnc" }
  /** complete / abandoned / escalated — the record is the human's now. */
  | { status: "terminal"; prescreenStatus: PrescreenStatus }
  | { status: "agent_unavailable"; reason: string }
  | { status: "failed" };

export async function runPrescreenAndPersist(
  projectId: string,
  candidateId: string
): Promise<PrescreenRunResult> {
  const session = await signInPrescreenAgent();
  if (!session.ok) {
    console.error(
      `[prescreen] The Pre-Screen Agent could not run — an operator has ` +
        `suspended it or its credentials are absent. The pre-screen record ` +
        `is untouched. Try again when it is restored. (${session.reason})`
    );
    return { status: "agent_unavailable", reason: session.reason };
  }

  try {
    const supabase = session.client;

    const [
      { data: project },
      { data: candidate },
      { data: thread },
      { data: policyRow },
      { data: prescreen },
    ] = await Promise.all([
      supabase
        .from("projects")
        .select("id, title, company_name")
        .eq("id", projectId)
        .maybeSingle<{ id: string; title: string; company_name: string }>(),
      supabase
        .from("candidates")
        .select("id, full_name, cv_structured, network_profile_id")
        .eq("id", candidateId)
        .maybeSingle<{
          id: string;
          full_name: string;
          cv_structured: Record<string, unknown> | null;
          network_profile_id: string | null;
        }>(),
      supabase
        .from("candidate_outreach")
        .select("direction, channel, subject, body, occurred_at")
        .eq("candidate_id", candidateId)
        .order("occurred_at", { ascending: true }),
      supabase
        .from("org_comms_policy")
        .select(
          "allowed_channels, client_identity_disclosure, compensation_discussion"
        )
        .eq("organization_id", session.organizationId)
        .maybeSingle<CommsPolicy>(),
      supabase
        .from("prescreens")
        .select(
          "id, status, question_set, professional_evidence, interest_profile"
        )
        .eq("candidate_id", candidateId)
        .eq("project_id", projectId)
        .neq("status", "abandoned")
        .maybeSingle<{
          id: string;
          status: PrescreenStatus;
          question_set: unknown;
          professional_evidence: unknown;
          interest_profile: unknown;
        }>(),
    ]);

    if (!project || !candidate) return { status: "unavailable" };

    // A terminal record is the human's: complete never changes under
    // an agent's hand (the database pin refuses it anyway), abandoned
    // stays walked-away-from, escalated waits for its human.
    if (
      prescreen &&
      ["complete", "abandoned", "escalated"].includes(prescreen.status)
    ) {
      return { status: "terminal", prescreenStatus: prescreen.status };
    }

    // The relationship record speaks first (098).
    if (candidate.network_profile_id) {
      const { data: person } = await supabase
        .from("network_profiles")
        .select("dnc")
        .eq("id", candidate.network_profile_id)
        .maybeSingle<{ dnc: boolean }>();
      if (person?.dnc) return { status: "dnc" };
    }

    // The gap, before the model (pure — no spend to know the unknowns).
    const coverage = computeEvidenceCoverage(candidate.cv_structured);
    const unknowns = unresolvedDimensions(coverage);

    const messages: TranscriptTurn[] = (thread ?? []).map((o) => ({
      direction: o.direction as string,
      channel: o.channel as string,
      subject: o.subject as string | null,
      body: o.body as string | null,
      occurred_at: o.occurred_at as string,
    }));
    const inboundCount = messages.filter((m) => m.direction === "inbound").length;
    const latestInbound = [...messages]
      .reverse()
      .find((m) => m.direction === "inbound");

    const policy: CommsPolicy = policyRow ?? DEFAULT_COMMS_POLICY;

    // The spec-§10 hard gates, deterministic and FIRST (shared with
    // #22 — one lexicon, one rule).
    const hardGateReason = detectHardEscalation(
      latestInbound
        ? `${latestInbound.subject ?? ""}\n${latestInbound.body ?? ""}`
        : null
    );

    let judgment: PrescreenJudgment;
    let hardGated = false;
    if (hardGateReason) {
      hardGated = true;
      judgment = {
        status: "escalated",
        escalation_reason: hardGateReason,
        question_set: null,
        professional_evidence: {},
        interest_profile: {
          interest: "unknown",
          motivation: null,
          timing: null,
          location: null,
          comp_context: null,
          notice: null,
          constraints: null,
          questions: [],
        },
      };
    } else {
      // Project-scoped skills — a pre-screen IS a mandate's act (D6).
      const system = await applySkillsToPrompt(PRESCREEN_SYSTEM_PROMPT, {
        projectId,
        organizationId: session.organizationId,
        client: supabase,
      });
      try {
        judgment = await generatePrescreenJudgment(
          {
            role_context: {
              title: project.title,
              company_name: project.company_name,
            },
            coverage,
            thread: messages,
            prescreen: prescreen
              ? {
                  status: prescreen.status,
                  question_set: prescreen.question_set,
                  professional_evidence: prescreen.professional_evidence,
                  interest_profile: prescreen.interest_profile,
                }
              : null,
            today: new Date().toISOString().slice(0, 10),
          },
          { system }
        );
      } catch (err) {
        captureSeamError("[prescreen] agent judgment failed", err);
        return { status: "failed" };
      }
    }

    const { update, clamped } = buildPrescreenUpdate({
      judgment,
      policy,
      clientName: project.company_name,
      transcript: messages,
      now: new Date(),
    });

    let laneId = prescreen?.id ?? null;
    if (!laneId) {
      // Born a PROPOSAL (the INSERT pin), then advanced in the same
      // session — both statements lawful under 101's doors.
      const { data: born, error: insertError } = await supabase
        .from("prescreens")
        .insert({
          organization_id: session.organizationId,
          project_id: projectId,
          candidate_id: candidateId,
          status: "proposed",
        })
        .select("id")
        .maybeSingle<{ id: string }>();
      if (insertError || !born) {
        if (insertError?.code === "23505") {
          return { status: "terminal", prescreenStatus: "proposed" };
        }
        captureSeamError("[prescreen] failed to birth the proposal", insertError);
        return { status: "failed" };
      }
      laneId = born.id;
    }

    const { data: landed, error: updateError } = await supabase
      .from("prescreens")
      .update(update)
      .eq("id", laneId)
      .select("id, status");
    if (updateError) {
      captureSeamError("[prescreen] failed to persist the record", updateError);
      return { status: "failed" };
    }
    if (!landed || landed.length === 0) {
      return { status: "terminal", prescreenStatus: prescreen?.status ?? "complete" };
    }

    const finalStatus = (update.status ??
      prescreen?.status ??
      "proposed") as PrescreenStatus;
    const evidence = update.professional_evidence;
    const validated = Object.values(evidence).filter(
      (e) => e?.status === "validated"
    ).length;
    const partial = Object.values(evidence).filter(
      (e) => e?.status === "partial"
    ).length;

    // The trail (D4): COUNTS only — never a question, never an answer.
    const { error: eventErr } = await supabase.rpc("record_agent_event", {
      p_event_type: "prescreen_updated",
      p_project_id: projectId,
      p_candidate_id: candidateId,
      p_detail: {
        agent_kind: "prescreen",
        status: finalStatus,
        unknowns: unknowns.length,
        questions: update.question_set?.questions.length ?? 0,
        validated,
        partial,
        thread_messages: messages.length,
        inbound: inboundCount,
        outbound: messages.length - inboundCount,
        interest: update.interest_profile.interest,
        escalated: finalStatus === "escalated",
        hard_gate: hardGated,
        policy_clamped: clamped,
      },
    });
    if (eventErr) {
      captureSeamError("[prescreen] failed to record the event", eventErr);
    }

    return { status: "updated", prescreenStatus: finalStatus };
  } finally {
    // Persist nothing (D2): revoke the run's session from GoTrue's ledger.
    await session.signOut();
  }
}
