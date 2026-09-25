-- 143 — MERGING TWO PEOPLE IN THE NETWORK
--
-- Gate: docs/superpowers/specs/2026-09-25-network-profile-merge-gate.md
-- (CONFIRMED, four rulings). §202 named this as the deferred half.
--
-- ## Why an alias table and not just a repoint
--
-- `resolve_network_profile` computes the identity key FROM EACH CANDIDATE
-- ROW and find-or-creates. It knows nothing about merges. So the obvious
-- merge — repoint the candidates, delete the loser — lasts until somebody
-- edits a name. Proven live in an aborting transaction:
--
--   two profiles for one human:                  true
--   immediately after merge, old-key profiles:   0      <- looks merged
--     ... then ONE ordinary edit to a candidate ...
--   candidate STILL on survivor:                 false  <- it left
--   old-key profile RECREATED:                   1
--   survivor state the candidate now inherits:   cold   <- not 'warm'
--
-- The "ordinary edit" was RE-TYPING THE SAME NAME: the 098/139 trigger
-- fires on `UPDATE OF full_name/email/linkedin_url/current_company`,
-- recomputes the key, finds nothing, and mints the old person again —
-- dropping the candidate onto a blank profile. It fails SILENTLY and in
-- the direction of forgetting: relationship state, follow-ups and, if the
-- survivor had one, DO-NOT-CONTACT stop applying to that candidate.
--
-- So the merge records the loser's key as an ALIAS of the survivor, and
-- the resolver consults aliases first. Three consequences, the third
-- being why this beats writing an email onto the candidate rows:
--   1. the merge survives any edit;
--   2. a FUTURE CV under the old key joins the right person instead of
--      splitting them a third time;
--   3. candidate rows are untouched — a CV with no email keeps saying so.
--      The alias records what the RECRUITER asserted, beside the
--      documents rather than on top of them.
--
-- ## Do-not-contact (D2)
--
-- `guard_network_dnc()` refuses any direct write to the dnc family unless
-- `mandate.allow_dnc_write` is set for the transaction — the mechanism
-- `set_network_dnc` itself uses. The merge takes THAT path rather than
-- being excused from the guard (§200's lesson: a guard with an unnamed
-- column is a way round itself).
--
-- Suppression is CONTAGIOUS and a merge can never lower it. The carried
-- quadruple is the ORIGINAL reason/when/who — not `now()` and not the
-- merging user — because the record of when a person asked not to be
-- contacted is the point of the record. Where both are suppressed, the
-- EARLIER suppression wins.
--
-- Merging is also refused to agents, for the reason `set_network_dnc`
-- refuses them: deciding that two humans are one human is a human act.

-- ---------------------------------------------------------------------------
-- 1. The trail's vocabulary: 102 -> 103
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
    'candidates_merged', 'network_profiles_merged'
  ));

-- ---------------------------------------------------------------------------
-- 2. The alias — an identity key that belongs to a person it does not key
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.network_profile_aliases (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  -- The key a candidate row still computes, which must resolve to
  -- `profile_id` rather than mint a person of its own.
  identity_key    text NOT NULL,
  profile_id      uuid NOT NULL REFERENCES public.network_profiles(id) ON DELETE CASCADE,
  merged_by       uuid REFERENCES public.users(id) ON DELETE SET NULL,
  merged_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, identity_key)
);

COMMENT ON TABLE public.network_profile_aliases IS
  'Identity keys that resolve to a person they do not literally key, because a recruiter merged two profiles. Consulted by resolve_network_profile BEFORE find-or-create, which is what makes a merge survive an ordinary edit AND lets a future CV under the old key rejoin the right person. ON DELETE CASCADE on profile_id: if the person is deleted the alias is meaningless.';

CREATE INDEX IF NOT EXISTS network_profile_aliases_profile_idx
  ON public.network_profile_aliases (profile_id);

ALTER TABLE public.network_profile_aliases ENABLE ROW LEVEL SECURITY;

-- Same shape as network_profiles' own policy: the org reads and writes its
-- own rows. Writing happens only inside the definer merge in practice.
DROP POLICY IF EXISTS org_network_aliases_only ON public.network_profile_aliases;
CREATE POLICY org_network_aliases_only ON public.network_profile_aliases
  FOR ALL TO authenticated
  USING (organization_id = (SELECT public.current_user_org_id()))
  WITH CHECK (organization_id = (SELECT public.current_user_org_id()));

-- ---------------------------------------------------------------------------
-- 3. The resolver learns about aliases
-- ---------------------------------------------------------------------------
--
-- THE RISKIEST EDIT IN THIS SLICE: this function runs under every
-- candidate insert and every identity update, via the 098/139 trigger.
-- So the change is strictly ADDITIVE and ordered alias-first — a key with
-- no alias takes exactly the path it took before, in the same order, with
-- the same ON CONFLICT.

CREATE OR REPLACE FUNCTION public.resolve_network_profile(
  p_org uuid, p_full_name text, p_email text,
  p_linkedin_url text, p_current_company text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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

  -- 143: this key may have been merged into somebody. An alias is the
  -- recruiter's standing answer and outranks find-or-create.
  SELECT a.profile_id INTO v_id
    FROM public.network_profile_aliases a
   WHERE a.organization_id = p_org AND a.identity_key = v_key;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

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

-- ---------------------------------------------------------------------------
-- 4. Relationship temperature, as a rank
-- ---------------------------------------------------------------------------
--
-- D3: a relationship that reached 'warm' is a thing that happened, and
-- taking the survivor's 'cold' because it was the row clicked would
-- discard it. `client_contact` is a ROLE rather than a temperature and is
-- handled by the merge, not ranked here; `do_not_contact` is implied by
-- the dnc flag and likewise decided above this function.

CREATE OR REPLACE FUNCTION public.relationship_warmth(p_state text)
RETURNS integer
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE p_state
    WHEN 'cold'      THEN 0
    WHEN 'contacted' THEN 1
    WHEN 'engaged'   THEN 2
    WHEN 'warm'      THEN 3
    WHEN 'placed'    THEN 4
    ELSE -1
  END
$$;

-- ---------------------------------------------------------------------------
-- 5. The merge
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.merge_network_profiles(
  p_keep    uuid,
  p_discard uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org        uuid := (SELECT public.current_user_org_id());
  v_keep       public.network_profiles%ROWTYPE;
  v_discard    public.network_profiles%ROWTYPE;
  v_moved      integer := 0;
  v_aliases    integer := 0;
  v_state      text;
  v_dnc_src    public.network_profiles%ROWTYPE;
  v_carried    boolean := false;
  v_filled     text[] := ARRAY[]::text[];
  v_follow_at  date;
  v_follow_note text;
  v_last       timestamptz;
BEGIN
  IF (SELECT public.is_agent()) THEN
    RAISE EXCEPTION 'merging two people is a human act — an agent can never do it'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF coalesce((SELECT public.can_write_candidates()), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'merging people is a candidate-writer act'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_keep IS NULL OR p_discard IS NULL THEN
    RAISE EXCEPTION 'two people are required';
  END IF;
  IF p_keep = p_discard THEN
    RAISE EXCEPTION 'a person cannot be merged into themselves';
  END IF;

  SELECT * INTO v_keep FROM public.network_profiles
   WHERE id = p_keep AND organization_id = v_org;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'the person to keep was not found';
  END IF;
  SELECT * INTO v_discard FROM public.network_profiles
   WHERE id = p_discard AND organization_id = v_org;
  IF NOT FOUND THEN
    -- Also the cross-org refusal: a profile in another organisation is
    -- simply not found here, and §073's D11 says it is a different
    -- relationship rather than the same person.
    RAISE EXCEPTION 'the person to merge in was not found in your organisation';
  END IF;

  -- The candidate rows. This UPDATE does NOT re-fire the 098/139 trigger:
  -- that fires on UPDATE OF full_name/email/linkedin_url/current_company,
  -- and this touches none of them.
  UPDATE public.candidates SET network_profile_id = p_keep
   WHERE network_profile_id = p_discard AND organization_id = v_org;
  GET DIAGNOSTICS v_moved = ROW_COUNT;

  -- ------------------------------------------------------------------
  -- D2 — suppression is contagious, and a merge can never lower it.
  -- ------------------------------------------------------------------
  IF v_discard.dnc AND NOT v_keep.dnc THEN
    v_dnc_src := v_discard;
    v_carried := true;
  ELSIF v_keep.dnc AND v_discard.dnc THEN
    -- Both. The EARLIER suppression is the first time they said it.
    IF v_discard.dnc_set_at IS NOT NULL
       AND (v_keep.dnc_set_at IS NULL OR v_discard.dnc_set_at < v_keep.dnc_set_at) THEN
      v_dnc_src := v_discard;
      v_carried := true;
    END IF;
  END IF;

  -- D3 — the warmer state, with the two non-temperatures decided first.
  IF v_keep.dnc OR v_discard.dnc THEN
    v_state := 'do_not_contact';
  ELSIF v_keep.relationship_state = 'client_contact'
        OR v_discard.relationship_state = 'client_contact' THEN
    v_state := 'client_contact';
  ELSIF public.relationship_warmth(v_discard.relationship_state)
        > public.relationship_warmth(v_keep.relationship_state) THEN
    v_state := v_discard.relationship_state;
  ELSE
    v_state := v_keep.relationship_state;
  END IF;

  -- The later real contact, and the earliest outstanding follow-up: a
  -- follow-up that is dropped is one nobody does.
  v_last := GREATEST(
    coalesce(v_keep.last_meaningful_contact_at, '-infinity'::timestamptz),
    coalesce(v_discard.last_meaningful_contact_at, '-infinity'::timestamptz));
  IF v_last = '-infinity'::timestamptz THEN v_last := NULL; END IF;

  IF v_keep.follow_up_at IS NULL
     OR (v_discard.follow_up_at IS NOT NULL AND v_discard.follow_up_at < v_keep.follow_up_at) THEN
    v_follow_at   := coalesce(v_discard.follow_up_at, v_keep.follow_up_at);
    v_follow_note := CASE WHEN v_discard.follow_up_at IS NOT NULL
                            AND (v_keep.follow_up_at IS NULL
                                 OR v_discard.follow_up_at < v_keep.follow_up_at)
                          THEN v_discard.follow_up_note
                          ELSE v_keep.follow_up_note END;
  ELSE
    v_follow_at   := v_keep.follow_up_at;
    v_follow_note := v_keep.follow_up_note;
  END IF;

  -- Blanks only, never an overwrite (§202's D4, same rule one level up).
  IF nullif(btrim(coalesce(v_keep.primary_email, '')), '') IS NULL
     AND nullif(btrim(coalesce(v_discard.primary_email, '')), '') IS NOT NULL THEN
    v_filled := array_append(v_filled, 'primary_email');
  END IF;
  IF nullif(btrim(coalesce(v_keep.linkedin_url, '')), '') IS NULL
     AND nullif(btrim(coalesce(v_discard.linkedin_url, '')), '') IS NOT NULL THEN
    v_filled := array_append(v_filled, 'linkedin_url');
  END IF;

  -- The guard's own door, the way set_network_dnc opens it. Set
  -- unconditionally: the state may be entering 'do_not_contact' even when
  -- the dnc quadruple itself is unchanged, and the guard refuses that too.
  PERFORM set_config('mandate.allow_dnc_write', 'on', true);

  UPDATE public.network_profiles p
     SET relationship_state = v_state,
         dnc         = CASE WHEN v_carried THEN true ELSE p.dnc END,
         dnc_reason  = CASE WHEN v_carried THEN v_dnc_src.dnc_reason ELSE p.dnc_reason END,
         dnc_set_at  = CASE WHEN v_carried THEN v_dnc_src.dnc_set_at ELSE p.dnc_set_at END,
         dnc_set_by  = CASE WHEN v_carried THEN v_dnc_src.dnc_set_by ELSE p.dnc_set_by END,
         last_meaningful_contact_at = v_last,
         follow_up_at   = v_follow_at,
         follow_up_note = v_follow_note,
         primary_email = CASE WHEN 'primary_email' = ANY(v_filled)
                              THEN v_discard.primary_email ELSE p.primary_email END,
         linkedin_url  = CASE WHEN 'linkedin_url' = ANY(v_filled)
                              THEN v_discard.linkedin_url ELSE p.linkedin_url END,
         updated_at = now()
   WHERE p.id = p_keep;

  -- ------------------------------------------------------------------
  -- The alias, which is what makes this durable. Any alias already
  -- pointing at the discarded person must follow it, or a merge of a
  -- merge would strand the first one's keys.
  -- ------------------------------------------------------------------
  UPDATE public.network_profile_aliases
     SET profile_id = p_keep
   WHERE profile_id = p_discard AND organization_id = v_org;
  GET DIAGNOSTICS v_aliases = ROW_COUNT;

  INSERT INTO public.network_profile_aliases
    (organization_id, identity_key, profile_id, merged_by)
  VALUES (v_org, v_discard.identity_key, p_keep, (SELECT auth.uid()))
  ON CONFLICT (organization_id, identity_key)
    DO UPDATE SET profile_id = p_keep,
                  merged_by  = (SELECT auth.uid()),
                  merged_at  = now();

  PERFORM public.write_activity_event(
    p_organization_id => v_org,
    p_event_type      => 'network_profiles_merged',
    p_visibility      => 'org',
    p_detail          => jsonb_build_object(
      'kept',            v_keep.display_name,
      'merged_in',       v_discard.display_name,
      'alias_key',       v_discard.identity_key,
      'candidates',      v_moved,
      'aliases_moved',   v_aliases,
      'state',           v_state,
      'dnc_carried',     v_carried,
      'filled',          to_jsonb(v_filled),
      -- D3: the other side's disposition is kept HERE rather than
      -- deep-merged into a shape neither profile agreed on.
      'other_disposition', v_discard.disposition));

  DELETE FROM public.network_profiles WHERE id = p_discard;

  RETURN jsonb_build_object(
    'kept_id',       p_keep,
    'kept',          v_keep.display_name,
    'merged_in',     v_discard.display_name,
    'candidates',    v_moved,
    'aliases_moved', v_aliases,
    'state',         v_state,
    'dnc_carried',   v_carried,
    'filled',        to_jsonb(v_filled));
END;
$$;

REVOKE ALL ON FUNCTION public.merge_network_profiles(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.merge_network_profiles(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.merge_network_profiles(uuid, uuid) IS
  'Merge two network profiles of one person within one organisation, in a single transaction. Gate 2026-09-25: the loser''s identity key becomes an ALIAS of the survivor so the merge survives an ordinary edit and a future CV under the old key rejoins (D1); suppression is contagious and never lowered, carrying the ORIGINAL reason/when/who, through guard_network_dnc''s own door (D2); the warmer state and the most recent contact survive, earliest follow-up kept (D3); org-scoped, agents refused (D4).';
