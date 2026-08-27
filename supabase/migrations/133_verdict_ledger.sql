-- ---------------------------------------------------------------------------
-- 133 — §187: the verdict-vs-outcome ledger.
--
-- The founder's ruling closed §128's bench test; production is now the
-- test. This table is the instrument: every machine verdict recorded AS
-- IT STOOD, scored later against what actually happened to the
-- candidate. cv_structured cannot serve — a forced regenerate REPLACES
-- the evaluation key, so the verdict that mattered is gone by the time
-- the outcome arrives. The ledger row is the immutable snapshot.
--
-- L.1 — WRITTEN BY THE EVALUATOR at the moment an evaluation lands,
-- under its own session (is_agent INSERT policy). A regenerate writes a
-- SECOND row (trigger_kind 'regenerated'); history is kept, not
-- overwritten.
--
-- L.2 — OUTCOMES arrive by trigger on candidates.pipeline_stage, so
-- every writer is caught: the recruiter's dropdown, the board drag, and
-- the candidate's own portal withdrawal (a SECURITY DEFINER path no
-- app-level hook would see). Two fields, deliberately: furthest_stage
-- tracks progression (how far did they get), terminal_outcome records
-- how it ended (hired | rejected | withdrawn) — a candidate rejected
-- after interview reads "got to interview, ended rejected", which is
-- the pair the calibration question needs.
--
-- L.3 — ERASURE WINS. candidate_id cascades: when a candidate is
-- deleted — including by their own erasure request — the judgment rows
-- about them go too. The calibration view computes from what remains.
-- A ledger of opinions about a person does not outlive the person's
-- right to leave.
--
-- Platform-agents doctrine: composite org FKs so a row can never point
-- across an org boundary. THAT CREATES AMBIGUOUS PAIRS
-- (verdict_ledger -> candidates/projects, two paths each) —
-- AMBIGUOUS_PAIRS in embed-ambiguity.test.ts is regenerated in the
-- same commit, and every read of this table uses NO embed at all.
--
-- Counts: no new activity event (the ledger is data, not trail) —
-- CHECK stays 99, allowlist stays 31, doors stay 26. The trigger
-- function's PUBLIC EXECUTE is revoked below, so the anon roster stays
-- TWELVE — count it after apply anyway (the 129 lesson).
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.verdict_ledger (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id       uuid NOT NULL,
  candidate_id     uuid NOT NULL,
  -- The verdict as it stood.
  tier             text NOT NULL CHECK (tier IN ('tier_1','tier_2','tier_3','tier_4')),
  recommendation   text NOT NULL CHECK (recommendation IN ('primary','secondary','do_not_include')),
  refuter          text NOT NULL CHECK (refuter IN ('concurred','contested','not_run')),
  fit_dimensions   jsonb,
  trigger_kind     text NOT NULL DEFAULT 'generated' CHECK (trigger_kind IN ('generated','regenerated')),
  evaluated_at     timestamptz NOT NULL DEFAULT now(),
  -- The outcome as it arrives.
  furthest_stage   text NOT NULL DEFAULT 'found',
  furthest_rank    int  NOT NULL DEFAULT 0,
  terminal_outcome text CHECK (terminal_outcome IN ('hired','rejected','withdrawn')),
  outcome_at       timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  -- Org-boundary composite FKs (111/112 doctrine). Bare single-column
  -- FKs ride along for the cascades.
  CONSTRAINT verdict_ledger_candidate_fkey FOREIGN KEY (candidate_id)
    REFERENCES public.candidates(id) ON DELETE CASCADE,
  CONSTRAINT verdict_ledger_project_fkey FOREIGN KEY (project_id)
    REFERENCES public.projects(id) ON DELETE CASCADE,
  CONSTRAINT verdict_ledger_candidate_in_org FOREIGN KEY (organization_id, candidate_id)
    REFERENCES public.candidates(organization_id, id) ON DELETE CASCADE,
  CONSTRAINT verdict_ledger_project_in_org FOREIGN KEY (organization_id, project_id)
    REFERENCES public.projects(organization_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS verdict_ledger_org_idx
  ON public.verdict_ledger (organization_id, evaluated_at DESC);
CREATE INDEX IF NOT EXISTS verdict_ledger_candidate_idx
  ON public.verdict_ledger (candidate_id);
CREATE INDEX IF NOT EXISTS verdict_ledger_project_idx
  ON public.verdict_ledger (project_id);

ALTER TABLE public.verdict_ledger ENABLE ROW LEVEL SECURITY;

-- Reads: org staff. Writes: the Evaluator, under its own session.
-- No human INSERT/UPDATE/DELETE policies AT ALL: humans cannot mint,
-- edit, or trim the record of what the machine said — deletion happens
-- only through the candidate cascade.
CREATE POLICY verdict_ledger_role_select ON public.verdict_ledger
  FOR SELECT TO authenticated
  USING (
    organization_id = (SELECT current_user_org_id())
    AND (SELECT can_read_org())
  );

CREATE POLICY verdict_ledger_agent_insert ON public.verdict_ledger
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT is_agent()));

-- ---------------------------------------------------------------------------
-- The outcome trigger. SECURITY DEFINER so every stage writer stamps the
-- ledger regardless of its own grants (the portal's withdrawal runs as
-- the token door's definer, which holds no ledger UPDATE right).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.stamp_verdict_outcome()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_rank int;
BEGIN
  IF NEW.pipeline_stage IS NOT DISTINCT FROM OLD.pipeline_stage THEN
    RETURN NEW;
  END IF;

  v_rank := CASE NEW.pipeline_stage
    WHEN 'found' THEN 0 WHEN 'reviewed' THEN 1 WHEN 'matched' THEN 2
    WHEN 'shortlisted' THEN 3 WHEN 'submitted' THEN 4 WHEN 'interviewed' THEN 5
    WHEN 'passed_rounds' THEN 6 WHEN 'finalist' THEN 7 WHEN 'offer' THEN 8
    WHEN 'hired' THEN 9
    ELSE NULL  -- rejected / withdrawn carry no progression rank
  END;

  UPDATE public.verdict_ledger
     SET furthest_stage = CASE WHEN v_rank IS NOT NULL AND v_rank > furthest_rank
                               THEN NEW.pipeline_stage ELSE furthest_stage END,
         furthest_rank  = CASE WHEN v_rank IS NOT NULL AND v_rank > furthest_rank
                               THEN v_rank ELSE furthest_rank END,
         terminal_outcome = CASE WHEN NEW.pipeline_stage IN ('hired','rejected','withdrawn')
                                 THEN NEW.pipeline_stage ELSE terminal_outcome END,
         outcome_at = now()
   WHERE candidate_id = NEW.id;

  RETURN NEW;
END;
$function$;

-- A new function inherits PUBLIC EXECUTE — revoke it, or the anon
-- roster silently grows (the 129 lesson, twice earned).
REVOKE ALL ON FUNCTION public.stamp_verdict_outcome() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.stamp_verdict_outcome() FROM anon;

DROP TRIGGER IF EXISTS candidates_stamp_verdict_outcome ON public.candidates;
CREATE TRIGGER candidates_stamp_verdict_outcome
  AFTER UPDATE OF pipeline_stage ON public.candidates
  FOR EACH ROW EXECUTE FUNCTION public.stamp_verdict_outcome();
