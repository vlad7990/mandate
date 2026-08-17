"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { addPersonToProjectAction } from "./actions";
import {
  IconArrowRight,
  IconClose,
  IconRefresh,
  IconUserPlus,
} from "@/components/icons";
import type {
  NetworkPerson,
  NetworkProject,
} from "@/lib/network/network-aggregator";
import { unwrap } from "@/lib/actions/result";

export function AddToSearchButton({
  person,
  activeProjects,
  variant = "ghost",
}: {
  person: NetworkPerson;
  activeProjects: NetworkProject[];
  variant?: "ghost" | "primary";
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={activeProjects.length === 0}
        title={
          activeProjects.length === 0
            ? "No active projects in your org."
            : "Add to an active search"
        }
        className={cn(
          "px-3 py-1.5 font-mono-label text-mono-label uppercase tracking-widest flex items-center gap-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
          variant === "primary"
            ? "bg-primary-container text-on-primary-container hover:brightness-110 active:scale-[0.98] transition-[filter,transform]"
            : "border border-outline-variant text-on-surface-variant hover:border-primary hover:text-primary"
        )}
      >
        <IconUserPlus size={14} />
        Add to Search
      </button>
      {open && (
        <AddToSearchModal
          person={person}
          activeProjects={activeProjects}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function AddToSearchModal({
  person,
  activeProjects,
  onClose,
}: {
  person: NetworkPerson;
  activeProjects: NetworkProject[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [filter, setFilter] = useState("");

  // Lock background scroll while modal is open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const projectsInPerson = useMemo(
    () => new Set(person.appearances.map((a) => a.project_id)),
    [person.appearances]
  );

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return activeProjects.filter((p) => {
      if (projectsInPerson.has(p.id)) return false;
      if (q.length === 0) return true;
      return (
        p.title.toLowerCase().includes(q) ||
        p.company_name.toLowerCase().includes(q)
      );
    });
  }, [activeProjects, filter, projectsInPerson]);

  const handleAdd = (projectId: string, projectTitle: string) => {
    if (pending) return;
    start(async () => {
      try {
        unwrap(await addPersonToProjectAction(
          person.canonical_candidate_id,
          projectId
        ));
        toast.success(`Added to ${projectTitle}`);
        router.refresh();
        onClose();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Add failed.";
        toast.error(msg);
      }
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-to-search-title"
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-surface/80 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg bg-surface-container border border-outline-variant max-h-[80vh] flex flex-col overflow-hidden">
        <header className="px-5 py-3 border-b border-outline-variant bg-surface-container-high flex items-center justify-between gap-3">
          <h3
            id="add-to-search-title"
            className="font-mono-label text-mono-label text-primary uppercase tracking-widest flex items-center gap-2"
          >
            <IconUserPlus size={14} />
            Add {person.full_name} to Search
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-7 h-7 border border-outline-variant text-outline hover:text-error hover:border-error transition-colors flex items-center justify-center focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-error"
          >
            <IconClose size={14} />
          </button>
        </header>

        <div className="px-5 py-3 border-b border-outline-variant space-y-2">
          <p className="font-mono-label text-mono-label text-outline uppercase tracking-widest leading-snug">
            Pick an active project. The candidate&rsquo;s CV will be re-parsed
            against the target project&rsquo;s calibration model in the
            background. Project-specific overlays (evaluation, positioning,
            psychology) are NOT copied — they regenerate against the new role.
          </p>
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter projects"
            className="w-full bg-surface-container-lowest border border-outline-variant px-3 py-2 text-on-surface focus:border-primary focus:outline-none transition-colors"
          />
        </div>

        <ul className="overflow-auto divide-y divide-outline-variant">
          {visible.length === 0 ? (
            <li className="px-5 py-6 text-center font-mono-label text-mono-label text-outline italic uppercase tracking-widest">
              {projectsInPerson.size === activeProjects.length
                ? "Already in every active project."
                : "No projects match the filter."}
            </li>
          ) : (
            visible.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => handleAdd(p.id, p.title)}
                  disabled={pending}
                  className="w-full text-left px-5 py-3 hover:bg-surface-container-high transition-colors disabled:opacity-60 focus-visible:outline-none focus-visible:bg-surface-container-high focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary flex items-center justify-between gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-mono-data text-body-main text-on-surface font-semibold truncate">
                      {p.title}
                    </div>
                    <div className="font-mono-label text-mono-label text-outline uppercase tracking-widest truncate">
                      {p.company_name}
                    </div>
                  </div>
                  {pending ? (
                    <IconRefresh
                      size={18}
                      className="text-primary shrink-0 animate-spin"
                    />
                  ) : (
                    <IconArrowRight size={18} className="text-primary shrink-0" />
                  )}
                </button>
              </li>
            ))
          )}
        </ul>

        <footer className="px-5 py-3 border-t border-outline-variant bg-surface-container-low font-mono-label text-mono-label text-outline uppercase tracking-widest text-center">
          {visible.length} eligible project{visible.length === 1 ? "" : "s"} ·
          {" "}
          {projectsInPerson.size > 0
            ? `Already in ${projectsInPerson.size}`
            : "Not in any project yet"}
        </footer>
      </div>
    </div>
  );
}
