"use server";

// Sourcing runs — draft creation, result staging, promotion.
//
// Design: docs/superpowers/specs/2026-08-12-sourcing-runs-design.md
//
// Every state transition that matters goes through an RPC rather than a direct
// write, because the guarantees are transactional and PostgREST has no
// client-side transaction:
//
//   allocate_and_insert_sourcing_run  version allocation within a lineage
//   mark_sourcing_run_executed        the draft → executed transition
//   promote_sourcing_results          candidate + link + counter, atomically
//
// No AI call happens anywhere in this file. Parsing and dedupe are the
// deterministic core in @/lib/sourcing/import.

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  dedupeImportRows,
  parseImport,
  MAX_IMPORT_ROWS,
  type ExistingCandidate,
  type MappingOverrides,
  type ParseResult,
} from "@/lib/sourcing/import";
import {
  normalizeRunContent,
  PROVENANCE_KEY,
  type ImportProvenance,
  type PromoteDecision,
  type SourcingRunContent,
  type SourcingRunQuery,
} from "@/lib/sourcing/runs";
import {
  canAnalyseAperture,
  MIN_ROWS_FOR_ANALYSIS,
  summariseAperture,
  type ApertureRow,
} from "@/lib/sourcing/coverage";
import { runCoverageAnalysis } from "@/lib/ai/run-coverage-analysis";
import { slotForDbRow, SLOTS } from "@/lib/ai/sourcing-analysis";
import type { CalibrationModel, CompanyContext } from "@/lib/ai/role-analysis";

type AuthContext = {
  userId: string;
  organizationId: string;
};

async function requireAuth(): Promise<AuthContext> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthenticated.");

  const { data: profile, error } = await supabase
    .from("users")
    .select("organization_id, status")
    .eq("id", user.id)
    .single();

  if (error || !profile?.organization_id || profile.status !== "active") {
    throw new Error("Account is not provisioned.");
  }

  return { userId: user.id, organizationId: profile.organization_id };
}

type ProjectRow = {
  id: string;
  title: string;
  company_name: string;
  organization_id: string | null;
  calibration_model: Partial<CalibrationModel> | null;
  company_context: Partial<CompanyContext> | null;
};

async function loadProject(
  projectId: string,
  organizationId: string
): Promise<ProjectRow> {
  const supabase = await createServerSupabaseClient();
  const { data: project, error } = await supabase
    .from("projects")
    .select(
      "id, title, company_name, organization_id, calibration_model, company_context"
    )
    .eq("id", projectId)
    .single<ProjectRow>();

  if (error || !project) throw new Error("Project not found.");
  if (project.organization_id !== organizationId) {
    throw new Error("Project belongs to a different organisation.");
  }
  return project;
}

// ---------------------------------------------------------------------------
// Create a draft run
// ---------------------------------------------------------------------------

/**
 * Where a snapshotted query is meant to be run. Coarse on purpose: the exact
 * platform a result came off is recorded per staged row at import, because the
 * recruiter may well run a LinkedIn string in Recruiter for one run and Sales
 * Navigator for the next.
 */
const PLATFORM_FOR_QUERY_TYPE: Record<string, string> = {
  linkedin: "linkedin",
  google_xray: "google_xray",
  ats: "ats",
};

/**
 * Snapshot the project's current Boolean set into the run.
 *
 * Snapshotted rather than referenced: `boolean_queries` rows are versioned and
 * a later edit would otherwise rewrite the strategy a completed run claims to
 * have executed.
 */
async function snapshotQueries(projectId: string): Promise<SourcingRunQuery[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("boolean_queries")
    .select("query_type, search_type, content, version")
    .eq("project_id", projectId)
    .order("version", { ascending: false });

  if (error) throw new Error(`Failed to read queries: ${error.message}`);

  const rows = (data ?? []) as Array<{
    query_type: string;
    search_type: string;
    content: string;
    version: number;
  }>;

  // Ordered version DESC, so the first row seen per slot is the canonical one.
  const seen = new Set<string>();
  const snapshot: SourcingRunQuery[] = [];
  for (const row of rows) {
    const slot = slotForDbRow(row.query_type, row.search_type);
    if (!slot || seen.has(slot)) continue;
    seen.add(slot);
    if (!row.content?.trim()) continue;
    snapshot.push({
      slot,
      query_type: row.query_type,
      search_type: row.search_type,
      content: row.content,
      platform: PLATFORM_FOR_QUERY_TYPE[row.query_type] ?? "other",
    });
  }

  // Stable, human order rather than whatever the version sort produced.
  const slotOrder: string[] = SLOTS.map((s) => s.key);
  snapshot.sort((a, b) => slotOrder.indexOf(a.slot) - slotOrder.indexOf(b.slot));
  return snapshot;
}

export type CreateRunInput = {
  label: string;
  rationale: string;
  /** Null for a new lineage; a run id to branch a v(n+1) from it. */
  parentRunId: string | null;
};

export async function createSourcingRunAction(
  projectId: string,
  input: CreateRunInput
): Promise<{ runId: string; version: number; rootRunId: string }> {
  const { userId, organizationId } = await requireAuth();
  const project = await loadProject(projectId, organizationId);
  const supabase = await createServerSupabaseClient();

  const queries = await snapshotQueries(projectId);
  if (queries.length === 0) {
    throw new Error(
      "No sourcing queries to snapshot yet. Generate the Boolean set before saving a run."
    );
  }

  const calibration = project.calibration_model ?? {};
  const company = project.company_context ?? {};

  const content: SourcingRunContent = {
    brief: {
      role_title: calibration.role_title ?? project.title,
      company_name: company.company_name ?? project.company_name,
      must_haves: [],
      geographies: [],
      target_companies: [],
    },
    strategy_rationale: input.rationale.trim(),
    queries,
  };

  const { data, error } = await supabase
    .rpc("allocate_and_insert_sourcing_run", {
      p_project_id: projectId,
      p_organization_id: organizationId,
      p_parent_run_id: input.parentRunId,
      p_label: input.label.trim() || null,
      p_content_json: content,
      p_created_by: userId,
      p_prompt_version: null,
      p_model_version: null,
    })
    .single<{ id: string; version: number; root_run_id: string }>();

  if (error || !data) {
    throw new Error(`Failed to create run: ${error?.message ?? "unknown error"}`);
  }

  revalidatePath(`/app/projects/${projectId}/sourcing`);
  return { runId: data.id, version: data.version, rootRunId: data.root_run_id };
}

// ---------------------------------------------------------------------------
// Import — preview
// ---------------------------------------------------------------------------

export type ImportPreview = {
  headers: string[];
  /** Header index feeding each known field, after any recruiter override. */
  mapping: Record<string, number>;
  parsedCount: number;
  /**
   * Rows present in the input that carried no usable name. They are NOT a
   * fourth review class — the parser never emits them, so there is nothing to
   * review. Reported as a count so the number is never silently lost.
   */
  skippedUnnamed: number;
  droppedForCap: number;
  maxRows: number;
  /** First few rows, so the recruiter can see the mapping landed correctly. */
  sample: Array<{
    source_line: number;
    full_name: string;
    current_title: string | null;
    current_company: string | null;
    location: string | null;
    profile_url: string | null;
    email: string | null;
  }>;
};

const PREVIEW_SAMPLE_SIZE = 8;

function toPreview(parsed: ParseResult): ImportPreview {
  return {
    headers: parsed.headers,
    mapping: Object.fromEntries(
      Object.entries(parsed.mapping).filter(
        ([key, v]) => typeof v === "number" && !key.startsWith("__")
      )
    ) as Record<string, number>,
    parsedCount: parsed.rows.length,
    skippedUnnamed: parsed.skippedUnnamed,
    droppedForCap: parsed.droppedForCap,
    maxRows: MAX_IMPORT_ROWS,
    sample: parsed.rows.slice(0, PREVIEW_SAMPLE_SIZE).map((r) => ({
      source_line: r.source_line,
      full_name: r.full_name,
      current_title: r.current_title,
      current_company: r.current_company,
      location: r.location,
      profile_url: r.profile_url,
      email: r.email,
    })),
  };
}

/**
 * Parse without writing anything, so the recruiter can correct the column
 * mapping before a single personal-data row is persisted.
 */
export async function previewImportAction(
  projectId: string,
  text: string,
  overrides: MappingOverrides
): Promise<ImportPreview> {
  const { organizationId } = await requireAuth();
  await loadProject(projectId, organizationId);
  return toPreview(parseImport(text, overrides));
}

// ---------------------------------------------------------------------------
// Import — stage
// ---------------------------------------------------------------------------

export type StageImportInput = {
  text: string;
  overrides: MappingOverrides;
  sourceType: "paste" | "csv";
  filename: string | null;
  platform: string;
};

export type StageSummary = {
  staged: number;
  newCount: number;
  duplicateCount: number;
  ambiguousCount: number;
  skippedUnnamed: number;
  droppedForCap: number;
};

/**
 * Parse, dedupe against the pool, persist staged rows, and stamp the run as
 * executed.
 *
 * Execution is stamped HERE and not at promotion: `result_count` describes what
 * the search returned, which is known now, and a run that returns 40 people and
 * imports none of them still executed — that is a real and informative outcome
 * about the strategy.
 */
export async function stageImportAction(
  projectId: string,
  runId: string,
  input: StageImportInput
): Promise<StageSummary> {
  const { organizationId } = await requireAuth();
  await loadProject(projectId, organizationId);
  const supabase = await createServerSupabaseClient();

  const platform = input.platform.trim();
  if (!platform) throw new Error("Choose where these results came from.");

  const { data: run, error: runError } = await supabase
    .from("sourcing_runs")
    .select("id, status, project_id")
    .eq("id", runId)
    .single<{ id: string; status: string; project_id: string }>();

  if (runError || !run) throw new Error("Sourcing run not found.");
  if (run.project_id !== projectId) {
    throw new Error("This run belongs to a different search.");
  }
  if (run.status !== "draft") {
    throw new Error(
      "This run has already been executed. Refine it into a new version to import a fresh set of results."
    );
  }

  const parsed = parseImport(input.text, input.overrides);
  if (parsed.rows.length === 0) {
    throw new Error(
      parsed.skippedUnnamed > 0
        ? `No usable rows — all ${parsed.skippedUnnamed} row(s) were missing a name. Check the column mapping.`
        : "No rows found in that import."
    );
  }

  // Dedupe against everyone already in this search's pool.
  const { data: poolRows, error: poolError } = await supabase
    .from("candidates")
    .select("id, full_name, email, linkedin_url, current_company")
    .eq("project_id", projectId);

  if (poolError) {
    throw new Error(`Failed to read the candidate pool: ${poolError.message}`);
  }

  const existing = (poolRows ?? []) as ExistingCandidate[];
  const deduped = dedupeImportRows(parsed.rows, existing);

  const importedAt = new Date().toISOString();
  const stagedRows = deduped.map((row) => {
    const provenance: ImportProvenance = {
      source: input.sourceType,
      filename: input.filename,
      imported_at: importedAt,
      row_number: row.source_line,
    };
    return {
      run_id: runId,
      organization_id: organizationId,
      full_name: row.full_name,
      current_title: row.current_title,
      current_company: row.current_company,
      location: row.location,
      profile_url: row.profile_url,
      email: row.email,
      source_platform: platform,
      raw: { ...row.raw, [PROVENANCE_KEY]: provenance },
      match_status: row.match_status,
      matched_candidate_id: row.matched_candidate_id,
    };
  });

  const { error: insertError } = await supabase
    .from("sourcing_run_results")
    .insert(stagedRows);

  if (insertError) {
    throw new Error(`Failed to stage results: ${insertError.message}`);
  }

  const { error: executeError } = await supabase.rpc(
    "mark_sourcing_run_executed",
    { p_run_id: runId, p_result_count: stagedRows.length }
  );

  if (executeError) {
    // Leave no half-imported run behind. The staged rows are the only thing
    // written so far and nothing references them yet, so clearing them puts the
    // draft back exactly where it was and the recruiter can simply retry.
    await supabase.from("sourcing_run_results").delete().eq("run_id", runId);
    throw new Error(
      `Failed to record the run as executed, so nothing was staged: ${executeError.message}`
    );
  }

  revalidatePath(`/app/projects/${projectId}/sourcing`);
  revalidatePath(`/app/projects/${projectId}/sourcing/runs/${runId}/import`);

  return {
    staged: stagedRows.length,
    newCount: deduped.filter((r) => r.match_status === "new").length,
    duplicateCount: deduped.filter((r) => r.match_status === "duplicate").length,
    ambiguousCount: deduped.filter((r) => r.match_status === "ambiguous").length,
    skippedUnnamed: parsed.skippedUnnamed,
    droppedForCap: parsed.droppedForCap,
  };
}

// ---------------------------------------------------------------------------
// Coverage analysis
// ---------------------------------------------------------------------------

/**
 * Ask the coverage agent where this run's search aperture was narrow.
 *
 * Returns as soon as the work is queued. The model call runs in `after()`,
 * because it takes tens of seconds and an AI call in a render path is the bug
 * that was fixed in 6468808 — the recruiter should get their page back and see
 * the findings when they land.
 *
 * Writing to `analysis_json` on an executed run is legal by design: the guard
 * in migration 041 freezes content_json and the execution record but leaves
 * analysis open, because coverage analysis happens after execution by
 * definition.
 */
export async function analyseRunCoverageAction(
  projectId: string,
  runId: string
): Promise<{ queued: true }> {
  const { organizationId } = await requireAuth();
  await loadProject(projectId, organizationId);
  const supabase = await createServerSupabaseClient();

  const { data: run, error: runError } = await supabase
    .from("sourcing_runs")
    .select("id, project_id, status, content_json, result_count, imported_count")
    .eq("id", runId)
    .single<{
      id: string;
      project_id: string;
      status: string;
      content_json: unknown;
      result_count: number;
      imported_count: number;
    }>();

  if (runError || !run) throw new Error("Sourcing run not found.");
  if (run.project_id !== projectId) {
    throw new Error("This run belongs to a different search.");
  }
  if (run.status === "draft") {
    throw new Error(
      "This run has not been executed yet — there are no results to analyse."
    );
  }

  const { data: resultRows, error: resultsError } = await supabase
    .from("sourcing_run_results")
    .select("current_company, current_title, location")
    .eq("run_id", runId);

  if (resultsError) {
    throw new Error(`Failed to read results: ${resultsError.message}`);
  }

  const aperture = summariseAperture((resultRows ?? []) as ApertureRow[]);

  // Refused before the model is called, not after. A finding about four rows
  // describes four rows rather than a strategy, and a confident one would get
  // a working search rewritten.
  if (!canAnalyseAperture(aperture)) {
    throw new Error(
      `Too few results to analyse — ${MIN_ROWS_FOR_ANALYSIS} are needed and this run returned ${aperture.total_rows}.`
    );
  }

  const content = normalizeRunContent(run.content_json);

  after(async () => {
    try {
      const analysis = await runCoverageAnalysis(
        {
          brief: content.brief,
          strategy_rationale: content.strategy_rationale,
          queries: content.queries.map((q) => ({
            slot: q.slot,
            content: q.content,
          })),
          yield: {
            result_count: run.result_count,
            imported_count: run.imported_count,
          },
          aperture,
        },
        { projectId, organizationId }
      );

      const background = await createServerSupabaseClient();
      await background
        .from("sourcing_runs")
        .update({ analysis_json: analysis, updated_at: new Date().toISOString() })
        .eq("id", runId);

      revalidatePath(`/app/projects/${projectId}/sourcing`);
    } catch (err) {
      // Swallowed deliberately: this runs after the response. Throwing here
      // reaches nobody, and the UI already reads "no analysis yet" — which is
      // the truth when the call failed.
      console.error("[coverage-analysis] run %s failed", runId, err);
    }
  });

  return { queued: true };
}

// ---------------------------------------------------------------------------
// Promote
// ---------------------------------------------------------------------------

export type PromoteSummary = {
  created: number;
  linked: number;
  imported: number;
};

/**
 * Turn reviewed rows into candidates.
 *
 * One RPC call, one transaction. Splitting this into candidate-insert then
 * link-insert then counter-update would let a failure between them leave a
 * candidate that no run claims — invisible in every conversion number the
 * product reports afterwards, and indistinguishable from a correct row.
 *
 * A row the recruiter skipped is simply absent from `decisions`: it stays
 * staged, unpromoted and visible, which is the honest record of "seen, not
 * taken".
 */
export async function promoteResultsAction(
  projectId: string,
  runId: string,
  decisions: PromoteDecision[]
): Promise<PromoteSummary> {
  const { organizationId } = await requireAuth();
  await loadProject(projectId, organizationId);
  const supabase = await createServerSupabaseClient();

  if (decisions.length === 0) {
    throw new Error("Nothing selected to import.");
  }

  for (const d of decisions) {
    if (d.action === "link" && !d.candidate_id) {
      throw new Error(
        "A row set to 'link' has no candidate chosen. Pick the person it matches, or create a new record."
      );
    }
  }

  const { data, error } = await supabase
    .rpc("promote_sourcing_results", {
      p_run_id: runId,
      p_decisions: decisions.map((d) => ({
        result_id: d.result_id,
        action: d.action,
        candidate_id: d.action === "link" ? d.candidate_id : null,
      })),
    })
    .single<{
      created_count: number;
      linked_count: number;
      imported_count: number;
    }>();

  if (error || !data) {
    throw new Error(
      `Nothing was imported: ${error?.message ?? "the promotion failed"}`
    );
  }

  revalidatePath(`/app/projects/${projectId}/sourcing`);
  revalidatePath(`/app/projects/${projectId}/sourcing/runs/${runId}/import`);
  revalidatePath(`/app/projects/${projectId}/candidates`);

  return {
    created: data.created_count,
    linked: data.linked_count,
    imported: data.imported_count,
  };
}
