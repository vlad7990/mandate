import type { PipelineStage } from "@/lib/ai/cv-parsing";

/**
 * Column accents, one per stage. Same palette logic as the candidate list's
 * stage badges: neutral at the top of the funnel, warming through primary /
 * secondary / tertiary as a candidate advances, error for rejected, muted
 * for withdrawn. A parallel record over `PipelineStage`, so a thirteenth
 * stage in the schema fails the drift test here rather than rendering an
 * unstyled column.
 */
export const STAGE_ACCENTS: Record<
  PipelineStage,
  { text: string; bar: string }
> = {
  found: { text: "text-on-surface-variant", bar: "bg-outline-variant" },
  reviewed: { text: "text-primary", bar: "bg-primary/50" },
  matched: { text: "text-primary", bar: "bg-primary/50" },
  shortlisted: {
    text: "text-secondary-fixed-dim",
    bar: "bg-secondary-fixed-dim/50",
  },
  submitted: {
    text: "text-secondary-fixed-dim",
    bar: "bg-secondary-fixed-dim/50",
  },
  interviewed: { text: "text-tertiary", bar: "bg-tertiary/50" },
  passed_rounds: { text: "text-tertiary", bar: "bg-tertiary/50" },
  finalist: {
    text: "text-secondary-fixed-dim",
    bar: "bg-secondary-fixed-dim/70",
  },
  offer: {
    text: "text-secondary-fixed-dim",
    bar: "bg-secondary-fixed-dim/70",
  },
  hired: { text: "text-secondary-fixed-dim", bar: "bg-secondary-fixed-dim" },
  rejected: { text: "text-error", bar: "bg-error/60" },
  withdrawn: { text: "text-outline", bar: "bg-outline-variant" },
};
