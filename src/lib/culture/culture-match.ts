// Deterministic culture-fit scoring. Pairs a candidate's psychology
// readings with the company culture profile and returns a 0–100 match
// score plus per-axis annotations the UI can chip-render.
//
// No AI call here — both the candidate psychology and the company
// culture profile come from upstream agents whose outputs already
// carry calibrated enums. The scorer reads those enums and computes a
// deterministic match.

import type {
  CandidatePsychology,
  ChangeOrientation,
  HierarchyPreference,
  PacePreference,
  RiskTolerance,
} from "@/lib/ai/psychology-agent";
import type {
  ChangeReadiness,
  CultureProfile,
  CultureRiskAppetite,
  DecisionSpeed,
  LeadershipPreference,
} from "@/lib/ai/company-culture-agent";

export type CultureMatchAxis = {
  /** Axis label rendered on the chip. */
  label: string;
  /** Candidate's reading. */
  candidate: string;
  /** Company's reading. */
  company: string;
  /** 0–100 — exact match = 100, adjacent = 60, opposite = 0. */
  score: number;
  /** True when the gap is wide enough to flag. */
  is_risk: boolean;
};

export type CultureMatch = {
  /** 0–100 weighted average of the per-axis scores. */
  overall: number;
  /** Per-axis breakdown the UI uses for chips / bars. */
  axes: CultureMatchAxis[];
  /** Short risk one-liners for the cards that don't pull the panel. */
  risks: string[];
};

const RISK_TOLERANCE_RANK: Record<RiskTolerance, number> = {
  conservative: 0,
  balanced: 1,
  aggressive: 2,
};
const RISK_APPETITE_RANK: Record<CultureRiskAppetite, number> = {
  conservative: 0,
  measured: 1,
  innovative: 2,
};

const PACE_RANK: Record<PacePreference, number> = {
  enterprise: 0,
  scale_up: 1,
  startup: 2,
};
const DECISION_SPEED_RANK: Record<DecisionSpeed, number> = {
  committee: 0,
  balanced: 1,
  fast: 2,
};

const HIERARCHY_RANK: Record<HierarchyPreference, number> = {
  flat: 0,
  balanced: 1,
  structured: 2,
};
// Operator (delivery, structured) ↔ Visionary (loose, narrative-led).
// We map the leadership_preference axis onto the same hierarchy axis
// so an "operator" company pairs with a "structured" candidate.
const LEADERSHIP_TO_HIERARCHY_RANK: Record<LeadershipPreference, number> = {
  visionary: 0,
  balanced: 1,
  operator: 2,
};

const CHANGE_ORIENTATION_RANK: Record<ChangeOrientation, number> = {
  status_quo: 0,
  incremental: 1,
  transformational: 2,
};
const CHANGE_READINESS_RANK: Record<ChangeReadiness, number> = {
  resistant: 0,
  incremental: 1,
  transformation_ready: 2,
};

/**
 * Compute the 0–100 match between a candidate's psychology profile
 * and the company's culture profile. Returns null when either side
 * hasn't been generated — the caller should render a "generate to
 * see" placeholder rather than zero-as-match.
 */
export function computeCultureMatch(
  psychology: CandidatePsychology | null | undefined,
  culture: CultureProfile | null | undefined
): CultureMatch | null {
  if (!psychology || !culture) return null;

  const axes: CultureMatchAxis[] = [
    axisScore(
      "Risk appetite",
      psychology.risk_tolerance.value,
      culture.risk_appetite.value,
      RISK_TOLERANCE_RANK,
      RISK_APPETITE_RANK
    ),
    axisScore(
      "Pace",
      psychology.pace_preference.value,
      culture.decision_speed.value,
      PACE_RANK,
      DECISION_SPEED_RANK
    ),
    axisScore(
      "Hierarchy",
      psychology.hierarchy_preference.value,
      culture.leadership_preference.value,
      HIERARCHY_RANK,
      LEADERSHIP_TO_HIERARCHY_RANK
    ),
    axisScore(
      "Change",
      psychology.change_orientation.value,
      culture.change_readiness.value,
      CHANGE_ORIENTATION_RANK,
      CHANGE_READINESS_RANK
    ),
  ];

  const overall = Math.round(
    axes.reduce((sum, a) => sum + a.score, 0) / axes.length
  );

  const risks: string[] = [];
  for (const a of axes) {
    if (a.is_risk) {
      risks.push(`${a.label}: ${a.candidate} candidate vs ${a.company} company.`);
    }
  }

  return { overall, axes, risks };
}

function axisScore<C extends string, K extends string>(
  label: string,
  candidateValue: C,
  companyValue: K,
  candidateRank: Record<C, number>,
  companyRank: Record<K, number>
): CultureMatchAxis {
  const cRank = candidateRank[candidateValue];
  const kRank = companyRank[companyValue];
  // The two enum families share a 0/1/2 axis — distance maps directly
  // to score: 0 distance = 100, 1 = 60, 2 = 0.
  const distance = Math.abs(cRank - kRank);
  const score = distance === 0 ? 100 : distance === 1 ? 60 : 0;
  return {
    label,
    candidate: candidateValue,
    company: companyValue,
    score,
    is_risk: distance >= 2,
  };
}
