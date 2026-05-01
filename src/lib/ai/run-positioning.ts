import "server-only";
import { getAnthropic } from "@/lib/anthropic";
import {
  POSITIONING_SCHEMA,
  POSITIONING_SYSTEM_PROMPT,
  type PositioningResult,
} from "./positioning-agent";
import { applySkillsToPrompt } from "@/lib/skills/skill-injector";

const POSITIONING_MODEL = "claude-sonnet-4-6";

export type PositioningInput = {
  role: {
    role_title: string;
    company_name: string;
    calibration: unknown;
    company_context: unknown;
  };
  candidate: {
    candidate_id: string;
    full_name: string;
    current_title: string | null;
    current_company: string | null;
    archetype: string | null;
    profile: unknown;
    /** AI evaluation if available — gives the agent a head start. */
    evaluation: unknown;
    /** Recruiter override read, when present. */
    recruiter_assessment: unknown;
  };
  /** Up to ~10 recent feedback rows so the agent can adapt to client preferences. */
  recent_feedback: Array<{
    feedback_type: string;
    summary: string | null;
    content: string;
    created_at: string;
  }>;
};

export type RunPositioningContext = {
  projectId: string;
  organizationId: string | null;
};

export async function runPositioning(
  input: PositioningInput,
  ctx: RunPositioningContext
): Promise<PositioningResult> {
  const anthropic = getAnthropic();
  const userPrompt = JSON.stringify(input, null, 2);
  const system = await applySkillsToPrompt(POSITIONING_SYSTEM_PROMPT, {
    projectId: ctx.projectId,
    organizationId: ctx.organizationId,
  });

  const response = await anthropic.messages.create({
    model: POSITIONING_MODEL,
    max_tokens: 3000,
    system,
    messages: [{ role: "user", content: userPrompt }],
    output_config: {
      format: {
        type: "json_schema",
        schema: POSITIONING_SCHEMA,
      },
    },
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Positioning response contained no text block");
  }

  const partial = JSON.parse(textBlock.text) as Omit<
    PositioningResult,
    "generated_at"
  >;
  return {
    ...partial,
    generated_at: new Date().toISOString(),
  };
}
