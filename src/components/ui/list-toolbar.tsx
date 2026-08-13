"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  buildListHref,
  isFiltered,
  type ListParams,
} from "@/lib/list-params";
import { IconClose, IconRefresh, IconSearch } from "@/components/icons";

export type FilterOption = { value: string; label: string };

export type FilterSpec = {
  /** Must be one of the keys the page declared to `parseListParams`. */
  key: string;
  label: string;
  options: FilterOption[];
};

/**
 * Search and filters for a list screen.
 *
 * Client-side only because it navigates. It owns no list state — it reads
 * the current `ListParams` and writes a new URL, so the server component
 * below it stays the single source of truth for what is on screen.
 *
 * `router.replace`, not `push`: typing four characters into the search box
 * should not put four entries in the back stack. The filter selects use
 * push, since choosing a filter is a deliberate step worth going back from.
 */
export function ListToolbar({
  basePath,
  params,
  filters = [],
  searchPlaceholder = "Search…",
}: {
  basePath: string;
  params: ListParams;
  filters?: FilterSpec[];
  searchPlaceholder?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState(params.q);
  const [urlQuery, setUrlQuery] = useState(params.q);

  // Adjust during render rather than in an effect: when the URL changes
  // underneath the box — back button, or the Clear control below — the input
  // has to follow it, and doing that in an effect renders the stale value
  // once first.
  if (params.q !== urlQuery) {
    setUrlQuery(params.q);
    setQuery(params.q);
  }

  // Filters are pushed immediately, so a filter change while a search is
  // still pending would otherwise navigate with the stale set and undo it.
  const filtersKey = JSON.stringify(params.filters);

  // Debounced so a search runs on the phrase rather than on every keystroke.
  // Settling makes the typed value and the URL agree, which ends the loop.
  useEffect(() => {
    if (query === params.q) return;
    const timer = setTimeout(() => {
      startTransition(() => {
        router.replace(buildListHref(basePath, params, { q: query }));
      });
    }, 300);
    return () => clearTimeout(timer);
    // `params` is a fresh object each render; its meaningful parts are here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, params.q, filtersKey, basePath]);

  function setFilter(key: string, value: string) {
    const next = { ...params.filters };
    if (value) next[key] = value;
    else delete next[key];
    startTransition(() => {
      router.push(buildListHref(basePath, params, { filters: next }));
    });
  }

  const showClear = isFiltered(params);

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-outline-variant px-4 py-3">
      <div className="relative min-w-[200px] flex-1">
        <IconSearch
          size={15}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-outline"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
          className="h-9 w-full border border-outline-variant bg-surface-container-lowest pl-9 pr-3 text-body-main text-on-surface placeholder:text-outline focus:border-primary focus:outline-none"
        />
      </div>

      {filters.map((filter) => (
        <label key={filter.key} className="flex items-center gap-2">
          <span className="sr-only">{filter.label}</span>
          <select
            value={params.filters[filter.key] ?? ""}
            onChange={(e) => setFilter(filter.key, e.target.value)}
            className="h-9 border border-outline-variant bg-surface-container-lowest px-2.5 font-mono-label text-mono-label uppercase tracking-wider text-on-surface-variant focus:border-primary focus:outline-none"
          >
            <option value="">{filter.label}: any</option>
            {filter.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      ))}

      {showClear && (
        <button
          type="button"
          onClick={() =>
            startTransition(() => {
              router.push(
                buildListHref(basePath, params, { q: "", filters: {} })
              );
            })
          }
          className="inline-flex h-9 items-center gap-1.5 border border-outline-variant px-3 font-mono-label text-mono-label uppercase tracking-widest text-on-surface-variant transition-colors hover:border-primary hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <IconClose size={13} />
          Clear
        </button>
      )}

      {/* Occupies its slot at all times so the row does not reflow when a
          search starts. */}
      <span
        aria-live="polite"
        className="inline-flex h-9 w-5 items-center justify-center"
      >
        {pending && (
          <>
            <IconRefresh size={14} className="animate-spin text-outline" />
            <span className="sr-only">Updating results</span>
          </>
        )}
      </span>
    </div>
  );
}
