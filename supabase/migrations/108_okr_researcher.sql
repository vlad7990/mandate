-- 108: the OKR programme, slice two — THE RESEARCHER (§115 gate,
-- D1–D6 + R1–R3 confirmed 2026-08-25, D4 as recommended, against
-- docs/superpowers/specs/2026-08-25-okr-researcher-gate.md).
--
-- The researcher becomes a subject and an author (D1): the owner set
-- and the writer predicate widen by one role. The money boundary
-- does not move (R1) — instead the divergence 054 predicted is
-- refused in the database (D3): a financial key result cannot land
-- on, or be handed to, an objective whose owner holds no fees tier.
-- The vocabulary gains its first owner-attributed metric (D4,
-- founder's ruling): placements_sourced, counted from 050's
-- sourced_by_user_id — delivery, never a candidate (R2).

CREATE OR REPLACE FUNCTION public.can_write_okrs()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT coalesce(
    public.current_user_role() IN ('admin', 'manager', 'recruiter', 'researcher'),
    false)
$$;

-- Re-emitted whole with the widened owner set, and one new rule: an
-- objective CARRYING financial key results cannot be handed to a
-- researcher — the desk reassigning ownership must not turn the
-- money dark for its own subject (the D3 refusal's second face).
CREATE OR REPLACE FUNCTION public.guard_objective_owner_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role   text;
  v_status text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'an objective''s author does not change';
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id
     AND coalesce(public.can_manage_desk(), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'only the desk hands an objective to someone else';
  END IF;

  IF TG_OP = 'INSERT'
     AND NEW.owner_user_id IS DISTINCT FROM (SELECT auth.uid())
     AND coalesce(public.can_manage_desk(), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'only the desk sets an objective''s owner to someone else';
  END IF;

  IF TG_OP = 'INSERT' OR NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id THEN
    SELECT role, status INTO v_role, v_status
      FROM public.users WHERE id = NEW.owner_user_id;
    IF v_role IS NULL
       OR coalesce(v_status, '') <> 'active'
       OR v_role NOT IN ('manager', 'recruiter', 'researcher') THEN
      RAISE EXCEPTION 'an objective''s owner must be an active manager, recruiter or researcher — admins are support, not subjects';
    END IF;
    IF v_role = 'researcher'
       AND EXISTS (
         SELECT 1 FROM public.objective_key_results kr
          WHERE kr.objective_id = NEW.id AND kr.kind = 'financial'
       ) THEN
      RAISE EXCEPTION 'this objective carries financial key results — a researcher owner could not read them';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_objective_owner_changes() FROM public, anon;

-- D3, the first face: a financial key result needs an owner who can
-- read it. Column-level truth RLS cannot express — the 064 trigger
-- model, predicates coalesced.
CREATE OR REPLACE FUNCTION public.guard_financial_key_results()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_role text;
BEGIN
  IF NEW.kind = 'financial'
     AND (TG_OP = 'INSERT'
          OR NEW.kind IS DISTINCT FROM OLD.kind
          OR NEW.objective_id IS DISTINCT FROM OLD.objective_id) THEN
    SELECT u.role INTO v_owner_role
      FROM public.objectives o
      JOIN public.users u ON u.id = o.owner_user_id
     WHERE o.id = NEW.objective_id;
    IF coalesce(v_owner_role, '') NOT IN ('manager', 'recruiter') THEN
      RAISE EXCEPTION 'a financial key result needs an owner who can read it — researchers hold no fees tier';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_financial_key_results() FROM public, anon;

CREATE TRIGGER okr_key_results_guard_financial BEFORE INSERT OR UPDATE ON public.objective_key_results
  FOR EACH ROW EXECUTE FUNCTION public.guard_financial_key_results();

-- D4 (founder's ruling): the vocabulary's tenth quantitative slug —
-- the first attributed to a PERSON rather than a scope. Placements
-- the objective's OWNER sourced (050's sourced_by_user_id), counts
-- only, never amounts. Delivery, never a candidate.
ALTER TABLE public.objective_key_results
  DROP CONSTRAINT IF EXISTS okr_metric_matches_kind;

ALTER TABLE public.objective_key_results
  ADD CONSTRAINT okr_metric_matches_kind CHECK (
    CASE kind
      WHEN 'quantitative' THEN metric_source IN (
        'candidates_added', 'stage_moves', 'submissions', 'interviews',
        'offers', 'hires', 'placements_started', 'placements_sourced',
        'feedback_captured', 'weekly_velocity')
      WHEN 'financial' THEN metric_source IN (
        'fees_earned', 'fees_billed_forecast')
      ELSE metric_source IS NULL
    END
  );
