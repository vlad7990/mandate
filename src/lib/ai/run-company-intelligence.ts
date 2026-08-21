import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAnthropic } from "@/lib/anthropic";
import {
  COMPANY_INTELLIGENCE_SCHEMA,
  COMPANY_INTELLIGENCE_SYSTEM_PROMPT,
  type CompanyIntelligenceReport,
} from "./company-intelligence-agent";
import { applySkillsToPrompt } from "@/lib/skills/skill-injector";
import { signInCompanyIntelAgent } from "@/lib/agents/session";
import { captureSeamError } from "@/lib/observability/sentry";

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
  /** Read recruiter-authored skills under this client — the agent's
   * own session when the seam runs; defaults to the request session. */
  skillClient?: SupabaseClient;
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
      client: ctx.skillClient,
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

// ────────────────────────────────────────────────────────────────────────
// The seam (083): the COMPANY INTELLIGENCE AGENT's session, signed in
// per run. The interpreter's shape, not the parser split — every read
// this judgment makes (one projects row) is lawfully the agent's own
// under the pool's 074 grants, so the recruiter's action keeps only
// the gate and hands an id; the agent reads for itself, runs the
// web-searching model call, merges the report into company_context
// under its own name, records the event, and signs out persisting
// nothing. No pre-clear anywhere (D5): the old report exists until
// the moment the new one lands, and a refused run touches nothing.
// ────────────────────────────────────────────────────────────────────────

export type CompanyIntelligenceRunResult =
  | { status: "ready"; report: CompanyIntelligenceReport }
  /** Not eligible: project missing or outside the agent's org-bound
   * reach. */
  | { status: "unavailable" }
  /** The Company Intelligence Agent refused to sign in — suspended
   * from /ops or credentials absent. Nothing was generated, no web
   * search was made, and NOTHING WAS DESTROYED (D5): any existing
   * report stands untouched. */
  | { status: "agent_unavailable"; reason: string }
  /** Generation or persistence failed; logged. */
  | { status: "failed" };

type AgentProjectRow = {
  id: string;
  company_name: string;
  calibration_model: { role_title?: string | null } | null;
  company_context: Record<string, unknown> | null;
  onboarding_responses: unknown;
  organization_id: string | null;
};

export async function runCompanyIntelligenceAndPersist(
  projectId: string
): Promise<CompanyIntelligenceRunResult> {
  const session = await signInCompanyIntelAgent();
  if (!session.ok) {
    captureSeamError(
      `[company-intelligence] research skipped: ${session.reason}. ` +
        "Any existing report stands; the panel keeps rendering it."
    );
    return { status: "agent_unavailable", reason: session.reason };
  }

  try {
    return await runUnderAgentSession(session.client, projectId);
  } finally {
    // Persist nothing (D3): revoke the run's session from GoTrue's ledger.
    await session.signOut();
  }
}

async function runUnderAgentSession(
  supabase: SupabaseClient,
  projectId: string
): Promise<CompanyIntelligenceRunResult> {
  const { data: project, error } = await supabase
    .from("projects")
    .select(
      "id, company_name, calibration_model, company_context, onboarding_responses, organization_id"
    )
    .eq("id", projectId)
    .single<AgentProjectRow>();
  if (error || !project) return { status: "unavailable" };

  const company = (project.company_context ?? {}) as Record<string, unknown> & {
    company_name?: string;
    website?: string | null;
    industry?: string | null;
    business_model?: string | null;
  };
  const replacedExisting = "intelligence_report" in company;

  let report: CompanyIntelligenceReport;
  try {
    report = await runCompanyIntelligence(
      {
        company: {
          name: company.company_name ?? project.company_name,
          website: company.website ?? null,
        },
        project: {
          role_title: project.calibration_model?.role_title ?? null,
          industry: company.industry ?? null,
          business_model: company.business_model ?? null,
          onboarding: project.onboarding_responses ?? {},
          calibration: project.calibration_model ?? {},
        },
      },
      {
        projectId,
        organizationId: project.organization_id,
        skillClient: supabase,
      }
    );
  } catch (err) {
    captureSeamError("[company-intelligence] agent research failed", err);
    return { status: "failed" };
  }

  // The merge-write: one key lands, the siblings (culture_profile,
  // hm_intelligence, annotations…) untouched — pinned by the 083
  // invariants.
  const nextCompany: Record<string, unknown> = {
    ...company,
    intelligence_report: report,
  };
  const { error: updateErr } = await supabase
    .from("projects")
    .update({
      company_context: nextCompany,
      updated_at: new Date().toISOString(),
    })
    .eq("id", projectId);
  if (updateErr) {
    captureSeamError(
      "[company-intelligence] failed to persist the report",
      updateErr
    );
    return { status: "failed" };
  }

  // The trail (D4): one event per LANDED report — counts, never names.
  const { error: eventErr } = await supabase.rpc("record_agent_event", {
    p_event_type: "company_researched",
    p_project_id: projectId,
    p_detail: {
      agent_kind: "company_intel",
      trigger: replacedExisting ? "re_research" : "research",
      replaced_existing: replacedExisting,
      sources_count: report.sources.length,
      leadership_count: report.leadership_team.length,
      recent_context_count: report.recent_context.length,
    },
  });
  if (eventErr) {
    captureSeamError(
      "[company-intelligence] failed to record the research event",
      eventErr
    );
  }

  return { status: "ready", report };
}
