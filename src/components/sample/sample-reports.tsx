import Link from "next/link";
import { notFound } from "next/navigation";
import { SetBreadcrumbs } from "@/components/dashboard/breadcrumbs";
import { SampleBanner } from "@/components/sample/sample-banner";
import { SampleModuleRail } from "@/components/sample/sample-mandate-shell";
import { PageShell, QUIET_ACTION, TerminalTitle } from "@/components/ui/page-shell";
import { MastHead } from "@/components/ui/mast-head";
import { StatusChip } from "@/components/ui/status-chip";
import { KpiTile } from "@/components/ui/kpi-tile";
import {
  DIMENSIONS,
  SAMPLE_COMPARISON,
  SAMPLE_MANDATE_ID,
  SAMPLE_TRADE_OFF,
  currentWeights,
  sampleCandidate,
  sampleMandate,
  sampleRanking,
  samplePortfolio,
  sampleUnranked,
  type SampleDimension,
  type SampleRankedCandidate,
} from "@/lib/sample";

/**
 * Ranking, comparison and portfolio analytics — W6.
 *
 * Read-only, like the rest of the sample: the real screens carry Refresh
 * scores, Build shortlist and an export, and none of them is drawn here.
 *
 * ## What the survey got wrong about these
 *
 * The inventory classified `/comparison` as `generated` and blocked on D1.
 * It calls no agent at all — the master table, the tier bands, the reality
 * statement and the partner take are computed in TypeScript from scores and
 * weights (`comparison-export.ts`). The only agent in this workstream is the
 * trade-off analysis on `/ranking/compare`, and the product's own prompt
 * already draws the line it works inside: comparative, anchored on the role
 * weights, "stronger" and "weaker" relative to the others in the set.
 *
 * So W6 needed no new judgement about what an agent may say. It follows the
 * shape `sample-candidate-detail.tsx` set — **a score never travels without
 * the fact that produced it** — and applies it to five dimensions and six
 * people.
 */

const TIER_LABEL: Record<number, string> = {
  1: "Tier 1",
  2: "Tier 2",
  3: "Tier 3",
  4: "Tier 4",
};

function DimensionBar({
  dimension,
  score,
  weight,
  evidence,
}: {
  dimension: SampleDimension;
  score: number;
  weight: number;
  evidence: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="font-mono-label text-mono-label uppercase tracking-wider text-on-surface-variant">
          {dimension}
        </span>
        <span className="font-mono-data text-[13px] tabular-nums text-on-surface">
          {score.toFixed(1)}
        </span>
        <span className="font-mono-label text-[11px] uppercase tracking-[0.08em] tabular-nums text-outline">
          weight {weight}
        </span>
      </div>
      <span aria-hidden className="block h-1 bg-surface-container-high">
        <span
          className="block h-full bg-primary"
          style={{ width: `${score * 10}%` }}
        />
      </span>
      {/* The rule this whole surface exists to demonstrate. */}
      <p className="font-mono-label text-[11px] uppercase leading-[1.4] tracking-[0.08em] text-outline">
        {evidence}
      </p>
    </div>
  );
}

/* ── Ranking ─────────────────────────────────────────────────────── */

export function SampleRanking({ id }: { id: string }) {
  const mandate = sampleMandate(id);
  if (!mandate) notFound();

  const ranked = sampleRanking(id);
  const unranked = sampleUnranked(id);
  const weights = currentWeights();

  return (
    <PageShell className="space-y-5">
      <SetBreadcrumbs
        crumbs={[
          { label: "Mandates", href: "/app/projects" },
          { label: mandate.title, href: `/app/projects/${id}` },
          { label: "Ranking" },
        ]}
      />

      <SampleBanner scope="mandate" />

      <header className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start">
        <div className="min-w-0 flex-1">
          <TerminalTitle>RANK_LEADERBOARD</TerminalTitle>
          <p className="mt-2 font-mono-label text-mono-label uppercase leading-[1.5] tracking-widest tabular-nums text-on-surface-variant">
            {mandate.title} · {mandate.company}
            {" // "}
            {String(ranked.length).padStart(2, "0")} scored against v03
            {" // sample data"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/app/projects/${id}/ranking/compare`}
            prefetch={false}
            className={`${QUIET_ACTION} h-9`}
          >
            Compare
          </Link>
          <Link
            href={`/app/projects/${id}/comparison`}
            prefetch={false}
            className={`${QUIET_ACTION} h-9`}
          >
            Full comparison
          </Link>
        </div>
      </header>

      {id === SAMPLE_MANDATE_ID && <SampleModuleRail current="ranking" />}

      <ol className="space-y-2">
        {ranked.map((r) => (
          <li
            key={r.candidate.id}
            className="border border-outline-variant bg-surface-container-low"
          >
            <Link
              href={`/app/projects/${id}/candidates/${r.candidate.id}`}
              prefetch={false}
              className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-outline-variant/40 px-4 py-3 transition-colors hover:bg-surface-container-high focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary"
            >
              <span className="w-[34px] shrink-0 font-mono-data text-[15px] tabular-nums text-outline">
                {String(r.rank).padStart(2, "0")}
              </span>
              <div className="min-w-0 flex-1 basis-[200px]">
                <p className="truncate text-body-main text-on-surface">
                  {r.candidate.name}
                </p>
                <p className="mt-0.5 truncate text-body-s text-on-surface-variant">
                  {r.candidate.currentTitle} · {r.candidate.currentCompany}
                </p>
              </div>
              <StatusChip tone={r.tier === 1 ? "primary" : "neutral"} intensity="soft">
                {TIER_LABEL[r.tier]}
              </StatusChip>
              <span className="w-[56px] shrink-0 text-right font-mono-data text-[15px] tabular-nums text-on-surface">
                {r.overall.toFixed(2)}
              </span>
            </Link>

            <div className="grid grid-cols-1 gap-4 px-4 py-3 sm:grid-cols-2 lg:grid-cols-5">
              {DIMENSIONS.map((d) => (
                <DimensionBar
                  key={d}
                  dimension={d}
                  score={r.scores[d]}
                  weight={weights[d]}
                  evidence={r.evidence[d]}
                />
              ))}
            </div>
          </li>
        ))}
      </ol>

      {unranked.length > 0 && (
        <section className="space-y-3">
          <MastHead
            tone="neutral"
            label="Not yet scored"
            meta={`${String(unranked.length).padStart(2, "0")} pending`}
          />
          {/*
            Shown rather than hidden. A candidate the product has not scored
            is the normal state early in a search, and a leaderboard that
            silently omits them tells a recruiter the pool is smaller than it
            is.
          */}
          <ul className="divide-y divide-outline-variant/40 border border-outline-variant bg-surface-container-low">
            {unranked.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1 basis-[200px] truncate text-body-main text-on-surface-variant">
                  {c.name}
                </span>
                <span className="font-mono-label text-[11px] uppercase tracking-[0.08em] text-outline">
                  {c.stage} · no score yet
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </PageShell>
  );
}

/* ── Compare ─────────────────────────────────────────────────────── */

function SynthesisLine({
  label,
  tone,
  body,
}: {
  label: string;
  tone: "primary" | "error" | "secondary";
  body: string;
}) {
  const colour =
    tone === "primary"
      ? "text-primary"
      : tone === "error"
        ? "text-error"
        : "text-secondary-fixed-dim";
  return (
    <div className="space-y-1">
      <span
        className={`font-mono-label text-mono-label uppercase tracking-widest ${colour}`}
      >
        {label}
      </span>
      <p className="text-body-main leading-relaxed text-on-surface">{body}</p>
    </div>
  );
}

export function SampleCompare({ id }: { id: string }) {
  const mandate = sampleMandate(id);
  if (!mandate) notFound();

  const ranked = sampleRanking(id);
  const byId = new Map(ranked.map((r) => [r.candidate.id, r]));
  const selected = SAMPLE_TRADE_OFF.candidateIds
    .map((cid) => byId.get(cid))
    .filter((r): r is SampleRankedCandidate => r !== undefined);
  const weights = currentWeights();

  return (
    <PageShell className="space-y-5">
      <SetBreadcrumbs
        crumbs={[
          { label: "Mandates", href: "/app/projects" },
          { label: mandate.title, href: `/app/projects/${id}` },
          { label: "Compare" },
        ]}
      />

      <SampleBanner scope="mandate" />

      <header className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start">
        <div className="min-w-0 flex-1">
          <TerminalTitle>STRATEGIC_BENCHMARKING</TerminalTitle>
          <p className="mt-2 font-mono-label text-mono-label uppercase leading-[1.5] tracking-widest tabular-nums text-on-surface-variant">
            {String(selected.length).padStart(2, "0")} candidates side by side
            {" // sample data"}
          </p>
        </div>
        <Link
          href={`/app/projects/${id}/ranking`}
          prefetch={false}
          className={`${QUIET_ACTION} h-9`}
        >
          {"←"} Ranking
        </Link>
      </header>

      <section className="space-y-3">
        <MastHead tone="primary" label="Side by side" meta="Weighted against v03" />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse">
            <caption className="sr-only">
              Dimension scores for the three selected candidates.
            </caption>
            <thead>
              <tr className="border-b border-outline-variant">
                <th
                  scope="col"
                  className="px-4 py-2.5 text-left font-mono-label text-mono-label uppercase tracking-widest text-outline"
                >
                  Dimension
                </th>
                {selected.map((r) => (
                  <th
                    key={r.candidate.id}
                    scope="col"
                    className="px-4 py-2.5 text-left font-mono-label text-mono-label uppercase tracking-widest text-on-surface"
                  >
                    {r.candidate.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DIMENSIONS.map((d) => {
                const best = Math.max(...selected.map((r) => r.scores[d]));
                return (
                  <tr
                    key={d}
                    className="border-b border-outline-variant/40 last:border-0"
                  >
                    <th
                      scope="row"
                      className="px-4 py-2.5 text-left font-mono-label text-mono-label uppercase tracking-wider text-on-surface-variant"
                    >
                      {d}
                      <span className="ml-2 tabular-nums text-outline">
                        {weights[d]}
                      </span>
                    </th>
                    {selected.map((r) => (
                      <td key={r.candidate.id} className="px-4 py-2.5">
                        <span
                          className={`font-mono-data text-[13px] tabular-nums ${
                            r.scores[d] === best ? "text-primary" : "text-on-surface"
                          }`}
                        >
                          {r.scores[d].toFixed(1)}
                        </span>
                        <span className="mt-0.5 block font-mono-label text-[11px] uppercase leading-[1.4] tracking-[0.08em] text-outline">
                          {r.evidence[d]}
                        </span>
                      </td>
                    ))}
                  </tr>
                );
              })}
              <tr className="border-t border-outline-variant">
                <th
                  scope="row"
                  className="px-4 py-2.5 text-left font-mono-label text-mono-label uppercase tracking-widest text-primary"
                >
                  Overall
                </th>
                {selected.map((r) => (
                  <td
                    key={r.candidate.id}
                    className="px-4 py-2.5 font-mono-data text-[15px] tabular-nums text-on-surface"
                  >
                    {r.overall.toFixed(2)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <MastHead
          tone="primary"
          label="AI trade-off analysis"
          meta="Decision support · generated against role weights"
        />
        <div className="space-y-4 border border-outline-variant bg-surface-container-low px-5 py-4">
          <SynthesisLine
            label="Synthesis"
            tone="primary"
            body={SAMPLE_TRADE_OFF.synthesis}
          />
          <SynthesisLine
            label="Risk vector"
            tone="error"
            body={SAMPLE_TRADE_OFF.riskVector}
          />
          <SynthesisLine
            label="Optimal pivot"
            tone="secondary"
            body={SAMPLE_TRADE_OFF.optimalPivot}
          />
        </div>

        <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {SAMPLE_TRADE_OFF.callouts.map((c) => {
            const name = sampleCandidate(c.candidateId)?.name ?? "—";
            const stronger = c.direction === "stronger";
            return (
              <li
                key={`${c.candidateId}-${c.dimension}`}
                className={`border-l-2 bg-surface-container-low px-3 py-2 ${
                  stronger ? "border-secondary-fixed-dim/60" : "border-error/60"
                }`}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-mono-label text-mono-label uppercase tracking-widest text-on-surface">
                    {name}
                  </span>
                  <span
                    className={`font-mono-label text-[11px] uppercase tracking-[0.08em] ${
                      stronger ? "text-secondary-fixed-dim" : "text-error"
                    }`}
                  >
                    {stronger ? "Stronger" : "Weaker"} · {c.dimension}
                  </span>
                </div>
                <p className="mt-1 text-body-main leading-relaxed text-on-surface-variant">
                  {c.body}
                </p>
              </li>
            );
          })}
        </ul>

        {/*
          Said on the screen, not only in the code. The analysis compares
          people against a model the recruiter set; it does not decide.
        */}
        <p className="font-mono-label text-[11px] uppercase leading-[1.6] tracking-[0.08em] text-outline">
          Benchmarking agent // stronger and weaker are relative to this set //
          no hire recommendation is produced
        </p>
      </section>
    </PageShell>
  );
}

/* ── Full comparison ─────────────────────────────────────────────── */

export function SampleComparison({ id }: { id: string }) {
  const mandate = sampleMandate(id);
  if (!mandate) notFound();

  const ranked = sampleRanking(id);
  const weights = currentWeights();
  const counts = SAMPLE_COMPARISON.bands.map((b) => ({
    ...b,
    count: ranked.filter((r) => r.tier === b.tier).length,
  }));

  const slate = (ids: readonly string[]) =>
    ids.map((cid) => ranked.find((r) => r.candidate.id === cid)).filter(Boolean);

  return (
    <PageShell className="space-y-5">
      <SetBreadcrumbs
        crumbs={[
          { label: "Mandates", href: "/app/projects" },
          { label: mandate.title, href: `/app/projects/${id}` },
          { label: "Comparison" },
        ]}
      />

      <SampleBanner scope="mandate" />

      <header className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start">
        <div className="min-w-0 flex-1">
          <TerminalTitle>FULL_COMPARISON</TerminalTitle>
          <p className="mt-2 font-mono-label text-mono-label uppercase leading-[1.5] tracking-widest tabular-nums text-on-surface-variant">
            {mandate.title} · {mandate.company}
            {" // "}
            {String(ranked.length).padStart(2, "0")} of {mandate.candidates} scored
            {" // sample data"}
          </p>
        </div>
        <Link
          href={`/app/projects/${id}/ranking`}
          prefetch={false}
          className={`${QUIET_ACTION} h-9`}
        >
          {"←"} Ranking
        </Link>
      </header>

      {id === SAMPLE_MANDATE_ID && <SampleModuleRail current="comparison" />}

      <div className="grid grid-cols-1 gap-px border border-outline-variant bg-outline-variant sm:grid-cols-2 lg:grid-cols-4">
        {counts.map((b) => (
          <KpiTile
            key={b.label}
            label={b.label}
            value={String(b.count)}
            accent={b.tier === 1 ? "primary" : "neutral"}
          />
        ))}
      </div>

      <section className="space-y-3">
        <MastHead tone="primary" label="Master scoring table" meta="Weighted v03" />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse">
            <caption className="sr-only">
              Every scored candidate against the five weighted dimensions.
            </caption>
            <thead>
              <tr className="border-b border-outline-variant">
                <th
                  scope="col"
                  className="px-3 py-2.5 text-left font-mono-label text-mono-label uppercase tracking-widest text-outline"
                >
                  Candidate
                </th>
                {DIMENSIONS.map((d) => (
                  <th
                    key={d}
                    scope="col"
                    className="px-3 py-2.5 text-right font-mono-label text-mono-label uppercase tracking-widest text-outline"
                  >
                    {d}
                    <span className="ml-1 tabular-nums">{weights[d]}</span>
                  </th>
                ))}
                <th
                  scope="col"
                  className="px-3 py-2.5 text-right font-mono-label text-mono-label uppercase tracking-widest text-primary"
                >
                  Overall
                </th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((r) => (
                <tr
                  key={r.candidate.id}
                  className="border-b border-outline-variant/40 last:border-0"
                >
                  <th
                    scope="row"
                    className="max-w-0 px-3 py-2.5 text-left font-normal"
                  >
                    <span className="block truncate text-body-main text-on-surface">
                      {r.candidate.name}
                    </span>
                    <span className="block truncate font-mono-label text-[11px] uppercase tracking-[0.08em] text-outline">
                      {TIER_LABEL[r.tier]}
                    </span>
                  </th>
                  {DIMENSIONS.map((d) => (
                    <td
                      key={d}
                      className="px-3 py-2.5 text-right font-mono-data text-[13px] tabular-nums text-on-surface-variant"
                    >
                      {r.scores[d].toFixed(1)}
                    </td>
                  ))}
                  <td className="px-3 py-2.5 text-right font-mono-data text-[13px] tabular-nums text-on-surface">
                    {r.overall.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <MastHead tone="tertiary" label="Recommended slate" meta="Primary and backup" />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {[
            { label: "Primary slate", ids: SAMPLE_COMPARISON.primarySlate },
            { label: "Backup slate", ids: SAMPLE_COMPARISON.backupSlate },
          ].map((group) => (
            <div
              key={group.label}
              className="border border-outline-variant bg-surface-container-low px-4 py-3"
            >
              <h2 className="font-mono-label text-mono-label uppercase tracking-widest text-primary">
                {group.label}
              </h2>
              <ul className="mt-2 divide-y divide-outline-variant/40 border border-outline-variant">
                {slate(group.ids).map((r) => (
                  <li
                    key={r!.candidate.id}
                    className="flex flex-wrap items-center gap-2 px-3 py-2"
                  >
                    <span className="min-w-0 flex-1 basis-[140px] truncate text-body-main text-on-surface">
                      {r!.candidate.name}
                    </span>
                    <StatusChip
                      tone={r!.tier === 1 ? "primary" : "neutral"}
                      intensity="soft"
                    >
                      {TIER_LABEL[r!.tier]}
                    </StatusChip>
                    <span className="font-mono-data text-[13px] tabular-nums text-on-surface">
                      {r!.overall.toFixed(2)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="border border-outline-variant border-l-2 border-l-primary-container bg-surface-container-low p-4">
          <h2 className="font-mono-label text-mono-label uppercase tracking-widest text-primary">
            Market reality
          </h2>
          <p className="mt-2 text-body-main leading-relaxed text-on-surface">
            {SAMPLE_COMPARISON.realityStatement}
          </p>
        </div>
        <div className="border border-outline-variant border-l-2 border-l-secondary-fixed-dim bg-surface-container-low p-4">
          <h2 className="font-mono-label text-mono-label uppercase tracking-widest text-secondary-fixed-dim">
            Final partner take
          </h2>
          <p className="mt-2 text-body-main leading-relaxed text-on-surface">
            {SAMPLE_COMPARISON.partnerTake}
          </p>
        </div>
      </section>

      {/*
        Worth stating, because "recommended slate" and "partner take" are the
        two phrases on this screen that sound like a verdict. Neither is
        model output: both are assembled from the tier counts and the top
        weighted dimension, and every recommendation is about the process.
      */}
      <p className="font-mono-label text-[11px] uppercase leading-[1.6] tracking-[0.08em] text-outline">
        Computed from the scores // no model wrote this // every
        recommendation is about the search, not about whether to hire anyone
      </p>
    </PageShell>
  );
}

/* ── Portfolio analytics ─────────────────────────────────────────── */

export function SampleAnalytics() {
  const p = samplePortfolio();
  const peak = Math.max(...p.velocity);

  return (
    <PageShell className="space-y-5">
      <SetBreadcrumbs crumbs={[{ label: "Analytics" }]} />

      <SampleBanner scope="portfolio" />

      <header className="space-y-2">
        <TerminalTitle>PORTFOLIO_ANALYTICS</TerminalTitle>
        <p className="font-mono-label text-mono-label uppercase tracking-widest tabular-nums text-on-surface-variant">
          {String(p.activeSearches).padStart(2, "0")} active searches //{" "}
          {p.totalCandidates} candidates // sample data
        </p>
      </header>

      <div
        aria-label="Portfolio key metrics"
        className="grid grid-cols-1 gap-px border border-outline-variant bg-outline-variant sm:grid-cols-2 lg:grid-cols-4"
      >
        <KpiTile label="Active searches" value={String(p.activeSearches)} accent="primary" />
        <KpiTile label="Total candidates" value={String(p.totalCandidates)} />
        <KpiTile label="Avg day of search" value={String(p.averageDay)} />
        <KpiTile
          label="Needing attention"
          value={String(p.atRisk.length)}
          accent={p.atRisk.length > 0 ? "warn" : "neutral"}
        />
      </div>

      <section className="space-y-3">
        <MastHead tone="neutral" label="Candidates by pipeline stage" meta="Across the portfolio" />
        <ul className="divide-y divide-outline-variant/40 border border-outline-variant bg-surface-container-low">
          {p.byStage.map((s) => (
            <li key={s.stage} className="flex items-center gap-3 px-4 py-2.5">
              <span className="w-[104px] shrink-0 font-mono-label text-mono-label uppercase tracking-wider text-on-surface-variant">
                {s.stage}
              </span>
              <span aria-hidden className="h-2 min-w-0 flex-1 bg-surface-container-high">
                <span
                  className="block h-full bg-primary"
                  style={{ width: `${(s.count / p.byStage[0].count) * 100}%` }}
                />
              </span>
              <span className="w-[32px] shrink-0 text-right font-mono-data text-[13px] tabular-nums text-on-surface">
                {String(s.count).padStart(2, "0")}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <section className="space-y-3">
          <MastHead tone="neutral" label="Searches by health" meta="Derived from the portfolio" />
          <ul className="divide-y divide-outline-variant/40 border border-outline-variant bg-surface-container-low">
            {p.byHealth.map((h) => (
              <li key={h.label} className="flex items-center gap-3 px-4 py-2.5">
                <StatusChip
                  tone={
                    h.label === "On track"
                      ? "primary"
                      : h.label === "Stalling"
                        ? "tertiary"
                        : "danger"
                  }
                  intensity="soft"
                >
                  {h.label}
                </StatusChip>
                <span className="ml-auto font-mono-data text-[13px] tabular-nums text-on-surface">
                  {String(h.count).padStart(2, "0")}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="space-y-3">
          <MastHead
            tone="neutral"
            label="Weekly velocity"
            meta="Last 8 weeks · candidates added"
          />
          <div className="flex items-end gap-1.5 border border-outline-variant bg-surface-container-low px-4 py-4">
            {p.velocity.map((v, i) => (
              <span
                key={i}
                className="flex min-w-0 flex-1 flex-col items-center gap-1"
              >
                <span
                  aria-hidden
                  className="w-full bg-primary"
                  style={{ height: `${(v / peak) * 72}px` }}
                />
                <span className="font-mono-data text-[11px] tabular-nums text-outline">
                  {v}
                </span>
              </span>
            ))}
          </div>
        </section>
      </div>

      <section className="space-y-3">
        <MastHead
          tone="tertiary"
          label="Searches needing attention"
          meta={`${String(p.atRisk.length).padStart(2, "0")} of ${p.activeSearches}`}
        />
        <ul className="divide-y divide-outline-variant/40 border border-outline-variant bg-surface-container-low">
          {p.atRisk.map((m) => (
            <li key={m.id}>
              <Link
                href={`/app/projects/${m.id}`}
                prefetch={false}
                className="flex flex-wrap items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-container-high focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary"
              >
                <span className="min-w-0 flex-1 basis-[200px] truncate text-body-main text-on-surface">
                  {m.title} · {m.company}
                </span>
                <StatusChip
                  tone={m.health === "blocked" ? "danger" : "tertiary"}
                  intensity="soft"
                >
                  {m.health === "blocked" ? "Blocked" : "Stalling"}
                </StatusChip>
                <span className="font-mono-data text-xs tabular-nums text-outline">
                  Day {m.dayOfSearch} of {m.searchLengthDays}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </PageShell>
  );
}
