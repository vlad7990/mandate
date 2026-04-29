-- Add updated_at to boolean_queries for "last edited" UI affordances and
-- to keep the table's audit shape consistent with other versioned tables
-- (job_specs, projects). Defaults to now() so existing rows pick up a
-- non-null value automatically.
ALTER TABLE public.boolean_queries
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS boolean_queries_project_canonical_idx
  ON public.boolean_queries (project_id, query_type, search_type, version DESC);
