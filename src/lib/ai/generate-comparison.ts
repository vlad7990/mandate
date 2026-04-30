import "server-only";
import { getAnthropic } from "@/lib/anthropic";
import {
  COMPARISON_ANALYSIS_SCHEMA,
  COMPARISON_SYSTEM_PROMPT,
  type ComparisonAnalysis,
} from "./comparison-analysis";
import type { CalibrationModel } from "./role-analysis";
import type { CandidateProfile } from "./cv-parsing";
import { applySkillsToPrompt } from "@/lib/skills/skill-injector";

const COMPARISON_MODEL = "claude-sonnet-4-6";

export type ComparisonInputCandidate = {
  candidate_id: string;
  full_name: string;
  current_title: string | null;
  current_company: string | null;
  archetype: string | null;
  profile: Partial<CandidateProfile>;
  rank: number | null;
  overall_score: number | null;
};

export type ComparisonInput = {
  calibration: Partial<CalibrationModel>;
  candidates: ComparisonInputCandidate[];
  /** Skill-injection scope. Optional. */
  skill_context?: {
    project_id: string | null;
    organization_id: string | null;
  };
};

/**
 * Generate the AI trade-off analysis for a side-by-side comparison.
 * Synchronous — caller awaits the ~3–5s Anthropic round-trip and renders
 * the result alongside the comparison grid.
 */
export async function generateComparisonAnalysis(
  input: ComparisonInput
): Promise<ComparisonAnalysis> {
  if (input.candidates.length < 2) {
    throw new Error("Comparison requires at least 2 candidates.");
  }
  if (input.candidates.length > 3) {
    throw new Error("Comparison capped at 3 candidates.");
  }

  const anthropic = getAnthropic();
  const userPrompt = JSON.stringify(input, null, 2);
  const system = await applySkillsToPrompt(COMPARISON_SYSTEM_PROMPT, {
    projectId: input.skill_context?.project_id ?? null,
    organizationId: input.skill_context?.organization_id ?? null,
  });

  const response = await anthropic.messages.create({
    model: COMPARISON_MODEL,
    max_tokens: 1500,
    system,
    messages: [{ role: "user", content: userPrompt }],
    output_config: {
      format: {
        type: "json_schema",
        schema: COMPARISON_ANALYSIS_SCHEMA,
      },
    },
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Comparison response contained no text block");
  }

  return JSON.parse(textBlock.text) as ComparisonAnalysis;
}
