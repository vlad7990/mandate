-- §208 PART TWO — EVERY WRITER RECORDS A ROW
--
-- Gate: docs/superpowers/specs/2026-09-28-how-far-a-lift-travels-gate.md.
-- 154 built the ledger and made `network_profiles.dnc` derived. This is the
-- other half: the four acts that suppress a person, and the two that carry a
-- suppression, all stop writing the derived columns and record a ROW.
--
-- The rule they all now obey: nothing is overwritten. Two reasons are two
-- rows, the earliest governs what the badge says, and lifting one leaves the
-- other standing.
--
-- D5 also lands here: the portal's WITHDRAWAL path aimed its suppression at
-- whatever profile still literally keyed the way the token did, so a link
-- issued before an email was corrected suppressed NOBODY, silently. §207
-- fixed that in this function's sibling (erasure) and left this one. It now
-- resolves the person the same way — profile, else alias, else the
-- candidate row's own person.


-- ---------------------------------------------------------------------------
-- 1. The recruiter's own act
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

  SELECT display_name INTO v_name FROM public.network_profiles
   WHERE id = p_profile_id AND organization_id = v_org;
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'set_network_dnc: no profile in your organisation matches'
      USING ERRCODE = 'no_data_found';
  END IF;

  -- §208: a row, not an overwrite. Somebody who says no twice has said no
  -- twice, and lifting one reason must not lift the other.
  PERFORM public.record_network_suppression(
    p_profile_id, p_reason, 'recruiter', (SELECT auth.uid()));

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

-- ---------------------------------------------------------------------------
-- 2. The carry (§207 slice one, now a row per reason)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.carry_network_suppression(p_from uuid, p_to uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_from public.network_profiles%ROWTYPE;
  v_to   public.network_profiles%ROWTYPE;
  v_row  record;
  v_any  boolean := false;
BEGIN
  IF p_from IS NULL OR p_to IS NULL OR p_from = p_to THEN
    RETURN false;
  END IF;

  SELECT * INTO v_from FROM public.network_profiles WHERE id = p_from;
  IF NOT FOUND OR NOT v_from.dnc THEN
    RETURN false;                         -- nothing to carry
  END IF;
  SELECT * INTO v_to FROM public.network_profiles WHERE id = p_to;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  IF v_to.organization_id IS DISTINCT FROM v_from.organization_id THEN
    RETURN false;                         -- never across organisations
  END IF;

  -- §208: EVERY standing reason travels, each as its own row pointing at the
  -- one it came from, so a lift can follow exactly as far. Nothing is
  -- overwritten and nothing is compared: the earliest still governs, because
  -- the derivation says so.
  FOR v_row IN
    SELECT s.id, s.reason, s.set_at, s.set_by
      FROM public.network_suppressions s
     WHERE s.profile_id = p_from AND s.lifted_at IS NULL
  LOOP
    IF public.record_network_suppression(
         p_to, v_row.reason, 'carried', v_row.set_by, v_row.set_at, v_row.id
       ) IS NOT NULL THEN
      v_any := true;
    END IF;
  END LOOP;

  IF v_any THEN
    PERFORM public.write_activity_event(
      p_organization_id => v_to.organization_id,
      p_event_type      => 'network_dnc_set',
      p_visibility      => 'org',
      p_detail          => jsonb_build_object(
                             'person',       v_to.display_name,
                             'reason',       v_from.dnc_reason,
                             'source',       'identity_edit',
                             'carried_from', v_from.display_name));
  END IF;

  RETURN v_any;
END;
$$;

REVOKE ALL ON FUNCTION public.carry_network_suppression(uuid, uuid)
  FROM public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. The portal's two acts — erasure, and the withdrawal D5 names
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.candidate_portal_request_erasure(
  p_token uuid, p_note text DEFAULT NULL::text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tok     public.candidate_portal_tokens%ROWTYPE;
  v_profile uuid;
  v_covered uuid[];
BEGIN
  v_tok := public.candidate_portal_token_row(p_token);

  -- Who is this, as a person? The profile that literally keys this way,
  -- else the person §203's alias says this key now belongs to.
  SELECT np.id INTO v_profile
    FROM public.network_profiles np
   WHERE np.organization_id = v_tok.organization_id
     AND np.identity_key = v_tok.identity_key;
  IF v_profile IS NULL THEN
    SELECT a.profile_id INTO v_profile
      FROM public.network_profile_aliases a
     WHERE a.organization_id = v_tok.organization_id
       AND a.identity_key = v_tok.identity_key;
  END IF;

  -- What did the ask cover? Every row that is this person right now, plus
  -- every row that still computes this key (a CV mid-parse has no person).
  SELECT coalesce(array_agg(c.id), '{}'::uuid[]) INTO v_covered
    FROM public.candidates c
   WHERE c.organization_id = v_tok.organization_id
     AND (
       (v_profile IS NOT NULL AND c.network_profile_id = v_profile)
       OR public.candidate_identity_key(
            c.email, c.linkedin_url, c.full_name, c.current_company)
          = v_tok.identity_key
     );

  BEGIN
    INSERT INTO public.candidate_erasure_requests
      (organization_id, identity_key, network_profile_id, covered_candidate_ids,
       requested_via_token, requester_label, note)
    VALUES (v_tok.organization_id, v_tok.identity_key, v_profile, v_covered,
            v_tok.id, v_tok.recipient_label,
            nullif(btrim(coalesce(p_note, '')), ''));
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'your erasure request is already with the team'
      USING ERRCODE = 'check_violation';
  END;

  -- 098: an open erasure request suppresses the person immediately — the
  -- workflow sets DNC, not a checkbox (spec §7.1). §207: aimed at the person
  -- resolved above. §208: recorded as a LEDGER ROW, so it stands beside any
  -- other reason instead of overwriting one, and a decline can lift exactly
  -- this one.
  IF v_profile IS NOT NULL AND public.record_network_suppression(
       v_profile, 'erasure requested via their portal', 'erasure') IS NOT NULL THEN
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

  -- 098: the withdrawal suppresses the PERSON until a founder-level act
  -- says otherwise. S208/D5: aimed at the person the token RESOLVES to, not
  -- at whatever profile still literally keys that way — a link issued before
  -- an email was corrected used to suppress nobody, silently. And it is a
  -- LEDGER ROW now, so it stands beside any other reason rather than
  -- overwriting one.
  DECLARE
    v_profile uuid;
  BEGIN
    SELECT np.id INTO v_profile FROM public.network_profiles np
     WHERE np.organization_id = v_tok.organization_id
       AND np.identity_key = v_tok.identity_key;
    IF v_profile IS NULL THEN
      SELECT al.profile_id INTO v_profile FROM public.network_profile_aliases al
       WHERE al.organization_id = v_tok.organization_id
         AND al.identity_key = v_tok.identity_key;
    END IF;
    IF v_profile IS NULL THEN
      v_profile := v_cand.network_profile_id;
    END IF;
    IF v_profile IS NOT NULL AND public.record_network_suppression(
         v_profile, 'candidate withdrew via their portal', 'withdrawal') IS NOT NULL THEN
      PERFORM public.write_activity_event(
        p_organization_id => v_tok.organization_id,
        p_event_type      => 'network_dnc_set',
        p_visibility      => 'org',
        p_detail          => jsonb_build_object(
                               'person', v_tok.recipient_label,
                               'reason', 'candidate withdrew via their portal',
                               'source', 'withdrawal'));
    END IF;
  END;

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

-- ---------------------------------------------------------------------------
-- 4. The merge moves the ledger instead of overwriting a quadruple
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
  v_moved_ids  uuid[] := ARRAY[]::uuid[];
  v_aliases    integer := 0;
  v_erasures   integer := 0;
  v_state      text;
  v_moved_sup  uuid[] := ARRAY[]::uuid[];
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

  -- §207 — which records are about to change hands. Read BEFORE the update
  -- so the statement below stays exactly what 143 ruled it to be.
  SELECT coalesce(array_agg(c.id), ARRAY[]::uuid[]) INTO v_moved_ids
    FROM public.candidates c
   WHERE c.network_profile_id = p_discard AND c.organization_id = v_org;

  -- The candidate rows. This UPDATE does NOT re-fire the 098/139 trigger:
  -- that fires on UPDATE OF full_name/email/linkedin_url/current_company,
  -- and this touches none of them.
  UPDATE public.candidates SET network_profile_id = p_keep
   WHERE network_profile_id = p_discard AND organization_id = v_org;
  GET DIAGNOSTICS v_moved = ROW_COUNT;

  -- ------------------------------------------------------------------
  -- D2 — suppression is contagious, and a merge can never lower it.
  -- §208: the discarded person's REASONS move to the survivor rather than
  -- one of them overwriting the other. Both are true of the same human, the
  -- earliest still governs what the badge says, and neither is lost. The
  -- move must happen before the DELETE below, which would cascade them away.
  -- ------------------------------------------------------------------
  SELECT coalesce(array_agg(s.id), ARRAY[]::uuid[]) INTO v_moved_sup
    FROM public.network_suppressions s
   WHERE s.profile_id = p_discard AND s.lifted_at IS NULL;

  UPDATE public.network_suppressions
     SET profile_id = p_keep
   WHERE profile_id = p_discard AND organization_id = v_org;

  -- Carried in the receipt's sense: the survivor's governing reason is now
  -- one that arrived with the person merged in.
  v_carried := coalesce((SELECT public.governing_network_suppression(p_keep)) = ANY(v_moved_sup), false);

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
     -- §208: dnc and its three companions are DERIVED from the ledger and
     -- are not written here. guard_network_dnc still refuses any hand that
     -- tries; refresh_network_suppression is the only writer.
     SET relationship_state = v_state,
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

  -- ------------------------------------------------------------------
  -- §207 D2 — an erasure request binds the SURVIVOR. The person the
  -- subject asked about still exists; only their id changed. Every
  -- request follows, open or closed: an open one so the gate keeps
  -- answering, a closed one so the receipt still points at somebody.
  -- (Without this the FK would go NULL when the discarded profile is
  -- deleted below, and an OPEN request would silently stop binding the
  -- person it was filed about.)
  -- ------------------------------------------------------------------
  UPDATE public.candidate_erasure_requests r
     SET network_profile_id = p_keep
   WHERE r.network_profile_id = p_discard
     AND r.organization_id = v_org;

  -- 153 — and it learns the records that just became this person. Without
  -- this, a merge followed by an identity edit loses the moved record from
  -- every arm of the gate: slice one carries do-not-contact so the SEND
  -- still refuses, but the §200 copy door asks only this question and
  -- would have admitted it.
  UPDATE public.candidate_erasure_requests r
     SET covered_candidate_ids = (
           SELECT coalesce(array_agg(DISTINCT x), ARRAY[]::uuid[])
             FROM unnest(r.covered_candidate_ids || v_moved_ids) AS t(x))
   WHERE r.network_profile_id = p_keep
     AND r.organization_id = v_org
     AND r.status = 'open'
     AND cardinality(v_moved_ids) > 0;

  SELECT count(*) INTO v_erasures
    FROM public.candidate_erasure_requests r
   WHERE r.network_profile_id = p_keep
     AND r.organization_id = v_org
     AND r.status = 'open';

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
      'erasures_open',   v_erasures,
      'filled',          to_jsonb(v_filled),
      -- D3: the other side's disposition is kept HERE rather than
      -- deep-merged into a shape neither profile agreed on.
      'other_disposition', v_discard.disposition));

  -- The ledger moved under the profile UPDATE above, so have the
  -- derivation settle the survivor's columns last.
  PERFORM public.refresh_network_suppression(p_keep);

  DELETE FROM public.network_profiles WHERE id = p_discard;

  RETURN jsonb_build_object(
    'kept_id',       p_keep,
    'kept',          v_keep.display_name,
    'merged_in',     v_discard.display_name,
    'candidates',    v_moved,
    'aliases_moved', v_aliases,
    'state',         v_state,
    'dnc_carried',   v_carried,
    'erasures_open', v_erasures,
    'filled',        to_jsonb(v_filled));
END;
$$;


REVOKE ALL ON FUNCTION public.merge_network_profiles(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.merge_network_profiles(uuid, uuid) TO authenticated;
