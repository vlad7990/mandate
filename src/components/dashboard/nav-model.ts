/**
 * The dashboard's navigation model, kept out of the component so the
 * active-state rule can be tested.
 *
 * It was previously inline in `sidebar.tsx`, and it was wrong: the first
 * branch tested `item.href === "/"`, which no item has, so it never ran
 * and browsing a project left every nav item unlit. An inline ternary in
 * a client component is unreachable from a node-environment test suite,
 * which is exactly why nothing caught it.
 *
 * The rail is grouped rather than flat. Seven undifferentiated icons
 * gave no sense of what the product is made of; the groups say it —
 * you look at a portfolio, you run searches, you have an intelligence
 * layer, and the rest is system.
 */

export type NavGroupKey = "workspace" | "search" | "intelligence" | "system";

export type NavItem = {
  href: string;
  label: string;
  /** Which icon to render. Resolved in the component, not here. */
  icon:
    | "portfolio"
    | "analytics"
    | "mandates"
    | "candidates"
    | "network"
    | "intelligence"
    | "skills"
    | "settings";
  group: NavGroupKey;
  /** Treat any path beneath this one as active, not just an exact hit. */
  matchPrefix?: boolean;
  /** Optional badge count rendered against the label. */
  badgeKey?: "network" | "mandates";
  /** Rendered indented, under the item above it. */
  child?: true;
};

export const NAV_GROUPS: ReadonlyArray<{
  key: NavGroupKey;
  label: string;
}> = [
  { key: "workspace", label: "Workspace" },
  { key: "search", label: "Search" },
  { key: "intelligence", label: "Intelligence" },
  { key: "system", label: "System" },
];

/**
 * The Projects entry lands on /app/home but owns the /app/projects/*
 * tree as well — they are one destination in the user's head, and the
 * nav should not go dark the moment you open a project.
 */
export const PROJECTS_HREF = "/app/home";
const PROJECTS_TREE = "/app/projects";

export const NAV: readonly NavItem[] = [
  { href: PROJECTS_HREF, label: "Portfolio", icon: "portfolio", group: "workspace" },
  {
    href: "/app/analytics",
    label: "Analytics",
    icon: "analytics",
    group: "workspace",
    matchPrefix: true,
  },

  {
    href: "/app/projects",
    label: "Mandates",
    icon: "mandates",
    group: "search",
    badgeKey: "mandates",
  },
  { href: "/app/candidates", label: "Candidates", icon: "candidates", group: "search" },
  {
    href: "/app/candidates/network",
    label: "Network",
    icon: "network",
    group: "search",
    badgeKey: "network",
  },

  {
    href: "/app/executive-intelligence",
    label: "Executive Intelligence",
    icon: "intelligence",
    group: "intelligence",
  },
  {
    href: "/app/executive-intelligence/competencies",
    label: "Competencies",
    icon: "intelligence",
    group: "intelligence",
    child: true,
  },
  {
    href: "/app/executive-intelligence/templates",
    label: "Role templates",
    icon: "intelligence",
    group: "intelligence",
    child: true,
  },

  {
    href: "/app/settings/skills",
    label: "Skills studio",
    icon: "skills",
    group: "system",
    matchPrefix: true,
  },
  { href: "/app/settings", label: "Settings", icon: "settings", group: "system" },
];

/**
 * Whether `item` should read as the current section for `pathname`.
 *
 * Prefix matching always requires the trailing slash, so `/app/analytics`
 * does not claim a hypothetical `/app/analytics-archive`.
 *
 * Order matters for the two Settings entries: Skills studio owns
 * `/app/settings/skills/*` and plain Settings is an exact match only,
 * so opening a skill does not light both.
 */
export function isNavItemActive(item: NavItem, pathname: string): boolean {
  if (item.href === PROJECTS_HREF) {
    return pathname === PROJECTS_HREF;
  }
  // Mandates owns the project tree but not the portfolio landing.
  if (item.href === PROJECTS_TREE) {
    return pathname === PROJECTS_TREE || pathname.startsWith(PROJECTS_TREE + "/");
  }
  if (item.matchPrefix) {
    return pathname === item.href || pathname.startsWith(item.href + "/");
  }
  return pathname === item.href;
}

/** Items belonging to one group, in declaration order. */
export function navItemsInGroup(group: NavGroupKey): readonly NavItem[] {
  return NAV.filter((i) => i.group === group);
}
