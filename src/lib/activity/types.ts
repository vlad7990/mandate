/**
 * The activity trail — see `supabase/migrations/053_activity_trail.sql`.
 *
 * A record of who changed what, written by the database rather than by the
 * application. Every row here was produced by a trigger on the actual
 * change or by the one RPC that stamps its own actor, so the trail cannot
 * be skipped by the code path that most wants to skip it and cannot be
 * forged from a browser console.
 *
 * ## Why `visibility` is on the row
 *
 * An audit event about a fee contains the fee. `executive_audit_events` is
 * readable by every active member, so putting money events there would
 * have handed a viewer the revenue book a migration after `fees:read`
 * closed that door. Each row therefore carries the tier that may read it,
 * and RLS enforces it with the same predicates the fee tables use —
 * including the own-placement exception.
 *
 * Nothing in this file is a security boundary. It exists so the UI can
 * render what the database already decided to send.
 */

/** Who may read a row. Mirrors the CHECK and the SELECT policy in 053. */
export const ACTIVITY_VISIBILITIES = ["org", "fees", "admin"] as const;
export type ActivityVisibility = (typeof ACTIVITY_VISIBILITIES)[number];

/**
 * The event vocabulary.
 *
 * Grouped by what wrote it, because the groups have different guarantees:
 * the first three are written by triggers on the placement, the money ones
 * by triggers on the fee tables, the member ones by a trigger on `users`,
 * and the last three by the application through `record_activity_event`
 * — the only ones that depend on somebody remembering to call something.
 */
export const ACTIVITY_EVENT_TYPES = [
  "placement_recorded",
  "placement_status_changed",
  "placement_signoff_changed",
  "placement_deleted",

  "fee_recorded",
  "fee_updated",
  "fee_line_earned",
  "fee_line_cancelled",
  "fee_reversed",
  "fee_terms_created",
  "fee_terms_updated",
  "fee_terms_deleted",

  "client_contact_added",
  "client_contact_updated",
  "client_contact_removed",

  "member_role_changed",
  "member_status_changed",
  "member_founder_changed",

  "shortlist_published",
  "report_exported",
  "hm_portal_opened",

  "mandate_reassigned",

  // Written by agent principals through `record_agent_event` (074/075) —
  // the door narrower than `record_activity_event`: an enumerated event
  // list, callable only by an active `agent` role, actor stamped from
  // the session. The first trail rows that can honestly say "the agent
  // acted on the human's trigger" instead of wearing a human face.
  "feedback_interpreted",
  "candidates_ranked",
  "candidate_parsed",
  "candidate_evaluated",
  "candidate_positioned",
  "candidate_researched",
  "candidate_triangulated",
  "candidate_profiled",
  "desk_digest_generated",
  "company_researched",
  "hm_researched",
  "culture_profiled",
  "sourcing_queries_generated",
] as const;

export type ActivityEventType = (typeof ACTIVITY_EVENT_TYPES)[number];

/**
 * The events the application may write.
 *
 * Deliberately a subset: `record_activity_event` refuses anything else, so
 * the intent API cannot be used to fabricate a money or member entry. This
 * list must stay in step with the `IN (...)` test inside that function.
 *
 * ## Two of these are not wired yet, on purpose
 *
 * `shortlist_published` is written, from `submitShortlistAction`.
 *
 * `report_exported` is not, because the only honest place to write it is
 * the moment a PDF is actually produced, and that happens client-side.
 * Recording it where the report is *generated* would log an export that
 * never happened, which is worse than logging nothing — an audit trail is
 * only worth having if every row in it is true.
 *
 * `hm_portal_opened` cannot be written through this RPC at all: the
 * hiring-manager portal is the token path with no session, so `auth.uid()`
 * and `current_user_org_id()` are both null and the function returns
 * without writing. Recording it needs its own SECURITY DEFINER entry point
 * that takes the portal token and derives the org from it, along the lines
 * of `verify_hm_token`. Kept in the vocabulary because the event is worth
 * having and the shape is right; it is simply not built.
 */
export const APP_RECORDABLE_EVENTS = [
  "shortlist_published",
  "report_exported",
  "hm_portal_opened",
  "mandate_reassigned",
] as const;

export type AppRecordableEvent = (typeof APP_RECORDABLE_EVENTS)[number];

export type ActivityEventRow = {
  id: string;
  organization_id: string;
  /** Null when the change had no signed-in actor — a migration, a fix, a job. */
  actor_id: string | null;
  /** The actor's name as it was when the event was written. */
  actor_label: string | null;
  event_type: ActivityEventType;
  project_id: string | null;
  candidate_id: string | null;
  client_id: string | null;
  placement_id: string | null;
  target_user_id: string | null;
  detail: Record<string, unknown>;
  visibility: ActivityVisibility;
  created_at: string;
};

export const ACTIVITY_EVENT_COLUMNS =
  "id, organization_id, actor_id, actor_label, event_type, project_id, candidate_id, client_id, placement_id, target_user_id, detail, visibility, created_at";

/**
 * Coarse groups, for filtering the feed.
 *
 * A person reading the trail is almost always asking one of three
 * questions — what happened to this search, what happened to the money, or
 * who changed somebody's access — so those are the filters rather than a
 * list of seventeen checkboxes.
 */
export const ACTIVITY_GROUPS = ["mandates", "placements", "money", "members", "client"] as const;
export type ActivityGroup = (typeof ACTIVITY_GROUPS)[number];

export const ACTIVITY_GROUP_LABELS: Record<ActivityGroup, string> = {
  mandates: "Mandates",
  placements: "Placements",
  money: "Fees",
  members: "Members",
  client: "Client-facing",
};

export const ACTIVITY_GROUP_OF: Record<ActivityEventType, ActivityGroup> = {
  placement_recorded: "placements",
  placement_status_changed: "placements",
  placement_signoff_changed: "placements",
  placement_deleted: "placements",

  fee_recorded: "money",
  fee_updated: "money",
  fee_line_earned: "money",
  fee_line_cancelled: "money",
  fee_reversed: "money",
  fee_terms_created: "money",
  fee_terms_updated: "money",
  fee_terms_deleted: "money",

  client_contact_added: "client",
  client_contact_updated: "client",
  client_contact_removed: "client",

  member_role_changed: "members",
  member_status_changed: "members",
  member_founder_changed: "members",

  shortlist_published: "client",
  report_exported: "client",
  hm_portal_opened: "client",

  mandate_reassigned: "mandates",

  feedback_interpreted: "mandates",
  candidates_ranked: "mandates",
  candidate_parsed: "mandates",
  candidate_evaluated: "mandates",
  candidate_positioned: "mandates",
  candidate_researched: "mandates",
  candidate_triangulated: "mandates",
  candidate_profiled: "mandates",
  desk_digest_generated: "mandates",
  company_researched: "mandates",
  hm_researched: "mandates",
  culture_profiled: "mandates",
  sourcing_queries_generated: "mandates",
};

/**
 * Narrow an untrusted value to an event type.
 *
 * Same reasoning as `parseRole`: the column is `text` with a CHECK, and a
 * value outside the vocabulary should lose behaviour rather than gain it.
 * A row written by a future migration this build has never heard of
 * renders as an unknown event rather than crashing the feed.
 */
export function parseActivityEventType(value: unknown): ActivityEventType | null {
  if (typeof value !== "string") return null;
  return (ACTIVITY_EVENT_TYPES as readonly string[]).includes(value)
    ? (value as ActivityEventType)
    : null;
}

export function parseActivityGroup(value: unknown): ActivityGroup | null {
  if (typeof value !== "string") return null;
  return (ACTIVITY_GROUPS as readonly string[]).includes(value)
    ? (value as ActivityGroup)
    : null;
}
