// Person identity — the single rule for deciding whether two records describe
// the same human.
//
// Extracted from network-aggregator.ts, which owned it privately.
//
// §204 — WHAT THIS IS STILL FOR, and what it is no longer for. This rule
// answers "who is this INCOMING thing?" — the sourcing importer, §201's
// dedupe-before-insert, the erasure lookup — every question asked before a
// row, and therefore a `network_profiles` row, exists.
//
// It is NOT how the product decides which EXISTING rows are one person any
// more. That is `network_profile_id` (see lib/network/person-key.ts): a
// merge (§203) repoints the FK and cannot change what a row's own fields
// compute to, so the Network page, the sidebar badge and "already on this
// mandate" all read the column, not this function.
//
// ⚠️ `candidate_identity_key` (migration 073) transcribes this precedence
// into SQL, and the resolver that mints people uses it. Change one, change
// both, in the same commit. `count_network_people` no longer transcribes it
// at all (migration 144) — it counts people by their profile id.

export type IdentityFields = {
  full_name: string;
  email: string | null;
  linkedin_url: string | null;
  current_company: string | null;
};

/**
 * Stable key for a person. Precedence is email → linkedin → name|company,
 * strongest identifier first: an email is effectively unique, a profile URL
 * nearly so, and name+company is a heuristic that collides for common names at
 * large employers — which is why the sourcing importer treats a name-only
 * match as `ambiguous` rather than `duplicate`.
 */
export function identityKey(row: IdentityFields): string {
  if (row.email && row.email.trim().length > 0) {
    return `email:${row.email.trim().toLowerCase()}`;
  }
  if (row.linkedin_url && row.linkedin_url.trim().length > 0) {
    return `linkedin:${row.linkedin_url.trim().toLowerCase().replace(/\/$/, "")}`;
  }
  return `name:${row.full_name.trim().toLowerCase()}|${(row.current_company ?? "")
    .trim()
    .toLowerCase()}`;
}

/** Which identifier `identityKey` actually used. The importer needs this to
 * tell a strong match from a weak one. */
export function identityStrength(
  row: IdentityFields
): "email" | "linkedin" | "name" {
  if (row.email && row.email.trim().length > 0) return "email";
  if (row.linkedin_url && row.linkedin_url.trim().length > 0) return "linkedin";
  return "name";
}
