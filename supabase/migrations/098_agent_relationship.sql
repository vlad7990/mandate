-- 098 — the Engage arc, slice two: the person becomes REAL — the
-- Candidate Relationship Agent's table, resolver, DNC machinery and
-- vocabulary (D3/D4 of NEXT-relationship-agent.md, D1–D8 confirmed
-- 2026-08-25; spec §7).
--
-- The Talent Network computes people at read time; nothing durable
-- survives about a relationship. This migration stores the person
-- WITHOUT duplicating the candidate system:
--
--   * `network_profiles` — one row per (org, identity_key), the key
--     computed by the EXISTING `candidate_identity_key()` (073's SQL
--     transcription of lib/candidate-identity.ts — reused, not
--     re-transcribed; `count_network_people` is refactored onto it in
--     this migration so the rule keeps ONE SQL home).
--   * The resolver lives in the DATA LAYER: a BEFORE trigger on
--     candidates' identity columns find-or-creates the profile and
--     (re)links `network_profile_id` — every birth path (manual, CV
--     upload, network copy, the promotion RPC, the candidate portal's
--     self-updates) is covered with zero app wiring, and an identity
--     edit RE-links instead of drifting.
--   * DNC is DATA, and its writes are RPC-only (the 043
--     guard_subject_notified pattern, GUC-armed): `set_network_dnc`
--     (human, reason mandatory, actor recorded),
--     `clear_network_dnc` (FOUNDER ONLY, reason mandatory — nothing
--     else un-sets it, per spec §7.1), and the candidate portal's
--     withdraw/erasure RPCs set it SYSTEMICALLY. A direct UPDATE of
--     any dnc column — by an agent OR a human — is refused by the
--     guard: a suppression outside the record is not a suppression.
--   * The agent (#24) may UPDATE profiles (merge-writing disposition
--     / relationship_state / follow-ups app-side), but the guard
--     refuses it — like everyone outside the RPCs — any dnc change
--     and any relationship_state move into or out of
--     'do_not_contact'.
--
-- Vocabulary: `relationship_updated` (agent; allowlist TWENTY-SIX →
-- TWENTY-SEVEN) plus the HUMAN types `network_dnc_set` /
-- `network_dnc_cleared` (recorded by the RPCs, never by an agent).
-- CHECK rebuilt from the LIVE pg_constraint list, 65 → 68.

-- ---------------------------------------------------------------------------
-- 1. network_profiles
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.network_profiles (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id            uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  -- THE existing identity rule, verbatim (candidate_identity_key).
  identity_key               text NOT NULL,
  display_name               text NOT NULL,
  primary_email              text,
  linkedin_url               text,
  relationship_state         text NOT NULL DEFAULT 'cold'
                               CHECK (relationship_state IN
                                 ('cold', 'contacted', 'engaged', 'warm',
                                  'placed', 'client_contact', 'do_not_contact')),
  dnc                        boolean NOT NULL DEFAULT false,
  dnc_reason                 text,
  dnc_set_at                 timestamptz,
  -- NULL while dnc is set = the SYSTEM set it (the erasure/withdraw flow).
  dnc_set_by                 uuid REFERENCES public.users(id),
  -- Timing, motivation, location constraints, comp context, notice —
  -- STRUCTURED, merge-written by #24 from evidence and by humans.
  disposition                jsonb NOT NULL DEFAULT '{}'::jsonb,
  follow_up_at               date,
  follow_up_note             text,
  last_meaningful_contact_at timestamptz,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now(),
  -- A suppression without a reason is not a record; and the state
  -- column may not claim do_not_contact while dnc says otherwise —
  -- one truth, not two.
  CONSTRAINT network_profiles_dnc_recorded CHECK (
    (NOT dnc OR (dnc_reason IS NOT NULL AND dnc_set_at IS NOT NULL))
    AND (relationship_state <> 'do_not_contact' OR dnc)
  ),
  CONSTRAINT network_profiles_person_unique UNIQUE (organization_id, identity_key)
);

CREATE INDEX IF NOT EXISTS network_profiles_org_idx
  ON public.network_profiles (organization_id);
CREATE INDEX IF NOT EXISTS network_profiles_follow_up_idx
  ON public.network_profiles (organization_id, follow_up_at)
  WHERE follow_up_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS network_profiles_dnc_set_by_idx
  ON public.network_profiles (dnc_set_by);

ALTER TABLE public.network_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY network_profiles_role_select ON public.network_profiles
  FOR SELECT TO authenticated
  USING (
    organization_id = (SELECT public.current_user_org_id())
    AND (SELECT public.can_read_org())
  );

-- Relationship editing is candidate-editorial. The dnc columns are
-- NOT this door's to change — the guard below refuses any dnc write
-- outside the named RPCs, human or agent alike.
CREATE POLICY network_profiles_role_update ON public.network_profiles
  FOR UPDATE TO authenticated
  USING (
    organization_id = (SELECT public.current_user_org_id())
    AND (SELECT public.can_write_candidates())
  )
  WITH CHECK (
    organization_id = (SELECT public.current_user_org_id())
    AND (SELECT public.can_write_candidates())
  );

CREATE POLICY network_profiles_agent_select ON public.network_profiles
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_agent())
    AND organization_id = (SELECT public.current_user_org_id())
  );

-- #24's door. The seam merge-writes disposition / relationship_state
-- / follow_up_at / last_meaningful_contact_at; the guard refuses the
-- dnc family and the do_not_contact transitions.
CREATE POLICY network_profiles_agent_update ON public.network_profiles
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.is_agent())
    AND organization_id = (SELECT public.current_user_org_id())
  )
  WITH CHECK (
    (SELECT public.is_agent())
    AND organization_id = (SELECT public.current_user_org_id())
  );

-- NO INSERT policies (profiles are born by the resolver, definer-side),
-- NO DELETE policies (relationship data survives — spec §4.3).

-- ---------------------------------------------------------------------------
-- 2. The DNC guard — RPC-only writes, the guard_subject_notified
--    pattern. Without the transaction-local GUC, ANY change to the
--    dnc family or any move into/out of do_not_contact is refused.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_network_dnc()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_allowed boolean :=
    COALESCE(current_setting('mandate.allow_dnc_write', true), '') = 'on';
BEGIN
  IF NOT v_allowed THEN
    IF NEW.dnc IS DISTINCT FROM OLD.dnc
       OR NEW.dnc_reason IS DISTINCT FROM OLD.dnc_reason
       OR NEW.dnc_set_at IS DISTINCT FROM OLD.dnc_set_at
       OR NEW.dnc_set_by IS DISTINCT FROM OLD.dnc_set_by THEN
      RAISE EXCEPTION 'do-not-contact is set by set_network_dnc(), cleared by clear_network_dnc(), or set by the candidate portal — never written directly'
        USING ERRCODE = 'P0001';
    END IF;
    IF (NEW.relationship_state = 'do_not_contact')
       IS DISTINCT FROM (OLD.relationship_state = 'do_not_contact') THEN
      RAISE EXCEPTION 'a relationship enters or leaves do_not_contact only through the DNC RPCs'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS network_profiles_guard_dnc ON public.network_profiles;
CREATE TRIGGER network_profiles_guard_dnc
  BEFORE UPDATE ON public.network_profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_network_dnc();

-- ---------------------------------------------------------------------------
-- 3. The resolver — find-or-create in SQL, fired by trigger on every
--    candidate birth path and identity edit.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.resolve_network_profile(
  p_org             uuid,
  p_full_name       text,
  p_email           text,
  p_linkedin_url    text,
  p_current_company text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text;
  v_id  uuid;
BEGIN
  IF p_org IS NULL OR nullif(btrim(coalesce(p_full_name, '')), '') IS NULL THEN
    RETURN NULL;
  END IF;
  v_key := public.candidate_identity_key(
             p_email, p_linkedin_url, p_full_name, p_current_company);

  INSERT INTO public.network_profiles
    (organization_id, identity_key, display_name, primary_email, linkedin_url)
  VALUES
    (p_org, v_key, btrim(p_full_name),
     nullif(lower(btrim(coalesce(p_email, ''))), ''),
     nullif(btrim(coalesce(p_linkedin_url, '')), ''))
  ON CONFLICT (organization_id, identity_key) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM public.network_profiles
     WHERE organization_id = p_org AND identity_key = v_key;
  END IF;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_network_profile(uuid, text, text, text, text)
  FROM public, anon;
GRANT EXECUTE ON FUNCTION public.resolve_network_profile(uuid, text, text, text, text)
  TO authenticated;

ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS network_profile_id uuid
    REFERENCES public.network_profiles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS candidates_network_profile_idx
  ON public.candidates (network_profile_id);

CREATE OR REPLACE FUNCTION public.candidates_link_network_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.network_profile_id := public.resolve_network_profile(
    NEW.organization_id, NEW.full_name, NEW.email,
    NEW.linkedin_url, NEW.current_company);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS candidates_link_network_profile ON public.candidates;
CREATE TRIGGER candidates_link_network_profile
  BEFORE INSERT OR UPDATE OF email, linkedin_url, full_name, current_company
  ON public.candidates
  FOR EACH ROW EXECUTE FUNCTION public.candidates_link_network_profile();

-- Backfill: every existing candidate row gets its person.
UPDATE public.candidates c
   SET network_profile_id = public.resolve_network_profile(
         c.organization_id, c.full_name, c.email,
         c.linkedin_url, c.current_company)
 WHERE c.organization_id IS NOT NULL;

-- One SQL home for the identity rule: the badge count now reads
-- through candidate_identity_key instead of its own CASE copy.
CREATE OR REPLACE FUNCTION public.count_network_people()
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COUNT(DISTINCT public.candidate_identity_key(
    c.email, c.linkedin_url, c.full_name, c.current_company))::integer
  FROM public.candidates AS c;
$$;

-- ---------------------------------------------------------------------------
-- 4. The DNC RPCs — the only doors through the guard.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_network_dnc(
  p_profile_id uuid,
  p_reason     text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org  uuid := (SELECT public.current_user_org_id());
  v_name text;
BEGIN
  IF (SELECT public.is_agent()) THEN
    RAISE EXCEPTION 'set_network_dnc: do-not-contact is a human act — an agent can never set it'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT (SELECT public.can_write_candidates()) THEN
    RAISE EXCEPTION 'set_network_dnc: your role cannot suppress a person'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF nullif(btrim(coalesce(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'set_network_dnc: a suppression without a reason is not a record — say why'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('mandate.allow_dnc_write', 'on', true);

  UPDATE public.network_profiles
     SET dnc = true,
         dnc_reason = btrim(p_reason),
         dnc_set_at = now(),
         dnc_set_by = (SELECT auth.uid()),
         relationship_state = 'do_not_contact',
         updated_at = now()
   WHERE id = p_profile_id
     AND organization_id = v_org
     AND NOT dnc
  RETURNING display_name INTO v_name;

  IF v_name IS NULL THEN
    RAISE EXCEPTION 'set_network_dnc: no un-suppressed profile in your organisation matches'
      USING ERRCODE = 'no_data_found';
  END IF;

  PERFORM public.write_activity_event(
    p_organization_id => v_org,
    p_event_type      => 'network_dnc_set',
    p_visibility      => 'org',
    p_detail          => jsonb_build_object(
                           'person', v_name,
                           'reason', btrim(p_reason),
                           'source', 'recruiter'));
END;
$$;

REVOKE ALL ON FUNCTION public.set_network_dnc(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_network_dnc(uuid, text) TO authenticated;

-- The ONLY un-set, and it is founder territory (spec §7.1): a reason
-- is mandatory and the act is recorded under the founder's name.
CREATE OR REPLACE FUNCTION public.clear_network_dnc(
  p_profile_id uuid,
  p_reason     text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org  uuid := (SELECT public.current_user_org_id());
  v_name text;
BEGIN
  IF NOT (SELECT public.is_current_user_founder()) THEN
    RAISE EXCEPTION 'clear_network_dnc: only a founder-level act with a recorded reason un-sets do-not-contact'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF nullif(btrim(coalesce(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'clear_network_dnc: the un-set must record its reason'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('mandate.allow_dnc_write', 'on', true);

  UPDATE public.network_profiles
     SET dnc = false,
         dnc_reason = NULL,
         dnc_set_at = NULL,
         dnc_set_by = NULL,
         relationship_state = CASE WHEN relationship_state = 'do_not_contact'
                                   THEN 'cold' ELSE relationship_state END,
         updated_at = now()
   WHERE id = p_profile_id
     AND organization_id = v_org
     AND dnc
  RETURNING display_name INTO v_name;

  IF v_name IS NULL THEN
    RAISE EXCEPTION 'clear_network_dnc: no suppressed profile in your organisation matches'
      USING ERRCODE = 'no_data_found';
  END IF;

  PERFORM public.write_activity_event(
    p_organization_id => v_org,
    p_event_type      => 'network_dnc_cleared',
    p_visibility      => 'org',
    p_detail          => jsonb_build_object(
                           'person', v_name,
                           'reason', btrim(p_reason)));
END;
$$;

REVOKE ALL ON FUNCTION public.clear_network_dnc(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.clear_network_dnc(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Systemic DNC: the portal's withdraw and erasure RPCs suppress
--    the person as a side effect of the candidate's own act.
--    dnc_set_by stays NULL — the SYSTEM set it, and the record says so.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.candidate_portal_withdraw(p_token uuid, p_project_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tok public.candidate_portal_tokens%ROWTYPE;
  v_cand record;
BEGIN
  v_tok := public.candidate_portal_token_row(p_token);

  SELECT c.* INTO v_cand FROM public.candidates c
   WHERE c.organization_id = v_tok.organization_id
     AND c.project_id = p_project_id
     AND public.candidate_identity_key(
           c.email, c.linkedin_url, c.full_name, c.current_company)
         = v_tok.identity_key;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'you are not in that search' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_cand.pipeline_stage = 'withdrawn' THEN
    RAISE EXCEPTION 'you have already withdrawn from this search'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_cand.pipeline_stage = 'hired' THEN
    RAISE EXCEPTION 'this search already concluded with your hire — talk to the search team'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.candidates c
     SET pipeline_stage = 'withdrawn', updated_at = now()
   WHERE c.id = v_cand.id;

  -- 098: the withdrawal suppresses the PERSON until a founder-level
  -- act says otherwise. An already-set dnc keeps its original reason.
  PERFORM set_config('mandate.allow_dnc_write', 'on', true);
  UPDATE public.network_profiles np
     SET dnc = true,
         dnc_reason = 'candidate withdrew via their portal',
         dnc_set_at = now(),
         dnc_set_by = NULL,
         relationship_state = 'do_not_contact',
         updated_at = now()
   WHERE np.organization_id = v_tok.organization_id
     AND np.identity_key = v_tok.identity_key
     AND NOT np.dnc;
  IF FOUND THEN
    PERFORM public.write_activity_event(
      p_organization_id => v_tok.organization_id,
      p_event_type      => 'network_dnc_set',
      p_visibility      => 'org',
      p_detail          => jsonb_build_object(
                             'person', v_tok.recipient_label,
                             'reason', 'candidate withdrew via their portal',
                             'source', 'withdrawal'));
  END IF;

  PERFORM public.write_activity_event(
    p_organization_id => v_tok.organization_id,
    p_event_type      => 'candidate_withdrew',
    p_visibility      => 'org',
    p_project_id      => p_project_id,
    p_candidate_id    => v_cand.id,
    p_detail          => jsonb_build_object(
                           'person', v_tok.recipient_label,
                           'from_stage', coalesce(v_cand.pipeline_stage, 'found')));
END;
$function$;

CREATE OR REPLACE FUNCTION public.candidate_portal_request_erasure(p_token uuid, p_note text DEFAULT NULL::text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tok public.candidate_portal_tokens%ROWTYPE;
BEGIN
  v_tok := public.candidate_portal_token_row(p_token);

  BEGIN
    INSERT INTO public.candidate_erasure_requests
      (organization_id, identity_key, requested_via_token, requester_label, note)
    VALUES (v_tok.organization_id, v_tok.identity_key, v_tok.id,
            v_tok.recipient_label, nullif(btrim(coalesce(p_note, '')), ''));
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'your erasure request is already with the team'
      USING ERRCODE = 'check_violation';
  END;

  -- 098: an open erasure request suppresses the person immediately —
  -- the workflow sets DNC, not a checkbox (spec §7.1).
  PERFORM set_config('mandate.allow_dnc_write', 'on', true);
  UPDATE public.network_profiles np
     SET dnc = true,
         dnc_reason = 'erasure requested via their portal',
         dnc_set_at = now(),
         dnc_set_by = NULL,
         relationship_state = 'do_not_contact',
         updated_at = now()
   WHERE np.organization_id = v_tok.organization_id
     AND np.identity_key = v_tok.identity_key
     AND NOT np.dnc;
  IF FOUND THEN
    PERFORM public.write_activity_event(
      p_organization_id => v_tok.organization_id,
      p_event_type      => 'network_dnc_set',
      p_visibility      => 'org',
      p_detail          => jsonb_build_object(
                             'person', v_tok.recipient_label,
                             'reason', 'erasure requested via their portal',
                             'source', 'erasure'));
  END IF;

  PERFORM public.write_activity_event(
    p_organization_id => v_tok.organization_id,
    p_event_type      => 'candidate_erasure_requested',
    p_visibility      => 'org',
    p_detail          => jsonb_build_object('person', v_tok.recipient_label));
END;
$function$;

-- ---------------------------------------------------------------------------
-- 6. Vocabulary: relationship_updated (agent) + network_dnc_set /
--    network_dnc_cleared (human). CHECK rebuilt from the LIVE list,
--    65 → 68; the agent allowlist grows to TWENTY-SEVEN.
-- ---------------------------------------------------------------------------

ALTER TABLE public.activity_events
  DROP CONSTRAINT IF EXISTS activity_events_type_known;
ALTER TABLE public.activity_events
  ADD CONSTRAINT activity_events_type_known CHECK (event_type IN (
    'placement_recorded', 'placement_status_changed',
    'placement_signoff_changed', 'placement_deleted',
    'fee_recorded', 'fee_updated', 'fee_line_earned',
    'fee_line_cancelled', 'fee_reversed', 'fee_terms_created',
    'fee_terms_updated', 'fee_terms_deleted',
    'client_contact_added', 'client_contact_updated',
    'client_contact_removed',
    'member_role_changed', 'member_status_changed',
    'member_founder_changed', 'member_org_changed',
    'shortlist_published', 'report_exported', 'hm_portal_opened',
    'mandate_reassigned',
    'external_invited', 'external_invitation_revoked',
    'external_invitation_resent', 'external_joined',
    'external_role_changed', 'external_status_changed',
    'mandate_shared', 'mandate_unshared',
    'external_access_granted', 'external_access_revoked',
    'candidate_portal_link_issued', 'candidate_portal_link_revoked',
    'candidate_self_updated', 'candidate_withdrew',
    'candidate_erasure_requested', 'candidate_cv_submitted',
    'feedback_interpreted', 'candidates_ranked', 'candidate_parsed',
    'candidate_evaluated', 'candidate_positioned',
    'candidate_researched', 'candidate_triangulated',
    'candidate_profiled', 'desk_digest_generated',
    'company_researched', 'hm_researched', 'culture_profiled',
    'sourcing_queries_generated', 'intake_analyzed',
    'health_suggested', 'weekly_report_generated',
    'calibration_derived', 'job_spec_generated',
    'shortlist_report_generated', 'copilot_answered',
    'success_profile_generated', 'interview_plan_generated',
    'executive_context_researched',
    'candidate_search_answered', 'sourcing_search_executed',
    'outreach_strategy_drafted',
    -- 098: the Candidate Relationship Agent's one act, and the two
    -- HUMAN acts of the DNC machinery.
    'relationship_updated', 'network_dnc_set', 'network_dnc_cleared'
  ));

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
  IF p_event_type NOT IN ('feedback_interpreted', 'candidates_ranked',
                          'candidate_parsed', 'candidate_evaluated',
                          'candidate_positioned', 'candidate_researched',
                          'candidate_triangulated', 'candidate_profiled',
                          'desk_digest_generated', 'company_researched',
                          'hm_researched', 'culture_profiled',
                          'sourcing_queries_generated', 'intake_analyzed',
                          'health_suggested', 'weekly_report_generated',
                          'calibration_derived', 'job_spec_generated',
                          'shortlist_report_generated', 'copilot_answered',
                          'success_profile_generated', 'interview_plan_generated',
                          'executive_context_researched',
                          'candidate_search_answered', 'sourcing_search_executed',
                          'outreach_strategy_drafted',
                          'relationship_updated') THEN
    RAISE EXCEPTION 'record_agent_event: % is not an agent-recordable event', p_event_type;
  END IF;

  -- is_agent() is coalesced at the source — read negated here, the
  -- invariant-11 shape.
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
