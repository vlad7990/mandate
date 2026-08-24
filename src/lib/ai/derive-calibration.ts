import "server-only";
import { getAnthropic } from "@/lib/anthropic";
import {
  CALIBRATION_SYSTEM_PROMPT,
  CALIBRATION_WEIGHTS_SCHEMA,
  type CalibrationDerivation,
  type OnboardingResponses,
} from "./onboarding-analysis";
import type { CalibrationModel } from "./role-analysis";
import { signInCalibrationAgent } from "@/lib/agents/session";
import { applySkillsToPrompt } from "@/lib/skills/skill-injector";
import { captureSeamError } from "@/lib/observability/sentry";

const CALIBRATION_MODEL = "claude-sonnet-4-6";

type ProjectSnapshot = {
  organization_id: string | null;
  calibration_model: Partial<CalibrationModel> | null;
  company_context: Record<string, unknown> | null;
};

// ────────────────────────────────────────────────────────────────────────
// The seam (091): the CALIBRATION AGENT's session, signed in per run —
// the FIFTEENTH principal, the first conversion outside the fourteen-
// agent map. The split (D2): the recruiter's answers are stored by
// the ACTION under the recruiter's own session BEFORE this runs —
// their answers are their act, persisted before the agent is asked to
// think (D5 fail-soft). The agent reads the row it lawfully sees,
// judges, merge-writes ONLY dimension_weights + weights_rationale,
// snapshots the history under its own name (changed_by = the agent —
// the §30 interpreter precedent for derived weights), records the
// event with COUNTS (the answers' text never rides the trail), and
// signs out persisting nothing.
// ────────────────────────────────────────────────────────────────────────

export type CalibrationRunResult =
  | { status: "ready"; calibration: Partial<CalibrationModel> }
  /** Project missing or outside the agent's org-bound reach. */
  | { status: "unavailable" }
  /** The Calibration Agent refused to sign in — suspended from /ops
   * or credentials absent. Nothing was derived and NOTHING WAS
   * DESTROYED (D5): the recruiter's answers are already on the row,
   * stored by their own act before this ran. */
  | { status: "agent_unavailable"; reason: string }
  /** Derivation or persistence failed; logged. */
  | { status: "failed" };

export async function runCalibrationDerivationAndPersist(
  projectId: string,
  responses: OnboardingResponses
): Promise<CalibrationRunResult> {
  const session = await signInCalibrationAgent();
  if (!session.ok) {
    console.error(
      `[derive-calibration] The Calibration Agent could not run — an ` +
        `operator has suspended it or its credentials are absent. The ` +
        `recruiter's answers are saved. (${session.reason})`
    );
    return { status: "agent_unavailable", reason: session.reason };
  }

  try {
    const supabase = session.client;

    const { data: project, error: fetchError } = await supabase
      .from("projects")
      .select("organization_id, calibration_model, company_context")
      .eq("id", projectId)
      .maybeSingle<ProjectSnapshot>();
    if (fetchError || !project) return { status: "unavailable" };

    const userPrompt = JSON.stringify(
      {
        onboarding_responses: responses,
        role_context: project.calibration_model ?? {},
        company_context: project.company_context ?? {},
      },
      null,
      2
    );

    // The judgment carries the org's skills (D6 — the first of §73's
    // seven uninjected seams to close). The agent's own session is
    // the client; skills_agent_select (074) makes the read lawful.
    const system = await applySkillsToPrompt(CALIBRATION_SYSTEM_PROMPT, {
      projectId,
      organizationId: project.organization_id,
      client: supabase,
    });

    let derived: CalibrationDerivation;
    try {
      const anthropic = getAnthropic();
      const response = await anthropic.messages.create({
        model: CALIBRATION_MODEL,
        max_tokens: 1024,
        system,
        messages: [{ role: "user", content: userPrompt }],
        output_config: {
          format: {
            type: "json_schema",
            schema: CALIBRATION_WEIGHTS_SCHEMA,
          },
        },
      });
      const textBlock = response.content.find((b) => b.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        throw new Error("Calibration response contained no text block");
      }
      derived = JSON.parse(textBlock.text) as CalibrationDerivation;
    } catch (err) {
      captureSeamError("[derive-calibration] agent derivation failed", err);
      return { status: "failed" };
    }

    const wasRerun = Boolean(
      project.calibration_model?.dimension_weights
    );

    const mergedCalibration: Partial<CalibrationModel> = {
      ...(project.calibration_model ?? {}),
      dimension_weights: derived.dimension_weights,
      weights_rationale: derived.weights_rationale,
    };

    // The agent's merge-write: ONLY the derived keys change; the
    // recruiter's onboarding_responses were stored by the action and
    // are not touched here.
    const { error: updateError } = await supabase
      .from("projects")
      .update({
        calibration_model: mergedCalibration,
        updated_at: new Date().toISOString(),
      })
      .eq("id", projectId);
    if (updateError) {
      captureSeamError(
        "[derive-calibration] failed to persist the weights",
        updateError
      );
      return { status: "failed" };
    }

    // The snapshot, under the agent's own name — recordCalibrationSnapshot
    // fills changed_by from the client's auth.uid(), which is the agent
    // here (the §30 interpreter precedent for derived weights).
    // Best-effort, as before: the recruiter sees the model even if the
    // history write fails.
    try {
      const { recordCalibrationSnapshot } = await import(
        "@/lib/calibration/history"
      );
      await recordCalibrationSnapshot(
        projectId,
        mergedCalibration,
        {
          change_type: "initial",
          change_reason: "Initial calibration from onboarding",
        },
        supabase
      );
    } catch (err) {
      console.error("[derive-calibration] history snapshot failed", err);
    }

    // The trail (D4): the trigger and COUNTS — never the answers' text.
    const { error: eventErr } = await supabase.rpc("record_agent_event", {
      p_event_type: "calibration_derived",
      p_project_id: projectId,
      p_detail: {
        agent_kind: "calibration",
        trigger: wasRerun ? "rerun" : "initial",
        must_haves: responses.must_haves.length,
        anti_patterns: responses.anti_patterns.length,
        stakeholders: responses.stakeholders.length,
        priority_signals: responses.priority_signals.length,
      },
    });
    if (eventErr) {
      captureSeamError(
        "[derive-calibration] failed to record the calibration event",
        eventErr
      );
    }

    return { status: "ready", calibration: mergedCalibration };
  } finally {
    // Persist nothing (D3): revoke the run's session from GoTrue's ledger.
    await session.signOut();
  }
}
