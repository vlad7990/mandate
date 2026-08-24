"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { markIntakeTimedOut } from "./actions";
import { unwrap } from "@/lib/actions/result";

const POLL_INTERVAL_MS = 1500;
const TIMEOUT_MS = 60_000;

/**
 * Polls while the intake analysis is in flight, exactly as before —
 * but the window's end now MARKS instead of abandoning (090: D6).
 * After TIMEOUT_MS the client calls markIntakeTimedOut to write a
 * terminal failure to the row (guarded server-side: only while the
 * analysis is still absent and no marker landed first), then refreshes
 * so the page renders the honest failed block with its retry CTA.
 * The job-spec polling skeleton's arc, applied to the mandate.
 *
 * `intakeFailed` stops the loop entirely: a marked mandate is a
 * terminal state with a human affordance, not something to poll.
 */
export function ProjectPoller({
  projectId,
  analysisReady,
  intakeFailed,
}: {
  projectId: string;
  analysisReady: boolean;
  intakeFailed: boolean;
}) {
  const router = useRouter();
  const startedAtRef = useRef<number | null>(null);
  const timedOutRef = useRef(false);

  useEffect(() => {
    if (analysisReady || intakeFailed) return;

    // A fresh arm is a fresh window. The component stays mounted across
    // router.refresh() re-renders (deps unchanged, interval persists),
    // but when a retry clears the marker and this effect re-arms, the
    // old clock would time the new run out instantly.
    startedAtRef.current = Date.now();
    timedOutRef.current = false;

    const id = setInterval(async () => {
      if (
        startedAtRef.current != null &&
        Date.now() - startedAtRef.current > TIMEOUT_MS
      ) {
        clearInterval(id);
        // Run-once guard: re-mounts (e.g. fast refresh) shouldn't fire
        // the timeout marker repeatedly.
        if (timedOutRef.current) return;
        timedOutRef.current = true;
        try {
          unwrap(await markIntakeTimedOut(projectId));
        } catch (err) {
          console.error("[project-poller] timeout marker failed", err);
        }
        // Refresh in either case — even if the marker failed, show
        // whatever the server now considers current state.
        router.refresh();
        return;
      }
      router.refresh();
    }, POLL_INTERVAL_MS);

    return () => clearInterval(id);
  }, [analysisReady, intakeFailed, projectId, router]);

  return null;
}
