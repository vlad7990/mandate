import "server-only";
import { getAnthropic } from "@/lib/anthropic";
import {
  HM_INTELLIGENCE_SCHEMA,
  HIRING_MANAGER_RESEARCH_SYSTEM_PROMPT,
  type HiringManagerIntelligenceReport,
} from "./hiring-manager-research-agent";
import { applySkillsToPrompt } from "@/lib/skills/skill-injector";

const HM_RESEARCH_MODEL = "claude-sonnet-4-6";
const WEB_SEARCH_MAX_USES = 7;

export type RunHiringManagerResearchInput = {
  hm: {
    name: string;
    /** From the onboarding stakeholder row — typically the HM's title /
     * function in their organisation. */
    role: string | null;
    /** What the recruiter recorded as the HM's focus / brief. Helps
     * disambiguate when there are namesakes. */
    focus: string | null;
  };
  company: {
    name: string;
    industry: string | null;
    business_model: string | null;
  };
  project: {
    role_title: string | null;
  };
};

export type RunHiringManagerResearchContext = {
  projectId: string;
  organizationId: string | null;
};

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

export async function runHiringManagerResearch(
  input: RunHiringManagerResearchInput,
  ctx: RunHiringManagerResearchContext
): Promise<HiringManagerIntelligenceReport> {
  const anthropic = getAnthropic();

  const userPrompt = JSON.stringify(
    {
      hm_name: input.hm.name,
      hm_role: input.hm.role,
      hm_focus: input.hm.focus,
      company_name: input.company.name,
      company_industry: input.company.industry,
      company_business_model: input.company.business_model,
      role_title_being_hired: input.project.role_title,
    },
    null,
    2
  );

  const system = await applySkillsToPrompt(
    HIRING_MANAGER_RESEARCH_SYSTEM_PROMPT,
    {
      projectId: ctx.projectId,
      organizationId: ctx.organizationId,
    }
  );

  const response = await anthropic.messages.create({
    model: HM_RESEARCH_MODEL,
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
        schema: HM_INTELLIGENCE_SCHEMA,
      },
    },
  });

  const textBlocks = response.content.filter(
    (b): b is Extract<typeof b, { type: "text" }> => b.type === "text"
  );
  const last = textBlocks[textBlocks.length - 1];
  if (!last) {
    throw new Error("HM-research response contained no text block");
  }

  const partial = JSON.parse(last.text) as Omit<
    HiringManagerIntelligenceReport,
    "generated_at" | "sources" | "hm_name" | "hm_company" | "hm_role"
  >;

  return {
    ...partial,
    generated_at: new Date().toISOString(),
    hm_name: input.hm.name,
    hm_company: input.company.name,
    hm_role: input.hm.role,
    sources: extractSources(response.content),
  };
}
