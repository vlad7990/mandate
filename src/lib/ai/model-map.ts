/**
 * The capability→model map — the ONE place a model is chosen.
 *
 * Slice 3 flips (§150's table, the founder's word 2026-08-25,
 * benchmark evals/results/2026-08-25.md): generate_sourcing,
 * run_target_companies, run_relationship → claude-haiku-4-5 (rubric
 * 4–5 at ⅓ price); generate_evaluation → claude-sonnet-5 with
 * thinking DISABLED (the benchmark's winning variant — bare Sonnet 5
 * runs adaptive by default, which truncated 5/8 cells inside the
 * seams' max_tokens; see CAPABILITY_THINKING). run_search_health
 * HELD on sonnet-4-6 (Haiku failed 1/2 deterministically). Every
 * other entry stays claude-sonnet-4-6. A map edit without an eval
 * behind it is how a cheaper model silently degrades a capability —
 * the tripwire test pins THIS ruled mapping.
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
  generate_evaluation: "claude-sonnet-5",
  generate_executive_interview_plan: "claude-sonnet-4-6",
  generate_executive_success_profile: "claude-sonnet-4-6",
  generate_interview_plan: "claude-sonnet-4-6",
  generate_job_spec: "claude-sonnet-4-6",
  generate_shortlist_report: "claude-sonnet-4-6",
  generate_sourcing: "claude-haiku-4-5",
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
  run_relationship: "claude-haiku-4-5",
  run_role_analysis: "claude-sonnet-4-6",
  run_search_health: "claude-sonnet-4-6",
  run_target_companies: "claude-haiku-4-5",
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

/**
 * The two ruled escalation pairs (Part G / O.5, gate ef832fc, the
 * founder's word 2026-08-26): when a capability's model answers but
 * the shape is unusable — the deterministic schema signal, never
 * model-reported confidence — the seam retries ONCE on the pair's
 * to-model and records the hop in inference_runs.escalated_from.
 *
 * The from-guard is the arming pin: no hop unless the model that
 * ACTUALLY ran equals `from`. parse_cv's pair is therefore DORMANT
 * today (it runs sonnet-4-6 until its Haiku flip lands on the
 * founder's CV benchmark) and arms itself when that flip happens. A
 * founder registry override likewise disarms a pair rather than
 * escalating off a model the founder moved away from.
 */
export const ESCALATION_PAIRS: Partial<
  Record<Capability, { from: string; to: string }>
> = {
  parse_cv: { from: "claude-haiku-4-5", to: "claude-sonnet-4-6" },
  generate_evaluation: { from: "claude-sonnet-5", to: "claude-opus-5" },
};

/**
 * Per-capability thinking config the seam sends in PRODUCTION.
 * generate_evaluation runs Sonnet 5 with thinking disabled — the
 * benchmarked variant; omitting the param would run adaptive, which
 * truncated inside the seam's max_tokens. Anything not named here
 * sends no thinking param (today's behavior on every model).
 */
export const CAPABILITY_THINKING: Partial<
  Record<Capability, { type: "adaptive" | "disabled" }>
> = {
  generate_evaluation: { type: "disabled" },
};
