import "server-only";
import { getAnthropic } from "@/lib/anthropic";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  CALIBRATION_SYSTEM_PROMPT,
  CALIBRATION_WEIGHTS_SCHEMA,
  type CalibrationDerivation,
  type OnboardingResponses,
} from "./onboarding-analysis";
import type { CalibrationModel } from "./role-analysis";

const CALIBRATION_MODEL = "claude-sonnet-4-6";

type ProjectSnapshot = {
  calibration_model: Partial<CalibrationModel> | null;
  company_context: Record<string, unknown> | null;
};

export async function deriveAndStoreCalibration(
  projectId: string,
  responses: OnboardingResponses
): Promise<void> {
  const supabase = await createServerSupabaseClient();

  // Pull the existing calibration_model + company_context so we can (a) feed
  // them into the prompt as additional context and (b) merge weights without
  // clobbering role_title / inferred_scope / etc.
  const { data: project, error: fetchError } = await supabase
    .from("projects")
    .select("calibration_model, company_context")
    .eq("id", projectId)
    .single<ProjectSnapshot>();

  if (fetchError || !project) {
    throw new Error(
      `Failed to load project ${projectId} for calibration: ${fetchError?.message ?? "not found"}`
    );
  }

  const userPrompt = JSON.stringify(
    {
      onboarding_responses: responses,
      role_context: project.calibration_model ?? {},
      company_context: project.company_context ?? {},
    },
    null,
    2
  );

  const anthropic = getAnthropic();
  const response = await anthropic.messages.create({
    model: CALIBRATION_MODEL,
    max_tokens: 1024,
    system: CALIBRATION_SYSTEM_PROMPT,
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

  const derived = JSON.parse(textBlock.text) as CalibrationDerivation;

  const mergedCalibration: Partial<CalibrationModel> = {
    ...(project.calibration_model ?? {}),
    dimension_weights: derived.dimension_weights,
    weights_rationale: derived.weights_rationale,
  };

  const { error: updateError } = await supabase
    .from("projects")
    .update({
      onboarding_responses: responses,
      calibration_model: mergedCalibration,
      updated_at: new Date().toISOString(),
    })
    .eq("id", projectId);

  if (updateError) {
    throw new Error(
      `Failed to persist calibration weights: ${updateError.message}`
    );
  }

  // Record the initial calibration in the history timeline. Best-
  // effort — the recruiter sees the model on the project page even if
  // the snapshot fails.
  try {
    const { recordCalibrationSnapshot } = await import(
      "@/lib/calibration/history"
    );
    await recordCalibrationSnapshot(projectId, mergedCalibration, {
      change_type: "initial",
      change_reason: "Initial calibration from onboarding",
    });
  } catch (err) {
    console.error(
      "[derive-calibration] history snapshot failed",
      err
    );
  }
}
