import "server-only";
import { getAnthropic } from "@/lib/anthropic";
import {
  WEEKLY_REPORT_SCHEMA,
  WEEKLY_REPORT_SYSTEM_PROMPT,
  type WeeklyReport,
} from "./weekly-report-agent";
import { applySkillsToPrompt } from "@/lib/skills/skill-injector";

const WEEKLY_REPORT_MODEL = "claude-sonnet-4-6";

export type WeeklyReportInput = {
  week_starting: string;
  project: {
    title: string;
    company_name: string;
    calibration: unknown;
    company_context: unknown;
  };
  candidates_sourced: Array<{
    id: string;
    name: string;
    current_title: string | null;
    current_company: string | null;
    archetype: string | null;
  }>;
  pipeline_moves: Array<{
    candidate_id: string;
    name: string;
    from_stage: string;
    to_stage: string;
    moved_at: string;
  }>;
  rank_moves: Array<{
    candidate_id: string;
    name: string;
    current_rank: number;
    previous_rank: number;
  }>;
  top_candidates: Array<{
    id: string;
    name: string;
    current_title: string | null;
    current_company: string | null;
    archetype: string | null;
    overall_score: number | null;
    tier: string | null;
    headline: string | null;
  }>;
  feedback: Array<{
    feedback_type: string;
    content: string;
    candidate_id: string | null;
    summary: string | null;
    created_at: string;
  }>;
};

export type RunWeeklyReportContext = {
  projectId: string;
  organizationId: string | null;
};

export async function runWeeklyReport(
  input: WeeklyReportInput,
  ctx: RunWeeklyReportContext
): Promise<{ report: WeeklyReport; model: string }> {
  const anthropic = getAnthropic();
  const userPrompt = JSON.stringify(input, null, 2);
  const system = await applySkillsToPrompt(WEEKLY_REPORT_SYSTEM_PROMPT, {
    projectId: ctx.projectId,
    organizationId: ctx.organizationId,
  });

  const response = await anthropic.messages.create({
    model: WEEKLY_REPORT_MODEL,
    max_tokens: 3000,
    system,
    messages: [{ role: "user", content: userPrompt }],
    output_config: {
      format: {
        type: "json_schema",
        schema: WEEKLY_REPORT_SCHEMA,
      },
    },
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Weekly-report response contained no text block");
  }

  const partial = JSON.parse(textBlock.text) as Omit<
    WeeklyReport,
    "week_starting"
  >;
  return {
    report: { ...partial, week_starting: input.week_starting },
    model: WEEKLY_REPORT_MODEL,
  };
}
