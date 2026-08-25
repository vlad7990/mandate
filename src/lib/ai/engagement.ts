// Shared types, schema, and prompt for the Candidate Engagement
// Agent (#22 — the Engage arc's fourth principal, 100). Client-safe —
// the engagement panel imports the types; the server-only seam
// imports the schema + prompt for the Anthropic call.
//
// One judgment (spec §9): manage the conversation within policy — at
// the shipped autonomy ceiling that means MAINTAIN the engagement
// lane (state, follow-up timing, escalation) and DRAFT the next move
// for the human. It sends NOTHING: the comms service refuses every
// agent actor by construction, and the proposed draft leaves through
// sendCandidateMessage under the recruiter's own name or dies unsent.

export type EngagementState =
  | "awaiting_reply"
  | "replied"
  | "responding"
  | "timing_follow_up"
  | "declined"
  | "interested"
  | "escalated"
  | "closed";

export const ENGAGEMENT_STATES: EngagementState[] = [
  "awaiting_reply",
  "replied",
  "responding",
  "timing_follow_up",
  "declined",
  "interested",
  "escalated",
  "closed",
];

export type EngagementDraft = {
  subject: string;
  /** Recruiter-block text ONLY — the Art. 14 notice is composed at
   * send time by the comms service, never the agent's to write. */
  body: string;
};

export type EngagementJudgment = {
  state: EngagementState;
  /** Required exactly when state is 'escalated' — an escalation
   * without a reason is not a record. */
  escalation_reason: string | null;
  next_follow_up_at: string | null;
  draft: EngagementDraft | null;
};

export const ENGAGEMENT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["state", "escalation_reason", "next_follow_up_at", "draft"],
  properties: {
    state: {
      type: "string",
      enum: [
        "awaiting_reply",
        "replied",
        "responding",
        "timing_follow_up",
        "declined",
        "interested",
        "escalated",
        "closed",
      ],
      description:
        "Where this conversation stands, from the thread. 'escalated' hands it to a human and MUST carry escalation_reason.",
    },
    escalation_reason: {
      type: ["string", "null"],
      description:
        "One honest sentence on why a human must take over. Non-null exactly when state is 'escalated'.",
    },
    next_follow_up_at: {
      type: ["string", "null"],
      description:
        "ISO date (YYYY-MM-DD) for the next touch when the thread implies one, else null.",
    },
    draft: {
      type: ["object", "null"],
      additionalProperties: false,
      required: ["subject", "body"],
      properties: {
        subject: { type: "string" },
        body: { type: "string" },
      },
      description:
        "The proposed next message for the HUMAN to approve and send, or null when nothing should be sent (declined, closed, escalated). Recruiter text only — no privacy notice, Mandate appends that at send time.",
    },
  },
} as const;

export const ENGAGEMENT_SYSTEM_PROMPT = `You are the Candidate Engagement Agent inside Mandate, an executive-search platform. Your one judgment: manage one candidate conversation within policy — read the thread and decide where it stands, when the next touch is owed, and draft that next touch for the recruiter to approve.

You receive: the message thread (directions, subjects, bodies, delivery status, dates), the approved outreach strategy, the person's relationship record, the organisation's communication policy, and the lane's current state.

Rules that are not yours to bend:
- You never send anything. Your draft is a PROPOSAL; a human approves it and Mandate sends it under the human's name, or it dies unsent.
- Escalate — state 'escalated' with an honest one-sentence reason — when the candidate asks for a human, raises deletion/objection/unsubscribe language, opens negotiation or compensation beyond the org's policy, asks for confidential client information beyond the disclosure policy, uses discrimination or legal-claim phrasing, or when you are genuinely unsure what policy allows. "I don't know" is an escalation, never a guess.
- An escalation without a reason is not a record: escalation_reason is non-null exactly when state is 'escalated'.
- Never discuss compensation beyond the org's policy; never disclose the client beyond the disclosure policy. The draft is clamped and re-checked at send time regardless — write within policy so the clamp has nothing to cut.
- Do not write a privacy notice, signature block, or legal footer into the draft — Mandate composes the Art. 14 notice at send time.
- State moves from evidence: 'awaiting_reply' when the last word is ours; 'replied' when theirs is unhandled; 'responding' when a human has taken the thread; 'timing_follow_up' when a follow-up is scheduled; 'declined' / 'interested' only when they said so; 'closed' when the conversation is genuinely over.
- Follow-ups are owed only when the thread implies one (an unanswered touch, a stated timing window). Null is a fine answer, and a null draft is a fine answer.
- Plain professional prose. No pressure tactics, no manufactured urgency.`;
