import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CalibrationModel } from "@/lib/ai/role-analysis";

// ────────────────────────────────────────────────────────────────────────
// §177 (F-A) — the watcher on the role seam.
//
// There are two sources of role truth. `job_specs` holds the spec the
// recruiter finalised; `projects.calibration_model` holds the role the
// Intake Agent inferred from the one-line input. The second is written
// ONCE and never revised — `finalize_job_spec` touches job_specs alone,
// and both post-intake writers of calibration_model
// (applyCalibrationSuggestionAction, recalibration/recalibrate.ts) write
// `dimension_weights` alone.
//
// Every scoring agent reads the calibration model. NEITHER candidate
// evaluation NOR CV parse reads the spec at all. So a recruiter could
// finalise a spec describing one job while evaluation kept scoring
// candidates against another — which is exactly what §175 found in
// production, where a candidate was marked down for lacking precisely
// what the finalised spec says is NOT required.
//
// Sourcing already fails closed on a missing final spec. This is the
// same door one table over, and it fails closed for the same reason:
// the output is a verdict about a named person.
// ────────────────────────────────────────────────────────────────────────

/**
 * The refusal, in the shape sourcing's `no_final_spec` already speaks:
 * name the problem, then name the remedy.
 */
export const SPEC_DRIFT_REFUSAL =
  "This mandate's calibration was derived before the final job spec, so " +
  "the role being scored is not the role the spec describes. Recalibrate " +
  "from the final spec before evaluating.";

export type SpecDrift = {
  /** True only when a final spec EXISTS and the calibration did not come from it. */
  stale: boolean;
  finalSpecId: string | null;
  finalSpecVersion: number | null;
  derivedFromSpecId: string | null;
};

export type SpecDriftInput = {
  finalSpecId: string | null;
  finalSpecVersion: number | null;
  calibration: Partial<CalibrationModel> | null;
};

/**
 * Staleness by IDENTITY, not by time (ruling A.1).
 *
 * A timestamp comparison would invite clock skew and, worse, would say
 * nothing about WHICH spec the calibration came from — the question the
 * door actually needs answered. Spec ids are stable and a new version is
 * a new row, so identity is both cheaper and more precise.
 *
 * Ruling A.3: a project with NO final spec is EARLY, not drifted. The
 * door does not fire. Blocking evaluation on every mandate whose spec
 * has not landed yet would break the ordinary order of work — a
 * recruiter parses CVs long before a spec is finalised. The stricter
 * reading (evaluation requires a final spec, as sourcing does) was
 * considered and ruled against.
 */
export function computeSpecDrift(input: SpecDriftInput): SpecDrift {
  const derivedFromSpecId = readDerivedFrom(input.calibration);

  // A.3 — no final spec, no door. This is the branch that keeps early
  // mandates working, and it is deliberately first.
  if (!input.finalSpecId) {
    return {
      stale: false,
      finalSpecId: null,
      finalSpecVersion: null,
      derivedFromSpecId,
    };
  }

  return {
    stale: derivedFromSpecId !== input.finalSpecId,
    finalSpecId: input.finalSpecId,
    finalSpecVersion: input.finalSpecVersion,
    derivedFromSpecId,
  };
}

/**
 * The stamp lives INSIDE the calibration_model JSONB, not in a column
 * (ruling A.2). A real FK `projects -> job_specs` would close a cycle
 * against `job_specs.project_id -> projects`, which is the exact shape
 * that produces PGRST201 ambiguity on bare embeds — a defect this
 * codebase has already shipped to production twice. It would also force
 * an AMBIGUOUS_PAIRS regeneration in embed-ambiguity.test.ts. The trade
 * is referential integrity, which is bought back by the fact that a
 * dangling id reads as "stale" and refuses, i.e. it fails closed.
 */
function readDerivedFrom(
  calibration: Partial<CalibrationModel> | null
): string | null {
  const value = calibration?.derived_from_spec_id;
  return typeof value === "string" && value.length > 0 ? value : null;
}

type FinalSpecRow = { id: string; version: number };

/**
 * Read the project's final spec and compare. No embed: `job_specs` is
 * reached directly by project_id, because a bare embed on a table with a
 * composite `_in_org` twin returns nothing and `!inner` does not
 * disambiguate it.
 */
export async function loadSpecDrift(
  supabase: SupabaseClient,
  projectId: string,
  calibration: Partial<CalibrationModel> | null
): Promise<SpecDrift> {
  const { data } = await supabase
    .from("job_specs")
    .select("id, version")
    .eq("project_id", projectId)
    .eq("is_final", true)
    .maybeSingle<FinalSpecRow>();

  return computeSpecDrift({
    finalSpecId: data?.id ?? null,
    finalSpecVersion: data?.version ?? null,
    calibration,
  });
}

/**
 * The door itself. Throws the refusal when the calibration is stale, so
 * every caller refuses in exactly the same words.
 */
export async function assertCalibrationMatchesSpec(
  supabase: SupabaseClient,
  projectId: string,
  calibration: Partial<CalibrationModel> | null
): Promise<void> {
  const drift = await loadSpecDrift(supabase, projectId, calibration);
  if (drift.stale) {
    throw new Error(SPEC_DRIFT_REFUSAL);
  }
}
