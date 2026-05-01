import "server-only";
import { randomUUID } from "node:crypto";
import { getAnthropic } from "@/lib/anthropic";
import {
  HEALTH_AGENT_SCHEMA,
  HEALTH_AGENT_SYSTEM_PROMPT,
  type HealthSuggestion,
  type HealthSuggestionsBlob,
} from "./search-health-agent";
import { applySkillsToPrompt } from "@/lib/skills/skill-injector";
import type { ProjectHealthSummary } from "@/lib/metrics/types";

const HEALTH_MODEL = "claude-sonnet-4-6";

export type SearchHealthInput = {
  project: {
    title: string;
    company_name: string;
    calibration: unknown;
    company_context: unknown;
  };
  health: ProjectHealthSummary;
  pipeline_summary: {
    active_pool_size: number;
    rejected_count: number;
    weekly_velocity: number;
    funnel: Array<{ stage: string; count: number }>;
  };
  boolean_queries: Array<{
    slot: string;
    content: string;
    word_count: number;
    version: number;
  }>;
  recent_feedback: Array<{
    feedback_type: string;
    summary: string | null;
    content: string;
    created_at: string;
  }>;
};

export type RunSearchHealthContext = {
  projectId: string;
  organizationId: string | null;
};

export async function runSearchHealth(
  input: SearchHealthInput,
  ctx: RunSearchHealthContext
): Promise<HealthSuggestionsBlob> {
  const anthropic = getAnthropic();
  const userPrompt = JSON.stringify(input, null, 2);
  const system = await applySkillsToPrompt(HEALTH_AGENT_SYSTEM_PROMPT, {
    projectId: ctx.projectId,
    organizationId: ctx.organizationId,
  });

  const response = await anthropic.messages.create({
    model: HEALTH_MODEL,
    max_tokens: 2500,
    system,
    messages: [{ role: "user", content: userPrompt }],
    output_config: {
      format: {
        type: "json_schema",
        schema: HEALTH_AGENT_SCHEMA,
      },
    },
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Search-health response contained no text block");
  }

  const partial = JSON.parse(textBlock.text) as Omit<
    HealthSuggestionsBlob,
    "generated_at" | "health_status" | "suggestions"
  > & {
    suggestions: Array<Omit<HealthSuggestion, "id" | "dismissed">>;
  };

  // Mint stable ids server-side so dismissals can target individual
  // suggestions across cache invalidations.
  const suggestions: HealthSuggestion[] = partial.suggestions.map((s) => ({
    ...s,
    id: randomUUID(),
  }));

  return {
    generated_at: new Date().toISOString(),
    health_status: input.health.status as "stalled" | "at_risk",
    summary: partial.summary,
    suggestions,
  };
}
