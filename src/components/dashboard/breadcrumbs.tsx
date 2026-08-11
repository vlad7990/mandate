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
 * Pages still rendering their own inline `BreadcrumbRail` will briefly
 * show both. That resolves per screen as each one is rebuilt — the
 * inline rail comes out when the page starts setting crumbs here.
 */

export type Crumb = { label: string; href?: string };

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
