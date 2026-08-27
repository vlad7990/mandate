"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { requireActionContext } from "@/lib/auth/access";
import { runAction } from "@/lib/actions/run";
import type { ActionResult } from "@/lib/actions/result";

/** Sentence subject for a failure this file did not author. See `runAction`. */
const SUBJECT = "The applications door";

/**
 * §190 — the recruiter's switch on the apply link. Minting writes a
 * fresh uuid (an old link dies the moment a new one is minted);
 * closing nulls it. Both ride the existing projects_role_update RLS —
 * mandates:write is the gate, here and in the policy.
 */
export async function setApplicationsOpenAction(
  projectId: string,
  open: boolean
): Promise<ActionResult<{ apply_token: string | null }>> {
  return runAction(SUBJECT, async () => {
    if (!projectId) throw new Error("Missing projectId.");
    const auth = await requireActionContext("mandates:write");
    const supabase = await createServerSupabaseClient();

    const { data, error } = await supabase
      .from("projects")
      .update({
        apply_token: open ? randomUUID() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", projectId)
      .eq("organization_id", auth.organizationId)
      .select("apply_token")
      .single<{ apply_token: string | null }>();

    if (error || !data) {
      throw new Error(`Could not update applications: ${error?.message ?? "no row"}`);
    }

    revalidatePath(`/app/projects/${projectId}`);
    return { apply_token: data.apply_token };
  });
}
