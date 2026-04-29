-- Extend public.job_specs to support structured editing, version history, and
-- a database-enforced single-final invariant.
--
-- content_json   — structured sections (the editing source of truth)
-- updated_at     — last-saved timestamp surfaced in the editor
-- is_generating  — distinguishes "AI is working" from "ready to edit"
--
-- The existing `content` column keeps a derived markdown rendering, written by
-- the application on every save, for downstream consumers (export, plain-text
-- diff, future PDF). content_json is the authoritative editing state.
ALTER TABLE public.job_specs
  ADD COLUMN IF NOT EXISTS content_json   jsonb       NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at     timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS is_generating  boolean     NOT NULL DEFAULT false;

-- Hard guarantee: at most one is_final=true row per project. Backstops the
-- two-step UPDATE in markAsFinal so even out-of-band writes can't drift.
CREATE UNIQUE INDEX IF NOT EXISTS unique_final_spec_per_project
  ON public.job_specs (project_id) WHERE is_final;

-- Editor lookups by version-desc / generation status.
CREATE INDEX IF NOT EXISTS job_specs_project_version_idx
  ON public.job_specs (project_id, version DESC);
