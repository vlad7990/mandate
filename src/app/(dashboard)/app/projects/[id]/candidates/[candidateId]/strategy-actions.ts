"use server";

// Outreach strategy — the Engage arc's first surface (#21, 097).
//
// Drafting is the agent's act through the seam; approve / decline /
// supersede are the recruiter's editorial acts under their own cookie
// session through 097's human door (can_share_clients, approved_by
// actor-pinned). The agent's double pin means a redraft is HUMAN-FIRST:
// the recruiter's session supersedes the live draft, then the seam is
// asked for a new version — and if the agent refuses, the supersede is
// rolled back by the same human session so nothing is destroyed (D5).

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { runOutreachStrategyAndPersist } from "@/lib/ai/run-outreach-strategy";
import { runAction } from "@/lib/actions/run";
import type { ActionResult } from "@/lib/actions/result";

/** Sentence subject for a failure this file did not author. See `runAction`. */
const SUBJECT = "The outreach strategy";

/** D5, worded verbatim — the refusal is honest and destroys nothing. */
const AGENT_UNAVAILABLE_MESSAGE =
  "The Outreach Strategy Agent could not run — an operator has suspended " +
  "it or its credentials are absent. Nothing was drafted; the contact log " +
  "and history are untouched. Try again when it is restored.";

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
      return "The candidate or mandate could not be read — nothing was drafted.";
    case "draft_exists":
      return "A draft strategy already exists — approve, decline, or redraft it instead.";
    case "agent_unavailable":
      return AGENT_UNAVAILABLE_MESSAGE;
    default:
      return "Drafting failed — nothing was saved. Try again.";
  }
}

export async function draftOutreachStrategyAction(
  projectId: string,
  candidateId: string
): Promise<ActionResult<null>> {
  return runAction(SUBJECT, async () => {
    await requireAuth();
    const run = await runOutreachStrategyAndPersist(projectId, candidateId);
    if (run.status !== "drafted") throw new Error(messageFor(run.status));
    revalidate(projectId, candidateId);
    return null;
  });
}

async function decideStrategy(
  projectId: string,
  candidateId: string,
  strategyId: string,
  decision: "approved" | "declined"
): Promise<null> {
  const { userId } = await requireAuth();
  const supabase = await createServerSupabaseClient();

  // The decision is the recruiter's act, actor-pinned: 097's WITH
  // CHECK refuses an approved_by that is not the deciding session.
  const { data, error } = await supabase
    .from("outreach_strategies")
    .update({
      status: decision,
      approved_by: userId,
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", strategyId)
    .eq("status", "draft")
    .select("id");

  if (error) {
    throw new Error(`The decision was not recorded: ${error.message}`);
  }
  if (!data || data.length === 0) {
    throw new Error(
      "This strategy is no longer a draft — reload the page to see its current state."
    );
  }
  revalidate(projectId, candidateId);
  return null;
}

export async function approveOutreachStrategyAction(
  projectId: string,
  candidateId: string,
  strategyId: string
): Promise<ActionResult<null>> {
  return runAction(SUBJECT, () =>
    decideStrategy(projectId, candidateId, strategyId, "approved")
  );
}

export async function declineOutreachStrategyAction(
  projectId: string,
  candidateId: string,
  strategyId: string
): Promise<ActionResult<null>> {
  return runAction(SUBJECT, () =>
    decideStrategy(projectId, candidateId, strategyId, "declined")
  );
}

export async function redraftOutreachStrategyAction(
  projectId: string,
  candidateId: string,
  strategyId: string
): Promise<ActionResult<null>> {
  return runAction(SUBJECT, async () => {
    await requireAuth();
    const supabase = await createServerSupabaseClient();

    // Human-first (the Phase-0 finding): the agent cannot write
    // 'superseded', so the recruiter's session retires the live draft
    // before the agent is asked for the next version.
    const { data: superseded, error: supersedeError } = await supabase
      .from("outreach_strategies")
      .update({ status: "superseded", updated_at: new Date().toISOString() })
      .eq("id", strategyId)
      .eq("status", "draft")
      .select("id");
    if (supersedeError) {
      throw new Error(
        `The redraft could not start: ${supersedeError.message}`
      );
    }
    if (!superseded || superseded.length === 0) {
      throw new Error(
        "This strategy is no longer a draft — reload the page to see its current state."
      );
    }

    const run = await runOutreachStrategyAndPersist(projectId, candidateId);
    if (run.status !== "drafted") {
      // The agent refused or failed: restore the draft the recruiter
      // superseded, so the refusal destroys nothing (D5).
      await supabase
        .from("outreach_strategies")
        .update({ status: "draft", updated_at: new Date().toISOString() })
        .eq("id", strategyId)
        .eq("status", "superseded");
      revalidate(projectId, candidateId);
      throw new Error(messageFor(run.status));
    }

    revalidate(projectId, candidateId);
    return null;
  });
}
