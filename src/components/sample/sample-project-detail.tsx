import Link from "next/link";
import { notFound } from "next/navigation";
import { SetBreadcrumbs } from "@/components/dashboard/breadcrumbs";
import { SampleBanner } from "@/components/sample/sample-banner";
import { IconInfo } from "@/components/icons";
import {
  SAMPLE_CALIBRATION_HISTORY,
  SAMPLE_MANDATE_ID,
  SAMPLE_METRICS,
  SAMPLE_SPEC,
  sampleFunnel,
  sampleMandate,
  sampleCandidatesForMandate,
} from "@/lib/sample";
import { SampleModuleRail } from "@/components/sample/sample-mandate-shell";

/**
 * The sample mandate workspace — comp 08, rendered from fixtures.
 *
 * Reached only via a `sample-` id, so it can never collide with a real
 * project and never runs a query. It exists so the sample journey is
 * walkable: the dashboard's mandate rows go somewhere, and from here a
 * candidate row goes somewhere too. A demo you cannot click through
 * teaches the shape of one screen, not how the product works.
 *
 * The comp's rules that matter here:
 *
 * - **The agent stack goes at the top** and carries real state. It is
 *   the signature idea in the product.
 * - **A live agent gets a full tile** with a reason and progress; a
 *   completed one collapses to a quiet receipt, so running work stays
 *   legible against eleven finished ones.
 * - **Failure is a state, not an accident** — it names what timed out
 *   and offers retry in place.
 * - **One h1.** The role title is the heading; company, tenure and
 *   hiring manager are metadata beneath it, not competing headings.
 */

type TileState = "active" | "failed" | "queued" | "standby";

const LIVE_TILES: ReadonlyArray<{
  state: TileState;
  label: string;
  name: string;
  detail: string;
  progress?: number;
}> = [
  {
    state: "active",
    label: "Active",
    name: "Feedback Agent",
    detail: "Interpreting client portal signals · started 40s ago",
    progress: 62,
  },
  {
    state: "failed",
    label: "Failed",
    name: "Triangulation Agent",
    detail: "Upstream timeout on HM research · 06:52",
  },
  {
    state: "queued",
    label: "Queued",
    name: "Ranking Agent",
    detail: "Waits for feedback interpretation to land",
  },
  {
    state: "standby",
    label: "Stand-by",
    name: "Report Agent",
    detail: "Runs on demand from Reports",
  },
];

/*
  Everything below is derived from `src/lib/sample/mandate-modules.ts` rather
  than typed here.

  It used to be typed here, and adding the module screens in W3 is what
  showed why that could not stand: this page said the spec was at v4 and the
  model had nine dimensions approved on day 4, while `/spec` said FINAL_V01
  and `/calibration-history` said five dimensions recalibrated on day 22 from
  client feedback. Both screens were describing the same search and they
  disagreed on every number they shared.

  Deriving them is the fix that holds. `mandate-modules.test.ts` pins the
  fixture's own internal consistency; this makes the mandate page a reader of
  it rather than a second, quieter copy.
*/
const CURRENT_MODEL = SAMPLE_CALIBRATION_HISTORY[0];

/** Which day of the search something that happened `daysAgo` fell on. */
function dayOf(daysAgo: number, mandateDay: number): number {
  return Math.max(1, mandateDay - daysAgo);
}

const BAR = CURRENT_MODEL.weights.map((w) => ({
  label: w.name,
  weight: w.weight,
}));

function Section({
  title,
  meta,
  action,
  children,
}: {
  title: string;
  meta?: React.ReactNode;
  action?: { label: string; href: string };
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden border border-outline-variant bg-surface-container-low">
      <div className="flex items-center gap-2.5 border-b border-outline-variant px-[18px] py-[15px]">
        <h2 className="font-mono-label text-mono-label uppercase tracking-widest text-primary">
          {title}
        </h2>
        {meta}
        {action && (
          <Link
            href={action.href}
            className="ml-auto text-xs font-medium text-primary hover:underline"
          >
            {action.label}
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

export function SampleProjectDetail({ id }: { id: string }) {
  const mandate = sampleMandate(id);
  if (!mandate) notFound();

  const candidates = sampleCandidatesForMandate(id);

  const funnel = sampleFunnel();
  const reviewed = funnel.find((f) => f.stage === "Reviewed")?.count ?? 0;
  const shortlisted = funnel.find((f) => f.stage === "Shortlisted")?.count ?? 0;
  const specDay = dayOf(SAMPLE_SPEC.finalisedDaysAgo, mandate.dayOfSearch);
  const modelDay = dayOf(CURRENT_MODEL.daysAgo, mandate.dayOfSearch);

  const DONE_TILES: ReadonlyArray<{ name: string; meta: string }> = [
    { name: "Intake Agent", meta: "DAY 1 · 09:12" },
    { name: "Company Research", meta: "DAY 1 · 18 SOURCES" },
    { name: "Role Spec Agent", meta: `DAY ${specDay} · ${SAMPLE_SPEC.label}` },
    {
      name: "Calibration Agent",
      meta: `DAY ${modelDay} · V${String(CURRENT_MODEL.version).padStart(2, "0")} · ${CURRENT_MODEL.weights.length} DIMENSIONS`,
    },
  ];

  const STAGES: ReadonlyArray<{
    label: string;
    tone: "done" | "risk" | "todo";
    grow?: number;
  }> = [
    { label: "Intake", tone: "done" },
    { label: "Research", tone: "done" },
    { label: "Spec final", tone: "done" },
    { label: "Calibrated", tone: "done" },
    { label: "Sourced", tone: "done" },
    { label: `${reviewed} evaluated`, tone: "done" },
    { label: `Shortlist ${shortlisted}`, tone: "done" },
    {
      label: `With client · ${SAMPLE_METRICS.daysSinceLastMovement} days`,
      tone: "risk",
      grow: 1.2,
    },
    { label: "Offer", tone: "todo" },
  ];

  return (
    <div className="mx-auto max-w-[1600px] px-6 py-6">
      <SetBreadcrumbs
        crumbs={[
          { label: "Mandates", href: "/app/projects" },
          { label: `${mandate.title} · ${mandate.company}` },
        ]}
      />

      <SampleBanner scope="mandate" />

      {/* One h1. Everything else beneath it is metadata. */}
      <div className="mt-5 flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-[28px] font-bold leading-tight tracking-tight text-on-surface">
              {mandate.title}
            </h1>
            <span className="border border-outline-variant bg-surface-container px-2 py-1 font-mono-label text-[10px] font-semibold uppercase tracking-[0.1em] text-primary">
              {mandate.stage}
            </span>
            {mandate.health !== "on_track" && (
              <span className="border border-error/60 bg-surface-container px-2 py-1 font-mono-label text-[10px] font-semibold uppercase tracking-[0.1em] text-error">
                {mandate.health === "blocked" ? "Blocked" : "Stalling"}
              </span>
            )}
          </div>
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-outline">
            <span className="text-on-surface-variant">{mandate.company}</span>
            <span aria-hidden className="text-outline-variant">/</span>
            <span>
              Day {mandate.dayOfSearch} of {mandate.searchLengthDays}
            </span>
            <span aria-hidden className="text-outline-variant">/</span>
            <span>Owner {mandate.owner}</span>
          </p>
        </div>
      </div>

      {/*
        The module rail. Only on Larkspur, because it is the one sample
        mandate with module screens behind it — the other six would offer
        seven links that all show a different search.

        Before W3 there was no rail and every sub-route redirected to
        `/app/home`, so the sample workspace was one screen deep and the
        product's own shape was invisible from inside it.
      */}
      {mandate.id === SAMPLE_MANDATE_ID && (
        <div className="mt-5">
          <SampleModuleRail />
        </div>
      )}

      {/* Stage rail */}
      <div className="mt-5 flex items-center gap-2.5 border border-outline-variant bg-surface-container-low px-[18px] py-4">
        {STAGES.map((s) => (
          <div
            key={s.label}
            className="flex flex-col gap-2"
            style={{ flex: s.grow ?? 1 }}
          >
            <span
              aria-hidden
              className={`h-[3px] ${
                s.tone === "done"
                  ? "bg-primary"
                  : s.tone === "risk"
                    ? "bg-error"
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

      <div className="mt-5 grid gap-[18px] xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-[18px]">
          <Section
            title="Agent stack"
            meta={
              <span className="font-mono-label text-[11px] text-outline">
                17 AGENTS · 11 COMPLETE · 1 RUNNING · 1 FAILED
              </span>
            }
          >
            <div className="grid gap-3 p-[18px] sm:grid-cols-2 xl:grid-cols-4">
              {LIVE_TILES.map((t) => (
                <div
                  key={t.name}
                  className={`flex flex-col gap-2.5 border bg-surface-container p-3.5 ${
                    t.state === "active"
                      ? "border-primary"
                      : t.state === "failed"
                        ? "border-error/60"
                        : "border-outline-variant"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className={`h-[7px] w-[7px] ${
                        t.state === "active"
                          ? "bg-primary"
                          : t.state === "failed"
                            ? "bg-error"
                            : "bg-outline-variant"
                      }`}
                    />
                    <span
                      className={`font-mono-label text-[10px] font-bold uppercase tracking-[0.1em] ${
                        t.state === "active"
                          ? "text-primary"
                          : t.state === "failed"
                            ? "text-error"
                            : "text-outline"
                      }`}
                    >
                      {t.label}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-on-surface">{t.name}</p>
                  <p className="text-xs leading-relaxed text-outline">{t.detail}</p>

                  {t.progress !== undefined && (
                    <span
                      aria-hidden
                      className="h-[3px] overflow-hidden bg-surface-container-high"
                    >
                      <span
                        className="block h-full bg-primary"
                        style={{ width: `${t.progress}%` }}
                      />
                    </span>
                  )}

                  {/* Failure offers recovery in place, not a shrug. */}
                  {t.state === "failed" && (
                    <span className="mt-auto inline-flex h-[30px] items-center justify-center border border-outline-variant bg-surface-container-high text-[11px] font-semibold text-on-surface">
                      Retry
                    </span>
                  )}
                </div>
              ))}

              {/* Completed agents collapse to a receipt so the running
                  work stays legible against eleven finished ones. */}
              {DONE_TILES.map((t) => (
                <div
                  key={t.name}
                  className="flex flex-col gap-2 border border-outline-variant bg-surface-container-low p-3.5"
                >
                  <div className="flex items-center gap-2">
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2.4}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                      className="text-outline"
                    >
                      <path d="m5 12 5 5 9-11" />
                    </svg>
                    <span className="font-mono-label text-[10px] font-bold uppercase tracking-[0.1em] text-outline">
                      Complete
                    </span>
                  </div>
                  <p className="text-[13px] font-medium text-on-surface-variant">
                    {t.name}
                  </p>
                  <p className="font-mono-label text-[11px] text-outline">
                    {t.meta}
                  </p>
                </div>
              ))}
            </div>
          </Section>

          <div className="grid gap-[18px] lg:grid-cols-2">
            <Section
              title="Company context"
              meta={
                <span className="ml-auto font-mono-label text-[10px] uppercase tracking-[0.08em] text-outline">
                  18 sources
                </span>
              }
            >
              <div className="flex flex-col gap-3 px-[18px] py-4">
                <p className="text-[13px] leading-relaxed text-on-surface-variant">
                  {mandate.company} runs a decade-old core platform with a
                  stalled cloud migration. Two prior hires left inside 20
                  months. The board has approved a three-year modernisation
                  budget but has not restructured the reporting line.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {["Regulated", "Turnaround", "Legacy estate", "Board scrutiny"].map(
                    (t) => (
                      <span
                        key={t}
                        className="bg-surface-container-high px-2.5 py-1.5 font-mono-label text-mono-label uppercase tracking-wider text-on-surface-variant"
                      >
                        {t}
                      </span>
                    )
                  )}
                </div>
              </div>
            </Section>

            <Section
              title="Hiring manager intelligence"
              meta={
                <span className="ml-auto font-mono-label text-[10px] uppercase tracking-[0.08em] text-outline">
                  Decision support
                </span>
              }
            >
              <div className="flex flex-col gap-3 px-[18px] py-4">
                {[
                  {
                    k: "Stated",
                    v: "Wants a transformation leader with a strong platform record",
                  },
                  {
                    k: "Revealed",
                    v: 'Advanced two operators; rejected both transformers on "pace"',
                  },
                  {
                    k: "Gap",
                    v: "Ambition is transformation; tolerance is continuity. Worth a direct conversation before the next slate.",
                  },
                ].map((r) => (
                  <div key={r.k} className="flex items-start gap-2.5">
                    <span className="w-16 shrink-0 font-mono-label text-[11px] uppercase text-outline">
                      {r.k}
                    </span>
                    <span className="text-[13px] leading-relaxed text-on-surface-variant">
                      {r.v}
                    </span>
                  </div>
                ))}
                {/* The product's AI rules require this, and the comp
                    carries it too: no profiling of the individual. */}
                <p className="flex items-start gap-2 border-t border-outline-variant/60 pt-3 text-[11px] leading-snug text-outline">
                  <IconInfo size={13} className="mt-px shrink-0" />
                  Derived from recorded decisions and your notes. No
                  psychological profiling, no inference about the individual.
                </p>
              </div>
            </Section>
          </div>

          {candidates.length > 0 && (
            <Section
              title="Candidates"
              meta={
                <span className="font-mono-label text-[11px] text-outline">
                  {candidates.length} IN SAMPLE
                </span>
              }
              action={{ label: "All candidates", href: "/app/candidates" }}
            >
              <ul className="divide-y divide-outline-variant/40">
                {candidates.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/app/projects/${id}/candidates/${c.id}`}
                      className="flex items-center gap-3 px-[18px] py-3 transition-colors hover:bg-surface-container focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium text-on-surface">
                          {c.name}
                        </span>
                        <span className="block truncate text-xs text-outline">
                          {c.parsing
                            ? c.fileName
                            : `${c.currentTitle} · ${c.currentCompany}`}
                        </span>
                      </span>
                      {c.tier !== null && (
                        <span
                          className={`shrink-0 px-2 py-1 font-mono-label text-[10px] font-bold uppercase tracking-[0.08em] ${
                            c.tier === 1
                              ? "bg-primary/20 text-primary"
                              : "bg-surface-container-high text-on-surface-variant"
                          }`}
                        >
                          Tier {c.tier}
                        </span>
                      )}
                      <span className="w-8 shrink-0 text-right font-mono-data text-[13px] text-on-surface">
                        {c.fit ?? "—"}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>

        <div className="flex flex-col gap-[18px]">
          <Section title="Calibrated bar">
            <div className="flex flex-col gap-3 px-[18px] py-4">
              {BAR.map((d) => (
                <div key={d.label}>
                  <div className="flex justify-between text-xs font-medium text-on-surface-variant">
                    <span>{d.label}</span>
                    <span className="font-mono-data">{d.weight}%</span>
                  </div>
                  <span
                    aria-hidden
                    className="mt-1 block h-1 bg-surface-container-high"
                  >
                    <span
                      className="block h-full bg-primary"
                      style={{ width: `${d.weight}%` }}
                    />
                  </span>
                </div>
              ))}
              <p className="border-t border-outline-variant/60 pt-3 text-[11px] text-outline">
                {CURRENT_MODEL.trigger} on day {modelDay} · v
                {String(CURRENT_MODEL.version).padStart(2, "0")}
              </p>
            </div>
          </Section>

          <Section title="Must-haves & anti-patterns">
            <div className="flex flex-col gap-3.5 px-[18px] py-4">
              <div className="flex flex-col gap-1.5">
                <p className="font-mono-label text-[10px] font-bold uppercase tracking-[0.12em] text-outline">
                  Must have
                </p>
                <p className="text-[13px] leading-relaxed text-on-surface-variant">
                  Ran technology in a regulated provider at 5k+ staff · owned a
                  multi-year platform replacement end to end · board-level
                  exposure
                </p>
              </div>
              <div className="flex flex-col gap-1.5">
                <p className="font-mono-label text-[10px] font-bold uppercase tracking-[0.12em] text-error">
                  Anti-pattern
                </p>
                <p className="text-[13px] leading-relaxed text-on-surface-variant">
                  Pure vendor-side leadership · consultancy-only delivery record
                  · never held a P&amp;L or a permanent team
                </p>
              </div>
            </div>
          </Section>

          <Section title="Search health">
            <div className="flex flex-col gap-3 px-[18px] py-4">
              <div className="flex items-baseline gap-2.5">
                <span className="font-heading text-[26px] leading-none tabular-nums text-error">
                  {SAMPLE_METRICS.daysSinceLastMovement}
                </span>
                <span className="text-[13px] leading-snug text-on-surface-variant">
                  days since the slate was delivered with no client response
                </span>
              </div>
              <p className="text-[13px] leading-relaxed text-on-surface-variant">
                Median for closed mandates in this workspace is 2.4 days. Two of
                the four submitted candidates have competing processes recorded.
              </p>
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}
