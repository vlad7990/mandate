-- Executive Intelligence Phase 2 — candidate linkage.
--
-- Links existing public.candidates rows (project-scoped, CV-parsed) to
-- executive searches through a join table, per the Phase 1 plan decision:
-- no parallel executive_candidates model. A candidate can be linked to many
-- searches; a search links each candidate once.
--
-- `stage` tracks the due-diligence funnel only — it is NOT a hiring
-- decision. Decisions stay with humans; downstream features (interview
-- plans, assessments) will hang off this table.

CREATE TABLE IF NOT EXISTS public.executive_search_candidates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  search_id       uuid NOT NULL REFERENCES public.executive_searches(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  candidate_id    uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  stage           text NOT NULL DEFAULT 'identified'
                    CHECK (stage IN ('identified', 'in_diligence', 'advanced', 'on_hold', 'declined')),
  added_by        uuid REFERENCES public.users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS unique_candidate_per_exec_search
  ON public.executive_search_candidates (search_id, candidate_id);
CREATE INDEX IF NOT EXISTS exec_search_candidates_org_idx
  ON public.executive_search_candidates (organization_id);
CREATE INDEX IF NOT EXISTS exec_search_candidates_candidate_idx
  ON public.executive_search_candidates (candidate_id);
CREATE INDEX IF NOT EXISTS exec_search_candidates_stage_idx
  ON public.executive_search_candidates (search_id, stage);
CREATE INDEX IF NOT EXISTS exec_search_candidates_added_by_idx
  ON public.executive_search_candidates (added_by);

ALTER TABLE public.executive_search_candidates ENABLE ROW LEVEL SECURITY;

-- Same org-scoping pattern used on every other org-owned table.
CREATE POLICY org_exec_search_candidates_only ON public.executive_search_candidates
  FOR ALL TO authenticated
  USING (
    organization_id IS NOT NULL
    AND organization_id = public.current_user_org_id()
  )
  WITH CHECK (
    organization_id IS NOT NULL
    AND organization_id = public.current_user_org_id()
  );

-- Extend the audit event vocabulary for linkage actions. The CHECK was
-- created inline in 032, so it carries the auto-generated name.
ALTER TABLE public.executive_audit_events
  DROP CONSTRAINT IF EXISTS executive_audit_events_event_type_check;

ALTER TABLE public.executive_audit_events
  ADD CONSTRAINT executive_audit_events_event_type_check
  CHECK (event_type IN (
    'search_created',
    'search_updated',
    'profile_generation_requested',
    'profile_generated',
    'profile_generation_failed',
    'profile_edited',
    'profile_new_version',
    'profile_regenerated',
    'profile_approved',
    'candidate_linked',
    'candidate_unlinked',
    'candidate_stage_changed'
  ));
