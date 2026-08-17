import Link from "next/link";
import { SetBreadcrumbs } from "@/components/dashboard/breadcrumbs";
import { SampleBanner } from "@/components/sample/sample-banner";
import { PageShell, QUIET_ACTION } from "@/components/ui/page-shell";
import {
  SAMPLE_MANDATE_ID,
  SAMPLE_MODULES,
  SAMPLE_MODULES_PENDING,
  sampleMandate,
  sampleModuleMandate,
  type SampleModuleSlug,
} from "@/lib/sample";

/**
 * The shell every sample module screen sits in, and the rail that connects
 * them.
 *
 * ## Why this exists at all
 *
 * Before W3 the sample mandate was one screen deep. Every sub-route —
 * `/spec`, `/metrics`, `/reports`, `/feedback`, `/hiring-manager`,
 * `/onboarding`, `/calibration-history`, and the four that belong to later
 * workstreams — hit a query with `id = "sample-larkspur"`, which is not a
 * uuid, and fell through to `redirect("/")`. Eleven routes silently landing
 * a prospect back on the dashboard with no explanation.
 *
 * That is why `SampleModuleNotBuilt` exists rather than the rail simply
 * omitting the four. A rail that leaves them out still leaves a typed URL,
 * a browser back button and an old bookmark doing the same thing.
 *
 * ## The rail is read-only, like everything else in the sample
 *
 * Same call as the skills studio in `5107767` and the sample client in W2:
 * these are not the reader's rows, and a control that cannot work is worse
 * than the empty state it replaced. The rail navigates; nothing on any
 * module screen writes.
 */

export function SampleModuleRail({ current }: { current?: SampleModuleSlug }) {
  return (
    <nav aria-label="Sample mandate modules">
      <ul className="grid grid-cols-1 gap-px border border-outline-variant bg-outline-variant sm:grid-cols-2 lg:grid-cols-4">
        {SAMPLE_MODULES.map((m) => {
          const isCurrent = m.slug === current;
          return (
            <li key={m.slug}>
              <Link
                href={`/app/projects/${SAMPLE_MANDATE_ID}/${m.slug}`}
                prefetch={false}
                aria-current={isCurrent ? "page" : undefined}
                className={`flex h-full flex-col gap-1 px-3 py-2.5 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary ${
                  isCurrent
                    ? "bg-primary/[0.10] text-primary"
                    : "bg-surface-container-low text-on-surface hover:bg-surface-container-high"
                }`}
              >
                <span className="font-mono-label text-mono-label uppercase tracking-widest">
                  {m.label}
                </span>
                <span className="font-mono-label text-[11px] uppercase tracking-[0.08em] tabular-nums text-outline">
                  {m.meta}
                </span>
              </Link>
            </li>
          );
        })}

        {/*
          The four pending modules occupy the eighth cell rather than sitting
          under the grid. Seven items in a four-column grid otherwise leave a
          bordered blank that reads as a missing entry, and this is the place
          a reader scanning the rail will actually look for "what else is
          there". Named rather than hidden: before W3 they redirected to the
          dashboard, so the workspace looked smaller than it is.
        */}
        <li className="bg-surface-container-low px-3 py-2.5">
          <p className="font-mono-label text-mono-label uppercase tracking-widest text-outline">
            Not in the sample
          </p>
          <p className="mt-1 font-mono-label text-[11px] uppercase leading-[1.4] tracking-[0.08em] text-outline">
            {SAMPLE_MODULES_PENDING.map((m) => m.label).join(" · ")}
          </p>
        </li>
      </ul>
    </nav>
  );
}

export function SampleModuleShell({
  module: slug,
  title,
  meta,
  children,
}: {
  module: SampleModuleSlug;
  /** The module's own screaming-snake title, matching the real route. */
  title: string;
  /** The context line under it. Mono, uppercase, `//` between clauses. */
  meta: string;
  children: React.ReactNode;
}) {
  const mandate = sampleModuleMandate();
  const label =
    [...SAMPLE_MODULES, ...SAMPLE_MODULES_PENDING].find((m) => m.slug === slug)
      ?.label ?? slug;

  return (
    <PageShell className="space-y-5">
      <SetBreadcrumbs
        crumbs={[
          { label: "Mandates", href: "/app/projects" },
          { label: mandate.title, href: `/app/projects/${SAMPLE_MANDATE_ID}` },
          { label },
        ]}
      />

      <SampleBanner scope="mandate" />

      <header className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start">
        <div className="min-w-0 flex-1">
          <h1 className="font-h1 text-[26px] uppercase leading-tight tracking-tight text-on-surface sm:text-h1">
            {title}
          </h1>
          <p className="mt-2 font-mono-label text-mono-label uppercase leading-[1.5] tracking-widest tabular-nums text-on-surface-variant">
            {mandate.title} · {mandate.company}
            {" // "}
            {meta}
            {" // sample data"}
          </p>
        </div>
        <Link
          href={`/app/projects/${SAMPLE_MANDATE_ID}`}
          prefetch={false}
          className={`${QUIET_ACTION} h-9`}
        >
          {"←"} Mandate
        </Link>
      </header>

      <SampleModuleRail current={slug} />

      {children}
    </PageShell>
  );
}

/**
 * A module the product has and the sample does not.
 *
 * Says which screen it is, what it would show, and where to go instead. The
 * thing it replaces said nothing at all — it redirected to `/app/home`, so
 * a prospect clicking through the sample was told their click had failed by
 * being moved somewhere else.
 */
export function SampleModuleNotBuilt({
  module: slug,
  mandateId = SAMPLE_MANDATE_ID,
}: {
  module: SampleModuleSlug;
  /**
   * Which sample mandate it was reached from. Only `sample-larkspur` has
   * module screens behind it; the other six sample mandates land here for
   * every module, which is the honest answer — rendering Larkspur's spec
   * under a Cindermere URL would be worse than saying nothing.
   */
  mandateId?: string;
}) {
  const label =
    [...SAMPLE_MODULES, ...SAMPLE_MODULES_PENDING].find((m) => m.slug === slug)
      ?.label ?? slug;
  const mandate = sampleMandate(mandateId) ?? sampleModuleMandate();
  const isPrimary = mandateId === SAMPLE_MANDATE_ID;

  return (
    <PageShell className="space-y-5">
      <SetBreadcrumbs
        crumbs={[
          { label: "Mandates", href: "/app/projects" },
          { label: mandate.title, href: `/app/projects/${mandateId}` },
          { label },
        ]}
      />

      <SampleBanner scope="mandate" />

      <header className="min-w-0">
        <h1 className="font-h1 text-[26px] uppercase leading-tight tracking-tight text-on-surface sm:text-h1">
          {label}
        </h1>
        <p className="mt-2 font-mono-label text-mono-label uppercase leading-[1.5] tracking-widest text-on-surface-variant">
          {mandate.title} · {mandate.company}
          {" // not in the sample yet"}
        </p>
      </header>

      {/*
        The rail only makes sense from the mandate that has the modules. From
        any other sample mandate it would offer seven links that all show a
        different search.
      */}
      {isPrimary && <SampleModuleRail />}

      <div className="border border-outline-variant bg-surface-container-low px-6 py-10 text-center">
        <p className="mx-auto max-w-[52ch] text-body-main leading-relaxed text-on-surface-variant">
          This part of the workspace is real in the product — it is the sample
          that does not fill it in yet.{" "}
          {isPrimary
            ? "Open one of the modules above to see how the mandate workspace fits together, or start"
            : `The worked sample sits on ${sampleModuleMandate().company}. Open that, or start`}{" "}
          a mandate of your own to reach {label.toLowerCase()} with your own
          candidates in it.
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          <Link
            href={`/app/projects/${mandateId}`}
            prefetch={false}
            className={QUIET_ACTION}
          >
            {"←"} Back to the sample mandate
          </Link>
          {!isPrimary && (
            <Link
              href={`/app/projects/${SAMPLE_MANDATE_ID}`}
              prefetch={false}
              className={QUIET_ACTION}
            >
              Open the worked sample mandate
            </Link>
          )}
          <Link href="/app/projects/new" prefetch={false} className={QUIET_ACTION}>
            Start a mandate
          </Link>
        </div>
      </div>
    </PageShell>
  );
}
