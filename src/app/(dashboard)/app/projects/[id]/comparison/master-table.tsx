"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { TIER_BANDS, type Tier } from "@/lib/ranking/tiers";
import type { ComparisonRow } from "@/lib/comparison/comparison-export";

type SortKey =
  | "rank"
  | "full_name"
  | "tier"
  | "overall"
  | "technical"
  | "domain"
  | "leadership"
  | "regulatory"
  | "transformation";

type SortDir = "asc" | "desc";

const COLUMNS: Array<{
  key: SortKey;
  label: string;
  align: "left" | "right";
  numeric: boolean;
  width?: string;
}> = [
  { key: "rank", label: "#", align: "right", numeric: true, width: "48px" },
  { key: "full_name", label: "Candidate", align: "left", numeric: false },
  { key: "tier", label: "Tier", align: "left", numeric: false, width: "112px" },
  { key: "overall", label: "Overall", align: "right", numeric: true, width: "84px" },
  { key: "technical", label: "Tech", align: "right", numeric: true, width: "64px" },
  { key: "domain", label: "Domain", align: "right", numeric: true, width: "72px" },
  { key: "leadership", label: "Lead", align: "right", numeric: true, width: "64px" },
  { key: "regulatory", label: "Regul", align: "right", numeric: true, width: "72px" },
  { key: "transformation", label: "Xform", align: "right", numeric: true, width: "72px" },
];

const TIER_PILL: Record<Tier, string> = {
  tier_1: "border-secondary-fixed-dim/60 bg-secondary-fixed-dim/10 text-secondary-fixed-dim",
  tier_2: "border-primary-container/60 bg-primary-container/10 text-primary",
  tier_3: "border-tertiary/60 bg-tertiary/10 text-tertiary",
  tier_4: "border-error/60 bg-error/10 text-error",
};

const TIER_NUMERIC: Record<Tier, number> = {
  tier_1: 1,
  tier_2: 2,
  tier_3: 3,
  tier_4: 4,
};

export function MasterScoringTable({
  projectId,
  rows,
}: {
  projectId: string;
  rows: ComparisonRow[];
}) {
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const sorted = useMemo(() => {
    const list = [...rows];
    list.sort((a, b) => {
      const av = sortValue(a, sortKey);
      const bv = sortValue(b, sortKey);
      if (typeof av === "number" && typeof bv === "number") {
        return sortDir === "asc" ? av - bv : bv - av;
      }
      const aStr = String(av).toLowerCase();
      const bStr = String(bv).toLowerCase();
      if (aStr === bStr) return 0;
      const cmp = aStr < bStr ? -1 : 1;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [rows, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    // Numeric columns (and tier) read more naturally as desc-first; the
    // recruiter wants the strongest scores at the top of the list.
    const col = COLUMNS.find((c) => c.key === key);
    setSortDir(col?.numeric || key === "tier" ? "desc" : "asc");
  };

  return (
    <div className="bg-surface-container-low border border-outline-variant overflow-x-auto">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="bg-surface-container-high border-b border-outline-variant">
            {COLUMNS.map((col) => (
              <th
                key={col.key}
                scope="col"
                aria-sort={
                  col.key === sortKey
                    ? sortDir === "asc"
                      ? "ascending"
                      : "descending"
                    : "none"
                }
                style={col.width ? { width: col.width } : undefined}
                className={cn(
                  "px-3 py-2.5 font-mono-label text-mono-label uppercase tracking-widest",
                  col.align === "right" ? "text-right" : "text-left"
                )}
              >
                <button
                  type="button"
                  onClick={() => handleSort(col.key)}
                  className={cn(
                    "inline-flex items-center gap-1 transition-colors focus-visible:outline-none focus-visible:underline focus-visible:underline-offset-2",
                    col.key === sortKey
                      ? "text-primary"
                      : "text-outline hover:text-on-surface"
                  )}
                >
                  <span>{col.label}</span>
                  <SortIndicator
                    active={col.key === sortKey}
                    direction={sortDir}
                  />
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => {
            const tier = r.tier;
            return (
              <tr
                key={r.candidate_id}
                className="border-b border-outline-variant/40 hover:bg-surface-container-high transition-colors"
              >
                <td className="px-3 py-2.5 text-right font-mono-data text-mono-data text-primary tabular-nums">
                  {r.rank}
                </td>
                <td className="px-3 py-2.5">
                  <Link
                    href={`/app/projects/${projectId}/candidates/${r.candidate_id}`}
                    prefetch={false}
                    className="text-on-surface text-body-main font-semibold hover:text-primary transition-colors focus-visible:outline-none focus-visible:underline"
                  >
                    {r.full_name}
                  </Link>
                  <div className="font-mono-label text-mono-label text-outline uppercase tracking-widest truncate">
                    {r.current_title ?? "—"}
                    {r.current_company ? ` · ${r.current_company}` : ""}
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <span
                    className={cn(
                      "inline-flex px-2 py-0.5 border font-mono-label text-mono-label uppercase tracking-widest",
                      TIER_PILL[tier]
                    )}
                  >
                    {TIER_BANDS[tier].label.split(" · ")[0]}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right">
                  <span
                    className={cn(
                      "font-mono-data text-mono-data tabular-nums font-semibold",
                      scoreToneText(r.overall)
                    )}
                  >
                    {r.overall.toFixed(2)}
                  </span>
                </td>
                {(["technical", "domain", "leadership", "regulatory", "transformation"] as const).map(
                  (k) => (
                    <td key={k} className="px-3 py-2.5 text-right">
                      <ScoreCell value={r[k]} />
                    </td>
                  )
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  function sortValue(row: ComparisonRow, key: SortKey): number | string {
    if (key === "tier") return TIER_NUMERIC[row.tier];
    if (key === "full_name") return row.full_name;
    return row[key];
  }
}

function ScoreCell({ value }: { value: number }) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-end min-w-[2.25rem] px-1.5 py-0.5 font-mono-data text-mono-data tabular-nums font-semibold",
        scoreToneBg(value)
      )}
      aria-label={`Score ${value} out of 10`}
    >
      {value}
    </span>
  );
}

function SortIndicator({
  active,
  direction,
}: {
  active: boolean;
  direction: SortDir;
}) {
  if (!active) {
    return (
      <span
        className="material-symbols-outlined text-[12px] opacity-40"
        aria-hidden
      >
        unfold_more
      </span>
    );
  }
  return (
    <span className="material-symbols-outlined text-[12px]" aria-hidden>
      {direction === "asc" ? "arrow_upward" : "arrow_downward"}
    </span>
  );
}

function scoreToneText(value: number): string {
  if (value >= 8) return "text-secondary-fixed-dim";
  if (value >= 5) return "text-primary";
  return "text-error";
}

function scoreToneBg(value: number): string {
  if (value >= 8)
    return "text-secondary-fixed-dim bg-secondary-fixed-dim/10 border border-secondary-fixed-dim/30";
  if (value >= 5) return "text-primary bg-primary-container/15 border border-primary-container/30";
  return "text-error bg-error/10 border border-error/30";
}
