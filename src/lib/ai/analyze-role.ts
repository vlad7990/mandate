import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getAnthropic } from "@/lib/anthropic";
import {
  promoteCompanyContextToClient,
  resolveClientId,
} from "@/lib/clients/resolve-client";
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

  // This is the moment the mandate stops being "Analyzing…" and acquires a
  // real company, so it is the moment its client can be resolved. Before
  // 049 the company was only ever a string on this row.
  const { data: project } = await supabase
    .from("projects")
    .select("organization_id, created_by")
    .eq("id", projectId)
    .maybeSingle<{ organization_id: string | null; created_by: string | null }>();

  const clientId = await resolveClientId(supabase, {
    organizationId: project?.organization_id ?? null,
    companyName: parsed.company_name,
    createdBy: project?.created_by ?? null,
  });

  const { error } = await supabase
    .from("projects")
    .update({
      title: parsed.role_title,
      company_name: parsed.company_name,
      calibration_model,
      // The mandate's frozen copy. The client gets the canonical one below.
      company_context,
      // Null when the name could not be resolved — the mandate keeps its
      // company_name either way, so nothing downstream breaks.
      ...(clientId ? { client_id: clientId } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", projectId);

  if (error) {
    throw new Error(`Failed to persist role analysis: ${error.message}`);
  }

  // Forward the research to the client so the next mandate here starts warm.
  await promoteCompanyContextToClient(supabase, {
    clientId,
    companyContext: company_context,
  });
}
