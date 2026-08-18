import { SAMPLE_CANDIDATES, SAMPLE_MANDATES, type SampleCandidate } from "./data";
import { SAMPLE_CALIBRATION_HISTORY } from "./mandate-modules";

/**
 * Ranking, comparison and the portfolio analytics — W6.
 *
 * ## Scores are derived, not typed
 *
 * A candidate already carries a `fit` out of 100 in `SAMPLE_CANDIDATES`, and
 * that number is on the mandate list, the candidate list and the client
 * slate. The leaderboard and the comparison table therefore compute from it
 * rather than restating it: `overall` is `fit / 10`, and the five dimension
 * scores are a fixed profile per candidate which, weighted against the
 * current model and rounded, **is** the fit.
 * `reports-analytics.test.ts` checks that arithmetic, because a
 * leaderboard whose overall column disagrees with the candidate row two
 * clicks away is the exact drift W3 found between the mandate page and the
 * spec.
 *
 * ## What the agents may say here
 *
 * Two of these screens carry AI output about named people and both stay
 * inside the line CLAUDE.md draws and `sample-candidate-detail.tsx` set:
 *
 * **The trade-off analysis** on `/ranking/compare` is comparative and
 * anchored — "stronger on regulatory, 9 against 6" — never a verdict. The
 * real agent's own prompt says the callouts are *relative to the other
 * candidates in the set*, and that the dominant role weights drive the
 * synthesis; this follows it rather than inventing a voice.
 *
 * **The partner take** on `/comparison` is not agent output at all. It is
 * assembled in TypeScript by `buildPartnerTake` from tier counts and the top
 * weighted dimension, and every recommendation it makes is about the
 * *process* — run these to interview, hold the Tier 2 names in reserve,
 * review the calibration with the hiring manager. The fixture matches that
 * shape deliberately, so the sample teaches what the product does.
 *
 * Neither says whether to hire anybody. Neither carries a psychological
 * label. Nothing is inferred about a protected characteristic.
 */

export const DIMENSIONS = [
  "Regulatory",
  "Transformation",
  "Leadership",
  "Domain",
  "Technical",
] as const;
export type SampleDimension = (typeof DIMENSIONS)[number];

/**
 * Per-candidate dimension scores, out of 10.
 *
 * Authored so that the weighted mean against the current calibration model
 * lands on the candidate's own `fit`. That is what keeps the leaderboard,
 * the candidate detail and the client slate telling one story.
 */
const DIMENSION_SCORES: Record<string, Record<SampleDimension, number>> = {
  "sample-anand": {
    Regulatory: 9.5,
    Transformation: 9.2,
    Leadership: 8.4,
    Domain: 8.8,
    Technical: 6.4,
  },
  "sample-okonjo": {
    Regulatory: 9.0,
    Transformation: 7.6,
    Leadership: 9.4,
    Domain: 8.9,
    Technical: 6.2,
  },
  "sample-tavares": {
    Regulatory: 5.6,
    Transformation: 9.4,
    Leadership: 7.8,
    Domain: 6.4,
    Technical: 9.4,
  },
  "sample-lindqvist": {
    Regulatory: 7.4,
    Transformation: 7.0,
    Leadership: 6.6,
    Domain: 8.2,
    Technical: 7.2,
  },
  "sample-bello": {
    Regulatory: 8.2,
    Transformation: 6.2,
    Leadership: 7.0,
    Domain: 7.6,
    Technical: 6.0,
  },
  "sample-koval": {
    Regulatory: 5.8,
    Transformation: 6.6,
    Leadership: 5.9,
    Domain: 6.8,
    Technical: 7.4,
  },
};

/** The evidence behind each dimension. A score never renders without one. */
const DIMENSION_EVIDENCE: Record<string, Record<SampleDimension, string>> = {
  "sample-anand": {
    Regulatory: "HIPAA and MHRA estates; owned the clinical safety case",
    Transformation: "£48m records replacement, delivered",
    Leadership: "Two board reviews led; no COO reporting line",
    Domain: "6,400-staff regulated care provider, 4 yrs",
    Technical: "Architecture reviews chaired; five-year programme horizon",
  },
  "sample-okonjo": {
    Regulatory: "NHS information-governance regime, signed off twice",
    Transformation: "Trust-wide EPR migration, 19 months parallel running",
    Leadership: "90 → 240 engineers at under 9% attrition",
    Domain: "Acute trust, 5,200 staff",
    Technical: "Delivery through a platform team; not hands-on since 2019",
  },
  "sample-tavares": {
    Regulatory: "PCI-DSS across 900 stores; no clinical exposure",
    Transformation: "Two replatformings, one at £30m",
    Leadership: "Function of 160; one board presentation",
    Domain: "Retail, not regulated healthcare",
    Technical: "Still reviews architecture decisions personally; highest in the set",
  },
  "sample-lindqvist": {
    Regulatory: "Danish health data rules; regime not named on the CV",
    Transformation: "Platform rebuild in progress, not yet delivered",
    Leadership: "Team of 70; reports to a CTO rather than a board",
    Domain: "Care group of 2,100 staff",
    Technical: "Owns the platform architecture",
  },
  "sample-bello": {
    Regulatory: "HIQA, GDPR and MDR; medical-device adjacency",
    Transformation: "Modernisation programme scoped, delivery under way",
    Leadership: "Function of 95, grown from 60",
    Domain: "Medical devices, regulated but not provider-side",
    Technical: "Vendor-managed estate",
  },
  "sample-koval": {
    Regulatory: "GDPR only; no sector regime named",
    Transformation: "Greenfield build, no legacy migration",
    Leadership: "Team of 40; first role at this scale, no board exposure",
    Domain: "Diagnostics software vendor",
    Technical: "Hands-on; owns the deployment pipeline",
  },
};

export type SampleRankedCandidate = {
  readonly rank: number;
  readonly candidate: SampleCandidate;
  /** Out of 10, weighted against the current calibration model. */
  readonly overall: number;
  readonly tier: number;
  readonly scores: Record<SampleDimension, number>;
  readonly evidence: Record<SampleDimension, string>;
};

/** The current model's weights, keyed by dimension name. */
export function currentWeights(): Record<SampleDimension, number> {
  const out = {} as Record<SampleDimension, number>;
  for (const w of SAMPLE_CALIBRATION_HISTORY[0].weights) {
    out[w.name as SampleDimension] = w.weight;
  }
  return out;
}

/**
 * The leaderboard, ordered. Unscored candidates are excluded and rendered
 * separately — a candidate the product has not scored is a real state, and
 * inventing a number for them would teach the wrong thing.
 */
export function sampleRanking(mandateId: string): SampleRankedCandidate[] {
  const weights = currentWeights();

  return SAMPLE_CANDIDATES.filter(
    (c) => c.mandateId === mandateId && DIMENSION_SCORES[c.id]
  )
    .map((candidate) => {
      const scores = DIMENSION_SCORES[candidate.id];
      const overall =
        DIMENSIONS.reduce((n, d) => n + scores[d] * weights[d], 0) / 100;
      return {
        candidate,
        scores,
        evidence: DIMENSION_EVIDENCE[candidate.id],
        overall: Math.round(overall * 100) / 100,
        tier: candidate.tier ?? 4,
      };
    })
    .sort((a, b) => b.overall - a.overall)
    .map((r, i) => ({ ...r, rank: i + 1 }));
}

export function sampleUnranked(mandateId: string): readonly SampleCandidate[] {
  return SAMPLE_CANDIDATES.filter(
    (c) => c.mandateId === mandateId && !DIMENSION_SCORES[c.id]
  );
}

/* ── The trade-off analysis, for /ranking/compare ────────────────── */

/**
 * The three candidates the compare screen puts side by side, and what the
 * benchmarking agent said about them.
 *
 * Every claim names a dimension and the two numbers behind it. That is not
 * decoration: it is what makes the analysis checkable, and a claim a reader
 * can check is decision support rather than a verdict.
 */
export const SAMPLE_TRADE_OFF = {
  candidateIds: ["sample-anand", "sample-okonjo", "sample-tavares"] as const,
  synthesis:
    "Against this model, Priya Anand and Daniel Okonjo separate from Rafael Tavares on regulatory, which carries 26 of the 100 weight after the last recalibration: 9.5 and 9.0 against 5.6. Between the two leaders the gap is narrow and moves with what the client values next — Anand is ahead on transformation (9.2 against 7.6) with a delivered replacement behind it, Okonjo on leadership (9.4 against 8.4) with the larger team build.",
  riskVector:
    "All three are weakest on technical, the lightest-weighted dimension at 14. Tavares is the exception at 8.6 and is also the one whose regulatory exposure is PCI rather than clinical — so the set trades sector fit against hands-on depth, and the current weights resolve that against him. If the hiring manager's stated interest in parallel running becomes a scored dimension, Okonjo's 19 months of it is the only direct evidence in the set.",
  optimalPivot:
    "The two leaders are close enough that ordering them on score alone is over-reading a 0.2 gap. The question that separates them is whether the board wants the replacement delivered by someone who has done exactly this before, or the function built by someone who has grown one at this scale — and that is a conversation with the CEO, not a calculation.",
  callouts: [
    {
      candidateId: "sample-anand",
      direction: "stronger",
      dimension: "Transformation",
      body: "9.2 against 7.6 and 9.4 — a delivered £48m replacement, where Okonjo's ran with 19 months of parallel operation Larkspur cannot repeat.",
    },
    {
      candidateId: "sample-anand",
      direction: "weaker",
      dimension: "Leadership",
      body: "8.4 against Okonjo's 9.4. Two board reviews led, but no direct reporting line to a board before this.",
    },
    {
      candidateId: "sample-okonjo",
      direction: "stronger",
      dimension: "Leadership",
      body: "9.4 — 90 to 240 engineers at under 9% attrition, the largest team build in the set.",
    },
    {
      candidateId: "sample-okonjo",
      direction: "weaker",
      dimension: "Transformation",
      body: "7.6. The migration was real but ran alongside the old system for 19 months, which is the constraint the CMO has raised twice.",
    },
    {
      candidateId: "sample-tavares",
      direction: "stronger",
      dimension: "Technical",
      body: "9.4, the highest in the set — still reviews architecture decisions personally.",
    },
    {
      candidateId: "sample-tavares",
      direction: "weaker",
      dimension: "Regulatory",
      body: "5.6 against 9.5 and 9.0. PCI-DSS across 900 stores is a named regime, but not the clinical one this mandate scores on.",
    },
  ],
} as const;

/* ── The full comparison, for /comparison ────────────────────────── */

export const SAMPLE_COMPARISON = {
  /** Tier buckets, in the product's own bands. */
  bands: [
    { label: "Scored", tier: 1, hint: "Meets the calibration on every weighted dimension" },
    { label: "Viable", tier: 2, hint: "Meets it on the heaviest dimensions" },
    { label: "Stretch", tier: 3, hint: "One or more material gaps" },
    { label: "Off", tier: 4, hint: "Does not meet the calibration" },
  ],
  primarySlate: ["sample-anand", "sample-okonjo"] as const,
  backupSlate: ["sample-tavares", "sample-lindqvist"] as const,
  /**
   * Both strings mirror `buildRealityStatement` and `buildPartnerTake`,
   * which are template functions over the numbers — not an agent. Every
   * recommendation is about the process, which is the shape the product
   * already has and the reason this screen needed no new judgement call.
   */
  realityStatement:
    "Six of the eighteen candidates sourced have been scored against the current model. Two land at Tier 1 and three at Tier 2, against a calibration that weights regulatory at 26 — the narrowest supply constraint on this search, and the one the last recalibration tightened.",
  partnerTake:
    "Priya Anand leads the field at 8.65 overall (Tier 1), anchored on regulatory where she scores 9.5/10. Daniel Okonjo backs the slate at 8.36 (Tier 1); Rafael Tavares at 7.55 (Tier 2). The slate is workable. Recommend leading with the Tier 1 names and holding the Tier 2 backups in reserve in case the primary set declines.",
} as const;

/* ── Portfolio analytics ─────────────────────────────────────────── */

/**
 * Everything on `/app/analytics` derives from `SAMPLE_MANDATES`, because the
 * page is a projection of the portfolio and a typed total is a number that
 * can disagree with the list it summarises.
 */
export function samplePortfolio() {
  const mandates = SAMPLE_MANDATES;
  const totalCandidates = mandates.reduce((n, m) => n + m.candidates, 0);
  const atRisk = mandates.filter((m) => m.health !== "on_track");

  const byStage = new Map<string, number>();
  for (const c of SAMPLE_CANDIDATES) {
    byStage.set(c.stage, (byStage.get(c.stage) ?? 0) + 1);
  }

  return {
    activeSearches: mandates.length,
    totalCandidates,
    atRisk,
    averageDay: Math.round(
      mandates.reduce((n, m) => n + m.dayOfSearch, 0) / mandates.length
    ),
    byHealth: [
      { label: "On track", count: mandates.filter((m) => m.health === "on_track").length },
      { label: "Stalling", count: mandates.filter((m) => m.health === "stalling").length },
      { label: "Blocked", count: mandates.filter((m) => m.health === "blocked").length },
    ],
    byStage: [...byStage.entries()]
      .map(([stage, count]) => ({ stage, count }))
      .sort((a, b) => b.count - a.count),
    /** Candidates added per week, oldest first. Eight weeks, as the real chart. */
    velocity: [4, 6, 3, 7, 5, 8, 6, 5],
  };
}

/* ── The submitted shortlist, for /shortlist ─────────────────────── */

/**
 * The shortlist as a **record of a submission**, not a builder.
 *
 * This route appeared in no table in `docs/sample-data-inventory.md` — a
 * gap in the original survey, found only when the module rail needed a
 * complete list of the mandate's screens. It was the last entry in
 * `SAMPLE_MODULES_PENDING`.
 *
 * The product's own screen is `ShortlistBuilder`: a pool on one side, a
 * slate on the other, drag to compose, generate a report, submit. Almost
 * all of that is a write, and the standing call since `5107767` is that
 * the sample ships no control it cannot honour.
 *
 * Rather than render a builder with its controls disabled — the worst of
 * both, since the controls are the screen — this shows the state the
 * mandate is actually in. `SAMPLE_MANDATES` puts Larkspur at **WITH
 * CLIENT**, which means the slate has gone. A submitted shortlist is
 * genuinely read-only in the product too: it is a record of what was sent
 * and when. So the sample is not a crippled builder, it is the screen
 * after the button was pressed, which is also the more interesting half.
 *
 * The slate itself is **not chosen here** — it is `SAMPLE_COMPARISON`'s
 * primary and backup sets, so the comparison screen and this one cannot
 * name different people. `reports-analytics.test.ts` asserts it.
 */
export const SAMPLE_SHORTLIST = {
  submittedDaysAgo: 3,
  submittedTo: "Dr Miriam Osei-Hart",
  submittedToRole: "Chief Executive · Larkspur Health",
  slateSize: 2,
  /**
   * Mirrors `ShortlistReport`, which is agent-generated. Every judgement
   * is comparative and anchored on the weighted dimensions — the same
   * line the ranking comparison prompt draws, and the same precedent
   * `sample-candidate-detail.tsx` set: a claim never travels without the
   * evidence behind it.
   */
  executiveSummary:
    "Two candidates are submitted for the Chief Technology Officer role at Larkspur Health, both at Tier 1 against the current calibration. Both have carried a platform replacement to completion inside a regulated provider, which was the constraint that removed most of the pool. They differ on what they bring after that, and the choice between them is a choice about which risk Larkspur would rather carry.",
  slateRationale:
    "Regulatory carries 26 of the 100 weight after the day-22 recalibration, and it is the dimension the field thins on: of six scored candidates only these two clear 9.0. The Tier 2 names are held in reserve rather than submitted, because putting a 7.55 beside an 8.65 invites the client to reject the slate rather than choose within it.",
  briefs: [
    {
      candidateId: "sample-anand",
      recommendation: "advance" as const,
      strengths: [
        "Delivered a £48m platform replacement end to end, with the parallel-running period documented",
        "Highest regulatory score in the field at 9.5, on clinical rather than adjacent exposure",
        "Two board reviews led, both on the record",
      ],
      risks: [
        "Team build tops out at 140 engineers; Larkspur's target is 150+ within the year",
      ],
      tradeoff:
        "Ahead of Okonjo on transformation (9.2 against 7.6) with a delivered replacement behind it; behind him on leadership (8.4 against 9.4) and on the size of team built.",
    },
    {
      candidateId: "sample-okonjo",
      recommendation: "advance" as const,
      strengths: [
        "Built and held a 190-person function without attrition running above 12%",
        "Highest leadership score in the field at 9.4",
        "19 months of parallel operation — the only direct evidence of it in the set",
      ],
      risks: [
        "The replacement he ran was not one he started; the origination decision was his predecessor's",
        "Regulatory exposure is clinical but at trust rather than group scale",
      ],
      tradeoff:
        "Ahead of Anand on leadership and on the team build; behind her on transformation, where her evidence is a completed replacement and his is a period of parallel running.",
    },
  ],
  scenarios: [
    {
      headline: "If the platform decision is already made",
      detail:
        "Anand is the closer fit: her evidence is a replacement carried from business case to decommission, which is the shape of the work Larkspur has approved.",
    },
    {
      headline: "If the engineering function has to grow first",
      detail:
        "Okonjo has built past 150 and held it. Anand has not, and the gap is the one risk on her that the calibration does not weight heavily enough to surface.",
    },
    {
      headline: "If both decline",
      detail:
        "The Tier 2 backups are held rather than submitted. Tavares is the strongest of them at 7.55, and his regulatory exposure is PCI rather than clinical — a re-weighting conversation, not a shortlist one.",
    },
  ],
  nextStep:
    "Schedule round one with both in the same week. The comparison is only useful if the client sees them close together.",
} as const;
