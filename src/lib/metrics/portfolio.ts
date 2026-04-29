import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { computeProjectHealth } from "./health";
import type {
  HealthStatus,
  PortfolioMetrics,
  ProjectHealthSummary,
} from "./types";

const FOUR_WEEKS_MS = 4 * 7 * 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

type ProjectLite = {
  id: string;
  title: string;
  company_name: string;
  status: string | null;
};

type CandidateLite = {
  id: string;
  project_id: string;
  created_at: string | null;
};

type FeedbackLite = {
  id: string;
  project_id: string;
  created_at: string | null;
};

const STATUS_PRIORITY: Record<HealthStatus, number> = {
  at_risk: 0,
  stalled: 1,
  healthy: 2,
};

/**
 * Aggregate metrics across every project visible to the caller (RLS
 * narrows to the user's organisation). Computes per-project health in
 * parallel — the volume per org is small (tens of projects) so a fan-out
 * is cleaner than a custom server-side rollup.
 */
export async function computePortfolioMetrics(): Promise<PortfolioMetrics> {
  const supabase = await createServerSupabaseClient();
  const now = Date.now();
  const sevenDaysAgo = new Date(now - SEVEN_DAYS_MS).toISOString();
  const fourWeeksAgo = new Date(now - FOUR_WEEKS_MS).toISOString();

  const [projectsQ, candidatesQ, feedbackQ] = await Promise.all([
    supabase
      .from("projects")
      .select("id, title, company_name, status"),
    supabase.from("candidates").select("id, project_id, created_at"),
    supabase.from("feedback").select("id, project_id, created_at"),
  ]);

  const projects = (projectsQ.data ?? []) as ProjectLite[];
  const candidates = (candidatesQ.data ?? []) as CandidateLite[];
  const feedback = (feedbackQ.data ?? []) as FeedbackLite[];

  const activeProjects = projects.filter(
    (p) => (p.status ?? "active") === "active"
  ).length;

  const totalCandidates = candidates.length;
  const totalCandidatesThisWeek = candidates.filter(
    (c) => c.created_at && c.created_at >= sevenDaysAgo
  ).length;
  const totalFeedbackThisWeek = feedback.filter(
    (f) => f.created_at && f.created_at >= sevenDaysAgo
  ).length;

  const recentCandidates = candidates.filter(
    (c) => c.created_at && c.created_at >= fourWeeksAgo
  );
  const averageWeeklyVelocity =
    projects.length > 0
      ? round2(recentCandidates.length / 4 / Math.max(1, activeProjects))
      : 0;

  // Compute health for each project in parallel. computeProjectHealth
  // makes its own queries; the per-org volume is small, so the fan-out
  // is cheap. If this ever becomes a hotspot, replace with a single SQL
  // RPC that returns aggregates per project.
  const healthEntries = await Promise.all(
    projects.map(async (p) => {
      const summary: ProjectHealthSummary = await computeProjectHealth(p.id);
      return { project: p, summary };
    })
  );

  const attentionList = healthEntries
    .filter(({ summary }) => summary.alerts.length > 0)
    .sort((a, b) => {
      const sa = STATUS_PRIORITY[a.summary.status];
      const sb = STATUS_PRIORITY[b.summary.status];
      if (sa !== sb) return sa - sb;
      return b.summary.alerts.length - a.summary.alerts.length;
    })
    .map(({ project, summary }) => ({
      projectId: project.id,
      title: project.title,
      companyName: project.company_name,
      status: summary.status,
      alerts: summary.alerts,
    }));

  return {
    totalProjects: projects.length,
    activeProjects,
    totalCandidates,
    totalCandidatesThisWeek,
    averageWeeklyVelocity,
    totalFeedbackThisWeek,
    attentionList,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
