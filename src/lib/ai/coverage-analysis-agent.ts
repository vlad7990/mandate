// Coverage Analysis Agent — what a sourcing run's search could not reach.
//
// Design: docs/superpowers/specs/2026-08-12-sourcing-runs-design.md
// Client-safe (no `server-only`): the UI imports the types and the normalizer;
// run-coverage-analysis.ts imports the schema and prompt.
//
// The agent reads a run's strategy snapshot and an APP-COMPUTED summary of what
// the run actually returned (src/lib/sourcing/coverage.ts), and produces
// findings plus a suggested next version. It observes nothing itself — the
// distribution of companies, titles and locations is computed before the call,
// so the model cannot report a concentration that is not in the data.
//
// Three enforcements, none of which rest on the model behaving:
//
//   1. `dimension` is a closed enum in the SCHEMA, so the disallowed shape —
//      any demographic reading of a candidate pool — is not expressible.
//   2. The input carries only titles, companies and locations. The model
//      cannot infer demography from data it never receives.
//   3. normalizeCoverageAnalysis() drops findings outside the enum anyway.
//
// Belt and braces, because the failure here is not a bad paragraph. It is a
// product that quietly starts making protected-characteristic inferences about
// candidate pools, in a domain where that is unlawful in both major markets.

import {
  isCoverageDimension,
  type ApertureSummary,
  type CoverageDimension,
} from "@/lib/sourcing/coverage";

export const COVERAGE_ANALYSIS_PROMPT_VERSION = "sourcing-coverage-v1";

export type CoverageFinding = {
  dimension: CoverageDimension;
  /** What the search could not reach, grounded in the observed aperture. */
  finding: string;
  /** The concrete widening that would address it. */
  suggested_change: string;
};

export type SuggestedNextVersion = {
  label: string;
  changes: string[];
};

export type CoverageAnalysis = {
  coverage_findings: CoverageFinding[];
  suggested_next_version: SuggestedNextVersion | null;
  /** Stamped by the runner, echoed for provenance. */
  prompt_version?: string;
  model_version?: string;
  analysed_at?: string;
};

export const EMPTY_COVERAGE_ANALYSIS: CoverageAnalysis = {
  coverage_findings: [],
  suggested_next_version: null,
};

/** More than this and the recruiter is reading a report, not acting on it. */
export const MAX_FINDINGS = 6;
const MAX_CHANGES = 5;

export const COVERAGE_ANALYSIS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["coverage_findings", "suggested_next_version"],
  properties: {
    coverage_findings: {
      type: "array",
      maxItems: MAX_FINDINGS,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["dimension", "finding", "suggested_change"],
        properties: {
          dimension: {
            type: "string",
            // Closed set. The model cannot express a demographic dimension
            // because there is no value for one.
            enum: [
              "titles",
              "companies",
              "industries",
              "geography",
              "seniority",
              "exclusions",
            ],
            description:
              "Which structural facet of the search aperture this finding is about.",
          },
          finding: {
            type: "string",
            description:
              "1–2 sentences naming what the search could NOT reach. Ground it in the supplied aperture summary — cite the actual companies, titles or locations observed. Do not speculate about who was missed as people; speak only about where the query could and could not land.",
          },
          suggested_change: {
            type: "string",
            description:
              "1 sentence — the concrete structural widening that would address it (a company type to add, a title variant to include, an exclusion to relax).",
          },
        },
      },
      description:
        "2–5 findings, highest-leverage first. Only facets the evidence supports: if every row is missing a location, do not return a geography finding.",
    },
    suggested_next_version: {
      type: ["object", "null"],
      additionalProperties: false,
      required: ["label", "changes"],
      properties: {
        label: {
          type: "string",
          description:
            "A short name for the next version, in the register of the existing ones (\"Adjacent institutions\", \"Vendor-side operators\").",
        },
        changes: {
          type: "array",
          maxItems: MAX_CHANGES,
          items: { type: "string" },
          description:
            "The specific edits that would make the next version, each one actionable against the Boolean strings.",
        },
      },
      description:
        "Null when the findings do not justify another version — a search that is already wide enough should say so rather than manufacture work.",
    },
  },
} as const;

export const COVERAGE_ANALYSIS_SYSTEM_PROMPT = `You are an executive-search sourcing analyst. You are given one sourcing run: the strategy it snapshotted (brief, rationale, and the Boolean/X-Ray strings it bundled), and a computed summary of what it actually returned — the distribution of employers, titles and locations across its results.

Your job is to say where that search APERTURE was narrow, and what would widen it.

## What you are analysing

The shape of a query, not the merits of any person. A finding is about where the search could and could not land: which employers a Boolean string can reach, which title variants it excludes, which geographies it never touches, which exclusion clause is doing more work than intended.

## Ground every finding in the supplied summary

The aperture summary is computed from the actual results. Cite it. "All eight employers are bulge-bracket banks" is a finding; "the search probably missed some good people" is not. If a facet is mostly missing from the data — say two-thirds of rows carry no location — you cannot conclude anything about geography, and you should not return a geography finding at all.

Prefer fewer, sharper findings. Two that change what the recruiter does next beat five that restate the query back to them.

## Suggesting a next version

Only when the findings justify one. A search that is already appropriately wide should return null — a narrow search is sometimes correct, and manufacturing a refinement to look useful wastes a real person's afternoon. When you do suggest one, each change must be actionable against a Boolean string.

## Hard boundary

You analyse structural search aperture only: titles, companies, industries, geography, seniority bands, and over-tight exclusions. Those are the only dimensions available to you.

You never analyse, infer, estimate or comment on the demographic composition of a candidate pool — including but not limited to gender, ethnicity, age, nationality, religion, disability, or any proxy for them (names, schools as ethnic proxies, graduation years as age proxies, career gaps as caregiving proxies). This is not a stylistic preference. Inferring protected characteristics about a candidate pool is unlawful processing under GDPR Art. 9 and creates disparate-impact exposure under Title VII, and it is not what widening a funnel means. If you notice yourself reaching for such an observation, the correct output is a structural finding instead — "the search reaches only two employers" rather than any claim about who works at them.

Return strict JSON matching the schema.`;

// ---------------------------------------------------------------------------
// Normalizer
// ---------------------------------------------------------------------------

function asString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Coerce a model response — or a stored `analysis_json` — into a typed
 * analysis, dropping anything the product does not allow.
 *
 * This is the last line of the dimension guarantee. The schema stops a
 * compliant model; this stops a non-compliant one, a schema that drifts, and a
 * hand-edited row in the database.
 */
export function normalizeCoverageAnalysis(raw: unknown): CoverageAnalysis {
  if (!raw || typeof raw !== "object") return EMPTY_COVERAGE_ANALYSIS;
  const o = raw as Record<string, unknown>;

  const seen = new Set<string>();
  const findings: CoverageFinding[] = [];

  if (Array.isArray(o.coverage_findings)) {
    for (const item of o.coverage_findings) {
      if (!item || typeof item !== "object") continue;
      const f = item as Record<string, unknown>;

      // The enum check. Anything else — including a demographic dimension a
      // model invented — is dropped rather than rendered.
      if (!isCoverageDimension(f.dimension)) continue;

      const finding = asString(f.finding);
      const suggested_change = asString(f.suggested_change);
      if (!finding) continue;

      // One finding per dimension+text. Models repeat themselves across
      // dimensions and the repetition reads as more evidence than it is.
      const key = `${f.dimension}|${finding.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);

      findings.push({ dimension: f.dimension, finding, suggested_change });
      if (findings.length >= MAX_FINDINGS) break;
    }
  }

  let suggested: SuggestedNextVersion | null = null;
  if (o.suggested_next_version && typeof o.suggested_next_version === "object") {
    const s = o.suggested_next_version as Record<string, unknown>;
    const label = asString(s.label);
    const changes = Array.isArray(s.changes)
      ? s.changes
          .map(asString)
          .filter((c) => c.length > 0)
          .slice(0, MAX_CHANGES)
      : [];
    // A suggestion with no label or no changes is not a suggestion.
    if (label && changes.length > 0) suggested = { label, changes };
  }

  return {
    coverage_findings: findings,
    suggested_next_version: suggested,
    prompt_version: asString(o.prompt_version) || undefined,
    model_version: asString(o.model_version) || undefined,
    analysed_at: asString(o.analysed_at) || undefined,
  };
}

/** The payload handed to the model. Deliberately free of personal data. */
export type CoverageAnalysisInput = {
  brief: unknown;
  strategy_rationale: string;
  queries: Array<{ slot: string; content: string }>;
  yield: { result_count: number; imported_count: number };
  aperture: ApertureSummary;
};
