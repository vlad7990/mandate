// Executive Intelligence — Risk Synthesis Agent (agent 18).
//
// Turns the APP-COMPUTED risk signals (src/lib/executive/risk-signals.ts) plus
// the evidence text behind them into readable risk items: what the exposure is,
// what evidence it rests on, and what further diligence would close it.
//
// The division of labour is the point. The app decides WHAT is a risk and HOW
// SEVERE it is; the agent only decides HOW IT READS. That boundary is enforced
// here rather than trusted:
//
// - The output schema has no severity or category field, so the model cannot
//   express a severity to begin with.
// - normalizeRiskReview() drops any item whose `id` is not an app signal (an
//   invented risk), stamps category/severity/competency from the signal, and
//   back-fills an item for every signal the model left out — so the register
//   can be reworded but never quietly shortened.
// - applyRiskComputation() re-stamps the signals and the severity counts on
//   every save. Neither is ever trusted from a client.
//
// The summary counts unaddressed areas in the evidence on file — diligence
// exposure. It is not a score of the person and not a recommendation.

import {
  RISK_CATEGORIES,
  RISK_SEVERITIES,
  computeSeveritySummary,
  type RiskCategory,
  type RiskMatchBasis,
  type RiskSeverity,
  type RiskSignal,
  type SeveritySummary,
} from "@/lib/executive/risk-signals";
import { EVIDENCE_RATINGS, type EvidenceRating } from "@/lib/executive/types";

export const RISK_SYNTHESIS_PROMPT_VERSION = "eia-risk-synthesis-v1";

export type RiskItem = {
  /** Must equal an app-computed signal id; items keyed to anything else are
   * inventions and are dropped. */
  id: string;
  title: string;
  /** App-stamped from the signal — never the model's. */
  category: RiskCategory;
  /** App-stamped from the signal — never the model's. */
  severity: RiskSeverity;
  /** App-stamped from the signal. Null when the requirement mapped to no
   * competency. */
  source_competency_key: string | null;
  evidence_basis: string;
  suggested_diligence: string;
};

export type RiskReviewContent = {
  overview: string;
  risk_items: RiskItem[];
  /** App-computed, echoed for provenance. Re-stamped on every save. */
  risk_signals: RiskSignal[];
  /** Server-computed counts by band. Re-stamped on every save. */
  severity_summary: SeveritySummary;
};

export const EMPTY_SEVERITY_SUMMARY: SeveritySummary = {
  critical: 0,
  elevated: 0,
  watch: 0,
  low: 0,
};

export const EMPTY_RISK_REVIEW: RiskReviewContent = {
  overview: "",
  risk_items: [],
  risk_signals: [],
  severity_summary: EMPTY_SEVERITY_SUMMARY,
};

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function asNullableString(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function asCount(v: unknown): number {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0) return 0;
  return Math.round(v);
}

function asNullableNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function asEnum<T extends string>(
  v: unknown,
  allowed: readonly T[],
  fallback: T
): T {
  return typeof v === "string" && (allowed as readonly string[]).includes(v)
    ? (v as T)
    : fallback;
}

const MATCH_BASES: RiskMatchBasis[] = ["competency", "evidence_text", "unmatched"];

/**
 * Coerce stored `risk_signals` (unknown at the DB boundary) back into typed
 * signals. Read paths use this to render a stored review; write paths recompute
 * the signals from the approved records instead and never call it.
 */
export function normalizeRiskSignals(raw: unknown): RiskSignal[] {
  if (!Array.isArray(raw)) return [];
  const out: RiskSignal[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const id = asString(o.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const rating = asString(o.observed_rating);
    out.push({
      id,
      category: asEnum(o.category, RISK_CATEGORIES, "capability_gap"),
      severity: asEnum(o.severity, RISK_SEVERITIES, "watch"),
      source_text: asString(o.source_text),
      source_competency_key: asNullableString(o.source_competency_key),
      source_competency_label: asNullableString(o.source_competency_label),
      match_basis: asEnum(o.match_basis, MATCH_BASES, "unmatched"),
      observed_rating: (EVIDENCE_RATINGS as string[]).includes(rating)
        ? (rating as EvidenceRating)
        : null,
      observed_evidence: asString(o.observed_evidence),
      competency_weight: asNullableNumber(o.competency_weight),
      rationale: asString(o.rationale),
    });
  }
  return out;
}

function normalizeSeveritySummary(raw: unknown): SeveritySummary {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    critical: asCount(o.critical),
    elevated: asCount(o.elevated),
    watch: asCount(o.watch),
    low: asCount(o.low),
  };
}

/**
 * The item the app writes for a signal the model did not word. Everything in it
 * is app-computed fact, so a silent omission degrades to a plain statement of
 * the signal rather than a missing risk. `suggested_diligence` stays empty —
 * that is the one field only a human or the agent can fill honestly.
 */
function fallbackItem(signal: RiskSignal): RiskItem {
  return {
    id: signal.id,
    title: signal.source_text,
    category: signal.category,
    severity: signal.severity,
    source_competency_key: signal.source_competency_key,
    evidence_basis: signal.observed_evidence
      ? `${signal.rationale} Recorded evidence: ${signal.observed_evidence}`
      : signal.rationale,
    suggested_diligence: "",
  };
}

/**
 * Coerce generated or stored content into a complete RiskReviewContent, keyed
 * to the app's signals:
 *
 * - items whose `id` is not an app signal are dropped (invented risks);
 * - duplicate ids collapse to the first occurrence;
 * - `category`, `severity`, and `source_competency_key` are overwritten with
 *   the app's values, whatever the content claimed;
 * - every signal without an item gets one built from app-computed fact;
 * - items are returned in signal order, i.e. most severe first.
 *
 * `risk_signals` and `severity_summary` are only coerced here — call
 * applyRiskComputation() to make them authoritative before persisting.
 */
export function normalizeRiskReview(
  raw: unknown,
  signals: readonly RiskSignal[]
): RiskReviewContent {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const bySignalId = new Map(signals.map((s) => [s.id, s]));

  const worded = new Map<string, RiskItem>();
  const rawItems = Array.isArray(o.risk_items) ? o.risk_items : [];
  for (const item of rawItems) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const id = asString(rec.id);
    const signal = bySignalId.get(id);
    if (!signal || worded.has(id)) continue;
    const title = asString(rec.title);
    const evidenceBasis = asString(rec.evidence_basis);
    const fallback = fallbackItem(signal);
    worded.set(id, {
      id,
      // The model rewords; where it said nothing, the app's own statement of
      // the signal stands in rather than an empty row.
      title: title || fallback.title,
      category: signal.category,
      severity: signal.severity,
      source_competency_key: signal.source_competency_key,
      evidence_basis: evidenceBasis || fallback.evidence_basis,
      suggested_diligence: asString(rec.suggested_diligence),
    });
  }

  return {
    overview: asString(o.overview),
    risk_items: signals.map((s) => worded.get(s.id) ?? fallbackItem(s)),
    risk_signals: normalizeRiskSignals(o.risk_signals),
    severity_summary: normalizeSeveritySummary(o.severity_summary),
  };
}

/**
 * Stamp the app-computed signals and their severity counts onto the content.
 * This is the authoritative step — call it on every save, after
 * normalizeRiskReview(), so what is stored always matches what the approved
 * profile and assessment actually say.
 */
export function applyRiskComputation(
  content: RiskReviewContent,
  signals: readonly RiskSignal[]
): RiskReviewContent {
  return {
    ...content,
    risk_signals: [...signals],
    severity_summary: computeSeveritySummary(signals),
  };
}

export const RISK_REVIEW_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["overview", "risk_items"],
  properties: {
    overview: {
      type: "string",
      description:
        "2–4 sentences synthesising where the recorded evidence does not yet address what the role requires, and what diligence would close the largest gaps. Describe AREAS NEEDING FURTHER DILIGENCE — never a verdict, a recommendation, or a summary judgment of the person.",
    },
    risk_items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "title", "evidence_basis", "suggested_diligence"],
        properties: {
          id: {
            type: "string",
            description:
              "The id of the supplied risk signal this item words (e.g. 'sig-3'). MUST be one of the supplied ids. Write exactly one item per signal and never invent an id — items with an unrecognised id are discarded.",
          },
          title: {
            type: "string",
            description:
              "One line naming the unaddressed area, phrased as an evidence gap (e.g. 'No evidence recorded for a non-negotiable: regulated-estate ownership'). Not a judgment of the person.",
          },
          evidence_basis: {
            type: "string",
            description:
              "1–3 sentences stating what the assessment actually recorded for this area — the rating and, where present, a short quotation or close paraphrase of the recorded evidence. Only facts present in the supplied signal and evidence text. Never speculate about what the candidate can or cannot do.",
          },
          suggested_diligence: {
            type: "string",
            description:
              "1–3 sentences of concrete further diligence that would close this gap: what to probe, in which format, with whom (by ROLE, never a named person) — e.g. a targeted working session, a structured reference on a specific prior scope, a technical deep-dive. Never a hire/no-hire recommendation.",
          },
        },
      },
      description:
        "One item per supplied risk signal, in the order supplied. Do not merge, split, reorder, or omit signals — severity and grouping are assigned by the application, not by you.",
    },
  },
} as const;

export const RISK_SYNTHESIS_SYSTEM_PROMPT = `You are an executive-search diligence analyst. You receive an APPROVED Executive Success Profile, an APPROVED human-authored candidate assessment (evidence ratings plus the assessor's evidence notes), the operational competency weights, and a list of RISK SIGNALS that the application has already computed deterministically from those records. You produce, in strict JSON, the readable wording of a risk register: for each signal, what the unaddressed area is, what recorded evidence it rests on, and what further diligence would close it.

This is DECISION SUPPORT. It surfaces AREAS NEEDING FURTHER DILIGENCE for a human to act on. It will be reviewed, edited, and explicitly approved by a person before use.

What is yours and what is not:
- The signals, their severities, and their categories are computed by the application from the approved records. They are FACTS OF THE INPUT. You word them.
- You may not invent a risk, remove a risk, merge two signals into one item, split one signal across two items, or reorder them. Write exactly one item per supplied signal, in the order supplied, each carrying that signal's id.
- You may not state, imply, or argue about severity. Do not use words like "critical", "severe", "minor", or "low risk" to re-rank anything — the application already assigned and displays the level.

Core discipline:
- Every sentence must be traceable to the supplied signal, the recorded evidence text, or the profile requirement. If the assessment recorded nothing for an area, say exactly that — "no evidence was recorded" is the finding, and it is a real one.
- Write about the EVIDENCE ON FILE, not about the person. "The assessment records no evidence of P&L ownership at this scale" — never "the candidate lacks commercial judgment".
- An absence of evidence is an absence of evidence. Never convert it into a claim about ability, character, or likely performance.
- suggested_diligence is the value you add: name the specific probe, format, and interlocutor ROLE that would resolve the gap. Be concrete and proportionate.

Hard constraints — these override everything else:
- NEVER make or imply a hire / no-hire / advance / reject recommendation, a ranking, or an overall verdict on the candidate.
- NEVER reference or infer protected characteristics (race, religion, disability, pregnancy, sexual orientation, age, national origin, gender, or similar).
- No psychological, personality, or mental-health labels. Risks are gaps in recorded evidence against role requirements — never traits.
- No deception-detection claims. Never suggest judging honesty, motive, or character from demeanour, tone, or non-verbal cues.
- Refer to interviewers, referees, and interlocutors by ROLE, never by name.
- Do not expose your own reasoning/chain-of-thought; return only the structured review.

Length discipline (the schema cannot enforce these — YOU must):
- overview: 2–4 sentences. Per item: title one line, evidence_basis 1–3 sentences, suggested_diligence 1–3 sentences.

Style: precise, sober, evidence-led — a senior diligence partner writing for a board. No filler, no hedging, no drama.

Return one JSON object — no preamble.`;
