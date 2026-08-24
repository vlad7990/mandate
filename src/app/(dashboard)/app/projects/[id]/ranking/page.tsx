import Link from "next/link";
import { TerminalTitle } from "@/components/ui/page-shell";
import { CapabilityGate } from "@/components/auth/capability-gate";
import { notFound, redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  ARCHETYPES,
  type CandidateProfile,
} from "@/lib/ai/cv-parsing";
import { runRankerScoring } from "@/lib/ranking/agent-ranker";
import { type Tier } from "@/lib/ranking/tiers";
import type { CalibrationModel } from "@/lib/ai/role-analysis";
import { SetBreadcrumbs } from "@/components/dashboard/breadcrumbs";
import { LiveTick } from "@/components/ui/live-tick";
import { MastHead } from "@/components/ui/mast-head";
import { RefreshScoresButton } from "./refresh-button";
import {
  PerspectiveLeaderboard,
  type LeaderboardEntry,
} from "./perspective-leaderboard";
import type { RankChangeReason } from "./rank-change-types";
import {
  IconAnalytics,
  IconCompare,
  IconLeaderboard,
  IconPencil,
  IconRefresh,
  IconSkills,
  IconUpload,
} from "@/components/icons";
import { isSampleId } from "@/lib/sample";
import { SampleRanking } from "@/components/sample/sample-reports";

type ProjectRow = {
  id: string;
  title: string;
  company_name: string;
  calibration_model: Partial<CalibrationModel> | null;
};

type CandidateBase = {
  id: string;
  full_name: string;
  current_title: string | null;
  current_company: string | null;
  archetype: string | null;
  pipeline_stage: string | null;
  cv_processing: boolean;
  cv_structured: unknown;
  recruiter_assessment: unknown;
};

type ScoreRow = {
  candidate_id: string;
  technical_score: number | null;
  domain_score: number | null;
  leadership_score: number | null;
  regulatory_score: number | null;
  transformation_score: number | null;
  overall_score: number | null;
  tier: string | null;
  rank_position: number | null;
  previous_rank: number | null;
  rank_changed_at: string | null;
  rank_change_reason: RankChangeReason | null;
  updated_at: string | null;
};

void ARCHETYPES;

export default async function RankingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Not in the sample workspace yet — W5/W6. Says so, rather than
  // redirecting to `/app/home` the way it used to.
  if (isSampleId(id)) return <SampleRanking id={id} />;
  const supabase = await createServerSupabaseClient();

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, title, company_name, calibration_model")
    .eq("id", id)
    .single<ProjectRow>();

  if (projectError || !project) {
    if (projectError?.code === "PGRST116") notFound();
    redirect("/");
  }

  // Pull every parsed candidate. Score rows pivot off these.
  const { data: rawCandidates } = await supabase
    .from("candidates")
    .select(
      "id, full_name, current_title, current_company, archetype, pipeline_stage, cv_processing, cv_structured, recruiter_assessment"
    )
    .eq("project_id", id);

  const candidates = (rawCandidates ?? []) as CandidateBase[];
  const parsedCount = candidates.filter(
    (c) => !c.cv_processing && hasFitDimensions(c.cv_structured)
  ).length;

  // Auto-score on first visit if there are parsed candidates with no
  // canonical score row yet.
  const { data: existingScoresHead } = await supabase
    .from("candidate_scores")
    .select("id")
    .eq("project_id", id)
    .limit(1);

  const needsInitialScore =
    parsedCount > 0 && (existingScoresHead?.length ?? 0) === 0;

  if (needsInitialScore) {
    // Under the RANKER's session (075), not the viewer's: before the
    // conversion a viewer's first visit could never score at all —
    // candidate_scores INSERT needs candidates:write, which org:read
    // does not carry. The agent's named grant makes the read-repair
    // lawful for any first visitor; a refused ranker (suspended,
    // credential-less) logs inside runRankerScoring and the page
    // renders whatever scores exist.
    try {
      await runRankerScoring(id);
    } catch (err) {
      console.error("[ranking] initial scoring failed", err);
    }
  }

  const { data: scoreRows } = await supabase
    .from("candidate_scores")
    .select(
      "candidate_id, technical_score, domain_score, leadership_score, regulatory_score, transformation_score, overall_score, tier, rank_position, previous_rank, rank_changed_at, rank_change_reason, updated_at"
    )
    .eq("project_id", id)
    .order("rank_position", { ascending: true });

  const scoresByCandidate = new Map<string, ScoreRow>();
  for (const row of (scoreRows ?? []) as ScoreRow[]) {
    scoresByCandidate.set(row.candidate_id, row);
  }

  const ranked: LeaderboardEntry[] = [];
  const unscored: CandidateBase[] = [];
  for (const c of candidates) {
    const score = scoresByCandidate.get(c.id);
    if (
      score &&
      score.tier &&
      score.rank_position != null &&
      score.technical_score != null &&
      score.domain_score != null &&
      score.leadership_score != null &&
      score.regulatory_score != null &&
      score.transformation_score != null &&
      score.overall_score != null
    ) {
      ranked.push({
        candidate: {
          id: c.id,
          full_name: c.full_name,
          current_title: c.current_title,
          current_company: c.current_company,
          archetype: c.archetype,
          pipeline_stage: c.pipeline_stage,
          recruiter_assessment: c.recruiter_assessment,
        },
        score: {
          candidate_id: score.candidate_id,
          technical_score: score.technical_score,
          domain_score: score.domain_score,
          leadership_score: score.leadership_score,
          regulatory_score: score.regulatory_score,
          transformation_score: score.transformation_score,
          overall_score: score.overall_score,
          tier: score.tier as Tier,
          rank_position: score.rank_position,
          previous_rank: score.previous_rank,
          rank_changed_at: score.rank_changed_at,
          rank_change_reason: score.rank_change_reason,
          updated_at: score.updated_at,
        },
      });
    } else {
      unscored.push(c);
    }
  }
  ranked.sort((a, b) => a.score.rank_position - b.score.rank_position);

  const lastUpdated = ranked
    .map((r) => r.score.updated_at)
    .filter((u): u is string => !!u)
    .sort()
    .pop();

  return (
    <div className="px-6 py-6 space-y-5 max-w-[1600px] mx-auto">
      <SetBreadcrumbs
        crumbs={[
          { label: project.title, href: `/app/projects/${project.id}`, maxChars: 32 },
          { label: "Ranking" },
        ]}
      />

      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div className="space-y-2 min-w-0">
          <TerminalTitle>RANK_LEADERBOARD</TerminalTitle>
          <p className="font-mono-label text-mono-label text-on-surface-variant uppercase tracking-widest tabular-nums">
            <span className="text-primary">{String(ranked.length).padStart(2, "0")}</span>{" "}
            ranked · {String(unscored.length).padStart(2, "0")} pending parse ·{" "}
            {project.company_name}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {lastUpdated && <LiveTick iso={lastUpdated} label="Computed" />}
          <Link
            href={`/app/projects/${project.id}/feedback`}
            prefetch={false}
            className="px-3 py-1.5 border border-outline-variant text-on-surface-variant font-mono-label text-mono-label uppercase tracking-widest hover:border-primary hover:text-primary transition-colors flex items-center gap-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <IconPencil size={14} />
            Feedback
          </Link>
          <RefreshScoresButton projectId={project.id} />
          <Link
            href={`/app/projects/${project.id}/ranking/compare`}
            prefetch={false}
            className="px-3 py-1.5 border border-outline-variant text-on-surface-variant font-mono-label text-mono-label uppercase tracking-widest hover:border-primary hover:text-primary transition-colors flex items-center gap-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <IconCompare size={14} />
            Compare
          </Link>
          <Link
            href={`/app/projects/${project.id}/comparison`}
            prefetch={false}
            className="px-3 py-1.5 border border-outline-variant text-on-surface-variant font-mono-label text-mono-label uppercase tracking-widest hover:border-primary hover:text-primary transition-colors flex items-center gap-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <IconAnalytics size={14} />
            Full Comparison
          </Link>
          <Link
            href={`/app/projects/${project.id}/shortlist`}
            prefetch={false}
            className="px-3 py-1.5 btn-notch bg-primary-container text-on-primary-container font-mono-label text-mono-label uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-[filter,transform] flex items-center gap-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <IconSkills size={14} />
            Build Shortlist
          </Link>
        </div>
      </header>

      {ranked.length === 0 ? (
        <EmptyState
          projectId={project.id}
          parsedCount={parsedCount}
          hasCandidates={candidates.length > 0}
        />
      ) : (
        <PerspectiveLeaderboard
          projectId={project.id}
          calibrationWeights={
            project.calibration_model?.dimension_weights ?? null
          }
          entries={ranked}
        />
      )}

      {unscored.length > 0 && (
        <UnscoredSection projectId={project.id} candidates={unscored} />
      )}
    </div>
  );
}

function hasFitDimensions(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  const profile = raw as Partial<CandidateProfile>;
  const fit = profile.fit_dimensions;
  return (
    !!fit &&
    typeof fit.technical === "number" &&
    typeof fit.domain === "number" &&
    typeof fit.leadership === "number" &&
    typeof fit.regulatory === "number" &&
    typeof fit.transformation === "number"
  );
}

function EmptyState({
  projectId,
  parsedCount,
  hasCandidates,
}: {
  projectId: string;
  parsedCount: number;
  hasCandidates: boolean;
}) {
  return (
    <div className="bg-surface-container-low border border-outline-variant px-8 py-12 flex flex-col items-center text-center space-y-4 relative overflow-hidden">
      <div
        className="absolute inset-0 terminal-grid opacity-10 pointer-events-none"
        aria-hidden
      />
      <div className="relative w-16 h-16 border border-primary-container/40 bg-primary-container/10 flex items-center justify-center">
        <IconLeaderboard size={28} className="text-primary" />
      </div>
      <div className="relative space-y-2 max-w-md">
        <h2 className="font-h2 text-h2 text-on-surface">Nothing to rank yet</h2>
        <p className="text-body-main text-on-surface-variant">
          {hasCandidates
            ? parsedCount === 0
              ? "Candidates exist but none have a parsed CV with fit_dimensions yet. Wait for the parsing agent to finish."
              : "Scores will compute on the next visit."
            : "Upload a candidate CV first — the ranking engine scores parsed profiles against the role's calibration weights."}
        </p>
      </div>
      <CapabilityGate capability="candidates:write">
        <Link
          href={`/app/projects/${projectId}/candidates/new`}
          prefetch={false}
          className="relative px-4 py-2 btn-notch bg-primary-container text-on-primary-container font-mono-label text-mono-label uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-[filter,transform] flex items-center gap-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <IconUpload size={16} />
          Add Candidate
        </Link>
      </CapabilityGate>
    </div>
  );
}


function UnscoredSection({
  projectId,
  candidates,
}: {
  projectId: string;
  candidates: CandidateBase[];
}) {
  return (
    <section className="space-y-2">
      <MastHead
        tone="neutral"
        label="Pending Parse"
        meta={
          <span className="tabular-nums">
            {String(candidates.length).padStart(2, "0")} candidate
            {candidates.length === 1 ? "" : "s"}
          </span>
        }
      />
      <ul className="bg-surface-container-low border border-outline-variant divide-y divide-outline-variant/40">
        {candidates.map((c) => (
          <li key={c.id}>
            <Link
              href={`/app/projects/${projectId}/candidates/${c.id}`}
              prefetch={false}
              className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-container-high transition-colors focus-visible:outline-none focus-visible:bg-surface-container-high focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary"
            >
              <IconRefresh size={16} className="text-outline animate-spin" />
              <div className="flex-1 min-w-0">
                <div className="text-on-surface text-body-main truncate">
                  {c.full_name}
                </div>
                <div className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
                  {c.cv_processing
                    ? "AI parse in flight"
                    : "Awaiting fit_dimensions — check candidate profile"}
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

