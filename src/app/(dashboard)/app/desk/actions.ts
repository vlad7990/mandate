"use server";

import { revalidatePath } from "next/cache";
import { assertCapability, requireActionContext } from "@/lib/auth/access";
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
          open_tasks: d.openTasks,
          overdue_tasks: d.overdueTasks,
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

// ── The task domain (106) ────────────────────────────────────────────
//
// Creation and (re)assignment are the desk's acts (R4); completion
// belongs to the assignee or the desk — the RLS pin and the guard
// trigger are the boundary, and these actions surface their sentences.
// Labels snapshot at write time (the reassignment precedent above).

const TASK_TITLE_MAX = 140;
const TASK_DETAIL_MAX = 1_000;

async function memberLabel(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  userId: string | null
): Promise<string | null> {
  if (!userId) return null;
  const { data } = await supabase
    .from("users")
    .select("full_name, email")
    .eq("id", userId)
    .maybeSingle<{ full_name: string | null; email: string }>();
  return data?.full_name || data?.email || null;
}

export async function createTaskAction(formData: FormData): Promise<ActionResult> {
  return runAction("The task", async () => {
    const access = await assertCapability("desk:manage");
    const title = String(formData.get("title") ?? "").trim();
    const detail = String(formData.get("detail") ?? "").trim();
    const dueOnRaw = String(formData.get("due_on") ?? "").trim();
    const assigneeRaw = String(formData.get("assignee_id") ?? "").trim();
    const projectRaw = String(formData.get("project_id") ?? "").trim();

    if (!title) throw new Error("Title is required.");
    if (title.length > TASK_TITLE_MAX) {
      throw new Error(`The title is over ${TASK_TITLE_MAX} characters — shorten it.`);
    }
    if (detail.length > TASK_DETAIL_MAX) {
      throw new Error(`The detail is over ${TASK_DETAIL_MAX} characters.`);
    }
    const assigneeId = assigneeRaw === "" ? null : assigneeRaw;
    const projectId = projectRaw === "" ? null : projectRaw;
    const dueOn = dueOnRaw === "" ? null : dueOnRaw;

    const supabase = await createServerSupabaseClient();
    const { data: born, error } = await supabase
      .from("tasks")
      .insert({
        organization_id: access.organizationId,
        project_id: projectId,
        title,
        detail,
        due_on: dueOn,
        assignee_id: assigneeId,
        created_by: access.userId,
      })
      .select("id")
      .maybeSingle<{ id: string }>();
    if (error || !born) {
      throw new Error(`Failed to create task: ${error?.message ?? "nothing was saved"}`);
    }

    if (assigneeId) {
      await recordActivity(supabase, {
        eventType: "task_assigned",
        projectId,
        detail: {
          task_title: title,
          to_user_id: assigneeId,
          to_label: await memberLabel(supabase, assigneeId),
        },
      });
    }

    revalidatePath("/app/desk");
    revalidatePath("/app/home");
  });
}

export async function reassignTaskAction(
  taskId: string,
  newAssigneeId: string | null
): Promise<ActionResult> {
  return runAction("The task", async () => {
    await assertCapability("desk:manage");
    const supabase = await createServerSupabaseClient();

    const { data: task } = await supabase
      .from("tasks")
      .select("id, title, project_id, assignee_id, status")
      .eq("id", taskId)
      .maybeSingle<{
        id: string;
        title: string;
        project_id: string | null;
        assignee_id: string | null;
        status: string;
      }>();
    if (!task) throw new Error("Task not found.");
    if (task.status !== "open") {
      throw new Error(`This task is ${task.status} — reopen work is not a thing; create a new task.`);
    }
    if (task.assignee_id === newAssigneeId) return;

    const { data: landed, error } = await supabase
      .from("tasks")
      .update({ assignee_id: newAssigneeId, updated_at: new Date().toISOString() })
      .eq("id", taskId)
      .select("id")
      .maybeSingle<{ id: string }>();
    if (error || !landed) {
      throw new Error(`Failed to reassign: ${error?.message ?? "nothing was saved"}`);
    }

    if (newAssigneeId) {
      await recordActivity(supabase, {
        eventType: "task_assigned",
        projectId: task.project_id,
        detail: {
          task_title: task.title,
          to_user_id: newAssigneeId,
          to_label: await memberLabel(supabase, newAssigneeId),
        },
      });
    }

    revalidatePath("/app/desk");
    revalidatePath("/app/home");
  });
}

/**
 * Complete a task — the assignee's act, or the desk's. No capability
 * beyond membership: the RLS USING (assignee or desk) decides, the
 * WITH CHECK pins completed_by to the actor, and a zero-row landing
 * is LOUD.
 */
export async function completeTaskAction(taskId: string): Promise<ActionResult> {
  return runAction("The task", async () => {
    const access = await requireActionContext("org:read");
    const supabase = await createServerSupabaseClient();

    const { data: task } = await supabase
      .from("tasks")
      .select("id, title, project_id, status")
      .eq("id", taskId)
      .maybeSingle<{ id: string; title: string; project_id: string | null; status: string }>();
    if (!task) throw new Error("Task not found.");
    if (task.status !== "open") {
      throw new Error(`This task is already ${task.status}.`);
    }

    const { data: landed, error } = await supabase
      .from("tasks")
      .update({
        status: "done",
        completed_at: new Date().toISOString(),
        completed_by: access.userId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", taskId)
      .select("id")
      .maybeSingle<{ id: string }>();
    if (error || !landed) {
      throw new Error(
        error
          ? `Failed to complete: ${error.message}`
          : "Nothing was saved — only the task's assignee or the desk can complete it."
      );
    }

    await recordActivity(supabase, {
      eventType: "task_completed",
      projectId: task.project_id,
      detail: { task_title: task.title },
    });

    revalidatePath("/app/desk");
    revalidatePath("/app/home");
  });
}

export async function cancelTaskAction(taskId: string): Promise<ActionResult> {
  return runAction("The task", async () => {
    await assertCapability("desk:manage");
    const supabase = await createServerSupabaseClient();

    const { data: landed, error } = await supabase
      .from("tasks")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("id", taskId)
      .eq("status", "open")
      .select("id")
      .maybeSingle<{ id: string }>();
    if (error || !landed) {
      throw new Error(
        error
          ? `Failed to cancel: ${error.message}`
          : "Nothing was cancelled — the task is not open, or it does not exist."
      );
    }

    revalidatePath("/app/desk");
    revalidatePath("/app/home");
  });
}
