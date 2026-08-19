import Link from "next/link";
import { notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { requirePortalAccess } from "@/lib/auth/portal-access";
import { normaliseRecruiterAssessment } from "@/lib/recruiter-assessment";
import {
  buildCandidateEvidence,
  buildComparisonGrid,
} from "@/lib/comparison/evidence-index";
import { extractEvidence } from "@/lib/comparison/evidence-extractors";
import type { CandidateProfile } from "@/lib/ai/cv-parsing";
import type { CalibrationModel } from "@/lib/ai/role-analysis";
import {
  PortalContent,
  buildPortalCandidate,
  type PortalCandidate,
} from "@/app/(dashboard)/app/projects/[id]/hiring-manager/portal-content";
import { HM_RATING_LABELS, type HmRating } from "@/app/(dashboard)/app/projects/[id]/hiring-manager/feedback-constants";

/**
 * One shared mandate, seen from the client side. The payload comes from
 * `portal_get_mandate` (069) under the caller's own session — the RPC
 * verified share ∧ grant in-database and returned only the slate, so the
 * shaping below works with exactly what the hiring manager may see, which
 * is also everything a browser console could get from the same call.
 */

type PortalPayload = {
  project: {
    id: string;
    title: string;
    company_name: string;
    status: string | null;
    calibration_model: Partial<CalibrationModel> | null;
  };
  shortlist: { candidate_ids: string[] | null; updated_at: string | null } | null;
  candidates: Array<{
    id: string;
    full_name: string;
    current_title: string | null;
    current_company: string | null;
    cv_structured: unknown;
    recruiter_assessment: unknown;
    pipeline_stage: string | null;
  }>;
  scores: Array<{
    candidate_id: string;
    rank_position: number | null;
    overall_score: number | null;
    tier: string | null;
    technical_score: number | null;
    domain_score: number | null;
    leadership_score: number | null;
    regulatory_score: number | null;
    transformation_score: number | null;
  }>;
  progress: { candidates_total: number; candidates_reviewed: number };
};

type ReviewRow = {
  id: string;
  candidate_ratings: Record<string, { rating: HmRating; feedback: string }>;
  top_concern: string;
  priority_order: string[];
  submitted_at: string;
};

export default async function PortalMandatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requirePortalAccess();
  const supabase = await createServerSupabaseClient();

  const [{ data: payloadRaw, error }, { data: reviewsRaw }] = await Promise.all([
    supabase.rpc("portal_get_mandate", { p_project_id: id }),
    supabase.rpc("portal_list_my_reviews", { p_project_id: id }),
  ]);

  if (error) {
    console.error("[portal] mandate read failed", error);
  }
  const payload = (payloadRaw ?? null) as PortalPayload | null;
  if (!payload) {
    // Not shared, not granted, or not a mandate at all — the RPC does not
    // distinguish, and neither should the page.
    notFound();
  }

  const myReviews = (reviewsRaw ?? []) as ReviewRow[];

  // The slate rows are already sliced in-database; the ordering authority
  // is the shortlist when it exists, rank otherwise — same rule as the
  // token portal's shapeSlate, pinned by the invariants file.
  const scoreById = new Map(payload.scores.map((s) => [s.candidate_id, s]));
  const candById = new Map(payload.candidates.map((c) => [c.id, c]));
  const orderedIds = payload.shortlist?.candidate_ids?.length
    ? payload.shortlist.candidate_ids.filter((cid) => candById.has(cid))
    : payload.candidates
        .map((c) => c.id)
        .sort(
          (a, b) =>
            (scoreById.get(a)?.rank_position ?? 999) -
            (scoreById.get(b)?.rank_position ?? 999)
        );

  const portalCandidates = orderedIds
    .map((cid) => {
      const base = candById.get(cid);
      if (!base) return null;
      return buildPortalCandidate(
        base,
        scoreById.get(cid) ?? null,
        normaliseRecruiterAssessment(base.recruiter_assessment)
      );
    })
    .filter((c): c is PortalCandidate => c != null);

  const progress = {
    candidates_reviewed: payload.progress.candidates_reviewed,
    candidates_total: payload.progress.candidates_total,
    last_updated: payload.shortlist?.updated_at ?? null,
    search_status: payload.shortlist?.candidate_ids?.length
      ? "Shortlist live"
      : payload.progress.candidates_total > 0
        ? "Slate building"
        : "Search opening",
  };

  const weights = payload.project.calibration_model?.dimension_weights ?? null;
  const evidenceGrid = buildComparisonGrid(
    portalCandidates.map((pc) => {
      const source = candById.get(pc.id);
      return buildCandidateEvidence(
        {
          candidate_id: pc.id,
          full_name: pc.full_name,
          items: extractEvidence({
            scores: scoreById.get(pc.id) ?? null,
            cv:
              source?.cv_structured && typeof source.cv_structured === "object"
                ? (source.cv_structured as Partial<CandidateProfile>)
                : null,
            recruiter: normaliseRecruiterAssessment(source?.recruiter_assessment)
              .dimension_notes,
          }),
        },
        weights
      );
    }),
    weights
  );

  return (
    <div className="space-y-8">
      <p className="font-mono-label text-mono-label uppercase tracking-widest text-outline">
        <Link href="/portal" className="transition-colors hover:text-primary">
          Your searches
        </Link>
        {" // "}
        {payload.project.title}
      </p>

      <PortalContent
        projectId={payload.project.id}
        projectTitle={payload.project.title}
        companyName={payload.project.company_name}
        candidates={portalCandidates}
        progress={progress}
        mode="hiring_manager"
        submitHandle={payload.project.id}
        submitPath={`/portal/api/mandates/${payload.project.id}/submit`}
        evidenceGrid={evidenceGrid}
      />

      {myReviews.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-mono-label text-mono-label uppercase tracking-widest text-outline">
            Your previous feedback
          </h2>
          <ul className="space-y-3">
            {myReviews.map((r) => (
              <li
                key={r.id}
                className="border border-outline-variant bg-surface-container px-5 py-4"
              >
                <p className="font-mono-label text-mono-label uppercase tracking-wider text-outline">
                  Submitted{" "}
                  {new Date(r.submitted_at).toLocaleString("en-GB", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
                <ul className="mt-2 space-y-1">
                  {Object.entries(r.candidate_ratings).map(([cid, entry]) => (
                    <li key={cid} className="text-body-main text-on-surface-variant">
                      <span className="text-on-surface">
                        {candById.get(cid)?.full_name ?? "Candidate no longer on the slate"}
                      </span>
                      {" — "}
                      {HM_RATING_LABELS[entry.rating] ?? entry.rating}
                      {entry.feedback ? `: ${entry.feedback}` : ""}
                    </li>
                  ))}
                </ul>
                {r.top_concern && (
                  <p className="mt-2 text-body-main text-on-surface-variant">
                    <span className="font-mono-label text-mono-label uppercase tracking-wider text-outline">
                      Top concern{" "}
                    </span>
                    {r.top_concern}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
