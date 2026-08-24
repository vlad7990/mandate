import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAnthropic } from "@/lib/anthropic";
import {
  CANDIDATE_INTELLIGENCE_SCHEMA,
  CANDIDATE_INTELLIGENCE_SYSTEM_PROMPT,
  type CandidateIntelligenceReport,
} from "./candidate-research-agent";
import { applySkillsToPrompt } from "@/lib/skills/skill-injector";
import { signInCandidateResearchAgent } from "@/lib/agents/session";
import { captureSeamError } from "@/lib/observability/sentry";

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
  /** Pre-built client for the skill read — the agent's own session
   * (079). Rides ctx, never input: `input` is serialised wholesale
   * into the model prompt. */
  skillClient?: SupabaseClient;
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
      client: ctx.skillClient,
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

// ────────────────────────────────────────────────────────────────────────
// The seam (079): the CANDIDATE RESEARCH AGENT's session, signed in per
// run. The recruiter's action keeps the gate and the ownership
// assertion; the reads, the web-searching model call, the dossier
// write and the trail event all run under the agent's own RLS, and the
// run signs out persisting nothing.
// ────────────────────────────────────────────────────────────────────────

export type CandidateResearchRunResult =
  | { status: "ready"; report: CandidateIntelligenceReport }
  /** Not eligible: candidate missing, wrong project, or outside the
   * agent's org-bound reach. */
  | { status: "unavailable" }
  /** The Candidate Research Agent refused to sign in — suspended from
   * /ops or credentials absent. Nothing was generated, no web search
   * was made, and NOTHING WAS DESTROYED (D5): any existing dossier
   * stands untouched. */
  | { status: "agent_unavailable"; reason: string }
  /** Generation or persistence failed; logged. */
  | { status: "failed" };

export async function runCandidateResearchAndPersist(
  candidateId: string,
  projectId: string
): Promise<CandidateResearchRunResult> {
  const session = await signInCandidateResearchAgent();
  if (!session.ok) {
    console.error(
      `[candidate-research] research skipped: ${session.reason}. ` +
        "Any existing dossier stands; the panel keeps rendering it."
    );
    return { status: "agent_unavailable", reason: session.reason };
  }

  try {
    return await runUnderAgentSession(session.client, candidateId, projectId);
  } finally {
    // Persist nothing (D3): revoke the run's session from GoTrue's ledger.
    await session.signOut();
  }
}

async function runUnderAgentSession(
  supabase: SupabaseClient,
  candidateId: string,
  projectId: string
): Promise<CandidateResearchRunResult> {
  const [candidateQ, projectQ] = await Promise.all([
    supabase
      .from("candidates")
      .select(
        "id, project_id, full_name, current_title, current_company, location, linkedin_url, github_url, website_url, cv_structured"
      )
      .eq("id", candidateId)
      .single<{
        id: string;
        project_id: string;
        full_name: string;
        current_title: string | null;
        current_company: string | null;
        location: string | null;
        linkedin_url: string | null;
        github_url: string | null;
        website_url: string | null;
        cv_structured: unknown;
      }>(),
    supabase
      .from("projects")
      .select("organization_id")
      .eq("id", projectId)
      .single<{ organization_id: string | null }>(),
  ]);

  if (candidateQ.error || !candidateQ.data) return { status: "unavailable" };
  if (projectQ.error || !projectQ.data) return { status: "unavailable" };
  if (candidateQ.data.project_id !== projectId) return { status: "unavailable" };

  const c = candidateQ.data;
  const cv = (c.cv_structured ?? {}) as Record<string, unknown>;
  const replacedExisting = "candidate_intelligence" in cv;

  // Trim heavy CV fields before sending — the model needs narrative
  // anchors for identity verification, not the full role history.
  const cv_summary = {
    summary: cv.summary,
    domain: cv.domain,
    scale: cv.scale,
    years_experience: cv.years_experience,
    archetype: cv.archetype,
    tech_exposure: Array.isArray(cv.tech_exposure)
      ? (cv.tech_exposure as unknown[]).slice(0, 8)
      : undefined,
    transformation_experience: Array.isArray(cv.transformation_experience)
      ? (cv.transformation_experience as unknown[]).slice(0, 5)
      : undefined,
  };

  let report: CandidateIntelligenceReport;
  try {
    report = await runCandidateResearch(
      {
        candidate: {
          full_name: c.full_name,
          current_title: c.current_title,
          current_company: c.current_company,
          location: c.location,
          linkedin_url: c.linkedin_url,
          github_url: c.github_url,
          website_url: c.website_url,
          cv_summary,
        },
      },
      {
        projectId,
        candidateId,
        organizationId: projectQ.data.organization_id,
        skillClient: supabase,
      }
    );
  } catch (err) {
    captureSeamError("[candidate-research] agent research failed", err);
    return { status: "failed" };
  }

  // Persist atomically through the RLS-bound RPC — one key, the
  // neighbours untouched. No pre-clear anywhere (D5): the old dossier
  // exists until the moment the new one lands.
  const { error: writeErr } = await supabase.rpc("update_cv_structured_field", {
    p_candidate_id: candidateId,
    p_project_id: projectId,
    p_key: "candidate_intelligence",
    p_value: report,
  });
  if (writeErr) {
    captureSeamError(
      "[candidate-research] failed to persist the dossier for candidate",
      candidateId,
      writeErr
    );
    return { status: "failed" };
  }

  // The trail (D4): one event per LANDED dossier, the trigger named.
  const { error: eventErr } = await supabase.rpc("record_agent_event", {
    p_event_type: "candidate_researched",
    p_project_id: projectId,
    p_candidate_id: candidateId,
    p_detail: {
      agent_kind: "researcher",
      trigger: replacedExisting ? "re_research" : "research",
      replaced_existing: replacedExisting,
      sources_count: report.sources.length,
    },
  });
  if (eventErr) {
    captureSeamError(
      "[candidate-research] failed to record the research event",
      candidateId,
      eventErr
    );
  }

  return { status: "ready", report };
}
