// Shared types, schema, and prompt for the Candidate Relationship
// Agent (#24 — the Engage arc's second principal, 098). Client-safe —
// the relationship card imports the types; the server-only seam
// imports the schema + prompt for the Anthropic call.
//
// The judgment maintains the DURABLE person record: relationship
// state and structured disposition, from evidence that already exists
// (appearances, contact history, strategies, CV artifacts). It NEVER
// touches do-not-contact — that family is guarded at the database and
// clamped again in code (relationship-merge.ts).

export type RelationshipStateWritable =
  | "cold"
  | "contacted"
  | "engaged"
  | "warm"
  | "placed"
  | "client_contact";

export type RelationshipDisposition = {
  /** One-sentence read of where this relationship stands. */
  summary: string | null;
  /** Timing appetite in plain words ("open from Q1", "not before bonus"). */
  timing: string | null;
  /** What would move them, from evidence — never invented. */
  motivation: string | null;
  location_constraints: string | null;
  compensation_context: string | null;
  notice_period: string | null;
  /** Open questions a recruiter should resolve next. */
  open_questions: string[];
};

export type RelationshipJudgment = {
  relationship_state: RelationshipStateWritable;
  disposition: RelationshipDisposition;
  /** ISO date for the next touch, or null when nothing is owed. */
  follow_up_at: string | null;
  follow_up_note: string | null;
};

export const RELATIONSHIP_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "relationship_state",
    "disposition",
    "follow_up_at",
    "follow_up_note",
  ],
  properties: {
    relationship_state: {
      type: "string",
      enum: ["cold", "contacted", "engaged", "warm", "placed", "client_contact"],
      description:
        "The relationship's state from the evidence. 'do_not_contact' is NOT yours to set and is not offered.",
    },
    disposition: {
      type: "object",
      additionalProperties: false,
      required: [
        "summary",
        "timing",
        "motivation",
        "location_constraints",
        "compensation_context",
        "notice_period",
        "open_questions",
      ],
      properties: {
        summary: { type: ["string", "null"] },
        timing: { type: ["string", "null"] },
        motivation: { type: ["string", "null"] },
        location_constraints: { type: ["string", "null"] },
        compensation_context: { type: ["string", "null"] },
        notice_period: { type: ["string", "null"] },
        open_questions: { type: "array", items: { type: "string" } },
      },
      description:
        "Structured disposition. Every field is null unless the EVIDENCE supports it — an empty field is honest, an invented one is not.",
    },
    follow_up_at: {
      type: ["string", "null"],
      description:
        "ISO date (YYYY-MM-DD) for the next touch when the evidence implies one, else null.",
    },
    follow_up_note: {
      type: ["string", "null"],
      description: "One line on what the next touch is for.",
    },
  },
} as const;

export const RELATIONSHIP_SYSTEM_PROMPT = `You are the Candidate Relationship Agent inside Mandate, an executive-search platform. Your one judgment: maintain a durable relationship record for one person, from evidence.

You receive: the person's current profile (state, disposition, follow-up), their appearances across searches (stages, tiers), the contact history (directions, channels, subjects, dates), any outreach strategies, and CV-derived evidence.

Rules that are not yours to bend:
- You maintain the record; humans act on it. Do not recommend outreach, do not draft messages.
- 'do_not_contact' is not a state you can enter or leave. If the current state is do_not_contact, that fact is handled outside your output — judge the other fields only.
- Every disposition field must be grounded in the evidence given. A field with no evidence is null. Never infer compensation, timing, or motivation from silence.
- State moves conservatively: 'contacted' needs an outbound touch; 'engaged' needs an inbound reply or equivalent evidence; 'warm' needs sustained two-way engagement; 'placed' and 'client_contact' only when the record says so explicitly.
- Follow-ups are owed only when the evidence implies one (an unanswered touch, a stated timing window). Null is a fine answer.
- Plain professional prose. No scores, no rankings.`;
