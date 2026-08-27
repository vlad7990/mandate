"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { requireActionContext } from "@/lib/auth/access";
import { runAction } from "@/lib/actions/run";
import type { ActionResult } from "@/lib/actions/result";

/** Sentence subject for a failure this file did not author. See `runAction`. */
const SUBJECT = "The workspace settings";

/**
 * §182 slice F — the advisory-mode switch.
 *
 * Org-level and explicit by ruling: `is_founder` is the platform-operator
 * bit (deliberately not a role), and inferring the mode from org
 * composition would let one member's role change silently flip how every
 * evaluation in the workspace reads. An admin throws the switch, or
 * nothing changes.
 *
 * RLS is the boundary: `organizations_role_update` admits admins of
 * their own org and nobody else. The `org:manage` check here is the
 * polite refusal in front of it.
 */
export async function setAdvisoryModeAction(
  enabled: boolean
): Promise<ActionResult<{ advisory_mode: boolean }>> {
  return runAction(SUBJECT, async () => {
    const auth = await requireActionContext("org:manage");
    const supabase = await createServerSupabaseClient();

    const { data, error } = await supabase
      .from("organizations")
      .update({ advisory_mode: enabled, updated_at: new Date().toISOString() })
      .eq("id", auth.organizationId)
      .select("advisory_mode")
      .single<{ advisory_mode: boolean }>();

    if (error || !data) {
      throw new Error(
        `Failed to update advisory mode: ${error?.message ?? "no row"}`
      );
    }

    revalidatePath("/app/settings");
    return { advisory_mode: data.advisory_mode };
  });
}
