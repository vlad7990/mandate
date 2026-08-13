"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  IconArrowRight,
  IconCheck,
  IconClose,
  IconRefresh,
  IconSearch,
  IconSpark,
} from "@/components/icons";
import {
  PANEL_BODY,
  PANEL_BUTTON,
  PANEL_BUTTON_QUIET,
  Panel,
  PanelMeta,
} from "@/components/projects/panel";
import {
  ARCHETYPES,
  PIPELINE_LABELS,
  PIPELINE_STAGES,
  type Archetype,
  type PipelineStage,
} from "@/lib/ai/cv-parsing";
import { TIER_BANDS, TIER_ORDER, type Tier } from "@/lib/ranking/tiers";
import {
  ROLE_ANALYSIS_MAX,
  ROLE_ANALYSIS_MIN,
  type RoleAnalysisResult,
} from "@/lib/ai/role-analysis-agent";
import { runRoleAnalysisAction } from "./actions";
import { addCandidateAction } from "./shortlist/actions";

// ────────────────────────────────────────────────────────────────────────
// Public types — server component pre-shapes candidates for the panel
// ────────────────────────────────────────────────────────────────────────

export type SearchCandidate = {
  id: string;
  full_name: string;
  current_title: string | null;
  current_company: string | null;
  archetype: Archetype | null;
  pipeline_stage: PipelineStage | null;
  /** True when the candidate is already attached to THIS project. */
  in_project: boolean;
  /** Score row for THIS project (null when not yet ranked here). */
  rank: number | null;
  overall_score: number | null;
  ai_tier: Tier | null;
  /** Recruiter override tier. */
  recruiter_tier: Tier | null;
  /** Project the candidate currently lives in (null when global pool). */
  project_id: string | null;
  project_title: string | null;
};

const ARCHETYPE_TONE: Record<Archetype, string> = {
  Builder: "border-primary-container/60 bg-primary-container/10 text-primary",
  Operator:
    "border-secondary-fixed-dim/60 bg-secondary-fixed-dim/10 text-secondary-fixed-dim",
  Transformer: "border-tertiary/60 bg-tertiary/10 text-tertiary",
  Infrastructure: "border-outline-variant text-on-surface-variant",
};

const TIER_TONE: Record<Tier, string> = {
  tier_1: "border-secondary-fixed-dim/60 bg-secondary-fixed-dim/10 text-secondary-fixed-dim",
  tier_2: "border-primary-container/60 bg-primary-container/10 text-primary",
  tier_3: "border-tertiary/60 bg-tertiary/10 text-tertiary",
  tier_4: "border-error/60 bg-error/10 text-error",
};

export function CandidateSearchPanel({
  projectId,
  candidates,
}: {
  projectId: string;
  candidates: SearchCandidate[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [archetypeFilter, setArchetypeFilter] = useState<string>("");
  const [tierFilter, setTierFilter] = useState<string>("");
  const [stageFilter, setStageFilter] = useState<string>("");
  const [scopeFilter, setScopeFilter] = useState<"project" | "global" | "all">(
    "project"
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [analysis, setAnalysis] = useState<RoleAnalysisResult | null>(null);
  const [analyzing, startAnalyze] = useTransition();
  const [shortlisting, startShortlist] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return candidates.filter((c) => {
      if (scopeFilter === "project" && !c.in_project) return false;
      if (scopeFilter === "global" && c.in_project) return false;
      if (archetypeFilter && c.archetype !== archetypeFilter) return false;
      if (tierFilter && c.ai_tier !== tierFilter) return false;
      if (stageFilter && c.pipeline_stage !== stageFilter) return false;
      if (q.length === 0) return true;
      const haystack = [
        c.full_name,
        c.current_title,
        c.current_company,
        c.project_title,
      ]
        .filter((s): s is string => !!s)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [
    candidates,
    query,
    archetypeFilter,
    tierFilter,
    stageFilter,
    scopeFilter,
  ]);

  const selectedList = useMemo(
    () => candidates.filter((c) => selected.has(c.id)),
    [candidates, selected]
  );

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (next.size >= ROLE_ANALYSIS_MAX) {
          toast.error(`Cap is ${ROLE_ANALYSIS_MAX} candidates per analysis.`);
          return prev;
        }
        next.add(id);
      }
      return next;
    });
  };

  const clearSelection = () => {
    setSelected(new Set());
    setAnalysis(null);
  };

  const canAnalyze =
    selected.size >= ROLE_ANALYSIS_MIN && selected.size <= ROLE_ANALYSIS_MAX;

  const handleAnalyze = () => {
    if (!canAnalyze || analyzing) return;
    // Reject cross-project selections client-side; the server enforces
    // the same rule but a fast toast is friendlier than the round-trip.
    const wrongProject = selectedList.find((c) => !c.in_project);
    if (wrongProject) {
      toast.error(
        `Move "${wrongProject.full_name}" into this project before analysing — the agent ranks against THIS role's calibration only.`
      );
      return;
    }
    startAnalyze(async () => {
      try {
        const result = await runRoleAnalysisAction(
          projectId,
          Array.from(selected)
        );
        setAnalysis(result);
        toast.success("Role analysis complete");
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Analysis failed.";
        toast.error(msg);
      }
    });
  };

  const handleAddToShortlist = (candidateId: string) => {
    if (shortlisting) return;
    startShortlist(async () => {
      try {
        await addCandidateAction(projectId, candidateId);
        toast.success("Added to shortlist");
        router.refresh();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Could not add.";
        toast.error(msg);
      }
    });
  };

  const tierCounts = useMemo(() => {
    const c = { tier_1: 0, tier_2: 0, tier_3: 0, tier_4: 0 } as Record<
      Tier,
      number
    >;
    for (const cand of filtered) {
      if (cand.ai_tier) c[cand.ai_tier] += 1;
    }
    return c;
  }, [filtered]);

  return (
    <Panel
      title="Find candidates"
      meta={
        <PanelMeta>
          <span className="tabular-nums">
            {filtered.length} match · {tierCounts.tier_1 + tierCounts.tier_2}{" "}
            viable · {selected.size}/{ROLE_ANALYSIS_MAX} selected
          </span>
        </PanelMeta>
      }
    >
      <div className={cn(PANEL_BODY, "flex flex-col gap-4")}>
        {/* Search + scope toggle */}
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex min-w-[240px] flex-1 items-center gap-2 border border-outline-variant bg-surface-container-lowest px-3 py-2 transition-colors focus-within:border-primary">
            <IconSearch size={15} className="shrink-0 text-outline" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search candidates for this role"
              className="min-w-0 flex-1 bg-transparent text-[13px] text-on-surface placeholder:text-outline focus:outline-none"
            />
          </label>
          <ScopeToggle value={scopeFilter} onChange={setScopeFilter} />
        </div>

        {/* Filters */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
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
            label="Tier"
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
            label="Pipeline"
            value={stageFilter}
            onChange={setStageFilter}
            options={[
              { value: "", label: "All stages" },
              ...PIPELINE_STAGES.map((s) => ({
                value: s,
                label: PIPELINE_LABELS[s],
              })),
            ]}
          />
        </div>

        {/* Selection tray */}
        {selected.size > 0 && (
          <SelectionTray
            selected={selectedList}
            onRemove={(id) => toggle(id)}
            onClear={clearSelection}
            onAnalyze={handleAnalyze}
            analyzing={analyzing}
            canAnalyze={canAnalyze}
          />
        )}

        {/* Results */}
        {filtered.length === 0 ? (
          <p className="font-mono-label text-mono-label text-outline italic uppercase tracking-widest px-2 py-6 text-center">
            No candidates match the current filters.
          </p>
        ) : (
          <ul className="max-h-[480px] divide-y divide-outline-variant overflow-y-auto border border-outline-variant">
            {filtered.map((c) => (
              <CandidateRow
                key={c.id}
                candidate={c}
                selected={selected.has(c.id)}
                onToggle={() => toggle(c.id)}
              />
            ))}
          </ul>
        )}

        {/* AI analysis result */}
        {analysis && (
          <RoleAnalysisResultPanel
            result={analysis}
            candidates={selectedList}
            onAddToShortlist={handleAddToShortlist}
            shortlisting={shortlisting}
          />
        )}
      </div>
    </Panel>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────────────────

function ScopeToggle({
  value,
  onChange,
}: {
  value: "project" | "global" | "all";
  onChange: (v: "project" | "global" | "all") => void;
}) {
  const opts: Array<{ value: typeof value; label: string }> = [
    { value: "project", label: "In this project" },
    { value: "global", label: "Global pool" },
    { value: "all", label: "All" },
  ];
  return (
    <div className="inline-flex border border-outline-variant divide-x divide-outline-variant">
      {opts.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "px-3 py-2 font-mono-label text-mono-label uppercase tracking-widest transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary",
            value === o.value
              ? "bg-primary-container/15 text-primary"
              : "text-outline hover:text-on-surface"
          )}
        >
          {o.label}
        </button>
      ))}
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

function SelectionTray({
  selected,
  onRemove,
  onClear,
  onAnalyze,
  analyzing,
  canAnalyze,
}: {
  selected: SearchCandidate[];
  onRemove: (id: string) => void;
  onClear: () => void;
  onAnalyze: () => void;
  analyzing: boolean;
  canAnalyze: boolean;
}) {
  return (
    <article className="bg-primary-container/10 border border-primary-container/40 px-3 py-3 space-y-2">
      <header className="flex items-center justify-between gap-2 flex-wrap">
        <span className="font-mono-label text-mono-label text-primary uppercase tracking-widest flex items-center gap-1.5">
          <IconCheck size={13} />
          Selected for analysis
          <span className="text-outline tabular-nums">
            · {String(selected.length).padStart(2, "0")}/
            {ROLE_ANALYSIS_MAX}
          </span>
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClear}
            disabled={analyzing}
            className="px-2 py-1 border border-outline-variant text-outline hover:text-error hover:border-error font-mono-label text-mono-label uppercase tracking-widest transition-colors disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-error"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={onAnalyze}
            disabled={!canAnalyze || analyzing}
            aria-busy={analyzing ? true : undefined}
            className={PANEL_BUTTON}
          >
            {analyzing ? (
              <IconRefresh size={14} className="animate-spin" />
            ) : (
              <IconSpark size={14} />
            )}
            {analyzing ? "Analysing" : "Analyse selected"}
          </button>
        </div>
      </header>
      <ul className="flex flex-wrap gap-1.5">
        {selected.map((c) => (
          <li
            key={c.id}
            className="inline-flex items-center gap-1.5 bg-surface-container-low border border-outline-variant px-2 py-0.5"
          >
            <span className="font-mono-data text-mono-data text-on-surface">
              {c.full_name}
            </span>
            {c.ai_tier && (
              <span
                className={cn(
                  "px-1.5 py-0.5 border font-mono-label text-mono-label uppercase tracking-widest",
                  TIER_TONE[c.ai_tier]
                )}
              >
                {TIER_BANDS[c.ai_tier].label.split(" · ")[0]}
              </span>
            )}
            <button
              type="button"
              onClick={() => onRemove(c.id)}
              aria-label={`Remove ${c.full_name}`}
              className="text-outline hover:text-error transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-error"
            >
              <IconClose size={14} />
            </button>
          </li>
        ))}
      </ul>
      {!canAnalyze && (
        <p className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
          Pick {ROLE_ANALYSIS_MIN}–{ROLE_ANALYSIS_MAX} candidates to enable
          analysis.
        </p>
      )}
    </article>
  );
}

function CandidateRow({
  candidate,
  selected,
  onToggle,
}: {
  candidate: SearchCandidate;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <li
      className={cn(
        "flex items-center gap-3 px-3 py-2 hover:bg-surface-container transition-colors",
        selected && "bg-primary-container/10"
      )}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggle}
        aria-label={`Select ${candidate.full_name}`}
        className="w-4 h-4 accent-primary cursor-pointer shrink-0"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="min-w-0 break-words text-[13px] font-semibold text-on-surface">
            {candidate.full_name}
          </span>
          {candidate.ai_tier && (
            <span
              className={cn(
                "px-1.5 py-0.5 border font-mono-label text-mono-label uppercase tracking-widest",
                TIER_TONE[candidate.ai_tier]
              )}
              title="AI tier"
            >
              AI · {TIER_BANDS[candidate.ai_tier].label.split(" · ")[0]}
            </span>
          )}
          {candidate.recruiter_tier && (
            <span
              className={cn(
                "px-1.5 py-0.5 border font-mono-label text-mono-label uppercase tracking-widest",
                TIER_TONE[candidate.recruiter_tier]
              )}
              title="Recruiter tier"
            >
              REC · {TIER_BANDS[candidate.recruiter_tier].label.split(" · ")[0]}
            </span>
          )}
          {candidate.archetype && (
            <span
              className={cn(
                "px-1.5 py-0.5 border font-mono-label text-mono-label uppercase tracking-widest",
                ARCHETYPE_TONE[candidate.archetype]
              )}
            >
              {candidate.archetype}
            </span>
          )}
          {candidate.pipeline_stage && (
            <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
              {PIPELINE_LABELS[candidate.pipeline_stage]}
            </span>
          )}
          {!candidate.in_project && candidate.project_title && (
            <span className="font-mono-label text-mono-label uppercase tracking-widest text-tertiary">
              From {candidate.project_title}
            </span>
          )}
        </div>
        <div className="min-w-0 break-words font-mono-label text-mono-label uppercase tracking-widest text-outline">
          {candidate.current_title ?? "—"}
          {candidate.current_company ? ` · ${candidate.current_company}` : ""}
          {candidate.rank != null && (
            <span className="ml-2 tabular-nums">
              · Rank #{candidate.rank} ·{" "}
              {candidate.overall_score != null
                ? `${candidate.overall_score.toFixed(1)}/10`
                : "—"}
            </span>
          )}
        </div>
      </div>
      {candidate.in_project && candidate.project_id && (
        <Link
          href={`/app/projects/${candidate.project_id}/candidates/${candidate.id}`}
          prefetch={false}
          className="font-mono-label text-mono-label text-primary uppercase tracking-widest hover:brightness-110 transition-colors flex items-center gap-1 shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          Profile
          <IconArrowRight size={12} />
        </Link>
      )}
    </li>
  );
}

function RoleAnalysisResultPanel({
  result,
  candidates,
  onAddToShortlist,
  shortlisting,
}: {
  result: RoleAnalysisResult;
  candidates: SearchCandidate[];
  onAddToShortlist: (candidateId: string) => void;
  shortlisting: boolean;
}) {
  const candById = useMemo(() => {
    const map = new Map<string, SearchCandidate>();
    for (const c of candidates) map.set(c.id, c);
    return map;
  }, [candidates]);

  const dispositionTone =
    result.recommendation.disposition === "advance"
      ? "border-secondary-fixed-dim/60 bg-secondary-fixed-dim/10 text-secondary-fixed-dim"
      : result.recommendation.disposition === "split"
        ? "border-primary-container/60 bg-primary-container/10 text-primary"
        : "border-tertiary/60 bg-tertiary/10 text-tertiary";

  return (
    <article className="bg-surface-container border border-primary-container/60 p-4 space-y-4">
      <header className="flex items-center justify-between gap-2 flex-wrap">
        <h4 className="font-mono-label text-mono-label text-primary uppercase tracking-widest flex items-center gap-2">
          Role analysis result
        </h4>
        <span
          className={cn(
            "px-2 py-0.5 border font-mono-label text-mono-label uppercase tracking-widest",
            dispositionTone
          )}
        >
          {result.recommendation.disposition}
        </span>
      </header>

      <p className="text-on-surface text-body-main leading-relaxed">
        <span className="font-mono-label uppercase tracking-widest text-primary mr-2">
          Synthesis:
        </span>
        {result.synthesis}
      </p>

      <div>
        <h5 className="font-mono-label text-mono-label text-outline uppercase tracking-widest mb-2">
          Ranked Order
        </h5>
        <ol className="space-y-2">
          {result.ranked
            .slice()
            .sort((a, b) => a.rank - b.rank)
            .map((r) => {
              const c = candById.get(r.candidate_id);
              return (
                <li
                  key={r.candidate_id}
                  className="flex items-start gap-3 bg-surface-container-low border border-outline-variant px-3 py-2"
                >
                  <span className="font-h2 text-h2 text-primary tabular-nums w-8 shrink-0">
                    #{r.rank}
                  </span>
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="font-mono-data text-body-main text-on-surface font-semibold">
                        {c?.full_name ?? r.candidate_id}
                      </span>
                      {c?.ai_tier && (
                        <span
                          className={cn(
                            "px-1.5 py-0.5 border font-mono-label text-mono-label uppercase tracking-widest",
                            TIER_TONE[c.ai_tier]
                          )}
                        >
                          {TIER_BANDS[c.ai_tier].label.split(" · ")[0]}
                        </span>
                      )}
                    </div>
                    <p className="text-body-main text-on-surface-variant leading-relaxed">
                      {r.rationale}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onAddToShortlist(r.candidate_id)}
                    disabled={shortlisting}
                    className={cn(PANEL_BUTTON_QUIET, "shrink-0")}
                  >
                    Shortlist
                  </button>
                </li>
              );
            })}
        </ol>
      </div>

      {result.differentiators.length > 0 && (
        <div>
          <h5 className="font-mono-label text-mono-label text-outline uppercase tracking-widest mb-2">
            Key Differentiators
          </h5>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {result.differentiators.map((d, i) => {
              const lead = d.leading_candidate_id
                ? candById.get(d.leading_candidate_id)
                : null;
              return (
                <li
                  key={i}
                  className="bg-surface-container-low border-l-2 border-l-secondary-fixed-dim border-y border-r border-outline-variant px-3 py-2"
                >
                  <div className="flex items-baseline justify-between gap-2 flex-wrap">
                    <span className="font-mono-label text-mono-label text-secondary-fixed-dim uppercase tracking-widest">
                      {d.topic}
                    </span>
                    {lead && (
                      <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
                        ↑ {lead.full_name}
                      </span>
                    )}
                  </div>
                  <p className="text-body-main text-on-surface-variant mt-1">
                    {d.detail}
                  </p>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="bg-primary-container/10 border border-primary-container/40 px-3 py-3 space-y-2">
        <span className="font-mono-label text-mono-label text-primary uppercase tracking-widest">
          Recommendation
        </span>
        <p className="text-on-surface text-body-main leading-relaxed">
          {result.recommendation.detail}
        </p>
        {result.recommendation.primary_candidate_ids.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-primary-container/30">
            <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
              Primary slate:
            </span>
            {result.recommendation.primary_candidate_ids.map((id) => {
              const c = candById.get(id);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onAddToShortlist(id)}
                  disabled={shortlisting}
                  className="inline-flex items-center gap-1 px-2 py-0.5 border border-primary-container/60 bg-surface-container text-on-surface font-mono-label text-mono-label uppercase tracking-widest hover:border-primary hover:text-primary transition-colors disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  {c?.full_name ?? id}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </article>
  );
}
