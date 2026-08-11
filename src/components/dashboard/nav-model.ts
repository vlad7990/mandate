/**
 * The dashboard's navigation model, kept out of the component so the
 * active-state rule can be tested.
 *
 * It was previously inline in `sidebar.tsx`, and it was wrong: the first
 * branch tested `item.href === "/"`, which no item has, so it never ran
 * and browsing a project left every nav item unlit. An inline ternary in
 * a client component is unreachable from a node-environment test suite,
 * which is exactly why nothing caught it.
 */

export type NavItem = {
  href: string;
  label: string;
  icon: string;
  /** Treat any path beneath this one as active, not just an exact hit. */
  matchPrefix?: boolean;
  /** Optional badge count rendered below the label. */
  badgeKey?: "network";
};

/**
 * The Projects entry lands on /app/home but owns the /app/projects/*
 * tree as well — they are one destination in the user's head, and the
 * nav should not go dark the moment you open a project.
 */
export const PROJECTS_HREF = "/app/home";
const PROJECTS_TREE = "/app/projects";

export const NAV: readonly NavItem[] = [
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

/**
 * Whether `item` should read as the current section for `pathname`.
 *
 * Prefix matching always requires the trailing slash, so `/app/analytics`
 * does not claim a hypothetical `/app/analytics-archive`.
 */
export function isNavItemActive(item: NavItem, pathname: string): boolean {
  if (item.href === PROJECTS_HREF) {
    return (
      pathname === PROJECTS_HREF ||
      pathname === PROJECTS_TREE ||
      pathname.startsWith(PROJECTS_TREE + "/")
    );
  }
  if (item.matchPrefix) {
    return pathname === item.href || pathname.startsWith(item.href + "/");
  }
  return pathname === item.href;
}
