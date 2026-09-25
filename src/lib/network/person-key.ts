import { identityKey, type IdentityFields } from "@/lib/candidate-identity";

// §204 — one question, asked of rows that ALREADY EXIST: "which person is
// this row?"
//
// The product holds two answers to "are these the same person?", and they
// are not interchangeable:
//
//   identityKey(row)            -> who is this INCOMING thing?
//   row.network_profile_id      -> who is this EXISTING row?
//
// Only the second moves when a merge happens (§203 repoints the FK; nothing
// can change what a row's own fields compute to). So every check about rows
// already in the database reads the FK — and every check that runs BEFORE a
// row exists must keep computing the key, because there is no profile to
// read yet. That second family is §201's dedupe-before-insert, the sourcing
// importer and `cv_sha256`; none of them may use this module.
//
// The fallback: `network_profile_id` is NULL by design while a CV is still
// being read and the only identity signal is a name (§196/139 — "that is
// not an identity, it is a filename"). Such a row still has to answer
// "already on this mandate?", so it falls back to its computed key. The
// `key:` prefix keeps the two namespaces from ever colliding on a value.

export type PersonKeyRow = IdentityFields & {
  network_profile_id?: string | null;
};

/**
 * The stable identifier for the PERSON behind an existing candidate row:
 * their `network_profile_id` when they have one, else their computed
 * identity key. Comparable only against other values from this function.
 */
export function personKey(row: PersonKeyRow): string {
  const profileId = (row.network_profile_id ?? "").trim();
  if (profileId) return profileId;
  return `key:${identityKey(row)}`;
}
