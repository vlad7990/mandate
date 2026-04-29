"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export type PickerCandidate = {
  id: string;
  full_name: string;
  current_title: string | null;
  current_company: string | null;
  rank: number | null;
  overall: number | null;
  tier: string | null;
};

type Props = {
  projectId: string;
  candidates: PickerCandidate[];
  initialSelection: string[];
};

const MIN_SELECTION = 2;
const MAX_SELECTION = 3;

export function ComparisonPicker({
  projectId,
  candidates,
  initialSelection,
}: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(initialSelection.filter((id) => candidates.some((c) => c.id === id)))
  );
  const [isPending, startTransition] = useTransition();

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (next.size >= MAX_SELECTION) {
          toast.info(`Maximum ${MAX_SELECTION} candidates per comparison.`);
          return prev;
        }
        next.add(id);
      }
      return next;
    });
  };

  const selectionArray = useMemo(() => Array.from(selected), [selected]);
  const ready = selectionArray.length >= MIN_SELECTION;

  const handleCompare = () => {
    if (!ready) {
      toast.error(`Select at least ${MIN_SELECTION} candidates.`);
      return;
    }
    startTransition(() => {
      const url = `/projects/${projectId}/ranking/compare?ids=${selectionArray.join(",")}`;
      router.push(url);
      router.refresh();
    });
  };

  if (candidates.length < MIN_SELECTION) {
    return (
      <div className="bg-surface-container-low border border-outline-variant p-6 text-body-main text-on-surface-variant">
        Need at least {MIN_SELECTION} ranked candidates to run a comparison.
        Score more candidates from the ranking page first.
      </div>
    );
  }

  return (
    <div className="bg-surface-container-low border border-outline-variant p-5 space-y-4">
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <h2 className="font-mono-label text-mono-label text-primary uppercase tracking-widest flex items-center gap-2">
          <span className="material-symbols-outlined text-[14px]">checklist</span>
          Pick 2–3 candidates
        </h2>
        <span className="font-mono-label text-mono-label text-outline uppercase tracking-wider">
          {selected.size} / {MAX_SELECTION} selected
        </span>
      </div>
      <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {candidates.map((c) => {
          const isSelected = selected.has(c.id);
          return (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => toggle(c.id)}
                className={cn(
                  "w-full text-left p-3 border transition-colors flex items-center justify-between gap-3",
                  isSelected
                    ? "border-primary-container bg-primary-container/10"
                    : "border-outline-variant hover:border-primary"
                )}
                aria-pressed={isSelected}
              >
                <div className="min-w-0">
                  <div className="text-on-surface text-body-main font-semibold truncate">
                    {c.full_name}
                  </div>
                  <div className="font-mono-data text-body-main text-on-surface-variant truncate">
                    {c.current_title ?? "—"}
                    {c.current_company ? ` @ ${c.current_company}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {c.rank != null && (
                    <span className="font-mono-label text-mono-label text-outline uppercase tracking-wider">
                      #{String(c.rank).padStart(2, "0")}
                    </span>
                  )}
                  {c.overall != null && (
                    <span className="font-h2 text-h2 text-primary tabular-nums">
                      {c.overall.toFixed(1)}
                    </span>
                  )}
                  <span
                    className={cn(
                      "material-symbols-outlined text-[16px]",
                      isSelected ? "text-primary" : "text-outline"
                    )}
                    style={
                      isSelected
                        ? { fontVariationSettings: "'FILL' 1" }
                        : undefined
                    }
                  >
                    {isSelected ? "check_circle" : "radio_button_unchecked"}
                  </span>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleCompare}
          disabled={!ready || isPending}
          aria-busy={isPending ? true : undefined}
          className="px-6 py-3 bg-primary-container text-on-primary-container font-mono-label text-mono-label uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-all flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <span
            className={cn(
              "material-symbols-outlined text-[14px]",
              isPending && "animate-spin"
            )}
          >
            {isPending ? "progress_activity" : "compare_arrows"}
          </span>
          {isPending ? "Loading" : "Run Comparison"}
        </button>
      </div>
    </div>
  );
}
