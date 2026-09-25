-- 141 — THE SAME PERSON IS NOT PARSED TWICE
--
-- Gate: docs/superpowers/specs/2026-09-25-cv-dedupe-gate.md (CONFIRMED,
-- six rulings). §200 shipped bulk intake and named this as the thing it
-- did not do: twenty CVs of one person in one batch made twenty
-- candidates and twenty billed parses.
--
-- ## The ordering problem, which is the whole design
--
-- Identity is known only AFTER the parse. A check before the money is
-- spent can match on the file's bytes and nothing else; a check that can
-- match on the PERSON has already paid. D1 ruled both, layered:
--
--   · `cv_sha256` — document identity, checked before the row exists.
--     Two byte-identical files are certainly the same document and a
--     document names one person. Free and exact.
--   · `identity_key` (unchanged, in the app and in 040/073) — person
--     identity, applied once the parser has written a real name and
--     email, which the 098/139 trigger has already used to resolve
--     `network_profile_id`. The database has therefore ALREADY decided
--     who this is by the time a parse returns; nothing here re-derives
--     it.
--
-- ## Document identity is deliberately outside the person-identity rule
--
-- `candidate_identity_key` (073) and `count_network_people` (040) are
-- transcriptions of src/lib/candidate-identity.ts and carry a warning:
-- change one, change all. THIS MIGRATION CHANGES NONE OF THEM. A hash
-- answers "is this the same file", which is a different question with a
-- different certainty, and letting one stand in for the other is the
-- §175 defect this whole slice exists to avoid.
--
-- ## What the columns do NOT do
--
-- `cv_sha256` is NULL for every row created before this migration and
-- stays that way. Backfilling would mean re-reading every stored file to
-- catch a case the post-parse check already catches by identity. So the
-- honest statement is: the first upload of a person after this ships is
-- the one that records the hash, and the second is the one that gets
-- caught for free. The pre-141 pool is covered by identity, not by bytes.
--
-- `identity_review_*` is D3's flag and ONLY a flag. A name|company match
-- with no email and no LinkedIn on either side is a real collision —
-- same name, same large employer — so both rows stand and a human
-- decides. There is no merge here and no automatic action; the columns
-- exist so the screen can say what matched and the flag survives a
-- reload.

-- ---------------------------------------------------------------------------
-- 1. Document identity
-- ---------------------------------------------------------------------------

ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS cv_sha256 text;

COMMENT ON COLUMN public.candidates.cv_sha256 IS
  'SHA-256 (lowercase hex) of the stored CV bytes. Document identity, NOT person identity — see candidate_identity_key for the latter. NULL for every row created before migration 141, and for rows with no file. Written by the upload action from the bytes the SERVER received; a hash computed in the browser is never trusted.';

-- Partial: the lookup is always "does this org already hold these bytes",
-- and the null rows (every pre-141 candidate) would otherwise bloat an
-- index that can never match them.
CREATE INDEX IF NOT EXISTS candidates_cv_sha256_idx
  ON public.candidates (organization_id, cv_sha256)
  WHERE cv_sha256 IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. D3's flag — the ambiguous pair
-- ---------------------------------------------------------------------------

ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS identity_review_of uuid
    REFERENCES public.candidates(id) ON DELETE SET NULL;

ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS identity_review_label text;

ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS identity_review_at timestamptz;

COMMENT ON COLUMN public.candidates.identity_review_of IS
  'The row this candidate matched on name|company only. ON DELETE SET NULL: if the other row goes, the pointer goes and identity_review_label still reads.';
COMMENT ON COLUMN public.candidates.identity_review_label IS
  'The matched row''s name as it was when the flag was raised. Snapshotted for the same reason member_org_changed snapshots org names — the sentence has to stay readable after the row it points at is gone.';
COMMENT ON COLUMN public.candidates.identity_review_at IS
  'When the flag was raised. This, not identity_review_of, is what marks a row as flagged — the pointer can null out, the fact that a human was asked cannot.';

-- Coherence: a flag is raised whole or not at all. `identity_review_of`
-- is excluded on purpose — it is allowed to null out underneath a live
-- flag, which is exactly what the FK above does.
ALTER TABLE public.candidates
  DROP CONSTRAINT IF EXISTS candidates_identity_review_coherent;

ALTER TABLE public.candidates
  ADD CONSTRAINT candidates_identity_review_coherent CHECK (
    (identity_review_at IS NULL) = (identity_review_label IS NULL)
  );

-- A new FK with no index is a new advisor finding; the pre-launch list
-- already carries a line about the old ones.
CREATE INDEX IF NOT EXISTS candidates_identity_review_of_idx
  ON public.candidates (identity_review_of)
  WHERE identity_review_of IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. The trail's vocabulary: 100 -> 101
-- ---------------------------------------------------------------------------
--
-- D2 deletes a candidate row that briefly existed and a file the
-- recruiter chose. A row created and destroyed inside one action is
-- invisible afterwards unless something says it happened, so the discard
-- is trailed.
--
-- ⚠️ THE EVENT POINTS AT THE SURVIVING ROW, NOT THE DELETED ONE.
-- `activity_events.candidate_id` is ON DELETE CASCADE (053), so an event
-- naming the discarded candidate would be deleted by the very act it
-- records. The surviving row is also the more useful anchor: the trail on
-- the person's record reads "a duplicate upload was discarded".

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
    'member_manager_changed', 'candidate_duplicate_discarded'
  ));

-- ---------------------------------------------------------------------------
-- 4. The app-recordable door: 26 -> 27
-- ---------------------------------------------------------------------------
--
-- Gated on `can_write_candidates()` — the same gate as
-- `candidate_stage_changed`, because discarding a duplicate upload is a
-- candidate-writer's act and nobody else's. Agents are not candidate
-- writers under this predicate, and this one is the recruiter's own act
-- anyway: the parse is the agent's, the decision to drop the row is the
-- action's, running in the uploader's session.

CREATE OR REPLACE FUNCTION public.record_activity_event(
  p_event_type   text,
  p_project_id   uuid DEFAULT NULL,
  p_candidate_id uuid DEFAULT NULL,
  p_client_id    uuid DEFAULT NULL,
  p_detail       jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org uuid := (SELECT public.current_user_org_id());
BEGIN
  IF p_event_type NOT IN ('shortlist_published', 'report_exported',
                          'hm_portal_opened', 'mandate_reassigned',
                          'skill_created', 'skill_updated', 'skill_paused',
                          'skill_activated', 'skill_deleted',
                          'candidate_stage_changed',
                          'candidate_duplicate_discarded',
                          'task_assigned', 'task_completed',
                          'objective_created', 'objective_closed',
                          'interview_plan_generation_requested',
                          'interview_plan_generation_failed',
                          'interview_plan_approved',
                          'client_interview_generation_requested',
                          'client_interview_generation_failed',
                          'client_interview_approved',
                          'model_provider_added',
                          'model_assignment_changed',
                          'invoice_created', 'invoice_issued',
                          'invoice_voided', 'invoice_sent') THEN
    RAISE EXCEPTION 'record_activity_event: % is not an app-recordable event', p_event_type;
  END IF;

  -- 102 + 120: skills and the model registry are admin territory —
  -- only the role that can change one can claim to have changed one.
  -- Agents are 'agent', not admin; the same refusal covers them.
  IF (p_event_type LIKE 'skill\_%'
      OR p_event_type IN ('model_provider_added', 'model_assignment_changed'))
     AND (SELECT public.is_org_admin()) IS NOT TRUE THEN
    RAISE EXCEPTION 'record_activity_event: % is an admin act', p_event_type
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 104 + 141: moving a candidate through the pipeline, and discarding a
  -- duplicate upload, are both candidate-writer acts.
  IF p_event_type IN ('candidate_stage_changed', 'candidate_duplicate_discarded')
     AND (SELECT public.can_write_candidates()) IS NOT TRUE THEN
    RAISE EXCEPTION 'record_activity_event: % is a candidate-writer act', p_event_type
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Assigning work is the desk's act; completing rides the actor
  -- stamp (the RLS pin already proved the right to complete).
  IF p_event_type = 'task_assigned'
     AND coalesce((SELECT public.can_manage_desk()), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'record_activity_event: % is a desk act', p_event_type
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 107: setting or closing an objective is an okr-writer's act. The
  -- detail carries titles, scopes and outcomes — never amounts (R1:
  -- these rows are org-visible and the money is not).
  IF p_event_type IN ('objective_created', 'objective_closed')
     AND coalesce((SELECT public.can_write_okrs()), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'record_activity_event: % is an okr-writer act', p_event_type
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 116 + 117: both interview lifecycles are a mandate-writer's act.
  IF p_event_type IN ('interview_plan_generation_requested',
                      'interview_plan_generation_failed',
                      'interview_plan_approved',
                      'client_interview_generation_requested',
                      'client_interview_generation_failed',
                      'client_interview_approved')
     AND coalesce((SELECT public.can_write_mandates()), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'record_activity_event: % is a mandate-writer act', p_event_type
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 123 + 126: the invoice lifecycle is the fee-writer's act — 050's
  -- split, BOTH halves. The rows land at 'fees' visibility below, which
  -- is the only reason amounts may ride the detail (gate D.3).
  IF p_event_type IN ('invoice_created', 'invoice_issued', 'invoice_voided',
                      'invoice_sent')
     AND NOT (coalesce((SELECT public.can_read_fees()), false)
              AND coalesce((SELECT public.can_write_mandates()), false)) THEN
    RAISE EXCEPTION 'record_activity_event: % is a fee-writer act', p_event_type
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_org IS NULL OR (SELECT public.can_read_org()) IS NOT TRUE THEN
    RETURN;
  END IF;

  PERFORM public.write_activity_event(
    p_organization_id => v_org,
    p_event_type      => p_event_type,
    p_visibility      => CASE
                           WHEN p_event_type IN ('invoice_created',
                                                 'invoice_issued',
                                                 'invoice_voided',
                                                 'invoice_sent')
                             THEN 'fees'
                           ELSE 'org'
                         END,
    p_project_id      => p_project_id,
    p_candidate_id    => p_candidate_id,
    p_client_id       => p_client_id,
    p_detail          => p_detail
  );
END;
$$;

COMMENT ON FUNCTION public.record_activity_event(text, uuid, uuid, uuid, jsonb) IS
  'The application''s door onto the activity trail. 27 app-recordable event types (141 added candidate_duplicate_discarded), each gated on the capability that authorises the act it claims. SECURITY DEFINER; stamps actor_id from auth.uid() so a caller cannot attribute an act to somebody else.';
