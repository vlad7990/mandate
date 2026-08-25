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

import { can, type Capability, type Role } from "@/lib/auth/roles";

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
    | "search"
    | "clients"
    | "placements"
    | "activity"
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
  /**
   * Hidden from roles that lack this. Omitted means every active role sees
   * it — most destinations are readable, and the rail is not the boundary.
   *
   * Deliberately not derived from `ROUTE_RULES`: a route can require
   * `mandates:write` while its rail entry should stay visible, because the
   * entry points at a section a researcher reads and only some pages inside
   * it are restricted. Hiding those would leave a researcher unable to see
   * that mandates exist.
   */
  capability?: Capability;
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
  /**
   * The manager's surface. Gated on the capability rather than the role so
   * the nav and the route guard (`/app/desk` in ROUTE_RULES) cannot drift:
   * both read `desk:manage`, which admin and manager hold.
   */
  {
    href: "/app/desk",
    label: "Desk",
    icon: "analytics",
    group: "workspace",
    capability: "desk:manage",
    matchPrefix: true,
  },
  {
    href: "/app/analytics",
    label: "Analytics",
    icon: "analytics",
    group: "workspace",
    matchPrefix: true,
  },

  /**
   * Deliberately not gated on `fees:read`. The page is readable by every
   * active role — it shows the placements and says plainly that the money
   * is restricted — and hiding it would leave a researcher unable to see
   * that the placements they sourced were even recorded. Same reasoning as
   * the Mandates entry staying visible to a role that cannot open one.
   */
  {
    href: "/app/placements",
    label: "Placements",
    icon: "placements",
    group: "workspace",
  },

  /**
   * Not gated on a capability, for the same reason the page is not: every
   * role has a trail to read, it is just a different one. Hiding it from a
   * researcher would hide the history of their own placements from them.
   */
  {
    href: "/app/activity",
    label: "Activity",
    icon: "activity",
    group: "workspace",
  },

  { href: "/app/clients", label: "Clients", icon: "clients", group: "search" },
  {
    href: "/app/projects",
    label: "Mandates",
    icon: "mandates",
    group: "search",
    badgeKey: "mandates",
  },
  { href: "/app/candidates", label: "Candidates", icon: "candidates", group: "search" },
  /**
   * A 620-line natural-language search over the candidate pool that nothing
   * pointed at until now — reachable only by typing the URL.
   *
   * A child of Candidates rather than a sibling: it searches the same pool
   * the entry above lists, and promoting it to a top-level destination would
   * imply a second pool. Note that Candidates is an exact match, not a
   * prefix, so opening this does not light both — the same arrangement
   * Network already relies on.
   *
   * Not capability-gated. There is no rule for it in `ROUTE_RULES`, so every
   * active role can reach it, which is right: it reads the pool a viewer can
   * already read and writes nothing.
   */
  {
    href: "/app/candidates/search",
    label: "Pool search",
    icon: "search",
    group: "search",
    child: true,
  },
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
    href: "/app/agents",
    label: "Agents",
    icon: "intelligence",
    group: "system",
  },
  {
    href: "/app/settings/skills",
    label: "Skills studio",
    icon: "skills",
    group: "system",
    matchPrefix: true,
  },
  { href: "/app/settings", label: "Settings", icon: "settings", group: "system" },
  {
    href: "/app/settings/members",
    label: "Members",
    icon: "settings",
    group: "system",
    child: true,
    capability: "org:manage",
  },
];

/**
 * The rail as `role` should see it.
 *
 * This is presentation, not protection — the proxy and RLS decide what a
 * person can actually reach. Its job is to stop the product offering a
 * destination that will bounce, which reads as broken rather than as
 * restricted.
 */
export function navFor(role: Role | null | undefined): readonly NavItem[] {
  return NAV.filter((item) => !item.capability || can(role, item.capability));
}

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

/**
 * Items belonging to one group, in declaration order.
 *
 * Takes the item list rather than reading `NAV` directly so the caller can
 * pass the role-filtered one — otherwise the rail would render a group
 * heading above no items.
 */
export function navItemsInGroup(
  group: NavGroupKey,
  items: readonly NavItem[] = NAV
): readonly NavItem[] {
  return items.filter((i) => i.group === group);
}
