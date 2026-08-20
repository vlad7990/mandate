-- The first agent principal: role 'agent', the interpreter's grants.
--
-- Agents-as-principals slice one (plan in docs/handoffs/
-- NEXT-agents-as-principals.md, D1–D9 confirmed by the founder
-- 2026-08-20). The feedback-interpretation pipeline — a real agent
-- making judgments — has run on the service role inside the HM submit
-- routes' after() since it existed: a master key that bypasses every
-- policy in the product, wielded by whatever code path holds it, and a
-- trail that cannot say an agent acted at all. This file gives that
-- agent a principal to be: a users row with role 'agent', org-carried,
-- whose entire reach is the named policies below.
--
-- ## What 'agent' is (D1) and is not (D2)
--
-- One role, not fourteen: the agent KIND (interpreter, ranker, parser…)
-- is attribution detail carried on every event, not authority. The role
-- joins `users_role_check` and gets its own XOR branch — org NOT NULL,
-- because an unattached agent is meaningless, and never client_id — and
-- joins NOTHING else. Not can_read_org(), not any staff predicate, not
-- the members-screen vocabulary. The 067 lesson applied at authoring
-- time: every staff predicate enumerates its roles by name and 'agent'
-- appears in none of them, so every org surface refuses the agent by
-- never having heard of it. Its reach is exactly the D6 grants below,
-- and agent_principal_invariants.sql pins the negatives by name.
--
-- ## The grants (D6), enumerated from the pipeline's code, not memory
--
-- Read from `runHmFeedbackPipeline` (src/lib/hm-portal/submit.ts),
-- `applyRecalibration` (src/lib/recalibration/recalibrate.ts),
-- `computeAndStoreScores` (src/lib/ranking/scoring-engine.ts),
-- `recordCalibrationSnapshot` (src/lib/calibration/history.ts) and
-- `loadActiveSkills` (src/lib/skills/skill-injector.ts — the pipeline
-- calls it via applySkillsToPrompt; under the service-role after() the
-- call could never build a client and silently stripped every skill,
-- so the agent session is also the first time recruiter-authored
-- skills lawfully reach an HM-portal interpretation):
--
--   projects            SELECT (calibration_model, onboarding context,
--                       client_id for skill scoping) + UPDATE (the
--                       recalibrated model and its summary)
--   feedback            SELECT (the new rows and the prior tail) +
--                       UPDATE (interpreted, triggered_recalibration)
--   candidates          SELECT (the reviewed candidate's profile)
--   candidate_scores    SELECT + INSERT + UPDATE (the re-scoring upsert)
--   calibration_history INSERT (the snapshot; changed_by is the agent)
--   skills              SELECT (the injection layer's read)
--
-- Nothing else — not hiring_manager_reviews (the rows are passed in by
-- the door that wrote them), not users beyond the 059 self-read, not
-- clients, not fees, not a single portal RPC.
--
-- Suspension (D3) rides the same mechanics as every suspension proof
-- since §18: every policy below resolves through current_user_role(),
-- which is active-only — `status = 'suspended'` on the agent's row
-- kills new sign-ins at GoTrue and in-flight JWTs at the predicate
-- layer, nothing here has to remember.
--
-- ## Attribution (D4): a new event, through a new narrow door
--
-- activity_events has no INSERT policy by design (053) — the only write
-- paths are SECURITY DEFINER. `record_activity_event` gates on
-- can_read_org(), which the agent rightly fails, so the agent gets its
-- own writer: `record_agent_event`, gated on the agent role itself,
-- allowing exactly one event type ('feedback_interpreted'), org and
-- actor stamped from the session — an agent cannot attribute its work
-- to anyone else, or record anything but what it is for. The trail
-- finally distinguishes "the recruiter wrote this" from "the
-- interpreter acted on the recruiter's submission".
--
-- ## The boundary (Phase 1's guard rule)
--
-- Role changes INTO and OUT OF 'agent' are founder territory, like org
-- moves: an agent cannot be promoted to admin, an admin cannot become
-- an agent. The XOR already refuses the transitions that would strand
-- columns; the guard refuses the rest by hand, with a sentence.


-- ---------------------------------------------------------------------------
-- 1. The vocabulary and the XOR
-- ---------------------------------------------------------------------------

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE public.users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin', 'manager', 'recruiter', 'researcher', 'viewer',
                  'agent',
                  'hiring_manager', 'client_hr', 'client_admin'));

-- Three branches now. Staff may have org NULL (a pending signup); an
-- agent must have an org (an unattached agent is meaningless — D1) and
-- never a client; an external must have a client and no org. Because
-- the role CHECK admits exactly these nine values, every row falls into
-- exactly one branch.
ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_client_boundary_check;

ALTER TABLE public.users
  ADD CONSTRAINT users_client_boundary_check
  CHECK (
    (role IN ('admin', 'manager', 'recruiter', 'researcher', 'viewer')
      AND client_id IS NULL)
    OR
    (role = 'agent'
      AND organization_id IS NOT NULL
      AND client_id IS NULL)
    OR
    (role IN ('hiring_manager', 'client_hr', 'client_admin')
      AND organization_id IS NULL
      AND client_id IS NOT NULL)
  );


-- ---------------------------------------------------------------------------
-- 2. The agent predicate
-- ---------------------------------------------------------------------------

-- Coalesced at the source like is_client_admin (067), because
-- record_agent_event below reads it NEGATED in plpgsql — the
-- invariant-11 lesson, fourth application. Active-only via
-- current_user_role(), which is the suspension kill switch.
CREATE OR REPLACE FUNCTION public.is_agent()
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT coalesce(public.current_user_role() = 'agent', false)
$$;

REVOKE ALL ON FUNCTION public.is_agent() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.is_agent() TO authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 3. The grants (D6) — and nothing else
-- ---------------------------------------------------------------------------

-- Every policy: own org only, agent role by name, active-only through
-- the predicate. current_user_org_id() is not status-gated, so the
-- is_agent() conjunct is the one doing the suspension work.

-- projects: the mandate context read, and the recalibration write.
DROP POLICY IF EXISTS projects_agent_select ON public.projects;
CREATE POLICY projects_agent_select ON public.projects
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_agent())
    AND organization_id = (SELECT public.current_user_org_id())
  );

DROP POLICY IF EXISTS projects_agent_update ON public.projects;
CREATE POLICY projects_agent_update ON public.projects
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.is_agent())
    AND organization_id = (SELECT public.current_user_org_id())
  )
  WITH CHECK (
    (SELECT public.is_agent())
    AND organization_id = (SELECT public.current_user_org_id())
  );

-- feedback: the rows under interpretation and the prior tail, and the
-- interpreted / triggered_recalibration writes.
DROP POLICY IF EXISTS feedback_agent_select ON public.feedback;
CREATE POLICY feedback_agent_select ON public.feedback
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_agent())
    AND organization_id = (SELECT public.current_user_org_id())
  );

DROP POLICY IF EXISTS feedback_agent_update ON public.feedback;
CREATE POLICY feedback_agent_update ON public.feedback
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.is_agent())
    AND organization_id = (SELECT public.current_user_org_id())
  )
  WITH CHECK (
    (SELECT public.is_agent())
    AND organization_id = (SELECT public.current_user_org_id())
  );

-- candidates: the reviewed candidate's parsed profile. Read only —
-- the interpreter never edits a person.
DROP POLICY IF EXISTS candidates_agent_select ON public.candidates;
CREATE POLICY candidates_agent_select ON public.candidates
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_agent())
    AND organization_id = (SELECT public.current_user_org_id())
  );

-- candidate_scores: the re-scoring upsert (INSERT + UPDATE) and the
-- previous-rank read it starts from.
DROP POLICY IF EXISTS candidate_scores_agent_select ON public.candidate_scores;
CREATE POLICY candidate_scores_agent_select ON public.candidate_scores
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_agent())
    AND organization_id = (SELECT public.current_user_org_id())
  );

DROP POLICY IF EXISTS candidate_scores_agent_insert ON public.candidate_scores;
CREATE POLICY candidate_scores_agent_insert ON public.candidate_scores
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_agent())
    AND organization_id = (SELECT public.current_user_org_id())
  );

DROP POLICY IF EXISTS candidate_scores_agent_update ON public.candidate_scores;
CREATE POLICY candidate_scores_agent_update ON public.candidate_scores
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.is_agent())
    AND organization_id = (SELECT public.current_user_org_id())
  )
  WITH CHECK (
    (SELECT public.is_agent())
    AND organization_id = (SELECT public.current_user_org_id())
  );

-- calibration_history: the snapshot append. Insert only — history is
-- not the agent's to read or rewrite.
DROP POLICY IF EXISTS calibration_history_agent_insert ON public.calibration_history;
CREATE POLICY calibration_history_agent_insert ON public.calibration_history
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_agent())
    AND organization_id = (SELECT public.current_user_org_id())
  );

-- skills: the injection layer's read. The org's recruiters author how
-- the interpreter should think; the interpreter reads it, never writes.
DROP POLICY IF EXISTS skills_agent_select ON public.skills;
CREATE POLICY skills_agent_select ON public.skills
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_agent())
    AND organization_id = (SELECT public.current_user_org_id())
  );


-- ---------------------------------------------------------------------------
-- 4. The guard learns the agent boundary
-- ---------------------------------------------------------------------------

-- Extends 071's guard_user_privilege_changes. One new rule, placed with
-- the founder-only column rules (before the self branch, so an agent
-- session poking its own row meets the same wall): role changes into or
-- out of 'agent' move by founder hand only. Everything else is
-- byte-identical to 071.
CREATE OR REPLACE FUNCTION public.guard_user_privilege_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_other_admins int;
BEGIN
  -- No JWT: the service-role client, or the SECURITY DEFINER signup
  -- trigger inserting the row in the first place. Both are trusted paths.
  IF (SELECT auth.uid()) IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.is_current_user_founder() THEN
    RETURN NEW;
  END IF;

  IF NEW.is_founder IS DISTINCT FROM OLD.is_founder THEN
    RAISE EXCEPTION 'is_founder can only be changed by a founder'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'organization_id can only be changed by a founder'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NEW.client_id IS DISTINCT FROM OLD.client_id THEN
    RAISE EXCEPTION 'client_id can only be changed by a founder'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- The agent boundary (074). An agent cannot be promoted into the
  -- human vocabulary and a human cannot be turned into an agent by
  -- anyone below the founder — the boundary moves by founder hand,
  -- like org moves. role is NOT NULL, so plain equality is safe; the
  -- comparison is on the boolean pair to catch both directions in one
  -- clause.
  IF (NEW.role = 'agent') IS DISTINCT FROM (OLD.role = 'agent') THEN
    RAISE EXCEPTION 'the agent role can only be granted or removed by a founder'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Self-service (071). coalesce(), not a bare NOT: is_org_admin()
  -- resolves through current_user_role(), which is NULL for a pending or
  -- suspended account. Read negated uncoalesced, a pending signup would
  -- skip this branch, fall past the external block (no client_id) and
  -- the last-admin rules (not an admin), and RETURN NEW with any column
  -- it liked — free to write its own role. The invariant-11 lesson,
  -- third application; self_service_invariants.sql pins it with a
  -- pending-signup escalation attempt, and its control run simulates
  -- exactly this regression.
  IF OLD.id = (SELECT auth.uid())
     AND NOT coalesce(public.is_org_admin(), false) THEN
    -- role and email never move by one's own hand; status moves only
    -- for a client_admin (their 067 power over every account of their
    -- company, own row included — kept). is_client_admin() is coalesced
    -- at the source (067) and active-only, so a suspended external
    -- cannot self-reactivate through the carried power.
    IF NEW.role IS DISTINCT FROM OLD.role
       OR NEW.email IS DISTINCT FROM OLD.email
       OR (NEW.status IS DISTINCT FROM OLD.status
           AND NOT public.is_client_admin()) THEN
      RAISE EXCEPTION 'only your name may be changed on your own account'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END IF;

  -- External rows: column discipline for non-founder updaters. Reach is
  -- users_update_client_externals' job; which columns is this one's.
  IF OLD.client_id IS NOT NULL THEN
    IF (SELECT public.current_user_client_id()) IS NOT NULL THEN
      -- An external updating an external. is_client_admin() is coalesced —
      -- read negated here, the invariant-11 shape.
      IF NOT public.is_client_admin() THEN
        RAISE EXCEPTION 'only a client admin may administer client accounts'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
      IF NEW.role IS DISTINCT FROM OLD.role
         OR NEW.email IS DISTINCT FROM OLD.email
         OR NEW.full_name IS DISTINCT FROM OLD.full_name THEN
        RAISE EXCEPTION 'a client admin may only change account status'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
    ELSE
      IF NEW.email IS DISTINCT FROM OLD.email THEN
        RAISE EXCEPTION 'email can only be changed by a founder'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
    END IF;
  END IF;

  -- Demoting the last admin. Counted among active members only, because an
  -- org whose only other admin is suspended is an org with no admin.
  IF OLD.role = 'admin' AND NEW.role IS DISTINCT FROM 'admin' THEN
    SELECT count(*) INTO v_other_admins
      FROM public.users
     WHERE organization_id = OLD.organization_id
       AND id <> OLD.id
       AND role = 'admin'
       AND status = 'active';

    IF v_other_admins = 0 THEN
      RAISE EXCEPTION 'an organization must keep at least one active admin'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- Same rule when the last admin is suspended rather than demoted.
  IF OLD.role = 'admin' AND OLD.status = 'active' AND NEW.status IS DISTINCT FROM 'active' THEN
    SELECT count(*) INTO v_other_admins
      FROM public.users
     WHERE organization_id = OLD.organization_id
       AND id <> OLD.id
       AND role = 'admin'
       AND status = 'active';

    IF v_other_admins = 0 THEN
      RAISE EXCEPTION 'an organization must keep at least one active admin'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_user_privilege_changes() FROM public, anon;

-- The trigger itself is unchanged from 046 and stays attached; only the
-- function body moved.


-- ---------------------------------------------------------------------------
-- 5. Attribution: the event type and the agent's one writer
-- ---------------------------------------------------------------------------

-- The vocabulary grows 'feedback_interpreted'. The list below is the
-- live constraint's list (read from pg_constraint, not from 053 — the
-- §5h rule), plus the one new value.
ALTER TABLE public.activity_events
  DROP CONSTRAINT IF EXISTS activity_events_type_known;

ALTER TABLE public.activity_events
  ADD CONSTRAINT activity_events_type_known CHECK (event_type IN (
    'placement_recorded',
    'placement_status_changed',
    'placement_signoff_changed',
    'placement_deleted',
    'fee_recorded',
    'fee_updated',
    'fee_line_earned',
    'fee_line_cancelled',
    'fee_reversed',
    'fee_terms_created',
    'fee_terms_updated',
    'fee_terms_deleted',
    'client_contact_added',
    'client_contact_updated',
    'client_contact_removed',
    'member_role_changed',
    'member_status_changed',
    'member_founder_changed',
    'member_org_changed',
    'shortlist_published',
    'report_exported',
    'hm_portal_opened',
    'mandate_reassigned',
    'external_invited',
    'external_invitation_revoked',
    'external_invitation_resent',
    'external_joined',
    'external_role_changed',
    'external_status_changed',
    'mandate_shared',
    'mandate_unshared',
    'external_access_granted',
    'external_access_revoked',
    'candidate_portal_link_issued',
    'candidate_portal_link_revoked',
    'candidate_self_updated',
    'candidate_withdrew',
    'candidate_erasure_requested',
    'candidate_cv_submitted',
    -- 074: the interpreter's act, under its own name.
    'feedback_interpreted'
  ));

-- The agent's one door into the trail. Narrower than
-- record_activity_event in every direction: one event type, one caller
-- class (an ACTIVE agent — suspension closes this door with everything
-- else), org and actor stamped from the session inside
-- write_activity_event, so an agent can neither impersonate a human
-- nor scatter events into another org. Visibility 'org': the
-- interpretation is org business exactly like the feedback it
-- interprets.
CREATE OR REPLACE FUNCTION public.record_agent_event(
  p_event_type   text,
  p_project_id   uuid DEFAULT NULL,
  p_candidate_id uuid DEFAULT NULL,
  p_detail       jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid := (SELECT public.current_user_org_id());
BEGIN
  IF p_event_type NOT IN ('feedback_interpreted') THEN
    RAISE EXCEPTION 'record_agent_event: % is not an agent-recordable event', p_event_type;
  END IF;

  -- is_agent() is coalesced at the source — read negated here, the
  -- invariant-11 shape, fourth application.
  IF NOT public.is_agent() THEN
    RAISE EXCEPTION 'record_agent_event: only an active agent principal may record agent events'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_org IS NULL THEN
    RETURN;   -- unreachable for a lawful agent row (the XOR requires an org)
  END IF;

  PERFORM public.write_activity_event(
    p_organization_id => v_org,
    p_event_type      => p_event_type,
    p_visibility      => 'org',
    p_project_id      => p_project_id,
    p_candidate_id    => p_candidate_id,
    p_detail          => coalesce(p_detail, '{}'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_agent_event(text, uuid, uuid, jsonb)
  FROM public, anon;
GRANT EXECUTE ON FUNCTION public.record_agent_event(text, uuid, uuid, jsonb)
  TO authenticated;
