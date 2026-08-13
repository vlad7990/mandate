"use client";

import { useState } from "react";

/**
 * The candidate dossier — comp 10.
 *
 * The comp's brief was that thirty-nine controls on one scroll become five
 * tabs and one persistent decision rail, and the rule underneath it is the
 * part that matters: **reading material is tabbed, the write actions never
 * move.** Stage and feedback live in the rail, visible from every tab,
 * because they are what a recruiter does daily; everything a recruiter
 * *reads* is one tab away.
 *
 * The page owns every query and passes finished nodes in. That keeps the
 * client boundary at exactly one component — the tab state — instead of
 * pulling the whole dossier into the browser bundle, and it means the tab
 * contents are still server-rendered.
 *
 * Tabs with nothing in them are not rendered. An agent that has not run
 * should not leave an empty room with a label on the door.
 */

export type CandidateTab = {
  id: string;
  label: string;
  /** Omitted or null ⇒ the tab is not shown at all. */
  content: React.ReactNode;
};

export function CandidateView({
  identity,
  rail,
  tabs,
  notices,
}: {
  identity: React.ReactNode;
  rail: React.ReactNode;
  tabs: CandidateTab[];
  /** Parse failures and in-flight banners — above everything, never tabbed. */
  notices?: React.ReactNode;
}) {
  const shown = tabs.filter((t) => t.content);
  const [active, setActive] = useState(shown[0]?.id ?? "");
  const current = shown.find((t) => t.id === active) ?? shown[0];

  return (
    <div className="mx-auto max-w-[1600px] px-6 py-6">
      {notices}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          {identity}

          <div
            role="tablist"
            aria-label="Candidate sections"
            className="mt-5 flex flex-wrap items-end gap-6 border-b border-outline-variant"
          >
            {shown.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={`tab-${t.id}`}
                aria-selected={current?.id === t.id}
                aria-controls={`panel-${t.id}`}
                onClick={() => setActive(t.id)}
                // Uppercase mono to match the mandate workspace's tab strip
                // one level up — the two sit in the same navigation position
                // and read as the same control, so they should not disagree
                // about their own voice.
                className={`relative -mb-px min-h-11 border-0 bg-transparent px-0.5 pb-3 font-mono-label text-mono-label uppercase tracking-widest transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${
                  current?.id === t.id
                    ? "text-on-surface"
                    : "text-outline hover:text-on-surface-variant"
                }`}
              >
                {t.label}
                {current?.id === t.id && (
                  <span
                    aria-hidden
                    className="absolute inset-x-0 -bottom-px h-0.5 bg-primary"
                  />
                )}
              </button>
            ))}
          </div>

          {/*
            One panel is mounted at a time. The alternative — rendering all
            five and hiding four — keeps every agent panel's state alive
            across tab switches, but it also puts five stateful clients in
            the tree at once, and the panels here each poll or hold a draft.
          */}
          {current && (
            <div
              role="tabpanel"
              id={`panel-${current.id}`}
              aria-labelledby={`tab-${current.id}`}
              className="mt-5 flex flex-col gap-[18px]"
            >
              {current.content}
            </div>
          )}
        </div>

        {/* The decision rail. Stays put across every tab. */}
        <aside className="flex flex-col gap-5 self-start border border-outline-variant bg-surface-container-lowest p-5 xl:sticky xl:top-6">
          {rail}
        </aside>
      </div>
    </div>
  );
}
