// Shared types, schema, and prompt for the Outreach Strategy Agent
// (#21 — the Engage arc's first principal, 097). Client-safe — the
// panel imports the content type; the server-only seam imports the
// schema + prompt for the Anthropic call.
//
// The draft_body is RECRUITER-BLOCK text only: the Art. 14 privacy
// notice is composed at send time by lib/outreach/compose.ts as a
// system-controlled block, so it is never the agent's to write — and
// never the agent's to omit.

export type OutreachStrategyContent = {
  /** The one-sentence thesis of the approach. */
  angle: string;
  /** The specific career-shaped reason THIS person would listen. */
  career_hook: string;
  /** What the outreach may reveal, under the org's disclosure policy. */
  may_disclose: string[];
  /** What it must withhold — the service re-checks this in 099. */
  must_not_disclose: string[];
  channel: "email" | "phone" | "other";
  /** Follow-up rhythm in plain words (e.g. "wait 5 business days, one nudge"). */
  cadence: string;
  talking_points: string[];
  likely_questions: string[];
  draft_subject: string;
  /** Recruiter-block text only — no privacy notice, no footer. */
  draft_body: string;
};

export const OUTREACH_STRATEGY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "angle",
    "career_hook",
    "may_disclose",
    "must_not_disclose",
    "channel",
    "cadence",
    "talking_points",
    "likely_questions",
    "draft_subject",
    "draft_body",
  ],
  properties: {
    angle: {
      type: "string",
      description:
        "One sentence: the thesis of the approach — why this role, for this person, now.",
    },
    career_hook: {
      type: "string",
      description:
        "1–2 sentences naming the specific, evidence-grounded career reason this person would take the call. Grounded in their actual history, never generic flattery.",
    },
    may_disclose: {
      type: "array",
      items: { type: "string" },
      description:
        "Short list of facts the outreach may reveal (role scope, sector, stage). Respect the disclosure policy given in the input.",
    },
    must_not_disclose: {
      type: "array",
      items: { type: "string" },
      description:
        "Short list of facts the outreach must withhold (e.g. the client's identity under a confidential policy, compensation details under a human-only policy).",
    },
    channel: {
      type: "string",
      enum: ["email", "phone", "other"],
      description:
        "The recommended first-touch channel, chosen from the allowed channels in the input policy.",
    },
    cadence: {
      type: "string",
      description:
        "The follow-up rhythm in one plain sentence. Conservative by default.",
    },
    talking_points: {
      type: "array",
      items: { type: "string" },
      description:
        "3–5 short points for the recruiter's call or reply — each grounded in the candidate's evidence or the mandate.",
    },
    likely_questions: {
      type: "array",
      items: { type: "string" },
      description:
        "2–4 questions this candidate will probably ask, each with a one-clause suggested handling.",
    },
    draft_subject: {
      type: "string",
      description:
        "The email subject line. Specific and honest — no clickbait, no false urgency.",
    },
    draft_body: {
      type: "string",
      description:
        "The outreach message body — recruiter text ONLY. Do NOT include any privacy notice, legal text, or footer; the system appends those. 100–160 words, professional, specific to this person, no placeholder brackets.",
    },
  },
} as const;

export const OUTREACH_STRATEGY_SYSTEM_PROMPT = `You are the Outreach Strategy Agent inside Mandate, an executive-search platform. Your one judgment: decide how this specific person should be approached about this specific mandate, and draft that approach for a human recruiter to approve.

You receive: the role context (calibration model — what the search actually weights), the company context, the candidate's structured evidence (CV, evaluation, research where present), the contact history (what has already been said, in which direction), and the organisation's communication policy.

Rules that are not yours to bend:
- The recruiter approves, edits, declines, and sends. You draft. Write so a competent recruiter could send your draft with light edits.
- POLICY IS BINDING. If client_identity_disclosure is "never" or "after_nda", the client company's name must not appear anywhere in your output — describe the client generically ("a leading clearing firm") and put the client's identity in must_not_disclose. If compensation_discussion is "human_only", do not mention salary, compensation, bonus, or equity anywhere — put compensation in must_not_disclose.
- Choose the channel ONLY from the policy's allowed channels.
- The draft_body is the recruiter's message text only. Never write a privacy notice, unsubscribe line, or legal footer — the system owns those blocks.
- Ground everything in the evidence you were given. If the evidence is thin, say so in the angle and write a shorter, humbler draft rather than inventing enthusiasm.
- If the contact history shows prior outreach, acknowledge the thread honestly (a follow-up reads differently from a first touch) and adjust the cadence.
- No scores, no rankings, no fit percentages anywhere in the output.
- Plain professional prose. No emoji, no hype, no "I hope this finds you well".`;
