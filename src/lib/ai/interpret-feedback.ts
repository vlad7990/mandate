import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAnthropic } from "@/lib/anthropic";
import {
  FEEDBACK_INTERPRETATION_SCHEMA,
  FEEDBACK_INTERPRETATION_SYSTEM_PROMPT,
  type FeedbackInterpretation,
  type FeedbackType,
} from "./feedback-analysis";
import type { CalibrationModel } from "./role-analysis";
import type { OnboardingResponses } from "./onboarding-analysis";
import type { CandidateProfile } from "./cv-parsing";
import { applySkillsToPrompt } from "@/lib/skills/skill-injector";

const FEEDBACK_MODEL = "claude-sonnet-4-6";

export type InterpretFeedbackInput = {
  /** The new feedback row's content + type. */
  new_feedback: {
    type: FeedbackType;
    content: string;
    candidate_id: string | null;
    submitted_role: string | null;
  };
  /**
   * Up to ~10 prior feedback rows for context, oldest-first. The model
   * uses these to detect contradictions and bias patterns.
   */
  prior_feedback: Array<{
    type: FeedbackType;
    content: string;
    candidate_id: string | null;
    summary: string | null;
    triggered_recalibration: boolean;
    created_at: string;
  }>;
  /** Project context. */
  calibration: Partial<CalibrationModel>;
  onboarding: Partial<OnboardingResponses>;
  /** The candidate the feedback is about, when scoped to one. */
  candidate: {
    id: string;
    full_name: string;
    profile: Partial<CandidateProfile>;
  } | null;
  /** Skill-injection scope. Optional. */
  skill_context?: {
    project_id: string | null;
    organization_id: string | null;
  };
};

export type InterpretFeedbackOptions = {
  /**
   * The Supabase client the skill injector should read with. Required
   * where cookies() is unavailable (the HM portal's after() pipeline
   * passes the agent session); omitted, the injector builds an SSR
   * client from the caller's own session. A separate parameter, NOT a
   * field of `input`, because `input` is serialised wholesale into the
   * model prompt below.
   */
  skillClient?: SupabaseClient;
};

/**
 * Run the Feedback Interpretation Agent on one new feedback row.
 * Synchronous — the server action awaits the result before persisting
 * the row's `interpreted` JSONB and (optionally) recalibrating.
 */
export async function interpretFeedback(
  input: InterpretFeedbackInput,
  options?: InterpretFeedbackOptions
): Promise<FeedbackInterpretation> {
  const anthropic = getAnthropic();
  const userPrompt = JSON.stringify(input, null, 2);
  const system = await applySkillsToPrompt(FEEDBACK_INTERPRETATION_SYSTEM_PROMPT, {
    projectId: input.skill_context?.project_id ?? null,
    organizationId: input.skill_context?.organization_id ?? null,
    client: options?.skillClient,
  });

  const response = await anthropic.messages.create({
    model: FEEDBACK_MODEL,
    max_tokens: 1500,
    system,
    messages: [{ role: "user", content: userPrompt }],
    output_config: {
      format: {
        type: "json_schema",
        schema: FEEDBACK_INTERPRETATION_SCHEMA,
      },
    },
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Feedback interpretation response contained no text block");
  }

  return JSON.parse(textBlock.text) as FeedbackInterpretation;
}
