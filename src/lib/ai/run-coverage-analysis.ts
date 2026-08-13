import "server-only";
import { getAnthropic } from "@/lib/anthropic";
import {
  COVERAGE_ANALYSIS_PROMPT_VERSION,
  COVERAGE_ANALYSIS_SCHEMA,
  COVERAGE_ANALYSIS_SYSTEM_PROMPT,
  normalizeCoverageAnalysis,
  type CoverageAnalysis,
  type CoverageAnalysisInput,
} from "./coverage-analysis-agent";
import { applySkillsToPrompt } from "@/lib/skills/skill-injector";

export const COVERAGE_ANALYSIS_MODEL = "claude-sonnet-4-6";
export { COVERAGE_ANALYSIS_PROMPT_VERSION };

export type RunCoverageAnalysisContext = {
  projectId: string;
  organizationId: string | null;
};

/**
 * Run coverage analysis for one executed sourcing run.
 *
 * Never call this from a render path — it is a billed model call taking tens of
 * seconds. The action wraps it in `after()` so the recruiter gets their page
 * back and the analysis lands when it lands.
 *
 * The result is passed through normalizeCoverageAnalysis() before it is
 * returned, so a response that drifts from the schema — an invented dimension,
 * a suggestion with no changes — is corrected here rather than at every read
 * site downstream.
 */
export async function runCoverageAnalysis(
  input: CoverageAnalysisInput,
  ctx: RunCoverageAnalysisContext
): Promise<CoverageAnalysis> {
  const anthropic = getAnthropic();

  const system = await applySkillsToPrompt(COVERAGE_ANALYSIS_SYSTEM_PROMPT, {
    projectId: ctx.projectId,
    organizationId: ctx.organizationId,
  });

  const response = await anthropic.messages.create({
    model: COVERAGE_ANALYSIS_MODEL,
    max_tokens: 2000,
    system,
    messages: [{ role: "user", content: JSON.stringify(input, null, 2) }],
    output_config: {
      format: {
        type: "json_schema",
        schema: COVERAGE_ANALYSIS_SCHEMA,
      },
    },
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Coverage-analysis response contained no text block");
  }

  const parsed = normalizeCoverageAnalysis(JSON.parse(textBlock.text));

  return {
    ...parsed,
    prompt_version: COVERAGE_ANALYSIS_PROMPT_VERSION,
    model_version: COVERAGE_ANALYSIS_MODEL,
    analysed_at: new Date().toISOString(),
  };
}
