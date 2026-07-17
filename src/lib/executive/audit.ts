import "server-only";
import type { ExecutiveAuditEventType } from "./types";

type SupabaseLike = {
  from: (table: string) => {
    insert: (values: Record<string, unknown>) => PromiseLike<{ error: { message: string } | null }>;
  };
};

export type ExecutiveAuditEventInput = {
  organizationId: string;
  searchId: string | null;
  profileId?: string | null;
  planId?: string | null;
  actorId: string | null;
  eventType: ExecutiveAuditEventType;
  detail?: Record<string, unknown>;
};

/**
 * Append one event to the executive_audit_events trail. The table is
 * append-only at the RLS layer (INSERT + SELECT policies only).
 *
 * Audit writes must never break the user-facing mutation they describe, so
 * failures are logged and swallowed — the primary write has already
 * succeeded by the time this runs.
 */
export async function recordExecutiveAuditEvent(
  supabase: SupabaseLike,
  event: ExecutiveAuditEventInput
): Promise<void> {
  try {
    const { error } = await supabase.from("executive_audit_events").insert({
      organization_id: event.organizationId,
      search_id: event.searchId,
      profile_id: event.profileId ?? null,
      plan_id: event.planId ?? null,
      actor_id: event.actorId,
      event_type: event.eventType,
      detail: event.detail ?? {},
    });
    if (error) {
      console.error(
        `[executive-audit] failed to record ${event.eventType}:`,
        error.message
      );
    }
  } catch (err) {
    console.error(`[executive-audit] failed to record ${event.eventType}:`, err);
  }
}
