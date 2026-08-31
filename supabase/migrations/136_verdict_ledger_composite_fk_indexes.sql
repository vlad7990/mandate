-- 136 — COVERING INDEXES FOR THE VERDICT LEDGER'S COMPOSITE FKs
--
-- The pre-launch checklist's "fix unindexed FK warnings" line, closed
-- against the advisor rather than against memory: the sweep on
-- 2026-08-31 returned exactly two, both on `verdict_ledger` — the
-- newest table, added by §188 and so the one no earlier index pass
-- covered.
--
-- The table already indexes `candidate_id` and `project_id` singly, and
-- `(organization_id, evaluated_at DESC)` for the calibration card's
-- read. What it lacks is a covering index for the two COMPOSITE
-- `_in_org` foreign keys — the org-anchored twins every table in this
-- schema carries so a row cannot be pointed at another org's data.
--
-- Those FKs are checked on every DELETE of a candidate or a project,
-- because both cascade. With no covering index Postgres must scan the
-- ledger to prove the cascade is safe. Today that is one page; the
-- ledger is the one table designed to grow without bound (a row per
-- verdict, forever, and §188 ruled humans may never prune it), so this
-- is the cheapest it will ever be to add.
--
-- Column ORDER matches the constraint definitions exactly —
-- (organization_id, candidate_id) and (organization_id, project_id) —
-- because a composite index only covers an FK when its leading columns
-- are the FK's, in the FK's order.
--
-- No FK is added here, so `embed-ambiguity.test.ts` needs no
-- AMBIGUOUS_PAIRS regeneration: indexes do not create the PostgREST
-- ambiguity that guard exists to catch. No function is created or
-- replaced, so the anon roster is untouched at 14.

CREATE INDEX IF NOT EXISTS verdict_ledger_candidate_in_org_idx
  ON public.verdict_ledger (organization_id, candidate_id);

CREATE INDEX IF NOT EXISTS verdict_ledger_project_in_org_idx
  ON public.verdict_ledger (organization_id, project_id);
