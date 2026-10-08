/**
 * The legal document registry.
 *
 * ## What this file is for
 *
 * Five legal documents exist as review drafts in `docs/legal/drafts/`.
 * None has been seen by a lawyer, and none may be published, linked,
 * attached to a proposal or signed. The product meanwhile has no legal
 * page of any kind, which is its own problem: it processes candidate
 * personal data obtained without the candidate's involvement and the
 * footer links to `/handbook`, `/request-access` and `/status`.
 *
 * So the route, the layout and the publication gate are built here and
 * now, and the CONTENT is not. When counsel signs off, publishing is
 * filling in `body` and setting `review`. Nothing else has to be
 * designed under time pressure on the day a client asks.
 *
 * ## The gate is structural, not a convention
 *
 * A document is publishable only if it carries a `review` block naming
 * a reviewer and a date. There is no boolean to flip by accident and
 * no "publish anyway" escape hatch, because the failure being guarded
 * against is someone pasting a draft in to unblock a deal.
 *
 * `legal-gate.test.ts` fails the build if a document is published
 * without a review record, if a body contains a draft marker, or if
 * any of the standing factual prohibitions below appear in a body.
 *
 * ## Two standing prohibitions, carried forward deliberately
 *
 * 1. **No zero-data-retention claim.** Mandate holds no ZDR agreement
 *    with its AI provider. Excluding retention-mandated models is not
 *    evidence of ZDR and must never be described as such.
 *
 * 2. **Training and retention are two facts, never one sentence.**
 *    Content is not used to train (verified; Mandate has not opted in)
 *    AND content is retained up to 30 days, longer if flagged. Writing
 *    them as a single reassurance — "not used for training and not
 *    retained" — is false. Annex G carries the corrected wording.
 */

export type LegalSlug =
  | "terms"
  | "privacy"
  | "candidate-privacy"
  | "dpa"
  | "subprocessors";

export type LegalDocument = {
  readonly slug: LegalSlug;
  readonly title: string;
  /** One line under the title. Shown whether or not the doc is live. */
  readonly summary: string;
  /** Where the unreviewed draft lives, for whoever has to finish this. */
  readonly draftPath: string;
  /**
   * Present ONLY when a qualified reviewer has signed the content off.
   * Its absence is what keeps the page unpublished — there is no
   * separate flag, so a document cannot be published by editing one
   * boolean.
   */
  readonly review?: {
    readonly reviewedBy: string;
    /** ISO date. */
    readonly reviewedAt: string;
    /** What was reviewed — a version, a commit, a file hash. */
    readonly reference: string;
  };
  /** Markdown. Rendered only alongside a `review`. */
  readonly body?: string;
  /** Why it is not live yet, shown on the placeholder. */
  readonly blockedBy?: string;
};

export const LEGAL_DOCUMENTS: readonly LegalDocument[] = [
  {
    slug: "terms",
    title: "Subscription Terms",
    summary: "The agreement covering access to and use of Mandate.",
    draftPath: "docs/legal/drafts/01-terms-of-service.DRAFT.md",
    blockedBy:
      "Awaiting qualified legal review. The draft also carries unresolved founder decisions on liability, term and termination.",
  },
  {
    slug: "privacy",
    title: "Privacy Notice",
    summary:
      "How Mandate handles personal data of customers and website visitors.",
    draftPath: "docs/legal/drafts/02-privacy-notice-customers.DRAFT.md",
    blockedBy: "Awaiting qualified legal review.",
  },
  {
    slug: "candidate-privacy",
    title: "Candidate Privacy Notice",
    summary:
      "For candidates whose information is processed in a client's search.",
    draftPath: "docs/legal/drafts/03-privacy-notice-candidates.DRAFT.md",
    blockedBy:
      "Awaiting qualified legal review. This is the notice that matters most — it addresses people who never chose to deal with Mandate — and retention is still undecided, so the draft cannot yet state how long data is kept.",
  },
  {
    slug: "dpa",
    title: "Data Processing Addendum",
    summary: "Processor terms for customers who need them.",
    draftPath: "docs/legal/drafts/04-data-processing-addendum.DRAFT.md",
    blockedBy:
      "Awaiting qualified legal review. The breach-notification clause is deliberately blank: a notification window cannot be committed to until the incident runbook's owner and contact fields are filled in.",
  },
  {
    slug: "subprocessors",
    title: "Subprocessors",
    summary: "Third parties that process data on Mandate's behalf.",
    draftPath: "docs/legal/drafts/05-subprocessors.DRAFT.md",
    blockedBy:
      "Cannot be published while two production credentials remain unexplained. A subprocessor list that omits a live integration is worse than none, because it is relied upon.",
  },
];

/** Published means reviewed AND written. Both, or neither. */
export function isPublished(
  doc: LegalDocument
): doc is LegalDocument & { review: NonNullable<LegalDocument["review"]>; body: string } {
  return Boolean(doc.review && doc.body && doc.body.trim().length > 0);
}

export function legalDocument(slug: string): LegalDocument | undefined {
  return LEGAL_DOCUMENTS.find((d) => d.slug === slug);
}

/**
 * Phrases that must never appear in published legal copy, with the
 * reason attached so a future editor can see what the rule protects
 * rather than guessing. Matched case-insensitively against the body.
 */
export const PROHIBITED_PHRASES: ReadonlyArray<{
  readonly pattern: RegExp;
  readonly why: string;
}> = [
  {
    pattern: /zero[- ]data[- ]retention|\bZDR\b/i,
    why: "Mandate holds no zero-data-retention agreement with its AI provider. Excluding retention-mandated models is not evidence of one.",
  },
  {
    pattern: /not (?:used for training|retained)[^.]{0,80}\band\b[^.]{0,80}(?:not retained|not used for training)/i,
    why: "Training and retention are two separate facts. Content is not used for training AND is retained up to 30 days (longer if flagged). Stating them as one reassurance is false.",
  },
  {
    pattern: /\bwe (?:do not|don't) (?:store|keep|retain) (?:any )?(?:candidate )?data\b/i,
    why: "Mandate retains data for as long as the account exists. There is no automatic deletion anywhere in the product.",
  },
  {
    pattern: /\b(?:ISO ?27001|SOC ?2|HIPAA|PCI[- ]DSS)\b/i,
    why: "No certification or audit has been obtained. Naming a framework in legal copy reads as a claim to hold it.",
  },
  {
    pattern: /\bguarantee(?:d|s)? (?:uptime|availability)\b|\b99\.\d+% (?:uptime|availability)\b/i,
    why: "No plan provides an uptime SLA and nothing in the product measures availability.",
  },
];
