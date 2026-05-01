-- Recruiter override layer on candidates.
--
-- The AI evaluation produces tier + scores + commentary. The recruiter
-- often disagrees, has private context the AI doesn't see (off-the-
-- record references, body language from a call, market knowledge),
-- and needs a place to record their own read without rewriting the
-- AI's output. This column captures that.
--
-- Stored as JSONB so the shape can grow (sentiment, salary signals,
-- availability windows, candidate-driven concerns, etc.) without a
-- migration per field. Schema today:
--
-- {
--   "tier":        "tier_1" | "tier_2" | "tier_3" | "tier_4" | null,
--   "fit_notes":   string,
--   "strengths":   string[],
--   "would_present": "yes" | "maybe" | "no" | null,
--   "updated_by":  uuid (user id),
--   "updated_at":  timestamptz
-- }
--
-- AI-derived fields (cv_structured, candidate_scores, evaluation) are
-- never touched by recruiter assessment writes; the column is purely
-- additive. Display layer renders both side-by-side so disagreements
-- are visible.

ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS recruiter_assessment jsonb;

-- No CHECK constraint on shape — JSONB is intentionally schemaless
-- here; the server action validates fields before writing. RLS is
-- inherited from the candidates table (org-scoped via
-- current_user_org_id()), so no new policies are needed.
