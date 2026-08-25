import "server-only";
import { getAnthropic } from "@/lib/anthropic";
import {
  ENGAGEMENT_SCHEMA,
  ENGAGEMENT_SYSTEM_PROMPT,
  type EngagementJudgment,
} from "./engagement";
import { signInEngagementAgent } from "@/lib/agents/session";
import { applySkillsToPrompt } from "@/lib/skills/skill-injector";
import {
  buildEngagementUpdate,
  detectHardEscalation,
} from "@/lib/comms/engagement-merge";
import {
  DEFAULT_COMMS_POLICY,
  type CommsPolicy,
} from "@/lib/outreach/strategy-policy";
import { captureSeamError } from "@/lib/observability/sentry";

const ENGAGEMENT_MODEL = "claude-sonnet-4-6";

export type EngagementInput = {
  role_context: {
    title: string;
    company_name: string;
  };
  thread: Array<{
    direction: string;
    channel: string;
    subject: string | null;
    body: string | null;
    delivery_status: string | null;
    occurred_at: string;
  }>;
  approved_strategy: {
    angle: string | null;
    draft_subject: string | null;
  } | null;
  relationship: {
    state: string;
    disposition: Record<string, unknown>;
  } | null;
  policy: CommsPolicy;
  lane: {
    state: string;
    next_follow_up_at: string | null;
  } | null;
  today: string;
};

export async function generateEngagementJudgment(
  input: EngagementInput,
  options?: { system?: string }
): Promise<EngagementJudgment> {
  const anthropic = getAnthropic();
  const response = await anthropic.messages.create({
    model: ENGAGEMENT_MODEL,
    max_tokens: 1500,
    system: options?.system ?? ENGAGEMENT_SYSTEM_PROMPT,
    messages: [{ role: "user", content: JSON.stringify(input, null, 2) }],
    output_config: {
      format: {
        type: "json_schema",
        schema: ENGAGEMENT_SCHEMA,
      },
    },
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Engagement response contained no text block");
  }
  return JSON.parse(textBlock.text) as EngagementJudgment;
}

// ────────────────────────────────────────────────────────────────────────
// The seam (100): the CANDIDATE ENGAGEMENT AGENT's session, signed in
// per maintenance act — the TWENTY-THIRD principal, the Engage arc's
// fourth. The human door is the recruiter's explicit "Update
// engagement" act on the outreach tab. The agent re-reads the thread
// (thread_key territory — 097's contact-history grant), the approved
// strategy, the relationship record and the comms policy under ITS
// OWN session; judges with PROJECT-scoped skills (a lane IS a
// mandate — D6); the spec-§10 hard gates run deterministically FIRST
// (a candidate asking for a human never waits on a model call); the
// merge is clamped (engagement-merge.ts — no field creep, no
// reasonless escalation, the draft policy-clamped through the shared
// validator); the write lands through 100's pinned doors (an
// escalated lane is refused before any spend — it is the human's);
// the trail carries COUNTS; the session signs out in a finally.
// ────────────────────────────────────────────────────────────────────────

export type EngagementRunResult =
  | { status: "updated"; escalated: boolean }
  /** Candidate/project missing or outside the agent's org-bound reach. */
  | { status: "unavailable" }
  /** The person is suppressed — no maintenance, no model call. */
  | { status: "dnc" }
  /** The lane is ESCALATED — it is the human's, not the agent's. */
  | { status: "escalated" }
  /** Suspended from /ops or credentials absent. Nothing was touched (D5). */
  | { status: "agent_unavailable"; reason: string }
  | { status: "failed" };

export async function runEngagementAndPersist(
  projectId: string,
  candidateId: string
): Promise<EngagementRunResult> {
  const session = await signInEngagementAgent();
  if (!session.ok) {
    console.error(
      `[engagement] The Candidate Engagement Agent could not run — an ` +
        `operator has suspended it or its credentials are absent. The ` +
        `conversation record is untouched. Try again when it is restored. ` +
        `(${session.reason})`
    );
    return { status: "agent_unavailable", reason: session.reason };
  }

  try {
    const supabase = session.client;

    const [
      { data: project },
      { data: candidate },
      { data: thread },
      { data: strategies },
      { data: policyRow },
      { data: lane },
    ] = await Promise.all([
      supabase
        .from("projects")
        .select("id, title, company_name")
        .eq("id", projectId)
        .maybeSingle<{ id: string; title: string; company_name: string }>(),
      supabase
        .from("candidates")
        .select("id, full_name, network_profile_id")
        .eq("id", candidateId)
        .maybeSingle<{
          id: string;
          full_name: string;
          network_profile_id: string | null;
        }>(),
      supabase
        .from("candidate_outreach")
        .select(
          "direction, channel, subject, body, delivery_status, occurred_at"
        )
        .eq("candidate_id", candidateId)
        .order("occurred_at", { ascending: true }),
      supabase
        .from("outreach_strategies")
        .select("status, version, content")
        .eq("candidate_id", candidateId)
        .eq("project_id", projectId)
        .eq("status", "approved")
        .order("version", { ascending: false })
        .limit(1),
      supabase
        .from("org_comms_policy")
        .select(
          "allowed_channels, client_identity_disclosure, compensation_discussion"
        )
        .eq("organization_id", session.organizationId)
        .maybeSingle<CommsPolicy>(),
      supabase
        .from("engagement_states")
        .select("id, state, next_follow_up_at, escalation_reason")
        .eq("candidate_id", candidateId)
        .eq("project_id", projectId)
        .maybeSingle<{
          id: string;
          state: string;
          next_follow_up_at: string | null;
          escalation_reason: string | null;
        }>(),
    ]);

    if (!project || !candidate) return { status: "unavailable" };

    // An escalated lane is the HUMAN's. The database pin refuses the
    // write anyway — refusing here spends no model call and says why.
    if (lane?.state === "escalated") return { status: "escalated" };

    // The relationship record speaks first (098): a suppressed person
    // gets no engagement maintenance and costs no model call.
    let relationship: {
      state: string;
      disposition: Record<string, unknown>;
    } | null = null;
    if (candidate.network_profile_id) {
      const { data: person } = await supabase
        .from("network_profiles")
        .select("dnc, relationship_state, disposition")
        .eq("id", candidate.network_profile_id)
        .maybeSingle<{
          dnc: boolean;
          relationship_state: string;
          disposition: Record<string, unknown>;
        }>();
      if (person?.dnc) return { status: "dnc" };
      if (person) {
        relationship = {
          state: person.relationship_state,
          disposition: person.disposition ?? {},
        };
      }
    }

    const messages = (thread ?? []).map((o) => ({
      direction: o.direction as string,
      channel: o.channel as string,
      subject: o.subject as string | null,
      body: o.body as string | null,
      delivery_status: o.delivery_status as string | null,
      occurred_at: o.occurred_at as string,
    }));
    const inboundCount = messages.filter((m) => m.direction === "inbound").length;
    const outboundCount = messages.length - inboundCount;
    const latestInbound = [...messages]
      .reverse()
      .find((m) => m.direction === "inbound");

    const policy: CommsPolicy = policyRow ?? DEFAULT_COMMS_POLICY;
    const approved = strategies?.[0] ?? null;
    const approvedContent =
      (approved?.content as Record<string, unknown> | null) ?? null;

    // The spec-§10 hard gates, deterministic and FIRST: the candidate
    // asking for a human (or the privacy/legal families) never waits
    // on a model call — the lane escalates and the human owns it.
    const hardGateReason = detectHardEscalation(
      latestInbound
        ? `${latestInbound.subject ?? ""}\n${latestInbound.body ?? ""}`
        : null
    );

    let judgment: EngagementJudgment;
    let hardGated = false;
    if (hardGateReason) {
      hardGated = true;
      judgment = {
        state: "escalated",
        escalation_reason: hardGateReason,
        next_follow_up_at: null,
        draft: null,
      };
    } else {
      // The judgment carries the project's skills (D6): a lane IS a
      // mandate, read under the agent's own session.
      const system = await applySkillsToPrompt(ENGAGEMENT_SYSTEM_PROMPT, {
        projectId,
        organizationId: session.organizationId,
        client: supabase,
      });
      try {
        judgment = await generateEngagementJudgment(
          {
            role_context: {
              title: project.title,
              company_name: project.company_name,
            },
            thread: messages,
            approved_strategy: approved
              ? {
                  angle: (approvedContent?.angle as string | undefined) ?? null,
                  draft_subject:
                    (approvedContent?.draft_subject as string | undefined) ??
                    null,
                }
              : null,
            relationship,
            policy,
            lane: lane
              ? { state: lane.state, next_follow_up_at: lane.next_follow_up_at }
              : null,
            today: new Date().toISOString().slice(0, 10),
          },
          { system }
        );
      } catch (err) {
        captureSeamError("[engagement] agent judgment failed", err);
        return { status: "failed" };
      }
    }

    const { update, clamped } = buildEngagementUpdate({
      judgment,
      policy,
      clientName: project.company_name,
      now: new Date(),
    });

    if (lane) {
      const { data: landed, error: updateError } = await supabase
        .from("engagement_states")
        .update(update)
        .eq("id", lane.id)
        .select("id");
      if (updateError) {
        captureSeamError("[engagement] failed to persist the lane", updateError);
        return { status: "failed" };
      }
      if (!landed || landed.length === 0) return { status: "escalated" };
    } else {
      const { error: insertError } = await supabase
        .from("engagement_states")
        .insert({
          organization_id: session.organizationId,
          project_id: projectId,
          candidate_id: candidateId,
          state: update.state ?? "awaiting_reply",
          escalation_reason: update.escalation_reason,
          next_follow_up_at: update.next_follow_up_at,
          draft: update.draft,
        });
      if (insertError) {
        captureSeamError("[engagement] failed to birth the lane", insertError);
        return { status: "failed" };
      }
    }

    const finalState = update.state ?? lane?.state ?? "awaiting_reply";
    // The trail (D4): COUNTS only — never a name, never the draft's
    // or the thread's text.
    const { error: eventErr } = await supabase.rpc("record_agent_event", {
      p_event_type: "engagement_updated",
      p_project_id: projectId,
      p_candidate_id: candidateId,
      p_detail: {
        agent_kind: "engagement",
        thread_messages: messages.length,
        inbound: inboundCount,
        outbound: outboundCount,
        state: finalState,
        has_draft: update.draft != null,
        escalated: finalState === "escalated",
        hard_gate: hardGated,
        policy_clamped: clamped,
      },
    });
    if (eventErr) {
      captureSeamError("[engagement] failed to record the event", eventErr);
    }

    return { status: "updated", escalated: finalState === "escalated" };
  } finally {
    // Persist nothing (D2): revoke the run's session from GoTrue's ledger.
    await session.signOut();
  }
}
