import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { cn } from "@/lib/utils";
import {
  normalizeRunContent,
  platformLabel,
  readProvenance,
  type SourcingRunStatus,
} from "@/lib/sourcing/runs";
import { IconArrowLeft, IconSearch } from "@/components/icons";
import { ImportWizard } from "./import-wizard";
import { ReviewTable, type StagedRow, type PoolCandidate } from "./review-table";
import { isSampleId } from "@/lib/sample";
import { SampleNotBuilt } from "@/components/sample/sample-not-built";

type ProjectRow = {
  id: string;
  title: string;
};

type RunRow = {
  id: string;
  project_id: string;
  version: number;
  label: string | null;
  status: SourcingRunStatus;
  content_json: unknown;
  result_count: number;
  imported_count: number;
  executed_at: string | null;
};

export default async function ImportResultsPage({
  params,
}: {
  params: Promise<{ id: string; runId: string }>;
}) {
  const { id, runId } = await params;

  if (isSampleId(id) || isSampleId(runId)) {
    return (
      <SampleNotBuilt
        title="Import results"
        context="Sample mandate"
        backHref={`/app/projects/${id}`}
        backLabel="Mandate"
        scope="mandate"
      />
    );
  }
  const supabase = await createServerSupabaseClient();

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, title")
    .eq("id", id)
    .single<ProjectRow>();

  if (projectError || !project) {
    if (projectError?.code === "PGRST116") notFound();
    redirect("/");
  }

  const { data: run, error: runError } = await supabase
    .from("sourcing_runs")
    .select(
      "id, project_id, version, label, status, content_json, result_count, imported_count, executed_at"
    )
    .eq("id", runId)
    .single<RunRow>();

  if (runError || !run || run.project_id !== project.id) notFound();

  const { data: stagedRows } = await supabase
    .from("sourcing_run_results")
    .select(
      "id, full_name, current_title, current_company, location, profile_url, email, source_platform, match_status, matched_candidate_id, promoted_candidate_id, raw, created_at"
    )
    .eq("run_id", runId)
    .order("created_at", { ascending: true });

  const staged = (stagedRows ?? []) as StagedRow[];

  // The pool the recruiter can link an ambiguous row onto. Same project only —
  // the RPC rejects anything else, and offering a name it will refuse is worse
  // than not offering it.
  const { data: poolRows } = await supabase
    .from("candidates")
    .select("id, full_name, current_title, current_company")
    .eq("project_id", id)
    .order("full_name", { ascending: true });

  const pool = (poolRows ?? []) as PoolCandidate[];

  const content = normalizeRunContent(run.content_json);
  const provenance = staged.map((r) => readProvenance(r.raw)).find(Boolean) ?? null;
  const pending = staged.filter((r) => !r.promoted_candidate_id);

  return (
    <div className="min-h-full bg-surface text-on-surface">
      <div className="max-w-7xl mx-auto px-8 py-10 space-y-6">
        <div className="flex items-center gap-3 font-mono-label text-mono-label uppercase tracking-widest text-outline flex-wrap">
          <Link
            href={`/app/projects/${project.id}/sourcing?tab=runs`}
            prefetch={false}
            className="hover:text-on-surface transition-colors flex items-center gap-1.5"
          >
            <IconArrowLeft size={14} />
            Runs
          </Link>
          <span className="text-outline-variant">/</span>
          <span className="text-on-surface-variant">{project.title}</span>
          <span className="text-outline-variant">/</span>
          <span className="text-primary">
            v{run.version} {run.label ? `· ${run.label}` : ""}
          </span>
        </div>

        <header className="space-y-2">
          <h1 className="font-h1 text-h1 text-primary">IMPORT RESULTS</h1>
          <p className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
            {run.status === "draft"
              ? "Not yet run · bring back what your search returned"
              : `Executed ${run.executed_at ? formatDay(run.executed_at) : ""} · ${run.result_count} found · ${run.imported_count} imported`}
          </p>
          {content.strategy_rationale && (
            <p className="font-mono-data text-body-main text-on-surface-variant max-w-3xl leading-relaxed">
              {content.strategy_rationale}
            </p>
          )}
        </header>

        <QuerySnapshot queries={content.queries} />

        {run.status === "draft" ? (
          <ImportWizard projectId={project.id} runId={run.id} />
        ) : (
          <>
            {provenance && (
              <ProvenanceBar
                source={provenance.source}
                filename={provenance.filename}
                importedAt={provenance.imported_at}
                platform={staged[0]?.source_platform ?? ""}
                total={staged.length}
              />
            )}
            <ReviewTable
              projectId={project.id}
              runId={run.id}
              rows={staged}
              pool={pool}
              pendingCount={pending.length}
            />
          </>
        )}
      </div>
    </div>
  );
}

/**
 * The strategy exactly as it was snapshotted. Shown here because this is where
 * the recruiter is about to paste what it produced, and the two only mean
 * something together.
 */
function QuerySnapshot({
  queries,
}: {
  queries: Array<{ slot: string; content: string }>;
}) {
  if (queries.length === 0) return null;
  return (
    <details className="bg-surface-container-low border border-outline-variant">
      <summary className="px-4 py-2.5 bg-surface-container-high border-b border-outline-variant font-mono-label text-mono-label text-on-surface-variant uppercase tracking-widest cursor-pointer flex items-center gap-2">
        <IconSearch size={14} />
        Strategy snapshot · {queries.length}{" "}
        {queries.length === 1 ? "query" : "queries"}
      </summary>
      <ul className="p-4 space-y-2">
        {queries.map((q, i) => (
          <li key={`${q.slot}-${i}`} className="space-y-1">
            <div className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
              {q.slot.replace(/_/g, " ")}
            </div>
            <code className="block bg-surface-container-lowest border border-outline-variant px-2 py-1.5 font-mono-data text-body-main text-on-surface leading-relaxed break-words">
              {q.content}
            </code>
          </li>
        ))}
      </ul>
    </details>
  );
}

/**
 * Where this data came from. The uploaded file is deliberately not kept, so
 * this line plus the per-row line numbers ARE the audit record.
 */
function ProvenanceBar({
  source,
  filename,
  importedAt,
  platform,
  total,
}: {
  source: "paste" | "csv";
  filename: string | null;
  importedAt: string;
  platform: string;
  total: number;
}) {
  return (
    <div className={cn(
      "bg-surface-container-low border border-outline-variant px-4 py-2.5",
      "flex items-baseline gap-x-5 gap-y-1 flex-wrap font-mono-label text-mono-label uppercase tracking-widest"
    )}>
      <span className="text-outline">Provenance</span>
      <span className="text-on-surface-variant">
        Source: {source === "csv" ? "CSV upload" : "Pasted rows"}
      </span>
      {filename && (
        <span className="text-on-surface-variant">File: {filename}</span>
      )}
      <span className="text-on-surface-variant">
        Platform: {platformLabel(platform)}
      </span>
      <span className="text-on-surface-variant tabular-nums">
        {total} rows · imported {formatStamp(importedAt)}
      </span>
    </div>
  );
}

function formatDay(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

function formatStamp(iso: string): string {
  if (!iso) return "—";
  return new Date(iso).toISOString().slice(0, 16).replace("T", " ");
}
