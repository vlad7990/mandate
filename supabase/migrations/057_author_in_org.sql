-- The author of a row belonged to its organisation when it was written.
--
-- The last exclusion from 055: 37 foreign keys pointing at `users` —
-- `created_by`, `actor_id`, `owner_user_id`, `approved_by`, `submitted_by`
-- and the rest, across 28 tables. 055 left them alone and said why; 056
-- closed the other exclusion with an explicit tier flag. This one does not
-- take a foreign key at all, and the reason is worth writing down because
-- "do it the same way" was tried first and measured.
--
--
-- ## Why a composite foreign key is the wrong instrument here
--
-- Both candidate keys are **mutable by design**, which the catalogue's were
-- not. `guard_user_privilege_changes` in 046 explicitly permits a founder to
-- change `organization_id` and `is_founder`, and 053 gives both their own
-- audit event types precisely because they are expected to happen.
--
-- Adding the keys and then performing the product's own operations, in a
-- rolled-back transaction against the live database, gave:
--
--   (A) `(organization_id, created_by) -> users (organization_id, id)`
--       — the plain 055 shape:
--       * a founder moving a member between organisations   REFUSED
--       * clearing a departed member's organisation         REFUSED
--
--   (B) the 056 tier shape, with `is_founder` as the "global" tier:
--       * toggling `is_founder` on anyone who has authored  REFUSED
--
-- Each of those is a real operation with a real UI or audit event behind it.
-- A key here does not express an invariant; it freezes a person's lifecycle
-- to preserve a historical attribution, which is backwards. The attribution
-- is a fact about the past; the user row is a fact about the present.
--
-- 056 could take the opposite view — refusing to reclassify a competency that
-- searches already use is *correct*, because reclassifying would change who
-- may see them. Nothing equivalent is true of a colleague changing jobs.
--
--
-- ## What is actually true, and where to enforce it
--
-- The real invariant is temporal:
--
--     the user named as author was a member of this row's organisation,
--     or a platform operator, **at the moment the row was written**
--
-- That is enforceable exactly once — on write. Afterwards the row is history
-- and the user is free to move, be suspended, gain or lose `is_founder`, or
-- leave entirely. So this is a BEFORE trigger rather than a constraint, and
-- that is not a weaker version of a foreign key; it is the correct one for a
-- claim about a moment.
--
-- The disjunction is the same shape 056 landed on — *a member of this org, or
-- a platform operator* — with `is_founder` playing the part `is_global` plays
-- there. It is read at write time instead of being maintained forever.
--
-- Verified as holding across all 37 relationships before the trigger went on:
-- zero rows in the live database name an author outside their row's
-- organisation.
--
--
-- ## Two details that decide whether this works at all
--
-- **It only checks columns that actually changed.** On UPDATE, a column whose
-- value is untouched is skipped. Without that, re-saving any row whose author
-- has since left would fail — the freeze problem again, one step removed. A
-- row's attribution is only re-validated when somebody rewrites it.
--
-- **It has to be SECURITY DEFINER.** It reads `public.users`, and `users` is
-- RLS'd to the caller's own organisation — so a cross-org author, the exact
-- thing being detected, would come back as no rows and be waved through as
-- "unknown user". The check would silently pass in precisely the case it
-- exists for. EXECUTE is revoked from `authenticated`, as 053 and 048 do for
-- every trigger function that has to be definer.
--
--
-- ## What this is and is not
--
-- It is integrity, not a new security boundary. A cross-org `created_by`
-- leaks nothing today: `users` is RLS'd, so the foreign name renders as
-- unknown rather than as a name, and no policy resolves access *through* an
-- author column. `is_placement_credited` comes closest — it reads
-- `owner_user_id` — but it is SECURITY INVOKER over `placements`, so a
-- foreign owner cannot see the placement to be credited on it.
--
-- What it removes is the class of bug where a code path takes
-- `organization_id` from one context and the author from another, which is
-- the same class 055 removed for parent pointers.


-- ---------------------------------------------------------------------------
-- 1. The check
-- ---------------------------------------------------------------------------
--
-- Column names arrive in TG_ARGV, so one function serves all 28 tables and
-- the rule cannot drift between them. `NEW` is read through `to_jsonb` because
-- a generic trigger cannot name a column it does not know at write time.

CREATE OR REPLACE FUNCTION public.guard_author_in_org()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new       jsonb := to_jsonb(NEW);
  v_old       jsonb := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END;
  v_org       uuid  := (v_new->>'organization_id')::uuid;
  v_col       text;
  v_author    uuid;
  v_author_org uuid;
  v_founder   boolean;
  v_found     boolean;
BEGIN
  -- A row with no organisation has nothing to be a member of. The nine
  -- tables whose `organization_id` is nullable reach this on their broken
  -- rows only; RLS refuses to read them either way.
  IF v_org IS NULL THEN
    RETURN NEW;
  END IF;

  FOREACH v_col IN ARRAY TG_ARGV LOOP
    -- Untouched on UPDATE means this row's attribution is not being
    -- rewritten, so it is not being re-claimed and is not rechecked.
    IF v_old IS NOT NULL
       AND (v_old->>v_col) IS NOT DISTINCT FROM (v_new->>v_col) THEN
      CONTINUE;
    END IF;

    v_author := (v_new->>v_col)::uuid;
    IF v_author IS NULL THEN
      CONTINUE;   -- unattributed: a migration, a job, a departed colleague
    END IF;

    SELECT u.organization_id, u.is_founder, true
      INTO v_author_org, v_founder, v_found
      FROM public.users u
     WHERE u.id = v_author;

    -- Existence is the foreign key's job, not this one's. Saying nothing
    -- here keeps the two checks from reporting the same fault differently.
    IF NOT coalesce(v_found, false) THEN
      CONTINUE;
    END IF;

    -- The platform-operator tier: a founder administers across
    -- organisations, which is the whole point of the flag being orthogonal
    -- to the role model. Same disjunction 056 draws for a global catalogue
    -- row, read once rather than maintained.
    IF coalesce(v_founder, false) THEN
      CONTINUE;
    END IF;

    IF v_author_org IS DISTINCT FROM v_org THEN
      RAISE EXCEPTION
        '%.% names %, who is not a member of organisation %',
        TG_TABLE_NAME, v_col, v_author, v_org
        USING ERRCODE = 'foreign_key_violation';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_author_in_org() FROM public, anon, authenticated;


-- ---------------------------------------------------------------------------
-- 2. The 28 tables
-- ---------------------------------------------------------------------------
--
-- One trigger per table listing that table's user columns, rather than one
-- per column: a table pays for at most one invocation per row either way.

DROP TRIGGER IF EXISTS activity_events_author_in_org ON public.activity_events;
CREATE TRIGGER activity_events_author_in_org BEFORE INSERT OR UPDATE ON public.activity_events
  FOR EACH ROW EXECUTE FUNCTION public.guard_author_in_org('actor_id', 'target_user_id');

DROP TRIGGER IF EXISTS calibration_history_author_in_org ON public.calibration_history;
CREATE TRIGGER calibration_history_author_in_org BEFORE INSERT OR UPDATE ON public.calibration_history
  FOR EACH ROW EXECUTE FUNCTION public.guard_author_in_org('changed_by');

DROP TRIGGER IF EXISTS candidate_notes_author_in_org ON public.candidate_notes;
CREATE TRIGGER candidate_notes_author_in_org BEFORE INSERT OR UPDATE ON public.candidate_notes
  FOR EACH ROW EXECUTE FUNCTION public.guard_author_in_org('created_by');

DROP TRIGGER IF EXISTS candidate_notifications_author_in_org ON public.candidate_notifications;
CREATE TRIGGER candidate_notifications_author_in_org BEFORE INSERT OR UPDATE ON public.candidate_notifications
  FOR EACH ROW EXECUTE FUNCTION public.guard_author_in_org('created_by');

DROP TRIGGER IF EXISTS candidate_outreach_author_in_org ON public.candidate_outreach;
CREATE TRIGGER candidate_outreach_author_in_org BEFORE INSERT OR UPDATE ON public.candidate_outreach
  FOR EACH ROW EXECUTE FUNCTION public.guard_author_in_org('created_by');

DROP TRIGGER IF EXISTS client_contacts_author_in_org ON public.client_contacts;
CREATE TRIGGER client_contacts_author_in_org BEFORE INSERT OR UPDATE ON public.client_contacts
  FOR EACH ROW EXECUTE FUNCTION public.guard_author_in_org('created_by');

DROP TRIGGER IF EXISTS client_notes_author_in_org ON public.client_notes;
CREATE TRIGGER client_notes_author_in_org BEFORE INSERT OR UPDATE ON public.client_notes
  FOR EACH ROW EXECUTE FUNCTION public.guard_author_in_org('created_by');

DROP TRIGGER IF EXISTS clients_author_in_org ON public.clients;
CREATE TRIGGER clients_author_in_org BEFORE INSERT OR UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.guard_author_in_org('created_by');

DROP TRIGGER IF EXISTS executive_assessments_author_in_org ON public.executive_assessments;
CREATE TRIGGER executive_assessments_author_in_org BEFORE INSERT OR UPDATE ON public.executive_assessments
  FOR EACH ROW EXECUTE FUNCTION public.guard_author_in_org('approved_by', 'created_by');

DROP TRIGGER IF EXISTS executive_audit_events_author_in_org ON public.executive_audit_events;
CREATE TRIGGER executive_audit_events_author_in_org BEFORE INSERT OR UPDATE ON public.executive_audit_events
  FOR EACH ROW EXECUTE FUNCTION public.guard_author_in_org('actor_id');

DROP TRIGGER IF EXISTS executive_interview_plans_author_in_org ON public.executive_interview_plans;
CREATE TRIGGER executive_interview_plans_author_in_org BEFORE INSERT OR UPDATE ON public.executive_interview_plans
  FOR EACH ROW EXECUTE FUNCTION public.guard_author_in_org('approved_by', 'created_by');

DROP TRIGGER IF EXISTS executive_risk_reviews_author_in_org ON public.executive_risk_reviews;
CREATE TRIGGER executive_risk_reviews_author_in_org BEFORE INSERT OR UPDATE ON public.executive_risk_reviews
  FOR EACH ROW EXECUTE FUNCTION public.guard_author_in_org('approved_by', 'created_by');

DROP TRIGGER IF EXISTS executive_search_candidates_author_in_org ON public.executive_search_candidates;
CREATE TRIGGER executive_search_candidates_author_in_org BEFORE INSERT OR UPDATE ON public.executive_search_candidates
  FOR EACH ROW EXECUTE FUNCTION public.guard_author_in_org('added_by');

DROP TRIGGER IF EXISTS executive_searches_author_in_org ON public.executive_searches;
CREATE TRIGGER executive_searches_author_in_org BEFORE INSERT OR UPDATE ON public.executive_searches
  FOR EACH ROW EXECUTE FUNCTION public.guard_author_in_org('created_by');

DROP TRIGGER IF EXISTS fee_terms_author_in_org ON public.fee_terms;
CREATE TRIGGER fee_terms_author_in_org BEFORE INSERT OR UPDATE ON public.fee_terms
  FOR EACH ROW EXECUTE FUNCTION public.guard_author_in_org('created_by');

DROP TRIGGER IF EXISTS feedback_author_in_org ON public.feedback;
CREATE TRIGGER feedback_author_in_org BEFORE INSERT OR UPDATE ON public.feedback
  FOR EACH ROW EXECUTE FUNCTION public.guard_author_in_org('submitted_by');

DROP TRIGGER IF EXISTS hiring_manager_tokens_author_in_org ON public.hiring_manager_tokens;
CREATE TRIGGER hiring_manager_tokens_author_in_org BEFORE INSERT OR UPDATE ON public.hiring_manager_tokens
  FOR EACH ROW EXECUTE FUNCTION public.guard_author_in_org('created_by');

DROP TRIGGER IF EXISTS job_specs_author_in_org ON public.job_specs;
CREATE TRIGGER job_specs_author_in_org BEFORE INSERT OR UPDATE ON public.job_specs
  FOR EACH ROW EXECUTE FUNCTION public.guard_author_in_org('created_by');

DROP TRIGGER IF EXISTS placement_fee_lines_author_in_org ON public.placement_fee_lines;
CREATE TRIGGER placement_fee_lines_author_in_org BEFORE INSERT OR UPDATE ON public.placement_fee_lines
  FOR EACH ROW EXECUTE FUNCTION public.guard_author_in_org('created_by');

DROP TRIGGER IF EXISTS placement_fees_author_in_org ON public.placement_fees;
CREATE TRIGGER placement_fees_author_in_org BEFORE INSERT OR UPDATE ON public.placement_fees
  FOR EACH ROW EXECUTE FUNCTION public.guard_author_in_org('created_by');

-- The credit columns. `is_placement_credited` reads `owner_user_id` and
-- `sourced_by_user_id`, which makes this the closest thing in the schema to
-- an author column something resolves through.
DROP TRIGGER IF EXISTS placements_author_in_org ON public.placements;
CREATE TRIGGER placements_author_in_org BEFORE INSERT OR UPDATE ON public.placements
  FOR EACH ROW EXECUTE FUNCTION public.guard_author_in_org('created_by', 'owner_user_id', 'sourced_by_user_id');

DROP TRIGGER IF EXISTS project_reports_author_in_org ON public.project_reports;
CREATE TRIGGER project_reports_author_in_org BEFORE INSERT OR UPDATE ON public.project_reports
  FOR EACH ROW EXECUTE FUNCTION public.guard_author_in_org('generated_by');

DROP TRIGGER IF EXISTS projects_author_in_org ON public.projects;
CREATE TRIGGER projects_author_in_org BEFORE INSERT OR UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.guard_author_in_org('created_by');

DROP TRIGGER IF EXISTS role_success_profiles_author_in_org ON public.role_success_profiles;
CREATE TRIGGER role_success_profiles_author_in_org BEFORE INSERT OR UPDATE ON public.role_success_profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_author_in_org('approved_by', 'created_by');

DROP TRIGGER IF EXISTS shortlists_author_in_org ON public.shortlists;
CREATE TRIGGER shortlists_author_in_org BEFORE INSERT OR UPDATE ON public.shortlists
  FOR EACH ROW EXECUTE FUNCTION public.guard_author_in_org('created_by', 'submitted_by');

DROP TRIGGER IF EXISTS skills_author_in_org ON public.skills;
CREATE TRIGGER skills_author_in_org BEFORE INSERT OR UPDATE ON public.skills
  FOR EACH ROW EXECUTE FUNCTION public.guard_author_in_org('created_by');

DROP TRIGGER IF EXISTS sourcing_run_results_author_in_org ON public.sourcing_run_results;
CREATE TRIGGER sourcing_run_results_author_in_org BEFORE INSERT OR UPDATE ON public.sourcing_run_results
  FOR EACH ROW EXECUTE FUNCTION public.guard_author_in_org('promoted_by');

DROP TRIGGER IF EXISTS sourcing_runs_author_in_org ON public.sourcing_runs;
CREATE TRIGGER sourcing_runs_author_in_org BEFORE INSERT OR UPDATE ON public.sourcing_runs
  FOR EACH ROW EXECUTE FUNCTION public.guard_author_in_org('created_by', 'executed_by');
