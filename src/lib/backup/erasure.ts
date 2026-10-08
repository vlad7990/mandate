import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BACKED_UP_BUCKETS } from "./types";

/**
 * Requirement 8 — safeguards against silently resurrecting erased
 * candidate data.
 *
 * This is the requirement with a regulator attached, and the one a
 * backup system is most likely to get wrong, because the wrongness is
 * invisible until a restore happens months later.
 *
 * The failure it prevents, concretely: a candidate asks to be erased on
 * day 10. The recruiter honours it. On day 40 the database is restored
 * from a day-5 backup — and the candidate is back, along with their CV,
 * because a backup taken before the request knew nothing about it. The
 * agency has now re-collected data it was asked to delete, from its own
 * disaster recovery.
 *
 * Two halves, and BOTH are needed:
 *
 *   1. Objects belonging to a suppressed person are never copied again
 *      (`planBackup` honours the set this module returns).
 *   2. Objects already in the backup are PRUNED — deleted at the
 *      destination, removed from the manifest, and their key recorded in
 *      `manifest.suppressedKeys` so a restore can see the removal was
 *      deliberate rather than a gap (`pruneSuppressed`).
 *
 * ## What counts as suppressed
 *
 * The product's suppression ledger is the authority (migrations 151-157).
 * An active row in `network_suppressions` — one with no `lifted_at` —
 * means do-not-contact for that person, and migration 153 makes it
 * contagious across merges and never silently lowered. That is the
 * strongest existing signal and the one this module reads.
 *
 * ## What this module deliberately does NOT do
 *
 * It does not decide what erasure means, it does not delete anything in
 * the live database, and it does not touch the `candidate_erasure_requests`
 * workflow. Those are product and legal decisions (legal items L4/L5,
 * still open). This module's only job is to make sure the BACKUP never
 * contradicts whatever the product decided.
 *
 * ## Conservative by design
 *
 * If the suppression read fails, the caller treats the run as failed
 * rather than proceeding with an empty set. An empty set would mean
 * "nobody is suppressed", which would re-copy objects this module exists
 * to remove — the one error here that is worse than not running at all.
 */

export class SuppressionReadError extends Error {}

export type SuppressedObjects = {
  /** `${bucket}/${key}` identifiers, matching the planner's index. */
  keys: Set<string>;
  /** How many people the set covers, for the report. No identities. */
  personCount: number;
};

/**
 * Derive the object keys that must not be backed up.
 *
 * `cv_url` holds a storage PATH within the `cvs` bucket (not a URL) and
 * `candidate_notes.audio_path` holds a path within `call-audio`, so both
 * map directly onto object keys.
 */
export async function loadSuppressedObjectKeys(
  service: SupabaseClient
): Promise<SuppressedObjects> {
  // 1. Active suppressions → the people involved.
  const { data: suppressions, error: supErr } = await service
    .from("network_suppressions")
    .select("profile_id")
    .is("lifted_at", null);

  if (supErr) {
    throw new SuppressionReadError(
      `Could not read the suppression ledger: ${supErr.message}. ` +
        "Refusing to run — an unread ledger would be treated as nobody being suppressed."
    );
  }

  const profileIds = [
    ...new Set((suppressions ?? []).map((r) => r.profile_id as string).filter(Boolean)),
  ];

  const keys = new Set<string>();
  if (profileIds.length === 0) {
    return { keys, personCount: 0 };
  }

  // 2. Their candidate records → CV object keys.
  const { data: candidates, error: candErr } = await service
    .from("candidates")
    .select("id, cv_url")
    .in("network_profile_id", profileIds);

  if (candErr) {
    throw new SuppressionReadError(
      `Could not resolve suppressed candidates: ${candErr.message}. Refusing to run.`
    );
  }

  const candidateIds: string[] = [];
  for (const row of candidates ?? []) {
    candidateIds.push(row.id as string);
    const cvPath = row.cv_url as string | null;
    if (cvPath) keys.add(`cvs/${stripLeadingSlash(cvPath)}`);
  }

  // 3. Their call notes → audio object keys.
  if (candidateIds.length > 0) {
    const { data: notes, error: noteErr } = await service
      .from("candidate_notes")
      .select("audio_path")
      .in("candidate_id", candidateIds)
      .not("audio_path", "is", null);

    if (noteErr) {
      throw new SuppressionReadError(
        `Could not resolve suppressed call audio: ${noteErr.message}. Refusing to run.`
      );
    }
    for (const row of notes ?? []) {
      const p = row.audio_path as string | null;
      if (p) keys.add(`call-audio/${stripLeadingSlash(p)}`);
    }
  }

  return { keys, personCount: profileIds.length };
}

function stripLeadingSlash(p: string): string {
  return p.replace(/^\/+/, "");
}

/**
 * A restore-side guard, and the reason requirement 8 says "silently".
 *
 * Even with pruning, a restore can reintroduce a person: the DATABASE
 * backup is a managed Supabase backup this module does not control, so
 * restoring it rolls candidate rows back to a point before an erasure.
 * The file backup will correctly lack their CV — but the row returns.
 *
 * So a restore must re-apply suppressions from the CURRENT ledger after
 * the database is restored, not trust the restored state. This function
 * returns the check an operator runs, and the runbook makes it a
 * mandatory step rather than advice.
 */
export function restoreSuppressionCheckSql(): string {
  return `
-- Run AFTER restoring the database, BEFORE reopening access.
-- Lists candidate rows that a restore has brought back despite an
-- active suppression. Expected result: zero rows.
--
-- A non-empty result is NOT a backup failure; it is the restore
-- reintroducing data the live system had suppressed, and it must be
-- re-suppressed before anyone can act on it.
select c.id            as candidate_id,
       c.network_profile_id,
       s.reason,
       s.set_at
  from public.candidates c
  join public.network_suppressions s
    on s.profile_id = c.network_profile_id
 where s.lifted_at is null
 order by s.set_at;
`.trim();
}

/** Buckets whose objects can belong to a person. `invoice-assets` holds
 * org logos, so it has no suppression dimension — stated explicitly so
 * the omission is a decision rather than an oversight. */
export const PERSON_BEARING_BUCKETS = BACKED_UP_BUCKETS.filter(
  (b) => b !== "invoice-assets"
);
