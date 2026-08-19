import { cn } from "@/lib/utils";
import { TIER_BANDS, type Tier } from "@/lib/ranking/tiers";
import { TierComparison } from "@/components/ui/tier-comparison";
import { type CandidateProfile, type FitDimensions } from "@/lib/ai/cv-parsing";
import { type CandidateEvaluation } from "@/lib/ai/candidate-evaluation";
import { type RecruiterAssessment } from "@/lib/recruiter-assessment";
import type { ComparisonGrid } from "@/lib/comparison/evidence-index";
import { EvidenceGrid } from "../comparison/evidence-grid";
import { HmFeedbackForm, type HmFeedbackCandidate } from "./feedback-form";
import { IconChevronRight } from "@/components/icons";

// Shared client-facing portal content. Used by:
//   - /projects/[id]/hiring-manager (founder preview, with share-link
//     header and feedback editor disabled)
//   - /hm/[token] (the public route, with the feedback editor enabled
//     and the share-link rail hidden).
//
// Server-rendered. The form is a client component embedded inline.

export type PortalCandidate = {
  id: string;
  full_name: string;
  current_title: string | null;
  current_company: string | null;
  rank: number | null;
  overall_score: number | null;
  ai_tier: Tier | null;
  recruiter_tier: Tier | null;
  fit_dimensions: FitDimensions | null;
  /** Top-of-CV summary line; may be null until parsing completes. */
  headline: string | null;
  /** Up to 3 strengths from the AI evaluation. */
  strengths: string[];
  /** Up to 2 gaps from the AI evaluation. */
  gaps: string[];
  /** Positioning opener from the AI evaluation, if generated. */
  positioning_opener: string | null;
  /** Final-verdict narrative, if available. */
  verdict_narrative: string | null;
};

export type PortalProgress = {
  candidates_reviewed: number;
  candidates_total: number;
  last_updated: string | null;
  search_status: string;
};

export type PortalProps = {
  projectId: string;
  projectTitle: string;
  companyName: string;
  candidates: PortalCandidate[];
  progress: PortalProgress;
  /** When `mode === "founder"`, the feedback form renders read-only. */
  mode: "founder" | "hiring_manager";
  /** Submission handle for the feedback form (token UUID, "preview" for founder). */
  submitHandle: string;
  /** Endpoint override for the signed-in /portal door; defaults to the token door. */
  submitPath?: string;
  /**
   * Evidence coverage for the slate. Rendered in the `client` variant, which
   * shows coverage state and gaps but never the recruiter's verbatim notes —
   * the same boundary buildPortalCandidate already draws by handing over the
   * recruiter's tier and not their fit_notes.
   */
  evidenceGrid?: ComparisonGrid | null;
};

export function PortalContent({
  projectTitle,
  companyName,
  candidates,
  progress,
  mode,
  submitHandle,
  submitPath,
  evidenceGrid,
}: PortalProps) {
  const formCandidates: HmFeedbackCandidate[] = candidates.map((c) => ({
    id: c.id,
    full_name: c.full_name,
    current_title: c.current_title,
    current_company: c.current_company,
    ai_tier: c.ai_tier,
    recruiter_tier: c.recruiter_tier,
  }));

  return (
    <div className="space-y-6">
      <ProgressHeader
        projectTitle={projectTitle}
        companyName={companyName}
        progress={progress}
      />
      <SlateGrid candidates={candidates} />
      {/* Between the slate and the feedback form on purpose: the hiring
          manager should see what is still unknown before they are asked to
          give a verdict on it. */}
      {evidenceGrid && evidenceGrid.candidates.length > 0 && (
        <EvidenceGrid grid={evidenceGrid} variant="client" />
      )}
      <HmFeedbackForm
        candidates={formCandidates}
        submitHandle={submitHandle}
        submitPath={submitPath}
        mode={mode}
      />
    </div>
  );
}

function ProgressHeader({
  projectTitle,
  companyName,
  progress,
}: {
  projectTitle: string;
  companyName: string;
  progress: PortalProgress;
}) {
  return (
    <header className="bg-surface-container border border-outline-variant px-5 py-4 space-y-2 relative overflow-hidden">
      <div
        className="absolute inset-x-0 top-0 h-0.5 bg-primary-container"
        aria-hidden
      />
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div className="space-y-0.5">
          <p className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
            Hiring Manager Portal
          </p>
          <h1 className="font-h1 text-h1 text-on-surface tracking-tight">
            {projectTitle}
          </h1>
          <p className="font-mono-data text-body-main text-on-surface-variant">
            {companyName}
          </p>
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          <ProgressStat
            label="Reviewed"
            value={`${progress.candidates_reviewed}/${progress.candidates_total}`}
          />
          <ProgressStat label="Status" value={progress.search_status} />
          <ProgressStat
            label="Last update"
            value={
              progress.last_updated
                ? formatRelative(progress.last_updated)
                : "—"
            }
          />
        </div>
      </div>
    </header>
  );
}

function ProgressStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-right">
      <div className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
        {label}
      </div>
      <div className="font-mono-data text-body-main text-on-surface tabular-nums mt-0.5">
        {value}
      </div>
    </div>
  );
}

function SlateGrid({ candidates }: { candidates: PortalCandidate[] }) {
  if (candidates.length === 0) {
    return (
      <div className="bg-surface-container-low border border-outline-variant px-5 py-8 text-center">
        <p className="font-mono-label text-mono-label text-outline italic uppercase tracking-widest">
          No shortlisted candidates yet. Your recruiter will populate the slate
          here as the search progresses.
        </p>
      </div>
    );
  }
  return (
    <section className="space-y-3">
      <header className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="font-h2 text-h2 text-on-surface uppercase tracking-tight">
          Shortlist
        </h2>
        <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest tabular-nums">
          {candidates.length} candidate{candidates.length === 1 ? "" : "s"}
        </span>
      </header>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {candidates.map((c) => (
          <CandidateCard key={c.id} candidate={c} />
        ))}
      </div>
    </section>
  );
}

function CandidateCard({ candidate }: { candidate: PortalCandidate }) {
  const fitPct =
    candidate.overall_score != null
      ? Math.round(candidate.overall_score * 10)
      : null;
  return (
    <article className="bg-surface-container-low border border-outline-variant p-4 space-y-3">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1 space-y-1">
          <h3 className="font-h2 text-h2 text-on-surface truncate">
            {candidate.full_name}
          </h3>
          <p className="font-mono-data text-body-main text-on-surface-variant truncate">
            {candidate.current_title ?? "—"}
            {candidate.current_company
              ? ` @ ${candidate.current_company}`
              : ""}
          </p>
        </div>
        <div className="text-right shrink-0">
          <div className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
            Fit
          </div>
          <div
            className={cn(
              "font-h2 text-h2 tabular-nums leading-none mt-0.5",
              fitPct == null
                ? "text-outline"
                : fitPct >= 80
                  ? "text-secondary-fixed-dim"
                  : fitPct >= 60
                    ? "text-primary"
                    : fitPct >= 40
                      ? "text-tertiary"
                      : "text-error"
            )}
          >
            {fitPct != null ? `${fitPct}%` : "—"}
          </div>
        </div>
      </header>

      <div className="flex items-center justify-between gap-2 flex-wrap pt-2 border-t border-outline-variant/40">
        <TierComparison
          aiTier={candidate.ai_tier}
          recruiterTier={candidate.recruiter_tier}
          compact
        />
        {candidate.rank != null && (
          <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest tabular-nums">
            Rank #{String(candidate.rank).padStart(2, "0")}
          </span>
        )}
      </div>

      {candidate.headline && (
        <p className="text-body-main text-on-surface-variant italic leading-relaxed border-l-2 border-l-primary-container/60 pl-3">
          “{candidate.headline}”
        </p>
      )}

      {candidate.strengths.length > 0 && (
        <div>
          <h4 className="font-mono-label text-mono-label text-secondary-fixed-dim uppercase tracking-widest mb-1.5">
            Key strengths
          </h4>
          <ul className="space-y-1">
            {candidate.strengths.map((s, i) => (
              <li
                key={i}
                className="flex items-start gap-2 font-mono-data text-body-main text-on-surface-variant"
              >
                <span
                  className="text-secondary-fixed-dim shrink-0"
                  aria-hidden
                >
                  +
                </span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {candidate.gaps.length > 0 && (
        <div>
          <h4 className="font-mono-label text-mono-label text-tertiary uppercase tracking-widest mb-1.5">
            Critical gaps
          </h4>
          <ul className="space-y-1">
            {candidate.gaps.map((g, i) => (
              <li
                key={i}
                className="flex items-start gap-2 font-mono-data text-body-main text-on-surface-variant"
              >
                <span className="text-tertiary shrink-0" aria-hidden>
                  −
                </span>
                <span>{g}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {candidate.positioning_opener && (
        <div className="bg-primary-container/10 border-l-2 border-l-primary-container px-3 py-2">
          <h4 className="font-mono-label text-mono-label text-primary uppercase tracking-widest mb-1">
            Recruiter positioning
          </h4>
          <p className="text-body-main text-on-surface leading-relaxed">
            {candidate.positioning_opener}
          </p>
        </div>
      )}

      {candidate.verdict_narrative && (
        <details className="group border-t border-outline-variant/40 pt-2">
          <summary className="font-mono-label text-mono-label text-primary uppercase tracking-widest cursor-pointer hover:brightness-110 inline-flex items-center gap-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
            <IconChevronRight
              size={14}
              className="group-open:rotate-90 transition-transform"
            />
            View full assessment
          </summary>
          <p className="text-body-main text-on-surface-variant leading-relaxed mt-2">
            {candidate.verdict_narrative}
          </p>
          {candidate.ai_tier && (
            <p className="font-mono-label text-mono-label text-outline uppercase tracking-widest mt-2">
              AI tier · {TIER_BANDS[candidate.ai_tier].label}
            </p>
          )}
        </details>
      )}
    </article>
  );
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return iso;
  const delta = Date.now() - then;
  const sec = Math.round(delta / 1000);
  if (sec < 45) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  return `${Math.round(day / 30)}mo ago`;
}

// Build a PortalCandidate from raw row data (called from both the
// founder-facing page and the public /hm/[token] page so they share
// shape / null-handling exactly).
export function buildPortalCandidate(
  base: {
    id: string;
    full_name: string;
    current_title: string | null;
    current_company: string | null;
    cv_structured: unknown;
    recruiter_assessment: unknown;
  },
  score: {
    rank_position: number | null;
    overall_score: number | null;
    tier: string | null;
    technical_score: number | null;
    domain_score: number | null;
    leadership_score: number | null;
    regulatory_score: number | null;
    transformation_score: number | null;
  } | null,
  recruiter: RecruiterAssessment
): PortalCandidate {
  const profile = (base.cv_structured ?? {}) as Partial<CandidateProfile> & {
    evaluation?: CandidateEvaluation;
  };
  const evaluation = profile.evaluation ?? null;
  const headline =
    evaluation?.profile_summary?.executive_summary ??
    profile.summary?.split(/(?<=[.!?])\s+/)[0]?.trim() ??
    null;

  const strengths = evaluation?.strengths
    ? evaluation.strengths.slice(0, 3).map((s) => `${s.headline} — ${s.detail}`)
    : (profile.strengths ?? []).slice(0, 3);
  const gaps = evaluation?.gaps
    ? evaluation.gaps.slice(0, 2).map((g) => `${g.headline} — ${g.role_mismatch}`)
    : [];

  return {
    id: base.id,
    full_name: base.full_name,
    current_title: base.current_title,
    current_company: base.current_company,
    rank: score?.rank_position ?? null,
    overall_score: score?.overall_score ?? null,
    ai_tier: (score?.tier as Tier | null) ?? null,
    recruiter_tier: recruiter.tier,
    fit_dimensions: extractFit(score),
    headline,
    strengths,
    gaps,
    positioning_opener: evaluation?.positioning?.opener ?? null,
    verdict_narrative: evaluation?.final_verdict?.narrative ?? null,
  };
}

function extractFit(score: {
  technical_score: number | null;
  domain_score: number | null;
  leadership_score: number | null;
  regulatory_score: number | null;
  transformation_score: number | null;
} | null): FitDimensions | null {
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
