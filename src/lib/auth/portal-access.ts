import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { isExternalRole, parseRole, type ExternalRole } from "@/lib/auth/roles";

/**
 * Who is looking at the portal.
 *
 * The external counterpart of `getAccess()` in access.ts. It resolves
 * through the `portal_context()` RPC (069) rather than a table read,
 * because an external can read almost nothing directly — the RPC is
 * their one mirror, and it returns a row only for an *active* external.
 * A pending or suspended external, or any staff account, gets null and
 * every caller fails closed.
 */

export type PortalAccess = {
  userId: string;
  email: string;
  fullName: string;
  role: ExternalRole;
  clientId: string;
  clientName: string;
  organizationName: string;
};

export const getPortalAccess = cache(async (): Promise<PortalAccess | null> => {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase.rpc("portal_context");
  if (error) {
    console.error("[portal] context read failed", error);
    return null;
  }

  type ContextRow = {
    full_name: string | null;
    email: string;
    role: string;
    client_id: string;
    client_name: string;
    organization_name: string;
  };
  const row = ((data ?? []) as ContextRow[])[0];
  if (!row) return null;

  const role = parseRole(row.role);
  if (!isExternalRole(role)) return null;

  return {
    userId: user.id,
    email: row.email,
    fullName: row.full_name?.trim() || row.email,
    role,
    clientId: row.client_id,
    clientName: row.client_name,
    organizationName: row.organization_name,
  };
});

/**
 * For portal pages: the caller is a signed-in, active external — or they
 * are somewhere else entirely. Staff land on their own dashboard (their
 * home explains itself better than a refusal screen for a surface they
 * were never shown a link to); the signed-out land on sign-in with a way
 * back.
 */
export async function requirePortalAccess(): Promise<PortalAccess> {
  const access = await getPortalAccess();
  if (!access) {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    redirect(user ? "/app" : "/auth/signin?next=/portal");
  }
  return access;
}
