import { notFound, redirect } from "next/navigation";
import { TerminalTitle } from "@/components/ui/page-shell";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { SetBreadcrumbs } from "@/components/dashboard/breadcrumbs";
import { LiveTick } from "@/components/ui/live-tick";
import {
  loadCalibrationHistory,
  diffWeights,
  type CalibrationHistoryEntry,
} from "@/lib/calibration/history";
import {
  DIMENSION_KEYS,
  type DimensionKey,
} from "@/lib/ai/onboarding-analysis";
import type { CalibrationModel } from "@/lib/ai/role-analysis";
import { cn } from "@/lib/utils";
import { RestoreCalibrationButton } from "./restore-button";

const CHANGE_LABEL: Record<CalibrationHistoryEntry["change_type"], string> = {
  initial: "Initial calibration",
  recalibration: "Recalibration",
  manual_edit: "Manual edit",
  restore: "Restored",
};

const CHANGE_TONE: Record<CalibrationHistoryEntry["change_type"], string> = {
  initial: "border-l-primary",
  recalibration: "border-l-secondary-fixed-dim",
  manual_edit: "border-l-tertiary",
  restore: "border-l-outline",
};

export default async function CalibrationHistoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: project, error } = await supabase
    .from("projects")
    .select("id, title, calibration_model")
    .eq("id", id)
    .single<{
      id: string;
      title: string;
      calibration_model: Partial<CalibrationModel> | null;
    }>();

  if (error || !project) {
    if (error?.code === "PGRST116") notFound();
    redirect("/");
  }

  const history = await loadCalibrationHistory(id);

  // Pair each entry with its predecessor so we can render diff chips.
  // history is newest-first → predecessor is the next index.
  const enriched = history.map((entry, i) => {
    const previous = history[i + 1];
    return {
      entry,
      diff: previous ? diffWeights(previous.snapshot, entry.snapshot) : [],
      isOldest: !previous,
    };
  });

  return (
    <div className="px-6 py-6 space-y-5 max-w-[1200px] mx-auto">
      <SetBreadcrumbs
        crumbs={[
          { label: project.title, href: `/app/projects/${project.id}`, maxChars: 32 },
          { label: "Calibration History" },
        ]}
      />

      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div className="space-y-2">
          <TerminalTitle>CALIBRATION_HISTORY</TerminalTitle>
          <p className="font-mono-label text-mono-label text-on-surface-variant uppercase tracking-widest tabular-nums">
            <span className="text-primary">
              {String(history.length).padStart(2, "0")}
            </span>{" "}
            snapshots · how the role&rsquo;s scoring model has evolved
          </p>
        </div>
        {history[0] && <LiveTick iso={history[0].created_at} label="Latest" />}
      </header>

      {history.length === 0 ? (
        <div className="bg-surface-container-low border border-outline-variant px-6 py-10 text-center">
          <p className="text-body-main text-on-surface-variant">
            No calibration history yet. The first snapshot is recorded when
            onboarding finishes deriving the calibration model.
          </p>
        </div>
      ) : (
        <ol className="space-y-3 border-l border-outline-variant pl-4">
          {enriched.map(({ entry, diff, isOldest }, i) => (
            <li key={entry.id} className="relative">
              <span
                className={cn(
                  "absolute -left-[19px] top-2 w-2.5 h-2.5 border bg-surface-container",
                  i === 0 ? "border-primary" : "border-outline"
                )}
                aria-hidden
              />
              <article
                className={cn(
                  "bg-surface-container-low border border-outline-variant border-l-2 p-4 space-y-3",
                  CHANGE_TONE[entry.change_type]
                )}
              >
                <header className="flex items-baseline justify-between gap-3 flex-wrap">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span
                      className={cn(
                        "px-1.5 py-0 border font-mono-label text-mono-label uppercase tracking-widest",
                        entry.change_type === "initial"
                          ? "border-primary/60 bg-primary-container/15 text-primary"
                          : entry.change_type === "recalibration"
                            ? "border-secondary-fixed-dim/60 bg-secondary-fixed-dim/10 text-secondary-fixed-dim"
                            : entry.change_type === "manual_edit"
                              ? "border-tertiary/60 bg-tertiary/10 text-tertiary"
                              : "border-outline-variant bg-surface-container-high text-on-surface-variant"
                      )}
                    >
                      {CHANGE_LABEL[entry.change_type]}
                    </span>
                    {i === 0 && (
                      <span className="font-mono-label text-mono-label text-primary uppercase tracking-widest">
                        · Current
                      </span>
                    )}
                  </div>
                  <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest tabular-nums">
                    {formatTimestamp(entry.created_at)}
                  </span>
                </header>

                {entry.change_reason && (
                  <p className="font-mono-data text-body-main text-on-surface leading-relaxed">
                    {entry.change_reason}
                  </p>
                )}

                <WeightsTable snapshot={entry.snapshot} />

                {!isOldest && diff.length > 0 && (
                  <div className="space-y-1.5">
                    <h3 className="font-mono-label text-mono-label text-primary uppercase tracking-widest">
                      Changes vs. previous snapshot
                    </h3>
                    <ul className="flex flex-wrap gap-1.5">
                      {diff.map((d) => (
                        <li
                          key={d.dimension}
                          className={cn(
                            "px-2 py-0.5 border font-mono-label text-mono-label uppercase tracking-widest tabular-nums",
                            d.delta > 0
                              ? "border-secondary-fixed-dim/60 bg-secondary-fixed-dim/10 text-secondary-fixed-dim"
                              : "border-error/60 bg-error/10 text-error"
                          )}
                        >
                          {d.dimension} {d.delta > 0 ? "+" : ""}
                          {d.delta}{" "}
                          <span className="text-outline">
                            ({d.before} → {d.after})
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {i !== 0 && (
                  <RestoreCalibrationButton
                    projectId={project.id}
                    snapshotId={entry.id}
                  />
                )}
              </article>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function WeightsTable({
  snapshot,
}: {
  snapshot: Partial<CalibrationModel>;
}) {
  const weights = snapshot.dimension_weights ?? {};
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
      {DIMENSION_KEYS.map((k: DimensionKey) => {
        const v = (weights as Record<string, number>)[k] ?? 0;
        return (
          <div
            key={k}
            className="bg-surface-container border border-outline-variant px-3 py-2"
          >
            <div className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
              {k}
            </div>
            <div className="font-h2 text-h2 text-on-surface tabular-nums leading-none mt-0.5">
              {v}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toISOString().replace("T", " ").slice(0, 16) + " UTC";
}
