-- Candidate contact columns.
--
-- Promotes a handful of social / contact fields out of cv_structured
-- (or surfaces them for the first time) onto first-class columns so the
-- profile UI can edit them inline without round-tripping the JSONB blob.
--
-- Fields:
--   * twitter_url, github_url, website_url — recruiter-curated social
--     links. The CV parser doesn't extract these today; they're filled
--     in manually in the profile UI.
--   * phone — same: recruiter-entered, not parsed from the CV.
--   * location — the CV parser already populates `cv_structured.location`,
--     but exposing it as a typed column means the profile UI can let
--     recruiters override the parsed value (e.g. when a candidate has
--     relocated since their CV was written).
--
-- All fields are nullable text. RLS is inherited from the candidates
-- table — no new policies are required.

ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS twitter_url text,
  ADD COLUMN IF NOT EXISTS github_url  text,
  ADD COLUMN IF NOT EXISTS website_url text,
  ADD COLUMN IF NOT EXISTS phone       text,
  ADD COLUMN IF NOT EXISTS location    text;
