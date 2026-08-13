import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isResolvableClientName } from "./types";

/**
 * Find-or-create the client for a company name, and return its id.
 *
 * Delegates to the `resolve_client` RPC from migration 049 rather than doing
 * a select-then-insert here. The role-analysis agent runs in a background
 * `after()` callback, so two mandates opened at the same client seconds apart
 * would race: both would read "no such client" and both would insert. The
 * RPC does it in one statement with `ON CONFLICT`, which makes the unique
 * index the arbiter instead of the application.
 *
 * The RPC is SECURITY INVOKER, so a caller who may not create clients gets
 * nothing back — the guard is RLS, not this function.
 *
 * Returns null when the name is the analysis placeholder or blank, and on
 * any failure. Callers treat null as "no client yet" and carry on: a mandate
 * that fails to link is a mandate with an unresolved client, not a failed
 * mandate, and this must never be the reason an agent run dies.
 */
export async function resolveClientId(
  supabase: SupabaseClient,
  args: {
    organizationId: string | null;
    companyName: string | null | undefined;
    createdBy?: string | null;
  }
): Promise<string | null> {
  if (!args.organizationId) return null;
  if (!isResolvableClientName(args.companyName)) return null;

  const { data, error } = await supabase.rpc("resolve_client", {
    p_organization_id: args.organizationId,
    p_name: (args.companyName ?? "").trim(),
    p_created_by: args.createdBy ?? null,
  });

  if (error) {
    console.error("[clients] resolve_client failed:", error.message);
    return null;
  }

  return (data as string | null) ?? null;
}

/**
 * Promote a mandate's freshly-computed company research to the client, so
 * the next mandate for the same client starts warm.
 *
 * Only ever writes forward: the client keeps the most recent research, and
 * `company_context_refreshed_at` records when. The mandate's own copy is not
 * touched — that is the frozen snapshot the exports render from, and the
 * whole point of storing it twice.
 *
 * Best-effort by design. A failure here costs the next mandate a re-run of
 * research it would have had to do anyway before 049.
 */
export async function promoteCompanyContextToClient(
  supabase: SupabaseClient,
  args: {
    clientId: string | null;
    companyContext: unknown;
  }
): Promise<void> {
  if (!args.clientId || !args.companyContext) return;

  // `CompanyContext` is {company_name, industry, business_model}, and two of
  // those three are profile columns on the client. Without mapping them
  // across, a client created from an ordinary mandate shows an empty profile
  // while the research that would fill it sits in the jsonb beside it — which
  // is exactly how the client page looked the first time it was rendered.
  //
  // Fill-the-gaps, like the executive-search intake: never overwrite what the
  // client already says, because that may have been corrected by hand.
  const ctx = args.companyContext as {
    industry?: string | null;
    business_model?: string | null;
  };

  const { data: existing } = await supabase
    .from("clients")
    .select("industry, business_model")
    .eq("id", args.clientId)
    .maybeSingle<{ industry: string | null; business_model: string | null }>();

  const profile: Record<string, string> = {};
  if (!existing?.industry && ctx.industry?.trim()) {
    profile.industry = ctx.industry.trim();
  }
  if (!existing?.business_model && ctx.business_model?.trim()) {
    profile.business_model = ctx.business_model.trim();
  }

  const { error } = await supabase
    .from("clients")
    .update({
      company_context: args.companyContext,
      company_context_refreshed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...profile,
    })
    .eq("id", args.clientId);

  if (error) {
    console.error("[clients] failed to promote company context:", error.message);
  }
}
