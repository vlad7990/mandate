import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase-server";

// The read side of the durable person (098). The WRITE side — find-or-
// create and re-link — lives in the database (`resolve_network_profile`
// + the BEFORE trigger on candidates), where every birth path passes;
// this module only LOOKS UP what the trigger maintains, for surfaces
// that fold candidates into people at render time.

export type RelationshipProfile = {
  id: string;
  identity_key: string;
  display_name: string;
  relationship_state: string;
  dnc: boolean;
  dnc_reason: string | null;
  dnc_set_at: string | null;
  /** NULL while dnc is set = the system (erasure/withdrawal) set it. */
  dnc_set_by: string | null;
  disposition: Record<string, unknown>;
  follow_up_at: string | null;
  follow_up_note: string | null;
  last_meaningful_contact_at: string | null;
  updated_at: string;
};

/**
 * All relationship profiles for the caller's org, keyed by **profile id** —
 * the same thing the network aggregator folds people on, so the overlay
 * joins on a real database id and no identity rule runs at render time.
 *
 * §204 — this map used to be keyed on `identity_key`, and after §203's merge
 * that silently stopped matching: the loser's profile is DELETED and its key
 * survives only in `network_profile_aliases`, which nothing here reads. The
 * merged person's second row therefore found no profile, and a missing
 * profile renders exactly like an unsuppressed contact. Proven live, on a
 * suppressed person: `overlay rows found for that key: 0`.
 */
export async function loadRelationshipProfiles(
  /**
   * §205 — the profiles for the people ON SCREEN. Omit for every profile in
   * the org, which the merge panel needs and the table no longer does: once
   * the table pages, fetching the whole org's relationships to decorate 25
   * rows is the same mistake the fold itself just stopped making.
   */
  profileIds?: readonly string[]
): Promise<Map<string, RelationshipProfile>> {
  const supabase = await createServerSupabaseClient();
  let query = supabase
    .from("network_profiles")
    .select(
      "id, identity_key, display_name, relationship_state, dnc, dnc_reason, dnc_set_at, dnc_set_by, disposition, follow_up_at, follow_up_note, last_meaningful_contact_at, updated_at"
    );
  if (profileIds) {
    // An empty page must fetch NOTHING, not everything — `.in()` with an
    // empty list is the honest expression of that.
    query = query.in("id", profileIds as string[]);
  }
  const { data } = await query;
  const map = new Map<string, RelationshipProfile>();
  for (const row of (data ?? []) as RelationshipProfile[]) {
    map.set(row.id, row);
  }
  return map;
}
