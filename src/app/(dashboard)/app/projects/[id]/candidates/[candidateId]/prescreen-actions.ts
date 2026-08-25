"use server";

// Pre-screen — the Engage arc's fifth surface (#23, 101).
//
// Computing, drafting and structuring are the agent's acts through
// the seam; SENDING the invitation, abandoning, and resolving an
// escalation are the recruiter's acts under their own cookie
// session. The invitation rides the Candidate Communication Service
// with the system-controlled disclosure block appended — the agent's
// questions leave under the HUMAN's name or die unsent.

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { runPrescreenAndPersist } from "@/lib/ai/run-prescreen";
import { sendCandidateMessage } from "@/lib/comms/send-candidate-message";
import {
  prescreenDisclosure,
  type PrescreenQuestionSet,
} from "@/lib/ai/prescreen";
import { runAction } from "@/lib/actions/run";
import type { ActionResult } from "@/lib/actions/result";

/** Sentence subject for a failure this file did not author. See `runAction`. */
const SUBJECT = "The pre-screen";

/** D8e, worded verbatim — the refusal is honest and destroys nothing. */
const AGENT_UNAVAILABLE_MESSAGE =
  "The Pre-Screen Agent could not run — an operator has suspended it " +
  "or its credentials are absent. The pre-screen record is untouched. " +
  "Try again when it is restored.";

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

function messageFor(status: string, prescreenStatus?: string): string {
  switch (status) {
    case "unavailable":
      return "The candidate or mandate could not be read — nothing was updated.";
    case "dnc":
      return (
        "This person is marked do-not-contact on their relationship " +
        "record — the pre-screen was not touched and no model call was " +
        "spent. Only a founder-level act with a recorded reason can " +
        "clear the suppression."
      );
    case "terminal":
      return prescreenStatus === "escalated"
        ? "This pre-screen is ESCALATED — it is yours, not the agent's. Resolve it below."
        : `This pre-screen is ${(prescreenStatus ?? "complete").toUpperCase()} — the record is final to the agent.`;
    case "agent_unavailable":
      return AGENT_UNAVAILABLE_MESSAGE;
    default:
      return "The update failed — nothing was saved. Try again.";
  }
}

export async function runPrescreenAction(
  projectId: string,
  candidateId: string
): Promise<ActionResult<{ prescreenStatus: string }>> {
  return runAction(SUBJECT, async () => {
    await requireAuth();
    const run = await runPrescreenAndPersist(projectId, candidateId);
    if (run.status !== "updated") {
      throw new Error(
        messageFor(
          run.status,
          "prescreenStatus" in run ? run.prescreenStatus : undefined
        )
      );
    }
    revalidate(projectId, candidateId);
    return { prescreenStatus: run.prescreenStatus };
  });
}

/**
 * Send the proposed invitation through the Candidate Communication
 * Service — the HUMAN's act. The service composes the Art. 14
 * notice; this action appends the system-controlled AI-disclosure
 * block (D6) after the questions, outside anyone's edit. On success
 * the pre-screen is marked INVITED under the sender's session.
 */
export async function sendPrescreenInviteAction(
  projectId: string,
  candidateId: string,
  prescreenId: string
): Promise<ActionResult<{ noticeCarried: boolean }>> {
  return runAction(SUBJECT, async () => {
    await requireAuth();
    const supabase = await createServerSupabaseClient();

    const [{ data: prescreen }, { data: org }] = await Promise.all([
      supabase
        .from("prescreens")
        .select("id, status, question_set, updated_at")
        .eq("id", prescreenId)
        .maybeSingle<{
          id: string;
          status: string;
          question_set: Partial<PrescreenQuestionSet> | null;
          updated_at: string;
        }>(),
      supabase
        .from("organizations")
        .select("name")
        .maybeSingle<{ name: string }>(),
    ]);
    if (!prescreen) {
      throw new Error("The pre-screen could not be read — nothing was sent.");
    }
    if (prescreen.status !== "proposed") {
      throw new Error(
        "Only a PROPOSED pre-screen can be invited — reload the page to see its current state."
      );
    }
    const questions = (prescreen.question_set?.questions ?? []).filter(
      (q) => typeof q === "string" && q.trim() !== ""
    );
    const body = (prescreen.question_set?.body ?? "").trim();
    if (!body && questions.length === 0) {
      throw new Error("There is no proposed question set on this pre-screen to send.");
    }

    const recruiterBody = [
      body,
      questions.map((q, i) => `${i + 1}. ${q}`).join("\n"),
      prescreenDisclosure(org?.name ?? "the search firm"),
    ]
      .filter((part) => part.trim() !== "")
      .join("\n\n");

    const result = await sendCandidateMessage({
      candidateId,
      projectId,
      channel: "email",
      subject: (prescreen.question_set?.subject ?? "").trim(),
      recruiterBody,
      actor: { kind: "human" },
      idempotencyKey: `prescreen:${prescreenId}:${prescreen.updated_at}`,
    });

    if (result.sent && result.alreadySent) {
      throw new Error(
        "This invitation was already sent — the contact log has the record."
      );
    }
    if (!result.sent) {
      throw new Error(result.message);
    }

    // The invitation went: the pre-screen is INVITED, under the
    // sending human's session.
    await supabase
      .from("prescreens")
      .update({ status: "invited", updated_at: new Date().toISOString() })
      .eq("id", prescreenId);

    revalidate(projectId, candidateId);
    return { noticeCarried: result.noticeCarried };
  });
}

/** Walking away is a human act — 101's WITH CHECK refuses the agent. */
export async function abandonPrescreenAction(
  projectId: string,
  candidateId: string,
  prescreenId: string
): Promise<ActionResult<null>> {
  return runAction(SUBJECT, async () => {
    await requireAuth();
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("prescreens")
      .update({
        status: "abandoned",
        escalation_reason: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", prescreenId)
      .in("status", ["proposed", "invited", "in_progress", "escalated"])
      .select("id");
    if (error) {
      throw new Error(`The abandonment was not recorded: ${error.message}`);
    }
    if (!data || data.length === 0) {
      throw new Error(
        "This pre-screen is already final — reload the page to see its current state."
      );
    }
    revalidate(projectId, candidateId);
    return null;
  });
}

/**
 * Resolve an escalation — the human's act, forever. The reason
 * leaves with the state (the coherence CHECK holds them together).
 */
export async function resolvePrescreenEscalationAction(
  projectId: string,
  candidateId: string,
  prescreenId: string,
  resolution: string
): Promise<ActionResult<null>> {
  return runAction(SUBJECT, async () => {
    await requireAuth();
    if (!["in_progress", "abandoned"].includes(resolution)) {
      throw new Error("That is not a state an escalation can resolve into.");
    }
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("prescreens")
      .update({
        status: resolution,
        escalation_reason: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", prescreenId)
      .eq("status", "escalated")
      .select("id");
    if (error) {
      throw new Error(`The resolution was not recorded: ${error.message}`);
    }
    if (!data || data.length === 0) {
      throw new Error(
        "This pre-screen is no longer escalated — reload the page to see its current state."
      );
    }
    revalidate(projectId, candidateId);
    return null;
  });
}
