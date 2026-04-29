import "server-only";
import { getAnthropic } from "@/lib/anthropic";
import {
  SOURCING_FULL_SCHEMA,
  SOURCING_FULL_SYSTEM_PROMPT,
  SOURCING_SINGLE_SCHEMA,
  SOURCING_SINGLE_SYSTEM_PROMPT,
  type SlotKey,
  type SourcingQueries,
} from "./sourcing-analysis";
import type { CalibrationModel, CompanyContext } from "./role-analysis";
import type { JobSpecSections } from "./job-spec-analysis";

const SOURCING_MODEL = "claude-sonnet-4-6";

export type GenerationContext = {
  job_spec: JobSpecSections;
  job_spec_version: number;
  calibration: Partial<CalibrationModel>;
  company: Partial<CompanyContext>;
};

/**
 * Generate all six sourcing strings (4 LinkedIn variants + Google X-Ray
 * + ATS) in a single Anthropic call. Synchronous — caller awaits the
 * result and inserts the rows in one transaction.
 */
export async function generateAllSourcingQueries(
  ctx: GenerationContext
): Promise<SourcingQueries> {
  const anthropic = getAnthropic();
  const userPrompt = JSON.stringify(
    {
      job_spec: ctx.job_spec,
      job_spec_version: ctx.job_spec_version,
      calibration: ctx.calibration,
      company: ctx.company,
    },
    null,
    2
  );

  const response = await anthropic.messages.create({
    model: SOURCING_MODEL,
    max_tokens: 2048,
    system: SOURCING_FULL_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
    output_config: {
      format: {
        type: "json_schema",
        schema: SOURCING_FULL_SCHEMA,
      },
    },
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Sourcing response contained no text block");
  }

  return JSON.parse(textBlock.text) as SourcingQueries;
}

/**
 * Regenerate a single sourcing string. The caller passes the slot to
 * regenerate, the current draft, and optional recruiter feedback. The
 * model returns one new query string.
 */
export async function regenerateSingleQuery(
  slot: SlotKey,
  current: string,
  feedback: string,
  ctx: GenerationContext
): Promise<string> {
  const anthropic = getAnthropic();
  const userPrompt = JSON.stringify(
    {
      slot,
      current,
      feedback,
      job_spec: ctx.job_spec,
      calibration: ctx.calibration,
      company: ctx.company,
    },
    null,
    2
  );

  const response = await anthropic.messages.create({
    model: SOURCING_MODEL,
    max_tokens: 1024,
    system: SOURCING_SINGLE_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
    output_config: {
      format: {
        type: "json_schema",
        schema: SOURCING_SINGLE_SCHEMA,
      },
    },
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Sourcing single-regen response contained no text block");
  }

  const parsed = JSON.parse(textBlock.text) as { query: string };
  return parsed.query;
}
