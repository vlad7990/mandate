import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAnthropic } from "@/lib/anthropic";
import {
  HEALTH_AGENT_SCHEMA,
  HEALTH_AGENT_SYSTEM_PROMPT,
  type HealthSuggestion,
  type HealthSuggestionsBlob,
} from "./search-health-agent";
import { applySkillsToPrompt } from "@/lib/skills/skill-injector";
import type { ProjectHealthSummary } from "@/lib/metrics/types";
import { computeProjectHealth } from "@/lib/metrics/health";
import { computePipelineMetrics } from "@/lib/metrics/pipeline";
import { signInSearchHealthAgent } from "@/lib/agents/session";
import { captureSeamError } from "@/lib/observability/sentry";

const HEALTH_MODEL = "claude-sonnet-4-6";

export type SearchHealthInput = {
  project: {
    title: string;
    company_name: string;
    calibration: unknown;
    company_context: unknown;
  };
  health: ProjectHealthSummary;
  pipeline_summary: {
    active_pool_size: number;
    rejected_count: number;
    weekly_velocity: number;
    funnel: Array<{ stage: string; count: number }>;
  };
  boolean_queries: Array<{
    slot: string;
    content: string;
    word_count: number;
    version: number;
  }>;
  recent_feedback: Array<{
    feedback_type: string;
    summary: string | null;
    content: string;
    created_at: string;
  }>;
};

export type RunSearchHealthContext = {
  projectId: string;
  organizationId: string | null;
  /** Read recruiter-authored skills under this client — the agent's
   * own session when the seam runs; defaults to the request session. */
  skillClient?: SupabaseClient;
};

export async function runSearchHealth(
  input: SearchHealthInput,
  ctx: RunSearchHealthContext
): Promise<HealthSuggestionsBlob> {
  const anthropic = getAnthropic();
  const userPrompt = JSON.stringify(input, null, 2);
  const system = await applySkillsToPrompt(HEALTH_AGENT_SYSTEM_PROMPT, {
    projectId: ctx.projectId,
    organizationId: ctx.organizationId,
    client: ctx.skillClient,
  });

  const response = await anthropic.messages.create({
    model: HEALTH_MODEL,
    max_tokens: 2500,
    system,
    messages: [{ role: "user", content: userPrompt }],
    output_config: {
      format: {
        type: "json_schema",
        schema: HEALTH_AGENT_SCHEMA,
      },
    },
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Search-health response contained no text block");
  }

  const partial = JSON.parse(textBlock.text) as Omit<
    HealthSuggestionsBlob,
    "generated_at" | "health_status" | "suggestions"
  > & {
    suggestions: Array<Omit<HealthSuggestion, "id" | "dismissed">>;
  };

  // Mint stable ids server-side so dismissals can target individual
  // suggestions across cache invalidations.
  const suggestions: HealthSuggestion[] = partial.suggestions.map((s) => ({
    ...s,
    id: randomUUID(),
  }));

  return {
    generated_at: new Date().toISOString(),
    health_status: input.health.status as "stalled" | "at_risk",
    summary: partial.summary,
    suggestions,
  };
}

// ────────────────────────────────────────────────────────────────────────
// The seam (087): the SEARCH HEALTH AGENT's session, signed in per
// run. The interpreter's shape: every read this judgment makes — the
// projects row, the candidates/feedback/candidate_scores the metrics
// helpers roll up, the canonical boolean_queries, the feedback tail —
// is lawfully the agent's own under the pool (074/085), and the
// merge-write rides 074's projects UPDATE. The agent computes health
// and pipeline UNDER ITS OWN SESSION (the metrics helpers' optional
// client), applies the HEALTH GATE itself, judges, lands the blob
// under its own name, records the event with an enum and a count, and
// signs out persisting nothing. dismissHealthSuggestionAction — the
// recruiter's overlay act on the same blob — stays human.
// ────────────────────────────────────────────────────────────────────────

const SLOT_META: Record<string, { query_type: string; search_type: string }> = {
  linkedin_exact: { query_type: "linkedin", search_type: "exact" },
  linkedin_broad: { query_type: "linkedin", search_type: "broad" },
  linkedin_adjacent: { query_type: "linkedin", search_type: "adjacent" },
  linkedin_competitor: { query_type: "linkedin", search_type: "competitor" },
  google_xray: { query_type: "google_xray", search_type: "exact" },
  ats: { query_type: "ats", search_type: "exact" },
};

function slotKeyFor(query_type: string, search_type: string): string | null {
  for (const [slot, meta] of Object.entries(SLOT_META)) {
    if (meta.query_type === query_type && meta.search_type === search_type) {
      return slot;
    }
  }
  return null;
}

function wordCount(content: string): number {
  return content.trim().split(/\s+/).filter(Boolean).length;
}

export type SearchHealthRunResult =
  | { status: "ready"; blob: HealthSuggestionsBlob }
  /** Not eligible: project missing or outside the agent's org-bound
   * reach. */
  | { status: "unavailable" }
  /** The HEALTH GATE: the computed health is healthy — suggestions
   * are only generated when stalled or at-risk. The action surfaces
   * today's message. */
  | { status: "healthy" }
  /** The Search Health Agent refused to sign in — suspended from /ops
   * or credentials absent. Nothing was generated and NOTHING WAS
   * DESTROYED (D5): the existing suggestions stand byte-identical. */
  | { status: "agent_unavailable"; reason: string }
  /** Generation or persistence failed; logged. */
  | { status: "failed" };

export async function runHealthSuggestionsAndPersist(
  projectId: string
): Promise<SearchHealthRunResult> {
  const session = await signInSearchHealthAgent();
  if (!session.ok) {
    console.error(
      `[search-health] suggestions skipped: ${session.reason}. ` +
        "The existing suggestions stand; the panel keeps rendering them."
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
): Promise<SearchHealthRunResult> {
  const { data: project, error } = await supabase
    .from("projects")
    .select("id, title, company_name, calibration_model, company_context, organization_id")
    .eq("id", projectId)
    .single<{
      id: string;
      title: string;
      company_name: string;
      calibration_model: unknown;
      company_context: unknown;
      organization_id: string | null;
    }>();
  if (error || !project) return { status: "unavailable" };

  // Compute health + pipeline fresh, under the agent's own session —
  // the judgment must always run on the live state.
  const [health, pipeline, queriesQ, feedbackQ] = await Promise.all([
    computeProjectHealth(projectId, supabase),
    computePipelineMetrics(projectId, supabase),
    supabase
      .from("boolean_queries")
      .select("query_type, search_type, content, version")
      .eq("project_id", projectId)
      .order("version", { ascending: false }),
    supabase
      .from("feedback")
      .select("feedback_type, content, interpreted, created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  // The HEALTH GATE, applied by the agent itself: a healthy search
  // gets no fixes — refusing here spends no tokens.
  if (health.status === "healthy") return { status: "healthy" };

  // Reduce queries to one row per slot (highest version wins).
  type QueryRow = {
    query_type: string;
    search_type: string;
    content: string;
    version: number;
  };
  const seenSlots = new Set<string>();
  const queries: SearchHealthInput["boolean_queries"] = [];
  for (const row of (queriesQ.data ?? []) as QueryRow[]) {
    const slot = slotKeyFor(row.query_type, row.search_type);
    if (!slot || seenSlots.has(slot)) continue;
    seenSlots.add(slot);
    queries.push({
      slot,
      content: row.content,
      version: row.version,
      word_count: wordCount(row.content),
    });
  }

  type FbRow = {
    feedback_type: string;
    content: string;
    interpreted: { summary?: string } | null;
    created_at: string;
  };
  const recent_feedback = ((feedbackQ.data ?? []) as FbRow[]).map((f) => ({
    feedback_type: f.feedback_type,
    summary: f.interpreted?.summary ?? null,
    content: f.content,
    created_at: f.created_at,
  }));

  let blob: HealthSuggestionsBlob;
  try {
    blob = await runSearchHealth(
      {
        project: {
          title: project.title,
          company_name: project.company_name,
          calibration: project.calibration_model ?? {},
          company_context: project.company_context ?? {},
        },
        health,
        pipeline_summary: {
          active_pool_size: pipeline.activePoolSize,
          rejected_count: pipeline.rejectedCount,
          weekly_velocity: pipeline.weeklyVelocity,
          funnel: pipeline.funnel.map((f) => ({
            stage: f.stage,
            count: f.count,
          })),
        },
        boolean_queries: queries,
        recent_feedback,
      },
      {
        projectId,
        organizationId: project.organization_id,
        skillClient: supabase,
      }
    );
  } catch (err) {
    captureSeamError("[search-health] agent judgment failed", err);
    return { status: "failed" };
  }

  const { error: updateErr } = await supabase
    .from("projects")
    .update({
      health_suggestions: blob,
      updated_at: new Date().toISOString(),
    })
    .eq("id", projectId);
  if (updateErr) {
    captureSeamError("[search-health] failed to persist the suggestions", updateErr);
    return { status: "failed" };
  }

  // The trail (D4): an enum and a count — never the suggestion text.
  // Trigger `on_demand` today; `scheduled` is RESERVED for the future
  // cron sweep, which will be this same principal (D7).
  const { error: eventErr } = await supabase.rpc("record_agent_event", {
    p_event_type: "health_suggested",
    p_project_id: projectId,
    p_detail: {
      agent_kind: "search_health",
      trigger: "on_demand",
      health_status: blob.health_status,
      suggestions_count: blob.suggestions.length,
    },
  });
  if (eventErr) {
    captureSeamError("[search-health] failed to record the event", eventErr);
  }

  return { status: "ready", blob };
}
