/**
 * The role model.
 *
 * `users.role` has existed since migration 001 with a default of
 * `'recruiter'`, and the signup trigger has been writing either `'admin'`
 * or `'recruiter'` into it since 002 — but nothing in the codebase ever
 * compared it against anything. Authorization was three other things:
 * `is_founder`, `status`, and org-scoped RLS. This file is what makes the
 * column mean something.
 *
 * Mirrored in `supabase/migrations/046_roles_and_route_guards.sql`, which
 * holds the CHECK constraint and the RLS predicates. Keep both in sync —
 * the migration is the one that actually enforces, this one decides what
 * the UI offers and what a server action refuses before it gets there.
 *
 * `is_founder` is deliberately NOT a role. It is the platform-operator
 * flag — it gates the waitlist and cross-org user administration, which
 * are Mandate's own concerns, not a customer org's. A founder is an
 * `admin` of their org *and* a founder; the two answer different
 * questions and collapsing them would mean a customer admin inherits
 * the waitlist.
 */

/**
 * The staff vocabulary: principals of a recruiting organisation. These
 * roles carry `organization_id` and never `client_id` — the XOR CHECK in
 * migration 067 enforces the split at the column level.
 */
export const STAFF_ROLES = ["admin", "manager", "recruiter", "researcher", "viewer"] as const;

/**
 * The external vocabulary: principals of a *client* company (migration
 * 067, the External Identity programme). They carry `client_id` and never
 * `organization_id`, hold no org capability at all — not even `org:read` —
 * and live on `/portal`, not `/app`. They arrive by invitation only.
 */
export const EXTERNAL_ROLES = ["hiring_manager", "client_hr", "client_admin"] as const;

/**
 * The agent vocabulary: AI principals of a recruiting organisation
 * (migration 074, the agents-as-principals programme). One role, not
 * fourteen — the agent KIND (interpreter, ranker, parser…) is
 * attribution detail on every event, not authority. Agents carry
 * `organization_id` (NOT NULL — the XOR) and never `client_id`, hold an
 * EMPTY capability grant (their reach is named RLS policies, not
 * capabilities — capabilities are for humans), and never navigate: the
 * proxy bounces them off every route tree, and their one face in the
 * product is /ops accounts, labelled, with suspend/restore.
 */
export const AGENT_ROLES = ["agent"] as const;

export const ROLES = [...STAFF_ROLES, ...AGENT_ROLES, ...EXTERNAL_ROLES] as const;

/**
 * The roles a person can hold — what the members matrix and every
 * human-facing role list iterate. `ROLES` exists so `parseRole` admits
 * the agent (a row that parses to null loses its label, and an agent
 * row must render honestly wherever it appears); this list exists so
 * the agent does not gain a column in screens that document what
 * PEOPLE can do.
 */
export const HUMAN_ROLES = [...STAFF_ROLES, ...EXTERNAL_ROLES] as const;

export type Role = (typeof ROLES)[number];
export type StaffRole = (typeof STAFF_ROLES)[number];
export type ExternalRole = (typeof EXTERNAL_ROLES)[number];
export type AgentRole = (typeof AGENT_ROLES)[number];

/**
 * Whether `role` belongs to the client side of the boundary. Takes the
 * nullable form for the same reason `can()` does — the caller usually
 * holds a parsed column, and null is neither staff nor external.
 */
export function isExternalRole(role: Role | null | undefined): role is ExternalRole {
  return !!role && (EXTERNAL_ROLES as readonly string[]).includes(role);
}

/**
 * What a new non-founder account gets. Matches the column default and the
 * `handle_new_auth_user` trigger, both set in migration 046.
 *
 * It is `viewer`, not `recruiter`. The trigger wrote `recruiter` while the
 * column meant nothing, which was harmless; now it would mean an approved
 * stranger arrives able to open mandates and export to clients. An admin
 * promotes them deliberately from the members screen instead.
 */
export const DEFAULT_ROLE: Role = "viewer";

/**
 * Capabilities are named for the thing being done, not the screen it is
 * done on, because several screens mutate the same domain and a screen
 * can move.
 *
 * `mandates:write`, `clients:share` and `fees:read` all currently resolve
 * to the same two roles, which looks redundant. They are kept apart
 * because they are separate limits that happen to coincide — "cannot open
 * a mandate", "cannot put anything in front of a client", "cannot see what
 * we billed" — and they cover different route trees and different tables.
 * Merging them now would mean re-splitting them the first time a
 * researcher is allowed to open a mandate but still not to send anything
 * out, or a delivery consultant presents slates without seeing the book.
 *
 * ## `fees:read` is the first capability that restricts a *read*
 *
 * Everything above it is a write tier over data every active role can
 * see; `org:read` has meant "sees everything" since 046. Money is where
 * that stops — a contract researcher or a viewer account handed to a
 * stakeholder would otherwise open the whole revenue book.
 *
 * It has no `fees:write` counterpart. Recording what a placement paid is
 * part of running the mandate, so the fee tables take `mandates:write` on
 * the write side, which is the same two roles. A second capability there
 * would be a name with nothing behind it. Migration 050 does the same:
 * `can_read_fees()` on SELECT, `can_write_mandates()` on the rest.
 *
 * The exception the capability cannot express is the own-placement rule —
 * whoever owns or sourced a placement sees that placement's money whatever
 * their role. That is per-row and therefore lives in RLS and in
 * `canReadPlacementFees` in `src/lib/fees/access.ts`, not here.
 */
export const CAPABILITIES = [
  /** See the org's recruiting data. Every active role has this. */
  "org:read",
  /** Add and edit candidates, upload CVs, run and import sourcing, evaluate. */
  "candidates:write",
  /** Create and edit mandates, job specs, calibration, feedback. */
  "mandates:write",
  /** Publish a shortlist, open the HM portal, export client-facing PDFs, send outreach. */
  "clients:share",
  /** See fee terms, placement fees and the revenue book across the org. */
  "fees:read",
  /** The desk: cross-recruiter oversight, and reassigning a mandate's lead. */
  "desk:manage",
  /** Author skills, competencies and role templates — they change how every search scores. */
  "skills:write",
  /** Org settings and member administration. */
  "org:manage",
  /**
   * The client portal: shared mandates, slates, attributed feedback. The
   * externals' whole read surface — deliberately not `org:read`, because
   * an external reads through SECURITY DEFINER RPCs (069), never the org's
   * tables.
   */
  "portal:read",
  /** Invite and suspend the client company's own people. The client_admin's one management act. */
  "client:manage-people",
  /**
   * The platform operator's tier: /ops, waitlist triage, cross-org
   * account administration. Held by NO role — it resolves from
   * `users.is_founder` (see `holdsPlatformOperate` in access.ts and the
   * proxy's platform branch), per D2 of the final-personas programme: a
   * role value would force the 067 XOR three-way and every staff
   * enumeration to remember to exclude it. It lives in this list so the
   * route table and the no-access screen can name it.
   */
  "platform:operate",
] as const;

export type Capability = (typeof CAPABILITIES)[number];

const GRANTS: Record<Role, readonly Capability[]> = {
  admin: [
    "org:read",
    "candidates:write",
    "mandates:write",
    "clients:share",
    "fees:read",
    "desk:manage",
    "skills:write",
    "org:manage",
  ],
  // A recruiter's writes plus the desk, minus member administration and the
  // skills studio — the "coinciding capabilities diverge" case the header
  // anticipated, arrived as the Recruiting Manager persona (migration 064).
  manager: [
    "org:read",
    "candidates:write",
    "mandates:write",
    "clients:share",
    "fees:read",
    "desk:manage",
  ],
  recruiter: ["org:read", "candidates:write", "mandates:write", "clients:share", "fees:read"],
  researcher: ["org:read", "candidates:write"],
  viewer: ["org:read"],
  // The client side of the boundary. No org capability appears below this
  // line, and none ever should: an external who gained `org:read` would
  // walk through every generated SELECT policy in migration 046.
  hiring_manager: ["portal:read"],
  client_hr: ["portal:read"],
  client_admin: ["portal:read", "client:manage-people"],
  // The agent holds NOTHING here, deliberately and permanently (D2 of
  // the agents-as-principals programme): capabilities gate screens and
  // server actions, and an agent signs in to work, never to look. Its
  // database reach is the named `*_agent_*` RLS policies in migration
  // 074 — adding a capability here would hand every agent a route tree.
  agent: [],
};

/**
 * Whether `role` may do `capability`.
 *
 * Takes `Role | null` rather than `Role` on purpose: the caller usually
 * holds the result of reading a nullable text column, and forcing every
 * call site to narrow first is how a null slips through as "allowed".
 * Null is never permitted anything.
 */
export function can(role: Role | null | undefined, capability: Capability): boolean {
  if (!role) return false;
  return GRANTS[role].includes(capability);
}

/** Every capability held by `role`, in declaration order. Used by the settings UI. */
export function capabilitiesOf(role: Role | null | undefined): readonly Capability[] {
  if (!role) return [];
  return CAPABILITIES.filter((c) => GRANTS[role].includes(c));
}

/**
 * Narrow an untrusted value to a `Role`.
 *
 * The column is `text` and was unconstrained until migration 046, so
 * rows written before it could hold anything. An unrecognised value
 * returns null, which `can()` then denies everything — a row with a
 * typo'd role loses access rather than gaining it.
 */
export function parseRole(value: unknown): Role | null {
  if (typeof value !== "string") return null;
  const normalised = value.trim().toLowerCase();
  return (ROLES as readonly string[]).includes(normalised) ? (normalised as Role) : null;
}

/** Display name for a role. Sentence case — these appear inside prose too. */
export const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  manager: "Manager",
  recruiter: "Recruiter",
  researcher: "Researcher",
  viewer: "Viewer",
  hiring_manager: "Hiring Manager",
  client_hr: "HR",
  client_admin: "Client Admin",
  agent: "Agent",
};

/** One line on what the role can do, for the role picker and the member list. */
export const ROLE_SUMMARIES: Record<Role, string> = {
  admin: "Everything a manager can do, plus org settings, member roles and the skills studio.",
  manager:
    "Runs the desk — every recruiter's mandates, pipeline and fees, and reassigns leads. Cannot administer members or author skills.",
  recruiter: "Runs mandates end to end — sourcing, evaluation, shortlists, client exports and outreach.",
  researcher:
    "Sourcing and evaluation. Cannot open a mandate, publish a shortlist or contact a candidate. Sees fees only on placements they are credited on.",
  viewer: "Read-only across the org, excluding fees and revenue. Writes nothing anywhere.",
  hiring_manager:
    "Client-side. Sees the mandates individually shared with them and submits slate feedback. Nothing else.",
  client_hr:
    "Client-side. Sees every mandate shared with their company and submits slate feedback.",
  client_admin:
    "Client-side. Everything HR sees, plus inviting and suspending their own company's people.",
  agent:
    "Autonomous agent. Signs in to work, never to look — no screens, no capabilities; its reach is the named database grants for its one job.",
};

/** Human-readable name for a capability, for the settings matrix. */
export const CAPABILITY_LABELS: Record<Capability, string> = {
  "org:read": "Read org data",
  "candidates:write": "Candidates and sourcing",
  "mandates:write": "Mandates and calibration",
  "clients:share": "Shortlists, exports and outreach",
  "fees:read": "Placement fees and revenue",
  "desk:manage": "Desk oversight and reassignment",
  "skills:write": "Skills studio",
  "org:manage": "Org settings and members",
  "portal:read": "Client portal",
  "client:manage-people": "Client company's people",
  "platform:operate": "Platform operations",
};
