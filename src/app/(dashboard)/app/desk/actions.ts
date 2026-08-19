"use server";

import { revalidatePath } from "next/cache";
import { assertCapability } from "@/lib/auth/access";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { recordActivity } from "@/lib/activity/record";
import { runAction } from "@/lib/actions/run";
import type { ActionResult } from "@/lib/actions/result";

/** Sentence subject for a failure this file did not author. See `runAction`. */
const SUBJECT = "The reassignment";

/**
 * Move a mandate to a new lead (or clear it to unassigned).
 *
 * The capability check here decides whether the mutation runs; the 064
 * trigger (`guard_lead_recruiter_changes`) is the boundary and enforces the
 * same rule plus the capable-role and in-org tests, so a caller who reaches
 * the database some other way is refused there in the same words.
 */
export async function reassignMandateLeadAction(
  projectId: string,
  newLeadId: string | null
): Promise<ActionResult> {
  return runAction(SUBJECT, async () => {
    await assertCapability("desk:manage");
    const supabase = await createServerSupabaseClient();

    const { data: project, error: pErr } = await supabase
      .from("projects")
      .select("id, title, lead_recruiter_id")
      .eq("id", projectId)
      .single<{ id: string; title: string; lead_recruiter_id: string | null }>();
    if (pErr || !project) throw new Error("Mandate not found.");

    if (project.lead_recruiter_id === newLeadId) return;

    // Labels are captured at the moment of the change so the trail stays
    // true through renames and departures — the actor_label reasoning.
    const ids = [project.lead_recruiter_id, newLeadId].filter(
      (v): v is string => v !== null
    );
    const { data: people } = ids.length
      ? await supabase.from("users").select("id, full_name, email").in("id", ids)
      : { data: [] as { id: string; full_name: string | null; email: string }[] };
    const label = (id: string | null) => {
      if (!id) return null;
      const p = (people ?? []).find((x) => x.id === id);
      return p?.full_name || p?.email || null;
    };

    const { error: uErr } = await supabase
      .from("projects")
      .update({ lead_recruiter_id: newLeadId })
      .eq("id", projectId);
    if (uErr) throw new Error(uErr.message);

    await recordActivity(supabase, {
      eventType: "mandate_reassigned",
      projectId,
      detail: {
        from_user_id: project.lead_recruiter_id,
        to_user_id: newLeadId,
        from_label: label(project.lead_recruiter_id),
        to_label: label(newLeadId),
        title: project.title,
      },
    });

    revalidatePath("/app/desk");
    revalidatePath(`/app/projects/${projectId}`);
  });
}
