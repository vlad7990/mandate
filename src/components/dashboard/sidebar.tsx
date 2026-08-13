"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { UserMenu } from "./user-menu";
import {
  NAV_GROUPS,
  isNavItemActive,
  navFor,
  navItemsInGroup,
  type NavItem,
} from "./nav-model";
import { type Role } from "@/lib/auth/roles";
import {
  IconAnalytics,
  IconCandidates,
  IconClose,
  IconIntelligence,
  IconMandates,
  IconMenu,
  IconNetwork,
  IconPortfolio,
  IconSettings,
  IconSkills,
} from "@/components/icons";

/**
 * The application rail.
 *
 * Three states, one component:
 *
 * - **≥1280px** — 240px expanded, labelled, grouped. The previous rail
 *   was 80px of unlabelled icons: seven destinations distinguishable
 *   only by pictogram, and the pictograms were webfont ligatures that
 *   render as the literal words "folder_open" until the font arrives.
 * - **768–1279px** — 64px icons with a tooltip carrying the label, so
 *   every destination is still nameable.
 * - **<768px** — absent from the layout entirely; the rail becomes an
 *   overlay drawer opened from the topbar. The old rail spent 80px of a
 *   390px viewport permanently.
 *
 * The shell is flex. The old layout cleared a fixed rail with `ml-20`
 * on `<main>`, which breaks silently the moment the rail width changes
 * — and it now changes three times.
 *
 * Also gone: a disabled "Command line — coming soon" button that sat at
 * the bottom of the rail. The command palette is real now and lives in
 * the topbar where the comp puts it.
 */

const ICONS: Record<
  NavItem["icon"],
  (p: { size?: number; className?: string }) => React.ReactNode
> = {
  portfolio: IconPortfolio,
  analytics: IconAnalytics,
  mandates: IconMandates,
  candidates: IconCandidates,
  network: IconNetwork,
  intelligence: IconIntelligence,
  skills: IconSkills,
  settings: IconSettings,
};

type SidebarProps = {
  user: { displayName: string; email: string; role: Role | null };
  badges?: { network?: number; mandates?: number };
};

export function Sidebar({ user, badges }: SidebarProps) {
  const pathname = usePathname();
  // Destinations this role can actually open. Presentation only — the
  // proxy and RLS are what stop a hand-typed URL.
  const items = navFor(user.role);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Escape closes; the background stops scrolling while it is open.
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [drawerOpen]);

  return (
    <>
      <button
        type="button"
        aria-label="Open navigation"
        aria-expanded={drawerOpen}
        onClick={() => setDrawerOpen(true)}
        className="fixed left-2 top-2 z-50 flex h-11 w-11 items-center justify-center text-on-surface md:hidden"
      >
        <IconMenu />
      </button>

      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-background/70 md:hidden"
          aria-hidden
          onClick={() => setDrawerOpen(false)}
        />
      )}

      <aside
        className={cn(
          "z-40 flex flex-col border-r border-outline-variant bg-surface-container-lowest",
          "fixed inset-y-0 left-0 w-[280px] transition-transform duration-200",
          "md:static md:w-16 md:translate-x-0 md:transition-none xl:w-60",
          drawerOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-outline-variant px-4 md:justify-center md:px-0 xl:justify-start xl:px-[18px]">
          <Link
            href="/app/home"
            aria-label="Mandate — portfolio"
            className="flex items-center gap-2.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
          >
            <span
              aria-hidden
              className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[5px] border-[1.5px] border-primary"
            >
              <span className="h-1.5 w-1.5 rounded-[1px] bg-primary" />
            </span>
            <span className="font-heading text-[13px] font-bold tracking-[0.06em] text-on-surface md:hidden xl:inline">
              MANDATE
            </span>
          </Link>

          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setDrawerOpen(false)}
            className="-mr-2 ml-auto flex h-11 w-11 items-center justify-center text-outline md:hidden"
          >
            <IconClose />
          </button>
        </div>

        <nav
          aria-label="Primary"
          className="flex flex-1 flex-col gap-5 overflow-y-auto p-3 md:items-center md:gap-3 xl:items-stretch xl:gap-[22px]"
        >
          {NAV_GROUPS.map((group) => {
            const groupItems = navItemsInGroup(group.key, items);
            // A heading above nothing reads as a section that failed to
            // load rather than one this role does not have.
            if (groupItems.length === 0) return null;
            return (
            <div key={group.key} className="flex w-full flex-col gap-1">
              {/* No room for a group label on the icon rail — the
                  tooltip carries the destination name there instead. */}
              <p className="px-2.5 pb-1.5 font-mono-label text-[10px] font-bold uppercase tracking-[0.14em] text-outline md:hidden xl:block">
                {group.label}
              </p>

              {groupItems.map((navItem) => {
                const Icon = ICONS[navItem.icon];
                const active = isNavItemActive(navItem, pathname);
                const badge =
                  navItem.badgeKey === "network"
                    ? badges?.network
                    : navItem.badgeKey === "mandates"
                      ? badges?.mandates
                      : undefined;

                return (
                  <Link
                    key={navItem.href}
                    href={navItem.href}
                    aria-current={active ? "page" : undefined}
                    // Closing here rather than in an effect on
                    // pathname: the click is the cause, and a link to
                    // the route you are already on changes no pathname
                    // and so would leave the drawer open.
                    onClick={() => setDrawerOpen(false)}
                    className={cn(
                      "group relative flex items-center gap-2.5 transition-colors",
                      "min-h-11 px-2.5",
                      "md:mx-auto md:h-10 md:w-10 md:min-h-0 md:justify-center md:px-0",
                      "xl:mx-0 xl:h-auto xl:w-auto xl:min-h-0 xl:justify-start xl:px-2.5 xl:py-2.5",
                      active
                        ? "bg-surface-container-high text-on-surface"
                        : "text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface",
                      navItem.child && "xl:pl-9"
                    )}
                  >
                    <Icon
                      size={16}
                      className={cn(
                        "shrink-0",
                        active && "text-primary",
                        // A child item is identified by indentation, not
                        // by repeating its parent's icon.
                        navItem.child && "xl:hidden"
                      )}
                    />

                    <span
                      className={cn(
                        "truncate text-[13px] md:hidden xl:inline",
                        active ? "font-medium" : "font-normal",
                        navItem.child && "text-xs"
                      )}
                    >
                      {navItem.label}
                    </span>

                    {badge !== undefined && badge > 0 && (
                      <span className="ml-auto shrink-0 font-mono-label text-[11px] tabular-nums text-outline md:hidden xl:inline">
                        {badge}
                      </span>
                    )}

                    {/* Icon-rail tooltip. pointer-events-none so it can
                        never intercept the click on its own link. */}
                    <span
                      role="tooltip"
                      className="pointer-events-none absolute left-[52px] z-50 hidden whitespace-nowrap border border-outline-variant bg-surface-container-high px-2.5 py-1.5 text-xs font-medium text-on-surface opacity-0 shadow-lg transition-opacity md:block md:group-hover:opacity-100 md:group-focus-visible:opacity-100 xl:md:hidden"
                    >
                      {navItem.label}
                    </span>
                  </Link>
                );
              })}
            </div>
            );
          })}
        </nav>

        <div className="shrink-0 border-t border-outline-variant p-3">
          <UserMenu
            displayName={user.displayName}
            email={user.email}
            role={user.role}
          />
        </div>
      </aside>
    </>
  );
}
