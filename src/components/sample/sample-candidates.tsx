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
  SAMPLE_MANDATE_ID,
  SAMPLE_NETWORK,
  sampleCandidatesForMandate,
  sampleMandate,
  type SampleCandidate,
} from "@/lib/sample";

/**
 * The two candidate screens the sample workspace was missing — W4.
 *
 * Both are read-only. The real mandate list carries Upload CV, Add manually
 * and an outreach control; the real network table carries "Add to search",
 * which copies a person into a mandate. None of them is drawn here, for the
 * reason the skills studio settled in `5107767`: these are not the reader's
 * rows, and a control that cannot work is worse than the empty state it
 * replaced.
 */

/**
 * The pipeline, in the order a candidate moves through it. Grouping by stage
 * is the whole point of the mandate list — a flat table of seven people
 * teaches nothing about the pipeline the product is actually running.
 */
const STAGE_ORDER = [
  "Submitted",
  "Shortlisted",
  "Reviewed",
  "Found",
  "Parsing",
] as const;

function byStage(
  candidates: readonly SampleCandidate[]
): ReadonlyArray<{ stage: string; rows: readonly SampleCandidate[] }> {
  return STAGE_ORDER.map((stage) => ({
    stage,
    rows: candidates.filter((c) => c.stage === stage),
  })).filter((g) => g.rows.length > 0);
}

function CandidateRow({
  candidate,
  mandateId,
}: {
  candidate: SampleCandidate;
  mandateId: string;
}) {
  return (
    <Link
      href={`/app/projects/${mandateId}/candidates/${candidate.id}`}
      prefetch={false}
      className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3 transition-colors hover:bg-surface-container-high focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary"
    >
      <div className="min-w-0 flex-1 basis-[220px]">
        <p className="truncate text-body-main text-on-surface">{candidate.name}</p>
        <p className="mt-0.5 truncate text-body-s text-on-surface-variant">
          {candidate.parsing
            ? candidate.fileName
            : `${candidate.currentTitle} · ${candidate.currentCompany}`}
        </p>
      </div>

      {candidate.archetype && (
        <StatusChip tone="neutral" intensity="soft">
          {candidate.archetype}
        </StatusChip>
      )}

      {/*
        A tier and a score, or an em dash. Nothing here invents a number for
        a candidate the product has not scored — the partial states are the
        normal ones and hiding them teaches the wrong expectation.
      */}
      {candidate.tier === null ? (
        <span className="w-[72px] shrink-0 text-right font-mono-data text-[13px] text-outline">
          —
        </span>
      ) : (
        <span className="flex w-[72px] shrink-0 items-center justify-end gap-2">
          <StatusChip tone="neutral" intensity="soft">
            T{candidate.tier}
          </StatusChip>
          <span className="font-mono-data text-[13px] tabular-nums text-on-surface">
            {candidate.fit}
          </span>
        </span>
      )}

      <span className="w-[64px] shrink-0 text-right font-mono-label text-[11px] uppercase tracking-[0.08em] tabular-nums text-outline">
        {candidate.updated}
      </span>
    </Link>
  );
}

export function SampleMandateCandidates({ id }: { id: string }) {
  const mandate = sampleMandate(id);
  if (!mandate) notFound();

  const candidates = sampleCandidatesForMandate(id);
  const groups = byStage(candidates);

  return (
    <PageShell className="space-y-5">
      <SetBreadcrumbs
        crumbs={[
          { label: "Mandates", href: "/app/projects" },
          { label: mandate.title, href: `/app/projects/${id}` },
          { label: "Candidates" },
        ]}
      />

      <SampleBanner scope="mandate" />

      <header className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start">
        <div className="min-w-0 flex-1">
          <TerminalTitle>CANDIDATE_INTEL</TerminalTitle>
          <p className="mt-2 font-mono-label text-mono-label uppercase leading-[1.5] tracking-widest tabular-nums text-on-surface-variant">
            {mandate.title} · {mandate.company}
            {" // "}
            {String(candidates.length).padStart(2, "0")} shown of{" "}
            {mandate.candidates} in the pool
            {" // sample data"}
          </p>
        </div>
        <Link href={`/app/projects/${id}`} prefetch={false} className={`${QUIET_ACTION} h-9`}>
          {"←"} Mandate
        </Link>
      </header>

      {id === SAMPLE_MANDATE_ID && <SampleModuleRail />}

      {/*
        Said plainly rather than left for a reader to notice. The mandate
        claims eighteen candidates and seven are rendered — the same honesty
        the real Network page shows about its own 2,000-row window. A sample
        that quietly showed seven and called it the pool would be teaching a
        smaller product than this is.
      */}
      <p className="border border-outline-variant bg-surface-container-low px-4 py-3 text-body-main leading-relaxed text-on-surface-variant">
        The sample carries {candidates.length} of this mandate&rsquo;s{" "}
        {mandate.candidates} candidates — enough to show every pipeline stage
        the product tracks without inventing eighteen people.
      </p>

      {/*
        All three tiles read from the mandate row, so they describe the same
        thing. An earlier version mixed them — "In the pool 18" beside
        "Tier 1: 2", where the 2 counted only the rows on screen and the
        mandate's own figure is 4. Two scopes in adjacent tiles is a number
        nobody can trust.
      */}
      <div className="grid grid-cols-1 gap-px border border-outline-variant bg-outline-variant sm:grid-cols-3">
        <KpiTile label="In the pool" value={String(mandate.candidates)} accent="primary" />
        <KpiTile label="Tier 1 in the pool" value={String(mandate.tierOne ?? 0)} />
        <KpiTile label="Shown here" value={String(candidates.length)} />
      </div>

      {groups.map((g) => (
        <section key={g.stage} className="space-y-3">
          <MastHead
            tone={g.stage === "Submitted" ? "primary" : "neutral"}
            label={g.stage}
            meta={`${String(g.rows.length).padStart(2, "0")} ${
              g.rows.length === 1 ? "candidate" : "candidates"
            }`}
          />
          <ul className="divide-y divide-outline-variant/40 border border-outline-variant bg-surface-container-low">
            {g.rows.map((c) => (
              <li key={c.id}>
                <CandidateRow candidate={c} mandateId={id} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </PageShell>
  );
}

/* ── Network ─────────────────────────────────────────────────────── */

export function SampleNetwork() {
  const people = SAMPLE_NETWORK;
  const returning = people.filter((p) => p.appearances.length >= 2).length;
  const appearances = people.reduce((n, p) => n + p.appearances.length, 0);

  return (
    <PageShell className="space-y-5">
      <SetBreadcrumbs
        crumbs={[
          { label: "Candidates", href: "/app/candidates" },
          { label: "Network" },
        ]}
      />

      <SampleBanner scope="network" />

      <header className="space-y-2">
        <TerminalTitle>GLOBAL_EXECUTIVE_NETWORK</TerminalTitle>
        <p className="font-mono-label text-mono-label uppercase tracking-widest tabular-nums text-on-surface-variant">
          <span className="text-primary">
            {String(people.length).padStart(3, "0")}
          </span>{" "}
          executives // {returning} returning // sample data
        </p>
      </header>

      {/*
        What this screen is for, said once. It is the least self-explanatory
        page in the product: a table of three people looks like a short
        candidate list until you know the rows are *folded* — one person
        assembled from several candidate records across several mandates.
      */}
      <p className="border border-outline-variant bg-surface-container-low px-4 py-3 text-body-main leading-relaxed text-on-surface-variant">
        One row per person, not per application. The same executive turns up
        in several searches over the years under different emails and job
        titles, and this folds those records together so the second
        conversation starts where the first one ended.
      </p>

      <div className="grid grid-cols-1 gap-px border border-outline-variant bg-outline-variant sm:grid-cols-3">
        <KpiTile label="In network" value={String(people.length)} accent="primary" />
        <KpiTile label="Returning" value={String(returning)} />
        <KpiTile label="Appearances" value={String(appearances)} />
      </div>

      <section className="space-y-3">
        <MastHead
          tone="primary"
          label="Talent pool"
          meta="Folded across mandates"
        />
        <ul className="space-y-2">
          {people.map((p) => (
            <li
              key={p.id}
              className="border border-outline-variant bg-surface-container-low px-4 py-3"
            >
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-body-main text-on-surface">{p.name}</span>
                <span className="min-w-0 flex-1 basis-[200px] truncate text-body-s text-on-surface-variant">
                  {p.headline}
                </span>
                {/*
                  How the merge happened, on every row. A wrong fold puts two
                  people into one record, and the only way that is findable
                  is if the product says what it matched on — the rule the
                  real page already states.
                */}
                <span className="font-mono-label text-[11px] uppercase tracking-[0.08em] text-outline">
                  {p.mergedBy}
                </span>
              </div>

              <ul className="mt-2 divide-y divide-outline-variant/40 border border-outline-variant">
                {p.appearances.map((a) => (
                  <li
                    key={`${p.id}-${a.mandate}`}
                    className="flex flex-wrap items-center gap-3 px-3 py-2"
                  >
                    <span className="min-w-0 flex-1 basis-[180px] truncate font-mono-label text-mono-label uppercase tracking-wider text-on-surface-variant">
                      {a.mandate}
                    </span>
                    <StatusChip tone="neutral" intensity="soft">
                      {a.outcome}
                    </StatusChip>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </section>
    </PageShell>
  );
}
