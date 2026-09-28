-- §207 SLICE TWO — WHAT AN ERASURE IS ATTACHED TO
--
-- Gate: docs/superpowers/specs/2026-09-28-erasure-key-retroactivity-gate.md
-- (CONFIRMED: five rulings, all recommendations taken, D5 split into two
-- decline outcomes, built DNC-first). Slice one (151) made an identity edit
-- harmless to do-not-contact. This is the erasure rule itself: D1's union,
-- D2's merge carry, D4's second door, D5's split decline.
--
-- ## What was wrong
--
-- The gate is one door — the send ladder's `erasureOpen` — and it asked its
-- question of a STRING:
--
--     .eq("identity_key", identityKey(candidate))   -- computed from the row, NOW
--
-- while the request holds the key the PORTAL TOKEN froze when the link was
-- issued. The two ends disagree by construction, and three ordinary things
-- make them disagree in practice: a merge (§204 D4 — the person's other
-- record keys differently, which is why they were two people), an identity
-- edit (the row's key moves from name: to email:), and a record that arrives
-- later.
--
-- ## D1 — the union, not a choice
--
-- A request now carries all three of what it is about, because each arm
-- catches exactly what the others cannot:
--
--   identity_key           records that arrive LATER under the same key
--   network_profile_id     the merged sibling record, and future records
--                          resolved to that person (§203's alias too)
--   covered_candidate_ids  rows whose key AND person have both drifted since
--
-- The third is a FROZEN SNAPSHOT, §158's receipt shape: it records what the
-- ask covered at the moment it was made, and it is never recomputed. It is
-- also the only thing that can carry an erasure across slice one's repoint,
-- because a request row names ONE person and moving it would strip it from
-- the original person's other records.
--
-- The profile FK is ON DELETE SET NULL, deliberately: when the erasure is
-- finally carried out the person is deleted, and the request must remain as
-- proof that it happened.
--
-- ## Not in this migration
--
-- No new event type (the CHECK is untouched), no new app-recordable intent
-- (the door count is untouched), no new grant, no new anon-executable
-- function. `candidate_erasure_open` is SECURITY INVOKER on purpose: both
-- callers are the reader's own session and RLS already scopes every table it
-- touches, so there is nothing here that needs the definer's privileges.

-- ---------------------------------------------------------------------------
-- 1. The request learns who and what it is about
-- ---------------------------------------------------------------------------

ALTER TABLE public.candidate_erasure_requests
  ADD COLUMN IF NOT EXISTS network_profile_id uuid
    REFERENCES public.network_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS covered_candidate_ids uuid[] NOT NULL DEFAULT '{}',
  -- D5, split: a decline is not one answer. "We cannot erase this" leaves
  -- the person suppressed; "this was not the subject" must not leave a
  -- candidate who never asked for anything quietly uncontactable.
  ADD COLUMN IF NOT EXISTS decline_kind text;

ALTER TABLE public.candidate_erasure_requests
  DROP CONSTRAINT IF EXISTS decline_kind_known;
ALTER TABLE public.candidate_erasure_requests
  ADD CONSTRAINT decline_kind_known CHECK (
    decline_kind IS NULL OR decline_kind IN ('cannot_erase', 'not_subject')
  );

ALTER TABLE public.candidate_erasure_requests
  DROP CONSTRAINT IF EXISTS decline_says_which;
ALTER TABLE public.candidate_erasure_requests
  ADD CONSTRAINT decline_says_which CHECK (
    (status = 'declined') = (decline_kind IS NOT NULL)
  );

COMMENT ON COLUMN public.candidate_erasure_requests.network_profile_id IS
  '§207 D1 — the PERSON this request is about, resolved when it was filed (their profile, else the person an alias says the key belongs to). Repointed by merge_network_profiles so it follows a merge (D2); ON DELETE SET NULL so the request outlives the person it erased.';
COMMENT ON COLUMN public.candidate_erasure_requests.covered_candidate_ids IS
  '§207 D1 — the candidate rows this ask covered AT THE MOMENT IT WAS MADE. Frozen, never recomputed: it is the only arm that still answers after an identity edit has moved a row to a different person AND changed the key it computes (§207 slice 1 keeps do-not-contact across that move; this keeps the erasure).';
COMMENT ON COLUMN public.candidate_erasure_requests.decline_kind IS
  '§207 D5 — which decline this was. cannot_erase: the data is retained under the retention verdict and the person stays suppressed. not_subject: the filer was not the person (a forwarded portal link), so the suppression the request itself set is lifted with it.';

-- The FK wants its index (the pre-launch sweep's standing rule).
CREATE INDEX IF NOT EXISTS candidate_erasure_requests_profile_idx
  ON public.candidate_erasure_requests (network_profile_id);

-- One open request per PERSON, falling back to the key when there is no
-- person yet. Two records of one human key differently by construction, so
-- on the key alone a merged person could file twice and the queue would
-- show one ask as two.
DROP INDEX IF EXISTS public.candidate_erasure_requests_open_idx;
CREATE UNIQUE INDEX candidate_erasure_requests_open_idx
  ON public.candidate_erasure_requests
     (organization_id, coalesce(network_profile_id::text, identity_key))
  WHERE status = 'open';

-- ---------------------------------------------------------------------------
-- 2. The question both doors ask
-- ---------------------------------------------------------------------------
--
-- One place, because there are now two callers (the send ladder and the
-- §200 copy) and four arms. A door that asked three of them would be a
-- refusal that works until the day it matters.

CREATE OR REPLACE FUNCTION public.candidate_erasure_open(p_candidate_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.candidates c
      JOIN public.candidate_erasure_requests r
        ON r.organization_id = c.organization_id
     WHERE c.id = p_candidate_id
       AND r.resolved_at IS NULL
       AND (
         -- the person, as they are now
         (r.network_profile_id IS NOT NULL
          AND c.network_profile_id IS NOT NULL
          AND r.network_profile_id = c.network_profile_id)
         -- the person, as they were called before a merge (§203's alias)
         OR (c.network_profile_id IS NOT NULL
             AND EXISTS (
               SELECT 1 FROM public.network_profile_aliases a
                WHERE a.organization_id = r.organization_id
                  AND a.profile_id = c.network_profile_id
                  AND a.identity_key = r.identity_key))
         -- the key this row computes today
         OR r.identity_key = public.candidate_identity_key(
              c.email, c.linkedin_url, c.full_name, c.current_company)
         -- the rows the ask covered when it was made
         OR c.id = ANY (r.covered_candidate_ids)
       )
  );
$$;

COMMENT ON FUNCTION public.candidate_erasure_open(uuid) IS
  '§207 D1 — does an unresolved erasure request stand against this candidate row? Four arms, ORed: the person, the person under a pre-merge alias, the key the row computes now, and the rows the request froze when it was filed. SECURITY INVOKER: RLS scopes every table, and both callers are the reader''s own session.';

REVOKE ALL ON FUNCTION public.candidate_erasure_open(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.candidate_erasure_open(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Filing an erasure records who and what
-- ---------------------------------------------------------------------------
--
-- Two changes, both about the same weakness: the token's key is frozen at
-- issue and the world moves. The request now stores the PERSON and the ROWS
-- as well as the key — and 098's immediate suppression aims at the person
-- when we have one, instead of matching a profile whose key may already
-- have drifted (in which case it silently suppressed nobody).

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

  -- 098: an open erasure request suppresses the person immediately —
  -- the workflow sets DNC, not a checkbox (spec §7.1). §207: aimed at the
  -- person we just resolved, so a profile whose key has drifted since the
  -- link was issued is still the one suppressed.
  PERFORM set_config('mandate.allow_dnc_write', 'on', true);
  UPDATE public.network_profiles np
     SET dnc = true,
         dnc_reason = 'erasure requested via their portal',
         dnc_set_at = now(),
         dnc_set_by = NULL,
         relationship_state = 'do_not_contact',
         updated_at = now()
   WHERE np.organization_id = v_tok.organization_id
     AND (np.id = v_profile
          OR (v_profile IS NULL AND np.identity_key = v_tok.identity_key))
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
-- 4. A merge carries the request (D2)
-- ---------------------------------------------------------------------------
--
-- §203 D2's sentence again: suppression is contagious and a merge can never
-- lower it. Everything else in this function is 143's, unchanged.

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
  -- §207 D2 -- an erasure request binds the SURVIVOR. The person the
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

COMMENT ON FUNCTION public.merge_network_profiles(uuid, uuid) IS
  'Merge two network profiles of one person within one organisation, in a single transaction. Gate 2026-09-25: the loser''s identity key becomes an ALIAS of the survivor so the merge survives an ordinary edit and a future CV under the old key rejoins; suppression is contagious and never lowered, carrying the ORIGINAL reason/when/who, through guard_network_dnc''s own door; the warmer state and the most recent contact survive, earliest follow-up kept; org-scoped, agents refused. S207 D2: every erasure request about the discarded person follows the survivor, so an open one keeps binding the person it was filed about and a closed one still points at somebody.';
