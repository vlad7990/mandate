// Triangulation Agent — fuses three intelligence reports (Company,
// Candidate, Hiring Manager) into one decision-grade fit analysis.
// Triggered manually from the candidate profile when all three inputs
// exist. Pure synthesis — no web_search; the model is grounded
// strictly in the three reports the recruiter has already vetted.
//
// Stored on `candidates.cv_structured.triangulation_report` (JSONB).

export type AlignmentPoint = {
  /** Short label — "Transformation tempo", "Regulatory comfort". */
  dimension: string;
  /** 1 sentence citing concrete evidence from the three reports. */
  evidence: string;
};

export type Concern = {
  concern: string;
  severity: "low" | "medium" | "high";
  /** 1 sentence on how to address or mitigate. */
  mitigation: string;
};

export type AnticipatedObjection = {
  /** Short objection statement in the HM's voice. */
  objection: string;
  /** Recruiter's prepared response. */
  response: string;
};

export type TriangulationReport = {
  generated_at: string;

  // Alignment scores (0–100 each).
  candidate_company_fit: number;
  candidate_hm_fit: number;
  overall_alignment: number;

  // Fit narrative.
  why_they_will_succeed: string;
  specific_alignment_points: AlignmentPoint[];

  // Risk analysis.
  concerns: Concern[];
  chemistry_risks: string[];

  // HM preparation.
  anticipated_objections: AnticipatedObjection[];
  recommended_talking_points: string[];
  suggested_first_question_from_hm: string;

  // Submission narrative.
  opening_paragraph: string;
  key_selling_points: string[];
  how_to_position: string;
};

export const TRIANGULATION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "candidate_company_fit",
    "candidate_hm_fit",
    "overall_alignment",
    "why_they_will_succeed",
    "specific_alignment_points",
    "concerns",
    "chemistry_risks",
    "anticipated_objections",
    "recommended_talking_points",
    "suggested_first_question_from_hm",
    "opening_paragraph",
    "key_selling_points",
    "how_to_position",
  ],
  properties: {
    candidate_company_fit: {
      type: "integer",
      description:
        "0–100. How well the candidate fits the COMPANY (culture, transformation needs, technology agenda). 50 = neutral; 70+ = clear fit; <40 = clear misfit.",
    },
    candidate_hm_fit: {
      type: "integer",
      description:
        "0–100. How well the candidate fits THIS HM specifically — leadership style match, communication style, value alignment, anticipated rapport.",
    },
    overall_alignment: {
      type: "integer",
      description:
        "0–100. Synthesis of company-fit and HM-fit, weighted by how decisive the HM is in the hiring process for this seniority.",
    },
    why_they_will_succeed: {
      type: "string",
      description:
        "2–3 paragraphs. Make the case. Anchor every claim in concrete evidence from the three reports. Reference specific dimensions (company priorities, HM rapport-builders, candidate signals).",
    },
    specific_alignment_points: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["dimension", "evidence"],
        properties: {
          dimension: { type: "string" },
          evidence: {
            type: "string",
            description:
              "1 sentence citing the specific intersection — e.g. 'HM's known priority of cost-discipline + candidate's documented turnaround at TelcoCo'.",
          },
        },
      },
      description:
        "3–6 entries. Each names a dimension + cites a concrete intersection across the three reports. These are the strongest threads in the case.",
    },
    concerns: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["concern", "severity", "mitigation"],
        properties: {
          concern: { type: "string" },
          severity: { type: "string", enum: ["low", "medium", "high"] },
          mitigation: { type: "string" },
        },
      },
      description:
        "1–4 entries. Each is a defensible concern (drawn from candidate risk_signals, HM red_lines, or company red_flags) with a recruiter-actionable mitigation. Empty array only if research is genuinely thin.",
    },
    chemistry_risks: {
      type: "array",
      items: { type: "string" },
      description:
        "0–4 risks specifically about candidate ↔ HM dynamic — communication-style mismatch, tempo mismatch, value mismatch. Each grounded in observed signals from the HM and Candidate reports.",
    },
    anticipated_objections: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["objection", "response"],
        properties: {
          objection: { type: "string" },
          response: { type: "string" },
        },
      },
      description:
        "2–5 entries. Each objection is phrased in the HM's likely voice (drawn from HM likely_concerns and red_lines). Each response is a tight, evidence-led counter ≤2 sentences.",
    },
    recommended_talking_points: {
      type: "array",
      items: { type: "string" },
      description:
        "3–6 talking points the recruiter should lead with in the next conversation with this HM about this candidate. Anchor on the HM's rapport_builders and known_priorities.",
    },
    suggested_first_question_from_hm: {
      type: "string",
      description:
        "1 question the HM is most likely to open with at first meeting, calibrated against their public posture and known priorities. The recruiter prepares the candidate for this.",
    },
    opening_paragraph: {
      type: "string",
      description:
        "A ready-to-paste opening paragraph for the submission cover note. 4–6 sentences. Speaks to the HM's known priorities while introducing the candidate's most relevant proof points. No clichés ('I'm pleased to introduce…').",
    },
    key_selling_points: {
      type: "array",
      items: { type: "string" },
      description:
        "3–6 short selling points to include in the submission deck. Each anchored in evidence the HM will recognise.",
    },
    how_to_position: {
      type: "string",
      description:
        "1–2 sentences on the framing the recruiter should use throughout the engagement — what archetype to lean into, what to under-emphasise.",
    },
  },
} as const;

export const TRIANGULATION_SYSTEM_PROMPT = `You are an executive-search triangulation analyst. You receive THREE pre-built intelligence reports for one engagement: a Company Intelligence Report, a Hiring Manager Intelligence Report, and a Candidate Intelligence Report. You synthesise them into a single decision-grade Triangulation Report in strict JSON.

You have NO web_search tool. You must ground every claim strictly in the three reports provided. Do not bring in outside facts. If something cannot be substantiated from the three reports, say so — never fabricate.

What you produce:
1. Three alignment scores (0–100): candidate↔company, candidate↔HM, overall_alignment. Calibrate honestly: 50 = neutral; 70+ requires multiple concordant signals across the reports.
2. A fit narrative — why_they_will_succeed (2–3 paragraphs) plus 3–6 specific_alignment_points naming concrete intersections.
3. A risk analysis — 1–4 concerns each with severity + mitigation, plus 0–4 chemistry_risks specifically about the candidate ↔ HM dynamic.
4. HM preparation — 2–5 anticipated_objections in the HM's voice with recruiter responses, 3–6 recommended_talking_points calibrated to the HM's rapport_builders, and one suggested_first_question_from_hm.
5. A submission narrative — opening_paragraph (paste-ready), 3–6 key_selling_points, and a 1–2 sentence how_to_position framing.

Hard rules:
- Output strictly conforms to the JSON schema. No preamble, no markdown.
- Every paragraph and bullet must be defensible from the three reports. Cite the source frame implicitly ("the company's transformation_priorities flag X", "the HM's known_priorities include Y", "the candidate's career_narrative shows Z"). The recruiter must be able to trace each claim back to a source.
- When the reports disagree (e.g. candidate web_presence_score is high but the HM red_lines include "self-promoters"), surface the tension rather than hiding it. The recruiter needs the conflict named.
- Calibrate harshness: if the candidate is a clear misfit on multiple dimensions, score it that way. False positives cost the recruiter trust with the HM.
- The opening_paragraph and key_selling_points are the only sections that get drafted in client-facing language. Everything else is recruiter-facing — direct, no marketing copy.

Length discipline:
- why_they_will_succeed: 2–3 paragraphs.
- specific_alignment_points: 3–6 entries.
- concerns: 1–4 entries.
- chemistry_risks: 0–4 entries.
- anticipated_objections: 2–5 entries.
- recommended_talking_points / key_selling_points: 3–6 entries each.
- opening_paragraph: 4–6 sentences.
- how_to_position: 1–2 sentences.

Return one JSON object — no preamble.`;
