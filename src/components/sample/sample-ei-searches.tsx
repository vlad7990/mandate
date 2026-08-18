import Link from "next/link";
import { SetBreadcrumbs } from "@/components/dashboard/breadcrumbs";
import { SampleBanner } from "@/components/sample/sample-banner";
import { IconArrowLeft } from "@/components/icons";
import {
  SAMPLE_SEARCHES,
  SAMPLE_SEARCH_ID,
  sampleWorkedSearch,
} from "@/lib/sample";
import {
  SEARCH_STATUS_LABELS,
  SERVICE_TIER_LABELS,
} from "@/lib/executive/types";

/**
 * The executive searches list, in sample mode.
 *
 * Three searches rather than one, and the reason is not padding: a list
 * with a single row demonstrates a detail page, not a list. The three sit
 * at deliberately different points in the chain — one fully worked, one
 * with a profile in draft, one that has only been opened — because the
 * shape this screen has to teach is that a search is a *process* with
 * states, which one row cannot show.
 *
 * The middle one is load-bearing beyond this screen. The home page carries
 * a priority card reading "Success profile draft ready for approval", and
 * before W7 it named Northvale — whose profile the executive workspace
 * showed as approved at v3, two screens flatly contradicting each other
 * about the same artifact. It names Thornbury now, and
 * `executive.test.ts` pins that exactly one sample search is ever in that
 * state so the card cannot become ambiguous or false.
 *
 * Only the worked search links through. The other two are real rows in the
 * fixture but have no screens behind them, and a link that lands on an
 * emptier version of this page is worse than no link.
 */
export function SampleEiSearches() {
  return (
    <div className="min-h-full p-6">
      <div className="mx-auto max-w-5xl space-y-6 pt-4">
        <SetBreadcrumbs
          crumbs={[
            { label: "Executive Intelligence", href: "/app/executive-intelligence" },
            { label: "Searches" },
          ]}
        />

        <div className="flex items-center gap-3 font-mono-label text-mono-label uppercase tracking-widest text-outline">
          <Link
            href="/app/executive-intelligence"
            className="flex items-center gap-1.5 transition-colors hover:text-on-surface"
          >
            <IconArrowLeft size={14} />
            Executive Intelligence
          </Link>
          <span className="text-outline-variant">/</span>
          <span className="text-on-surface-variant">Searches</span>
        </div>

        <SampleBanner scope="executive searches" />

        <header className="space-y-1">
          <h1 className="font-h2 text-h2 text-on-surface">Executive Searches</h1>
          <p className="font-mono-label text-mono-label uppercase tracking-widest text-outline">
            {SAMPLE_SEARCHES.length} engagements {"// sample data"}
          </p>
          <p className="text-body-main text-on-surface-variant">
            Structured due-diligence engagements — one per executive role.
          </p>
        </header>

        <div className="divide-y divide-outline-variant/40 border border-outline-variant bg-surface-container-low">
          {SAMPLE_SEARCHES.map((s) => {
            const worked = s.id === SAMPLE_SEARCH_ID;
            const row = (
              <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div className="min-w-0 space-y-0.5">
                  <p className="font-body-main text-headline-md text-on-surface">
                    {s.roleTitle}{" "}
                    <span className="text-on-surface-variant">
                      @ {s.companyName}
                    </span>
                  </p>
                  <p className="font-mono-label text-mono-label uppercase tracking-wider tabular-nums text-outline">
                    Day {s.openedDaysAgo} · {SERVICE_TIER_LABELS[s.serviceTier]}{" "}
                    tier · research {s.contextStatus}
                  </p>
                  <p className="text-body-main text-on-surface-variant">
                    {s.summary}
                  </p>
                </div>
                <span className="shrink-0 border border-outline-variant px-2.5 py-1 font-mono-label text-mono-label uppercase tracking-widest text-on-surface-variant">
                  {SEARCH_STATUS_LABELS[s.status]}
                </span>
              </div>
            );

            return worked ? (
              <Link
                key={s.id}
                href={`/app/executive-intelligence/searches/${s.id}`}
                prefetch={false}
                className="block transition-colors hover:bg-surface-container"
              >
                {row}
              </Link>
            ) : (
              <div key={s.id}>{row}</div>
            );
          })}
        </div>

        <p className="text-[11px] leading-relaxed text-outline">
          {sampleWorkedSearch().roleTitle} at{" "}
          {sampleWorkedSearch().companyName} is the worked example — it has the
          full chain behind it. The other two are listed at earlier states and
          have no screens behind them.
        </p>
      </div>
    </div>
  );
}
