/**
 * The capability→model map — the ONE place a model is chosen.
 *
 * Slice 1 of the LLM router (gate fda4764): every entry is
 * claude-sonnet-4-6, deliberately — this slice moves WHERE the model
 * is named, never WHICH model runs. Tier flips (Haiku economy, Sonnet
 * 5 benchmarks) are slice 3's business, behind their own gate and an
 * eval harness; a map edit without an eval is how a cheaper model
 * silently degrades a capability.
 *
 * One slug per seam. The two dual-call seams (generate_sourcing,
 * sourcing_search) record both their calls under one slug — the slug
 * is text in inference_runs, so a later split needs no migration.
 * The marketing demo door is NOT here (Q6: out of scope; it keeps its
 * own direct call, verified §142).
 */

export const CAPABILITY_MODEL = {
  analyze_role: "claude-sonnet-4-6",
  copilot: "claude-sonnet-4-6",
  derive_calibration: "claude-sonnet-4-6",
  desk_digest: "claude-sonnet-4-6",
  generate_client_interview: "claude-sonnet-4-6",
  generate_comparison: "claude-sonnet-4-6",
  generate_evaluation: "claude-sonnet-4-6",
  generate_executive_interview_plan: "claude-sonnet-4-6",
  generate_executive_success_profile: "claude-sonnet-4-6",
  generate_interview_plan: "claude-sonnet-4-6",
  generate_job_spec: "claude-sonnet-4-6",
  generate_shortlist_report: "claude-sonnet-4-6",
  generate_sourcing: "claude-sonnet-4-6",
  interpret_feedback: "claude-sonnet-4-6",
  parse_cv: "claude-sonnet-4-6",
  run_candidate_research: "claude-sonnet-4-6",
  run_candidate_search: "claude-sonnet-4-6",
  run_client_psychology: "claude-sonnet-4-6",
  run_company_culture: "claude-sonnet-4-6",
  run_company_intelligence: "claude-sonnet-4-6",
  run_coverage_analysis: "claude-sonnet-4-6",
  run_engagement: "claude-sonnet-4-6",
  run_executive_company_context: "claude-sonnet-4-6",
  run_hiring_manager_research: "claude-sonnet-4-6",
  run_outreach_strategy: "claude-sonnet-4-6",
  run_positioning: "claude-sonnet-4-6",
  run_prescreen: "claude-sonnet-4-6",
  run_psychology: "claude-sonnet-4-6",
  run_relationship: "claude-sonnet-4-6",
  run_role_analysis: "claude-sonnet-4-6",
  run_search_health: "claude-sonnet-4-6",
  run_target_companies: "claude-sonnet-4-6",
  run_triangulation: "claude-sonnet-4-6",
  run_weekly_report: "claude-sonnet-4-6",
  sourcing_search: "claude-sonnet-4-6",
} as const satisfies Record<string, string>;

export type Capability = keyof typeof CAPABILITY_MODEL;

/** One provider this slice; the registry-as-data successor is Part R. */
export const INFERENCE_PROVIDER = "anthropic";

/**
 * Capabilities whose CONVERSATION prefix the seam caches (slice 2,
 * gate 0788898): the last user message gets a cache_control stamp so
 * turn N reads what turn N−1 wrote. Copilot only — Phase 0 measured
 * every base prompt under Sonnet's 1024-token cacheable minimum and
 * the other Part J candidates single-shot against the 5-minute TTL;
 * they re-enter here only with slice 3's eval data behind them.
 */
export const CACHED_CONVERSATION_CAPABILITIES: ReadonlySet<Capability> =
  new Set(["copilot"]);

export function modelForCapability(capability: Capability): string {
  return CAPABILITY_MODEL[capability];
}
