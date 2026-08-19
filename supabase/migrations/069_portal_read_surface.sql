-- The portal read surface, and attributed reviews.
--
-- Final third of the External Identity model (067 identity, 068
-- relationships). Externals still hold no base-table policy on any
-- domain table — these SECURITY DEFINER RPCs *are* their read surface,
-- for the reason D3 states: "the slate" is a computed shape (shortlist
-- ids, else top-5 by rank) that base-table RLS cannot express without
-- exposing the whole candidate pool. A signed-in external holds their
-- session and the anon key, so every one of these functions is
-- reachable from a browser console — each therefore returns only what
-- the portal page renders, never the rows it was computed from.
--
-- ## The slate is computed here AND in page.tsx
--
-- `portal_slate_candidate_ids` mirrors `shapeSlate` in
-- src/app/hm/[token]/page.tsx (shortlist candidate_ids when non-empty,
-- else top-5 by candidate_scores.rank_position). The §13
-- same-thing-twice rule would prefer one copy; it cannot cross the
-- SQL/TS boundary here because the token portal shapes app-side over a
-- service-role read and the logged-in portal must shape in-database.
-- The external_identity invariants file pins the two together: a case
-- where they disagree is a failing invariant, not a drifting pair.
--
-- ## Attribution
--
-- `hiring_manager_reviews.submitted_by_user_id` — nullable, because the
-- token path (023) stays label-only by design (D5). The author guard
-- from 057, extended in 068 to accept an external of one of the org's
-- clients, now covers the column: a review can only ever name a
-- submitter who was staff, founder, or one of this org's client
-- externals at the moment of writing.

-- ---------------------------------------------------------------------------
-- 1. Attribution
-- ---------------------------------------------------------------------------

ALTER TABLE public.hiring_manager_reviews
  ADD COLUMN IF NOT EXISTS submitted_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS hm_reviews_submitted_by_idx
  ON public.hiring_manager_reviews (submitted_by_user_id);

DROP TRIGGER IF EXISTS hiring_manager_reviews_author_in_org ON public.hiring_manager_reviews;
CREATE TRIGGER hiring_manager_reviews_author_in_org
  BEFORE INSERT OR UPDATE ON public.hiring_manager_reviews
  FOR EACH ROW EXECUTE FUNCTION public.guard_author_in_org('submitted_by_user_id');


-- ---------------------------------------------------------------------------
-- 2. The access predicate — D2 as one expression
-- ---------------------------------------------------------------------------

-- share ∧ (client-scoped role ∨ grant). Coalesced: the portal submit
-- path reads it negated. For staff, suspended or pending accounts
-- current_user_client_id() is NULL and the share test fails — every
-- branch fails closed.
CREATE OR REPLACE FUNCTION public.can_view_portal_mandate(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    EXISTS (
      SELECT 1 FROM public.mandate_shares s
       WHERE s.project_id = p_project_id
         AND s.client_id = (SELECT public.current_user_client_id())
    )
    AND (
      public.current_user_role() IN ('client_hr', 'client_admin')
      OR EXISTS (
        SELECT 1 FROM public.mandate_grants g
         WHERE g.project_id = p_project_id
           AND g.user_id = (SELECT auth.uid())
      )
    ),
    false)
$$;

REVOKE ALL ON FUNCTION public.can_view_portal_mandate(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.can_view_portal_mandate(uuid) TO authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 3. Who am I, portal edition
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.portal_context()
RETURNS TABLE(
  full_name text, email text, role text,
  client_id uuid, client_name text, organization_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.full_name, u.email, u.role,
         c.id, c.name, o.name
    FROM public.users u
    JOIN public.clients c ON c.id = u.client_id
    JOIN public.organizations o ON o.id = c.organization_id
   WHERE u.id = (SELECT auth.uid())
     AND u.status = 'active'
     AND u.client_id IS NOT NULL
$$;

REVOKE ALL ON FUNCTION public.portal_context() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.portal_context() TO authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 4. The mandate list
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.portal_list_mandates()
RETURNS TABLE(
  project_id uuid, title text, status text,
  shared_at timestamptz, my_last_submission_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.title, p.status,
         s.created_at,
         (SELECT max(r.submitted_at)
            FROM public.hiring_manager_reviews r
           WHERE r.project_id = p.id
             AND r.submitted_by_user_id = (SELECT auth.uid()))
    FROM public.mandate_shares s
    JOIN public.projects p ON p.id = s.project_id
   WHERE s.client_id = (SELECT public.current_user_client_id())
     AND (
       public.current_user_role() IN ('client_hr', 'client_admin')
       OR EXISTS (
         SELECT 1 FROM public.mandate_grants g
          WHERE g.project_id = p.id
            AND g.user_id = (SELECT auth.uid())
       )
     )
   ORDER BY s.created_at DESC
$$;

REVOKE ALL ON FUNCTION public.portal_list_mandates() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.portal_list_mandates() TO authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 5. The slate
-- ---------------------------------------------------------------------------

-- The shapeSlate pairing; see the header. Split out so the invariants
-- file can compare it against the page's rule directly.
CREATE OR REPLACE FUNCTION public.portal_slate_candidate_ids(p_project_id uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN sl.candidate_ids IS NOT NULL AND array_length(sl.candidate_ids, 1) > 0
      THEN sl.candidate_ids
    ELSE coalesce((
      SELECT array_agg(cs.candidate_id ORDER BY cs.rank_position)
        FROM (
          SELECT candidate_id, rank_position
            FROM public.candidate_scores
           WHERE project_id = p_project_id
             AND rank_position IS NOT NULL
           ORDER BY rank_position
           LIMIT 5
        ) cs
    ), '{}'::uuid[])
  END
  FROM (SELECT 1) one
  LEFT JOIN LATERAL (
    SELECT candidate_ids FROM public.shortlists
     WHERE project_id = p_project_id
     LIMIT 1
  ) sl ON true
$$;

REVOKE ALL ON FUNCTION public.portal_slate_candidate_ids(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.portal_slate_candidate_ids(uuid) TO service_role;

-- Everything the portal page renders for one mandate, and nothing else:
-- the project face, the slate rows with their scores, and progress
-- *counts* over the wider pool — the pool itself never crosses.
CREATE OR REPLACE FUNCTION public.portal_get_mandate(p_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ids      uuid[];
  v_project  jsonb;
  v_result   jsonb;
BEGIN
  IF NOT public.can_view_portal_mandate(p_project_id) THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
           'id', p.id, 'title', p.title, 'company_name', p.company_name,
           'status', p.status, 'calibration_model', p.calibration_model)
    INTO v_project
    FROM public.projects p WHERE p.id = p_project_id;

  IF v_project IS NULL THEN
    RETURN NULL;
  END IF;

  v_ids := public.portal_slate_candidate_ids(p_project_id);

  SELECT jsonb_build_object(
    'project', v_project,
    'shortlist', (
      SELECT jsonb_build_object('candidate_ids', to_jsonb(sl.candidate_ids),
                                'updated_at', sl.updated_at)
        FROM public.shortlists sl
       WHERE sl.project_id = p_project_id
       LIMIT 1
    ),
    'candidates', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', c.id, 'full_name', c.full_name,
               'current_title', c.current_title,
               'current_company', c.current_company,
               'cv_structured', c.cv_structured,
               'recruiter_assessment', c.recruiter_assessment,
               'pipeline_stage', c.pipeline_stage))
        FROM public.candidates c
       WHERE c.project_id = p_project_id
         AND c.id = ANY(v_ids)
    ), '[]'::jsonb),
    'scores', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'candidate_id', s.candidate_id,
               'rank_position', s.rank_position,
               'overall_score', s.overall_score,
               'tier', s.tier,
               'technical_score', s.technical_score,
               'domain_score', s.domain_score,
               'leadership_score', s.leadership_score,
               'regulatory_score', s.regulatory_score,
               'transformation_score', s.transformation_score))
        FROM public.candidate_scores s
       WHERE s.project_id = p_project_id
         AND s.candidate_id = ANY(v_ids)
    ), '[]'::jsonb),
    -- The stage list mirrors computeProgress in the token portal page;
    -- pinned by the invariants file alongside the slate rule.
    'progress', (
      SELECT jsonb_build_object(
               'candidates_total', count(*),
               'candidates_reviewed', count(*) FILTER (WHERE
                 coalesce(c.pipeline_stage, 'found') IN
                 ('reviewed', 'matched', 'shortlisted', 'submitted',
                  'interviewed', 'passed_rounds', 'finalist', 'offer', 'hired')))
        FROM public.candidates c
       WHERE c.project_id = p_project_id
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.portal_get_mandate(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.portal_get_mandate(uuid) TO authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 6. Own submissions
-- ---------------------------------------------------------------------------

-- Own rows only, whatever the role: client_hr sees the mandate's slate,
-- not a colleague's opinions of it. The recruiter-side view of all
-- reviews stays where it is, behind org RLS.
CREATE OR REPLACE FUNCTION public.portal_list_my_reviews(p_project_id uuid)
RETURNS TABLE(
  id uuid, candidate_ratings jsonb, top_concern text,
  priority_order uuid[], submitted_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.id, r.candidate_ratings, r.top_concern, r.priority_order, r.submitted_at
    FROM public.hiring_manager_reviews r
   WHERE r.project_id = p_project_id
     AND r.submitted_by_user_id = (SELECT auth.uid())
     AND public.can_view_portal_mandate(p_project_id)
   ORDER BY r.submitted_at DESC
$$;

REVOKE ALL ON FUNCTION public.portal_list_my_reviews(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.portal_list_my_reviews(uuid) TO authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 7. The client admin's grant ledger
-- ---------------------------------------------------------------------------

-- Which of my company's hiring managers hold which shared mandates —
-- the read half of grant_mandate_access/revoke_mandate_access (068).
CREATE OR REPLACE FUNCTION public.portal_list_grants()
RETURNS TABLE(
  project_id uuid, project_title text, user_id uuid,
  member_name text, member_email text, granted_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT g.project_id, p.title, g.user_id,
         coalesce(nullif(btrim(u.full_name), ''), u.email), u.email,
         g.created_at
    FROM public.mandate_grants g
    JOIN public.projects p ON p.id = g.project_id
    JOIN public.users u ON u.id = g.user_id
   WHERE public.is_client_admin()
     AND g.client_id = (SELECT public.current_user_client_id())
   ORDER BY p.title, g.created_at
$$;

REVOKE ALL ON FUNCTION public.portal_list_grants() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.portal_list_grants() TO authenticated, service_role;
