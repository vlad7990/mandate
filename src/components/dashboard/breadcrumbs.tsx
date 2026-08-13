"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

/**
 * Page context for the topbar.
 *
 * The comp puts breadcrumbs in the topbar, but a topbar deriving them
 * from the pathname alone can only ever render
 * `Mandates / 5f3c1a90-…`, because the project's title lives in the
 * database and the URL carries its id. So pages supply their own trail.
 *
 * Until a page opts in, the topbar falls back to the section name from
 * the nav model, which is always correct and never a uuid.
 *
 * This is now the only breadcrumb in the product. There was a second,
 * `BreadcrumbRail`, which each page rendered inline at the top of its own
 * body: twelve pages carried one, seven set crumbs here, and a few managed
 * both, so the trail appeared in a different place depending on where you
 * had navigated from. The rail is gone and its one feature the topbar
 * lacked — a per-crumb character cap — moved here.
 */

export type Crumb = {
  label: string;
  href?: string;
  /**
   * Cap the rendered label, ellipsis included.
   *
   * CSS truncation alone is not enough here: the trail is one flex row, so a
   * long mandate title takes its share of the width and squeezes the crumb
   * after it — which is usually the one naming where you actually are. A
   * character cap keeps the last segment legible.
   */
  maxChars?: number;
};

/** Shorten a crumb label to its cap, if it has one. */
export function truncateCrumb(label: string, maxChars?: number): string {
  if (!maxChars || label.length <= maxChars) return label;
  return `${label.slice(0, maxChars - 1)}…`;
}

type Ctx = {
  crumbs: Crumb[] | null;
  setCrumbs: (c: Crumb[] | null) => void;
};

const BreadcrumbContext = createContext<Ctx | null>(null);

export function BreadcrumbProvider({ children }: { children: React.ReactNode }) {
  const [crumbs, setCrumbs] = useState<Crumb[] | null>(null);
  const value = useMemo(() => ({ crumbs, setCrumbs }), [crumbs]);
  return (
    <BreadcrumbContext.Provider value={value}>
      {children}
    </BreadcrumbContext.Provider>
  );
}

export function useBreadcrumbs(): Crumb[] | null {
  return useContext(BreadcrumbContext)?.crumbs ?? null;
}

/**
 * Rendered by a page to name where it is.
 *
 * Renders nothing. Clears on unmount so a stale trail from the previous
 * route cannot survive a navigation — without that, leaving a project
 * for a page that sets no crumbs would leave the old project's name in
 * the topbar.
 */
export function SetBreadcrumbs({ crumbs }: { crumbs: Crumb[] }) {
  const ctx = useContext(BreadcrumbContext);
  // Serialised so an inline array literal from a server component does
  // not re-fire the effect on every render.
  const key = JSON.stringify(crumbs);

  useEffect(() => {
    ctx?.setCrumbs(JSON.parse(key) as Crumb[]);
    return () => ctx?.setCrumbs(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return null;
}
