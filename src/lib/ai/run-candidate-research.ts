import "server-only";
import { getAnthropic } from "@/lib/anthropic";
import {
  CANDIDATE_INTELLIGENCE_SCHEMA,
  CANDIDATE_INTELLIGENCE_SYSTEM_PROMPT,
  type CandidateIntelligenceReport,
} from "./candidate-research-agent";
import { applySkillsToPrompt } from "@/lib/skills/skill-injector";

const CANDIDATE_RESEARCH_MODEL = "claude-sonnet-4-6";
const WEB_SEARCH_MAX_USES = 7;

export type RunCandidateResearchInput = {
  candidate: {
    full_name: string;
    current_title: string | null;
    current_company: string | null;
    /** Optional — narrows identity disambiguation. */
    location: string | null;
    /** Optional — used as a research hint when present. */
    linkedin_url: string | null;
    github_url: string | null;
    website_url: string | null;
    /** Trimmed parsed CV — narrative + roles + tech exposure. The
     * model uses this to anchor identity verification and to flag
     * gaps between public presence and CV claims. */
    cv_summary: unknown;
  };
};

export type RunCandidateResearchContext = {
  projectId: string;
  candidateId: string;
  organizationId: string | null;
};

/**
 * Pull the URLs Claude actually fetched out of the response. Mirrors
 * the company-intelligence implementation — sources are attached
 * server-side rather than trusting the LLM not to invent URLs.
 */
function extractSources(content: ReadonlyArray<unknown>): string[] {
  const urls: string[] = [];
  for (const block of content) {
    if (
      !block ||
      typeof block !== "object" ||
      (block as { type?: unknown }).type !== "web_search_tool_result"
    ) {
      continue;
    }
    const inner = (block as { content?: unknown }).content;
    if (!Array.isArray(inner)) continue;
    for (const item of inner) {
      if (
        item &&
        typeof item === "object" &&
        (item as { type?: unknown }).type === "web_search_result" &&
        typeof (item as { url?: unknown }).url === "string"
      ) {
        urls.push((item as { url: string }).url);
      }
    }
  }
  return Array.from(new Set(urls));
}

export async function runCandidateResearch(
  input: RunCandidateResearchInput,
  ctx: RunCandidateResearchContext
): Promise<CandidateIntelligenceReport> {
  const anthropic = getAnthropic();

  const userPrompt = JSON.stringify(
    {
      candidate_name: input.candidate.full_name,
      current_title: input.candidate.current_title,
      current_company: input.candidate.current_company,
      location: input.candidate.location,
      known_links: {
        linkedin_url: input.candidate.linkedin_url,
        github_url: input.candidate.github_url,
        website_url: input.candidate.website_url,
      },
      cv_summary: input.candidate.cv_summary,
    },
    null,
    2
  );

  const system = await applySkillsToPrompt(
    CANDIDATE_INTELLIGENCE_SYSTEM_PROMPT,
    {
      projectId: ctx.projectId,
      organizationId: ctx.organizationId,
    }
  );

  const response = await anthropic.messages.create({
    model: CANDIDATE_RESEARCH_MODEL,
    max_tokens: 8000,
    system,
    messages: [{ role: "user", content: userPrompt }],
    tools: [
      {
        type: "web_search_20250305",
        name: "web_search",
        max_uses: WEB_SEARCH_MAX_USES,
      },
    ],
    output_config: {
      format: {
        type: "json_schema",
        schema: CANDIDATE_INTELLIGENCE_SCHEMA,
      },
    },
  });

  const textBlocks = response.content.filter(
    (b): b is Extract<typeof b, { type: "text" }> => b.type === "text"
  );
  const last = textBlocks[textBlocks.length - 1];
  if (!last) {
    throw new Error(
      "Candidate-research response contained no text block"
    );
  }

  const partial = JSON.parse(last.text) as Omit<
    CandidateIntelligenceReport,
    "generated_at" | "sources"
  >;

  return {
    ...partial,
    generated_at: new Date().toISOString(),
    sources: extractSources(response.content),
  };
}
