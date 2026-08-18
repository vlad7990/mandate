import Link from "next/link";
import { SetBreadcrumbs } from "@/components/dashboard/breadcrumbs";
import { SampleBanner } from "@/components/sample/sample-banner";
import { SAMPLE_SEARCH_ID, sampleWorkedSearch } from "@/lib/sample";

/**
 * Shared furniture for the sample Executive Intelligence screens.
 *
 * Five screens in this module share a header, a panel and a provenance
 * block. They are here rather than repeated because W3 learned the cost of
 * the alternative: the mandate page had typed its own copy of figures
 * `/spec` and `/calibration-history` also stated, and the three disagreed
 * on every number they shared.
 *
 * The EI register is deliberately different from the rest of the app —
 * wider measure, more generous leading — and that difference lives here so
 * it cannot drift screen to screen. Same tokens, different density.
 */

export const EI_BASE = `/app/executive-intelligence/searches/${SAMPLE_SEARCH_ID}`;

/** Which day of the search something `daysAgo` fell on. */
export function eiDayOf(daysAgo: number): number {
  return Math.max(1, sampleWorkedSearch().openedDaysAgo - daysAgo);
}

export function EiPanel({
  title,
  meta,
  children,
  dashed,
}: {
  title: string;
  meta?: React.ReactNode;
  children: React.ReactNode;
  dashed?: boolean;
}) {
  return (
    <section
      className={`overflow-hidden bg-surface-container-low ${
        dashed
          ? "border border-dashed border-outline-variant"
          : "border border-outline-variant"
      }`}
    >
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 border-b border-outline-variant px-5 py-4">
        <h2 className="font-mono-label text-mono-label uppercase tracking-widest text-primary">
          {title}
        </h2>
        {meta}
      </div>
      {children}
    </section>
  );
}

/**
 * Page header for a sample EI screen.
 *
 * Carries both D3 markers and nothing else: `SampleBanner` first in the
 * content region, and `// sample data` in the subtitle. No per-row chip —
 * see the header of `src/lib/sample/index.ts`.
 */
export function EiHeader({
  title,
  crumbs,
  meta,
  status,
}: {
  title: string;
  crumbs: { label: string; href?: string }[];
  /** Mono context clauses, `//` inserted between them. */
  meta: string[];
  status?: React.ReactNode;
}) {
  return (
    <>
      <SetBreadcrumbs crumbs={crumbs} />
      <SampleBanner scope="executive search" />

      <header className="mt-5 min-w-0">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="font-heading text-[28px] font-semibold leading-tight tracking-tight text-on-surface sm:text-[30px]">
            {title}
          </h1>
          {status}
        </div>
        <p className="mt-2 font-mono-label text-[11px] uppercase leading-[1.6] tracking-widest text-outline">
          {[...meta, "sample data"].join(" // ")}
        </p>
      </header>
    </>
  );
}

/** A provenance strip — who approved what, when, and from which prompt. */
export function EiProvenance({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap gap-x-6 gap-y-2 border-t border-outline-variant/60 px-5 py-4 font-mono-label text-[11px] uppercase leading-relaxed tabular-nums text-outline">
      {items.map((p) => (
        <span key={p}>{p}</span>
      ))}
    </div>
  );
}

/**
 * The closing line every sample EI screen carries.
 *
 * Read-only is the standing call (`5107767`): these are not the reader's
 * rows, and a control that cannot work is worse than the empty state it
 * replaced. Saying so once per screen is cheaper than a disabled button
 * per artifact.
 */
export function EiReadOnlyNote({ what }: { what: string }) {
  return (
    <p className="text-[11px] leading-relaxed text-outline">
      This is a sample {what}, so nothing here can be edited, approved or
      exported.{" "}
      <Link
        href="/app/executive-intelligence"
        className="text-primary hover:underline"
      >
        Open a real executive search
      </Link>
      .
    </p>
  );
}

/**
 * What a candidate-scoped screen shows for the three people whose chain
 * has not reached it.
 *
 * Deliberately not `SampleNotBuilt`. That component says *the sample* does
 * not fill this screen in; here the sample does fill it in, and the honest
 * answer is that this artifact does not exist for this person yet — which
 * is what a real workspace would say, and is the more useful thing to
 * demonstrate. It states the gate rather than leaving the reader to guess.
 */
export function EiChainGate({
  title,
  crumbs,
  candidateName,
  artifact,
  reason,
  unlocks,
}: {
  title: string;
  crumbs: { label: string; href?: string }[];
  candidateName: string;
  artifact: string;
  reason: string;
  unlocks: string;
}) {
  return (
    <div className="mx-auto max-w-[1100px] px-6 py-6">
      <EiHeader
        title={title}
        crumbs={crumbs}
        meta={[candidateName, `no ${artifact} yet`]}
      />

      <div className="mt-5 border border-dashed border-outline-variant bg-surface-container-low px-6 py-10 text-center">
        <p className="mx-auto max-w-[56ch] text-[15px] leading-relaxed text-on-surface-variant">
          {reason}
        </p>
        <p className="mx-auto mt-3 max-w-[56ch] text-[13px] leading-relaxed text-outline">
          {unlocks}
        </p>
        <div className="mt-5">
          <Link
            href={`${EI_BASE}/candidates`}
            prefetch={false}
            className="font-mono-label text-[11px] uppercase tracking-widest text-primary hover:underline"
          >
            {"←"} Back to the diligence funnel
          </Link>
        </div>
      </div>

      <div className="mt-5">
        <EiReadOnlyNote what="search" />
      </div>
    </div>
  );
}
