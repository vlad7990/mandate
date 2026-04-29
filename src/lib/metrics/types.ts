// Shared metric types — client-safe so client components can format
// values handed down from server components without re-fetching.

import {
  PIPELINE_STAGES,
  type PipelineStage,
} from "@/lib/ai/cv-parsing";

/** Pipeline order used by every funnel/pipeline computation. */
export const FUNNEL_STAGES = PIPELINE_STAGES;

/** Stages that contribute to the linear funnel (rejected branches off). */
export const FUNNEL_PROGRESSION: PipelineStage[] = [
  "found",
  "reviewed",
  "matched",
  "shortlisted",
  "submitted",
  "interviewed",
  "passed_rounds",
  "finalist",
  "offer",
  "hired",
];

export type HealthStatus = "healthy" | "stalled" | "at_risk";

export const HEALTH_LABELS: Record<HealthStatus, string> = {
  healthy: "Healthy",
  stalled: "Stalled",
  at_risk: "At Risk",
};

export type HealthAlertCode =
  | "no_activity_7d"
  | "low_pipeline"
  | "no_feedback_14d"
  | "poor_quality";

export type HealthAlert = {
  code: HealthAlertCode;
  severity: "warn" | "critical";
  label: string;
  detail: string;
};

export type ProjectHealthSummary = {
  status: HealthStatus;
  alerts: HealthAlert[];
  candidatesThisWeek: number;
  feedbackThisWeek: number;
  rankingChangesThisWeek: number;
  totalCandidates: number;
  avgOverallScore: number | null;
  lastActivityAt: string | null;
};

export type FunnelEntry = {
  stage: PipelineStage;
  count: number;
  /** Conversion from the previous progression stage (0–1). null for the first stage. */
  conversionFromPrev: number | null;
};

export type PipelineMetrics = {
  /** All stages, in PIPELINE_STAGES order. Includes 'rejected'. */
  funnel: FunnelEntry[];
  /** Sum of candidates currently in any progression stage (excludes rejected). */
  activePoolSize: number;
  rejectedCount: number;
  /** Submission → first hire conversion if any hires; null otherwise. */
  submissionToHire: number | null;
  /** Average candidates added per ISO-week over the last 4 weeks. */
  weeklyVelocity: number;
  /** Per-source candidate count, sorted desc. */
  sourceBreakdown: Array<{ source: string; count: number }>;
};

export type PortfolioMetrics = {
  totalProjects: number;
  activeProjects: number;
  totalCandidates: number;
  totalCandidatesThisWeek: number;
  averageWeeklyVelocity: number;
  totalFeedbackThisWeek: number;
  /** Projects with at least one warn/critical alert, sorted worst-first. */
  attentionList: Array<{
    projectId: string;
    title: string;
    companyName: string;
    status: HealthStatus;
    alerts: HealthAlert[];
  }>;
};

export const ALERT_LABELS: Record<HealthAlertCode, string> = {
  no_activity_7d: "Stalled",
  low_pipeline: "Low pipeline",
  no_feedback_14d: "No feedback",
  poor_quality: "Poor quality",
};
