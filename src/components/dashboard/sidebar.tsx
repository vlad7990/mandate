"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { UserMenu } from "./user-menu";

type NavItem = {
  href: string;
  label: string;
  icon: string;
  /** Treat any path that starts with this as active. */
  matchPrefix?: boolean;
  /** Optional badge count rendered below the label. */
  badgeKey?: "network";
};

/** The Projects entry lands on /app/home but owns /app/projects/* too. */
const PROJECTS_HREF = "/app/home";

const NAV: NavItem[] = [
  { href: PROJECTS_HREF, label: "Projects", icon: "folder_open" },
  { href: "/app/candidates", label: "Candidates", icon: "groups" },
  {
    href: "/app/candidates/network",
    label: "Network",
    icon: "hub",
    badgeKey: "network",
  },
  { href: "/app/candidates/search", label: "AI Search", icon: "neurology" },
  {
    href: "/app/executive-intelligence",
    label: "Exec Intel",
    icon: "workspace_premium",
    matchPrefix: true,
  },
  { href: "/app/analytics", label: "Analytics", icon: "analytics", matchPrefix: true },
  { href: "/app/settings", label: "Settings", icon: "settings", matchPrefix: true },
];

type SidebarProps = {
  user: {
    displayName: string;
    email: string;
    role: string | null;
  };
  badges?: {
    network?: number;
  };
};

export function Sidebar({ user, badges }: SidebarProps) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="fixed left-0 top-0 h-full w-20 border-r border-outline-variant bg-surface-container-lowest flex flex-col items-center py-4 z-50"
    >
      <Link
        href="/app/home"
        aria-label="Mandate home"
        className="mb-8 flex flex-col items-center gap-1"
      >
        <span className="font-black text-primary-container tracking-widest text-lg">M</span>
        <span className="font-mono uppercase tracking-tighter text-[8px] text-outline">
          V.02.BR
        </span>
      </Link>

      <div className="flex flex-col gap-2 flex-1 w-full items-center">
        {NAV.map((item) => {
          // The first branch used to test `item.href === "/"`, which no
          // NAV item has — so it never ran, and browsing a project left
          // every nav item unlit. The Projects entry points at /app/home
          // but owns the /app/projects/* tree, so it claims both.
          const owns =
            item.href === PROJECTS_HREF
              ? pathname === PROJECTS_HREF ||
                pathname === "/app/projects" ||
                pathname.startsWith("/app/projects/")
              : item.matchPrefix
                ? pathname === item.href || pathname.startsWith(item.href + "/")
                : pathname === item.href;
          const active = owns;

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex flex-col items-center gap-1 transition-colors duration-150 py-2 w-16 rounded",
                active
                  ? "text-primary bg-surface-container/60"
                  : "text-outline hover:text-on-surface-variant hover:bg-surface-container-low"
              )}
            >
              {active && (
                <span className="absolute left-0 top-1 bottom-1 w-[2px] bg-primary-container rounded-r" />
              )}
              <span
                className="material-symbols-outlined"
                style={active ? { fontVariationSettings: "'FILL' 1" } : undefined}
              >
                {item.icon}
              </span>
              <span className="font-mono uppercase tracking-tighter text-[8px]">
                {item.label}
              </span>
              {item.badgeKey && badges?.[item.badgeKey] != null && (
                <span
                  className={cn(
                    "font-mono uppercase tracking-tighter text-[8px] tabular-nums",
                    active ? "text-primary" : "text-outline"
                  )}
                >
                  {badges[item.badgeKey]}
                </span>
              )}
            </Link>
          );
        })}
      </div>

      <div className="mt-auto flex flex-col items-center gap-3">
        <button
          type="button"
          aria-label="Command line (coming soon)"
          disabled
          title="Command line — coming soon"
          className="text-outline opacity-60 cursor-not-allowed"
        >
          <span className="material-symbols-outlined">terminal</span>
        </button>
        <UserMenu
          displayName={user.displayName}
          email={user.email}
          role={user.role}
        />
      </div>
    </nav>
  );
}
