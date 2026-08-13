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

export const ROLES = ["admin", "recruiter", "researcher", "viewer"] as const;

export type Role = (typeof ROLES)[number];

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
 * `mandates:write` and `clients:share` currently resolve to the same two
 * roles, which looks redundant. They are kept apart because they are the
 * two separate limits that define the researcher role — "cannot open a
 * mandate" and "cannot put anything in front of a client" — and they
 * cover different route trees and different tables. Merging them now
 * would mean re-splitting them the first time a researcher is allowed to
 * open a mandate but still not to send anything out.
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
  /** Author skills, competencies and role templates — they change how every search scores. */
  "skills:write",
  /** Org settings and member administration. */
  "org:manage",
] as const;

export type Capability = (typeof CAPABILITIES)[number];

const GRANTS: Record<Role, readonly Capability[]> = {
  admin: [
    "org:read",
    "candidates:write",
    "mandates:write",
    "clients:share",
    "skills:write",
    "org:manage",
  ],
  recruiter: ["org:read", "candidates:write", "mandates:write", "clients:share"],
  researcher: ["org:read", "candidates:write"],
  viewer: ["org:read"],
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
  recruiter: "Recruiter",
  researcher: "Researcher",
  viewer: "Viewer",
};

/** One line on what the role can do, for the role picker and the member list. */
export const ROLE_SUMMARIES: Record<Role, string> = {
  admin: "Everything a recruiter can do, plus org settings, member roles and the skills studio.",
  recruiter: "Runs mandates end to end — sourcing, evaluation, shortlists, client exports and outreach.",
  researcher: "Sourcing and evaluation. Cannot open a mandate, publish a shortlist or contact a candidate.",
  viewer: "Read-only across the org. Writes nothing anywhere.",
};

/** Human-readable name for a capability, for the settings matrix. */
export const CAPABILITY_LABELS: Record<Capability, string> = {
  "org:read": "Read org data",
  "candidates:write": "Candidates and sourcing",
  "mandates:write": "Mandates and calibration",
  "clients:share": "Shortlists, exports and outreach",
  "skills:write": "Skills studio",
  "org:manage": "Org settings and members",
};
