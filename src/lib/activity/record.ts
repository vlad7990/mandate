import "server-only";
import type { AppRecordableEvent } from "./types";

/**
 * Record an intent event on the activity trail.
 *
 * Most of the trail is written by triggers in migration 053, which is why
 * it can be trusted: a change to a fee is recorded because the row changed,
 * not because somebody remembered. These three events have no row change
 * behind them — publishing a shortlist, exporting a report, opening the
 * hiring-manager portal are things that *leave the building* — so they are
 * the only ones the application has to say out loud.
 *
 * It goes through the `record_activity_event` RPC rather than an insert.
 * The RPC is SECURITY DEFINER, stamps `actor_id` from `auth.uid()` itself
 * and refuses any event type outside the intent set, so a caller cannot
 * attribute an action to somebody else and cannot fabricate a fee entry.
 * `authenticated` has no INSERT policy on the table at all.
 *
 * Failures are logged and swallowed. An audit write must never break the
 * user-facing action it describes — the shortlist has already gone to the
 * client by the time this runs, and refusing to admit it happened would be
 * the worse of the two failures.
 */
type SupabaseLike = {
  rpc: (
    fn: string,
    args: Record<string, unknown>
  ) => PromiseLike<{ error: { message: string } | null }>;
};

export type ActivityRecordInput = {
  eventType: AppRecordableEvent;
  projectId?: string | null;
  candidateId?: string | null;
  clientId?: string | null;
  detail?: Record<string, unknown>;
};

export async function recordActivity(
  supabase: SupabaseLike,
  input: ActivityRecordInput
): Promise<void> {
  try {
    const { error } = await supabase.rpc("record_activity_event", {
      p_event_type: input.eventType,
      p_project_id: input.projectId ?? null,
      p_candidate_id: input.candidateId ?? null,
      p_client_id: input.clientId ?? null,
      p_detail: input.detail ?? {},
    });

    if (error) {
      console.error(`[activity] failed to record ${input.eventType}:`, error.message);
    }
  } catch (err) {
    console.error(`[activity] failed to record ${input.eventType}:`, err);
  }
}
