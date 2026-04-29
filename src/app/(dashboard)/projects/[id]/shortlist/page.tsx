import { notFound, redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  type Archetype,
  type CandidateProfile,
  type FitDimensions,
  type PipelineStage,
} from "@/lib/ai/cv-parsing";
import { normalizeReport } from "@/lib/ai/shortlist-report";
import { ShortlistBuilder, type PoolCandidate } from "./shortlist-builder";

type ProjectRow = {
  id: string;
  title: string;
  company_name: string;
};

type ShortlistRow = {
  id: string;
  slate_size: number;
  candidate_ids: string[];
  narrative: string;
  report_content: unknown;
  submitted_at: string | null;
  updated_at: string;
};

type CandidateLite = {
  id: string;
  full_name: string;
  current_title: string | null;
  current_company: string | null;
  archetype: string | null;
  pipeline_stage: string | null;
  cv_structured: unknown;
};

type ScoreLite = {
  candidate_id: string;
  technical_score: number | null;
  domain_score: number | null;
  leadership_score: number | null;
  regulatory_score: number | null;
  transformation_score: number | null;
  overall_score: number | null;
  rank_position: number | null;
  tier: string | null;
};

export default async function ShortlistPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, title, company_name")
    .eq("id", id)
    .single<ProjectRow>();

  if (projectError || !project) {
    if (projectError?.code === "PGRST116") notFound();
    redirect("/");
  }

  const [shortlistQ, candidatesQ, scoresQ] = await Promise.all([
    supabase
      .from("shortlists")
      .select(
        "id, slate_size, candidate_ids, narrative, report_content, submitted_at, updated_at"
      )
      .eq("project_id", id)
      .maybeSingle<ShortlistRow>(),
    supabase
      .from("candidates")
      .select(
        "id, full_name, current_title, current_company, archetype, pipeline_stage, cv_structured"
      )
      .eq("project_id", id),
    supabase
      .from("candidate_scores")
      .select(
        "candidate_id, technical_score, domain_score, leadership_score, regulatory_score, transformation_score, overall_score, rank_position, tier"
      )
      .eq("project_id", id),
  ]);

  const candidates = (candidatesQ.data ?? []) as CandidateLite[];
  const scores = (scoresQ.data ?? []) as ScoreLite[];
  const scoresByCandidate = new Map<string, ScoreLite>();
  for (const s of scores) scoresByCandidate.set(s.candidate_id, s);

  const pool: PoolCandidate[] = candidates
    .map((c) => {
      const score = scoresByCandidate.get(c.id);
      const profile = (c.cv_structured ?? {}) as Partial<CandidateProfile>;
      return {
        id: c.id,
        full_name: c.full_name,
        current_title: c.current_title,
        current_company: c.current_company,
        archetype: c.archetype as Archetype | null,
        pipeline_stage: (c.pipeline_stage ?? "found") as PipelineStage,
        rank: score?.rank_position ?? null,
        overall: score?.overall_score ?? null,
        tier: score?.tier ?? null,
        fit_dimensions: extractFit(score),
        headline: profile.summary?.split(/(?<=[.!?])\s/)[0] ?? null,
      };
    })
    .filter((c) => c.rank != null && c.overall != null)
    .sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));

  const shortlist = shortlistQ.data ?? null;
  const candidateById = new Map(pool.map((c) => [c.id, c]));

  // Slate cards in the recruiter's chosen order. Drop any ids that
  // reference deleted/unscored candidates so the UI never renders a
  // dead reference.
  const slate = (shortlist?.candidate_ids ?? [])
    .map((cid) => candidateById.get(cid))
    .filter((c): c is PoolCandidate => c != null);

  return (
    <ShortlistBuilder
      projectId={project.id}
      roleTitle={project.title}
      companyName={project.company_name}
      pool={pool}
      slate={slate}
      slateSize={shortlist?.slate_size ?? 3}
      narrative={shortlist?.narrative ?? ""}
      report={normalizeReport(shortlist?.report_content ?? null)}
      submittedAt={shortlist?.submitted_at ?? null}
    />
  );
}

function extractFit(score: ScoreLite | undefined): FitDimensions | null {
  if (!score) return null;
  const dims = [
    score.technical_score,
    score.domain_score,
    score.leadership_score,
    score.regulatory_score,
    score.transformation_score,
  ];
  if (dims.some((v) => typeof v !== "number")) return null;
  return {
    technical: score.technical_score ?? 0,
    domain: score.domain_score ?? 0,
    leadership: score.leadership_score ?? 0,
    regulatory: score.regulatory_score ?? 0,
    transformation: score.transformation_score ?? 0,
  };
}
