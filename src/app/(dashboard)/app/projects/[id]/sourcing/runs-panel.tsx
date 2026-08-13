import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { cn } from "@/lib/utils";
import {
  groupLineages,
  lineageTotals,
  normalizeRunContent,
  type Lineage,
  type SourcingRunRow,
} from "@/lib/sourcing/runs";
import {
  IconArrowRight,
  IconCommit,
  IconHistory,
  IconUpload,
} from "@/components/icons";
import { CreateRunButton } from "./create-run-dialog";

/**
 * The Runs panel — a search strategy's lineage and what each version produced.
 *
 * Read the ordering before changing it. Runs are shown v1 first and all
 * versions stay equally legible, because a lineage BRANCHES rather than
 * supersedes: v1 is not an old draft of v2, it is the baseline v2 is being
 * measured against, and it stays the most interesting row in the family if it
 * is the one that produced a hire. There is deliberately no "current version",
 * nothing marked superseded or archived, and no dimming of earlier runs.
 */

type RunRow = SourcingRunRow;

export async function SourcingRunsPanel({
  projectId,
}: {
  projectId: string;
}) {
  const supabase = await createServerSupabaseClient();

  const { data: runRows, error } = await supabase
    .from("sourcing_runs")
    .select(
      "id, parent_run_id, root_run_id, version, label, status, content_json, result_count, imported_count, executed_at, created_at"
    )
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <PanelShell projectId={projectId} canCreate={false}>
        <p className="px-4 py-6 text-body-main text-error text-center">
          Could not load sourcing runs: {error.message}
        </p>
      </PanelShell>
    );
  }

  const runs = (runRows ?? []) as RunRow[];

  // Staged rows still awaiting a decision, per run. Read as ids rather than a
  // per-run count query so this stays one round trip regardless of lineage size.
  const pendingByRun = new Map<string, number>();
  if (runs.length > 0) {
    const { data: pendingRows } = await supabase
      .from("sourcing_run_results")
      .select("run_id")
      .in(
        "run_id",
        runs.map((r) => r.id)
      )
      .is("promoted_candidate_id", null);

    for (const row of (pendingRows ?? []) as Array<{ run_id: string }>) {
      pendingByRun.set(row.run_id, (pendingByRun.get(row.run_id) ?? 0) + 1);
    }
  }

  const lineages = groupLineages(runs);

  return (
    <PanelShell projectId={projectId} canCreate>
      {lineages.length === 0 ? (
        <EmptyRuns />
      ) : (
        <div className="space-y-3">
          {/* Said once for the whole panel. It is the rule that governs how
              every lineage below reads, not a property of any one of them —
              repeating it per card turned a point into wallpaper. */}
          <p className="font-mono-data text-body-main text-on-surface-variant">
            Every version stays readable. A later version is a different bet,
            not a correction — v1&rsquo;s yield is the baseline the rest are
            judged against.
          </p>
          {lineages.map((lineage) => (
            <LineageCard
              key={lineage.root_run_id}
              projectId={projectId}
              lineage={lineage}
              pendingByRun={pendingByRun}
            />
          ))}
        </div>
      )}
    </PanelShell>
  );
}

function PanelShell({
  projectId,
  canCreate,
  children,
}: {
  projectId: string;
  canCreate: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="max-w-7xl mx-auto px-6 pb-10 space-y-3">
      <header className="flex items-baseline justify-between gap-2 flex-wrap">
        <h2 className="font-mono-label text-mono-label text-primary uppercase tracking-widest flex items-center gap-2">
          <IconCommit size={14} />
          SOURCING_RUNS
        </h2>
        {canCreate && (
          <CreateRunButton
            projectId={projectId}
            parentRunId={null}
            triggerLabel="Save current strategy as a run"
          />
        )}
      </header>
      {children}
    </section>
  );
}

function EmptyRuns() {
  return (
    <div className="bg-surface-container-low border border-outline-variant p-6 space-y-2">
      <p className="text-body-main text-on-surface-variant">
        A sourcing run records a strategy as it stood, where you ran it, and
        what came back — so you can compare what different approaches actually
        produced instead of guessing.
      </p>
      <p className="text-body-main text-on-surface-variant">
        Save the current Boolean set as a run, run it in your own tool, then
        bring the results back here.
      </p>
    </div>
  );
}

function LineageCard({
  projectId,
  lineage,
  pendingByRun,
}: {
  projectId: string;
  lineage: Lineage;
  pendingByRun: Map<string, number>;
}) {
  const totals = lineageTotals(lineage);
  const originLabel = lineage.runs[0]?.label ?? "Untitled strategy";
  const nextVersion = Math.max(...lineage.runs.map((r) => r.version)) + 1;

  return (
    <article className="bg-surface-container-low border border-outline-variant overflow-hidden">
      <header className="bg-surface-container-high px-4 py-2.5 border-b border-outline-variant flex items-baseline justify-between gap-3 flex-wrap">
        <span className="font-mono-label text-mono-label text-on-surface uppercase tracking-widest flex items-center gap-2">
          <IconHistory size={14} className="text-primary" />
          {originLabel}
        </span>
        <span className="font-mono-label text-mono-label text-on-surface-variant uppercase tracking-widest tabular-nums">
          {lineage.runs.length} {lineage.runs.length === 1 ? "version" : "versions"} ·{" "}
          {totals.executed} executed · {totals.results} results ·{" "}
          {totals.imported} imported
        </span>
      </header>

      <ul className="divide-y divide-outline-variant/40">
        {lineage.runs.map((run) => (
          <RunLine
            key={run.id}
            projectId={projectId}
            run={run}
            parentVersion={
              lineage.runs.find((r) => r.id === run.parent_run_id)?.version ??
              null
            }
            pending={pendingByRun.get(run.id) ?? 0}
          />
        ))}
      </ul>

      <footer className="px-4 py-2.5 border-t border-outline-variant bg-surface-container-lowest flex items-baseline justify-end gap-3 flex-wrap">
        <CreateRunButton
          projectId={projectId}
          parentRunId={lineage.runs[lineage.runs.length - 1].id}
          triggerLabel={`Refine into v${nextVersion}`}
        />
      </footer>
    </article>
  );
}

const STATUS_TONE: Record<string, string> = {
  draft: "border-outline-variant text-on-surface-variant",
  executed: "border-secondary-fixed-dim/60 bg-secondary-fixed-dim/10 text-secondary-fixed-dim",
  archived: "border-outline-variant text-outline",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Not yet run",
  executed: "Executed",
  archived: "Retired",
};

function RunLine({
  projectId,
  run,
  parentVersion,
  pending,
}: {
  projectId: string;
  run: RunRow;
  parentVersion: number | null;
  pending: number;
}) {
  const content = normalizeRunContent(run.content_json);
  const importHref = `/app/projects/${projectId}/sourcing/runs/${run.id}/import`;

  return (
    <li className="px-4 py-3 flex items-start gap-4 flex-wrap">
      <span className="font-mono-data text-mono-data text-primary uppercase tabular-nums w-8 shrink-0 pt-0.5">
        v{run.version}
      </span>

      <div className="flex-1 min-w-[16rem] space-y-1">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-body-main text-on-surface font-semibold">
            {run.label ?? "Untitled strategy"}
          </span>
          <span
            className={cn(
              "px-1.5 py-0 border font-mono-label text-mono-label uppercase tracking-widest",
              STATUS_TONE[run.status] ?? STATUS_TONE.draft
            )}
          >
            {STATUS_LABEL[run.status] ?? run.status}
          </span>
          <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
            {parentVersion !== null
              ? `Branched from v${parentVersion}`
              : "Lineage origin"}
          </span>
        </div>

        {content.strategy_rationale && (
          <p className="font-mono-data text-body-main text-on-surface-variant leading-snug">
            {content.strategy_rationale}
          </p>
        )}

        <p className="font-mono-label text-mono-label text-outline uppercase tracking-widest tabular-nums">
          {content.queries.length}{" "}
          {content.queries.length === 1 ? "query" : "queries"} snapshotted
          {run.executed_at ? ` · executed ${formatDay(run.executed_at)}` : ""}
        </p>
      </div>

      <div className="flex items-center gap-4 shrink-0">
        <Yield run={run} />
        {run.status === "draft" ? (
          <Link
            href={importHref}
            prefetch={false}
            className="px-3 py-1.5 bg-primary-container text-on-primary-container font-mono-label text-mono-label uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-[filter,transform] flex items-center gap-1.5"
          >
            <IconUpload size={14} />
            Import results
          </Link>
        ) : (
          <Link
            href={importHref}
            prefetch={false}
            className="px-3 py-1.5 border border-outline-variant text-on-surface-variant font-mono-label text-mono-label uppercase tracking-widest hover:border-primary hover:text-primary transition-colors flex items-center gap-1.5"
          >
            {pending > 0 ? `Review ${pending}` : "View results"}
            <IconArrowRight size={14} />
          </Link>
        )}
      </div>
    </li>
  );
}

function Yield({ run }: { run: RunRow }) {
  if (run.status === "draft") {
    return (
      <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
        No results yet
      </span>
    );
  }
  return (
    <span className="font-mono-data text-mono-data text-on-surface uppercase tabular-nums whitespace-nowrap">
      {run.result_count} found
      <span className="text-outline"> → </span>
      {run.imported_count} imported
    </span>
  );
}

function formatDay(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}
