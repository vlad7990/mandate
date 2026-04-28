import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getAnthropic } from "@/lib/anthropic";
import {
  ROLE_ANALYSIS_SCHEMA,
  ROLE_ANALYSIS_SYSTEM_PROMPT,
  splitAnalysis,
  type RoleAnalysis,
} from "./role-analysis";

const ANALYSIS_MODEL = "claude-sonnet-4-6";

async function createReadOnlySupabaseClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {
          // No-op: after() callbacks cannot mutate response cookies. Read-only is fine
          // because the auth cookie is already valid for the duration of the AI call.
        },
      },
    }
  );
}

export async function analyzeAndStoreRole(
  projectId: string,
  oneLineInput: string
): Promise<void> {
  const anthropic = getAnthropic();

  const response = await anthropic.messages.create({
    model: ANALYSIS_MODEL,
    max_tokens: 1024,
    system: ROLE_ANALYSIS_SYSTEM_PROMPT,
    messages: [{ role: "user", content: oneLineInput }],
    output_config: {
      format: {
        type: "json_schema",
        schema: ROLE_ANALYSIS_SCHEMA,
      },
    },
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Anthropic response contained no text block");
  }

  const parsed = JSON.parse(textBlock.text) as RoleAnalysis;
  const { calibration_model, company_context } = splitAnalysis(parsed);

  const supabase = await createReadOnlySupabaseClient();
  const { error } = await supabase
    .from("projects")
    .update({
      title: parsed.role_title,
      company_name: parsed.company_name,
      calibration_model,
      company_context,
      updated_at: new Date().toISOString(),
    })
    .eq("id", projectId);

  if (error) {
    throw new Error(`Failed to persist role analysis: ${error.message}`);
  }
}
