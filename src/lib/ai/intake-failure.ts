/**
 * The stuck-mandate retry surface's vocabulary (090) — in its own
 * module, without `server-only`, so the sentence harness can pin it.
 *
 * These are the only sentences that ever land on projects.intake_error,
 * and they are authored constants rather than messages fished out of a
 * catch: the column is rendered verbatim with a retry CTA, so a
 * provider body must never outlive the request there. The seam runs
 * them through `safeFailureMessage` anyway (belt and braces — the same
 * boundary job_specs' generation_error crosses), and the test pins
 * both directions: authored text passes untouched, provider shapes are
 * replaced.
 */

/** How the run was asked for — the trail names it (D4). */
export type IntakeTrigger = "create" | "retry";

/** Sentence subject for a failure the seam did not author. */
export const INTAKE_SUBJECT = "Intake analysis";

export const INTAKE_FAILED_SENTENCE =
  "Intake analysis failed. This has been logged — retry, and tell an admin if it keeps happening.";

export const INTAKE_AGENT_UNAVAILABLE_SENTENCE =
  "The Intake Agent could not run — an operator has suspended it or its credentials are absent. The brief is intact — retry when the agent is restored.";

export const INTAKE_TIMED_OUT_SENTENCE =
  "Intake analysis timed out. Please retry.";
