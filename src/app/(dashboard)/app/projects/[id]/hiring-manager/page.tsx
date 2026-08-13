import { notFound, redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { SetBreadcrumbs } from "@/components/dashboard/breadcrumbs";
import { normaliseRecruiterAssessment } from "@/lib/recruiter-assessment";
import { ShareLinkCard, type HmTokenRow } from "./share-link-card";
import {
  PortalContent,
  buildPortalCandidate,
  type PortalCandidate,
  type PortalProgress,
} from "./portal-content";

type ProjectRow = {
  id: string;
  title: string;
  company_name: string;
  status: string | null;
};

type ShortlistRow = {
  candidate_ids: string[];
  updated_at: string;
};

type CandidateRow = {
  id: string;
  full_name: string;
  current_title: string | null;
  current_company: string | null;
  cv_structured: unknown;
  recruiter_assessment: unknown;
};

type ScoreRow = {
  candidate_id: string;
  rank_position: number | null;
  overall_score: number | null;
  tier: string | null;
  technical_score: number | null;
  domain_score: number | null;
  leadership_score: number | null;
  regulatory_score: number | null;
  transformation_score: number | null;
};

export default async function HiringManagerPortalFounderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, title, company_name, status")
    .eq("id", id)
    .single<ProjectRow>();

  if (projectError || !project) {
    if (projectError?.code === "PGRST116") notFound();
    redirect("/");
  }

  const [shortlistQ, candidatesQ, scoresQ, tokensQ] = await Promise.all([
    supabase
      .from("shortlists")
      .select("candidate_ids, updated_at")
      .eq("project_id", id)
      .maybeSingle<ShortlistRow>(),
    supabase
      .from("candidates")
      .select(
        "id, full_name, current_title, current_company, cv_structured, recruiter_assessment, pipeline_stage"
      )
      .eq("project_id", id),
    supabase
      .from("candidate_scores")
      .select(
        "candidate_id, rank_position, overall_score, tier, technical_score, domain_score, leadership_score, regulatory_score, transformation_score"
      )
      .eq("project_id", id),
    supabase
      .from("hiring_manager_tokens")
      .select(
        "id, token, label, created_at, expires_at, revoked_at, last_used_at"
      )
      .eq("project_id", id)
      .order("created_at", { ascending: false }),
  ]);

  const shortlist = shortlistQ.data;
  const allCandidates = (candidatesQ.data ?? []) as Array<
    CandidateRow & { pipeline_stage: string | null }
  >;
  const scores = (scoresQ.data ?? []) as ScoreRow[];
  const tokens = (tokensQ.data ?? []) as HmTokenRow[];

  const portalCandidates = shapeSlate(shortlist, allCandidates, scores);
  const progress = computeProgress(allCandidates, shortlist);

  return (
    <div className="px-6 py-6 space-y-5 max-w-[1400px] mx-auto">
      <SetBreadcrumbs
        crumbs={[
          { label: project.title, href: `/app/projects/${project.id}`, maxChars: 32 },
          { label: "Hiring Manager Portal" },
        ]}
      />

      <ShareLinkCard projectId={project.id} tokens={tokens} />

      <div className="font-mono-label text-mono-label text-outline uppercase tracking-widest pt-2">
        ▼ Portal Preview · this is what the hiring manager sees
      </div>

      <PortalContent
        projectId={project.id}
        projectTitle={project.title}
        companyName={project.company_name}
        candidates={portalCandidates}
        progress={progress}
        mode="founder"
        submitHandle="preview"
      />
    </div>
  );
}

function shapeSlate(
  shortlist: ShortlistRow | null,
  candidates: Array<CandidateRow & { pipeline_stage: string | null }>,
  scores: ScoreRow[]
): PortalCandidate[] {
  const candById = new Map(candidates.map((c) => [c.id, c]));
  const scoreById = new Map<string, ScoreRow>();
  for (const s of scores) scoreById.set(s.candidate_id, s);

  // If a shortlist exists, use its order. Otherwise fall back to all
  // ranked candidates ordered by rank.
  const ids = shortlist?.candidate_ids?.length
    ? shortlist.candidate_ids
    : candidates
        .map((c) => c.id)
        .filter((cid) => scoreById.get(cid)?.rank_position != null)
        .sort((a, b) => {
          const ar = scoreById.get(a)?.rank_position ?? 999;
          const br = scoreById.get(b)?.rank_position ?? 999;
          return ar - br;
        })
        .slice(0, 5);

  return ids
    .map((cid) => {
      const base = candById.get(cid);
      if (!base) return null;
      const score = scoreById.get(cid) ?? null;
      const recruiter = normaliseRecruiterAssessment(base.recruiter_assessment);
      return buildPortalCandidate(base, score, recruiter);
    })
    .filter((c): c is PortalCandidate => c != null);
}

function computeProgress(
  candidates: Array<CandidateRow & { pipeline_stage: string | null }>,
  shortlist: ShortlistRow | null
): PortalProgress {
  const reviewed = candidates.filter((c) => {
    const stage = c.pipeline_stage ?? "found";
    return [
      "reviewed",
      "matched",
      "shortlisted",
      "submitted",
      "interviewed",
      "passed_rounds",
      "finalist",
      "offer",
      "hired",
    ].includes(stage);
  }).length;
  return {
    candidates_reviewed: reviewed,
    candidates_total: candidates.length,
    last_updated: shortlist?.updated_at ?? null,
    search_status: shortlist?.candidate_ids?.length
      ? "Shortlist live"
      : candidates.length > 0
        ? "Slate building"
        : "Sourcing",
  };
}
