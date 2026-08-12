// Person identity — the single rule for deciding whether two records describe
// the same human.
//
// Extracted from network-aggregator.ts, which owned it privately. It now has
// three consumers — the Network page's dedupe, the sidebar badge count
// (mirrored in SQL by `count_network_people`, migration 040), and sourcing
// import dedupe — and three implementations of person identity would drift
// apart silently, producing a different answer on each screen.
//
// ⚠️ Migration 040 transcribes this precedence into SQL. Change one, change
// both, in the same commit.

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
