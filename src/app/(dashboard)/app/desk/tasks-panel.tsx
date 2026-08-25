"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { unwrap } from "@/lib/actions/result";
import type { DeskTask } from "@/lib/desk/rollup";
import {
  cancelTaskAction,
  completeTaskAction,
  createTaskAction,
  reassignTaskAction,
} from "./actions";

const inputClass =
  "bg-surface-container-low border border-outline-variant px-3 py-2 text-body-main text-on-surface placeholder:text-outline focus:border-primary focus:ring-0 outline-none transition-colors";

/**
 * The desk's task board (106): create, assign, reassign, complete,
 * cancel. Open tasks only — done and cancelled rows live in the trail
 * and the row history, not in the working list.
 */
export function TasksPanel({
  tasks,
  members,
  projects,
  today,
}: {
  tasks: DeskTask[];
  members: Array<{ id: string; label: string }>;
  projects: Array<{ id: string; title: string }>;
  /** The server's date (YYYY-MM-DD), so "overdue" agrees with the rollup. */
  today: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);

  const memberLabel = (id: string | null) =>
    id ? members.find((m) => m.id === id)?.label ?? "unknown" : null;
  const projectTitle = (id: string | null) =>
    id ? projects.find((p) => p.id === id)?.title ?? null : null;

  const run = (taskId: string, fn: () => Promise<unknown>, ok: string) => {
    if (busy) return;
    setBusy(taskId);
    start(async () => {
      try {
        await fn();
        toast.success(ok);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "The task change failed.");
      } finally {
        setBusy(null);
      }
    });
  };

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    start(async () => {
      try {
        unwrap(await createTaskAction(formData));
        toast.success("Task created");
        form.reset();
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Create failed.");
      }
    });
  };

  return (
    <section aria-label="Tasks" className="space-y-3">
      <h2 className="font-mono-label text-mono-label uppercase tracking-widest text-on-surface-variant">
        Tasks · {tasks.length} open
      </h2>

      <form
        onSubmit={handleCreate}
        className="flex flex-wrap items-end gap-2 border border-outline-variant bg-surface-container-low px-4 py-3"
      >
        <label className="min-w-[220px] flex-1 space-y-1">
          <span className="font-mono-label text-mono-label uppercase tracking-widest text-outline">
            New task *
          </span>
          <input
            name="title"
            required
            maxLength={140}
            placeholder="e.g. Chase the Meridian reference"
            className={cn(inputClass, "w-full")}
          />
        </label>
        <label className="space-y-1">
          <span className="font-mono-label text-mono-label uppercase tracking-widest text-outline">
            Assignee
          </span>
          <select name="assignee_id" defaultValue="" className={inputClass}>
            <option value="">Unassigned</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="font-mono-label text-mono-label uppercase tracking-widest text-outline">
            Mandate
          </span>
          <select name="project_id" defaultValue="" className={inputClass}>
            <option value="">None</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="font-mono-label text-mono-label uppercase tracking-widest text-outline">
            Due
          </span>
          <input type="date" name="due_on" className={inputClass} />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="btn-notch bg-primary-container px-4 py-2 font-mono-label text-mono-label uppercase tracking-widest text-on-primary-container transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-60"
        >
          {pending ? "Saving…" : "Create"}
        </button>
      </form>

      {tasks.length === 0 ? (
        <p className="border border-outline-variant bg-surface-container-low px-4 py-3 text-body-main text-on-surface-variant">
          Nothing open. Work asked for lands here with its assignee and due
          date; done and cancelled tasks keep their rows and their trail.
        </p>
      ) : (
        <div className="divide-y divide-outline-variant/40 border border-outline-variant">
          {tasks.map((t) => {
            const overdue = t.due_on !== null && t.due_on < today;
            const project = projectTitle(t.project_id);
            return (
              <div
                key={t.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <span className="text-on-surface">{t.title}</span>
                  {project && (
                    <span className="text-on-surface-variant"> · {project}</span>
                  )}
                  <span className="ml-2 font-mono-label text-mono-label uppercase tracking-wider text-outline">
                    {memberLabel(t.assignee_id) ?? "unassigned"}
                  </span>
                  {t.due_on && (
                    <span
                      className={cn(
                        "ml-2 font-mono-data text-mono-data tabular-nums",
                        overdue ? "text-error" : "text-outline"
                      )}
                    >
                      {overdue ? "overdue " : "due "}
                      {t.due_on}
                    </span>
                  )}
                </div>
                <select
                  value={t.assignee_id ?? ""}
                  disabled={busy === t.id}
                  aria-label={`Reassign ${t.title}`}
                  onChange={(e) =>
                    run(
                      t.id,
                      async () =>
                        unwrap(
                          await reassignTaskAction(
                            t.id,
                            e.target.value === "" ? null : e.target.value
                          )
                        ),
                      "Task reassigned"
                    )
                  }
                  className={cn(inputClass, "px-2 py-1 font-mono-label text-[11px] uppercase tracking-wider")}
                >
                  <option value="">Unassigned</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={busy === t.id}
                  onClick={() =>
                    run(
                      t.id,
                      async () => unwrap(await completeTaskAction(t.id)),
                      "Task completed"
                    )
                  }
                  className="font-mono-label text-mono-label uppercase tracking-widest text-outline transition-colors hover:text-primary disabled:opacity-60"
                >
                  Complete
                </button>
                <button
                  type="button"
                  disabled={busy === t.id}
                  onClick={() => {
                    if (!window.confirm(`Cancel "${t.title}"? The row stays, marked cancelled.`)) return;
                    run(
                      t.id,
                      async () => unwrap(await cancelTaskAction(t.id)),
                      "Task cancelled"
                    );
                  }}
                  className="font-mono-label text-mono-label uppercase tracking-widest text-outline transition-colors hover:text-error disabled:opacity-60"
                >
                  Cancel
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
