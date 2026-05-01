import "server-only";
import { getAnthropic } from "@/lib/anthropic";
import {
  COMPANY_CULTURE_SCHEMA,
  COMPANY_CULTURE_SYSTEM_PROMPT,
  type CultureProfile,
} from "./company-culture-agent";
import { applySkillsToPrompt } from "@/lib/skills/skill-injector";

const COMPANY_CULTURE_MODEL = "claude-sonnet-4-6";

export type CompanyCultureInput = {
  company: unknown;
  onboarding: unknown;
  feedback_summaries: Array<{
    feedback_type: string;
    summary: string | null;
    content: string;
    created_at: string;
  }>;
};

export type RunCompanyCultureContext = {
  projectId: string;
  organizationId: string | null;
};

export async function runCompanyCulture(
  input: CompanyCultureInput,
  ctx: RunCompanyCultureContext
): Promise<CultureProfile> {
  const anthropic = getAnthropic();
  const userPrompt = JSON.stringify(input, null, 2);
  const system = await applySkillsToPrompt(COMPANY_CULTURE_SYSTEM_PROMPT, {
    projectId: ctx.projectId,
    organizationId: ctx.organizationId,
  });

  const response = await anthropic.messages.create({
    model: COMPANY_CULTURE_MODEL,
    max_tokens: 2000,
    system,
    messages: [{ role: "user", content: userPrompt }],
    output_config: {
      format: {
        type: "json_schema",
        schema: COMPANY_CULTURE_SCHEMA,
      },
    },
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Company-culture response contained no text block");
  }

  const partial = JSON.parse(textBlock.text) as Omit<
    CultureProfile,
    "generated_at"
  >;
  return {
    ...partial,
    generated_at: new Date().toISOString(),
  };
}
