import "server-only";
import { getAnthropic } from "@/lib/anthropic";
import {
  CANDIDATE_SEARCH_SCHEMA,
  CANDIDATE_SEARCH_SYSTEM_PROMPT,
  type CandidateSearchInputCandidate,
  type CandidateSearchResult,
} from "./candidate-search";

const SEARCH_MODEL = "claude-sonnet-4-6";

export async function runCandidateSearch(
  query: string,
  candidates: CandidateSearchInputCandidate[]
): Promise<CandidateSearchResult> {
  if (!query.trim()) {
    return {
      parsed_criteria: { intent: "Empty query.", must_haves: [], nice_to_haves: [] },
      matches: [],
    };
  }

  const anthropic = getAnthropic();
  const userPrompt = JSON.stringify(
    { query: query.trim(), candidates },
    null,
    2
  );

  const response = await anthropic.messages.create({
    model: SEARCH_MODEL,
    max_tokens: 2500,
    system: CANDIDATE_SEARCH_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
    output_config: {
      format: {
        type: "json_schema",
        schema: CANDIDATE_SEARCH_SCHEMA,
      },
    },
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Candidate-search response contained no text block");
  }

  return JSON.parse(textBlock.text) as CandidateSearchResult;
}
