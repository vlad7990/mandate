import { type Capability } from "./roles";

/**
 * Which capability each product route requires.
 *
 * This is the route guard's data. It lives apart from the proxy so it can
 * be tested in a node environment, and so the nav can read the same table
 * rather than keeping a second, drifting opinion about who sees what.
 *
 * ## Why a table and not a check inside each page
 *
 * There are forty dashboard routes. A check inside each page is forty
 * places to forget, and the one you forget is the one that leaks. A table
 * makes the omission visible: a route with no rule falls to
 * `DEFAULT_CAPABILITY` (`org:read`), which is the safe default because
 * every active role has it and the page's own writes are separately
 * guarded in the server action and in RLS.
 *
 * That layering is the point. This table decides whether a page renders
 * at all; `assertCapability` in each server action decides whether a
 * mutation runs; RLS decides whether Postgres accepts the row. A viewer
 * who edits the URL past this table still writes nothing.
 *
 * ## Pattern syntax
 *
 * A `:` segment matches exactly one path segment — `/app/projects/:id`
 * matches `/app/projects/abc` and not `/app/projects/abc/spec`. Rules are
 * evaluated in order and the first match wins, so more specific patterns
 * come first. There is no trailing wildcard: prefix ownership is spelled
 * with `prefix: true`, which matches the path and everything beneath it.
 */

export type RouteRule = {
  /** Path pattern. `:name` matches one segment. */
  pattern: string;
  capability: Capability;
  /** Match everything beneath the pattern as well as the pattern itself. */
  prefix?: boolean;
};

/**
 * What a route requires when no rule matches it.
 *
 * `org:read` rather than something stricter because these are the
 * read-only surfaces of the product, and a role that cannot read them has
 * no reason to hold an account at all. The dashboard layout still gates
 * `status`, and RLS still gates the org.
 */
export const DEFAULT_CAPABILITY: Capability = "org:read";

/**
 * Ordered, most specific first.
 *
 * The shape of the list is worth reading as a description of the roles:
 * everything is readable, candidate intake and sourcing open up one tier
 * down, mandates and anything client-facing another tier down, and the
 * authoring tools that change how every search scores sit with the admin.
 */
export const ROUTE_RULES: readonly RouteRule[] = [
  // --- The desk -----------------------------------------------------------
  // Cross-recruiter oversight. Not a data-security boundary — a recruiter
  // could compute most of it from rows they already read — but a persona
  // boundary: the desk is the manager's surface, and the recruiter's home
  // is the portfolio.
  { pattern: "/app/desk", capability: "desk:manage", prefix: true },

  // --- Org administration -------------------------------------------------
  // The waitlist is founder-only and keeps its own check in the page; the
  // rule here only stops non-admins from reaching it at all.
  { pattern: "/app/settings/waitlist", capability: "org:manage", prefix: true },
  { pattern: "/app/settings/members", capability: "org:manage", prefix: true },

  // --- Skills studio ------------------------------------------------------
  // A skill rewrites how every candidate in the org is scored, so authoring
  // one is an admin act. Reading the list is not — a recruiter needs to know
  // which lens is being applied to their search, and the list page is the
  // only place that says so.
  { pattern: "/app/settings/skills/new", capability: "skills:write" },
  { pattern: "/app/settings/skills/:skillId", capability: "skills:write" },
  { pattern: "/app/settings/skills", capability: "org:read" },

  // --- Mandate creation and editing ---------------------------------------
  { pattern: "/app/projects/new", capability: "mandates:write" },
  { pattern: "/app/projects/:id/onboarding", capability: "mandates:write", prefix: true },
  { pattern: "/app/projects/:id/spec", capability: "mandates:write", prefix: true },
  { pattern: "/app/projects/:id/feedback", capability: "mandates:write", prefix: true },

  // --- Client-facing surfaces ---------------------------------------------
  // The three things a researcher is specifically not allowed to do: put a
  // slate in front of a client, open the hiring-manager portal, or generate
  // the report that leaves the building.
  { pattern: "/app/projects/:id/shortlist", capability: "clients:share", prefix: true },
  { pattern: "/app/projects/:id/hiring-manager", capability: "clients:share", prefix: true },
  { pattern: "/app/projects/:id/reports", capability: "clients:share", prefix: true },

  // --- Candidate intake and sourcing --------------------------------------
  { pattern: "/app/projects/:id/candidates/new", capability: "candidates:write" },
  { pattern: "/app/projects/:id/sourcing", capability: "candidates:write", prefix: true },

  // --- Clients -------------------------------------------------------------
  // No rule needed: reading the client list and a client record is `org:read`
  // like every other list, and clients are created as a side effect of the
  // mandate and executive-search flows, which are already gated. Listed here
  // as a comment so the next person does not assume it was forgotten.

  // --- Executive Intelligence ---------------------------------------------
  // Opening an executive search is opening a mandate; everything under an
  // existing search is readable, and its writes are guarded in the actions.
  { pattern: "/app/executive-intelligence/searches/new", capability: "mandates:write" },
  // 104: authoring an org role template changes how every executive search
  // scores — the skills-studio shape: the list stays readable, the
  // authoring routes sit with the admin.
  { pattern: "/app/executive-intelligence/templates/new", capability: "skills:write" },
  { pattern: "/app/executive-intelligence/templates/:templateId/edit", capability: "skills:write" },
];

/**
 * The client portal (`/portal`) — the externals' route tree, gated the
 * same way `/app` is but on the external capabilities. The default here is
 * `portal:read`, which no staff role holds, so the proxy's capability
 * check runs on every portal navigation and bounces staff to no-access —
 * the mirror image of externals holding no `org:read` for `/app`.
 */
export const PORTAL_DEFAULT_CAPABILITY: Capability = "portal:read";

export const PORTAL_RULES: readonly RouteRule[] = [
  { pattern: "/portal/people", capability: "client:manage-people", prefix: true },
];

/** Split a path into segments, ignoring empty ones from leading/trailing slashes. */
function segments(path: string): string[] {
  return path.split("/").filter(Boolean);
}

function matches(rule: RouteRule, path: string): boolean {
  const pat = segments(rule.pattern);
  const got = segments(path);

  if (rule.prefix ? got.length < pat.length : got.length !== pat.length) {
    return false;
  }

  for (let i = 0; i < pat.length; i++) {
    if (pat[i].startsWith(":")) continue; // one-segment wildcard
    if (pat[i] !== got[i]) return false;
  }
  return true;
}

/**
 * The capability `pathname` requires.
 *
 * Anything outside `/app` returns null — the marketing surface and the
 * token-based HM portal are not role-governed, and returning a capability
 * for them would make the proxy query the database on every landing-page
 * hit.
 */
export function capabilityForPath(pathname: string): Capability | null {
  // The operator's route tree (D3). One capability for the whole tree,
  // held by no role: the proxy's platform branch resolves it from
  // is_founder, and everyone else lands on no-access with the tier
  // named.
  if (pathname === "/ops" || pathname.startsWith("/ops/")) {
    return "platform:operate";
  }

  if (pathname === "/portal" || pathname.startsWith("/portal/")) {
    for (const rule of PORTAL_RULES) {
      if (matches(rule, pathname)) return rule.capability;
    }
    return PORTAL_DEFAULT_CAPABILITY;
  }

  if (pathname !== "/app" && !pathname.startsWith("/app/")) return null;

  for (const rule of ROUTE_RULES) {
    if (matches(rule, pathname)) return rule.capability;
  }
  return DEFAULT_CAPABILITY;
}

/**
 * Where a user lands when they lack the capability for a route.
 *
 * A dedicated page rather than a silent bounce to the dashboard: a
 * researcher who follows a colleague's link to a shortlist should be told
 * that the shortlist exists and is not theirs to open, not dropped on the
 * portfolio wondering whether the link was broken.
 */
export const NO_ACCESS_PATH = "/app/no-access";
