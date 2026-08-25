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
 * All relationship profiles for the caller's org, keyed by
 * identity_key — the same key the network aggregator folds people on,
 * so the overlay joins without a second identity rule.
 */
export async function loadRelationshipProfiles(): Promise<
  Map<string, RelationshipProfile>
> {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("network_profiles")
    .select(
      "id, identity_key, display_name, relationship_state, dnc, dnc_reason, dnc_set_at, dnc_set_by, disposition, follow_up_at, follow_up_note, last_meaningful_contact_at, updated_at"
    );
  const map = new Map<string, RelationshipProfile>();
  for (const row of (data ?? []) as RelationshipProfile[]) {
    map.set(row.identity_key, row);
  }
  return map;
}
