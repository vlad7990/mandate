import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAnthropic } from "@/lib/anthropic";
import {
  HM_INTELLIGENCE_SCHEMA,
  HIRING_MANAGER_RESEARCH_SYSTEM_PROMPT,
  type HiringManagerIntelligenceReport,
} from "./hiring-manager-research-agent";
import { applySkillsToPrompt } from "@/lib/skills/skill-injector";
import { signInCompanyIntelAgent } from "@/lib/agents/session";
import { captureSeamError } from "@/lib/observability/sentry";

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
  /** Read recruiter-authored skills under this client — the agent's
   * own session when the seam runs; defaults to the request session. */
  skillClient?: SupabaseClient;
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
      client: ctx.skillClient,
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

// ────────────────────────────────────────────────────────────────────────
// The seam (083): the same COMPANY INTELLIGENCE AGENT — one principal
// holds both judgments (D1); this is its second act. The interpreter's
// shape: the agent reads the one projects row for itself (stakeholder
// resolution included — the HM's identity lives on the row it lawfully
// reads), runs the web-searching model call, merges hm_intelligence
// into company_context, records the event, signs out persisting
// nothing.
// ────────────────────────────────────────────────────────────────────────

type Stakeholder = { name: string; role?: string | null; focus?: string | null };

export type HmResearchRunResult =
  | { status: "ready"; report: HiringManagerIntelligenceReport }
  /** Not eligible: project missing or outside the agent's org-bound
   * reach. */
  | { status: "unavailable" }
  /** No stakeholder to research, or the named one is absent — a
   * recruiter-facing message, thrown by the action verbatim. */
  | { status: "no_stakeholder"; message: string }
  /** The Company Intelligence Agent refused to sign in — suspended
   * from /ops or credentials absent. Nothing was generated and
   * NOTHING WAS DESTROYED (D5): any existing dossier stands. */
  | { status: "agent_unavailable"; reason: string }
  /** Generation or persistence failed; logged. */
  | { status: "failed" };

export async function runHiringManagerResearchAndPersist(
  projectId: string,
  hmNameOverride?: string
): Promise<HmResearchRunResult> {
  const session = await signInCompanyIntelAgent();
  if (!session.ok) {
    captureSeamError(
      `[hm-research] research skipped: ${session.reason}. ` +
        "Any existing dossier stands; the panel keeps rendering it."
    );
    return { status: "agent_unavailable", reason: session.reason };
  }

  try {
    return await runUnderAgentSession(session.client, projectId, hmNameOverride);
  } finally {
    // Persist nothing (D3): revoke the run's session from GoTrue's ledger.
    await session.signOut();
  }
}

async function runUnderAgentSession(
  supabase: SupabaseClient,
  projectId: string,
  hmNameOverride?: string
): Promise<HmResearchRunResult> {
  const { data: project, error } = await supabase
    .from("projects")
    .select(
      "id, company_name, calibration_model, company_context, onboarding_responses, organization_id"
    )
    .eq("id", projectId)
    .single<{
      id: string;
      company_name: string;
      calibration_model: { role_title?: string | null } | null;
      company_context: Record<string, unknown> | null;
      onboarding_responses: { stakeholders?: Stakeholder[] } | null;
      organization_id: string | null;
    }>();
  if (error || !project) return { status: "unavailable" };

  const stakeholders = (project.onboarding_responses?.stakeholders ?? []).filter(
    (s): s is Stakeholder => Boolean(s && typeof s.name === "string" && s.name.trim())
  );

  const targetName = hmNameOverride?.trim();
  const hm = targetName
    ? stakeholders.find(
        (s) => s.name.trim().toLowerCase() === targetName.toLowerCase()
      )
    : stakeholders[0];
  if (!hm) {
    return {
      status: "no_stakeholder",
      message:
        stakeholders.length === 0
          ? "No stakeholders captured in onboarding — add the hiring manager before researching them."
          : `Stakeholder "${targetName}" not found in this project.`,
    };
  }

  const company = (project.company_context ?? {}) as Record<string, unknown> & {
    company_name?: string;
    industry?: string | null;
    business_model?: string | null;
  };
  const replacedExisting = "hm_intelligence" in company;

  let report: HiringManagerIntelligenceReport;
  try {
    report = await runHiringManagerResearch(
      {
        hm: {
          name: hm.name,
          role: hm.role || null,
          focus: hm.focus || null,
        },
        company: {
          name: company.company_name ?? project.company_name,
          industry: company.industry ?? null,
          business_model: company.business_model ?? null,
        },
        project: {
          role_title: project.calibration_model?.role_title ?? null,
        },
      },
      {
        projectId,
        organizationId: project.organization_id,
        skillClient: supabase,
      }
    );
  } catch (err) {
    captureSeamError("[hm-research] agent research failed", err);
    return { status: "failed" };
  }

  // The merge-write: one key lands, the siblings untouched.
  const nextCompany: Record<string, unknown> = {
    ...company,
    hm_intelligence: report,
  };
  const { error: updateErr } = await supabase
    .from("projects")
    .update({
      company_context: nextCompany,
      updated_at: new Date().toISOString(),
    })
    .eq("id", projectId);
  if (updateErr) {
    captureSeamError("[hm-research] failed to persist the dossier", updateErr);
    return { status: "failed" };
  }

  // The trail (D4): the trigger and counts — the HM's NAME never
  // rides the trail; it lives in the report the recruiter renders.
  const { error: eventErr } = await supabase.rpc("record_agent_event", {
    p_event_type: "hm_researched",
    p_project_id: projectId,
    p_detail: {
      agent_kind: "company_intel",
      trigger: replacedExisting ? "re_research" : "research",
      replaced_existing: replacedExisting,
      sources_count: report.sources.length,
      stakeholder_override: Boolean(targetName),
    },
  });
  if (eventErr) {
    captureSeamError("[hm-research] failed to record the research event", eventErr);
  }

  return { status: "ready", report };
}
