-- 144 — THE SIDEBAR BADGE COUNTS PEOPLE, NOT KEYS
--
-- Gate: docs/superpowers/specs/2026-09-25-network-fold-by-person-gate.md
-- (CONFIRMED, four rulings, all recommendations taken). This migration is
-- D4's non-optional half.
--
-- ## Why
--
-- `count_network_people()` has counted DISTINCT `candidate_identity_key(...)`
-- since 098 — a key RECOMPUTED from each candidate row. §203 gave the
-- product a merge, and a merge changes `candidates.network_profile_id`; it
-- does not and cannot change what a row's fields compute to. So merging two
-- records of one human moved this number by NOTHING. Proven live in an
-- aborting transaction, on a pair merged mid-probe:
--
--   sidebar badge, before -> after merge:  4 -> 6
--
-- Two rows entered, the merge made them one person, and the badge counted
-- two. The Network page now folds on `network_profile_id` (the same gate,
-- D1), and this function runs in the dashboard layout on EVERY
-- authenticated route — so if it kept counting keys, the badge and the page
-- would disagree by one for every merge anybody ever performs. 098's own
-- comment already said the two must change together.
--
-- ## What a person is here
--
-- One `network_profiles` row, reached through the FK the trigger maintains
-- on every candidate birth path.
--
-- Rows with `network_profile_id IS NULL` are EXCLUDED, which is §196/139's
-- ruling carried up: while a CV is still being read and the only identity
-- signal is a name, there is no person yet — "that is not an identity, it
-- is a filename". They are not counted here and they are not folded into
-- the page's table; the page says how many it is holding back rather than
-- dropping them silently (D2).
--
-- ## Scope
--
-- Unchanged: STABLE, `SET search_path`, NOT security definer — so RLS on
-- `candidates` scopes the count to the caller's organisation exactly as
-- before. No new table, no new grant, no policy change; the anon roster and
-- the app-recordable door are untouched. The existing grants (authenticated,
-- service_role) survive CREATE OR REPLACE.

CREATE OR REPLACE FUNCTION public.count_network_people()
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COUNT(DISTINCT c.network_profile_id)::integer
  FROM public.candidates AS c
  WHERE c.network_profile_id IS NOT NULL;
$$;

COMMENT ON FUNCTION public.count_network_people() IS
  '§204 — counts DISTINCT network_profile_id, so a merge (§203) moves the badge. Rows with no person yet (§196/139, cv_processing with only a name) are excluded, matching the Network page''s fold. RLS-scoped: not security definer.';
