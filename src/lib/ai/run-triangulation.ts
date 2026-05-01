import "server-only";
import { getAnthropic } from "@/lib/anthropic";
import {
  TRIANGULATION_SCHEMA,
  TRIANGULATION_SYSTEM_PROMPT,
  type TriangulationReport,
} from "./triangulation-agent";
import { applySkillsToPrompt } from "@/lib/skills/skill-injector";
import type { CompanyIntelligenceReport } from "./company-intelligence-agent";
import type { CandidateIntelligenceReport } from "./candidate-research-agent";
import type { HiringManagerIntelligenceReport } from "./hiring-manager-research-agent";

const TRIANGULATION_MODEL = "claude-sonnet-4-6";

export type RunTriangulationInput = {
  candidate: {
    full_name: string;
    current_title: string | null;
    current_company: string | null;
    archetype: string | null;
  };
  role: {
    title: string | null;
    company_name: string;
  };
  company_intelligence: CompanyIntelligenceReport;
  candidate_intelligence: CandidateIntelligenceReport;
  hm_intelligence: HiringManagerIntelligenceReport;
};

export type RunTriangulationContext = {
  projectId: string;
  candidateId: string;
  organizationId: string | null;
};

export async function runTriangulation(
  input: RunTriangulationInput,
  ctx: RunTriangulationContext
): Promise<TriangulationReport> {
  const anthropic = getAnthropic();

  const userPrompt = JSON.stringify(
    {
      candidate: input.candidate,
      role: input.role,
      // Strip the noisy `sources` arrays before sending — the recruiter
      // sees them in the panel; the synthesis model doesn't need them.
      company_intelligence: stripSources(input.company_intelligence),
      candidate_intelligence: stripSources(input.candidate_intelligence),
      hm_intelligence: stripSources(input.hm_intelligence),
    },
    null,
    2
  );

  const system = await applySkillsToPrompt(TRIANGULATION_SYSTEM_PROMPT, {
    projectId: ctx.projectId,
    organizationId: ctx.organizationId,
  });

  const response = await anthropic.messages.create({
    model: TRIANGULATION_MODEL,
    max_tokens: 4500,
    system,
    messages: [{ role: "user", content: userPrompt }],
    output_config: {
      format: {
        type: "json_schema",
        schema: TRIANGULATION_SCHEMA,
      },
    },
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Triangulation response contained no text block");
  }

  const partial = JSON.parse(textBlock.text) as Omit<
    TriangulationReport,
    "generated_at"
  >;
  return {
    ...partial,
    generated_at: new Date().toISOString(),
  };
}

function stripSources<T extends { sources?: unknown }>(report: T): Omit<T, "sources"> {
  const { sources: _sources, ...rest } = report;
  void _sources;
  return rest;
}
