/**
 * Whose answer wins about who a person is — G.1 and G.2, ruled in the
 * QA gate after §192.
 *
 * This lives apart from `agent-parser.ts` on purpose: that module is
 * `server-only` and holds a session, a model call and three writes, none
 * of which a test can reach. The DECISION is none of those things — it
 * is a pure function of four strings, so it is one here, and the guard
 * that protects it asserts behaviour instead of source text.
 *
 * ## The rule
 *
 * A CV is evidence about a person. It is not the person. When someone
 * has told us their own name and address — which happens on exactly one
 * path, the apply door, under the Art.13 notice printed on the form —
 * their answer is the one we keep, and the file does not get to
 * overwrite it. §192 found the alternative running in production: an
 * applicant typed one identity, the parser stored another, and because
 * `candidate_identity_key` keys on email, the row was silently re-linked
 * to a different person's relationship record — the one the
 * do-not-contact gate reads.
 *
 * A recruiter upload has no declared identity to defend. Nobody told us
 * anything; the file is the only identity there is, and reading it is
 * the entire point of the upload. So `declared: null` keeps the old
 * behaviour exactly.
 *
 * ## What happens to the CV's claim
 *
 * Nothing. It is kept verbatim in `cv_structured`, and a disagreement is
 * reported rather than resolved — `identityConflict` is how the trail
 * and the recruiter find out that the file and the person disagree. The
 * system does not know which of the two is current. It knows whose
 * answer it kept, and that is what it says.
 */

/** The identity a subject declared about themselves. */
export type DeclaredIdentity = { fullName: string; email: string | null };

export type ResolvedIdentity = {
  /** The name that lands on the row. */
  fullName: string;
  /** The address that lands on the row. */
  email: string | null;
  /** Did the persisted name move? Reads off what was WRITTEN, never off
   *  the CV's claim — when a declared identity wins, nothing moved. */
  identityChanged: boolean;
  /** Did a subject declare their own identity on this path? */
  identityDeclared: boolean;
  /** Did the file disagree with the person about who they are? */
  identityConflict: boolean;
};

/** Compare identities the way a person would — case and padding are not
 *  disagreements. Returns "" for absent, so a missing side never counts
 *  as a conflict: silence is not contradiction. */
function norm(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export function resolveParsedIdentity(args: {
  /** What the CV claimed. */
  parsedName: string | null | undefined;
  parsedEmail: string | null | undefined;
  /** What the row carried before the parse — a filename fallback on an
   *  upload, the typed name on an apply. */
  priorName: string | null | undefined;
  /** What the subject said about themselves, or null if nobody asked. */
  declared: DeclaredIdentity | null | undefined;
}): ResolvedIdentity {
  const declared = args.declared ?? null;
  const prior = args.priorName ?? null;

  const identityConflict =
    declared !== null &&
    (norm(args.parsedName) !== norm(declared.fullName) ||
      // Both sides must actually hold an address before they can
      // disagree about one.
      (!!norm(args.parsedEmail) &&
        !!norm(declared.email) &&
        norm(args.parsedEmail) !== norm(declared.email)));

  const fullName = declared
    ? declared.fullName
    : args.parsedName || prior || "Untitled candidate";

  return {
    fullName,
    email: declared ? declared.email : (args.parsedEmail ?? null),
    identityChanged: fullName !== prior,
    identityDeclared: declared !== null,
    identityConflict,
  };
}
