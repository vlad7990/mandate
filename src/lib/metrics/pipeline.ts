import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { type PipelineStage } from "@/lib/ai/cv-parsing";
import {
  FUNNEL_PROGRESSION,
  FUNNEL_STAGES,
  type FunnelEntry,
  type PipelineMetrics,
} from "./types";

type CandidateRow = {
  id: string;
  pipeline_stage: string | null;
  source: string | null;
  created_at: string | null;
};

const FOUR_WEEKS_MS = 4 * 7 * 24 * 60 * 60 * 1000;

/**
 * Funnel + conversion + velocity + source breakdown for a single project.
 * The funnel is "candidates currently sitting in stage X" — same shape
 * the recruiter sees across the rest of the app, *not* a flow-rate
 * cohort analysis. This matches the existing pipeline_stage column
 * semantics: each candidate has one current stage at any moment.
 */
export async function computePipelineMetrics(
  projectId: string
): Promise<PipelineMetrics> {
  const supabase = await createServerSupabaseClient();

  const { data: candidatesData } = await supabase
    .from("candidates")
    .select("id, pipeline_stage, source, created_at")
    .eq("project_id", projectId);

  const candidates = (candidatesData ?? []) as CandidateRow[];

  // Per-stage counts. Default 0 so empty stages still render in the funnel.
  const counts = new Map<PipelineStage, number>();
  for (const stage of FUNNEL_STAGES) counts.set(stage, 0);
  for (const c of candidates) {
    const stage = (c.pipeline_stage ?? "found") as PipelineStage;
    counts.set(stage, (counts.get(stage) ?? 0) + 1);
  }

  // Cumulative reach per progression stage: number of candidates whose
  // current pipeline_stage is at-or-beyond this stage in FUNNEL_PROGRESSION.
  // Computed via a reverse-cumulative sum so cumulative[N] = counts[N] +
  // cumulative[N+1].
  //
  // Why cumulative — not current-stage — counts drive the conversion math:
  // pipeline_stage stores each candidate's *single current* stage, so
  // dividing current-stage counts (e.g. submitted=5 vs shortlisted=1)
  // produces impossible numbers like 500% submitted-conversion when the
  // recruiter has correctly advanced earlier candidates onward. Cumulative
  // counts answer the question that actually matters at a glance:
  //   "of the candidates who reached at-least the previous stage, what
  //    fraction reached at-least this stage?"
  // That ratio is well-defined, monotone-decreasing along a healthy
  // funnel, and stable as candidates progress.
  //
  // Trade-off: cumulative reach over-counts compared to a true
  // event-history funnel. A candidate currently at 'finalist' contributes
  // to every cumulative bucket from 'found' through 'finalist', even if
  // we have no audit log proving they ever sat at 'reviewed' / 'matched' /
  // etc. We treat that as an acceptable approximation until a stage-
  // history table exists.
  const cumulativeByStage = new Map<PipelineStage, number>();
  let runningTotal = 0;
  for (let i = FUNNEL_PROGRESSION.length - 1; i >= 0; i--) {
    const stage = FUNNEL_PROGRESSION[i];
    runningTotal += counts.get(stage) ?? 0;
    cumulativeByStage.set(stage, runningTotal);
  }

  const funnel: FunnelEntry[] = FUNNEL_STAGES.map((stage) => {
    const count = counts.get(stage) ?? 0;
    const idxInProg = FUNNEL_PROGRESSION.indexOf(stage);
    let conversionFromPrev: number | null = null;
    if (idxInProg > 0) {
      const prevStage = FUNNEL_PROGRESSION[idxInProg - 1];
      const cumulativeAtThis = cumulativeByStage.get(stage) ?? 0;
      const cumulativeAtPrev = cumulativeByStage.get(prevStage) ?? 0;
      // Cumulative ratio. Bounded to [0, 1] by construction since cumulative
      // is monotone non-increasing as you move forward in the progression
      // (every candidate at-or-beyond stage N is also at-or-beyond stage
      // N-1).
      conversionFromPrev =
        cumulativeAtPrev > 0 ? cumulativeAtThis / cumulativeAtPrev : 0;
    }
    // Stage 0 ('found') and the off-funnel 'rejected' both keep
    // conversionFromPrev = null — the first stage has no predecessor and
    // 'rejected' isn't part of the linear chain.
    return { stage, count, conversionFromPrev };
  });

  const activePoolSize = FUNNEL_PROGRESSION.reduce(
    (acc, s) => acc + (counts.get(s) ?? 0),
    0
  );
  const rejectedCount = counts.get("rejected") ?? 0;

  // Submission → first-hire conversion. We use 'submitted' as the
  // denominator and 'hired' as the numerator across all candidates that
  // ever reached at least 'submitted'. Since pipeline_stage is the
  // *current* stage, this approximates: how many of the candidates who
  // are now in submitted-or-later stages ended at hired? Good enough for
  // the recruiter glance until we add stage-history.
  const submissionDownstream = ["submitted", "interviewed", "passed_rounds", "finalist", "offer", "hired"] as const;
  const submittedOrLater = submissionDownstream.reduce(
    (acc, s) => acc + (counts.get(s) ?? 0),
    0
  );
  const hired = counts.get("hired") ?? 0;
  const submissionToHire =
    submittedOrLater > 0 ? hired / submittedOrLater : null;

  // Velocity = candidates added in the last 4 weeks ÷ 4.
  const fourWeeksAgo = new Date(Date.now() - FOUR_WEEKS_MS).toISOString();
  const recent = candidates.filter(
    (c) => c.created_at && c.created_at >= fourWeeksAgo
  );
  const weeklyVelocity = round2(recent.length / 4);

  // Source breakdown — handle null/empty source as 'unspecified' so it's
  // visible to the recruiter (a hint to start tagging sources).
  const sources = new Map<string, number>();
  for (const c of candidates) {
    const key = (c.source && c.source.trim()) || "unspecified";
    sources.set(key, (sources.get(key) ?? 0) + 1);
  }
  const sourceBreakdown = Array.from(sources.entries())
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count);

  return {
    funnel,
    activePoolSize,
    rejectedCount,
    submissionToHire,
    weeklyVelocity,
    sourceBreakdown,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
