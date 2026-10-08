"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { suggestFromPoolAction, type PoolSuggestion } from "./actions";
import { addPersonToProjectAction } from "../../../candidates/network/actions";
import { IconRefresh, IconSpark } from "@/components/icons";
import { unwrap } from "@/lib/actions/result";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/**
 * "Suggest from our pool" (§200 slice 3).
 *
 * §196's doctrine, applied to people instead of scoring dimensions: the
 * agent AUTHORS the proposal and a human APPROVES it. Nothing here is
 * added until somebody ticks a box — a suggestion scores nothing, sits in
 * no pipeline, and disappears if the page is closed.
 *
 * Adding routes through `addPersonToProjectAction`, which has existed
 * since the Network screen and already does the hard, careful half: it
 * copies the parsed profile and the CV bytes, STRIPS the other mandate's
 * evaluation, positioning and psychology, re-parses against THIS role's
 * calibration and re-scores. Writing a second copy path would have been a
 * second place for that rule to rot.
 */
export function PoolSuggestionsPanel({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [asking, startAsking] = useTransition();
  const [adding, setAdding] = useState(false);
  const [suggestions, setSuggestions] = useState<PoolSuggestion[] | null>(null);
  const [trawl, setTrawl] = useState<string | null>(null);
  const [intent, setIntent] = useState<string | null>(null);
  /** §206 D3 — set only when the ceiling cut somebody out of the read. */
  const [judgedNote, setJudgedNote] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  function ask() {
    startAsking(async () => {
      try {
        const result = unwrap(await suggestFromPoolAction(projectId));
        setPicked(new Set());
        if (result.status === "no_calibration") {
          setSuggestions(null);
          setTrawl(null);
          setIntent(null);
          setJudgedNote(null);
          setNote(
            "This mandate has no scoring model yet, so there is no role to " +
              "match anyone against. Run onboarding first."
          );
          return;
        }
        if (result.status === "empty_pool") {
          setSuggestions([]);
          setTrawl(result.trawl);
          setIntent(null);
          setJudgedNote(null);
          setNote(
            "Nothing to draw on — every CV in reach is already on this " +
              "mandate, or there are none yet."
          );
          return;
        }
        setSuggestions(result.suggestions);
        setTrawl(result.trawl);
        setIntent(result.intent);
        setJudgedNote(result.judgedNote);
        setNote(
          result.suggestions.length === 0
            ? "The agent found nobody in reach worth proposing for this role."
            : null
        );
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "The suggestion failed.";
        toast.error(message);
      }
    });
  }

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function addPicked() {
    if (picked.size === 0 || adding) return;
    setAdding(true);
    let added = 0;
    const failures: string[] = [];

    // One at a time and sequentially: each add copies a CV, re-parses it
    // and re-scores the mandate. Firing them together would race the
    // ranker against itself.
    for (const id of picked) {
      const person = suggestions?.find((s) => s.candidateId === id);
      try {
        unwrap(await addPersonToProjectAction(id, projectId));
        added += 1;
      } catch (err) {
        // Per person, not per batch: someone already on the mandate must
        // not cost the rest of the selection.
        const message =
          err instanceof Error ? err.message : "The add failed.";
        failures.push(`${person?.fullName ?? "Someone"}: ${message}`);
      }
    }

    setAdding(false);
    if (added > 0) {
      toast.success(
        `${added} ${added === 1 ? "person" : "people"} added — each is being re-read against this role.`
      );
      setSuggestions(
        (prev) => prev?.filter((s) => !picked.has(s.candidateId)) ?? null
      );
      setPicked(new Set());
      router.refresh();
    }
    for (const failure of failures) toast.error(failure);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          onClick={ask}
          disabled={asking || adding}
          aria-busy={asking ? true : undefined}
          className="flex gap-2 disabled:opacity-50"
        >
          {asking ? (
            <IconRefresh size={14} className="animate-spin" />
          ) : (
            <IconSpark size={14} />
          )}
          {suggestions === null ? "Suggest from our pool" : "Ask again"}
        </Button>

        {trawl && (
          <p className="font-mono-label text-mono-label uppercase tracking-widest text-outline">
            Drew on: {trawl}
          </p>
        )}
      </div>

      {intent && (
        <p className="text-body-main leading-relaxed text-on-surface-variant">
          <span className="text-outline">Searched for:</span> {intent}
        </p>
      )}

      {/*
        §206 D3 — the ceiling, stated where the slate is read. A cut list
        that does not say it was cut reads as the whole pool's answer.
      */}
      {judgedNote && (
        <p className="border-l-2 border-warn/60 bg-warn/5 px-3 py-2 text-body-main leading-relaxed text-on-surface-variant">
          {judgedNote}
        </p>
      )}

      {note && (
        <p className="text-body-main leading-relaxed text-on-surface-variant">
          {note}
        </p>
      )}

      {suggestions && suggestions.length > 0 && (
        <>
          <ul className="divide-y divide-outline-variant/60 border border-outline-variant">
            {suggestions.map((s) => {
              const checked = picked.has(s.candidateId);
              return (
                <li key={s.candidateId}>
                  <label
                    className={cn(
                      "flex cursor-pointer items-start gap-3 px-3 py-3 transition-colors",
                      checked ? "bg-primary-container/10" : "hover:bg-surface-container"
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={adding}
                      onChange={() => toggle(s.candidateId)}
                      className="mt-1 shrink-0 accent-[var(--color-primary)]"
                    />
                    <span className="min-w-0 flex-1 space-y-1">
                      <span className="flex flex-wrap items-baseline gap-2">
                        <span className="text-body-main font-semibold text-on-surface">
                          {s.fullName}
                        </span>
                        {s.currentTitle && (
                          <span className="text-body-main text-on-surface-variant">
                            {s.currentTitle}
                            {s.currentCompany ? ` · ${s.currentCompany}` : ""}
                          </span>
                        )}
                        {s.fromMandate && (
                          <span className="border border-outline-variant px-2 py-0.5 font-mono-label text-mono-label uppercase tracking-widest text-outline">
                            from {s.fromMandate}
                          </span>
                        )}
                      </span>
                      <span className="block text-body-main leading-relaxed text-on-surface-variant">
                        {s.reasoning}
                      </span>
                    </span>
                    <span className="shrink-0 font-mono-data text-on-surface tabular-nums">
                      {s.matchScore}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="primary"
              size="md"
              type="button"
              onClick={addPicked}
              disabled={picked.size === 0 || adding}
              aria-busy={adding ? true : undefined}
              className="flex gap-2 text-[11px] font-semibold tracking-[0.1em] disabled:opacity-40"
            >
              {adding && <IconRefresh size={14} className="animate-spin" />}
              Add {picked.size > 0 ? picked.size : ""}{" "}
              {picked.size === 1 ? "person" : "people"}
            </Button>

            {/* The bill and the consequence, before the click. */}
            <p className="font-mono-label text-mono-label uppercase tracking-widest text-outline tabular-nums">
              {picked.size === 0
                ? "tick the ones worth adding"
                : `${picked.size} ${picked.size === 1 ? "CV is" : "CVs are"} re-read and re-scored against this role`}
            </p>
          </div>

          <p className="text-body-main leading-relaxed text-outline">
            A suggestion scores nothing. Adding someone copies their CV and
            parsed profile onto this mandate and scores it here — the other
            mandate&apos;s evaluation does not come with them, because it
            was made against a different role.
          </p>
        </>
      )}
    </div>
  );
}
