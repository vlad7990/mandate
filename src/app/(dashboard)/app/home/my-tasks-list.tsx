"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { IconChecklist } from "@/components/icons";
import { unwrap } from "@/lib/actions/result";
import { completeTaskAction } from "../desk/actions";

type MyTask = {
  id: string;
  title: string;
  detail: string;
  due_on: string | null;
  project_id: string | null;
  project_title: string | null;
};

export function MyTasksList({
  tasks,
  today,
}: {
  tasks: MyTask[];
  today: string;
}) {
  const router = useRouter();
  const [, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);

  const complete = (task: MyTask) => {
    if (busy) return;
    setBusy(task.id);
    start(async () => {
      try {
        unwrap(await completeTaskAction(task.id));
        toast.success(`Completed "${task.title}"`);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Complete failed.");
      } finally {
        setBusy(null);
      }
    });
  };

  return (
    <section id="my-tasks" aria-label="My tasks" className="space-y-3">
      <header className="flex items-baseline justify-between gap-3">
        <h2 className="flex items-center gap-2 font-mono-label text-mono-label uppercase tracking-widest text-primary">
          <IconChecklist size={14} />
          MY_TASKS · assigned to you
        </h2>
        <span className="font-mono-label text-mono-label uppercase tracking-widest tabular-nums text-on-surface-variant">
          {tasks.length} open
        </span>
      </header>
      <ul className="divide-y divide-outline-variant/40 border border-outline-variant bg-surface-container-low">
        {tasks.map((t) => {
          const overdue = t.due_on !== null && t.due_on < today;
          return (
            <li key={t.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-body-main text-on-surface">{t.title}</p>
                <p className="font-mono-label text-mono-label uppercase tracking-widest text-outline">
                  {t.project_id && t.project_title ? (
                    <Link
                      href={`/app/projects/${t.project_id}`}
                      prefetch={false}
                      className="transition-colors hover:text-primary"
                    >
                      {t.project_title}
                    </Link>
                  ) : (
                    "your desk"
                  )}
                  {t.due_on && (
                    <span className={cn("ml-2 tabular-nums", overdue && "text-error")}>
                      {overdue ? "· overdue " : "· due "}
                      {t.due_on}
                    </span>
                  )}
                </p>
                {t.detail && (
                  <p className="mt-1 text-body-s text-on-surface-variant">{t.detail}</p>
                )}
              </div>
              <button
                type="button"
                disabled={busy === t.id}
                onClick={() => complete(t)}
                className="border border-outline-variant px-3 py-1.5 font-mono-label text-mono-label uppercase tracking-widest text-on-surface-variant transition-colors hover:border-primary hover:text-primary disabled:opacity-60"
              >
                {busy === t.id ? "Completing…" : "Complete"}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
