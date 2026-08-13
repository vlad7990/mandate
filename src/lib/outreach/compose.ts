// Composing outreach so the required notice cannot go missing.
//
// The recruiter writes their own message. The Art. 14 privacy notice is a
// SEPARATE block assembled from a versioned constant and concatenated at send
// time. That structure is the guarantee: because the recruiter never edits a
// body that contains the notice, there is no edit that can remove it, and
// "the notice was included" stops being a claim about someone's care.
//
//     recruiter message  +  [required notice]  +  footer
//
// The alternative — pre-filling legal wording into an editable textarea — reads
// the same on screen and fails silently the first time someone trims their
// message before sending.
//
// Whether the notice is required comes from the EXISTING classifier in
// candidates/notification.ts. It is not re-derived here, so applicants (who
// gave us their data directly, and are owed an Art. 13 notice at collection
// instead) can never be pulled into this workflow by a second opinion.

import {
  notificationState,
  type NotifiableCandidate,
} from "@/lib/candidates/notification";

/**
 * Bump when the notice WORDING changes. Recorded on every notification row, so
 * a later revision stays attributable to the people who got the earlier text.
 */
export const NOTICE_VERSION = "art14-v1";
export const TEMPLATE_KEY = "candidate_outreach";
export const TEMPLATE_VERSION = "v1";

export type ComposeInput = {
  recruiterBody: string;
  candidate: NotifiableCandidate & { full_name: string };
  /** The organisation doing the sourcing — named in the notice. */
  organizationName: string;
  /** Where the recruiter found them, shown so the notice is specific. */
  sourcePlatformLabel: string | null;
  /** Reply-to / contact address for exercising data rights. */
  contactEmail: string;
  now: Date;
};

export type ComposedBlock = {
  kind: "recruiter" | "notice" | "footer";
  /** True when the recruiter cannot edit or remove this block. */
  systemControlled: boolean;
  text: string;
};

export type ComposedMessage = {
  subject: string;
  blocks: ComposedBlock[];
  text: string;
  noticeRequired: boolean;
  noticeVersion: string;
  templateKey: string;
  templateVersion: string;
};

const SEPARATOR = "\n\n————————————————————\n\n";

/**
 * The notice itself.
 *
 * Deliberately plain: it states what we hold, where it came from, why, and what
 * the person can do about it. It makes no jurisdictional claim beyond naming
 * the right to object and to erasure, because anything more specific is a legal
 * conclusion this codebase is not the right place to encode.
 */
function noticeBlock(input: ComposeInput): string {
  const where = input.sourcePlatformLabel
    ? `We found your professional details via ${input.sourcePlatformLabel}.`
    : "We found your professional details through public professional sources.";

  return [
    "Privacy & data notice",
    "",
    `${input.organizationName} holds a record of your professional details because we are researching candidates for a role, not because you contacted us. ${where}`,
    "",
    "We hold your name, role, employer and professional contact details, and we use them only to consider and contact you about this opportunity.",
    "",
    `You can ask us what we hold, correct it, object to us holding it, or ask us to delete it. Reply to this message or write to ${input.contactEmail} and we will action it.`,
  ].join("\n");
}

function footerBlock(input: ComposeInput): string {
  return `Sent by ${input.organizationName} via Mandate.`;
}

export function composeOutreach(input: ComposeInput): ComposedMessage {
  const state = notificationState(input.candidate, input.now);
  // Required exactly when the app's own policy state says a notice is owed.
  const noticeRequired = state.status === "due" || state.status === "overdue";

  const blocks: ComposedBlock[] = [
    {
      kind: "recruiter",
      systemControlled: false,
      text: input.recruiterBody.trim(),
    },
  ];

  if (noticeRequired) {
    blocks.push({
      kind: "notice",
      systemControlled: true,
      text: noticeBlock(input),
    });
  }

  blocks.push({
    kind: "footer",
    systemControlled: true,
    text: footerBlock(input),
  });

  return {
    subject: `${input.organizationName} — a role I thought worth your time`,
    blocks,
    text: blocks.map((b) => b.text).join(SEPARATOR),
    noticeRequired,
    noticeVersion: NOTICE_VERSION,
    templateKey: TEMPLATE_KEY,
    templateVersion: TEMPLATE_VERSION,
  };
}

/**
 * The key that makes a retry safe.
 *
 * Deterministic per (candidate, notice version): a double-click, a resubmitted
 * server action or a provider retry all produce the same key and collide on the
 * unique index rather than sending a second statutory notice to a real person.
 *
 * Ordinary outreach sent again later is a different act and must NOT reuse it —
 * it is not a statutory notice and is not recorded as one.
 */
export function noticeIdempotencyKey(candidateId: string): string {
  return `art14:${candidateId}:${NOTICE_VERSION}`;
}
