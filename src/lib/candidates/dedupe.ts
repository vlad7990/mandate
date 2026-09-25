/**
 * CV dedupe — deciding whether a file we are about to read, or a person we
 * have just read, is already in this mandate.
 *
 * Gate: docs/superpowers/specs/2026-09-25-cv-dedupe-gate.md (CONFIRMED).
 *
 * ## The ordering problem this module is shaped by
 *
 * Identity is only known AFTER the parse. So a check that runs before the
 * money is spent can match on the file's bytes and nothing else, and a check
 * that can match on the person has already paid for the parse. There is no
 * third position, and a design that claims one is asserting an identity it
 * has not established — §175's defect class, which is exactly why the
 * sourcing importer has `ambiguous`.
 *
 * The ruled answer (D1) is both, layered:
 *
 *   1. `sha256Hex` over the bytes, before the row exists. Two byte-identical
 *      files are CERTAINLY the same document, and a document names one
 *      person. Free, exact, and it catches the case the founder actually
 *      described — twenty copies of one file in one drag.
 *   2. `classifyAgainstMandate` over `identityKey`, once the parser has
 *      written a real name and email. Catches the same person as a different
 *      file — their CV v2, their DOCX beside their PDF — which no amount of
 *      hashing ever will.
 *
 * ## Document identity is deliberately NOT person identity
 *
 * `sha256Hex` answers "is this the same file". `identityKey`
 * (`@/lib/candidate-identity`, transcribed into SQL twice — migrations 040
 * and 073) answers "is this the same human". They are different questions
 * with different certainties, and this module never lets one stand in for
 * the other. Nothing here changes the person-identity precedence, so the
 * twin-transcription warning on that module is not triggered by this file.
 *
 * ## Nothing here does I/O
 *
 * Same discipline as `lib/sourcing/import.ts`: the caller supplies the pool,
 * this decides. `sha256Hex` uses Web Crypto so the bulk-intake form can hash
 * in the browser to skip repeats inside one batch — but a client-computed
 * hash is never sent anywhere and never trusted. The server hashes the bytes
 * it received, itself.
 */

import {
  identityKey,
  identityStrength,
  type IdentityFields,
} from "@/lib/candidate-identity";

/** A candidate already in the pool, as the checks need to see them. */
export type PoolCandidate = IdentityFields & {
  id: string;
  project_id: string | null;
  pipeline_stage: string | null;
};

/**
 * SHA-256 of a file's bytes, lowercase hex.
 *
 * Web Crypto rather than node:crypto so the same function runs in the
 * browser (in-batch skipping) and on the server (the authoritative check).
 * `crypto.subtle` needs a secure context; production is HTTPS and localhost
 * qualifies, so the browser half never silently degrades — it throws, and
 * the caller treats a throw as "cannot skip", never as "not a duplicate".
 */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  // A fresh ArrayBuffer: a Uint8Array over a larger pooled buffer (which is
  // what Buffer.from and some File reads produce) would otherwise hash the
  // whole pool and give two identical files two different hashes.
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", copy);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ---------------------------------------------------------------------------
// Before the parse — the file
// ---------------------------------------------------------------------------

export type FileMatch =
  /** No row in the org carries these bytes. Parse it. */
  | { kind: "none" }
  /** The same file is already in the mandate being uploaded to. Refuse. */
  | { kind: "same_mandate"; candidateId: string; label: string }
  /**
   * The same file is in a DIFFERENT mandate. D4: reported, never refused —
   * a person legitimately sits in two searches (§200 built that path on
   * purpose), and refusing would save nothing anyway, because reuse re-parses
   * against the target's calibration regardless.
   */
  | { kind: "other_mandate"; candidateId: string; label: string };

/**
 * Match a file's hash against the pool.
 *
 * `pool` is every candidate in the ORG carrying this hash — the caller's
 * query is indexed on (organization_id, cv_sha256) and scoped to the org,
 * never global (§195's baseline discipline).
 *
 * A row in the target mandate wins over a row elsewhere: the refusal is the
 * more useful answer and it is the one that saves the parse.
 */
export function matchFile(
  targetProjectId: string,
  pool: readonly PoolCandidate[]
): FileMatch {
  const here = pool.find((c) => c.project_id === targetProjectId);
  if (here) {
    return { kind: "same_mandate", candidateId: here.id, label: here.full_name };
  }
  const elsewhere = pool[0];
  if (elsewhere) {
    return {
      kind: "other_mandate",
      candidateId: elsewhere.id,
      label: elsewhere.full_name,
    };
  }
  return { kind: "none" };
}

// ---------------------------------------------------------------------------
// After the parse — the person
// ---------------------------------------------------------------------------

/**
 * The verdict vocabulary is the sourcing importer's, deliberately.
 *
 * `duplicate` is a STRONG match — email or LinkedIn, identifiers that are
 * effectively unique. `ambiguous` matched only on name|company, which
 * collides for common names at large employers; the importer already rules
 * that a human decides, and two screens giving that collision two different
 * answers would be worse than either answer.
 */
export type PersonMatch =
  | { kind: "none" }
  | {
      kind: "duplicate";
      candidateId: string;
      label: string;
      matchedOn: "email" | "linkedin";
      stage: string | null;
    }
  | { kind: "ambiguous"; candidateId: string; label: string };

/**
 * The three views of a row, all derived from the ONE shared rule rather
 * than transcribed. Masking a field and re-asking `identityKey` makes it
 * answer the narrower question, so the precedence stays in one place.
 */
function emailKey(row: IdentityFields): string | null {
  return identityStrength(row) === "email"
    ? identityKey({ ...row, linkedin_url: null })
    : null;
}

function linkedinKey(row: IdentityFields): string | null {
  const masked = { ...row, email: null };
  return identityStrength(masked) === "linkedin" ? identityKey(masked) : null;
}

function nameKey(row: IdentityFields): string {
  return identityKey({ ...row, email: null, linkedin_url: null });
}

/**
 * Two rows CONTRADICT when they carry the same kind of strong identifier
 * and the identifiers differ. Two different email addresses is positive
 * evidence of two different people, and it outranks a shared name.
 */
function contradicts(a: IdentityFields, b: IdentityFields): boolean {
  const ae = emailKey(a);
  const be = emailKey(b);
  if (ae && be && ae !== be) return true;
  const al = linkedinKey(a);
  const bl = linkedinKey(b);
  if (al && bl && al !== bl) return true;
  return false;
}

/**
 * Classify a freshly-parsed candidate against the others in ITS OWN mandate.
 *
 * Mandate-scoped because a candidate row belongs to one `project_id`: the
 * same person in two mandates is two rows by design, so "duplicate" can only
 * mean "twice in the same search". The caller excludes the subject's own row
 * — passing it in would make every candidate a duplicate of itself.
 *
 * ## Two passes, and only the first one may delete anything
 *
 * **Strong:** the full `identityKey` matches on email or LinkedIn. That is
 * the same human, and D2 acts on it.
 *
 * **Weak:** the keys do NOT match, but the names and employers do, and
 * neither row carries a strong identifier that contradicts the other. This
 * is the case a plain key comparison misses and recruiters hit constantly —
 * a CV with no contact details, then a later CV of the same person with an
 * email on it. The keys are `name:…` and `email:…`, which are not equal, so
 * a strict comparison sees two strangers.
 *
 * The weak pass can only ever return `ambiguous`. It never returns
 * `duplicate` and therefore can never cause a deletion: the evidence is a
 * shared name at a shared employer, which is exactly the evidence D3 ruled
 * a human must weigh. Widening the FLAG is safe; widening the DISCARD would
 * be §175's defect with a delete button on it.
 *
 * A subject with no identity at all beyond a filename still returns `none`
 * against rows with real identities, because `nameKey` will not match one.
 */
export function classifyAgainstMandate(
  subject: IdentityFields,
  others: readonly PoolCandidate[]
): PersonMatch {
  const strength = identityStrength(subject);
  const key = identityKey(subject);

  const strong = others.find((c) => identityKey(c) === key);
  if (strong) {
    // Name-only with no company is `name:jane doe|` — a key that matches
    // every other company-less row with that name, on the thinnest evidence
    // the precedence has. D3 sends it to a human rather than acting on it.
    if (strength === "name") {
      return {
        kind: "ambiguous",
        candidateId: strong.id,
        label: strong.full_name,
      };
    }
    return {
      kind: "duplicate",
      candidateId: strong.id,
      label: strong.full_name,
      matchedOn: strength,
      stage: strong.pipeline_stage,
    };
  }

  const subjectName = nameKey(subject);
  const weak = others.find(
    (c) => nameKey(c) === subjectName && !contradicts(subject, c)
  );
  if (weak) {
    return { kind: "ambiguous", candidateId: weak.id, label: weak.full_name };
  }

  return { kind: "none" };
}

// ---------------------------------------------------------------------------
// What the recruiter is told
// ---------------------------------------------------------------------------

/**
 * Every outcome the upload action can return.
 *
 * `candidateId` is always the row that now represents this person in this
 * mandate — the new one when a parse stood, the SURVIVING one when a
 * duplicate was discarded or a file was skipped. The single-file form
 * navigates to it, so the recruiter lands on the real record either way
 * rather than on a 404 for a row that was just deleted.
 */
export type UploadOutcome =
  | "parsed"
  /** Byte-identical file already in this mandate. Nothing was spent. */
  | "same_file_skipped"
  /** Parsed, then found to be someone already here. The new row was removed. */
  | "duplicate_discarded";

export type UploadReport = {
  outcome: UploadOutcome;
  /** The authored sentence, or null when there is nothing to say. */
  message: string | null;
  /** D3's flag: parsed and kept, but a human should look. */
  ambiguousOf: { candidateId: string; label: string } | null;
};

/**
 * The sentences, in one place so both upload forms say the same thing and a
 * test can assert the words rather than a paraphrase of them.
 *
 * The discard sentence states BOTH halves — which row survived, and that the
 * file just uploaded was not kept. Dropping a document the recruiter chose
 * and not saying so is the kind of silence this product does not do.
 */
export function describeSkippedFile(label: string): string {
  return `That is the same file as ${label}, already in this mandate. Nothing was uploaded and no parse was run.`;
}

export function describeDiscard(
  label: string,
  matchedOn: "email" | "linkedin",
  stage: string | null
): string {
  const on = matchedOn === "email" ? "the same email address" : "the same LinkedIn profile";
  const where = stage ? `, at stage "${stage}"` : "";
  return `${label} is already in this mandate${where} — matched on ${on}. The CV you just uploaded was NOT kept; the existing record stands unchanged.`;
}

/**
 * The wording is careful about WHAT MATCHED, because the weak pass can flag
 * a pair where one side does carry an email — "neither has an email" would
 * be a false statement in exactly the case this flag is most useful.
 */
export function describeAmbiguous(label: string): string {
  return `Kept, and flagged: ${label} is in this mandate under the same name and employer, and nothing stronger connects them — no shared email address, no shared LinkedIn profile. That may be two records of one person, or two people who share a name. Nothing has been merged and nothing has been deleted.`;
}

export function describeOtherMandate(label: string): string {
  return `Note: this exact file is also in another mandate, as ${label}. Parsed anyway — the same person in two searches is two records, scored against each role separately.`;
}
