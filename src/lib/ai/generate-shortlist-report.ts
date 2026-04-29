import "server-only";
import { getAnthropic } from "@/lib/anthropic";
import {
  SHORTLIST_REPORT_SCHEMA,
  SHORTLIST_REPORT_SYSTEM_PROMPT,
  type ShortlistReport,
} from "./shortlist-report";
import type { CalibrationModel, CompanyContext } from "./role-analysis";
import type { CandidateProfile } from "./cv-parsing";

const SHORTLIST_MODEL = "claude-sonnet-4-6";

export type ShortlistGenerationInput = {
  role_context: {
    title: string;
    role_title: string | null;
    inferred_scope: string | null;
    role_structure: CalibrationModel["role_structure"] | null;
  };
  company_context: Partial<CompanyContext>;
  calibration: Partial<CalibrationModel>;
  recruiter_narrative: string | null;
  slate: Array<{
    candidate_id: string;
    full_name: string;
    rank: number | null;
    overall_score: number | null;
    profile: Partial<CandidateProfile>;
    fit_dimensions: CandidateProfile["fit_dimensions"] | null;
  }>;
};

/**
 * Generate the submission-ready shortlist report. Synchronous —
 * the recruiter waits ~5–10s for the Anthropic round-trip while
 * the form button shows a pending state.
 */
export async function generateShortlistReport(
  input: ShortlistGenerationInput
): Promise<ShortlistReport> {
  if (input.slate.length < 1) {
    throw new Error("Shortlist requires at least 1 candidate.");
  }
  if (input.slate.length > 10) {
    throw new Error("Shortlist capped at 10 candidates.");
  }

  const anthropic = getAnthropic();
  const userPrompt = JSON.stringify(input, null, 2);

  const response = await anthropic.messages.create({
    model: SHORTLIST_MODEL,
    max_tokens: 3000,
    system: SHORTLIST_REPORT_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
    output_config: {
      format: {
        type: "json_schema",
        schema: SHORTLIST_REPORT_SCHEMA,
      },
    },
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Shortlist report response contained no text block");
  }

  return JSON.parse(textBlock.text) as ShortlistReport;
}
