import { notFound, redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  type Archetype,
  type CandidateProfile,
  type PipelineStage,
} from "@/lib/ai/cv-parsing";
import { normalizeReport } from "@/lib/ai/shortlist-report";
import { buildDimensionRows } from "@/lib/ranking/dimension-rows";
import type { CalibrationModel } from "@/lib/ai/role-analysis";
import { normaliseRecruiterAssessment } from "@/lib/recruiter-assessment";
import { ShortlistBuilder, type PoolCandidate } from "./shortlist-builder";
import { isSampleId } from "@/lib/sample";
import { SampleShortlist } from "@/components/sample/sample-shortlist";

type ProjectRow = {
  id: string;
  title: string;
  company_name: string;
  /** §196 — needed to know which axes this mandate scores on. */
  calibration_model: Partial<CalibrationModel> | null;
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
  recruiter_assessment: unknown;
};

type ScoreLite = {
  candidate_id: string;
  technical_score: number | null;
  domain_score: number | null;
  leadership_score: number | null;
  regulatory_score: number | null;
  transformation_score: number | null;
  custom_scores: Record<string, unknown> | null;
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

  // The sample shows a *submitted* slate rather than the builder: almost
  // every control here is a write, and Larkspur is at WITH CLIENT, so the
  // record is the state the mandate is genuinely in.
  if (isSampleId(id)) return <SampleShortlist id={id} />;
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
        "id, full_name, current_title, current_company, archetype, pipeline_stage, cv_structured, recruiter_assessment"
      )
      .eq("project_id", id),
    supabase
      .from("candidate_scores")
      .select(
        "candidate_id, technical_score, domain_score, leadership_score, regulatory_score, transformation_score, custom_scores, overall_score, rank_position, tier"
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
      const recruiter = normaliseRecruiterAssessment(c.recruiter_assessment);
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
        recruiter_tier: recruiter.tier,
        // §196 slice 2 — every axis the rank shown on this card was
        // computed from, not the five the card used to assume.
        dimensions: buildDimensionRows({
          calibration: project.calibration_model,
          core: score ?? null,
          customScores: score?.custom_scores,
        }),
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

