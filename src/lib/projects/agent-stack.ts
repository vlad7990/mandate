/**
 * §197 — THE AGENT STACK SAYS WHAT IS ACTUALLY HAPPENING.
 *
 * The mandate page told a recruiter the CALIBRATE tile was ACTIVE — the
 * product's own idiom for "an agent is working", pulsing dot and all —
 * while nothing was running and nothing ever would, because
 * `dimension_weights` are only written when a human presses Start
 * onboarding. Meanwhile SPEC read "QUEUED · awaiting calibration", naming
 * the blocker, and the one tile that could unblock the chain carried no
 * action at all.
 *
 * That is the §175 defect class on the workspace's own furniture: the
 * system asserting something it does not know — here, that work is in
 * flight. A recruiter who trusts the tile waits for a machine that is
 * waiting for them.
 *
 * THE RULE THIS MODULE HOLDS, so it is a property rather than a promise
 * repeated in four ternaries:
 *
 *   · `active` means an agent is mid-run RIGHT NOW. Nothing else.
 *   · work that waits on a person is `blocked`, and a blocked tile
 *     carries the act that unblocks it (or, for intake, the retry sits in
 *     the failure banner directly above it on the same screen).
 *   · `queued` means waiting on an upstream STEP, not on a person.
 *
 * Onboarding's derivation is synchronous inside one server action
 * (onboarding/actions.ts) — the answers are saved first (091 D2/D5), then
 * the Calibration Agent runs. So there is no persisted in-flight state
 * for calibration to render: between renders it has either landed or it
 * has not. Answers saved with no weights is drive 128's real production
 * state, and its remedy is "Re-run calibration", not "Start onboarding".
 */
import type {
  AgentTileAction,
  AgentTileKey,
  AgentTileState,
} from "@/components/projects/agent-tiles";

export type AgentStackFacts = {
  /** Intake + company research have landed (`calibration_model.role_title`). */
  analysisReady: boolean;
  /** Intake recorded a failure sentence and analysis has not landed. */
  intakeFailed: boolean;
  /** `dimension_weights` exist — the mandate can be scored. */
  calibrated: boolean;
  /** The recruiter's onboarding answers are saved on the project row. */
  onboardingAnswered: boolean;
  spec: {
    hasAny: boolean;
    hasFinal: boolean;
    isGenerating: boolean;
  };
};

/**
 * True when the project row carries the recruiter's onboarding answers.
 *
 * `{}` counts as absent: §144's gap analysis already treats an empty
 * object as "nothing answered", and a stray empty object must not make
 * the tile offer a re-run of something that never ran.
 */
export function hasOnboardingAnswers(
  responses: Record<string, unknown> | null | undefined
): boolean {
  return Boolean(responses) && Object.keys(responses!).length > 0;
}

export function agentStackStates(
  facts: AgentStackFacts
): Record<AgentTileKey, AgentTileState> {
  const { analysisReady, intakeFailed, calibrated, spec } = facts;

  // Intake and company research share one predicate — they land together
  // and there is no separate signal for either. Genuinely in flight until
  // they land; `blocked` once intake has recorded a failure, because the
  // chain then waits on a human pressing Retry in the banner above.
  const upstream: AgentTileState = analysisReady
    ? "complete"
    : intakeFailed
      ? "blocked"
      : "active";

  let calibration: AgentTileState;
  if (calibrated) calibration = "complete";
  // Nothing to calibrate from yet: waiting on a STEP, not a person.
  else if (!analysisReady) calibration = "queued";
  else calibration = "blocked";

  let role_spec: AgentTileState;
  if (spec.hasFinal) role_spec = "complete";
  // The one genuinely in-flight case on this tile.
  else if (spec.isGenerating) role_spec = "active";
  // A draft exists and no agent is touching it — it waits on the human
  // who has to read it and mark it final.
  else if (spec.hasAny) role_spec = "blocked";
  // Buildable, but only a human click starts it.
  else if (calibrated) role_spec = "blocked";
  else role_spec = "queued";

  return {
    intake: upstream,
    company_research: upstream,
    calibration,
    role_spec,
  };
}

export function calibrationTileAction(
  projectId: string,
  facts: AgentStackFacts
): AgentTileAction {
  const href = `/app/projects/${projectId}/onboarding`;
  if (!facts.analysisReady) {
    return {
      label: "Start onboarding",
      href,
      enabled: false,
      disabledHint: "Awaiting intake",
    };
  }
  // Answers already saved — whether the weights landed or the derivation
  // failed, the act is the same one the wizard calls a re-run. Offering
  // "Start onboarding" over saved answers would deny the recruiter's own
  // work happened.
  const answered = facts.calibrated || facts.onboardingAnswered;
  return {
    label: answered ? "Re-run calibration" : "Start onboarding",
    href,
    enabled: true,
  };
}

export function specTileAction(
  projectId: string,
  facts: AgentStackFacts
): AgentTileAction {
  return {
    label: facts.spec.hasAny ? "Open Job Spec" : "Build Job Spec",
    href: `/app/projects/${projectId}/spec`,
    enabled: facts.calibrated,
    // Names the remedy, not the blocker — and the tile that performs it
    // now sits immediately to the left.
    disabledHint: facts.calibrated ? undefined : "Calibrate first",
  };
}

/**
 * The panel's meta line. Same honesty rule: "calibration pending" read as
 * in-flight when the truth was that nobody had started onboarding.
 */
export function agentStackMeta(
  facts: AgentStackFacts,
  agentCount: number
): string {
  if (!facts.analysisReady) {
    return facts.intakeFailed
      ? "Intake failed — retry to continue"
      : "Live analysis in progress";
  }
  const suffix = facts.calibrated
    ? "calibrated"
    : facts.onboardingAnswered
      ? "calibration incomplete — re-run"
      : "awaiting onboarding";
  return `${agentCount} agents · ${suffix}`;
}
