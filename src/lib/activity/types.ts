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
  "member_org_changed",

  "shortlist_published",
  "report_exported",
  "hm_portal_opened",

  "mandate_reassigned",

  // 067–073: the External Identity programme — invitations, shares,
  // grants and the candidate portal, all written by triggers and
  // SECURITY DEFINER functions on the client side of the boundary.
  // (107's rider: these were live in the CHECK long before this
  // mirror caught up — the feed rendered them as raw slugs.)
  "external_invited",
  "external_invitation_revoked",
  "external_invitation_resent",
  "external_joined",
  "external_role_changed",
  "external_status_changed",
  "mandate_shared",
  "mandate_unshared",
  "external_access_granted",
  "external_access_revoked",
  "candidate_portal_link_issued",
  "candidate_portal_link_revoked",
  "candidate_self_updated",
  "candidate_withdrew",
  "candidate_erasure_requested",
  "candidate_cv_submitted",

  // 102: Skills Studio's five human acts — the one control surface
  // that changes every agent's behaviour writes its own record.
  // Admin-gated inside `record_activity_event`.
  "skill_created",
  "skill_updated",
  "skill_paused",
  "skill_activated",
  "skill_deleted",

  // 104: a recruiter moving a candidate through the pipeline — the
  // detail carries stages only ({from, to}), never free text. Gated
  // inside `record_activity_event` on can_write_candidates().
  "candidate_stage_changed",

  // 106: the task domain. Assigning is the desk's act (gated
  // can_manage_desk inside the RPC); completing rides the actor
  // stamp — the RLS pin already proved the right. Labels snapshot
  // at write time; titles are operational, never judgments.
  "task_assigned",
  "task_completed",

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
  "intake_analyzed",
  "health_suggested",
  "weekly_report_generated",
  // 091–101: the later agent principals, in door order (107's rider —
  // same catch-up as the external block above).
  "calibration_derived",
  "job_spec_generated",
  "shortlist_report_generated",
  "copilot_answered",
  "success_profile_generated",
  "interview_plan_generated",
  "executive_context_researched",
  "candidate_search_answered",
  "sourcing_search_executed",
  "outreach_strategy_drafted",
  "relationship_updated",
  "network_dnc_set",
  "network_dnc_cleared",
  "engagement_updated",
  "prescreen_updated",

  // 107: the OKR domain's two human acts. Okr-writer-gated inside
  // `record_activity_event`; the detail carries titles, scopes and
  // outcomes — never amounts (the financial rows are fees-tier and
  // the trail is org-visible).
  "objective_created",
  "objective_closed",

  // 116: the mainstream interview-plan lifecycle's three HUMAN acts,
  // mandate-writer-gated inside the RPC. The agent's own act reuses
  // `interview_plan_generated` above (EI's since 037) with
  // detail.agent_kind telling the two principals apart.
  "interview_plan_generation_requested",
  "interview_plan_generation_failed",
  "interview_plan_approved",
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
  // 102 — the Skills Studio's five human acts. Admin-gated INSIDE the
  // RPC: only the role that can change a skill can claim to have
  // changed one. The detail carries the skill's name, type and scope —
  // never the instructions' text.
  "skill_created",
  "skill_updated",
  "skill_paused",
  "skill_activated",
  "skill_deleted",
  // 104 — the pipeline move (dropdown or board drag). Writer-gated
  // inside the RPC on can_write_candidates().
  "candidate_stage_changed",
  // 106 — the task domain: desk-gated assignment, actor-stamped
  // completion.
  "task_assigned",
  "task_completed",
  // 107 — the OKR domain: both okr-writer-gated inside the RPC.
  "objective_created",
  "objective_closed",
  // 116 — the interview-plan lifecycle: all three mandate-writer-gated
  // inside the RPC.
  "interview_plan_generation_requested",
  "interview_plan_generation_failed",
  "interview_plan_approved",
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
  member_org_changed: "members",

  external_invited: "client",
  external_invitation_revoked: "client",
  external_invitation_resent: "client",
  external_joined: "client",
  external_role_changed: "client",
  external_status_changed: "client",
  mandate_shared: "client",
  mandate_unshared: "client",
  external_access_granted: "client",
  external_access_revoked: "client",
  candidate_portal_link_issued: "client",
  candidate_portal_link_revoked: "client",
  candidate_self_updated: "client",
  // A withdrawal moves the pipeline, so it files with the search.
  candidate_withdrew: "mandates",
  candidate_erasure_requested: "client",
  candidate_cv_submitted: "client",

  shortlist_published: "client",
  report_exported: "client",
  hm_portal_opened: "client",

  mandate_reassigned: "mandates",

  // Skills change how every search scores — they file under mandates.
  skill_created: "mandates",
  skill_updated: "mandates",
  skill_paused: "mandates",
  skill_activated: "mandates",
  skill_deleted: "mandates",

  candidate_stage_changed: "mandates",

  task_assigned: "mandates",
  task_completed: "mandates",

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
  intake_analyzed: "mandates",
  health_suggested: "mandates",
  weekly_report_generated: "mandates",

  calibration_derived: "mandates",
  job_spec_generated: "mandates",
  shortlist_report_generated: "mandates",
  copilot_answered: "mandates",
  success_profile_generated: "mandates",
  interview_plan_generated: "mandates",
  executive_context_researched: "mandates",
  candidate_search_answered: "mandates",
  sourcing_search_executed: "mandates",
  outreach_strategy_drafted: "mandates",
  relationship_updated: "mandates",
  network_dnc_set: "mandates",
  network_dnc_cleared: "mandates",
  engagement_updated: "mandates",
  prescreen_updated: "mandates",

  objective_created: "mandates",
  objective_closed: "mandates",

  interview_plan_generation_requested: "mandates",
  interview_plan_generation_failed: "mandates",
  interview_plan_approved: "mandates",
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
