import "server-only";
import { getAnthropic } from "@/lib/anthropic";
import {
  CLIENT_PSYCHOLOGY_SCHEMA,
  CLIENT_PSYCHOLOGY_SYSTEM_PROMPT,
  type ClientPsychology,
} from "./client-psychology-agent";
import { applySkillsToPrompt } from "@/lib/skills/skill-injector";

const CLIENT_PSYCHOLOGY_MODEL = "claude-sonnet-4-6";

export type ClientPsychologyInput = {
  project: {
    title: string;
    company_name: string;
    calibration: unknown;
    onboarding: unknown;
  };
  feedback_count: number;
  feedback_rows: Array<{
    feedback_type: string;
    content: string;
    candidate_id: string | null;
    candidate_name: string | null;
    interpreted_summary: string | null;
    triggered_recalibration: boolean;
    created_at: string;
  }>;
  hm_reviews: Array<{
    candidate_ratings: unknown;
    top_concern: string;
    hm_label: string;
    submitted_at: string;
  }>;
};

export type RunClientPsychologyContext = {
  projectId: string;
  organizationId: string | null;
};

export async function runClientPsychology(
  input: ClientPsychologyInput,
  ctx: RunClientPsychologyContext
): Promise<ClientPsychology> {
  const anthropic = getAnthropic();
  const userPrompt = JSON.stringify(input, null, 2);
  const system = await applySkillsToPrompt(CLIENT_PSYCHOLOGY_SYSTEM_PROMPT, {
    projectId: ctx.projectId,
    organizationId: ctx.organizationId,
  });

  const response = await anthropic.messages.create({
    model: CLIENT_PSYCHOLOGY_MODEL,
    max_tokens: 2500,
    system,
    messages: [{ role: "user", content: userPrompt }],
    output_config: {
      format: {
        type: "json_schema",
        schema: CLIENT_PSYCHOLOGY_SCHEMA,
      },
    },
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Client-psychology response contained no text block");
  }

  const partial = JSON.parse(textBlock.text) as Omit<
    ClientPsychology,
    "generated_at" | "feedback_count"
  >;
  return {
    ...partial,
    generated_at: new Date().toISOString(),
    feedback_count: input.feedback_count,
  };
}
