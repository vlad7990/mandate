-- The candidate becomes a persona — the token door (B-slice of the
-- final-personas programme; plan in docs/handoffs/NEXT-final-personas.md,
-- D7–D12 confirmed by the founder 2026-08-19).
--
-- D7 as confirmed: no principal class. A candidate is per-project rows
-- deduped by identity at read time, and a person courted by two orgs is
-- two relationships (D11, the standing federation verdict) — so the door
-- is a per-person, per-org token, the HM programme's own first shape.
--
-- ## The anchor, stated explicitly
--
-- A token anchors to (organization_id, identity_key), where identity_key
-- is the SQL transcription of src/lib/candidate-identity.ts — the same
-- precedence (email → linkedin → name|company) that 040's
-- count_network_people and the Network page use to decide two rows are
-- one human. The token therefore covers every candidate row of that
-- person in that org, across projects, present and future. ⚠️ Three
-- transcriptions now exist (candidate-identity.ts, 040, this file's
-- candidate_identity_key). Change one, change all, same commit.
--
-- A consequence the update RPC must respect: the fields the key stands
-- on are not self-service through the token. An email-keyed person may
-- correct their linkedin; a linkedin-keyed person may not (the group
-- would silently detach from the token), and a name-keyed person may
-- not correct their name. Email is never self-service — it is the
-- strongest anchor and the notice address. The refusal names the search
-- team as the door.
--
-- ## D8's truth table is the RPC surface
--
-- Anon holds a token and reads: who the org believes they are (identity
-- and contact columns, source and sourced_at — the §14/W7 transparency
-- data), and which of the org's searches they are in as ROLE TITLE and
-- stage. Deliberately absent, pinned by candidate_portal_invariants:
-- scores, reviews, notes, assessments, fees, other candidates — and the
-- client's name, default-hidden per D8 (no disclosure affordance exists
-- yet; building one waits for a recruiter to ask — a B4 verdict).
--
-- ## D9's acts
--
-- Correct contact fields (all rows of the group, one trail event);
-- withdraw from a search (stage → 'withdrawn' — a new app-vocabulary
-- stage, because a withdrawal recorded as a rejection would be a lie);
-- request erasure (a queue row the owning org and the operator see;
-- execution stays founder-hand per the §14 retention verdict); submit a
-- replacement CV (the file lands and the act is trailed — the org's
-- parsed profile moves only by the recruiter's own deliberate upload,
-- because re-running paid parsing from an anonymous endpoint is an
-- abuse surface, and updating cv_url without re-parsing would desync
-- the profile from the file; the D9 interpretation is surfaced in §28
-- for the founder's eye).

-- ---------------------------------------------------------------------------
-- 1. The identity anchor in SQL
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.candidate_identity_key(
  p_email text, p_linkedin_url text, p_full_name text, p_current_company text
) RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE
    WHEN NULLIF(btrim(p_email), '') IS NOT NULL
      THEN 'email:' || lower(btrim(p_email))
    WHEN NULLIF(btrim(p_linkedin_url), '') IS NOT NULL
      THEN 'linkedin:' || regexp_replace(lower(btrim(p_linkedin_url)), '/$', '')
    ELSE
      'name:' || lower(btrim(p_full_name))
              || '|' || lower(btrim(COALESCE(p_current_company, '')))
  END
$$;

REVOKE ALL ON FUNCTION public.candidate_identity_key(text, text, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.candidate_identity_key(text, text, text, text)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. The tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.candidate_portal_tokens (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  identity_key     text NOT NULL,
  token            uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  -- The person's name at issue time, so the recruiter's list reads.
  recipient_label  text NOT NULL,
  issued_by        uuid REFERENCES public.users(id),
  expires_at       timestamptz NOT NULL,
  revoked_at       timestamptz,
  last_opened_at   timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- One live link per person per org: reissuing returns the same link
-- (the resend lesson, D4 of the account-lifecycle slice) rather than
-- minting a second door nobody remembers to revoke.
CREATE UNIQUE INDEX IF NOT EXISTS candidate_portal_tokens_live_idx
  ON public.candidate_portal_tokens (organization_id, identity_key)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS candidate_portal_tokens_org_idx
  ON public.candidate_portal_tokens (organization_id, created_at DESC);

ALTER TABLE public.candidate_portal_tokens ENABLE ROW LEVEL SECURITY;

-- Staff at the clients:share tier see and revoke their org's tokens —
-- handing a person a window into the building is the "leaves the
-- building" tier, same as HM shares. Issuance is an RPC (the identity
-- key must be computed, not trusted from the caller).
DROP POLICY IF EXISTS candidate_portal_tokens_select ON public.candidate_portal_tokens;
CREATE POLICY candidate_portal_tokens_select ON public.candidate_portal_tokens
  FOR SELECT TO authenticated
  USING (
    organization_id = (SELECT public.current_user_org_id())
    AND (SELECT public.can_share_clients())
  );

DROP POLICY IF EXISTS candidate_portal_tokens_update ON public.candidate_portal_tokens;
CREATE POLICY candidate_portal_tokens_update ON public.candidate_portal_tokens
  FOR UPDATE TO authenticated
  USING (
    organization_id = (SELECT public.current_user_org_id())
    AND (SELECT public.can_share_clients())
  )
  WITH CHECK (
    organization_id = (SELECT public.current_user_org_id())
    AND (SELECT public.can_share_clients())
  );

CREATE TABLE IF NOT EXISTS public.candidate_erasure_requests (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  identity_key        text NOT NULL,
  requested_via_token uuid REFERENCES public.candidate_portal_tokens(id),
  requester_label     text NOT NULL,
  note                text,
  status              text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'resolved', 'declined')),
  resolved_by         uuid REFERENCES public.users(id),
  resolved_at         timestamptz,
  resolution_note     text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT resolution_is_complete CHECK (
    (status = 'open') = (resolved_by IS NULL AND resolved_at IS NULL)
  )
);

-- One open request per person per org — a second click is the same ask.
CREATE UNIQUE INDEX IF NOT EXISTS candidate_erasure_requests_open_idx
  ON public.candidate_erasure_requests (organization_id, identity_key)
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS candidate_erasure_requests_org_idx
  ON public.candidate_erasure_requests (organization_id, created_at DESC);

ALTER TABLE public.candidate_erasure_requests ENABLE ROW LEVEL SECURITY;

-- The owning org's staff see the request where they work; the operator
-- sees every org's (the /ops queue, 072's founder-read shape). Writes:
-- resolution is the operator's hand alone — execution of erasure is the
-- §14 verdict's territory — and the INSERT path is the token RPC only.
DROP POLICY IF EXISTS candidate_erasure_requests_select ON public.candidate_erasure_requests;
CREATE POLICY candidate_erasure_requests_select ON public.candidate_erasure_requests
  FOR SELECT TO authenticated
  USING (
    ((SELECT public.can_read_org())
      AND organization_id = (SELECT public.current_user_org_id()))
    OR ((SELECT public.can_read_org())
      AND (SELECT public.is_current_user_founder()))
  );

DROP POLICY IF EXISTS candidate_erasure_requests_update ON public.candidate_erasure_requests;
CREATE POLICY candidate_erasure_requests_update ON public.candidate_erasure_requests
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.can_read_org())
    AND (SELECT public.is_current_user_founder())
  )
  WITH CHECK (
    (SELECT public.can_read_org())
    AND (SELECT public.is_current_user_founder())
  );

-- ---------------------------------------------------------------------------
-- 3. The vocabulary learns the candidate's acts
-- ---------------------------------------------------------------------------

ALTER TABLE public.activity_events
  DROP CONSTRAINT IF EXISTS activity_events_type_known;

ALTER TABLE public.activity_events
  ADD CONSTRAINT activity_events_type_known CHECK (event_type IN (
    'placement_recorded', 'placement_status_changed',
    'placement_signoff_changed', 'placement_deleted',
    'fee_recorded', 'fee_updated', 'fee_line_earned', 'fee_line_cancelled',
    'fee_reversed', 'fee_terms_created', 'fee_terms_updated',
    'fee_terms_deleted',
    'client_contact_added', 'client_contact_updated', 'client_contact_removed',
    'member_role_changed', 'member_status_changed', 'member_founder_changed',
    'member_org_changed',
    'shortlist_published', 'report_exported', 'hm_portal_opened',
    'mandate_reassigned',
    'external_invited', 'external_invitation_revoked',
    'external_invitation_resent', 'external_joined',
    'external_role_changed', 'external_status_changed',
    'mandate_shared', 'mandate_unshared',
    'external_access_granted', 'external_access_revoked',
    'candidate_portal_link_issued', 'candidate_portal_link_revoked',
    'candidate_self_updated', 'candidate_withdrew',
    'candidate_erasure_requested', 'candidate_cv_submitted'
  ));

-- ---------------------------------------------------------------------------
-- 3b. 'withdrawn' joins the pipeline vocabulary
-- ---------------------------------------------------------------------------

-- The candidates CHECK carries the stage list (found by the invariants
-- file's first clean run — the app-side list in cv-parsing.ts is the
-- mirror, changed in the same commit). A withdrawal recorded as a
-- rejection would be a lie.
ALTER TABLE public.candidates
  DROP CONSTRAINT IF EXISTS candidates_pipeline_stage_check;

ALTER TABLE public.candidates
  ADD CONSTRAINT candidates_pipeline_stage_check
  CHECK (pipeline_stage = ANY (ARRAY[
    'found'::text, 'reviewed'::text, 'matched'::text, 'shortlisted'::text,
    'submitted'::text, 'interviewed'::text, 'passed_rounds'::text,
    'finalist'::text, 'offer'::text, 'hired'::text, 'rejected'::text,
    'withdrawn'::text]));

-- ---------------------------------------------------------------------------
-- 4. Staff-side RPCs: issue and revoke
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.issue_candidate_portal_token(p_candidate_id uuid)
RETURNS TABLE (token_id uuid, portal_token uuid, recipient_label text, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := (SELECT auth.uid());
  v_org uuid := (SELECT public.current_user_org_id());
  v_cand record;
  v_key text;
  v_label text;
  v_row public.candidate_portal_tokens%ROWTYPE;
BEGIN
  IF NOT coalesce(public.can_share_clients(), false) THEN
    RAISE EXCEPTION 'issuing a candidate portal link needs the client-sharing tier'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT c.* INTO v_cand FROM public.candidates c
   WHERE c.id = p_candidate_id AND c.organization_id = v_org;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'candidate not found in your organisation'
      USING ERRCODE = 'no_data_found';
  END IF;

  v_key := public.candidate_identity_key(
    v_cand.email, v_cand.linkedin_url, v_cand.full_name, v_cand.current_company);
  v_label := coalesce(nullif(btrim(v_cand.full_name), ''), v_cand.email, 'Candidate');

  -- One live link per person: return the standing one if it has time
  -- left, refresh its clock if it expired, mint only when none stands.
  SELECT * INTO v_row FROM public.candidate_portal_tokens t
   WHERE t.organization_id = v_org AND t.identity_key = v_key
     AND t.revoked_at IS NULL;

  IF FOUND THEN
    IF v_row.expires_at <= now() THEN
      UPDATE public.candidate_portal_tokens t
         SET expires_at = now() + interval '30 days'
       WHERE t.id = v_row.id
       RETURNING * INTO v_row;
    END IF;
  ELSE
    INSERT INTO public.candidate_portal_tokens
      (organization_id, identity_key, recipient_label, issued_by, expires_at)
    VALUES (v_org, v_key, v_label, v_caller, now() + interval '30 days')
    RETURNING * INTO v_row;

    PERFORM public.write_activity_event(
      p_organization_id => v_org,
      p_event_type      => 'candidate_portal_link_issued',
      p_visibility      => 'org',
      p_candidate_id    => p_candidate_id,
      p_detail          => jsonb_build_object('person', v_label));
  END IF;

  RETURN QUERY SELECT v_row.id, v_row.token, v_row.recipient_label, v_row.expires_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_candidate_portal_token(p_token_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid := (SELECT public.current_user_org_id());
  v_row public.candidate_portal_tokens%ROWTYPE;
BEGIN
  IF NOT coalesce(public.can_share_clients(), false) THEN
    RAISE EXCEPTION 'revoking a candidate portal link needs the client-sharing tier'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.candidate_portal_tokens t
     SET revoked_at = now()
   WHERE t.id = p_token_id AND t.organization_id = v_org AND t.revoked_at IS NULL
  RETURNING * INTO v_row;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no live link to revoke' USING ERRCODE = 'no_data_found';
  END IF;

  PERFORM public.write_activity_event(
    p_organization_id => v_org,
    p_event_type      => 'candidate_portal_link_revoked',
    p_visibility      => 'org',
    p_detail          => jsonb_build_object('person', v_row.recipient_label));
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. The token door: validation
-- ---------------------------------------------------------------------------

-- Internal. Raises the one honest sentence for every dead-link state —
-- the page shows one dead screen, never which of missing/revoked/expired
-- it was (a revoked link should not advertise that it once worked).
CREATE OR REPLACE FUNCTION public.candidate_portal_token_row(p_token uuid)
RETURNS public.candidate_portal_tokens
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.candidate_portal_tokens%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.candidate_portal_tokens t
   WHERE t.token = p_token
     AND t.revoked_at IS NULL
     AND t.expires_at > now();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'this link is not valid' USING ERRCODE = 'no_data_found';
  END IF;
  RETURN v_row;
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. The candidate's reads (D8)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.candidate_portal_context(p_token uuid)
RETURNS TABLE (
  person_name text, email text, phone text, location text,
  linkedin_url text, github_url text, website_url text, twitter_url text,
  current_title text, current_company text,
  has_cv boolean, source_kind text, source_platform text, sourced_at timestamptz,
  notified_at timestamptz, organization_id uuid, organization_name text,
  expires_at timestamptz, identity_basis text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tok public.candidate_portal_tokens%ROWTYPE;
BEGIN
  v_tok := public.candidate_portal_token_row(p_token);

  UPDATE public.candidate_portal_tokens t SET last_opened_at = now()
   WHERE t.id = v_tok.id;

  -- The newest row of the group speaks for the person; the searches
  -- list below carries the per-mandate detail.
  RETURN QUERY
  SELECT c.full_name, c.email, c.phone, c.location,
         c.linkedin_url, c.github_url, c.website_url, c.twitter_url,
         c.current_title, c.current_company,
         (c.cv_url IS NOT NULL),
         c.source_kind, c.source_platform, c.sourced_at,
         (SELECT max(n.sent_at) FROM public.candidate_notifications n
           WHERE n.organization_id = v_tok.organization_id
             AND n.candidate_id IN (
               SELECT c2.id FROM public.candidates c2
                WHERE c2.organization_id = v_tok.organization_id
                  AND public.candidate_identity_key(
                        c2.email, c2.linkedin_url, c2.full_name, c2.current_company)
                      = v_tok.identity_key)
             AND n.status = 'sent'),
         -- The org id keys the storage path for CV submissions: the
         -- cvs_* policies scope staff reads and deletes to the
         -- {organization_id}/ prefix, and a portal upload outside it
         -- would be unreadable and undeletable by the org's own staff
         -- (found in the B3 drive's teardown). The name is already
         -- shown; the opaque id exposes nothing new.
         v_tok.organization_id,
         (SELECT o.name FROM public.organizations o WHERE o.id = v_tok.organization_id),
         v_tok.expires_at,
         split_part(v_tok.identity_key, ':', 1)
    FROM public.candidates c
   WHERE c.organization_id = v_tok.organization_id
     AND public.candidate_identity_key(
           c.email, c.linkedin_url, c.full_name, c.current_company)
         = v_tok.identity_key
   ORDER BY c.updated_at DESC NULLS LAST, c.created_at DESC
   LIMIT 1;
END;
$$;

-- Role title and stage, per search of the org the person appears in.
-- No client name (D8 default-hidden), no score, no review, no note, no
-- fee, no other candidate — the absent columns ARE the design, pinned
-- by candidate_portal_invariants' key-set assertion.
CREATE OR REPLACE FUNCTION public.candidate_portal_list_searches(p_token uuid)
RETURNS TABLE (
  project_id uuid, role_title text, stage text, added_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tok public.candidate_portal_tokens%ROWTYPE;
BEGIN
  v_tok := public.candidate_portal_token_row(p_token);

  RETURN QUERY
  SELECT c.project_id, p.title, coalesce(c.pipeline_stage, 'found'), c.created_at
    FROM public.candidates c
    JOIN public.projects p ON p.id = c.project_id
   WHERE c.organization_id = v_tok.organization_id
     AND public.candidate_identity_key(
           c.email, c.linkedin_url, c.full_name, c.current_company)
         = v_tok.identity_key
   ORDER BY c.created_at DESC;
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. The candidate's acts (D9)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.candidate_portal_update_contact(
  p_token uuid,
  p_full_name text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_location text DEFAULT NULL,
  p_linkedin_url text DEFAULT NULL,
  p_github_url text DEFAULT NULL,
  p_website_url text DEFAULT NULL,
  p_twitter_url text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tok public.candidate_portal_tokens%ROWTYPE;
  v_basis text;
  v_changed text[] := '{}';
  v_label text;
BEGIN
  v_tok := public.candidate_portal_token_row(p_token);
  v_basis := split_part(v_tok.identity_key, ':', 1);

  -- The fields the key stands on are not self-service (header note):
  -- changing them would detach every row of the group from this token.
  IF v_basis = 'name' AND p_full_name IS NOT NULL THEN
    RAISE EXCEPTION 'your name anchors this link — ask the search team to correct it'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_basis = 'linkedin' AND p_linkedin_url IS NOT NULL THEN
    RAISE EXCEPTION 'your linkedin profile anchors this link — ask the search team to correct it'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_full_name IS NOT NULL AND btrim(p_full_name) = '' THEN
    RAISE EXCEPTION 'your name cannot be empty' USING ERRCODE = 'check_violation';
  END IF;

  IF p_full_name    IS NOT NULL THEN v_changed := array_append(v_changed, 'full_name'); END IF;
  IF p_phone        IS NOT NULL THEN v_changed := array_append(v_changed, 'phone'); END IF;
  IF p_location     IS NOT NULL THEN v_changed := array_append(v_changed, 'location'); END IF;
  IF p_linkedin_url IS NOT NULL THEN v_changed := array_append(v_changed, 'linkedin_url'); END IF;
  IF p_github_url   IS NOT NULL THEN v_changed := array_append(v_changed, 'github_url'); END IF;
  IF p_website_url  IS NOT NULL THEN v_changed := array_append(v_changed, 'website_url'); END IF;
  IF p_twitter_url  IS NOT NULL THEN v_changed := array_append(v_changed, 'twitter_url'); END IF;

  IF array_length(v_changed, 1) IS NULL THEN
    RAISE EXCEPTION 'nothing to change' USING ERRCODE = 'check_violation';
  END IF;

  -- Every row of the group: the person is one, their rows are many.
  -- Empty string clears a field ('' → NULL); NULL leaves it alone.
  UPDATE public.candidates c
     SET full_name    = CASE WHEN p_full_name IS NOT NULL THEN btrim(p_full_name) ELSE c.full_name END,
         phone        = CASE WHEN p_phone IS NOT NULL THEN nullif(btrim(p_phone), '') ELSE c.phone END,
         location     = CASE WHEN p_location IS NOT NULL THEN nullif(btrim(p_location), '') ELSE c.location END,
         linkedin_url = CASE WHEN p_linkedin_url IS NOT NULL THEN nullif(btrim(p_linkedin_url), '') ELSE c.linkedin_url END,
         github_url   = CASE WHEN p_github_url IS NOT NULL THEN nullif(btrim(p_github_url), '') ELSE c.github_url END,
         website_url  = CASE WHEN p_website_url IS NOT NULL THEN nullif(btrim(p_website_url), '') ELSE c.website_url END,
         twitter_url  = CASE WHEN p_twitter_url IS NOT NULL THEN nullif(btrim(p_twitter_url), '') ELSE c.twitter_url END,
         updated_at   = now()
   WHERE c.organization_id = v_tok.organization_id
     AND public.candidate_identity_key(
           c.email, c.linkedin_url, c.full_name, c.current_company)
         = v_tok.identity_key;

  v_label := coalesce(nullif(btrim(p_full_name), ''), v_tok.recipient_label);

  PERFORM public.write_activity_event(
    p_organization_id => v_tok.organization_id,
    p_event_type      => 'candidate_self_updated',
    p_visibility      => 'org',
    p_detail          => jsonb_build_object(
                           'person', v_label,
                           'fields', to_jsonb(v_changed)));
END;
$$;

CREATE OR REPLACE FUNCTION public.candidate_portal_withdraw(p_token uuid, p_project_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.candidate_portal_request_erasure(p_token uuid, p_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  PERFORM public.write_activity_event(
    p_organization_id => v_tok.organization_id,
    p_event_type      => 'candidate_erasure_requested',
    p_visibility      => 'org',
    p_detail          => jsonb_build_object('person', v_tok.recipient_label));
END;
$$;

-- Called by the /candidate API route AFTER it has stored the file: the
-- act is remembered here; the org's parsed profile moves only by the
-- recruiter's own upload (header note).
CREATE OR REPLACE FUNCTION public.candidate_portal_record_cv(p_token uuid, p_storage_path text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tok public.candidate_portal_tokens%ROWTYPE;
BEGIN
  v_tok := public.candidate_portal_token_row(p_token);

  PERFORM public.write_activity_event(
    p_organization_id => v_tok.organization_id,
    p_event_type      => 'candidate_cv_submitted',
    p_visibility      => 'org',
    p_detail          => jsonb_build_object(
                           'person', v_tok.recipient_label,
                           'storage_path', p_storage_path));
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. Grants
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.issue_candidate_portal_token(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.revoke_candidate_portal_token(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.candidate_portal_token_row(uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.candidate_portal_context(uuid) FROM public;
REVOKE ALL ON FUNCTION public.candidate_portal_list_searches(uuid) FROM public;
REVOKE ALL ON FUNCTION public.candidate_portal_update_contact(uuid, text, text, text, text, text, text, text) FROM public;
REVOKE ALL ON FUNCTION public.candidate_portal_withdraw(uuid, uuid) FROM public;
REVOKE ALL ON FUNCTION public.candidate_portal_request_erasure(uuid, text) FROM public;
REVOKE ALL ON FUNCTION public.candidate_portal_record_cv(uuid, text) FROM public;

GRANT EXECUTE ON FUNCTION public.issue_candidate_portal_token(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.revoke_candidate_portal_token(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.candidate_portal_context(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.candidate_portal_list_searches(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.candidate_portal_update_contact(uuid, text, text, text, text, text, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.candidate_portal_withdraw(uuid, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.candidate_portal_request_erasure(uuid, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.candidate_portal_record_cv(uuid, text) TO anon, authenticated, service_role;
