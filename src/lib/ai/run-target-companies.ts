import "server-only";
import { markInferenceSchemaFailed, runInference } from "./inference";
import {
  TARGET_COMPANIES_SCHEMA,
  TARGET_COMPANIES_SYSTEM_PROMPT,
  type TargetCompaniesReport,
} from "./target-companies-agent";
import { applySkillsToPrompt } from "@/lib/skills/skill-injector";


export type RunTargetCompaniesInput = {
  role: {
    title: string | null;
    seniority?: string | null;
    function?: string | null;
  };
  company: {
    name: string;
    industry: string | null;
    business_model: string | null;
  };
  calibration: unknown;
  /** Optional archetype hint to bias the generation toward feeders/
   * companies that produce that archetype. */
  archetype_hint?: string | null;
};

export type RunTargetCompaniesContext = {
  projectId: string;
  organizationId: string | null;
};

export async function runTargetCompanies(
  input: RunTargetCompaniesInput,
  ctx: RunTargetCompaniesContext
): Promise<TargetCompaniesReport> {

  const userPrompt = JSON.stringify(input, null, 2);
  const system = await applySkillsToPrompt(TARGET_COMPANIES_SYSTEM_PROMPT, {
    projectId: ctx.projectId,
    organizationId: ctx.organizationId,
  });

  const response = await runInference("run_target_companies", {
    max_tokens: 2500,
    system,
    messages: [{ role: "user", content: userPrompt }],
    output_config: {
      format: {
        type: "json_schema",
        schema: TARGET_COMPANIES_SCHEMA,
      },
    },
  }, { projectId: ctx.projectId });

  try {
    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("Target-companies response contained no text block");
    }
    const partial = JSON.parse(textBlock.text) as Omit<
      TargetCompaniesReport,
      "generated_at"
    >;
    return {
      ...partial,
      generated_at: new Date().toISOString(),
    };
  } catch (err) {
    markInferenceSchemaFailed(response);
    throw err;
  }
}
