import "server-only";
import { getAnthropic } from "@/lib/anthropic";
import {
  PSYCHOLOGY_SCHEMA,
  PSYCHOLOGY_SYSTEM_PROMPT,
  type CandidatePsychology,
} from "./psychology-agent";
import { applySkillsToPrompt } from "@/lib/skills/skill-injector";
import { wrapWithRecruiterContext } from "./recruiter-context";

const PSYCHOLOGY_MODEL = "claude-sonnet-4-6";

export type PsychologyInput = {
  candidate: {
    candidate_id: string;
    full_name: string;
    current_title: string | null;
    current_company: string | null;
    archetype: string | null;
    profile: unknown;
    evaluation: unknown;
  };
  /** Up to ~10 recent recruiter notes for behavioural context. */
  recruiter_notes: Array<{
    note_type: string;
    content: string;
    created_at: string;
  }>;
};

export type RunPsychologyContext = {
  projectId: string;
  organizationId: string | null;
  /**
   * Optional recruiter-supplied context to bias the agent. Prepended
   * to the system prompt as a "Recruiter context" block; the action
   * persists it alongside the result so the next render can show what
   * shaped this generation.
   */
  recruiterContext?: string;
};

export async function runPsychology(
  input: PsychologyInput,
  ctx: RunPsychologyContext
): Promise<CandidatePsychology> {
  const anthropic = getAnthropic();
  const userPrompt = JSON.stringify(input, null, 2);
  const baseSystem = await applySkillsToPrompt(PSYCHOLOGY_SYSTEM_PROMPT, {
    projectId: ctx.projectId,
    organizationId: ctx.organizationId,
  });
  const system = wrapWithRecruiterContext(baseSystem, ctx.recruiterContext);

  const response = await anthropic.messages.create({
    model: PSYCHOLOGY_MODEL,
    max_tokens: 2500,
    system,
    messages: [{ role: "user", content: userPrompt }],
    output_config: {
      format: {
        type: "json_schema",
        schema: PSYCHOLOGY_SCHEMA,
      },
    },
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Psychology response contained no text block");
  }

  const partial = JSON.parse(textBlock.text) as Omit<
    CandidatePsychology,
    "generated_at"
  >;
  return {
    ...partial,
    generated_at: new Date().toISOString(),
  };
}
