import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getAnthropic } from "@/lib/anthropic";
import { agentErrorMessage, safeFailureMessage } from "./agent-errors";
import {
  EXECUTIVE_COMPANY_CONTEXT_SCHEMA,
  EXECUTIVE_COMPANY_CONTEXT_SYSTEM_PROMPT,
  type ExecutiveCompanyContext,
} from "./executive-company-context-agent";
import type { ExecutiveSearchRow } from "@/lib/executive/types";

/**
 * How this generator names itself in a failure a person reads. Whatever
 * lands in the error column is rendered verbatim with a Retry CTA, so it
 * outlives the request — see `agent-errors.ts`.
 */
const SUBJECT = "Company-context research";

export const EXECUTIVE_COMPANY_CONTEXT_MODEL = "claude-sonnet-4-6";
const WEB_SEARCH_MAX_USES = 6;

/**
 * Read-only SSR client for use inside `after()` callbacks. Mirrors the
 * pattern in generate-job-spec.ts — `after()` fires post-response so the
 * cookie writer cannot mutate response headers, but reads work fine.
 */
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
          /* read-only: see generate-job-spec.ts */
        },
      },
    }
  );
}

/** Pull every URL Claude actually fetched via web_search out of the response. */
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

/**
 * Generate the Company Operating Context for an executive search and persist
 * it onto the search row. The caller has already set
 * company_context_status='generating'; this function transitions the row to
 * 'ready' or 'failed' — never leaves it stuck on 'generating'.
 */
export async function runAndStoreExecutiveCompanyContext(
  searchId: string
): Promise<void> {
  const supabase = await createReadOnlySupabaseClient();

  const { data: search, error: fetchError } = await supabase
    .from("executive_searches")
    .select(
      "id, company_name, industry, business_model, revenue_range, employee_count, funding_stage, ownership_structure, geographic_footprint, regulatory_environment, role_title, role_family, business_situation"
    )
    .eq("id", searchId)
    .single<
      Pick<
        ExecutiveSearchRow,
        | "id"
        | "company_name"
        | "industry"
        | "business_model"
        | "revenue_range"
        | "employee_count"
        | "funding_stage"
        | "ownership_structure"
        | "geographic_footprint"
        | "regulatory_environment"
        | "role_title"
        | "role_family"
        | "business_situation"
      >
    >();

  if (fetchError || !search) {
    const message = `Failed to load executive search ${searchId}: ${fetchError?.message ?? "not found"}`;
    await markContextFailed(searchId, agentErrorMessage(fetchError, SUBJECT));
    throw new Error(message);
  }

  const userPrompt = JSON.stringify(
    {
      company_name: search.company_name,
      industry: search.industry,
      business_model: search.business_model,
      revenue_range: search.revenue_range,
      employee_count: search.employee_count,
      funding_stage: search.funding_stage,
      ownership_structure: search.ownership_structure,
      geographic_footprint: search.geographic_footprint,
      regulatory_environment: search.regulatory_environment,
      role_title: search.role_title,
      role_family: search.role_family,
      business_situation: search.business_situation,
    },
    null,
    2
  );

  let context: ExecutiveCompanyContext;
  try {
    const anthropic = getAnthropic();
    const response = await anthropic.messages.create({
      model: EXECUTIVE_COMPANY_CONTEXT_MODEL,
      max_tokens: 8000,
      system: EXECUTIVE_COMPANY_CONTEXT_SYSTEM_PROMPT,
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
          schema: EXECUTIVE_COMPANY_CONTEXT_SCHEMA,
        },
      },
    });

    const textBlocks = response.content.filter(
      (b): b is Extract<typeof b, { type: "text" }> => b.type === "text"
    );
    const last = textBlocks[textBlocks.length - 1];
    if (!last) {
      throw new Error("Company-context response contained no text block");
    }

    const partial = JSON.parse(last.text) as Omit<
      ExecutiveCompanyContext,
      "generated_at" | "sources"
    >;
    context = {
      ...partial,
      generated_at: new Date().toISOString(),
      sources: extractSources(response.content),
    };
  } catch (err) {
    await markContextFailed(searchId, agentErrorMessage(err, SUBJECT));
    throw err;
  }

  const { error: updateError } = await supabase
    .from("executive_searches")
    .update({
      company_context: context,
      company_context_status: "ready",
      company_context_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", searchId);

  if (updateError) {
    const message = `Failed to persist company context: ${updateError.message}`;
    await markContextFailed(searchId, agentErrorMessage(updateError, SUBJECT));
    throw new Error(message);
  }
}

/**
 * Transition the search row to a terminal failed context state. Idempotent
 * and self-protective — never re-throws.
 */
async function markContextFailed(
  searchId: string,
  errorMessage: string
): Promise<void> {
  try {
    const supabase = await createReadOnlySupabaseClient();
    await supabase
      .from("executive_searches")
      .update({
        company_context_status: "failed",
        company_context_error: safeFailureMessage(errorMessage, SUBJECT),
        updated_at: new Date().toISOString(),
      })
      .eq("id", searchId);
  } catch (err) {
    console.error(
      "[executive-company-context] failed to mark context as failed",
      err
    );
  }
}
