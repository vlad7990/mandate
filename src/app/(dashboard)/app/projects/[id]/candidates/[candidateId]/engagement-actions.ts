"use server";

// Engagement lane — the Engage arc's fourth surface (#22, 100).
//
// Maintaining the lane is the agent's act through the seam; resolving
// an escalation, dismissing a draft, and SENDING the proposed
// follow-up are the recruiter's acts under their own cookie session.
// The send rides the Candidate Communication Service (099) — the
// agent's proposal leaves under the HUMAN's name or dies unsent.

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { runEngagementAndPersist } from "@/lib/ai/run-engagement";
import { sendCandidateMessage } from "@/lib/comms/send-candidate-message";
import type { EngagementDraft, EngagementState } from "@/lib/ai/engagement";
import { runAction } from "@/lib/actions/run";
import type { ActionResult } from "@/lib/actions/result";

/** Sentence subject for a failure this file did not author. See `runAction`. */
const SUBJECT = "The engagement lane";

/** D5, worded verbatim — the refusal is honest and destroys nothing. */
const AGENT_UNAVAILABLE_MESSAGE =
  "The Candidate Engagement Agent could not run — an operator has " +
  "suspended it or its credentials are absent. The conversation record " +
  "is untouched. Try again when it is restored.";

/** The states a human may resolve an escalation INTO. */
const RESOLUTION_STATES: EngagementState[] = [
  "replied",
  "responding",
  "timing_follow_up",
  "interested",
  "declined",
  "closed",
];

async function requireAuth(): Promise<{ userId: string }> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthenticated.");

  const { data: profile, error } = await supabase
    .from("users")
    .select("organization_id, status")
    .eq("id", user.id)
    .single();

  if (error || !profile?.organization_id || profile.status !== "active") {
    throw new Error("Account is not provisioned.");
  }
  return { userId: user.id };
}

function revalidate(projectId: string, candidateId: string) {
  revalidatePath(`/app/projects/${projectId}/candidates/${candidateId}`);
}

function messageFor(status: string): string {
  switch (status) {
    case "unavailable":
      return "The candidate or mandate could not be read — nothing was updated.";
    case "dnc":
      return (
        "This person is marked do-not-contact on their relationship " +
        "record — the engagement lane was not touched and no model call " +
        "was spent. Only a founder-level act with a recorded reason can " +
        "clear the suppression."
      );
    case "escalated":
      return (
        "This lane is ESCALATED — it is yours, not the agent's. Resolve " +
        "the escalation below; the agent can pick the thread back up after."
      );
    case "agent_unavailable":
      return AGENT_UNAVAILABLE_MESSAGE;
    default:
      return "The update failed — nothing was saved. Try again.";
  }
}

export async function updateEngagementAction(
  projectId: string,
  candidateId: string
): Promise<ActionResult<{ escalated: boolean }>> {
  return runAction(SUBJECT, async () => {
    await requireAuth();
    const run = await runEngagementAndPersist(projectId, candidateId);
    if (run.status !== "updated") throw new Error(messageFor(run.status));
    revalidate(projectId, candidateId);
    return { escalated: run.escalated };
  });
}

/**
 * Resolve an escalation — the human's act, forever: 100's pin refuses
 * the agent this row in the database itself. The reason leaves with
 * the state (the coherence CHECK holds them together).
 */
export async function resolveEscalationAction(
  projectId: string,
  candidateId: string,
  laneId: string,
  resolution: string
): Promise<ActionResult<null>> {
  return runAction(SUBJECT, async () => {
    await requireAuth();
    if (!RESOLUTION_STATES.includes(resolution as EngagementState)) {
      throw new Error("That is not a state an escalation can resolve into.");
    }
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("engagement_states")
      .update({
        state: resolution,
        escalation_reason: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", laneId)
      .eq("state", "escalated")
      .select("id");
    if (error) {
      throw new Error(`The resolution was not recorded: ${error.message}`);
    }
    if (!data || data.length === 0) {
      throw new Error(
        "This lane is no longer escalated — reload the page to see its current state."
      );
    }
    revalidate(projectId, candidateId);
    return null;
  });
}

/**
 * Send the agent's proposed follow-up through the Candidate
 * Communication Service — the level ≤1 HUMAN send. The service
 * composes the Art. 14 notice and walks the whole policy ladder; the
 * idempotency key is draft-scoped so a double-click cannot send
 * twice. On success the draft is cleared and the lane awaits the
 * reply — both the human's acts.
 */
export async function sendEngagementDraftAction(
  projectId: string,
  candidateId: string,
  laneId: string
): Promise<ActionResult<{ noticeCarried: boolean }>> {
  return runAction(SUBJECT, async () => {
    await requireAuth();
    const supabase = await createServerSupabaseClient();

    const { data: lane } = await supabase
      .from("engagement_states")
      .select("id, state, draft, updated_at")
      .eq("id", laneId)
      .maybeSingle<{
        id: string;
        state: string;
        draft: Partial<EngagementDraft> | null;
        updated_at: string;
      }>();
    if (!lane) {
      throw new Error("The engagement lane could not be read — nothing was sent.");
    }
    if (lane.state === "escalated") {
      throw new Error(
        "This lane is ESCALATED — resolve the escalation before anything is sent."
      );
    }
    const body = (lane.draft?.body ?? "").trim();
    if (!body) {
      throw new Error("There is no proposed follow-up on this lane to send.");
    }

    const result = await sendCandidateMessage({
      candidateId,
      projectId,
      channel: "email",
      subject: (lane.draft?.subject ?? "").trim(),
      recruiterBody: body,
      actor: { kind: "human" },
      idempotencyKey: `engagement:${laneId}:${lane.updated_at}`,
    });

    if (result.sent && result.alreadySent) {
      throw new Error(
        "This follow-up was already sent — the contact log has the record."
      );
    }
    if (!result.sent) {
      throw new Error(result.message);
    }

    // The send landed: the draft is spent and the lane awaits the
    // reply — recorded under the sending human's session.
    await supabase
      .from("engagement_states")
      .update({
        draft: null,
        state: "awaiting_reply",
        next_follow_up_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", laneId);

    revalidate(projectId, candidateId);
    return { noticeCarried: result.noticeCarried };
  });
}

/** Dismiss the proposed follow-up without sending — the human's call. */
export async function dismissEngagementDraftAction(
  projectId: string,
  candidateId: string,
  laneId: string
): Promise<ActionResult<null>> {
  return runAction(SUBJECT, async () => {
    await requireAuth();
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("engagement_states")
      .update({ draft: null, updated_at: new Date().toISOString() })
      .eq("id", laneId)
      .not("draft", "is", null)
      .select("id");
    if (error) {
      throw new Error(`The dismissal was not recorded: ${error.message}`);
    }
    if (!data || data.length === 0) {
      throw new Error("There is no proposed follow-up on this lane to dismiss.");
    }
    revalidate(projectId, candidateId);
    return null;
  });
}
