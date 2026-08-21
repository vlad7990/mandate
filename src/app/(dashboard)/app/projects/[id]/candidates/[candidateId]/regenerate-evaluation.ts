"use client";

import { toast } from "sonner";
import { ActionFailure, unwrap } from "@/lib/actions/result";
import {
  evaluationStampAction,
  regenerateEvaluationAction,
} from "./actions";

// The regenerate runs ~90 seconds server-side — long enough that the
// browser's fetch sometimes gives up ("Failed to fetch") while the
// server finishes the work and lands the write (§37, observed live).
// Reporting that drop as failure is a lie by omission: the report is
// sitting in the database while the toast says it isn't. So the toast
// is optimistic while the action runs, and a transport-level drop
// switches to watching the evaluation's generated_at stamp — the write
// landing is the outcome, whatever the dead fetch had to say. Only a
// failure the server actually authored reads as failure.

const POLL_INTERVAL_MS = 6_000;
const POLL_ATTEMPTS = 20; // two more minutes of patience after a drop

/**
 * Shared by the report header's Regenerate and the pending panel's
 * Retry Evaluation — the same action, the same honesty problem.
 */
export async function regenerateWithHonestToast(opts: {
  candidateId: string;
  projectId: string;
  /** generated_at of the report on screen; null when none exists yet. */
  baselineStamp: string | null;
  /** Called once the new report is known to exist. */
  onLanded: () => void;
}): Promise<void> {
  const { candidateId, projectId, baselineStamp, onLanded } = opts;
  const id = toast.loading("Regenerating — this takes about a minute.");

  try {
    unwrap(await regenerateEvaluationAction(candidateId, projectId));
    toast.success("Evaluation regenerated", { id });
    onLanded();
    return;
  } catch (err) {
    if (!isTransportDrop(err)) {
      // The server answered — a refusal sentence (ActionFailure) or a
      // fault. Either way the outcome is known, and it is a failure.
      const msg =
        err instanceof ActionFailure
          ? err.message
          : err instanceof Error
            ? err.message
            : "Regenerate failed.";
      console.error("[evaluation] regenerate failed:", err);
      toast.error(msg, { id });
      return;
    }
    console.error("[evaluation] regenerate fetch dropped; polling:", err);
  }

  toast.loading("Still working — the connection dropped, watching for the report…", {
    id,
  });

  for (let i = 0; i < POLL_ATTEMPTS; i++) {
    await sleep(POLL_INTERVAL_MS);
    let stamp: string | null;
    try {
      stamp = unwrap(await evaluationStampAction(candidateId, projectId));
    } catch {
      // A flaky poll proves nothing either way — keep watching.
      continue;
    }
    if (stamp !== null && stamp !== baselineStamp) {
      toast.success("Evaluation regenerated", { id });
      onLanded();
      return;
    }
  }

  toast.error(
    "Could not confirm the regenerate — the connection dropped mid-run. " +
      "Refresh the page in a minute; if the report hasn't updated, run it again.",
    { id }
  );
}

/**
 * A fetch that died before the server answered rejects with a
 * `TypeError` in every engine (Chrome "Failed to fetch", Safari "Load
 * failed", Firefox "NetworkError…"). Anything else crossed the wire.
 */
function isTransportDrop(err: unknown): boolean {
  return err instanceof TypeError;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
