import { cache } from "react";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { can, parseRole, type Capability, type Role } from "./roles";
import { NO_ACCESS_PATH } from "./route-access";

/**
 * Reading the caller's authorization context, once, on the server.
 *
 * Every place that needed to know who the user was previously issued its
 * own `auth.getUser()` plus its own `select` against `public.users`, with
 * its own idea of which columns mattered — `settings/actions.ts` wanted
 * `is_founder, organization_id, status`, the dashboard layout wanted
 * `status, full_name, email, role`, `waitlist/page.tsx` wanted
 * `is_founder, status`. Three shapes, three chances to omit the check that
 * mattered. This is one shape.
 *
 * ## The three layers, and why this is only one of them
 *
 * 1. `src/proxy.ts` decides whether a route renders at all.
 * 2. `assertCapability` here decides whether a mutation runs.
 * 3. RLS in migration 046 decides whether Postgres accepts the row.
 *
 * Layer 3 is the only one that is a security boundary. A user holds their
 * own anon key and session cookie and can call PostgREST directly from a
 * browser console, so anything enforced only in 1 and 2 is a statement
 * about the UI, not about the data. 1 and 2 exist so the product tells the
 * truth about itself before the database has to refuse.
 */

export type Access = {
  userId: string;
  email: string | null;
  /** Null when the column holds something outside the role vocabulary. */
  role: Role | null;
  status: string;
  isFounder: boolean;
  organizationId: string | null;
};

/** Thrown by `assertCapability`. Carries the capability so callers can log it. */
export class ForbiddenError extends Error {
  readonly capability: Capability;

  constructor(capability: Capability, message?: string) {
    super(message ?? `Your role does not permit this action (${capability}).`);
    this.name = "ForbiddenError";
    this.capability = capability;
  }
}

/**
 * The caller's authorization context, or null if unauthenticated.
 *
 * Returns null rather than throwing on a missing profile row too: a user
 * in `auth.users` with no `public.users` row is unauthorized, not an
 * exception to surface to a recruiter mid-task.
 */
/**
 * Wrapped in React's `cache` so a page rendering several `CapabilityGate`s
 * plus a `requireCapability` costs one profile read, not one per call. The
 * cache is per-request, so it cannot serve one user's role to another.
 */
export const getAccess = cache(async function getAccess(): Promise<Access | null> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("users")
    .select("role, status, is_founder, organization_id, email")
    .eq("id", user.id)
    .single<{
      role: string | null;
      status: string;
      is_founder: boolean;
      organization_id: string | null;
      email: string | null;
    }>();

  if (!profile) return null;

  return {
    userId: user.id,
    email: profile.email ?? user.email ?? null,
    // A suspended or pending account holds no role. Doing this here rather
    // than at each call site means `can()` denies everything for them
    // without every caller remembering to check `status` first — which is
    // exactly the check that RLS was missing before 046.
    role: profile.status === "active" ? parseRole(profile.role) : null,
    status: profile.status,
    isFounder: profile.is_founder,
    organizationId: profile.organization_id,
  };
});

/** Whether the current caller holds `capability`. Never throws. */
export async function hasCapability(capability: Capability): Promise<boolean> {
  const access = await getAccess();
  return can(access?.role, capability);
}

/**
 * For server components. Redirects rather than throwing, so an
 * unauthorized page navigation lands somewhere a person can read.
 */
export async function requireCapability(capability: Capability): Promise<Access> {
  const access = await getAccess();

  if (!access) redirect("/auth/signin");
  if (access.status === "pending") redirect("/auth/pending");
  if (!can(access.role, capability)) {
    redirect(`${NO_ACCESS_PATH}?capability=${encodeURIComponent(capability)}`);
  }

  return access;
}

/**
 * For server actions. Throws, because an action has no page to redirect
 * to and swallowing the failure would let the UI report success on a
 * mutation the database then refused.
 *
 * Matches the existing `requireFounder` convention in
 * `settings/actions.ts` — plain `Error` subclasses, caught by the form's
 * error boundary.
 */
export async function assertCapability(capability: Capability): Promise<Access> {
  const access = await getAccess();

  if (!access) throw new Error("Unauthenticated.");
  if (access.status !== "active") throw new Error("Account is not active.");
  if (!can(access.role, capability)) throw new ForbiddenError(capability);

  return access;
}

/**
 * What almost every server action needs: the caller's id and org, having
 * first proved they hold `capability`.
 *
 * Twenty action files each carried a private `requireAuth()` that read the
 * profile, checked `status === 'active'`, checked `organization_id` was set,
 * and returned this exact shape. They now delegate here with the capability
 * their file's actions require, which is why adding the role check did not
 * mean editing seventy call sites — and why the check cannot be omitted from
 * one action in a file where the others have it.
 *
 * The error strings are the ones those helpers already threw, so the forms
 * catching them keep reporting what they reported before.
 */
export type ActionContext = {
  userId: string;
  organizationId: string;
};

export async function requireActionContext(
  capability: Capability
): Promise<ActionContext> {
  const access = await getAccess();

  if (!access) throw new Error("Unauthenticated.");
  if (access.status !== "active" || !access.organizationId) {
    throw new Error("Account is not provisioned.");
  }
  if (!can(access.role, capability)) throw new ForbiddenError(capability);

  return { userId: access.userId, organizationId: access.organizationId };
}

/**
 * Whether `access` holds the platform tier (`platform:operate`). Not a
 * role capability — it resolves from `is_founder`, status-gated like
 * every predicate since 059. The one place outside the proxy that asks
 * the boolean; pages and layouts ask this.
 */
export function holdsPlatformOperate(access: Access | null): boolean {
  return !!access && access.status === "active" && access.isFounder;
}

/**
 * For /ops pages: the caller operates the platform, or they are sent to
 * their own home — the dashboard explains itself better than a refusal
 * screen for a surface they were never shown a link to (the same shape
 * as requirePortalAccess), and its own gates then sort pending,
 * suspended and external sessions.
 */
export async function requirePlatformOperate(): Promise<Access> {
  const access = await getAccess();
  if (!holdsPlatformOperate(access)) {
    redirect(access ? "/app/home" : "/auth/signin?next=/ops");
  }
  return access!;
}

/**
 * Platform-operator gate, kept separate from the role model on purpose —
 * see the note at the top of `roles.ts`. Replaces the bespoke
 * `requireFounder` implementations that each re-read the profile.
 */
export async function assertFounder(): Promise<Access> {
  const access = await getAccess();

  if (!access) throw new Error("Unauthenticated.");
  if (access.status !== "active") throw new Error("Account is not active.");
  if (!access.isFounder) throw new Error("Founders only.");

  return access;
}
