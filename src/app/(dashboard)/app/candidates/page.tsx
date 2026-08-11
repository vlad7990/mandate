import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  PIPELINE_LABELS,
  type Archetype,
  type PipelineStage,
} from "@/lib/ai/cv-parsing";
import { MastHead } from "@/components/ui/mast-head";
import { cn } from "@/lib/utils";

type ProjectLite = {
  id: string;
  title: string;
  company_name: string;
  status: string | null;
};

type CandidateLite = {
  id: string;
  project_id: string | null;
  full_name: string;
  current_title: string | null;
  current_company: string | null;
  archetype: string | null;
  pipeline_stage: string | null;
  cv_processing: boolean;
  updated_at: string;
};

type ScoreLite = {
  candidate_id: string;
  rank_position: number | null;
  overall_score: number | null;
  tier: string | null;
};

// Stronger pipeline chips: each stage gets a filled background tinted to
// the same family as its border, so the chip reads as a state badge
// rather than just an outline. Hired/Rejected are the loudest since
// they're terminal states.
const STAGE_TONES: Record<string, string> = {
  found: "bg-surface-container-high border-outline-variant text-on-surface-variant",
  reviewed: "bg-primary-container/10 border-primary-container/50 text-primary",
  matched: "bg-primary-container/10 border-primary-container/50 text-primary",
  shortlisted:
    "bg-secondary-fixed-dim/10 border-secondary-fixed-dim/50 text-secondary-fixed-dim",
  submitted:
    "bg-secondary-fixed-dim/10 border-secondary-fixed-dim/50 text-secondary-fixed-dim",
  interviewed: "bg-tertiary/10 border-tertiary/50 text-tertiary",
  passed_rounds: "bg-tertiary/10 border-tertiary/50 text-tertiary",
  finalist:
    "bg-secondary-fixed-dim/15 border-secondary-fixed-dim/70 text-secondary-fixed-dim",
  offer:
    "bg-secondary-fixed-dim/15 border-secondary-fixed-dim/70 text-secondary-fixed-dim",
  hired:
    "bg-secondary-fixed-dim/20 border-secondary-fixed-dim text-secondary-fixed-dim",
  rejected: "bg-error/10 border-error/60 text-error",
};

// Archetype chips also get filled backgrounds so they sit on the same
// visual weight as pipeline stages; a recruiter scanning a row should
// see two equally-weighted state badges, not "stage" louder than
// "archetype".
const ARCHETYPE_TONES: Record<Archetype, string> = {
  Builder: "bg-primary-container/10 border-primary-container/50 text-primary",
  Operator:
    "bg-secondary-fixed-dim/10 border-secondary-fixed-dim/50 text-secondary-fixed-dim",
  Transformer: "bg-tertiary/10 border-tertiary/50 text-tertiary",
  Infrastructure:
    "bg-surface-container-high border-outline-variant text-on-surface-variant",
};

export default async function GlobalCandidatesPage() {
  const supabase = await createServerSupabaseClient();

  const [projectsQ, candidatesQ, scoresQ] = await Promise.all([
    supabase
      .from("projects")
      .select("id, title, company_name, status")
      .order("created_at", { ascending: false }),
    supabase
      .from("candidates")
      .select(
        "id, project_id, full_name, current_title, current_company, archetype, pipeline_stage, cv_processing, updated_at"
      )
      .order("updated_at", { ascending: false }),
    supabase
      .from("candidate_scores")
      .select("candidate_id, rank_position, overall_score, tier"),
  ]);

  const projects = (projectsQ.data ?? []) as ProjectLite[];
  const candidates = (candidatesQ.data ?? []) as CandidateLite[];
  const scores = (scoresQ.data ?? []) as ScoreLite[];

  const scoresByCandidate = new Map<string, ScoreLite>();
  for (const s of scores) scoresByCandidate.set(s.candidate_id, s);

  // Group candidates by project. Iteration order = projects.order — newest
  // mandate first matches the dashboard root.
  const grouped = new Map<string, CandidateLite[]>();
  for (const project of projects) grouped.set(project.id, []);
  for (const candidate of candidates) {
    if (!candidate.project_id) continue;
    const list = grouped.get(candidate.project_id);
    if (list) list.push(candidate);
  }

  return (
    <div className="p-6 space-y-6">
      <header className="flex justify-between items-end gap-4 flex-wrap">
        <div>
          <h1 className="font-h1 text-h1 text-primary">CANDIDATE PORTFOLIO</h1>
          <p className="font-mono-label text-mono-label text-outline uppercase tracking-widest mt-1">
            {candidates.length} candidate{candidates.length === 1 ? "" : "s"}{" "}
            across {projects.length} mandate{projects.length === 1 ? "" : "s"}
          </p>
        </div>
        <Link
          href="/app/projects/new"
          prefetch={false}
          className="px-4 py-2 bg-primary-container text-on-primary-container font-mono-label text-mono-label uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-all flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-[14px]">add</span>
          New Search
        </Link>
      </header>

      {projects.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-4">
          {projects.map((project) => {
            const list = grouped.get(project.id) ?? [];
            return (
              <ProjectGroup
                key={project.id}
                project={project}
                candidates={list}
                scores={scoresByCandidate}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="bg-surface-container-low border border-outline-variant p-12 flex flex-col items-center text-center space-y-4">
      <div className="w-16 h-16 rounded-full bg-primary-container/10 border border-primary-container/40 flex items-center justify-center">
        <span
          className="material-symbols-outlined text-[28px] text-primary"
          style={{ fontVariationSettings: "'FILL' 1" }}
        >
          groups
        </span>
      </div>
      <div className="space-y-2 max-w-md">
        <h2 className="font-h2 text-h2">No candidates yet</h2>
        <p className="text-body-main text-on-surface-variant">
          Start a search and upload candidate CVs — they&rsquo;ll appear
          here grouped by mandate.
        </p>
      </div>
    </div>
  );
}

function ProjectGroup({
  project,
  candidates,
  scores,
}: {
  project: ProjectLite;
  candidates: CandidateLite[];
  scores: Map<string, ScoreLite>;
}) {
  // Each project gets a mast-head chapter break (matches the ranking
  // tier-section treatment) so a long org-wide scroll has visible
  // structure. The mast-head links to the project page; row card below
  // is a separate target.
  return (
    <section className="space-y-2">
      <Link
        href={`/app/projects/${project.id}`}
        prefetch={false}
        className="block group"
      >
        <MastHead
          tone={(project.status ?? "active") === "active" ? "primary" : "neutral"}
          icon="folder_open"
          label={
            <span className="flex items-center gap-2">
              <span className="truncate max-w-[18rem] group-hover:underline">
                {project.title}
              </span>
              <span className="text-outline">·</span>
              <span className="text-outline truncate max-w-[14rem]">
                {project.company_name}
              </span>
            </span>
          }
          meta={
            <span className="flex items-center gap-2">
              <span>
                {candidates.length} candidate{candidates.length === 1 ? "" : "s"}
              </span>
              <span
                className={cn(
                  "px-1.5 py-0.5 border",
                  (project.status ?? "active") === "active"
                    ? "border-secondary/40 text-secondary"
                    : "border-outline-variant text-outline"
                )}
              >
                {project.status ?? "active"}
              </span>
            </span>
          }
        />
      </Link>
      {candidates.length === 0 ? (
        <div className="bg-surface-container-low border border-outline-variant p-4 text-body-main text-outline italic">
          No candidates uploaded yet.{" "}
          <Link
            href={`/app/projects/${project.id}/candidates/new`}
            prefetch={false}
            className="text-primary hover:underline not-italic"
          >
            Add one
          </Link>
          .
        </div>
      ) : (
        <ul className="bg-surface-container-low border border-outline-variant divide-y divide-outline-variant/40">
          {candidates.map((c) => (
            <CandidateRow
              key={c.id}
              projectId={project.id}
              candidate={c}
              score={scores.get(c.id)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function CandidateRow({
  projectId,
  candidate,
  score,
}: {
  projectId: string;
  candidate: CandidateLite;
  score: ScoreLite | undefined;
}) {
  const stage = (candidate.pipeline_stage ?? "found") as PipelineStage;
  const archetype = candidate.archetype as Archetype | null;
  return (
    <li>
      <Link
        href={`/app/projects/${projectId}/candidates/${candidate.id}`}
        prefetch={false}
        className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-container-high transition-colors group"
      >
        <span className="w-9 h-9 rounded bg-surface-container border border-outline-variant flex items-center justify-center font-mono-data text-mono-data text-on-surface uppercase shrink-0">
          {initials(candidate.full_name)}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-on-surface text-body-main font-semibold truncate">
              {candidate.full_name}
            </span>
            {candidate.cv_processing && (
              <span className="font-mono-label text-mono-label text-primary uppercase tracking-wider flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[12px] animate-spin">
                  progress_activity
                </span>
                Parsing
              </span>
            )}
          </div>
          <div className="font-mono-data text-body-main text-on-surface-variant truncate">
            {candidate.current_title ?? "—"}
            {candidate.current_company ? ` @ ${candidate.current_company}` : ""}
          </div>
        </div>
        <div className="hidden md:flex items-center gap-2 shrink-0">
          {score?.rank_position != null && score.overall_score != null && (
            <span className="font-mono-label text-mono-label text-outline uppercase tracking-wider">
              #{String(score.rank_position).padStart(2, "0")} ·{" "}
              <span className="text-primary tabular-nums">
                {score.overall_score.toFixed(1)}
              </span>
            </span>
          )}
          {archetype && (
            <span
              className={cn(
                "px-2 py-0.5 border font-mono-label text-mono-label uppercase tracking-wider",
                ARCHETYPE_TONES[archetype]
              )}
            >
              {archetype}
            </span>
          )}
          <span
            className={cn(
              "px-2 py-0.5 border font-mono-label text-mono-label uppercase tracking-wider",
              STAGE_TONES[stage] ?? STAGE_TONES.found
            )}
          >
            {PIPELINE_LABELS[stage]}
          </span>
        </div>
        <span className="font-mono-label text-mono-label text-outline uppercase tracking-wider hidden lg:inline">
          {formatRelative(candidate.updated_at)}
        </span>
        <span className="material-symbols-outlined text-[18px] text-outline group-hover:text-primary transition-colors">
          chevron_right
        </span>
      </Link>
    </li>
  );
}

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase() ?? "")
      .join("") || "??"
  );
}

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime();
  const diffMs = Date.now() - t;
  const min = Math.round(diffMs / 60_000);
  if (min < 1) return "JUST NOW";
  if (min < 60) return `${min}M AGO`;
  const hrs = Math.round(min / 60);
  if (hrs < 24) return `${hrs}H AGO`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}D AGO`;
  return new Date(iso).toISOString().slice(0, 10);
}
