"use server";

import { revalidatePath } from "next/cache";
import { requireActionContext } from "@/lib/auth/access";
import { runWeeklyReportAndPersist } from "@/lib/ai/run-weekly-report";
import { runAction } from "@/lib/actions/run";
import type { ActionResult } from "@/lib/actions/result";

/** Sentence subject for a failure this file did not author. See `runAction`. */
const SUBJECT = "The weekly report";

async function requireActiveUser() {
  return requireActionContext("clients:share");
}

/**
 * Generate a weekly report for the project covering the most recent
 * Monday-aligned ISO week.
 *
 * The judgment runs under the SEARCH HEALTH AGENT's own session
 * (087): the seam signs the fourteenth principal in, reads the week's
 * state under its own grants, judges, and lands the report through
 * the slice's one new door — an INSERT-only, generated_by-pinned,
 * no-SELECT grant, so the seam mints the row's id itself and inserts
 * BLIND, then hands the id back for the page to navigate to. The
 * action keeps the client-facing gate and the cache invalidation.
 */
export async function generateWeeklyReportAction(
  projectId: string
): Promise<ActionResult<{ id: string }>> {
  return runAction(SUBJECT, async () => {
    if (!projectId) throw new Error("Missing projectId.");
    await requireActiveUser();

    const run = await runWeeklyReportAndPersist(projectId);

    if (run.status === "agent_unavailable") {
      throw new Error(
        "The Search Health Agent could not run — an operator has suspended it " +
          "or its credentials are absent. The previous reports stand."
      );
    }
    if (run.status === "unavailable") throw new Error("Project not found.");
    if (run.status !== "ready") {
      throw new Error("Weekly report failed. Try again.");
    }

    revalidatePath(`/app/projects/${projectId}/reports`);
    return { id: run.id };
  });
}

// WeeklyReport / WeeklyReportInput live in the agent module —
// "use server" files only export async functions, so callers import
// types directly from @/lib/ai/weekly-report-agent.
