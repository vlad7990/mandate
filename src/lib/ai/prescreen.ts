// Shared types, schema, and prompt for the Pre-Screen Agent (#23 —
// the Engage arc's fifth principal, 101). Client-safe — the review
// panel imports the types and the derived-state helper; the
// server-only seam imports the schema + prompt.
//
// One judgment (spec §9): resolve the named unknowns, capture
// evidence and interest. Two tracks that never mix, and NO VERDICT —
// no pass, no score, no percentage, ever. Recruiter-ready is a
// DERIVED state computed in code; consequential judgment stays with
// the human who opens the record. At the shipped ceiling (the
// confirmed D2 counsel boundary) the agent computes, drafts and
// structures; humans conduct the conversation and send every message.

import type { DimensionKey } from "./onboarding-analysis";

export type PrescreenStatus =
  | "proposed"
  | "invited"
  | "in_progress"
  | "complete"
  | "abandoned"
  | "escalated";

export type PrescreenQuestionSet = {
  subject: string;
  /** Recruiter-block text ONLY — the Art. 14 notice and the AI
   * disclosure block are appended at send time, system-side. */
  body: string;
  questions: string[];
};

export type EvidenceStatus = "validated" | "partial" | "unknown";

export type EvidenceEntry = {
  value: string | null;
  status: EvidenceStatus;
  /** Where it came from: "cv", "reply 2", "call note" … */
  source: string | null;
};

export type ProfessionalEvidence = Partial<Record<DimensionKey, EvidenceEntry>>;

export const INTEREST_LEVELS = [
  "strong",
  "open",
  "exploring",
  "declined",
  "unknown",
] as const;
export type InterestLevel = (typeof INTEREST_LEVELS)[number];

export type InterestProfile = {
  interest: InterestLevel;
  motivation: string | null;
  timing: string | null;
  location: string | null;
  comp_context: string | null;
  notice: string | null;
  constraints: string | null;
  /** The candidate's own open questions. */
  questions: string[];
};

export type PrescreenJudgment = {
  status: "proposed" | "in_progress" | "complete" | "escalated";
  escalation_reason: string | null;
  question_set: PrescreenQuestionSet | null;
  professional_evidence: ProfessionalEvidence;
  interest_profile: InterestProfile;
};

/**
 * The DERIVED recruiter-ready state (spec §9): never stored, never a
 * grade — surfaced as evidence + unknowns beside it.
 */
export function recruiterReady(args: {
  status: string;
  interest: string | null | undefined;
  escalationOpen: boolean;
}): boolean {
  return (
    args.status === "complete" &&
    (args.interest === "strong" || args.interest === "open") &&
    !args.escalationOpen
  );
}

/**
 * The system-controlled disclosure block (the confirmed D6; §12.1
 * pre-commits to always-disclose — counsel confirms wording before
 * level ≥3). Appended at send time, never the model's to write or
 * the recruiter's to edit away.
 */
export function prescreenDisclosure(orgName: string): string {
  return (
    `These pre-screen questions were prepared with the help of an AI ` +
    `assistant acting for ${orgName}. A member of the search team reviews ` +
    `every answer — you are corresponding with people, not software.`
  );
}

const EVIDENCE_ENTRY_SCHEMA = {
  type: ["object", "null"],
  additionalProperties: false,
  required: ["value", "status", "source"],
  properties: {
    value: { type: ["string", "null"] },
    status: { type: "string", enum: ["validated", "partial", "unknown"] },
    source: { type: ["string", "null"] },
  },
} as const;

export const PRESCREEN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "status",
    "escalation_reason",
    "question_set",
    "professional_evidence",
    "interest_profile",
  ],
  properties: {
    status: {
      type: "string",
      enum: ["proposed", "in_progress", "complete", "escalated"],
      description:
        "Where the pre-screen stands. 'proposed' = questions drafted, nothing sent yet; 'in_progress' = answers are arriving; 'complete' = the named unknowns are resolved or answered; 'escalated' hands it to a human and MUST carry escalation_reason. Abandonment is not yours — a human walks away.",
    },
    escalation_reason: {
      type: ["string", "null"],
      description:
        "One honest sentence on why a human must take over. Non-null exactly when status is 'escalated'.",
    },
    question_set: {
      type: ["object", "null"],
      additionalProperties: false,
      required: ["subject", "body", "questions"],
      properties: {
        subject: { type: "string" },
        body: { type: "string" },
        questions: { type: "array", items: { type: "string" } },
      },
      description:
        "The proposed invitation for the HUMAN to approve and send — a short warm body plus one question per unresolved dimension. Null when nothing should be asked (complete, escalated). No privacy notice, no disclosure block — Mandate appends both at send time.",
    },
    professional_evidence: {
      type: "object",
      additionalProperties: false,
      required: [
        "technical",
        "domain",
        "leadership",
        "regulatory",
        "transformation",
      ],
      properties: {
        technical: EVIDENCE_ENTRY_SCHEMA,
        domain: EVIDENCE_ENTRY_SCHEMA,
        leadership: EVIDENCE_ENTRY_SCHEMA,
        regulatory: EVIDENCE_ENTRY_SCHEMA,
        transformation: EVIDENCE_ENTRY_SCHEMA,
      },
      description:
        "Per dimension: what the record now shows, with its source. Null for a dimension leaves the stored entry untouched. NEVER a number, NEVER a rating — evidence in words, or unknown.",
    },
    interest_profile: {
      type: "object",
      additionalProperties: false,
      required: [
        "interest",
        "motivation",
        "timing",
        "location",
        "comp_context",
        "notice",
        "constraints",
        "questions",
      ],
      properties: {
        interest: {
          type: "string",
          enum: ["strong", "open", "exploring", "declined", "unknown"],
        },
        motivation: { type: ["string", "null"] },
        timing: { type: ["string", "null"] },
        location: { type: ["string", "null"] },
        comp_context: { type: ["string", "null"] },
        notice: { type: ["string", "null"] },
        constraints: { type: ["string", "null"] },
        questions: { type: "array", items: { type: "string" } },
      },
      description:
        "The interest track — from what the candidate SAID, never inferred from silence. comp_context records what THEY volunteered; you never ask about or discuss compensation.",
    },
  },
} as const;

export const PRESCREEN_SYSTEM_PROMPT = `You are the Pre-Screen Agent inside Mandate, an executive-search platform. Your one judgment: resolve the named unknowns about one candidate — capture professional evidence and interest, from what they actually said.

You receive: the role context, the evidence-coverage gap (which of five dimensions are strong / partial / unknown, computed from the CV before you were called), the message thread, and the pre-screen's current state.

Rules that are not yours to bend:
- Two tracks, never mixed: professional evidence (what the record shows per dimension, with sources) and the interest profile (what they want, in their words). NO verdict exists: no pass, no score, no percentage, no "qualified" — a human reads the evidence and decides. Evidence is words with sources, or unknown.
- Draft questions ONLY for dimensions that are not strong, plus interest/timing when unasked. One clear question each, professional and answerable in a paragraph. The human sends them — you never send anything.
- Never ask about or discuss compensation; if the candidate volunteers it, record it verbatim in comp_context.
- Evidence comes from the thread and the CV summary given — never invented, never inferred from silence. A dimension with no answer stays unknown; an unanswered pre-screen stays honest about what it did not learn.
- Escalate — status 'escalated' with an honest one-sentence reason — when the candidate asks for a human, raises privacy/deletion language, opens negotiation or compensation discussion, asks for confidential client information, uses discrimination or legal-claim phrasing, or when you are genuinely unsure what policy allows. "I don't know" is an escalation, never a guess.
- Do not write a privacy notice, disclosure block, signature, or legal footer — Mandate composes those at send time.
- Plain professional prose. Respect the candidate's time.`;
