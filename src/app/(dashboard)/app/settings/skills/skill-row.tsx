"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { deleteSkillAction, toggleSkillActiveAction } from "./actions";

export type SkillRowData = {
  id: string;
  name: string;
  description: string;
  skill_type: "role_skill" | "client_skill" | "search_skill";
  trigger_conditions: string;
  instructions: string;
  is_active: boolean;
  applies_to_project_id: string | null;
  applies_to_project_title: string | null;
  updated_at: string;
};

export function SkillRow({ skill }: { skill: SkillRowData }) {
  const router = useRouter();
  const [togglePending, startToggle] = useTransition();
  const [deletePending, startDelete] = useTransition();

  const handleToggle = () => {
    if (togglePending) return;
    startToggle(async () => {
      try {
        await toggleSkillActiveAction(skill.id, !skill.is_active);
        toast.success(skill.is_active ? "Skill paused" : "Skill activated");
        router.refresh();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Toggle failed.";
        toast.error(msg);
      }
    });
  };

  const handleDelete = () => {
    if (deletePending) return;
    if (
      !window.confirm(
        `Delete skill "${skill.name}"? This cannot be undone.`
      )
    ) {
      return;
    }
    startDelete(async () => {
      try {
        await deleteSkillAction(skill.id);
        toast.success("Skill deleted");
        router.refresh();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Delete failed.";
        toast.error(msg);
      }
    });
  };

  return (
    <li
      className={cn(
        "bg-surface-container-low border border-outline-variant transition-colors",
        skill.is_active ? "" : "opacity-60"
      )}
    >
      <div className="flex items-start gap-4 px-4 py-3 flex-wrap">
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-baseline gap-2 flex-wrap">
            <h3 className="font-h2 text-h2 text-on-surface truncate">
              {skill.name}
            </h3>
            <span
              className={cn(
                "px-2 py-0.5 border font-mono-label text-mono-label uppercase tracking-widest",
                skill.is_active
                  ? "border-secondary-fixed-dim/60 bg-secondary-fixed-dim/10 text-secondary-fixed-dim"
                  : "border-outline-variant text-outline"
              )}
            >
              {skill.is_active ? "Active" : "Paused"}
            </span>
            {skill.applies_to_project_title && (
              <span className="px-2 py-0.5 border border-primary-container/60 bg-primary-container/10 text-primary font-mono-label text-mono-label uppercase tracking-widest">
                Project · {skill.applies_to_project_title}
              </span>
            )}
          </div>
          {skill.description && (
            <p className="text-body-main text-on-surface-variant">
              {skill.description}
            </p>
          )}
          {skill.trigger_conditions && (
            <p className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
              <span className="text-tertiary">Fires when:</span>{" "}
              <span className="normal-case tracking-normal text-on-surface-variant font-mono-data">
                {skill.trigger_conditions}
              </span>
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleToggle}
            disabled={togglePending}
            aria-busy={togglePending ? true : undefined}
            className="px-3 py-1.5 border border-outline-variant text-on-surface-variant font-mono-label text-mono-label uppercase tracking-widest hover:border-primary hover:text-primary transition-colors flex items-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <span className="material-symbols-outlined text-[14px]" aria-hidden>
              {skill.is_active ? "pause" : "play_arrow"}
            </span>
            {skill.is_active ? "Pause" : "Activate"}
          </button>
          <Link
            href={`/app/settings/skills/${skill.id}`}
            prefetch={false}
            className="px-3 py-1.5 border border-outline-variant text-on-surface-variant font-mono-label text-mono-label uppercase tracking-widest hover:border-primary hover:text-primary transition-colors flex items-center gap-1.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <span className="material-symbols-outlined text-[14px]" aria-hidden>
              edit
            </span>
            Edit
          </Link>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deletePending}
            aria-busy={deletePending ? true : undefined}
            className="px-3 py-1.5 border border-outline-variant text-outline hover:border-error hover:text-error transition-colors font-mono-label text-mono-label uppercase tracking-widest flex items-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-error"
          >
            <span className="material-symbols-outlined text-[14px]" aria-hidden>
              delete
            </span>
            Delete
          </button>
        </div>
      </div>
    </li>
  );
}
