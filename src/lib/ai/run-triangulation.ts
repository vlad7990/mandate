import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
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
import { signInTriangulationAgent } from "@/lib/agents/session";

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
  /** Pre-built client for the skill read — the agent's own session
   * (080). Rides ctx, never input: `input` is serialised wholesale
   * into the model prompt. */
  skillClient?: SupabaseClient;
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
    client: ctx.skillClient,
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

// ────────────────────────────────────────────────────────────────────────
// The seam (080): the TRIANGULATION AGENT's session, signed in per run.
// The recruiter's action keeps the gate and the ownership assertion;
// the reads, the readiness check, the synthesis, the report write and
// the trail event all run under the agent's own RLS, and the run signs
// out persisting nothing.
// ────────────────────────────────────────────────────────────────────────

export type TriangulationRunResult =
  | { status: "ready"; report: TriangulationReport }
  /** Not eligible: candidate missing, wrong project, or outside the
   * agent's org-bound reach. */
  | { status: "unavailable" }
  /** A HUMAN-facing precondition, not an agent act (D5): one or more
   * of the three base reports does not exist yet. The action renders
   * today's exact sentence from `missing`. */
  | { status: "missing_inputs"; missing: string[] }
  /** The Triangulation Agent refused to sign in — suspended from /ops
   * or credentials absent. Nothing was generated and NOTHING WAS
   * DESTROYED (D5): any existing report stands untouched. */
  | { status: "agent_unavailable"; reason: string }
  /** Generation or persistence failed; logged. */
  | { status: "failed" };

export async function runTriangulationAndPersist(
  candidateId: string,
  projectId: string
): Promise<TriangulationRunResult> {
  const session = await signInTriangulationAgent();
  if (!session.ok) {
    console.error(
      `[triangulation] synthesis skipped: ${session.reason}. ` +
        "Any existing report stands; the panel keeps rendering it."
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
): Promise<TriangulationRunResult> {
  const [candidateQ, projectQ] = await Promise.all([
    supabase
      .from("candidates")
      .select(
        "id, project_id, full_name, current_title, current_company, archetype, cv_structured"
      )
      .eq("id", candidateId)
      .single<{
        id: string;
        project_id: string;
        full_name: string;
        current_title: string | null;
        current_company: string | null;
        archetype: string | null;
        cv_structured: unknown;
      }>(),
    supabase
      .from("projects")
      .select("organization_id, company_name, calibration_model, company_context")
      .eq("id", projectId)
      .single<{
        organization_id: string | null;
        company_name: string;
        calibration_model: { role_title?: string | null } | null;
        company_context: Record<string, unknown> | null;
      }>(),
  ]);

  if (candidateQ.error || !candidateQ.data) return { status: "unavailable" };
  if (projectQ.error || !projectQ.data) return { status: "unavailable" };
  if (candidateQ.data.project_id !== projectId) return { status: "unavailable" };

  const cv = (candidateQ.data.cv_structured ?? {}) as Record<string, unknown>;
  const candidateIntelligence = cv.candidate_intelligence as
    | CandidateIntelligenceReport
    | undefined;
  const company = (projectQ.data.company_context ?? {}) as Record<string, unknown>;
  const companyIntelligence = company.intelligence_report as
    | CompanyIntelligenceReport
    | undefined;
  const hmIntelligence = company.hm_intelligence as
    | HiringManagerIntelligenceReport
    | undefined;

  const missing: string[] = [];
  if (!companyIntelligence) missing.push("Company Intelligence");
  if (!candidateIntelligence) missing.push("Candidate Intelligence");
  if (!hmIntelligence) missing.push("Hiring Manager Intelligence");
  if (
    missing.length > 0 ||
    !companyIntelligence ||
    !candidateIntelligence ||
    !hmIntelligence
  ) {
    return { status: "missing_inputs", missing };
  }

  const replacedExisting = "triangulation_report" in cv;

  let report: TriangulationReport;
  try {
    report = await runTriangulation(
      {
        candidate: {
          full_name: candidateQ.data.full_name,
          current_title: candidateQ.data.current_title,
          current_company: candidateQ.data.current_company,
          archetype: candidateQ.data.archetype,
        },
        role: {
          title: projectQ.data.calibration_model?.role_title ?? null,
          company_name: projectQ.data.company_name,
        },
        company_intelligence: companyIntelligence,
        candidate_intelligence: candidateIntelligence,
        hm_intelligence: hmIntelligence,
      },
      {
        projectId,
        candidateId,
        organizationId: projectQ.data.organization_id,
        skillClient: supabase,
      }
    );
  } catch (err) {
    console.error("[triangulation] agent synthesis failed", err);
    return { status: "failed" };
  }

  // Persist atomically through the RLS-bound RPC — one key, four
  // sibling agents' fields untouched. No pre-clear anywhere (D5).
  const { error: writeErr } = await supabase.rpc("update_cv_structured_field", {
    p_candidate_id: candidateId,
    p_project_id: projectId,
    p_key: "triangulation_report",
    p_value: report,
  });
  if (writeErr) {
    console.error(
      "[triangulation] failed to persist the report for candidate",
      candidateId,
      writeErr
    );
    return { status: "failed" };
  }

  // The trail (D4): one event per LANDED report, the trigger named.
  const { error: eventErr } = await supabase.rpc("record_agent_event", {
    p_event_type: "candidate_triangulated",
    p_project_id: projectId,
    p_candidate_id: candidateId,
    p_detail: {
      agent_kind: "triangulator",
      trigger: replacedExisting ? "regenerate" : "generate",
      replaced_existing: replacedExisting,
    },
  });
  if (eventErr) {
    console.error(
      "[triangulation] failed to record the triangulation event",
      candidateId,
      eventErr
    );
  }

  return { status: "ready", report };
}
