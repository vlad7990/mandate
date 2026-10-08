-- 162 — THE ESCALATION TARGET IS A KNOWN MODEL
--
-- Applied 2026-10-08 on founder authorisation.
--
-- ## The gap
--
-- `ESCALATION_PAIRS.generate_evaluation` is ARMED: the capability's code
-- default is claude-sonnet-5, the pair's `from` is claude-sonnet-5, so a
-- deterministic schema failure really does retry once on the pair's
-- `to` — claude-opus-5.
--
-- claude-opus-5 was in no table. provider_models held exactly three
-- rows: claude-haiku-4-5, claude-sonnet-4-6, claude-sonnet-5.
--
-- Nothing broke at call time, because `escalateInference` hands the
-- model id straight to the provider and never consults the registry.
-- That is the point: a model the product has never heard of could be
-- called in production, and the first hop would also be the first
-- opus-5 call ever made — escalation has fired zero times to date.
--
-- Three consequences, all of them quiet:
--   1. an inference_runs row would record a model the registry cannot
--      name, so cost-by-model reporting has a hole in it
--   2. the models screen could not show it at all
--   3. nobody reading the registry would know the product can reach it
--
-- ## Why status is 'benchmarking' and not 'active'
--
-- Because it has never been benchmarked. The table's own CHECK says so:
--
--     provider_models_active_needs_evidence
--       CHECK (status <> 'active' OR benchmark_ref IS NOT NULL)
--
-- and `setModelStatusAction` refuses activation without naming the eval
-- behind it. There is no eval for opus-5, so there is no honest value
-- for benchmark_ref, so the row cannot be active. The constraint caught
-- this, which is the constraint doing its job.
--
-- ## What this row does NOT do
--
-- It does not make opus-5 assignable. The `capability_assignments_active_gate`
-- trigger refuses an assignment to any non-active model with "benchmark
-- and activate it first", and that remains true after this migration.
--
-- It also does not change what escalation does. The escalation path
-- bypasses the registry and the active gate entirely — it is a code
-- constant, not an assignment. So the product's own doctrine ("benchmark
-- before you route to it") is still routed around by the one path that
-- can reach an unbenchmarked model.
--
-- That is a real tension and this migration does not resolve it. It
-- makes the model VISIBLE so the tension is legible instead of hidden.
-- The resolution is one of:
--   (a) benchmark opus-5 and activate it, making the hop evidenced; or
--   (b) make escalateInference refuse a `to` model that is not active,
--       which would disarm the pair until (a) happens.
-- Both are product decisions, not migrations.
--
-- ## Columns left NULL on purpose
--
-- context_window, max_output_tokens, cache_min_tokens and both prices
-- are unset. The other three rows carry real measured figures; writing
-- plausible-looking numbers for opus-5 would put invented data in the
-- table that cost reporting would then treat as fact. NULL is the
-- honest value until someone fills it from the provider's documentation.
--
-- The supports_* flags take their column defaults (structured output,
-- tools and streaming true; web search false). Structured output is the
-- one that matters here — it is what the escalation retries FOR — and
-- the conservative default on web search is the safe direction.

INSERT INTO public.provider_models (model_id, provider, tier, status)
VALUES ('claude-opus-5', 'anthropic', 'premium', 'benchmarking')
ON CONFLICT (model_id) DO NOTHING;

COMMENT ON TABLE public.provider_models IS
  'Models the product knows about. A row here is NOT permission to use one: '
  'capability_assignments_active_gate refuses assignment to anything that is '
  'not active, and activation needs a benchmark_ref. 162 added claude-opus-5 '
  'as benchmarking because the armed generate_evaluation escalation targets '
  'it, and a model the product can call should not be absent from the one '
  'table that lists what it can call.';
