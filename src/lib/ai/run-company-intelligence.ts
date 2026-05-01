import "server-only";
import { getAnthropic } from "@/lib/anthropic";
import {
  COMPANY_INTELLIGENCE_SCHEMA,
  COMPANY_INTELLIGENCE_SYSTEM_PROMPT,
  type CompanyIntelligenceReport,
} from "./company-intelligence-agent";
import { applySkillsToPrompt } from "@/lib/skills/skill-injector";

const COMPANY_INTELLIGENCE_MODEL = "claude-sonnet-4-6";
// Cap server-side searches per run. 7 dimensions but we tell Claude to
// combine adjacent ones — 7 is a generous ceiling, not a target.
const WEB_SEARCH_MAX_USES = 7;

export type RunCompanyIntelligenceInput = {
  company: {
    name: string;
    /** Optional canonical website. Passed to Claude as a research hint
     * — the model is free to ignore it if its searches surface a
     * better URL. */
    website?: string | null;
  };
  project: {
    role_title: string | null;
    industry: string | null;
    business_model: string | null;
    onboarding: unknown;
    calibration: unknown;
  };
};

export type RunCompanyIntelligenceContext = {
  projectId: string;
  organizationId: string | null;
};

/**
 * Pull every URL that Claude actually fetched via web_search out of the
 * response. Sources are attached server-side rather than letting the
 * LLM list them in JSON — the model has been known to invent
 * plausible-looking URLs that 404, and we'd rather show the recruiter
 * exactly what the model read.
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
    if (!Array.isArray(inner)) continue; // could be a WebSearchToolResultError
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
  // Dedupe while preserving first-seen order.
  return Array.from(new Set(urls));
}

export async function runCompanyIntelligence(
  input: RunCompanyIntelligenceInput,
  ctx: RunCompanyIntelligenceContext
): Promise<CompanyIntelligenceReport> {
  const anthropic = getAnthropic();

  const userPrompt = JSON.stringify(
    {
      company_name: input.company.name,
      company_website_hint: input.company.website ?? null,
      role_title: input.project.role_title,
      industry: input.project.industry,
      business_model: input.project.business_model,
      onboarding: input.project.onboarding,
      calibration: input.project.calibration,
    },
    null,
    2
  );

  const system = await applySkillsToPrompt(
    COMPANY_INTELLIGENCE_SYSTEM_PROMPT,
    {
      projectId: ctx.projectId,
      organizationId: ctx.organizationId,
    }
  );

  const response = await anthropic.messages.create({
    model: COMPANY_INTELLIGENCE_MODEL,
    // Tool calls + tool results stack in the context window; bump the
    // ceiling so the final structured JSON has room after 5–7 searches.
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
        schema: COMPANY_INTELLIGENCE_SCHEMA,
      },
    },
  });

  // Final assistant text block is the JSON payload. Earlier blocks are
  // the server_tool_use / web_search_tool_result pairs that Anthropic
  // executed for us — we only care about the last text block here, but
  // we DO mine the tool-result blocks for source URLs below.
  const textBlocks = response.content.filter(
    (b): b is Extract<typeof b, { type: "text" }> => b.type === "text"
  );
  const last = textBlocks[textBlocks.length - 1];
  if (!last) {
    throw new Error(
      "Company-intelligence response contained no text block"
    );
  }

  const partial = JSON.parse(last.text) as Omit<
    CompanyIntelligenceReport,
    "generated_at" | "sources"
  >;

  return {
    ...partial,
    generated_at: new Date().toISOString(),
    sources: extractSources(response.content),
  };
}
