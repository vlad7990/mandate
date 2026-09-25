-- 142 — MERGING TWO RECORDS OF ONE PERSON
--
-- Gate: docs/superpowers/specs/2026-09-25-candidate-merge-gate.md
-- (CONFIRMED, four rulings). §201 shipped the flag and named this gap in
-- the same breath: a flagged pair was surfaced and never resolvable.
--
-- ## Why this is a database function and not application code
--
-- A candidate row is the hub of EIGHTEEN tables. Reparenting them with
-- eighteen round trips from a server action means a network blip leaves
-- the notes on one record, the scores on another, and a survivor that
-- owns neither — a half-merge nobody can reconstruct. So the whole thing
-- is ONE transaction, the shape `issue_invoice` and `approve_admin_grant`
-- already use.
--
-- ## The three kinds of child row
--
-- NINETEEN unique indexes key on candidate_id, and almost all of them say
-- "one X per candidate per mandate". So "move every child row" is not a
-- design, it is an error — the reparent violates the constraint and the
-- merge fails. Each table is exactly one of:
--
--   MOVE      no unique constraint in the way. Both records' rows live.
--             Notes, feedback, outreach, the trail, the verdict ledger.
--             D2: this is human testimony with an author and a date, and
--             two recruiters' calls with one person are two real events.
--
--   COLLIDE   one-per-candidate. D1: the SURVIVOR's row stands. But a row
--             that does NOT collide is still moved — if the survivor has
--             nothing in that table, the discarded record's row is kept
--             rather than thrown away for nothing.
--
--   REFUSE    placements. D3: money, sign-off, and possibly an issued
--             invoice that is a frozen legal document (§158/§162).
--             Moving one would relabel who was placed under a document
--             that has already left the building.
--
-- ## The trap that would have made this fail on exactly the records that
-- ## matter most, proven live in an aborting transaction
--
--   A  notes + the composite _in_org FK : DELETED OK
--   B  feedback                          : BLOCKED ->
--      violates foreign key constraint "feedback_candidate_id_fkey"
--
-- `feedback_candidate_id_fkey` is declared with NO `ON DELETE` clause, so
-- it defaults to NO ACTION while every sibling cascades. **Feedback is
-- therefore reparented BEFORE the delete**, which it would be anyway
-- under D2 — but if it were not, the merge would fail on precisely the
-- candidates a recruiter has worked hardest on.
--
-- The constraint is deliberately NOT relaxed here. Making deletion easier
-- for the one table that records what a human concluded is the wrong
-- direction; the merge simply never meets the block.
--
-- ## The trail row is written HERE, by the database
--
-- Not through `record_activity_event`. The app-recordable door stays at
-- 27: this event cannot be skipped by the code path that most wants to
-- skip it, because it is inside the same transaction as the merge. The
-- event anchors to the SURVIVOR — §201's cascade lesson, where an event
-- naming the discarded row is deleted by the very act it records.

-- ---------------------------------------------------------------------------
-- 1. The trail's vocabulary: 101 -> 102
-- ---------------------------------------------------------------------------

ALTER TABLE public.activity_events
  DROP CONSTRAINT IF EXISTS activity_events_type_known;

ALTER TABLE public.activity_events
  ADD CONSTRAINT activity_events_type_known CHECK (event_type IN (
    'placement_recorded', 'placement_status_changed', 'placement_signoff_changed',
    'placement_deleted', 'fee_recorded', 'fee_updated', 'fee_line_earned',
    'fee_line_cancelled', 'fee_reversed', 'fee_terms_created', 'fee_terms_updated',
    'fee_terms_deleted', 'client_contact_added', 'client_contact_updated',
    'client_contact_removed', 'member_role_changed', 'member_status_changed',
    'member_founder_changed', 'member_org_changed', 'shortlist_published',
    'report_exported', 'hm_portal_opened', 'mandate_reassigned', 'external_invited',
    'external_invitation_revoked', 'external_invitation_resent', 'external_joined',
    'external_role_changed', 'external_status_changed', 'mandate_shared',
    'mandate_unshared', 'external_access_granted', 'external_access_revoked',
    'candidate_portal_link_issued', 'candidate_portal_link_revoked',
    'candidate_self_updated', 'candidate_withdrew', 'candidate_erasure_requested',
    'candidate_cv_submitted', 'feedback_interpreted', 'candidates_ranked',
    'candidate_parsed', 'candidate_evaluated', 'candidate_positioned',
    'candidate_researched', 'candidate_triangulated', 'candidate_profiled',
    'desk_digest_generated', 'company_researched', 'hm_researched',
    'culture_profiled', 'sourcing_queries_generated', 'intake_analyzed',
    'health_suggested', 'weekly_report_generated', 'calibration_derived',
    'job_spec_generated', 'shortlist_report_generated', 'copilot_answered',
    'success_profile_generated', 'interview_plan_generated',
    'executive_context_researched', 'candidate_search_answered',
    'sourcing_search_executed', 'outreach_strategy_drafted', 'relationship_updated',
    'network_dnc_set', 'network_dnc_cleared', 'engagement_updated',
    'prescreen_updated', 'skill_created', 'skill_updated', 'skill_paused',
    'skill_activated', 'skill_deleted', 'candidate_stage_changed',
    'task_assigned', 'task_completed', 'objective_created', 'objective_closed',
    'interview_plan_generation_requested', 'interview_plan_generation_failed',
    'interview_plan_approved', 'client_interview_generation_requested',
    'client_interview_generation_failed', 'client_interview_approved',
    'client_interview_answered', 'model_provider_added',
    'model_assignment_changed', 'invoice_created', 'invoice_issued',
    'invoice_voided', 'invoice_sent', 'admin_grant_proposed',
    'admin_grant_approved', 'admin_grant_rejected', 'admin_grant_expired',
    'calibration_rederived', 'evaluation_contested',
    'member_manager_changed', 'candidate_duplicate_discarded',
    'candidates_merged'
  ));

-- ---------------------------------------------------------------------------
-- 2. The merge
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.merge_candidates(
  p_keep    uuid,
  p_discard uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org      uuid := (SELECT public.current_user_org_id());
  v_keep     public.candidates%ROWTYPE;
  v_discard  public.candidates%ROWTYPE;
  v_moved    jsonb := '{}'::jsonb;
  v_dropped  jsonb := '{}'::jsonb;
  v_filled   text[] := ARRAY[]::text[];
  v_n        integer;
  v_placement_ref text;
BEGIN
  -- ------------------------------------------------------------------
  -- Doors. Every one of these re-derives from the session rather than
  -- trusting the caller: a definer function that believes its arguments
  -- is a definer function that leaks across orgs.
  -- ------------------------------------------------------------------
  IF coalesce((SELECT public.can_write_candidates()), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'merging records is a candidate-writer act'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_keep IS NULL OR p_discard IS NULL THEN
    RAISE EXCEPTION 'two records are required';
  END IF;

  IF p_keep = p_discard THEN
    RAISE EXCEPTION 'a record cannot be merged into itself';
  END IF;

  SELECT * INTO v_keep FROM public.candidates
   WHERE id = p_keep AND organization_id = v_org;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'the record to keep was not found';
  END IF;

  SELECT * INTO v_discard FROM public.candidates
   WHERE id = p_discard AND organization_id = v_org;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'the record to discard was not found';
  END IF;

  -- Same mandate only. `project_id` is a column ON the row, so the same
  -- person in two mandates is two records BY DESIGN (§200, §201's D4) —
  -- merging across mandates would delete a search's pipeline entry, not
  -- a duplicate.
  IF v_keep.project_id IS DISTINCT FROM v_discard.project_id THEN
    RAISE EXCEPTION 'both records must be in the same mandate';
  END IF;

  -- D3 — money. Refuse, name it, change nothing. The sentence carries
  -- the placement's status and offer date so the recruiter can find it,
  -- rather than asserting a role title this table does not store.
  IF EXISTS (SELECT 1 FROM public.placements WHERE candidate_id = p_discard) THEN
    SELECT 'a placement (' || p.status ||
           coalesce(', offer dated ' || to_char(p.offer_date, 'DD Mon YYYY'), '') || ')'
      INTO v_placement_ref
      FROM public.placements p WHERE p.candidate_id = p_discard LIMIT 1;
    RAISE EXCEPTION
      'the record you are discarding carries % — make it the record you keep, or remove the placement first',
      coalesce(v_placement_ref, 'a placement');
  END IF;

  -- ------------------------------------------------------------------
  -- MOVE — no unique constraint in the way; both records' rows live on.
  -- ------------------------------------------------------------------

  -- D2's load-bearing line. Notes carry an author and a date and no
  -- unique key: two recruiters' calls with one person are two events.
  UPDATE public.candidate_notes SET candidate_id = p_keep
   WHERE candidate_id = p_discard;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN v_moved := v_moved || jsonb_build_object('notes', v_n); END IF;

  -- ⚠️ MUST precede the DELETE. feedback_candidate_id_fkey has no
  -- ON DELETE clause, so it is NO ACTION and blocks the delete outright.
  UPDATE public.feedback SET candidate_id = p_keep
   WHERE candidate_id = p_discard;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN v_moved := v_moved || jsonb_build_object('feedback', v_n); END IF;

  UPDATE public.candidate_outreach SET candidate_id = p_keep
   WHERE candidate_id = p_discard;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN v_moved := v_moved || jsonb_build_object('outreach', v_n); END IF;

  UPDATE public.verdict_ledger SET candidate_id = p_keep
   WHERE candidate_id = p_discard;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN v_moved := v_moved || jsonb_build_object('verdicts', v_n); END IF;

  -- The trail moves rather than dying with the row: "what happened to
  -- this person" is the question it exists to answer.
  UPDATE public.activity_events SET candidate_id = p_keep
   WHERE candidate_id = p_discard;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN v_moved := v_moved || jsonb_build_object('trail_events', v_n); END IF;

  -- Sourcing provenance: first-touch attribution (041) reads these, and
  -- they are ON DELETE SET NULL — leaving them would quietly erase which
  -- run surfaced this person.
  UPDATE public.sourcing_run_results SET matched_candidate_id = p_keep
   WHERE matched_candidate_id = p_discard;
  UPDATE public.sourcing_run_results SET promoted_candidate_id = p_keep
   WHERE promoted_candidate_id = p_discard;

  -- ------------------------------------------------------------------
  -- COLLIDE — one per candidate. D1: the survivor's row stands. A row
  -- that does NOT collide still moves; nothing is dropped for nothing.
  -- ------------------------------------------------------------------

  -- PK (run_id, candidate_id): collides only within the same run.
  DELETE FROM public.sourcing_run_candidates d
   WHERE d.candidate_id = p_discard
     AND EXISTS (SELECT 1 FROM public.sourcing_run_candidates k
                  WHERE k.candidate_id = p_keep AND k.run_id = d.run_id);
  UPDATE public.sourcing_run_candidates SET candidate_id = p_keep
   WHERE candidate_id = p_discard;

  -- UNIQUE (project_id, candidate_id). Both records sit in ONE mandate,
  -- so "does the survivor have one" is the whole test.
  IF EXISTS (SELECT 1 FROM public.candidate_scores WHERE candidate_id = p_keep) THEN
    SELECT count(*) INTO v_n FROM public.candidate_scores WHERE candidate_id = p_discard;
    IF v_n > 0 THEN
      v_dropped := v_dropped || jsonb_build_object(
        'score', (SELECT overall_score FROM public.candidate_scores
                   WHERE candidate_id = p_discard LIMIT 1));
    END IF;
  ELSE
    UPDATE public.candidate_scores SET candidate_id = p_keep WHERE candidate_id = p_discard;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n > 0 THEN v_moved := v_moved || jsonb_build_object('score', v_n); END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM public.engagement_states WHERE candidate_id = p_keep) THEN
    SELECT count(*) INTO v_n FROM public.engagement_states WHERE candidate_id = p_discard;
    IF v_n > 0 THEN v_dropped := v_dropped || jsonb_build_object('engagement', v_n); END IF;
  ELSE
    UPDATE public.engagement_states SET candidate_id = p_keep WHERE candidate_id = p_discard;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n > 0 THEN v_moved := v_moved || jsonb_build_object('engagement', v_n); END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM public.prescreens WHERE candidate_id = p_keep) THEN
    SELECT count(*) INTO v_n FROM public.prescreens WHERE candidate_id = p_discard;
    IF v_n > 0 THEN v_dropped := v_dropped || jsonb_build_object('prescreens', v_n); END IF;
  ELSE
    UPDATE public.prescreens SET candidate_id = p_keep WHERE candidate_id = p_discard;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n > 0 THEN v_moved := v_moved || jsonb_build_object('prescreens', v_n); END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM public.outreach_strategies WHERE candidate_id = p_keep) THEN
    SELECT count(*) INTO v_n FROM public.outreach_strategies WHERE candidate_id = p_discard;
    IF v_n > 0 THEN v_dropped := v_dropped || jsonb_build_object('outreach_strategies', v_n); END IF;
  ELSE
    UPDATE public.outreach_strategies SET candidate_id = p_keep WHERE candidate_id = p_discard;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n > 0 THEN v_moved := v_moved || jsonb_build_object('outreach_strategies', v_n); END IF;
  END IF;

  -- Versioned per (project_id, candidate_id, version): if the survivor
  -- has ANY plan the version numbers collide, so it is all or nothing.
  IF EXISTS (SELECT 1 FROM public.interview_plans WHERE candidate_id = p_keep) THEN
    SELECT count(*) INTO v_n FROM public.interview_plans WHERE candidate_id = p_discard;
    IF v_n > 0 THEN v_dropped := v_dropped || jsonb_build_object('interview_plans', v_n); END IF;
  ELSE
    UPDATE public.interview_plans SET candidate_id = p_keep WHERE candidate_id = p_discard;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n > 0 THEN v_moved := v_moved || jsonb_build_object('interview_plans', v_n); END IF;
  END IF;

  -- UNIQUE (candidate_id) WHERE status = 'sent'. Moving a SENT Art.14
  -- notification preserves the fact that the person was told; two sent
  -- rows cannot both live, so the survivor's stands.
  IF EXISTS (SELECT 1 FROM public.candidate_notifications
              WHERE candidate_id = p_keep AND status = 'sent') THEN
    SELECT count(*) INTO v_n FROM public.candidate_notifications
      WHERE candidate_id = p_discard AND status = 'sent';
    IF v_n > 0 THEN v_dropped := v_dropped || jsonb_build_object('sent_notifications', v_n); END IF;
    DELETE FROM public.candidate_notifications
      WHERE candidate_id = p_discard AND status = 'sent';
  END IF;
  UPDATE public.candidate_notifications SET candidate_id = p_keep
   WHERE candidate_id = p_discard;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN v_moved := v_moved || jsonb_build_object('notifications', v_n); END IF;

  -- The executive-search family is scoped by search_id, so a collision
  -- is per search rather than per mandate.
  DELETE FROM public.executive_assessments d
   WHERE d.candidate_id = p_discard
     AND EXISTS (SELECT 1 FROM public.executive_assessments k
                  WHERE k.candidate_id = p_keep AND k.search_id = d.search_id);
  UPDATE public.executive_assessments SET candidate_id = p_keep WHERE candidate_id = p_discard;

  DELETE FROM public.executive_risk_reviews d
   WHERE d.candidate_id = p_discard
     AND EXISTS (SELECT 1 FROM public.executive_risk_reviews k
                  WHERE k.candidate_id = p_keep AND k.search_id = d.search_id);
  UPDATE public.executive_risk_reviews SET candidate_id = p_keep WHERE candidate_id = p_discard;

  DELETE FROM public.executive_interview_plans d
   WHERE d.candidate_id = p_discard
     AND EXISTS (SELECT 1 FROM public.executive_interview_plans k
                  WHERE k.candidate_id = p_keep AND k.search_id = d.search_id);
  UPDATE public.executive_interview_plans SET candidate_id = p_keep WHERE candidate_id = p_discard;

  DELETE FROM public.executive_search_candidates d
   WHERE d.candidate_id = p_discard
     AND EXISTS (SELECT 1 FROM public.executive_search_candidates k
                  WHERE k.candidate_id = p_keep AND k.search_id = d.search_id);
  UPDATE public.executive_search_candidates SET candidate_id = p_keep WHERE candidate_id = p_discard;

  -- ------------------------------------------------------------------
  -- D4 — complete the survivor from what the other record knew. BLANKS
  -- ONLY: a value already on the survivor is never overwritten.
  --
  -- Filling `email` re-fires the 098/139 trigger and re-keys the person
  -- from a name guess to a real identifier. That is the point.
  --
  -- ⚠️ `array_append`, NOT `v_filled || 'email'`. With a text[] on the
  -- left and an UNKNOWN-typed literal on the right, Postgres resolves the
  -- operator to `anyarray || anyarray` and tries to parse the string as an
  -- array literal — `malformed array literal: "email"`. The smoke test
  -- caught it on the first field that was actually blank, which means it
  -- would have fired on the FIRST REAL MERGE and on no test that never
  -- filled anything.
  -- ------------------------------------------------------------------
  IF nullif(btrim(coalesce(v_keep.email, '')), '') IS NULL
     AND nullif(btrim(coalesce(v_discard.email, '')), '') IS NOT NULL THEN
    UPDATE public.candidates SET email = v_discard.email WHERE id = p_keep;
    v_filled := array_append(v_filled, 'email');
  END IF;

  IF nullif(btrim(coalesce(v_keep.linkedin_url, '')), '') IS NULL
     AND nullif(btrim(coalesce(v_discard.linkedin_url, '')), '') IS NOT NULL THEN
    UPDATE public.candidates SET linkedin_url = v_discard.linkedin_url WHERE id = p_keep;
    v_filled := array_append(v_filled, 'linkedin_url');
  END IF;

  IF nullif(btrim(coalesce(v_keep.phone, '')), '') IS NULL
     AND nullif(btrim(coalesce(v_discard.phone, '')), '') IS NOT NULL THEN
    UPDATE public.candidates SET phone = v_discard.phone WHERE id = p_keep;
    v_filled := array_append(v_filled, 'phone');
  END IF;

  IF nullif(btrim(coalesce(v_keep.location, '')), '') IS NULL
     AND nullif(btrim(coalesce(v_discard.location, '')), '') IS NOT NULL THEN
    UPDATE public.candidates SET location = v_discard.location WHERE id = p_keep;
    v_filled := array_append(v_filled, 'location');
  END IF;

  IF nullif(btrim(coalesce(v_keep.current_company, '')), '') IS NULL
     AND nullif(btrim(coalesce(v_discard.current_company, '')), '') IS NOT NULL THEN
    UPDATE public.candidates SET current_company = v_discard.current_company WHERE id = p_keep;
    v_filled := array_append(v_filled, 'current_company');
  END IF;

  IF nullif(btrim(coalesce(v_keep.current_title, '')), '') IS NULL
     AND nullif(btrim(coalesce(v_discard.current_title, '')), '') IS NOT NULL THEN
    UPDATE public.candidates SET current_title = v_discard.current_title WHERE id = p_keep;
    v_filled := array_append(v_filled, 'current_title');
  END IF;

  -- The flag has been answered. Clear it on the survivor whichever way
  -- round the pair was flagged, so the notice does not outlive its
  -- question. (141's FK nulls the pointer on the discarded row anyway;
  -- `identity_review_at` is what marks a row as flagged, so it must go
  -- too or the banner renders with no name in it.)
  UPDATE public.candidates
     SET identity_review_of = NULL,
         identity_review_label = NULL,
         identity_review_at = NULL
   WHERE id = p_keep
     AND (identity_review_of = p_discard OR identity_review_of IS NULL);

  -- ------------------------------------------------------------------
  -- The trail, then the delete. Written here rather than through
  -- record_activity_event so it shares this transaction and cannot be
  -- skipped; anchored to the SURVIVOR because activity_events.candidate_id
  -- cascades and an event naming the discarded row would be deleted by
  -- the act it records (§201's lesson).
  -- ------------------------------------------------------------------
  PERFORM public.write_activity_event(
    p_organization_id => v_org,
    p_event_type      => 'candidates_merged',
    p_visibility      => 'org',
    p_project_id      => v_keep.project_id,
    p_candidate_id    => p_keep,
    p_detail          => jsonb_build_object(
      'kept_label',      v_keep.full_name,
      'discarded_label', v_discard.full_name,
      'moved',           v_moved,
      'dropped',         v_dropped,
      'filled',          to_jsonb(v_filled)
    )
  );

  DELETE FROM public.candidates WHERE id = p_discard;

  RETURN jsonb_build_object(
    'kept_id',         p_keep,
    'kept_label',      v_keep.full_name,
    'discarded_label', v_discard.full_name,
    'discarded_cv',    v_discard.cv_url,
    'moved',           v_moved,
    'dropped',         v_dropped,
    'filled',          to_jsonb(v_filled)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.merge_candidates(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.merge_candidates(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.merge_candidates(uuid, uuid) IS
  'Merge two candidate records of one person within ONE mandate, in a single transaction. Gate 2026-09-25: the survivor wins every one-per-candidate collision (D1) and the receipt names each drop; all notes, feedback, outreach and trail move (D2); a placement on the discarded record REFUSES the merge (D3); blank fields on the survivor are filled from the discarded record, never overwritten (D4). Reparents feedback BEFORE deleting because feedback_candidate_id_fkey is NO ACTION and blocks. Returns a receipt; the caller deletes the discarded CV object, which SQL cannot reach.';
