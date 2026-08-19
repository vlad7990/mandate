"use server";

import { createServerSupabaseClient } from "@/lib/supabase-server";
import { assertCapability } from "@/lib/auth/access";
import { runAction } from "@/lib/actions/run";
import type { ActionResult } from "@/lib/actions/result";
import { siteUrl } from "@/lib/email/send";

export type PortalLinkOutcome = { url: string; expiresAt: string };

/**
 * Issue (or re-fetch) the candidate's portal link. Authorization lives
 * in the 073 RPC — clients:share, org-scoped, identity key computed
 * in-database; the assertCapability here exists to refuse early with
 * the same sentence the proxy uses.
 */
export async function issuePortalLinkAction(
  candidateId: string
): Promise<ActionResult<PortalLinkOutcome>> {
  return runAction("The portal link", async () => {
    await assertCapability("clients:share");

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.rpc("issue_candidate_portal_token", {
      p_candidate_id: candidateId,
    });
    if (error) throw new Error(error.message);

    type Row = { token_id: string; portal_token: string; expires_at: string };
    const row = ((data ?? []) as Row[])[0];
    if (!row) throw new Error("The link could not be issued.");

    return {
      url: `${siteUrl()}/candidate/${row.portal_token}`,
      expiresAt: row.expires_at,
    };
  });
}
