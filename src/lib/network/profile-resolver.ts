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
 * One standing reason a person is not to be contacted (§208's ledger).
 *
 * D3 — a person suppressed twice is a person who said no twice, so the card
 * lists every unlifted row. The profile's four derived `dnc_*` columns carry
 * only the GOVERNING one (the earliest), which is what the badge shows.
 */
export type SuppressionRecord = {
  id: string;
  profile_id: string;
  reason: string;
  source: "recruiter" | "withdrawal" | "erasure" | "carried";
  set_at: string;
  /** NULL = the system set it (a portal withdrawal or erasure). */
  set_by: string | null;
  /** The row this was copied from on a merge or a repoint, if any. */
  carried_from: string | null;
  /** The setter's name, when the viewer may read it. See the card. */
  set_by_name: string | null;
};

type SuppressionRowShape = Omit<SuppressionRecord, "set_by_name"> & {
  setter: { full_name: string | null } | null;
};

/**
 * Every UNLIFTED suppression for the given people, keyed by profile id and
 * **ordered exactly as `refresh_network_suppression` orders them** — earliest
 * `set_at` first, `id` breaking a tie — so the first entry in each list is the
 * governing row the derived `dnc_reason` was stamped from. Two orderings of
 * the same fact on one screen is §175's class; there is one ordering, here.
 *
 * Reads are org-scoped by `org_network_suppressions_read`; the ledger has no
 * INSERT or UPDATE policy at all, so this is the only way the app touches it.
 */
export async function loadSuppressionLedger(
  profileIds: readonly string[]
): Promise<Map<string, SuppressionRecord[]>> {
  const map = new Map<string, SuppressionRecord[]>();
  // Nothing on screen is nothing to ask for — and `.in()` with an empty list
  // would be a round trip to learn that.
  if (profileIds.length === 0) return map;

  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("network_suppressions")
    // NAME THE FK: `set_by` and `lifted_by` both point at `users`, so a bare
    // embed is ambiguous and PostgREST answers 300, not rows. (Standing
    // lesson from the placements defect — the composite-FK version of this
    // shipped to production once already.)
    .select(
      "id, profile_id, reason, source, set_at, set_by, carried_from, setter:users!network_suppressions_set_by_fkey(full_name)"
    )
    .in("profile_id", profileIds as string[])
    .is("lifted_at", null)
    .order("set_at", { ascending: true })
    .order("id", { ascending: true });

  for (const row of (data ?? []) as unknown as SuppressionRowShape[]) {
    const list = map.get(row.profile_id) ?? [];
    list.push({
      id: row.id,
      profile_id: row.profile_id,
      reason: row.reason,
      source: row.source,
      set_at: row.set_at,
      set_by: row.set_by,
      carried_from: row.carried_from,
      set_by_name: row.setter?.full_name ?? null,
    });
    map.set(row.profile_id, list);
  }
  return map;
}

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
