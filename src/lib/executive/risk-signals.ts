// Executive Intelligence — risk signals. Pure functions, no I/O, no AI.
//
// A Risk Review asks one question: where does the recorded evidence fail to
// address what the approved success profile said the role requires? That
// question is answered HERE, deterministically, before any model runs:
//
// - Every signal is derived by joining approved profile prose (non-negotiable
//   gaps, derailers, required capabilities) and the search's operational
//   competency weights against the approved assessment's ratings.
// - Severity is assigned by the app from that join alone. The Risk Synthesis
//   Agent may reword and group signals; it can neither invent one nor change a
//   severity, because both are recomputed here and re-stamped on every save.
// - Prose→competency mapping is best-effort. A requirement that maps to
//   nothing is carried as "unmatched" and still surfaced — never silently
//   dropped, because an unmappable requirement is precisely the one no evidence
//   was gathered against.
//
// Nothing here scores a person. A signal says "this area is unaddressed by the
// evidence on file"; the summary counts those areas as diligence exposure. It
// is not a grade, not a ranking, and not a hire/no-hire recommendation.

import type { OperationalWeight } from "./assessment-scoring";
import type { SuccessProfileContent } from "@/lib/ai/executive-role-architect-agent";
import {
  EVIDENCE_RATING_LABELS,
  type AssessmentContent,
  type CompetencyAssessment,
  type EvidenceRating,
} from "./types";

/** Severity bands, most severe first — also the display order. */
export const RISK_SEVERITIES = ["critical", "elevated", "watch", "low"] as const;
export type RiskSeverity = (typeof RISK_SEVERITIES)[number];

/** Signal categories, in the order they are surfaced within a severity band. */
export const RISK_CATEGORIES = [
  "non_negotiable",
  "derailer",
  "capability_gap",
  "uncovered_competency",
] as const;
export type RiskCategory = (typeof RISK_CATEGORIES)[number];

/** How a requirement was tied to a competency (or that it could not be). */
export type RiskMatchBasis = "competency" | "evidence_text" | "unmatched";

export const RISK_SEVERITY_LABELS: Record<RiskSeverity, string> = {
  critical: "Critical",
  elevated: "Elevated",
  watch: "Watch",
  low: "Low",
};

export const RISK_CATEGORY_LABELS: Record<RiskCategory, string> = {
  non_negotiable: "Non-negotiable gap",
  derailer: "Potential derailer",
  capability_gap: "Required capability",
  uncovered_competency: "Uncovered high-weight competency",
};

export type RiskSignal = {
  /** Stable within a computation: `sig-1` is the most severe. Risk items in
   * content_json are keyed to these ids; an item whose id is not here is
   * dropped as an invention. */
  id: string;
  category: RiskCategory;
  /** App-assigned. The agent cannot change it. */
  severity: RiskSeverity;
  /** The profile requirement this signal came from — verbatim, or the
   * competency label for `uncovered_competency`. */
  source_text: string;
  source_competency_key: string | null;
  source_competency_label: string | null;
  match_basis: RiskMatchBasis;
  /** The rating actually recorded, or null when nothing was recorded. */
  observed_rating: EvidenceRating | null;
  /** Evidence text recorded for the mapped competency (may be empty). */
  observed_evidence: string;
  competency_weight: number | null;
  /** Plain-language statement of why the app assigned this severity. Shown to
   * the reviewer and given to the agent as the grounding for its wording. */
  rationale: string;
};

export type SeveritySummary = Record<RiskSeverity, number>;

/** The profile sections a risk review reads. */
export type RiskProfileSections = Pick<
  SuccessProfileContent,
  | "non_negotiable_gaps"
  | "potential_derailers"
  | "required_leadership_capabilities"
  | "required_functional_capabilities"
  | "required_operating_experience"
>;

/** The assessment sections a risk review reads. */
export type RiskAssessmentSections = Pick<
  AssessmentContent,
  "competency_assessments"
>;

/**
 * A competency counts as high-weight when it carries at least this share of
 * the search's highest weight. A fraction rather than a top-N cut so ties are
 * handled naturally and the rule holds whatever scale the weights use.
 */
export const HIGH_WEIGHT_FRACTION = 0.75;

/**
 * How many distinctive words a requirement and a weakly-evidenced competency's
 * evidence text must share before the app treats that evidence as corroborating
 * the requirement. Two is deliberately conservative: a looser bar would let one
 * common word manufacture a mapping that reads as fact.
 */
export const MIN_CORROBORATING_TOKENS = 2;

/** Words carried by competency names that cannot discriminate between them. */
const STOPWORDS = new Set([
  "and",
  "or",
  "the",
  "a",
  "an",
  "of",
  "for",
  "to",
  "in",
  "on",
  "with",
  "through",
  "m",
]);

/** Minimum length for a word to count as "distinctive" when corroborating a
 * requirement against evidence prose. Short words are too common to carry a
 * mapping on their own. */
const DISTINCTIVE_MIN_LENGTH = 5;

const SEVERITY_RANK: Record<RiskSeverity, number> = {
  critical: 0,
  elevated: 1,
  watch: 2,
  low: 3,
};

const CATEGORY_RANK: Record<RiskCategory, number> = {
  non_negotiable: 0,
  derailer: 1,
  capability_gap: 2,
  uncovered_competency: 3,
};

/** Ratings that count as weak evidence — the ones a risk register exists for. */
function isWeak(rating: EvidenceRating): boolean {
  return rating === "none" || rating === "limited";
}

function singular(token: string): string {
  return token.length > 3 && token.endsWith("s") && !token.endsWith("ss")
    ? token.slice(0, -1)
    : token;
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map(singular);
}

/** Tokens that can discriminate — stopwords removed, order preserved, deduped. */
function significantTokens(value: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const token of tokenize(value)) {
    if (STOPWORDS.has(token) || seen.has(token)) continue;
    seen.add(token);
    out.push(token);
  }
  return out;
}

type IndexedCompetency = {
  key: string;
  label: string;
  weight: number;
  /** Position in the supplied weight order — the final tie-break. */
  order: number;
  keyTokens: string[];
  labelTokens: string[];
  rating: EvidenceRating | null;
  evidence: string;
  evidenceTokens: Set<string>;
};

function ratingOf(entry: CompetencyAssessment | undefined): EvidenceRating | null {
  if (!entry) return null;
  return entry.rating in EVIDENCE_RATING_LABELS ? entry.rating : null;
}

/**
 * Join the operational weights to the recorded assessment. Weights are the
 * spine: a competency the search no longer weights is not a risk surface, and a
 * rating recorded against an unknown key has nothing to be a risk against.
 */
function indexCompetencies(
  weights: readonly OperationalWeight[],
  assessments: readonly CompetencyAssessment[]
): IndexedCompetency[] {
  const byKey = new Map<string, CompetencyAssessment>();
  for (const a of assessments) {
    if (!byKey.has(a.competency_key)) byKey.set(a.competency_key, a);
  }

  return weights.map((w, order) => {
    const recorded = byKey.get(w.competency_key);
    const evidence = recorded?.evidence ?? "";
    return {
      key: w.competency_key,
      label: w.label,
      weight: w.weight,
      order,
      keyTokens: significantTokens(w.competency_key),
      labelTokens: significantTokens(w.label),
      rating: ratingOf(recorded),
      evidence,
      evidenceTokens: new Set(tokenize(evidence)),
    };
  });
}

/** Absence of evidence is scored as no evidence, never skipped — the same rule
 * the evidence rollup uses, so a blank competency cannot look safe. */
function effectiveRating(competency: IndexedCompetency | null): EvidenceRating {
  return competency?.rating ?? "none";
}

function containsAll(tokens: string[], haystack: Set<string>): boolean {
  return tokens.length > 0 && tokens.every((t) => haystack.has(t));
}

/**
 * Pass 1 — map requirement prose to a competency by name. Every significant
 * word of the competency's key or label must appear in the prose, so the match
 * is precise by construction; partial overlaps stay unmatched rather than
 * asserting a link that isn't there. Ties go to the more specific name, then
 * the higher weight, then the supplied order.
 */
function matchByName(
  proseTokens: Set<string>,
  competencies: readonly IndexedCompetency[]
): IndexedCompetency | null {
  let best: IndexedCompetency | null = null;
  let bestSpecificity = 0;

  for (const c of competencies) {
    const matched = [c.keyTokens, c.labelTokens]
      .filter((tokens) => containsAll(tokens, proseTokens))
      .map((tokens) => tokens.length);
    if (matched.length === 0) continue;

    const specificity = Math.max(...matched);
    if (
      !best ||
      specificity > bestSpecificity ||
      (specificity === bestSpecificity && c.weight > best.weight)
    ) {
      best = c;
      bestSpecificity = specificity;
    }
  }

  return best;
}

/**
 * Pass 2 — the spec's "weak evidence text corroborates the requirement" path.
 * Only weakly-evidenced competencies are eligible: this exists to tie a
 * requirement to evidence that already fell short, not to discover strengths.
 */
function matchByEvidenceText(
  distinctive: string[],
  competencies: readonly IndexedCompetency[]
): IndexedCompetency | null {
  if (distinctive.length < MIN_CORROBORATING_TOKENS) return null;

  let best: IndexedCompetency | null = null;
  let bestOverlap = 0;

  for (const c of competencies) {
    if (!isWeak(effectiveRating(c)) || c.evidenceTokens.size === 0) continue;
    const overlap = distinctive.filter((t) => c.evidenceTokens.has(t)).length;
    if (overlap < MIN_CORROBORATING_TOKENS) continue;
    if (!best || overlap > bestOverlap || (overlap === bestOverlap && c.weight > best.weight)) {
      best = c;
      bestOverlap = overlap;
    }
  }

  return best;
}

function severityFor(category: RiskCategory, rating: EvidenceRating): RiskSeverity {
  switch (category) {
    case "non_negotiable":
      // A gap the profile called disqualifying, with nothing on file to close
      // it. Nothing outranks this.
      return isWeak(rating) ? "critical" : "low";
    case "derailer":
      return isWeak(rating) ? "elevated" : "low";
    case "capability_gap":
      // The condition is "lacks STRONG evidence", so moderate still surfaces —
      // at the lightest band that keeps it visible. Only strong clears it.
      if (rating === "none") return "elevated";
      if (rating === "limited" || rating === "moderate") return "watch";
      return "low";
    case "uncovered_competency":
      return "watch";
  }
}

function rationaleFor(
  category: RiskCategory,
  competency: IndexedCompetency | null,
  basis: RiskMatchBasis,
  rating: EvidenceRating
): string {
  if (category === "uncovered_competency" && competency) {
    return `${competency.label} is among the highest-weighted competencies for this search (weight ${competency.weight}) and the assessment records no evidence against it.`;
  }
  if (!competency) {
    return "No competency in this search maps to this requirement, so no evidence was recorded against it.";
  }
  const observed = competency.rating
    ? `the assessment recorded "${EVIDENCE_RATING_LABELS[rating]}"`
    : "the assessment records no rating";
  const link =
    basis === "evidence_text"
      ? "The recorded evidence text corroborates this requirement"
      : `Mapped to ${competency.label}`;
  return `${link} (weight ${competency.weight}), where ${observed}.`;
}

type DraftSignal = Omit<RiskSignal, "id">;

function buildSignal(
  category: RiskCategory,
  sourceText: string,
  competencies: readonly IndexedCompetency[]
): DraftSignal {
  const proseTokens = new Set(tokenize(sourceText));
  const distinctive = significantTokens(sourceText).filter(
    (t) => t.length >= DISTINCTIVE_MIN_LENGTH
  );

  const named = matchByName(proseTokens, competencies);
  const matched = named ?? matchByEvidenceText(distinctive, competencies);
  const basis: RiskMatchBasis = named
    ? "competency"
    : matched
      ? "evidence_text"
      : "unmatched";

  const rating = effectiveRating(matched);
  return {
    category,
    severity: severityFor(category, rating),
    source_text: sourceText,
    source_competency_key: matched?.key ?? null,
    source_competency_label: matched?.label ?? null,
    match_basis: basis,
    observed_rating: matched?.rating ?? null,
    observed_evidence: matched?.evidence ?? "",
    competency_weight: matched?.weight ?? null,
    rationale: rationaleFor(category, matched, basis, rating),
  };
}

/** Trimmed, de-duplicated requirement lines. Blank entries carry no
 * requirement, and a line repeated in one section is one risk, not two. */
function requirementLines(items: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const text = typeof item === "string" ? item.trim() : "";
    if (!text) continue;
    const fingerprint = text.toLowerCase();
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    out.push(text);
  }
  return out;
}

/**
 * The deterministic risk register for one candidate: profile requirements
 * joined to recorded evidence, each carrying an app-assigned severity.
 *
 * Ordered most severe first, then by category, then by the order the
 * requirements appear in the profile — so `sig-1` is always the signal a
 * reviewer should read first.
 */
export function computeRiskSignals(
  profile: RiskProfileSections,
  assessment: RiskAssessmentSections,
  weights: readonly OperationalWeight[]
): RiskSignal[] {
  const competencies = indexCompetencies(
    weights,
    assessment.competency_assessments ?? []
  );

  const drafts: DraftSignal[] = [];

  for (const text of requirementLines(profile.non_negotiable_gaps ?? [])) {
    drafts.push(buildSignal("non_negotiable", text, competencies));
  }
  for (const text of requirementLines(profile.potential_derailers ?? [])) {
    drafts.push(buildSignal("derailer", text, competencies));
  }
  const capabilities = [
    ...(profile.required_leadership_capabilities ?? []),
    ...(profile.required_functional_capabilities ?? []),
    ...(profile.required_operating_experience ?? []),
  ];
  for (const text of requirementLines(capabilities)) {
    drafts.push(buildSignal("capability_gap", text, competencies));
  }

  // A high-weight competency with nothing recorded against it is a gap even
  // when no profile prose named it. Competencies already carrying a signal are
  // skipped — the same gap twice reads as two gaps.
  const alreadySignalled = new Set(
    drafts.flatMap((d) => (d.source_competency_key ? [d.source_competency_key] : []))
  );
  const maxWeight = competencies.reduce((max, c) => Math.max(max, c.weight), 0);
  for (const c of competencies) {
    if (c.weight <= 0 || maxWeight <= 0) continue;
    if (c.weight < maxWeight * HIGH_WEIGHT_FRACTION) continue;
    if (effectiveRating(c) !== "none") continue;
    if (alreadySignalled.has(c.key)) continue;
    drafts.push({
      category: "uncovered_competency",
      severity: severityFor("uncovered_competency", "none"),
      source_text: c.label,
      source_competency_key: c.key,
      source_competency_label: c.label,
      match_basis: "competency",
      observed_rating: c.rating,
      observed_evidence: c.evidence,
      competency_weight: c.weight,
      rationale: rationaleFor("uncovered_competency", c, "competency", "none"),
    });
  }

  return drafts
    .map((draft, order) => ({ draft, order }))
    .sort(
      (a, b) =>
        SEVERITY_RANK[a.draft.severity] - SEVERITY_RANK[b.draft.severity] ||
        CATEGORY_RANK[a.draft.category] - CATEGORY_RANK[b.draft.category] ||
        a.order - b.order
    )
    .map(({ draft }, index) => ({ id: `sig-${index + 1}`, ...draft }));
}

/**
 * Counts by severity band — the only aggregate a risk review reports. It
 * measures unaddressed areas in the evidence on file (diligence exposure), not
 * the candidate: there is no total, no score, and no threshold.
 */
export function computeSeveritySummary(
  signals: readonly RiskSignal[]
): SeveritySummary {
  const summary: SeveritySummary = { critical: 0, elevated: 0, watch: 0, low: 0 };
  for (const signal of signals) {
    if (signal.severity in summary) summary[signal.severity] += 1;
  }
  return summary;
}
