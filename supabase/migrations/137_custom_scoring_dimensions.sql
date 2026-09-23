-- 137 — CUSTOM INDUSTRY DIMENSIONS: WHERE THE EXTRA SCORES LIVE
--
-- §196. The five scoring dimensions are columns on this table —
-- technical_score, domain_score, leadership_score, regulatory_score,
-- transformation_score — each with its own 0–10 CHECK, each named by
-- the HM portal read surface (069) and the client portal (127). That
-- columnar spine is not moving. It is what both portals, six documents
-- and the comparison grid already speak.
--
-- A custom dimension rides alongside it in ONE jsonb column, keyed by
-- the dimension's slug:  {"fx_options_market_making": 7}
--
-- WHY JSONB AND NOT COLUMNS. A column per custom dimension would need a
-- migration per mandate — the dimensions are derived per search, by an
-- agent, at calibration time. There is no fixed set to model. The
-- alternative shape, a `candidate_dimension_scores` child table, is the
-- right answer if custom dimensions ever become the norm rather than
-- the exception; it is the wrong answer today, because it would
-- invalidate both portal read surfaces and every report that selects
-- the five by name in exchange for generality nothing yet needs. This
-- column can become that table later without any of those rewrites
-- happening now.
--
-- WHY NO CHECK ON THE SHAPE. Postgres cannot usefully constrain "keys
-- are the approved dimension slugs of this row's project's calibration
-- model" — the authority for that lives in the calibration model, which
-- is itself jsonb on another table, and it changes when a recruiter
-- approves a dimension. Enforcing it here would mean a trigger that
-- re-reads projects on every score write, on the hot path of every
-- scoring run. The guard is in the application instead, at exactly one
-- door: `approvedCustomDimensions` in lib/calibration/custom-dimensions
-- is the only thing that decides which keys may be scored, and the
-- scoring engine writes only what it returns. A key that is not
-- approved is not written; a key that stops being approved stops being
-- read.
--
-- HONEST ABSENCE IS THE DEFAULT. '{}' — not null, not zeros. A
-- candidate parsed before a dimension was approved has no score for it,
-- and the weighted average EXCLUDES that dimension from the weight
-- total for that candidate rather than scoring them 0. Scoring an
-- unassessed axis as zero would punish a candidate for the timing of
-- their upload, which is the system asserting something it does not
-- know.
--
-- No function is created or replaced, so the anon roster is untouched.
-- No FK is added, so embed-ambiguity.test.ts needs no regeneration.
-- RLS is inherited: this is a new column on an existing table, and
-- every policy on candidate_scores is row-scoped, not column-scoped.

ALTER TABLE public.candidate_scores
  ADD COLUMN IF NOT EXISTS custom_scores jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.candidate_scores.custom_scores IS
  '§196 — 0-10 scores for this project''s APPROVED custom dimensions, keyed by dimension slug. {} means none assessed. Written only by the scoring engine, and only for keys approvedCustomDimensions() returns; an absent key is excluded from the weighted average rather than scored zero.';

-- The object must be an object, not an array or a scalar. This is the
-- one shape check that is cheap and always true regardless of which
-- dimensions a mandate carries.
ALTER TABLE public.candidate_scores
  DROP CONSTRAINT IF EXISTS candidate_scores_custom_scores_is_object;

ALTER TABLE public.candidate_scores
  ADD CONSTRAINT candidate_scores_custom_scores_is_object
  CHECK (jsonb_typeof(custom_scores) = 'object');
