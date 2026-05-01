import "server-only";
import { getAnthropic } from "@/lib/anthropic";
import {
  ROLE_ANALYSIS_MAX,
  ROLE_ANALYSIS_MIN,
  ROLE_ANALYSIS_SCHEMA,
  ROLE_ANALYSIS_SYSTEM_PROMPT,
  type RoleAnalysisInput,
  type RoleAnalysisResult,
} from "./role-analysis-agent";
import { applySkillsToPrompt } from "@/lib/skills/skill-injector";

const ROLE_ANALYSIS_MODEL = "claude-sonnet-4-6";

export type RunRoleAnalysisContext = {
  projectId: string | null;
  organizationId: string | null;
};

export async function runRoleAnalysis(
  input: RoleAnalysisInput,
  ctx: RunRoleAnalysisContext
): Promise<RoleAnalysisResult> {
  if (input.candidates.length < ROLE_ANALYSIS_MIN) {
    throw new Error(
      `Role analysis requires at least ${ROLE_ANALYSIS_MIN} candidates.`
    );
  }
  if (input.candidates.length > ROLE_ANALYSIS_MAX) {
    throw new Error(
      `Role analysis is capped at ${ROLE_ANALYSIS_MAX} candidates.`
    );
  }

  const anthropic = getAnthropic();
  const userPrompt = JSON.stringify(input, null, 2);
  const system = await applySkillsToPrompt(ROLE_ANALYSIS_SYSTEM_PROMPT, {
    projectId: ctx.projectId,
    organizationId: ctx.organizationId,
  });

  const response = await anthropic.messages.create({
    model: ROLE_ANALYSIS_MODEL,
    max_tokens: 2000,
    system,
    messages: [{ role: "user", content: userPrompt }],
    output_config: {
      format: {
        type: "json_schema",
        schema: ROLE_ANALYSIS_SCHEMA,
      },
    },
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Role-analysis response contained no text block");
  }

  return JSON.parse(textBlock.text) as RoleAnalysisResult;
}
