-- 164 — WHAT A MODEL CALL COST, AND A CEILING ON THE TOTAL
--
-- Applied 2026-10-08 on founder authorisation. Closes C11, the half of the
-- ceiling work that 163 deliberately left open.
--
-- ## What 163 did not do
--
-- 163 bounded escalation hops: 5/hour/project, 50/day, counted. It left
-- ORDINARY model calls unbounded, and it left the product unable to say what
-- any call cost. The $4.12 lifetime figure in the launch tracker came from a
-- join written by hand in a console — nothing in the product computed it, no
-- surface displayed it, and no code could act on it.
--
-- Measured before this migration: 76 runs, two months, $4.12, 71 of 76
-- carrying a project_id.
--
-- ## Why a count was right for hops and wrong for this
--
-- A hop is a discrete, rare, failure-triggered event, so counting it is exact
-- and a counter write per hop costs nothing. Ordinary calls are the hottest
-- path in the product, and the thing worth bounding about them is not how many
-- there are but how much they cost — a 211k-token research call and a 3-token
-- copilot turn are both "one call" and differ 70,000-fold in price.
--
-- So this is dollar-denominated and READ, not counted and written. The seam
-- reads one aggregate per 60-second window (the registry's cache shape), never
-- one write per call.
--
-- ## 1. THE FORMULA, IN ONE PLACE
--
-- Three readers need it — the seam's guard, the operator's surface, and
-- whatever audits spend later. A formula copied three times drifts three ways,
-- so it lives in one IMMUTABLE function.
--
-- It returns NULL for an unpriced model rather than 0. That is the whole point
-- of writing it as a function: `coalesce(price, 0)` would make the most
-- expensive model in the registry report as free. claude-opus-5 has NULL prices
-- today (162 refused to invent them), so this is not hypothetical — it is the
-- exact row that would have lied.

CREATE OR REPLACE FUNCTION public.ai_run_cost_usd(
  p_input       integer,
  p_cached      integer,
  p_cache_write integer,
  p_output      integer,
  p_price_in    numeric,
  p_price_out   numeric
) RETURNS numeric
LANGUAGE sql
IMMUTABLE
-- Pinned per 160's rule. The body names no objects at all — pure arithmetic —
-- so '' costs nothing here.
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_price_in IS NULL OR p_price_out IS NULL THEN NULL
    ELSE COALESCE(p_input, 0)       / 1e6 * p_price_in
       + COALESCE(p_cached, 0)      / 1e6 * p_price_in  * 0.1
       + COALESCE(p_cache_write, 0) / 1e6 * p_price_in  * 1.25
       + COALESCE(p_output, 0)      / 1e6 * p_price_out
  END
$$;

COMMENT ON FUNCTION public.ai_run_cost_usd IS
  'Estimated USD for one inference_runs row. Cache reads at 0.1x input, cache '
  'writes at 1.25x input (the Anthropic multipliers). Returns NULL when either '
  'price is NULL — an unpriced model must never report as free. The one place '
  'this formula exists.';

-- §210. Needs no grant at all: its only callers are the SECURITY DEFINER
-- functions below, which execute as the owner that owns this. Without the
-- revoke it is reachable at /rest/v1/rpc/ai_run_cost_usd by anyone holding the
-- publishable key — harmless arithmetic, but a free compute endpoint on the
-- anon surface 158/159 closed. The anon-surface tripwire caught this omission
-- before it shipped, which is the tripwire doing its job.
REVOKE ALL ON FUNCTION public.ai_run_cost_usd(
  integer, integer, integer, integer, numeric, numeric
) FROM PUBLIC;

-- ## 2. THE BUDGET, AS DATA
--
-- Caps as data, the 088 shape, so both numbers move with an UPDATE and no
-- deploy.
--
-- The defaults are derived from measured burn, not chosen for roundness:
-- $4.12 over two months is ~$2/month. soft_usd = 50 is ~25x that, so crossing
-- it means something changed rather than that the product got busy. hard_usd =
-- 250 is ~125x, and is a wall rather than a warning — see the fail directions
-- in ai_budget_verdict below.
--
-- The window is 30 rolling days, not a calendar month: a calendar reset makes
-- the 1st of the month the cheapest day to have an incident.

CREATE TABLE IF NOT EXISTS public.ai_budget_policy (
  scope       text PRIMARY KEY,
  window_days integer     NOT NULL CHECK (window_days > 0),
  soft_usd    numeric     NOT NULL CHECK (soft_usd > 0),
  hard_usd    numeric     NOT NULL CHECK (hard_usd > 0),
  enabled     boolean     NOT NULL DEFAULT true,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  -- A soft threshold at or above the hard one would mean the product hits the
  -- wall without ever having warned.
  CONSTRAINT ai_budget_policy_soft_below_hard CHECK (soft_usd < hard_usd)
);

ALTER TABLE public.ai_budget_policy ENABLE ROW LEVEL SECURITY;
-- Zero policies, deliberately — the 061/088 shape. This is the house's FIFTH
-- deny-all-RLS table and belongs on that list in CLAUDE.md beside
-- inference_runs, ops_heartbeats, rate_limit and rate_limit_policy. It is
-- reached only by SECURITY DEFINER functions and service-role.

INSERT INTO public.ai_budget_policy (scope, window_days, soft_usd, hard_usd)
VALUES ('global', 30, 50, 250)
ON CONFLICT (scope) DO NOTHING;

COMMENT ON TABLE public.ai_budget_policy IS
  'The AI spend ceiling, as data. One row, scope=global. soft_usd warns and '
  'never blocks; hard_usd refuses. Defaults are ~25x and ~125x the measured '
  'burn of $2/month. Deny-all RLS: SECURITY DEFINER and service-role only.';

-- ## 3. THE SEAM'S VERDICT
--
-- One row, read by the inference seam through its service-role client and
-- cached in-process for 60 seconds. Never one query per model call.
--
-- `spend_usd` sums only PRICED runs, because sum() skips NULLs. That leaves a
-- hole the caller has to close rather than paper over: a model with no prices
-- could burn money while this number stays flat. So `unpriced_runs` is
-- returned beside it, and the seam REFUSES a call to an unpriced model while a
-- budget is enabled — "we cannot bound what we cannot price". Today every
-- active model is priced and opus-5 is not active, so that refusal is inert;
-- it exists so that adding a model and forgetting its prices fails loudly
-- instead of silently uncapping the budget.

CREATE OR REPLACE FUNCTION public.ai_budget_verdict()
RETURNS TABLE (
  enabled       boolean,
  window_days   integer,
  spend_usd     numeric,
  soft_usd      numeric,
  hard_usd      numeric,
  over_soft     boolean,
  over_hard     boolean,
  unpriced_runs bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH p AS (
    SELECT * FROM public.ai_budget_policy WHERE scope = 'global'
  ), s AS (
    SELECT
      COALESCE(SUM(public.ai_run_cost_usd(
        r.input_tokens, r.cached_input_tokens,
        r.cache_creation_input_tokens, r.output_tokens,
        m.price_input_per_mtok, m.price_output_per_mtok)), 0) AS spend,
      COUNT(*) FILTER (
        WHERE m.price_input_per_mtok IS NULL OR m.price_output_per_mtok IS NULL
      ) AS unpriced
    FROM public.inference_runs r
    -- LEFT JOIN: a run naming a model absent from the registry must be
    -- COUNTED as unpriced, not dropped. An inner join would hide exactly the
    -- rows most worth seeing.
    LEFT JOIN public.provider_models m ON m.model_id = r.model
    WHERE r.created_at >= now() - make_interval(days => (SELECT window_days FROM p))
  )
  SELECT p.enabled, p.window_days, s.spend, p.soft_usd, p.hard_usd,
         s.spend >= p.soft_usd, s.spend >= p.hard_usd, s.unpriced
  FROM p, s;
$$;

COMMENT ON FUNCTION public.ai_budget_verdict IS
  'The inference seam reads this once per 60s window, service-role. spend_usd '
  'counts priced runs only; unpriced_runs is the hole, which the seam closes '
  'by refusing calls to an unpriced model while a budget is enabled.';

-- ## 4. THE OPERATOR'S VIEW
--
-- Founder-only, and it RAISES rather than returning empty for anyone else: an
-- authorisation failure that looks like "no spend" is worse than an error.
--
-- Scope is GLOBAL, which is why it is founder-only. inference_runs has no
-- organization_id — only project_id — so a global figure on any org-facing
-- screen would tell one client's admin how much every other client is
-- spending. With one live org that is theoretical; at client #2 it is a leak.
-- Org-scoped spend (joining through projects.organization_id, which 71 of 76
-- runs can do) is a separate, deliberate next step and is NOT in this
-- migration.

CREATE OR REPLACE FUNCTION public.ai_spend_by_model(p_days integer DEFAULT 30)
RETURNS TABLE (
  model        text,
  runs         bigint,
  priced_runs  bigint,
  input_tokens bigint,
  output_tokens bigint,
  est_usd      numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_current_user_founder() THEN
    RAISE EXCEPTION 'ai_spend_by_model is founder-only';
  END IF;
  IF p_days IS NULL OR p_days < 1 OR p_days > 3650 THEN
    RAISE EXCEPTION 'p_days must be between 1 and 3650';
  END IF;

  RETURN QUERY
  SELECT
    r.model,
    COUNT(*)::bigint,
    COUNT(*) FILTER (
      WHERE m.price_input_per_mtok IS NOT NULL
        AND m.price_output_per_mtok IS NOT NULL
    )::bigint,
    COALESCE(SUM(r.input_tokens), 0)::bigint,
    COALESCE(SUM(r.output_tokens), 0)::bigint,
    COALESCE(SUM(public.ai_run_cost_usd(
      r.input_tokens, r.cached_input_tokens,
      r.cache_creation_input_tokens, r.output_tokens,
      m.price_input_per_mtok, m.price_output_per_mtok)), 0)
  FROM public.inference_runs r
  LEFT JOIN public.provider_models m ON m.model_id = r.model
  WHERE r.created_at >= now() - make_interval(days => p_days)
  GROUP BY r.model
  ORDER BY 6 DESC, 1;
END $$;

COMMENT ON FUNCTION public.ai_spend_by_model IS
  'Founder-only global spend by model over p_days. Raises for anyone else — '
  'an authorisation failure that renders as "no spend" is worse than an error. '
  'Global because inference_runs has no organization_id; org-scoped spend is a '
  'separate surface for that reason.';

-- ## 5. THE POLICY ROW, FOR THE SURFACE THAT DISPLAYS IT
--
-- The operator's page needs the thresholds to say "spend is $12 of $250". It
-- must NOT get them from ai_budget_verdict: that function computes a GLOBAL
-- aggregate and is granted to service_role only, because granting a global
-- spend figure to `authenticated` would hand every logged-in user at every
-- client the number this migration just argued they must not see.
--
-- So the page reads the thresholds here and the spend from
-- ai_spend_by_model — which it already calls for the breakdown — and compares
-- them in TypeScript. One aggregate, computed once, in one place.

CREATE OR REPLACE FUNCTION public.ai_budget_policy_row()
RETURNS TABLE (
  window_days integer,
  soft_usd    numeric,
  hard_usd    numeric,
  enabled     boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_current_user_founder() THEN
    RAISE EXCEPTION 'ai_budget_policy_row is founder-only';
  END IF;
  RETURN QUERY
  SELECT p.window_days, p.soft_usd, p.hard_usd, p.enabled
  FROM public.ai_budget_policy p WHERE p.scope = 'global';
END $$;

REVOKE ALL ON FUNCTION public.ai_spend_by_model(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ai_spend_by_model(integer) TO authenticated;

REVOKE ALL ON FUNCTION public.ai_budget_policy_row() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ai_budget_policy_row() TO authenticated;

-- service_role ONLY. The seam is the only caller, and a global spend figure
-- must not be reachable by a session.
REVOKE ALL ON FUNCTION public.ai_budget_verdict() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ai_budget_verdict() TO service_role;
