-- F4 — Calibration History
--
-- Capture every calibration_model snapshot so the recruiter can see how
-- the role's calibration evolved across initial onboarding,
-- recalibrations, and manual weight edits — and restore an older
-- version if a recent recalibration moved things in the wrong
-- direction.

CREATE TABLE IF NOT EXISTS public.calibration_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  -- Full calibration_model frozen at this point — role_title,
  -- role_structure, dimension_weights, weights_rationale, etc.
  snapshot jsonb NOT NULL,
  -- "initial" | "recalibration" | "manual_edit" | "restore"
  change_type text NOT NULL,
  -- Free-form one-liner — "Recalibrated from feedback #abc",
  -- "Recruiter manually adjusted leadership +2".
  change_reason text,
  -- Optional pointer back to the feedback row that drove a
  -- recalibration. NULL for initial / manual edits.
  feedback_id uuid REFERENCES public.feedback(id) ON DELETE SET NULL,
  changed_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS calibration_history_project_idx
  ON public.calibration_history (project_id, created_at DESC);

ALTER TABLE public.calibration_history ENABLE ROW LEVEL SECURITY;

-- Read: org-scoped — same as the projects table.
CREATE POLICY calibration_history_org_select
  ON public.calibration_history
  FOR SELECT
  USING (organization_id = public.current_user_org_id());

-- Write: org-scoped — server actions running under the recruiter's
-- session can insert; deletion is intentionally not permitted from the
-- app layer (history is append-only).
CREATE POLICY calibration_history_org_insert
  ON public.calibration_history
  FOR INSERT
  WITH CHECK (organization_id = public.current_user_org_id());
