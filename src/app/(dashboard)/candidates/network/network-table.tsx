"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import {
  ARCHETYPES,
  PIPELINE_LABELS,
  PIPELINE_STAGES,
  type Archetype,
  type PipelineStage,
} from "@/lib/ai/cv-parsing";
import { TIER_BANDS, TIER_ORDER, type Tier } from "@/lib/ranking/tiers";
import type {
  NetworkPerson,
  NetworkProject,
} from "@/lib/network/network-aggregator";
import { AddToSearchButton } from "./add-to-search-button";

type SortKey = "best_score" | "average_score" | "last_active" | "name";
type SortDir = "asc" | "desc";

const TIER_TONE: Record<Tier, string> = {
  tier_1: "border-secondary-fixed-dim/60 bg-secondary-fixed-dim/10 text-secondary-fixed-dim",
  tier_2: "border-primary-container/60 bg-primary-container/10 text-primary",
  tier_3: "border-tertiary/60 bg-tertiary/10 text-tertiary",
  tier_4: "border-error/60 bg-error/10 text-error",
};

const ARCHETYPE_TONE: Record<Archetype, string> = {
  Builder: "border-primary-container/60 bg-primary-container/10 text-primary",
  Operator:
    "border-secondary-fixed-dim/60 bg-secondary-fixed-dim/10 text-secondary-fixed-dim",
  Transformer: "border-tertiary/60 bg-tertiary/10 text-tertiary",
  Infrastructure: "border-outline-variant text-on-surface-variant",
};

export function NetworkTable({
  people,
  activeProjects,
}: {
  people: NetworkPerson[];
  activeProjects: NetworkProject[];
}) {
  const [query, setQuery] = useState("");
  const [archetypeFilter, setArchetypeFilter] = useState<string>("");
  const [tierFilter, setTierFilter] = useState<string>("");
  const [domainFilter, setDomainFilter] = useState<string>("");
  const [stageFilter, setStageFilter] = useState<string>("");
  const [yearsFilter, setYearsFilter] = useState<string>("");
  const [sortKey, setSortKey] = useState<SortKey>("best_score");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Domain options come from the actual data — capped + sorted.
  const domainOptions = useMemo(() => {
    const set = new Set<string>();
    for (const p of people) {
      if (p.domain) set.add(p.domain);
    }
    return Array.from(set).sort();
  }, [people]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return people.filter((p) => {
      if (archetypeFilter && p.archetype !== archetypeFilter) return false;
      if (tierFilter && p.best_tier !== tierFilter) return false;
      if (domainFilter && p.domain !== domainFilter) return false;
      if (stageFilter) {
        const stages = new Set(p.appearances.map((a) => a.pipeline_stage));
        if (!stages.has(stageFilter as PipelineStage)) return false;
      }
      if (yearsFilter) {
        const y = p.years_experience ?? 0;
        if (yearsFilter === "0-5" && y > 5) return false;
        if (yearsFilter === "6-10" && (y < 6 || y > 10)) return false;
        if (yearsFilter === "11-20" && (y < 11 || y > 20)) return false;
        if (yearsFilter === "21+" && y < 21) return false;
      }
      if (q.length === 0) return true;
      const haystack = [
        p.full_name,
        p.current_title,
        p.current_company,
        p.domain,
        ...p.tech_exposure,
      ]
        .filter((s): s is string => !!s)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [
    people,
    query,
    archetypeFilter,
    tierFilter,
    domainFilter,
    stageFilter,
    yearsFilter,
  ]);

  const sorted = useMemo(() => {
    const list = [...filtered];
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
  }, [filtered, sortKey, sortDir]);

  return (
    <div className="space-y-3">
      <div className="bg-surface-container-low border border-outline-variant p-4 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="material-symbols-outlined text-primary text-[20px]"
            aria-hidden
          >
            search
          </span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, title, company, domain, skills"
            className="flex-1 min-w-[260px] bg-surface-container-lowest border border-outline-variant px-3 py-2 text-on-surface focus:border-primary focus:outline-none transition-colors"
          />
          <SortControls
            sortKey={sortKey}
            sortDir={sortDir}
            onChange={(k, d) => {
              setSortKey(k);
              setSortDir(d);
            }}
          />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <FilterSelect
            label="Archetype"
            value={archetypeFilter}
            onChange={setArchetypeFilter}
            options={[
              { value: "", label: "All archetypes" },
              ...ARCHETYPES.map((a) => ({ value: a, label: a })),
            ]}
          />
          <FilterSelect
            label="Best tier"
            value={tierFilter}
            onChange={setTierFilter}
            options={[
              { value: "", label: "All tiers" },
              ...TIER_ORDER.map((t) => ({
                value: t,
                label: TIER_BANDS[t].label.split(" · ")[0],
              })),
            ]}
          />
          <FilterSelect
            label="Pipeline stage"
            value={stageFilter}
            onChange={setStageFilter}
            options={[
              { value: "", label: "Any stage" },
              ...PIPELINE_STAGES.map((s) => ({
                value: s,
                label: PIPELINE_LABELS[s],
              })),
            ]}
          />
          <FilterSelect
            label="Domain"
            value={domainFilter}
            onChange={setDomainFilter}
            options={[
              { value: "", label: "All domains" },
              ...domainOptions.map((d) => ({ value: d, label: d })),
            ]}
          />
          <FilterSelect
            label="Years"
            value={yearsFilter}
            onChange={setYearsFilter}
            options={[
              { value: "", label: "Any" },
              { value: "0-5", label: "0–5" },
              { value: "6-10", label: "6–10" },
              { value: "11-20", label: "11–20" },
              { value: "21+", label: "21+" },
            ]}
          />
        </div>
      </div>

      <p className="font-mono-label text-mono-label text-outline uppercase tracking-widest tabular-nums">
        Showing {sorted.length} of {people.length} people
      </p>

      {sorted.length === 0 ? (
        <p className="font-mono-label text-mono-label text-outline italic uppercase tracking-widest text-center px-2 py-12">
          No people match the current filters.
        </p>
      ) : (
        <ul className="space-y-2">
          {sorted.map((p) => (
            <NetworkCard
              key={p.identity_key}
              person={p}
              activeProjects={activeProjects}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function sortValue(p: NetworkPerson, key: SortKey): string | number {
  switch (key) {
    case "best_score":
      return p.best_score ?? -1;
    case "average_score":
      return p.average_score ?? -1;
    case "last_active":
      return new Date(p.last_active_at).getTime();
    case "name":
      return p.full_name;
  }
}

function SortControls({
  sortKey,
  sortDir,
  onChange,
}: {
  sortKey: SortKey;
  sortDir: SortDir;
  onChange: (k: SortKey, d: SortDir) => void;
}) {
  const opts: Array<{ value: SortKey; label: string }> = [
    { value: "best_score", label: "Best score" },
    { value: "average_score", label: "Avg score" },
    { value: "last_active", label: "Most recent" },
    { value: "name", label: "Alphabetical" },
  ];
  return (
    <div className="flex items-center gap-2">
      <select
        value={sortKey}
        onChange={(e) => {
          const k = e.target.value as SortKey;
          onChange(k, k === "name" ? "asc" : "desc");
        }}
        className="bg-surface-container-lowest border border-outline-variant px-2 py-1.5 text-on-surface text-body-main focus:border-primary focus:outline-none transition-colors"
      >
        {opts.map((o) => (
          <option key={o.value} value={o.value}>
            Sort: {o.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => onChange(sortKey, sortDir === "asc" ? "desc" : "asc")}
        aria-label={`Toggle sort direction (currently ${sortDir})`}
        className="w-8 h-8 border border-outline-variant text-on-surface-variant hover:text-primary hover:border-primary flex items-center justify-center transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
      >
        <span className="material-symbols-outlined text-[16px]" aria-hidden>
          {sortDir === "asc" ? "arrow_upward" : "arrow_downward"}
        </span>
      </button>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="block space-y-1">
      <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-surface-container-lowest border border-outline-variant px-2 py-1.5 text-on-surface text-body-main focus:border-primary focus:outline-none transition-colors"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function NetworkCard({
  person,
  activeProjects,
}: {
  person: NetworkPerson;
  activeProjects: NetworkProject[];
}) {
  const fitPct =
    person.best_score != null
      ? Math.round(person.best_score * 10)
      : null;

  // "Available for" — active projects this person isn't already in.
  const availableFor = activeProjects.filter(
    (p) => !person.appearances.some((a) => a.project_id === p.id)
  );

  return (
    <li className="bg-surface-container-low border border-outline-variant">
      <div className="px-4 py-3 grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-3 items-start">
        <div className="min-w-0 space-y-1.5">
          <div className="flex items-baseline gap-2 flex-wrap">
            <Link
              href={
                person.appearances[0]?.candidate_id &&
                person.appearances[0]?.project_id
                  ? `/projects/${person.appearances[0].project_id}/candidates/${person.appearances[0].candidate_id}`
                  : "/candidates"
              }
              prefetch={false}
              className="font-h2 text-h2 text-on-surface hover:text-primary transition-colors focus-visible:outline-none focus-visible:underline truncate"
            >
              {person.full_name}
            </Link>
            {person.archetype && (
              <span
                className={cn(
                  "px-1.5 py-0.5 border font-mono-label text-mono-label uppercase tracking-widest",
                  ARCHETYPE_TONE[person.archetype]
                )}
              >
                {person.archetype}
              </span>
            )}
            {person.best_tier && (
              <span
                className={cn(
                  "px-1.5 py-0.5 border font-mono-label text-mono-label uppercase tracking-widest",
                  TIER_TONE[person.best_tier]
                )}
                title="Best tier achieved across all projects"
              >
                Best · {TIER_BANDS[person.best_tier].label.split(" · ")[0]}
              </span>
            )}
            {person.shortlisted_before && (
              <span className="px-1.5 py-0.5 border border-secondary-fixed-dim/60 bg-secondary-fixed-dim/10 text-secondary-fixed-dim font-mono-label text-mono-label uppercase tracking-widest">
                ↺ Shortlisted before
              </span>
            )}
            {person.returning && (
              <span className="px-1.5 py-0.5 border border-primary-container/60 bg-primary-container/10 text-primary font-mono-label text-mono-label uppercase tracking-widest">
                Returning
              </span>
            )}
          </div>
          <div className="font-mono-data text-body-main text-on-surface-variant truncate">
            {person.current_title ?? "—"}
            {person.current_company ? ` @ ${person.current_company}` : ""}
            {person.domain && (
              <span className="text-outline ml-2">· {person.domain}</span>
            )}
            {typeof person.years_experience === "number" && (
              <span className="text-outline ml-2 tabular-nums">
                · {person.years_experience}Y
              </span>
            )}
          </div>
          <div className="font-mono-label text-mono-label text-outline uppercase tracking-widest tabular-nums">
            Last active {formatRelative(person.last_active_at)} ·
            Considered for{" "}
            {person.appearances.length} project
            {person.appearances.length === 1 ? "" : "s"}
            {person.average_score != null && (
              <>
                {" · "}Avg{" "}
                <span className="text-on-surface">
                  {person.average_score.toFixed(1)}/10
                </span>
              </>
            )}
            {person.best_score != null && fitPct != null && (
              <>
                {" · "}Best{" "}
                <span className="text-secondary-fixed-dim">
                  {person.best_score.toFixed(1)} ({fitPct}% fit)
                </span>
              </>
            )}
          </div>

          {person.appearances.length > 0 && (
            <ul className="flex flex-wrap gap-1.5 pt-1">
              {person.appearances.map((a) => {
                const tierShort = a.tier
                  ? TIER_BANDS[a.tier].label.split(" · ")[0]
                  : "—";
                return (
                  <li key={a.candidate_id}>
                    <Link
                      href={`/projects/${a.project_id}/candidates/${a.candidate_id}`}
                      prefetch={false}
                      className="inline-flex items-center gap-1 px-2 py-0.5 border border-outline-variant bg-surface-container hover:border-primary hover:bg-surface-container-high transition-colors font-mono-label text-mono-label uppercase tracking-widest text-on-surface-variant focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
                    >
                      <span className="text-on-surface">{a.project_title}</span>
                      {a.tier && (
                        <span
                          className={cn(
                            "px-1 border-l border-outline-variant ml-1 pl-1",
                            a.tier === "tier_1" || a.tier === "tier_2"
                              ? "text-secondary-fixed-dim"
                              : "text-tertiary"
                          )}
                        >
                          {tierShort}
                        </span>
                      )}
                      {a.overall_score != null && (
                        <span className="text-outline ml-1 tabular-nums">
                          {a.overall_score.toFixed(1)}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}

          {availableFor.length > 0 && (
            <div className="pt-1 font-mono-label text-mono-label text-outline uppercase tracking-widest leading-snug">
              <span className="text-tertiary mr-1">Available for:</span>
              {availableFor.slice(0, 4).map((p, i) => (
                <span key={p.id}>
                  {i > 0 && (
                    <span className="text-outline-variant mx-1">·</span>
                  )}
                  <span className="text-on-surface-variant normal-case tracking-normal">
                    {p.title}
                  </span>
                </span>
              ))}
              {availableFor.length > 4 && (
                <span className="text-outline ml-1">
                  +{availableFor.length - 4} more
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <AddToSearchButton
            person={person}
            activeProjects={activeProjects}
          />
        </div>
      </div>
    </li>
  );
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return iso;
  const delta = Date.now() - then;
  const min = Math.round(delta / 60000);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  return `${Math.round(day / 30)}mo ago`;
}
