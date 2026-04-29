-- Shortlist Builder: one canonical shortlist per project.
--
-- Stores the ordered candidate slate, the recruiter's narrative, the
-- AI-generated submission report, and the submission timestamp.
-- Re-running the builder updates the same row (UNIQUE on project_id);
-- if we ever want history we can drop the unique and store the
-- "current" pointer separately.
--
-- candidate_ids is uuid[] in slate order (slot 1 = index 0). slate_size
-- is the recruiter-chosen target — Top 3 / Top 5 / custom — used by the
-- UI to render the right number of slot dropzones.

CREATE TABLE IF NOT EXISTS public.shortlists (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  slate_size      integer NOT NULL DEFAULT 3
                    CHECK (slate_size >= 1 AND slate_size <= 10),
  candidate_ids   uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  narrative       text NOT NULL DEFAULT '',
  report_content  jsonb NOT NULL DEFAULT '{}'::jsonb,
  submitted_at    timestamptz,
  submitted_by    uuid REFERENCES public.users(id),
  created_by      uuid REFERENCES public.users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS unique_shortlist_per_project
  ON public.shortlists (project_id);

ALTER TABLE public.shortlists ENABLE ROW LEVEL SECURITY;

-- Same org-scoping pattern used on every other org-owned table.
DROP POLICY IF EXISTS org_shortlists_only ON public.shortlists;
CREATE POLICY org_shortlists_only ON public.shortlists
  FOR ALL TO authenticated
  USING (
    organization_id IS NOT NULL
    AND organization_id = public.current_user_org_id()
  )
  WITH CHECK (
    organization_id IS NOT NULL
    AND organization_id = public.current_user_org_id()
  );

CREATE INDEX IF NOT EXISTS shortlists_org_idx
  ON public.shortlists (organization_id);
