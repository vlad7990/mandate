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

/**
 * Generate the desk digest — one Anthropic call across the whole desk
 * (never one per mandate; per-mandate depth is the weekly report's job).
 * The MANAGER's session builds the rollup it lawfully holds under
 * desk:manage and hands it to the DESK DIGEST AGENT's seam (082, the
 * §35 parser split generalised); the agent judges, appends the
 * desk_digests row under its own name, and records the event. The
 * newest row is canonical.
 */
export async function generateDeskDigestAction(): Promise<ActionResult> {
  return runAction("The desk digest", async () => {
    const access = await assertCapability("desk:manage");
    if (!access.organizationId) throw new Error("No organization on the account.");
    const supabase = await createServerSupabaseClient();

    const { loadDeskRollup } = await import("@/lib/desk/rollup");
    const { runDeskDigestAndPersist } = await import(
      "@/lib/ai/desk-digest-agent"
    );

    const rollup = await loadDeskRollup(supabase);
    const [{ data: org }, { count: priorDigests }] = await Promise.all([
      supabase.from("organizations").select("name").single<{ name: string }>(),
      supabase
        .from("desk_digests")
        .select("id", { count: "exact", head: true }),
    ]);

    const run = await runDeskDigestAndPersist(
      {
        organization_name: org?.name ?? "the organization",
        generated_for_week_of: new Date().toISOString().slice(0, 10),
        members: rollup.desks.map((d) => ({
          name: d.member.full_name || d.member.email,
          role: d.member.role,
          active_mandates: d.led.map((p) => ({
            title: p.title,
            company: p.company_name,
            status: p.status,
            candidate_count: rollup.candidateCountByProject.get(p.id) ?? 0,
            health: null,
          })),
          placements_total: d.placementsTotal,
          placements_started: d.placementsStarted,
          last_activity_at: d.lastSeen,
        })),
        unassigned_mandates: rollup.unassigned.map((p) => ({
          title: p.title,
          company: p.company_name,
        })),
      },
      { replacedExisting: (priorDigests ?? 0) > 0 }
    );

    if (run.status === "agent_unavailable") {
      throw new Error(
        "The Desk Digest Agent could not run — an operator has suspended it " +
          "or its credentials are absent. The previous digest stands."
      );
    }
    if (run.status !== "ready") {
      throw new Error("Could not generate the desk digest. Try again.");
    }

    revalidatePath("/app/desk");
  });
}
