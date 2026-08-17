"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { requireActionContext } from "@/lib/auth/access";
import { parseRole } from "@/lib/auth/roles";
import { runAction } from "@/lib/actions/run";
import type { ActionResult } from "@/lib/actions/result";

/** Sentence subject for a failure this file did not author. See `runAction`. */
const SUBJECT = "The role change";

/**
 * Changing a colleague's role.
 *
 * This is the one place in the product that writes `users.role`, and it is
 * the reason the column now means something. It sits with the org admin
 * rather than with the founder: a customer administers their own team, and
 * `is_founder` stays Mandate's own flag.
 *
 * Three guards, deliberately in three different places:
 *
 *   1. `org:manage` here, so the action refuses before it touches the row.
 *   2. `admins_can_update_org_users` in RLS, so a hand-rolled PostgREST call
 *      from a recruiter's browser refuses too.
 *   3. `guard_user_privilege_changes` as a trigger, because RLS cannot say
 *      *which columns* an update may touch — without it an admin inside the
 *      policy could set `is_founder = true` on themselves.
 *
 * Both migration 046.
 */
export async function setMemberRoleAction(
  targetUserId: string,
  nextRole: string
): Promise<ActionResult> {
  return runAction(SUBJECT, async () => {
    const actor = await requireActionContext("org:manage");

    const role = parseRole(nextRole);
    if (!role) {
      throw new Error(`Not a role: ${nextRole}`);
    }

    const supabase = await createServerSupabaseClient();

    const { data: target, error: readError } = await supabase
      .from("users")
      .select("id, organization_id, is_founder, role, full_name, email")
      .eq("id", targetUserId)
      .single<{
        id: string;
        organization_id: string | null;
        is_founder: boolean;
        role: string | null;
        full_name: string | null;
        email: string;
      }>();

    if (readError || !target) {
      throw new Error("That member is not visible from your organisation.");
    }

    // Checked here as well as in RLS because the error a person reads should
    // say what went wrong, and a policy denial arrives as zero rows updated.
    if (target.organization_id !== actor.organizationId) {
      throw new Error("That member belongs to a different organisation.");
    }

    // A Mandate founder sitting inside a customer org is not the customer's to
    // demote. The database would permit it — the row is in reach of
    // `admins_can_update_org_users` — so the rule is stated here.
    if (target.is_founder) {
      throw new Error(
        "Founder accounts are managed by Mandate and cannot be changed here."
      );
    }

    if (parseRole(target.role) === role) {
      return; // Nothing to do; don't spend a write or a revalidation on it.
    }

    // `.select()` on the update is what turns a policy denial into something
    // the caller can see. A trigger raises and lands in `updateError`, but RLS
    // refusing the row is silent — the statement succeeds and touches nothing.
    // Without the returned row this action would report success on a write
    // that never happened.
    const { data: updated, error: updateError } = await supabase
      .from("users")
      .update({ role, updated_at: new Date().toISOString() })
      .eq("id", targetUserId)
      .select("id");

    if (updateError) {
      // The last-admin trigger raises with a readable message; pass it
      // through rather than replacing it with something vaguer.
      throw new Error(updateError.message);
    }

    if (!updated || updated.length === 0) {
      throw new Error(
        "The change was refused. You may no longer have admin access to this organisation."
      );
    }

    revalidatePath("/app/settings/members");
    revalidatePath("/app/settings");
  });
}
