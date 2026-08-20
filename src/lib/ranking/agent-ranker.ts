import "server-only";
import { signInRankingAgent } from "@/lib/agents/session";
import {
  computeAndStoreScores,
  type ScoredCandidate,
  type ScoringOptions,
} from "./scoring-engine";

/**
 * The Ranking Agent's one job, as a principal (075, slice two of
 * agents-as-principals).
 *
 * Every scoring run used to execute inside the triggering human's
 * session — a viewer's first ranking-page visit couldn't score at all
 * (no candidates:write), the network-copy `after()` ran on whatever
 * cookies survived there, and every rank the engine wrote was
 * attributed to whoever happened to click. Now the run signs in as the
 * ranker, scores under its own named grants, records the act in the
 * trail with the TRIGGER named (D4), and signs out persisting nothing.
 *
 * Fails soft per D5: the caller's own act — the page render, the copy,
 * the restore — must already be complete or independently safe before
 * this is called. A refused sign-in (suspended from /ops, credentials
 * absent) skips the run with the reason logged and returned; existing
 * scores stand, `rank_changed_at` already dates them, and there is
 * deliberately no service-role fallback.
 */

export type RankerRunResult =
  | { ok: true; scored: ScoredCandidate[] }
  | { ok: false; reason: string };

export async function runRankerScoring(
  projectId: string,
  options?: ScoringOptions
): Promise<RankerRunResult> {
  const session = await signInRankingAgent();
  if (!session.ok) {
    console.error(
      `[ranker] scoring skipped: ${session.reason}. ` +
        "Existing scores stand; the act that asked for the run is unaffected."
    );
    return { ok: false, reason: session.reason };
  }

  try {
    const scored = await computeAndStoreScores(projectId, session.client, options);

    // One event per run that wrote something (D4). A run over zero
    // parsed candidates writes nothing and records nothing — an event
    // for a no-op is noise wearing rigor's clothes.
    if (scored.length > 0) {
      const trigger = options?.trigger ?? { trigger: "scoring_run" as const };
      const moved = scored.filter(
        (s) => s.previousRank != null && s.previousRank !== s.rank
      ).length;
      const fresh = scored.filter((s) => s.previousRank == null).length;

      const { error } = await session.client.rpc("record_agent_event", {
        p_event_type: "candidates_ranked",
        p_project_id: projectId,
        p_detail: {
          agent_kind: "ranker",
          trigger: trigger.trigger,
          summary: ("summary" in trigger ? trigger.summary : undefined) ?? null,
          scored: scored.length,
          moved,
          new: fresh,
        },
      });
      if (error) {
        console.error("[ranker] failed to record the ranking event", error);
      }
    }

    return { ok: true, scored };
  } finally {
    // Persist nothing (D3): revoke the run's session from GoTrue's ledger.
    await session.signOut();
  }
}
