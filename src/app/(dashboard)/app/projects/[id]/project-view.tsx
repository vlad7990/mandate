import Link from "next/link";
import { SetBreadcrumbs } from "@/components/dashboard/breadcrumbs";
import { LiveTick } from "@/components/ui/live-tick";
import { StatusChip, type ChipTone } from "@/components/ui/status-chip";
import { Panel, PanelLink, PanelMeta } from "@/components/projects/panel";
import {
  AgentTiles,
  type AgentTileAction,
  type AgentTileKey,
  type AgentTileState,
} from "@/components/projects/agent-tiles";

/**
 * The mandate workspace — comp 08, on real data.
 *
 * Presentation only: `page.tsx` runs every query and hands over a finished
 * view model, which is what makes an authenticated screen verifiable — the
 * view renders from fixtures in a browser without a session.
 *
 * The comp's rules that carry over:
 *
 * - **One h1.** The role title is the heading; company, brief and owner are
 *   metadata beneath it, not competing headings.
 * - **The agent stack goes at the top** and carries real state.
 * - **The stage rail is the search at a glance**, and every segment is
 *   computed — see the note on `stages` below.
 *
 * Departures from the comp, because the comp outruns the product:
 *
 * - The comp badges the stack "17 agents · 11 complete". Four agents run on
 *   this surface (`AGENT_TILES`), so the meta line counts four.
 * - The comp's "Must-haves & anti-patterns" and "Search health" panels are
 *   fixtures with no table behind them. In their place the rail carries what
 *   the product does hold: the calibrated dimension weights, the real weekly
 *   health figures, and the calibration's own list of what it still needs.
 * - The interactive panels — candidate search and the four intelligence
 *   agents — are full-width below the grid rather than inside it. They are
 *   large client components in the older idiom; restyling them is a separate
 *   job, and squeezing them into a 340px rail would be a worse one.
 */

export type StageTone = "done" | "active" | "risk" | "todo";

export type Stage = {
  label: string;
  tone: StageTone;
  /** Widen a segment that carries a number worth reading. */
  grow?: number;
};

export type ProjectVm = {
  projectId: string;
  title: string;
  companyName: string;
  oneLineInput: string;
  statusLabel: string;
  statusTone: ChipTone;
  ready: boolean;
  calibrated: boolean;
  /**
   * The search at a glance. Every segment is computed from a row that
   * exists — specs, boolean queries, scores, the shortlist, pipeline
   * stages — never from the comp, which drew nine fixtures.
   */
  stages: Stage[];
  agentStates: Record<AgentTileKey, AgentTileState>;
  specAction: AgentTileAction;
  agentMeta: string;
  modules: { href: string; label: string }[];
  roleFields: { label: string; value: string }[];
  companyFields: { label: string; value: string }[];
  inferredScope: string | null;
  weights: { key: string; label: string; value: number }[];
  weightsRationale: string | null;
  health: {
    statusLabel: string;
    statusTone: ChipTone;
    href: string;
    kpis: { label: string; value: string; unit: string }[];
    alerts: { label: string; critical: boolean }[];
  } | null;
  missingInformation: string[];
  /** Rendered above the grid: recalibration, sourcing CTA. */
  banners?: React.ReactNode;
  /** Rendered full-width below the grid: search + intelligence panels. */
  panels?: React.ReactNode;
};

function FieldList({ rows }: { rows: { label: string; value: string }[] }) {
  return (
    <dl className="flex flex-col gap-2.5">
      {rows.map((r) => (
        <div key={r.label} className="flex items-baseline justify-between gap-4">
          <dt className="font-mono-label text-[10px] font-bold uppercase tracking-[0.12em] text-outline">
            {r.label}
          </dt>
          <dd className="min-w-0 truncate text-[13px] text-on-surface">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function SkeletonRows({ rows }: { rows: number }) {
  return (
    <div className="flex flex-col gap-3" role="status" aria-label="Loading content">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex flex-col gap-1.5">
          <div className="h-3 w-20 animate-pulse rounded-sm bg-surface-container-high" />
          <div
            className="h-4 animate-pulse rounded-sm bg-surface-container-high"
            style={{ width: `${50 + ((i * 17) % 40)}%` }}
          />
        </div>
      ))}
    </div>
  );
}

export function ProjectView({ vm }: { vm: ProjectVm }) {
  // The furthest stage that has actually happened — everything after it is
  // still `todo`. Used by the narrow-screen rail.
  const lastReached = vm.stages.map((s) => s.tone !== "todo").lastIndexOf(true);
  const currentIndex = lastReached === -1 ? 0 : lastReached;
  const currentStage = vm.stages[currentIndex] ?? { label: "—", tone: "todo" as const };

  return (
    <div className="mx-auto max-w-[1600px] px-6 py-6">
      <SetBreadcrumbs
        crumbs={[
          { label: "Mandates", href: "/app/projects" },
          { label: `${vm.title} · ${vm.companyName}` },
        ]}
      />

      {/* One h1. Everything else beneath it is metadata. */}
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            {vm.ready ? (
              <h1 className="text-[28px] font-bold leading-tight tracking-tight text-on-surface">
                {vm.title}
              </h1>
            ) : (
              <div
                className="h-9 w-72 animate-pulse rounded-md bg-surface-container-high"
                role="status"
                aria-label="Loading mandate title"
              />
            )}
            <StatusChip tone={vm.statusTone} dot pulse={vm.statusLabel === "active"}>
              {vm.statusLabel}
            </StatusChip>
          </div>
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-outline">
            <span className="text-on-surface-variant">{vm.companyName}</span>
            <span aria-hidden className="text-outline-variant">
              /
            </span>
            <span className="max-w-[60ch] truncate">{vm.oneLineInput}</span>
          </p>
        </div>

        {/* Not `shrink-0`: at 390 the tick plus two actions is 500px wide,
            and refusing to shrink pushed the page into horizontal scroll. */}
        <div className="flex flex-wrap items-center gap-2">
          <LiveTick nowOnServer label="Snapshot" />
          {vm.ready && (
            <>
              <Link
                href={`/app/projects/${vm.projectId}/onboarding`}
                prefetch={false}
                className={
                  vm.calibrated
                    ? "flex items-center gap-2 rounded-md border border-outline-variant px-4 py-2 font-mono-label text-[11px] font-semibold uppercase tracking-[0.1em] text-on-surface-variant transition-colors hover:border-primary hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    : "flex items-center gap-2 rounded-md bg-primary-container px-4 py-2 font-mono-label text-[11px] font-semibold uppercase tracking-[0.1em] text-on-primary-container transition-[filter,transform] hover:brightness-110 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                }
              >
                {vm.calibrated ? "Re-run calibration" : "Start onboarding"}
              </Link>
              <Link
                href={`/app/projects/${vm.projectId}/hiring-manager`}
                prefetch={false}
                className="flex items-center gap-2 rounded-md border border-outline-variant px-4 py-2 font-mono-label text-[11px] font-semibold uppercase tracking-[0.1em] text-on-surface-variant transition-colors hover:border-primary hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                Share with HM
              </Link>
            </>
          )}
        </div>
      </div>

      {vm.ready && vm.modules.length > 0 && (
        <nav
          aria-label="Project modules"
          className="mt-5 overflow-hidden rounded-xl border border-outline-variant bg-surface-container-low"
        >
          <ul className="flex divide-x divide-outline-variant overflow-x-auto">
            {vm.modules.map((mod) => (
              <li key={mod.label} className="min-w-[120px] flex-1">
                <Link
                  href={mod.href}
                  prefetch={false}
                  className="flex items-center justify-center px-4 py-3 font-mono-label text-[11px] font-semibold uppercase tracking-[0.1em] text-on-surface-variant transition-colors hover:bg-surface-container hover:text-primary focus-visible:bg-surface-container focus-visible:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary"
                >
                  {mod.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {vm.stages.length > 0 && (
        <>
          {/*
            At 390 nine segments truncate to two letters each — "IN… RE… SP…"
            — which is noise wearing the shape of information. Narrow screens
            get the position and the current stage in words instead; the rail
            itself starts at sm.
          */}
          <div className="mt-5 flex flex-col gap-2 rounded-xl border border-outline-variant bg-surface-container-low px-[18px] py-4 sm:hidden">
            <div className="flex items-baseline justify-between gap-3">
              <span
                className={`font-mono-label text-[11px] font-semibold uppercase tracking-[0.08em] ${
                  currentStage.tone === "risk" ? "text-error" : "text-on-surface-variant"
                }`}
              >
                {currentStage.label}
              </span>
              <span className="font-mono-label text-[10px] uppercase tracking-[0.08em] text-outline tabular-nums">
                Stage {currentIndex + 1} of {vm.stages.length}
              </span>
            </div>
            <span aria-hidden className="block h-[3px] rounded-sm bg-surface-container-high">
              <span
                className={`block h-full rounded-sm ${
                  currentStage.tone === "risk" ? "bg-error" : "bg-primary"
                }`}
                style={{ width: `${((currentIndex + 1) / vm.stages.length) * 100}%` }}
              />
            </span>
          </div>

          <div className="mt-5 hidden items-center gap-2.5 rounded-xl border border-outline-variant bg-surface-container-low px-[18px] py-4 sm:flex">
          {vm.stages.map((s) => (
            <div
              key={s.label}
              className="flex min-w-0 flex-col gap-2"
              style={{ flex: s.grow ?? 1 }}
            >
              <span
                aria-hidden
                className={`h-[3px] rounded-sm ${
                  s.tone === "done"
                    ? "bg-primary"
                    : s.tone === "risk"
                      ? "bg-error"
                      : s.tone === "active"
                        ? "bg-primary/40"
                        : "bg-surface-container-high"
                }`}
              />
              <span
                className={`truncate font-mono-label text-[10px] font-semibold uppercase tracking-[0.08em] ${
                  s.tone === "risk"
                    ? "text-error"
                    : s.tone === "todo"
                      ? "text-outline-variant"
                      : "text-outline"
                }`}
              >
                {s.label}
              </span>
            </div>
            ))}
          </div>
        </>
      )}

      {vm.banners && <div className="mt-5 flex flex-col gap-[18px]">{vm.banners}</div>}

      <div className="mt-5 grid gap-[18px] xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-[18px]">
          <Panel
            title="Agent stack"
            meta={<PanelMeta>{vm.agentMeta}</PanelMeta>}
          >
            <div className="p-[18px]">
              <AgentTiles states={vm.agentStates} actions={{ role_spec: vm.specAction }} />
            </div>
          </Panel>

          <div className="grid gap-[18px] lg:grid-cols-2">
            <Panel title="Role calibration">
              <div className="flex flex-col gap-3.5 px-[18px] py-4">
                {vm.ready ? (
                  <>
                    <FieldList rows={vm.roleFields} />
                    {vm.inferredScope && (
                      <div className="flex flex-col gap-1.5 border-t border-outline-variant/60 pt-3.5">
                        <p className="font-mono-label text-[10px] font-bold uppercase tracking-[0.12em] text-outline">
                          Inferred scope
                        </p>
                        <p className="text-[13px] leading-relaxed text-on-surface-variant">
                          {vm.inferredScope}
                        </p>
                      </div>
                    )}
                  </>
                ) : (
                  <SkeletonRows rows={4} />
                )}
              </div>
            </Panel>

            <Panel title="Company context">
              <div className="px-[18px] py-4">
                {vm.ready ? <FieldList rows={vm.companyFields} /> : <SkeletonRows rows={3} />}
              </div>
            </Panel>
          </div>

          {vm.missingInformation.length > 0 && (
            <Panel
              title="Information required"
              meta={
                <span className="ml-auto">
                  <PanelMeta>{vm.missingInformation.length}</PanelMeta>
                </span>
              }
            >
              {/* The calibration's own list of what it could not establish.
                  It sits in the rail beside the weights it affects, not in a
                  banner at the bottom of the page where it was never read. */}
              <ul className="flex flex-col gap-2.5 px-[18px] py-4">
                {vm.missingInformation.map((item) => (
                  <li
                    key={item}
                    className="text-[13px] leading-relaxed text-on-surface-variant"
                  >
                    {item}
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>

        <div className="flex flex-col gap-[18px]">
          {vm.weights.length > 0 && (
            <Panel
              title="Calibrated bar"
              meta={
                <span className="ml-auto">
                  <PanelMeta>0–10 scale</PanelMeta>
                </span>
              }
            >
              <div className="flex flex-col gap-3 px-[18px] py-4">
                {vm.weights.map((d) => (
                  <div key={d.key}>
                    <div className="flex justify-between gap-3 text-xs font-medium text-on-surface-variant">
                      <span className="min-w-0 truncate">{d.label}</span>
                      <span className="font-mono-data shrink-0 tabular-nums">
                        {d.value}
                      </span>
                    </div>
                    <span
                      aria-hidden
                      className="mt-1 block h-1 rounded-sm bg-surface-container-high"
                    >
                      <span
                        className="block h-full rounded-sm bg-primary"
                        style={{ width: `${(d.value / 10) * 100}%` }}
                      />
                    </span>
                  </div>
                ))}
                {vm.weightsRationale && (
                  <p className="border-t border-outline-variant/60 pt-3 text-[11px] leading-relaxed text-outline">
                    {vm.weightsRationale}
                  </p>
                )}
              </div>
            </Panel>
          )}

          {vm.health && (
            <Panel
              title="Search health"
              meta={
                <StatusChip tone={vm.health.statusTone} dot>
                  {vm.health.statusLabel}
                </StatusChip>
              }
              action={<PanelLink href={vm.health.href}>Metrics</PanelLink>}
            >
              <div className="grid grid-cols-2 divide-x divide-y divide-outline-variant/40 border-b border-outline-variant/40">
                {vm.health.kpis.map((k) => (
                  <div key={k.label} className="flex flex-col gap-1 px-[18px] py-3">
                    <span className="font-mono-label text-[10px] font-bold uppercase tracking-[0.12em] text-outline">
                      {k.label}
                    </span>
                    <span className="font-heading text-[22px] leading-none tabular-nums text-on-surface">
                      {k.value}
                    </span>
                    <span className="font-mono-label text-[10px] uppercase tracking-[0.08em] text-outline">
                      {k.unit}
                    </span>
                  </div>
                ))}
              </div>
              {vm.health.alerts.length > 0 && (
                <div className="flex flex-wrap gap-1.5 px-[18px] py-3">
                  {vm.health.alerts.map((a) => (
                    <StatusChip
                      key={a.label}
                      tone={a.critical ? "danger" : "warn"}
                      intensity="soft"
                    >
                      <span className="sr-only">
                        {a.critical ? "Critical: " : "Warning: "}
                      </span>
                      {a.label}
                    </StatusChip>
                  ))}
                </div>
              )}
            </Panel>
          )}

        </div>
      </div>

      {vm.panels && <div className="mt-[18px] flex flex-col gap-[18px]">{vm.panels}</div>}
    </div>
  );
}
