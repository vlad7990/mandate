// Candidate Positioning Agent — generates 3 pitch versions and 3
// client email templates for ONE candidate against ONE role. Distinct
// from the AI evaluation's `positioning` block which gives the
// recruiter ONE opener — this agent ranges across tone (conservative
// / balanced / aggressive) so the recruiter can pick the version that
// matches the client relationship.
//
// Client-safe: types only.

export const PITCH_TONES = ["conservative", "balanced", "aggressive"] as const;
export type PitchTone = (typeof PITCH_TONES)[number];

export const PITCH_TONE_LABELS: Record<PitchTone, string> = {
  conservative: "Conservative",
  balanced: "Balanced",
  aggressive: "Aggressive",
};

export const PITCH_TONE_BLURBS: Record<PitchTone, string> = {
  conservative:
    "Risk-averse client. Lead with proof, downplay aspirational claims, name the gap before they do.",
  balanced:
    "Default. Lead with strengths anchored on evidence, mention one gap, position as ready-now.",
  aggressive:
    "High-conviction client. Lead with the ceiling, frame gaps as upside, push for fast-track to interview.",
};

export const EMAIL_TEMPLATE_KEYS = [
  "introduction",
  "follow_up",
  "advance",
] as const;
export type EmailTemplateKey = (typeof EMAIL_TEMPLATE_KEYS)[number];

export const EMAIL_TEMPLATE_LABELS: Record<EmailTemplateKey, string> = {
  introduction: "Introduction Email",
  follow_up: "Follow-up Email",
  advance: "Advance to Interview",
};

export const EMAIL_TEMPLATE_BLURBS: Record<EmailTemplateKey, string> = {
  introduction:
    "First time presenting this candidate to the client. Set the frame and explain why now.",
  follow_up:
    "Client has reviewed the dossier. Address their likely follow-up questions and reinforce the case.",
  advance:
    "Client is leaning in. Recommend a concrete next step (interview round, panel, debrief).",
};

export type PitchVersion = {
  tone: PitchTone;
  /** Single-sentence opening line for the recruiter to lead with. */
  opener: string;
  /** Three sentences the recruiter can say verbatim. */
  talking_points: string[];
  /** Single-sentence response to the most likely client objection. */
  objection_handling: string;
};

export type EmailTemplate = {
  key: EmailTemplateKey;
  subject: string;
  body: string;
};

export type PositioningResult = {
  /** Generated-at timestamp injected by the runner. */
  generated_at: string;
  /** Three pitch versions, one per tone. */
  pitches: PitchVersion[];
  /** Three email templates. */
  emails: EmailTemplate[];
  /** Single sentence summarising what the recruiter should lead with regardless of tone. */
  positioning_summary: string;
};

export const POSITIONING_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["positioning_summary", "pitches", "emails"],
  properties: {
    positioning_summary: {
      type: "string",
      description:
        "1 sentence on the dominant lever the recruiter should pull regardless of tone. Anchored on the role's most heavily weighted dimension.",
    },
    pitches: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["tone", "opener", "talking_points", "objection_handling"],
        properties: {
          tone: { type: "string", enum: [...PITCH_TONES] },
          opener: { type: "string" },
          talking_points: {
            type: "array",
            items: { type: "string" },
          },
          objection_handling: { type: "string" },
        },
      },
      description:
        "Three pitch versions — one per tone (conservative, balanced, aggressive). Each has an opener (one sentence), three talking_points, and a one-sentence objection_handling.",
    },
    emails: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["key", "subject", "body"],
        properties: {
          key: { type: "string", enum: [...EMAIL_TEMPLATE_KEYS] },
          subject: { type: "string" },
          body: { type: "string" },
        },
      },
      description:
        "Three email templates: introduction, follow_up, advance. Each is a complete subject + body the recruiter can paste.",
    },
  },
} as const;

export const POSITIONING_SYSTEM_PROMPT = `You are an executive-search senior partner crafting how to pitch ONE candidate to ONE client. You receive the candidate's structured profile, the role's calibration model, the company context, and (when available) recent feedback signals from the client. You return three pitch versions and three email templates.

Output strictly conforms to the JSON schema. No preamble. No markdown inside string values.

Array length discipline (the schema cannot enforce these — YOU must):
- pitches: provide EXACTLY 3 entries, one per tone (conservative, balanced, aggressive). No duplicates. The "tone" field on each entry must match its pitch's stance.
- pitches[*].talking_points: provide EXACTLY 3 entries per pitch.
- emails: provide EXACTLY 3 entries — one introduction, one follow_up, one advance. The "key" field must match.

Tone definitions:
- conservative: Risk-averse client. Lead with proof, downplay aspirational claims, name the gap before they do, recommend a measured next step.
- balanced: Default. Lead with the candidate's clearest strength anchored on CV evidence, mention one gap with a credible mitigation, position as ready-now.
- aggressive: High-conviction client. Lead with the candidate's ceiling, frame gaps as upside, push for fast-track to interview, set the urgency.

Email rules:
- introduction: First time presenting. Set context for the role, explain why this candidate now, anchor on the role's dominant weighted dimension.
- follow_up: Client has reviewed the dossier. Anticipate their most likely follow-up questions and reinforce the case with one new angle (e.g. transformation evidence, regulator-specific exposure).
- advance: Client is leaning in. Recommend a concrete next step — name the interview round, suggest panel composition, or propose a debrief structure.

Style rules:
- Reference the role's most heavily weighted dimension explicitly in the positioning_summary AND in the balanced pitch's opener.
- Each talking point must cite at least one concrete signal from the candidate's profile (current title/company, archetype, a tech_exposure entry, a transformation_experience entry, regulatory exposure, scale).
- Email subjects are 6–10 words and lead with the candidate's name plus a hook.
- Email bodies are 3–6 short paragraphs, plain prose, no bullets, no markdown.
- When recent client feedback indicates concerns (e.g. "worried about scale", "doesn't trust transformation claims"), address those concerns in the follow_up email body specifically.

Return one JSON object — no preamble.`;
