"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isNavItemActive, navFor } from "./nav-model";
import { type Role } from "@/lib/auth/roles";
import { truncateCrumb, useBreadcrumbs } from "./breadcrumbs";
import { CommandPalette } from "./command-palette";
import { IconChevronRight } from "@/components/icons";

/**
 * The topbar carries where you are, and one live control.
 *
 * What it used to carry: a `disabled` "Command_line — coming soon"
 * button, a `disabled` "Export_recap — coming soon" button, and a
 * static `notifications_paused` glyph. Three controls, none of which
 * did anything, next to a decorative pulsing dot labelled
 * MANDATE_CORE // PORTFOLIO that named no real system state.
 *
 * Now: a trail that says where you are, and a working palette.
 *
 * **No notification bell.** The comp shows one with an unread dot, but
 * nothing in this product emits notifications — there is no table and
 * no producer. A bell with a permanently lit dot is the same defect the
 * marketing surface was stripped of: an indicator that cannot go false.
 * It belongs here the day something can ring it.
 *
 * **No export button.** The comp moves export into page headers, where
 * it has an object to act on. A global export has no referent.
 */
export function Topbar({ role }: { role: Role | null }) {
  const pathname = usePathname();
  const pageCrumbs = useBreadcrumbs();

  // Fallback: the section from the nav model. Always right, never a
  // uuid, and enough to answer "where am I" before a page opts in.
  const section = navFor(role).find((i) => isNavItemActive(i, pathname));
  const crumbs =
    pageCrumbs && pageCrumbs.length > 0
      ? pageCrumbs
      : section
        ? [{ label: section.label, href: section.href }]
        : [];

  return (
    <header className="flex h-14 w-full shrink-0 items-center gap-4 border-b border-outline-variant bg-surface-container-lowest px-4 pl-14 md:pl-4 lg:px-5">
      <nav
        aria-label="Breadcrumb"
        className="flex min-w-0 items-center gap-2 text-xs text-outline"
      >
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          const label = truncateCrumb(c.label, c.maxChars);
          return (
            <span key={`${c.label}-${i}`} className="flex min-w-0 items-center gap-2">
              {i > 0 && (
                <IconChevronRight size={14} className="shrink-0 text-outline" />
              )}
              {c.href && !last ? (
                <Link
                  href={c.href}
                  className="truncate rounded transition-colors hover:text-on-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                >
                  {label}
                </Link>
              ) : (
                <span
                  className={
                    last ? "truncate text-on-surface-variant" : "truncate"
                  }
                  aria-current={last ? "page" : undefined}
                  title={label === c.label ? undefined : c.label}
                >
                  {label}
                </span>
              )}
            </span>
          );
        })}
      </nav>

      <div className="ml-auto flex shrink-0 items-center gap-2.5">
        <CommandPalette role={role} />
      </div>
    </header>
  );
}
