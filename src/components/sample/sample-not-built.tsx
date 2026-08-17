import Link from "next/link";
import { SetBreadcrumbs } from "@/components/dashboard/breadcrumbs";
import { SampleBanner } from "@/components/sample/sample-banner";
import { PageShell, QUIET_ACTION } from "@/components/ui/page-shell";

/**
 * A screen the product has and the sample does not fill in.
 *
 * ## The class of bug this closes
 *
 * A sample id is not a uuid. Every dynamic route that takes one straight to
 * Postgres gets a `22P02` back, which is not `PGRST116`, so it falls into
 * the `redirect("/")` arm written for "this record is not yours". The reader
 * is moved to the dashboard and told nothing.
 *
 * W3 found eleven of these under `/app/projects/[id]`. Nine more had the
 * same shape — the executive-search tree, the skill detail, the import
 * wizard, the ranking comparison and the candidate upload form. They are
 * fixed together because they are one defect, not nine.
 *
 * **Being unreachable by clicking is not a fix.** A typed URL, a bookmark,
 * a browser back button and a shared link all still arrive, and the sample
 * exists precisely for people exploring without a map.
 *
 * ## What it says
 *
 * Which screen this is, that the gap is the sample's and not the product's,
 * and a way back. The distinction matters for the one audience that reaches
 * it: somebody evaluating whether to buy this.
 */
export function SampleNotBuilt({
  title,
  context,
  backHref,
  backLabel,
  scope = "workspace",
}: {
  /** The screen's own name, in the product's words. */
  title: string;
  /** Mono context line: what it belongs to. `//` between clauses. */
  context: string;
  backHref: string;
  backLabel: string;
  /** What the banner says is being sampled. */
  scope?: string;
}) {
  return (
    <PageShell className="space-y-5">
      <SetBreadcrumbs crumbs={[{ label: backLabel, href: backHref }, { label: title }]} />

      <SampleBanner scope={scope} />

      <header className="min-w-0">
        <h1 className="font-h1 text-[26px] uppercase leading-tight tracking-tight text-on-surface sm:text-h1">
          {title}
        </h1>
        <p className="mt-2 font-mono-label text-mono-label uppercase leading-[1.5] tracking-widest text-on-surface-variant">
          {context}
          {" // not in the sample yet"}
        </p>
      </header>

      <div className="border border-outline-variant bg-surface-container-low px-6 py-10 text-center">
        <p className="mx-auto max-w-[52ch] text-body-main leading-relaxed text-on-surface-variant">
          This screen is real in the product — it is the sample that does not
          fill it in yet. Nothing here is broken, and there is nothing for you
          to fix.
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          <Link href={backHref} prefetch={false} className={QUIET_ACTION}>
            {"←"} {backLabel}
          </Link>
        </div>
      </div>
    </PageShell>
  );
}
