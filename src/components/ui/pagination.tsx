import Link from "next/link";
import { buildListHref, pageRange, type ListParams } from "@/lib/list-params";
import { IconArrowLeft, IconArrowRight } from "@/components/icons";

/**
 * Page control for a list screen.
 *
 * Links, not buttons: a page of a list is a place, and it should be
 * shareable, bookmarkable and reachable with the back button. That also
 * keeps the list a server component, since nothing here needs state.
 *
 * There is deliberately no page-number strip and no total. Both need an
 * exact count, which is a second aggregate over the same predicate on every
 * view; the list overfetches a single row instead and uses it to decide
 * whether Next is live. "Showing 26–50" answers where you are, which is the
 * question the strip was really for.
 */
export function Pagination({
  basePath,
  params,
  rowsOnPage,
  hasMore,
  /** Plural noun for the row type, e.g. "candidates". */
  noun = "rows",
}: {
  basePath: string;
  params: ListParams;
  rowsOnPage: number;
  hasMore: boolean;
  noun?: string;
}) {
  const isFirstPage = params.page === 1;
  // Nothing to page through, and nothing behind us — say nothing.
  if (isFirstPage && !hasMore) return null;

  const { first, last } = pageRange(params, rowsOnPage);

  return (
    <nav
      aria-label="Pagination"
      className="flex flex-wrap items-center justify-between gap-3 border-t border-outline-variant px-4 py-3"
    >
      <p className="font-mono-label text-[11px] uppercase tracking-widest text-outline tabular-nums">
        {rowsOnPage === 0
          ? "No rows on this page"
          : `Showing ${first}–${last} ${noun}`}
      </p>

      <div className="flex items-center gap-2">
        <PageLink
          href={buildListHref(basePath, params, { page: params.page - 1 })}
          disabled={isFirstPage}
          rel="prev"
        >
          <IconArrowLeft size={14} />
          Previous
        </PageLink>
        <span className="font-mono-label text-[11px] uppercase tracking-widest text-outline tabular-nums">
          Page {params.page}
        </span>
        <PageLink
          href={buildListHref(basePath, params, { page: params.page + 1 })}
          disabled={!hasMore}
          rel="next"
        >
          Next
          <IconArrowRight size={14} />
        </PageLink>
      </div>
    </nav>
  );
}

/**
 * A disabled page link renders as a span, not an anchor.
 *
 * An `<a>` with no href is not focusable and announces as a link that goes
 * nowhere; a styled span with aria-disabled says what it is.
 */
function PageLink({
  href,
  disabled,
  rel,
  children,
}: {
  href: string;
  disabled: boolean;
  rel: "prev" | "next";
  children: React.ReactNode;
}) {
  const shape =
    "inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors";

  if (disabled) {
    return (
      <span
        aria-disabled="true"
        className={`${shape} cursor-not-allowed border-outline-variant/50 text-outline/60`}
      >
        {children}
      </span>
    );
  }

  return (
    <Link
      href={href}
      rel={rel}
      prefetch={false}
      className={`${shape} border-outline-variant bg-surface-container text-on-surface-variant hover:border-primary hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary`}
    >
      {children}
    </Link>
  );
}
