-- §207 SLICE TWO, SECOND PASS — A MERGE WIDENS WHAT THE REQUEST COVERS
--
-- Found while planning drive 140, before the drive ran: a hole in the union
-- 152 built, on the one path that combines both halves of this gate.
--
--   1. an erasure is filed against person P (covered: P's rows, say [R1])
--   2. a recruiter merges P2 into P — R2 joins P, and the PERSON arm now
--      answers for R2, so the gate holds
--   3. a recruiter then edits R2's email
--
-- Slice one repoints R2 to a NEWLY MINTED person and carries do-not-contact
-- across (151). But the erasure arms all miss: the person arm sees a
-- different person, the alias arm has no alias for the new key, the key arm
-- computes something the request never held, and the frozen snapshot was
-- taken before R2 was ever this person. The SEND ladder still refuses —
-- do-not-contact travelled — but the §200 COPY door asks only the erasure
-- question, so it would have admitted the copy.
--
-- The fix is the smallest one that serves D2's own sentence ("an open
-- request binds the SURVIVOR"): when a merge brings records into a person,
-- any OPEN request about that person learns those records. The FK repoint
-- (152) covers who; this covers what.
--
-- DEVIATION, recorded: 152's column comment said the snapshot is "never
-- recomputed". It still is never recomputed — it is only ever ADDED to, and
-- only by a human merge asserting that those records are this person. The
-- comment is corrected below rather than left to mislead. Closed requests
-- are not widened: their array is a receipt of what was erased, and a
-- merge afterwards is not part of that fact.

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

COMMENT ON COLUMN public.candidate_erasure_requests.covered_candidate_ids IS
  '§207 D1 — the candidate rows this ask covers. Written when the request is filed, and ADDED TO (never recomputed, never narrowed) by a human merge that brings more of this person''s records together — 153. It is the arm that still answers after an identity edit has moved a row to a different person AND changed the key it computes. Closed requests are never widened: their array is a receipt of what was erased.';
