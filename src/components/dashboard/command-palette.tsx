"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { NAV, NAV_GROUPS } from "./nav-model";
import { IconSearch } from "@/components/icons";
import { cn } from "@/lib/utils";

/**
 * ⌘K palette.
 *
 * The topbar previously carried a `disabled` button labelled
 * "Command_line — coming soon", and the rail carried a second one. A
 * permanently dead control is worse than no control: it occupies the
 * place the real thing would go and teaches the user that the chrome is
 * decorative.
 *
 * Scope is deliberately navigation only, and the empty state says so.
 * Searching mandates and people needs an endpoint that does not exist,
 * and a search box that silently returns nothing for a candidate's name
 * is the same broken promise in a new shape.
 *
 * Built on a plain overlay rather than adding `cmdk` — the entire
 * behaviour is a filter over a static list.
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((wasOpen) => !wasOpen);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-[34px] min-w-0 items-center gap-2 rounded-lg border border-outline-variant bg-surface-container-low px-3 text-left transition-colors hover:border-outline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary sm:min-w-[240px] lg:min-w-[280px]"
      >
        <IconSearch size={15} className="shrink-0 text-outline" />
        <span className="hidden truncate text-[13px] text-outline sm:inline">
          Jump to…
        </span>
        <kbd className="ml-auto hidden shrink-0 rounded border border-outline-variant px-1.5 py-0.5 font-mono-label text-[11px] text-outline sm:inline">
          ⌘K
        </kbd>
      </button>

      {/*
        The dialog owns the query and the cursor, so closing unmounts
        them and reopening is clean. Resetting from the parent instead
        meant writing that state inside a `setOpen` updater, and React
        may run an updater twice — state changes do not belong in one.
      */}
      {open && <PaletteDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function PaletteDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = NAV.map((item) => ({
      href: item.href,
      label: item.label,
      group: NAV_GROUPS.find((g) => g.key === item.group)?.label ?? "",
    }));
    if (!q) return all;
    return all.filter(
      (r) =>
        r.label.toLowerCase().includes(q) || r.group.toLowerCase().includes(q)
    );
  }, [query]);

  // Derived, not stored: filtering can shorten the list under the
  // cursor, and a stored index would point past the end for a paint.
  const cursor = Math.min(index, Math.max(0, results.length - 1));

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Keep the highlighted row visible when arrowing past the fold.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  function go(href: string) {
    onClose();
    router.push(href);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIndex((cursor + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIndex((cursor - 1 + results.length) % results.length);
    } else if (e.key === "Enter" && results[cursor]) {
      e.preventDefault();
      go(results[cursor].href);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-background/70 p-4 pt-[12vh]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Jump to a page"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg overflow-hidden rounded-xl border border-outline-variant bg-surface-container shadow-2xl"
      >
        <div className="flex items-center gap-2.5 border-b border-outline-variant px-4">
          <IconSearch size={16} className="shrink-0 text-outline" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setIndex(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="Jump to a page…"
            aria-label="Jump to a page"
            className="h-12 flex-1 bg-transparent text-sm text-on-surface outline-none placeholder:text-outline"
          />
        </div>

        <ul
          role="listbox"
          aria-label="Pages"
          className="max-h-[320px] overflow-y-auto p-2"
        >
          {results.length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-outline">
              Nothing matches “{query.trim()}”. This jumps between pages — it
              does not search your mandates yet.
            </li>
          )}

          {results.map((r, i) => (
            <li key={r.href}>
              <button
                type="button"
                role="option"
                ref={i === cursor ? activeRef : undefined}
                aria-selected={i === cursor}
                onMouseEnter={() => setIndex(i)}
                onClick={() => go(r.href)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors",
                  i === cursor
                    ? "bg-surface-container-high text-on-surface"
                    : "text-on-surface-variant"
                )}
              >
                <span className="truncate">{r.label}</span>
                <span className="ml-auto shrink-0 font-mono-label text-[10px] uppercase tracking-widest text-outline">
                  {r.group}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
