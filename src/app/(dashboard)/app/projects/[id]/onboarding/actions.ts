"use server";

import { revalidatePath } from "next/cache";
import { runCalibrationDerivationAndPersist } from "@/lib/ai/derive-calibration";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { requireActionContext } from "@/lib/auth/access";
import {
  ANTI_PATTERNS_MAX,
  ANTI_PATTERNS_MIN,
  MUST_HAVES_MAX,
  MUST_HAVES_MIN,
  PRIORITY_SIGNALS_MAX,
  PRIORITY_SIGNALS_MIN,
  PRIORITY_WEIGHT_MAX,
  PRIORITY_WEIGHT_MIN,
  ROLE_ORIGIN_OPTIONS,
  STAKEHOLDERS_MAX,
  STAKEHOLDERS_MIN,
  type OnboardingResponses,
  type PrioritySignal,
  type RoleOrigin,
} from "@/lib/ai/onboarding-analysis";
import { runAction } from "@/lib/actions/run";
import type { ActionResult } from "@/lib/actions/result";

/** Sentence subject for a failure this file did not author. See `runAction`. */
const SUBJECT = "The calibration";

const ROLE_ORIGIN_VALUES = ROLE_ORIGIN_OPTIONS.map((o) => o.value) as readonly RoleOrigin[];

function clean(arr: string[]): string[] {
  return arr.map((s) => s.trim()).filter(Boolean);
}

function cleanPrioritySignals(arr: PrioritySignal[]): PrioritySignal[] {
  return arr
    .map((p) => ({ name: p.name.trim(), weight: Math.round(Number(p.weight)) }))
    .filter(
      (p) =>
        p.name.length > 0 &&
        Number.isFinite(p.weight) &&
        p.weight >= PRIORITY_WEIGHT_MIN &&
        p.weight <= PRIORITY_WEIGHT_MAX
    );
}

function validate(responses: OnboardingResponses): string | null {
  if (!ROLE_ORIGIN_VALUES.includes(responses.role_origin)) {
    return "Invalid role origin.";
  }
  const must = clean(responses.must_haves);
  if (must.length < MUST_HAVES_MIN || must.length > MUST_HAVES_MAX) {
    return `Provide between ${MUST_HAVES_MIN} and ${MUST_HAVES_MAX} must-haves.`;
  }
  const anti = clean(responses.anti_patterns);
  if (anti.length < ANTI_PATTERNS_MIN || anti.length > ANTI_PATTERNS_MAX) {
    return `Provide between ${ANTI_PATTERNS_MIN} and ${ANTI_PATTERNS_MAX} anti-patterns.`;
  }
  const stakeholders = responses.stakeholders.filter(
    (s) => s.name.trim() || s.role.trim() || s.focus.trim()
  );
  if (
    stakeholders.length < STAKEHOLDERS_MIN ||
    stakeholders.length > STAKEHOLDERS_MAX
  ) {
    return `Provide between ${STAKEHOLDERS_MIN} and ${STAKEHOLDERS_MAX} stakeholders.`;
  }
  const priorities = cleanPrioritySignals(responses.priority_signals);
  if (
    priorities.length < PRIORITY_SIGNALS_MIN ||
    priorities.length > PRIORITY_SIGNALS_MAX
  ) {
    return `Provide between ${PRIORITY_SIGNALS_MIN} and ${PRIORITY_SIGNALS_MAX} priority signals (each with a name and a weight ${PRIORITY_WEIGHT_MIN}–${PRIORITY_WEIGHT_MAX}).`;
  }
  return null;
}

export async function submitOnboarding(
  projectId: string,
  responses: OnboardingResponses
): Promise<ActionResult> {
  return runAction(SUBJECT, async () => {
    // Onboarding is where a mandate's calibration is set, so it is a mandate
    // write — a researcher may screen against a calibration but not redefine
    // the one every score in the search is measured by.
    await requireActionContext("mandates:write");

    const error = validate(responses);
    if (error) throw new Error(error);

    const sanitized: OnboardingResponses = {
      role_origin: responses.role_origin,
      must_haves: clean(responses.must_haves),
      anti_patterns: clean(responses.anti_patterns),
      stakeholders: responses.stakeholders
        .map((s) => ({
          name: s.name.trim(),
          role: s.role.trim(),
          focus: s.focus.trim(),
        }))
        .filter((s) => s.name || s.role || s.focus),
      priority_signals: cleanPrioritySignals(responses.priority_signals),
    };

    // The split (091: D2): the recruiter's answers are the recruiter's
    // act — stored under their own session BEFORE the agent is asked to
    // think. A refused or failed derivation leaves them saved (D5), and
    // the wizard's "Re-run calibration" path is the retry.
    const supabase = await createServerSupabaseClient();
    const { error: saveError } = await supabase
      .from("projects")
      .update({
        onboarding_responses: sanitized,
        updated_at: new Date().toISOString(),
      })
      .eq("id", projectId);
    if (saveError) {
      throw new Error(`Failed to save your answers: ${saveError.message}`);
    }

    // The judgment runs under the CALIBRATION AGENT's own session (091)
    // — the fifteenth principal. The action keeps the gate and the
    // cache invalidation; the seam owns the weights, the snapshot
    // (changed_by = the agent), and the trail event.
    const run = await runCalibrationDerivationAndPersist(projectId, sanitized);

    if (run.status === "agent_unavailable") {
      throw new Error(
        "The Calibration Agent could not run — an operator has suspended it " +
          "or its credentials are absent. Your answers are saved; re-run " +
          "calibration when it is restored."
      );
    }
    if (run.status === "unavailable") throw new Error("Project not found.");
    if (run.status !== "ready") {
      throw new Error(
        "Calibration failed. Your answers are saved — try again, and tell " +
          "an admin if it keeps happening."
      );
    }

    // Navigation is the client's job. redirect() from an action that both
    // revalidates and redirects came back as a 303 with an empty flight
    // body under next start, and the wizard hung on "Compiling Calibration"
    // forever — the router had nothing to commit and the awaited action
    // promise never settled.
    revalidatePath(`/app/projects/${projectId}`);
  });
}
