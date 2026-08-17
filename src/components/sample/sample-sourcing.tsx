import Link from "next/link";
import { notFound } from "next/navigation";
import { SetBreadcrumbs } from "@/components/dashboard/breadcrumbs";
import { SampleBanner } from "@/components/sample/sample-banner";
import { SampleModuleRail } from "@/components/sample/sample-mandate-shell";
import { PageShell, QUIET_ACTION, TerminalTitle } from "@/components/ui/page-shell";
import { MastHead } from "@/components/ui/mast-head";
import { StatusChip } from "@/components/ui/status-chip";
import {
  SAMPLE_MANDATE_ID,
  SAMPLE_RUNS,
  SAMPLE_SEARCH,
  SAMPLE_TARGET_COMPANIES,
  sampleCandidate,
  sampleMandate,
  sampleSlotsInOrder,
} from "@/lib/sample";

/**
 * Sourcing and AI candidate search — W5. Read-only, like the rest.
 *
 * The real sourcing screen is four tabs. Three are filled here; the archetype
 * tab is static reference content that already renders correctly for any
 * mandate and needed nothing — see the header of `src/lib/sample/sourcing.ts`.
 */

function days(n: number): string {
  if (n === 0) return "today";
  if (n === 1) return "yesterday";
  if (n < 30) return `${n}d ago`;
  const m = Math.round(n / 30);
  return m === 1 ? "1 month ago" : `${m} months ago`;
}

export function SampleSourcing({ id }: { id: string }) {
  const mandate = sampleMandate(id);
  if (!mandate) notFound();

  const slots = sampleSlotsInOrder();
  const totalFound = SAMPLE_RUNS.reduce((n, r) => n + r.found, 0);
  const totalImported = SAMPLE_RUNS.reduce((n, r) => n + r.imported, 0);

  return (
    <PageShell className="space-y-5">
      <SetBreadcrumbs
        crumbs={[
          { label: "Mandates", href: "/app/projects" },
          { label: mandate.title, href: `/app/projects/${id}` },
          { label: "Sourcing" },
        ]}
      />

      <SampleBanner scope="mandate" />

      <header className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start">
        <div className="min-w-0 flex-1">
          <TerminalTitle>SOURCING_INTEL</TerminalTitle>
          <p className="mt-2 font-mono-label text-mono-label uppercase leading-[1.5] tracking-widest tabular-nums text-on-surface-variant">
            {mandate.title} · {mandate.company}
            {" // "}
            {slots.length} queries // anchored on FINAL_V01
            {" // sample data"}
          </p>
        </div>
        <Link href={`/app/projects/${id}`} prefetch={false} className={`${QUIET_ACTION} h-9`}>
          {"←"} Mandate
        </Link>
      </header>

      {id === SAMPLE_MANDATE_ID && <SampleModuleRail current="sourcing" />}

      <section className="space-y-3">
        <MastHead
          tone="primary"
          label="Boolean queries"
          meta={`${slots.length} slots // six ways into the same pool`}
        />
        <ul className="space-y-2">
          {slots.map(({ def, sample }) => (
            <li
              key={def.key}
              className="border border-outline-variant bg-surface-container-low"
            >
              <div className="flex flex-wrap items-center gap-2 border-b border-outline-variant/40 px-4 py-2.5">
                <StatusChip tone="primary" intensity="soft">
                  {def.short}
                </StatusChip>
                <span className="font-mono-label text-mono-label uppercase tracking-widest text-on-surface">
                  {def.label}
                </span>
                <span className="ml-auto font-mono-label text-[11px] uppercase tracking-[0.08em] tabular-nums text-outline">
                  v{String(sample.version).padStart(2, "0")} · {days(sample.daysAgo)}
                </span>
              </div>

              <div className="space-y-2.5 px-4 py-3">
                <p className="text-body-s leading-relaxed text-on-surface-variant">
                  {def.blurb}
                </p>
                {/*
                  Real syntax, not prose standing in for a query. The claim
                  of this feature is that it saves a researcher an hour, and
                  a toy string would demonstrate the opposite.
                */}
                <pre className="overflow-x-auto border border-outline-variant bg-surface-container-lowest px-3 py-2.5 font-mono-data text-xs leading-relaxed text-on-surface">
                  {sample.content}
                </pre>
                {sample.history.length > 0 && (
                  <ul className="space-y-1">
                    {sample.history.map((h) => (
                      <li
                        key={h.version}
                        className="flex flex-wrap items-baseline gap-2 font-mono-label text-[11px] uppercase tracking-[0.08em] text-outline"
                      >
                        <span>v{String(h.version).padStart(2, "0")}</span>
                        <span className="min-w-0 flex-1 basis-[220px] normal-case tracking-normal">
                          {h.note}
                        </span>
                        <span className="tabular-nums">{days(h.daysAgo)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </li>
          ))}
        </ul>
        <p className="font-mono-label text-[11px] uppercase leading-[1.6] tracking-[0.08em] text-outline">
          Every version is kept // a query that stops working is comparable
          against the one that did
        </p>
      </section>

      <section className="space-y-3">
        <MastHead
          tone="tertiary"
          label="Target companies"
          meta={`${SAMPLE_TARGET_COMPANIES.companies.length} named // generated ${days(SAMPLE_TARGET_COMPANIES.generatedDaysAgo)}`}
        />
        <p className="border border-outline-variant bg-surface-container-low px-4 py-3 text-body-main leading-relaxed text-on-surface">
          {SAMPLE_TARGET_COMPANIES.thesis}
        </p>
        <ul className="divide-y divide-outline-variant/40 border border-outline-variant bg-surface-container-low">
          {SAMPLE_TARGET_COMPANIES.companies.map((c) => (
            <li key={c.name} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
              <span className="min-w-0 basis-[180px] truncate text-body-main text-on-surface">
                {c.name}
              </span>
              <StatusChip
                tone={
                  c.category === "Direct"
                    ? "primary"
                    : c.category === "Excluded"
                      ? "neutral"
                      : "tertiary"
                }
                intensity="soft"
              >
                {c.category}
              </StatusChip>
              <span className="min-w-0 flex-1 basis-[240px] text-body-s text-on-surface-variant">
                {c.rationale}
              </span>
              <span className="font-mono-label text-[11px] uppercase tracking-[0.08em] text-outline">
                Pool {c.pool}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <MastHead
          tone="neutral"
          label="Runs"
          meta={`${SAMPLE_RUNS.length} executed // ${totalFound} found // ${totalImported} imported`}
        />
        <ul className="divide-y divide-outline-variant/40 border border-outline-variant bg-surface-container-low">
          {SAMPLE_RUNS.map((r) => (
            <li key={r.id} className="px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <StatusChip tone="neutral" intensity="soft">
                  {r.platform}
                </StatusChip>
                <span className="font-mono-label text-mono-label uppercase tracking-wider text-on-surface-variant">
                  {r.slot.replace(/_/g, " ")}
                </span>
                <span className="ml-auto font-mono-data text-[13px] tabular-nums text-on-surface">
                  {r.imported} / {r.found}
                </span>
                <span className="font-mono-label text-[11px] uppercase tracking-[0.08em] tabular-nums text-outline">
                  {days(r.daysAgo)}
                </span>
              </div>
              <p className="mt-1.5 text-body-s leading-relaxed text-on-surface-variant">
                {r.note}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </PageShell>
  );
}

/* ── AI candidate search ─────────────────────────────────────────── */

/**
 * A worked search, shown above the live form.
 *
 * Deliberately *not* wired to whatever the reader types: it is labelled as a
 * completed example, and a real query against an empty pool still falls
 * through to the product's own "no matches" state. Answering an arbitrary
 * question with a canned result would be the one kind of dishonesty a sample
 * cannot afford on the screen whose whole claim is that the agent reasons.
 */
export function SampleSearchExample() {
  const s = SAMPLE_SEARCH;

  return (
    <div className="space-y-4">
      <SampleBanner scope="search" />

      <section className="space-y-3">
        <MastHead
          tone="primary"
          label="A worked search"
          meta={`${s.matches.length} matches // ${s.belowFloor} below the noise floor`}
        />

        <div className="border border-outline-variant bg-surface-container-low px-4 py-3">
          <p className="font-mono-label text-[11px] uppercase tracking-[0.08em] text-outline">
            Query
          </p>
          <p className="mt-1 font-mono-data text-body-main text-on-surface">
            &ldquo;{s.query}&rdquo;
          </p>
        </div>

        <div className="border border-outline-variant bg-surface-container-low px-4 py-3">
          <p className="font-mono-label text-[11px] uppercase tracking-[0.08em] text-outline">
            What the agent understood
          </p>
          <p className="mt-1 text-body-main leading-relaxed text-on-surface">
            {s.intent}
          </p>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {[
              { label: "Must-haves", items: s.mustHaves, tone: "text-primary" },
              { label: "Nice-to-haves", items: s.niceToHaves, tone: "text-outline" },
            ].map((g) => (
              <div key={g.label}>
                <p
                  className={`font-mono-label text-mono-label uppercase tracking-widest ${g.tone}`}
                >
                  {g.label}
                </p>
                <ul className="mt-1 space-y-1">
                  {g.items.map((t) => (
                    <li key={t} className="text-body-s leading-relaxed text-on-surface-variant">
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <ul className="space-y-2">
          {s.matches.map((m) => {
            const c = sampleCandidate(m.candidateId);
            return (
              <li
                key={m.candidateId}
                className="border border-outline-variant bg-surface-container-low px-4 py-3"
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="min-w-0 flex-1 basis-[200px] truncate text-body-main text-on-surface">
                    {c?.name ?? m.candidateId}
                  </span>
                  <span className="truncate text-body-s text-on-surface-variant">
                    {c?.currentTitle} · {c?.currentCompany}
                  </span>
                  <span className="font-mono-data text-[15px] tabular-nums text-primary">
                    {m.score}
                  </span>
                </div>
                {/* The reasoning is the feature. A bare score would be a list. */}
                <p className="mt-2 text-body-main leading-relaxed text-on-surface-variant">
                  {m.reasoning}
                </p>
              </li>
            );
          })}
        </ul>

        <p className="font-mono-label text-[11px] uppercase leading-[1.6] tracking-[0.08em] text-outline">
          An example of a completed search // your own query runs against your
          own candidates // {s.belowFloor} more scored below the floor and were
          not returned
        </p>
      </section>
    </div>
  );
}
