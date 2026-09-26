"use client";

import Link from "next/link";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { type Archetype } from "@/lib/ai/cv-parsing";
import { TIER_BANDS, type Tier } from "@/lib/ranking/tiers";
import type {
  NetworkPerson,
  NetworkProject,
} from "@/lib/network/network-aggregator";
import { AddToSearchButton } from "./add-to-search-button";
import { RelationshipCard } from "./relationship-card";
import type { RelationshipProfile } from "@/lib/network/profile-resolver";

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

/**
 * The people on THIS PAGE.
 *
 * §205 — this component used to hold the whole pool and do the work: search,
 * five filters, four sorts and pagination, all in the browser over up to
 * 2,000 candidate rows' worth of folded people. All of that now happens in
 * Postgres (migration 145) with the page's state in the URL, so what is left
 * here is the rendering — and the card's own local state, which is the only
 * state that was ever really local: whether the relationship panel is open.
 *
 * Deleting the client-side filters was not optional once the table pages. A
 * search box that filters the current page while the header counts the whole
 * pool is two different answers to one question on one screen — §175's class,
 * which this page has now been bitten by twice.
 */
export function NetworkTable({
  people,
  activeProjects,
  profiles,
  isFounder,
}: {
  people: NetworkPerson[];
  activeProjects: NetworkProject[];
  /** Durable relationship overlay (098), keyed by profile id (§204 — a
   * merge moves which profile a row belongs to, and nothing else). */
  profiles: Record<string, RelationshipProfile>;
  isFounder: boolean;
}) {
  if (people.length === 0) {
    return (
      <p className="font-mono-label text-mono-label text-outline italic uppercase tracking-widest text-center px-2 py-12">
        No people match the current filters.
      </p>
    );
  }

  return (
    <ul className="space-y-2 p-3">
      {people.map((p) => (
        <NetworkCard
          key={p.profile_id}
          person={p}
          activeProjects={activeProjects}
          profile={profiles[p.profile_id] ?? null}
          isFounder={isFounder}
        />
      ))}
    </ul>
  );
}

function NetworkCard({
  person,
  activeProjects,
  profile,
  isFounder,
}: {
  person: NetworkPerson;
  activeProjects: NetworkProject[];
  profile: RelationshipProfile | null;
  isFounder: boolean;
}) {
  const [showRelationship, setShowRelationship] = useState(false);
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
                  ? `/app/projects/${person.appearances[0].project_id}/candidates/${person.appearances[0].candidate_id}`
                  : "/app/candidates"
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
                      href={`/app/projects/${a.project_id}/candidates/${a.candidate_id}`}
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
          <button
            type="button"
            onClick={() => setShowRelationship((v) => !v)}
            className={cn(
              "px-2 py-1.5 border font-mono-label text-mono-label uppercase tracking-widest transition-colors",
              profile?.dnc
                ? "border-error/50 text-error hover:bg-error/10"
                : "border-outline-variant text-on-surface-variant hover:bg-surface-container-high"
            )}
            aria-expanded={showRelationship}
          >
            {profile?.dnc
              ? "DNC"
              : (profile?.relationship_state ?? "relationship").replace(/_/g, " ")}
            {showRelationship ? " ▴" : " ▾"}
          </button>
          <AddToSearchButton
            person={person}
            activeProjects={activeProjects}
          />
        </div>
      </div>
      {showRelationship && (
        <RelationshipCard profile={profile} isFounder={isFounder} />
      )}
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
