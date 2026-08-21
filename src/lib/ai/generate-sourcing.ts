import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAnthropic } from "@/lib/anthropic";
import {
  SLOTS,
  SOURCING_FULL_SCHEMA,
  SOURCING_FULL_SYSTEM_PROMPT,
  SOURCING_SINGLE_SCHEMA,
  SOURCING_SINGLE_SYSTEM_PROMPT,
  type SlotKey,
  type SourcingQueries,
} from "./sourcing-analysis";
import type { CalibrationModel, CompanyContext } from "./role-analysis";
import { normalizeSections, type JobSpecSections } from "./job-spec-analysis";
import { applySkillsToPrompt } from "@/lib/skills/skill-injector";
import { signInBooleanSearchAgent } from "@/lib/agents/session";
import { captureSeamError } from "@/lib/observability/sentry";

const SOURCING_MODEL = "claude-sonnet-4-6";

export type GenerationContext = {
  job_spec: JobSpecSections;
  job_spec_version: number;
  calibration: Partial<CalibrationModel>;
  company: Partial<CompanyContext>;
  /** Skill-injection scope. Optional. */
  skill_context?: {
    project_id: string | null;
    organization_id: string | null;
    /** Read recruiter-authored skills under this client — the
     * agent's own session when the seam runs; defaults to the
     * request session. */
    client?: SupabaseClient;
  };
};

/**
 * Generate all six sourcing strings (4 LinkedIn variants + Google X-Ray
 * + ATS) in a single Anthropic call. Synchronous — caller awaits the
 * result and inserts the rows in one transaction.
 */
export async function generateAllSourcingQueries(
  ctx: GenerationContext
): Promise<SourcingQueries> {
  const anthropic = getAnthropic();
  const userPrompt = JSON.stringify(
    {
      job_spec: ctx.job_spec,
      job_spec_version: ctx.job_spec_version,
      calibration: ctx.calibration,
      company: ctx.company,
    },
    null,
    2
  );

  const system = await applySkillsToPrompt(SOURCING_FULL_SYSTEM_PROMPT, {
    projectId: ctx.skill_context?.project_id ?? null,
    organizationId: ctx.skill_context?.organization_id ?? null,
    client: ctx.skill_context?.client,
  });
  const response = await anthropic.messages.create({
    model: SOURCING_MODEL,
    max_tokens: 2048,
    system,
    messages: [{ role: "user", content: userPrompt }],
    output_config: {
      format: {
        type: "json_schema",
        schema: SOURCING_FULL_SCHEMA,
      },
    },
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Sourcing response contained no text block");
  }

  return JSON.parse(textBlock.text) as SourcingQueries;
}

/**
 * Regenerate a single sourcing string. The caller passes the slot to
 * regenerate, the current draft, and optional recruiter feedback. The
 * model returns one new query string.
 */
export async function regenerateSingleQuery(
  slot: SlotKey,
  current: string,
  feedback: string,
  ctx: GenerationContext
): Promise<string> {
  const anthropic = getAnthropic();
  const userPrompt = JSON.stringify(
    {
      slot,
      current,
      feedback,
      job_spec: ctx.job_spec,
      calibration: ctx.calibration,
      company: ctx.company,
    },
    null,
    2
  );

  const singleSystem = await applySkillsToPrompt(SOURCING_SINGLE_SYSTEM_PROMPT, {
    projectId: ctx.skill_context?.project_id ?? null,
    organizationId: ctx.skill_context?.organization_id ?? null,
    client: ctx.skill_context?.client,
  });
  const response = await anthropic.messages.create({
    model: SOURCING_MODEL,
    max_tokens: 1024,
    system: singleSystem,
    messages: [{ role: "user", content: userPrompt }],
    output_config: {
      format: {
        type: "json_schema",
        schema: SOURCING_SINGLE_SCHEMA,
      },
    },
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Sourcing single-regen response contained no text block");
  }

  const parsed = JSON.parse(textBlock.text) as { query: string };
  return parsed.query;
}

// ────────────────────────────────────────────────────────────────────────
// The seam (085): the BOOLEAN SEARCH AGENT's session, signed in per
// run. The interpreter's shape: the projects row, the FINAL job spec
// (job_specs S, new), and the current draft (boolean_queries S, new —
// the draft IS model input on the regen path) are the agent's own
// lawful reads; the recruiter's action keeps only the gate and hands
// ids plus the request-only feedback string. The agent reads, builds,
// APPENDS version rows (INSERT only — the version history is
// immutable to it; the recruiter's edit/restore acts stay human),
// records the event with the trigger, slot enum, counts, and a
// has_recruiter_feedback boolean — never the feedback text — and
// signs out persisting nothing.
// ────────────────────────────────────────────────────────────────────────

export type SourcingRunResult =
  | { status: "ready" }
  /** Not eligible: project missing or outside the agent's org-bound
   * reach. */
  | { status: "unavailable" }
  /** No finalised job spec — the recruiter must mark one final. */
  | { status: "no_final_spec" }
  /** Generate-all only: rows already exist; regenerate instead. */
  | { status: "already_generated" }
  /** The Boolean Search Agent refused to sign in — suspended from
   * /ops or credentials absent. Nothing was generated and NOTHING
   * WAS DESTROYED (D5): every landed version stands, the newest
   * stays canonical. */
  | { status: "agent_unavailable"; reason: string }
  /** Generation or persistence failed; logged. */
  | { status: "failed" };

type AgentGenerationContext = {
  ctx: GenerationContext;
  organizationId: string;
};

async function loadContextUnderAgent(
  supabase: SupabaseClient,
  projectId: string
): Promise<AgentGenerationContext | { status: "unavailable" | "no_final_spec" }> {
  const { data: project, error } = await supabase
    .from("projects")
    .select("calibration_model, company_context, organization_id")
    .eq("id", projectId)
    .single<{
      calibration_model: Partial<CalibrationModel> | null;
      company_context: Partial<CompanyContext> | null;
      organization_id: string | null;
    }>();
  if (error || !project || !project.organization_id) {
    return { status: "unavailable" };
  }

  const { data: finalSpec, error: specError } = await supabase
    .from("job_specs")
    .select("version, content_json")
    .eq("project_id", projectId)
    .eq("is_final", true)
    .maybeSingle<{ version: number; content_json: unknown }>();
  if (specError) return { status: "unavailable" };
  if (!finalSpec) return { status: "no_final_spec" };

  return {
    organizationId: project.organization_id,
    ctx: {
      job_spec: normalizeSections(finalSpec.content_json),
      job_spec_version: finalSpec.version,
      calibration: project.calibration_model ?? {},
      company: project.company_context ?? {},
      skill_context: {
        project_id: projectId,
        organization_id: project.organization_id,
        client: supabase,
      },
    },
  };
}

export async function runSourcingGenerateAllAndPersist(
  projectId: string
): Promise<SourcingRunResult> {
  const session = await signInBooleanSearchAgent();
  if (!session.ok) {
    captureSeamError(
      `[sourcing] generation skipped: ${session.reason}. ` +
        "The existing queries stand; the editor keeps rendering them."
    );
    return { status: "agent_unavailable", reason: session.reason };
  }

  try {
    const supabase = session.client;

    const { count, error: countError } = await supabase
      .from("boolean_queries")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId);
    if (countError) return { status: "failed" };
    if ((count ?? 0) > 0) return { status: "already_generated" };

    const loaded = await loadContextUnderAgent(supabase, projectId);
    if ("status" in loaded) return loaded;

    let queries: SourcingQueries;
    try {
      queries = await generateAllSourcingQueries(loaded.ctx);
    } catch (err) {
      captureSeamError("[sourcing] agent generation failed", err);
      return { status: "failed" };
    }

    const now = new Date().toISOString();
    const rows = SLOTS.map((slot) => ({
      project_id: projectId,
      organization_id: loaded.organizationId,
      query_type: slot.query_type,
      search_type: slot.search_type,
      content: queries[slot.key] ?? "",
      version: 1,
      updated_at: now,
    }));
    const { error: insertError } = await supabase
      .from("boolean_queries")
      .insert(rows);
    if (insertError) {
      captureSeamError("[sourcing] failed to persist queries", insertError);
      return { status: "failed" };
    }

    // The trail (D4): counts and booleans, never free text.
    const { error: eventErr } = await supabase.rpc("record_agent_event", {
      p_event_type: "sourcing_queries_generated",
      p_project_id: projectId,
      p_detail: {
        agent_kind: "boolean_search",
        trigger: "generate_all",
        slots_count: SLOTS.length,
        job_spec_version: loaded.ctx.job_spec_version,
        has_recruiter_feedback: false,
      },
    });
    if (eventErr) {
      captureSeamError("[sourcing] failed to record the event", eventErr);
    }

    return { status: "ready" };
  } finally {
    // Persist nothing (D3): revoke the run's session from GoTrue's ledger.
    await session.signOut();
  }
}

export async function runSourcingRegenerateAndPersist(
  projectId: string,
  slotKey: SlotKey,
  feedback: string
): Promise<SourcingRunResult> {
  const slot = SLOTS.find((s) => s.key === slotKey);
  if (!slot) return { status: "failed" };

  const session = await signInBooleanSearchAgent();
  if (!session.ok) {
    captureSeamError(
      `[sourcing] regeneration skipped: ${session.reason}. ` +
        "The existing queries stand; the editor keeps rendering them."
    );
    return { status: "agent_unavailable", reason: session.reason };
  }

  try {
    const supabase = session.client;

    const loaded = await loadContextUnderAgent(supabase, projectId);
    if ("status" in loaded) return loaded;

    // The current draft IS model input — the new SELECT grant at work.
    const { data: latest } = await supabase
      .from("boolean_queries")
      .select("version, content")
      .eq("project_id", projectId)
      .eq("query_type", slot.query_type)
      .eq("search_type", slot.search_type)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle<{ version: number; content: string }>();

    const current = latest?.content ?? "";
    const nextVersion = (latest?.version ?? 0) + 1;

    let newContent: string;
    try {
      newContent = await regenerateSingleQuery(slotKey, current, feedback, loaded.ctx);
    } catch (err) {
      captureSeamError("[sourcing] agent regeneration failed", err);
      return { status: "failed" };
    }

    const { error: insertError } = await supabase.from("boolean_queries").insert({
      project_id: projectId,
      organization_id: loaded.organizationId,
      query_type: slot.query_type,
      search_type: slot.search_type,
      content: newContent,
      version: nextVersion,
      updated_at: new Date().toISOString(),
    });
    if (insertError) {
      captureSeamError("[sourcing] failed to persist regenerated query", insertError);
      return { status: "failed" };
    }

    const { error: eventErr } = await supabase.rpc("record_agent_event", {
      p_event_type: "sourcing_queries_generated",
      p_project_id: projectId,
      p_detail: {
        agent_kind: "boolean_search",
        trigger: "regenerate_one",
        slots_count: 1,
        slot: slotKey,
        version: nextVersion,
        job_spec_version: loaded.ctx.job_spec_version,
        has_recruiter_feedback: feedback.trim().length > 0,
      },
    });
    if (eventErr) {
      captureSeamError("[sourcing] failed to record the event", eventErr);
    }

    return { status: "ready" };
  } finally {
    await session.signOut();
  }
}
