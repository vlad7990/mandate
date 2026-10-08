-- 160 — THE SEARCH PATH A FUNCTION CAN TRUST
--
-- Two `function_search_path_mutable` findings appeared in the advisor
-- sweep of 2026-10-07. They are the first new security findings since
-- the post-061 sweep, and they arrived with the network programme
-- (143–148) — the checklist said the advisor was clean because nobody
-- re-ran it after those migrations, which is the standing rule and was
-- missed. Both functions are named below; only ONE of them is changed,
-- and the other's exemption is the substance of this migration.
--
-- Neither function is SECURITY DEFINER, neither reads a table, and
-- migration 158 already took both off the anon surface — the ACL on
-- each is `authenticated` + `service_role` only. So neither finding is
-- a privilege-escalation route today. What the lint is really asking is
-- whether a name inside the body could be captured by a schema the
-- caller controls.
--
-- ---------------------------------------------------------------------
-- 1. relationship_warmth(text) — FIXED, and nothing is lost
-- ---------------------------------------------------------------------
--
-- A five-branch CASE over a state string, called from inside
-- `merge_network_profiles` (143, carried through 152/153/155) exactly
-- twice per merge to decide which of two rows holds the warmer
-- relationship. Two evaluations per merge, never per row, so whether
-- the planner inlines it has no consequence anybody could measure.
--
-- `ALTER FUNCTION … SET search_path` rather than CREATE OR REPLACE,
-- deliberately: it adds the one proconfig entry and touches neither the
-- body, nor the ACL 158 ruled, nor any dependency. The empty path is
-- the right value because the body names nothing to qualify —
-- pg_catalog is searched implicitly ahead of the path either way, so
-- the CASE and the comparisons still resolve.

ALTER FUNCTION public.relationship_warmth(text)
  SET search_path = '';

COMMENT ON FUNCTION public.relationship_warmth(text) IS
  '§205 — warmth as an ordinal, so a merge can compare two relationship states. '
  '160: search_path pinned empty; the body names nothing outside pg_catalog. '
  'Callable by authenticated and service_role only (158).';

-- ---------------------------------------------------------------------
-- 2. network_people_matches(…) — DELIBERATELY NOT CHANGED
-- ---------------------------------------------------------------------
--
-- The same one-line ALTER would silence the second finding, buy no
-- security whatsoever, and cost the Network page the only optimisation
-- 148 went to the trouble of recording a number for. That trade is
-- refused here, in writing, so the next sweep does not quietly make it.
--
-- WHY IT BUYS NO SECURITY. The body is five OR-guarded comparisons over
-- scalar arguments. It references no table, no view, no cast of ours and
-- no function of ours — only `=`, `ANY`, `coalesce`, `BETWEEN`, the
-- comparison operators and `CASE`, every one of them in pg_catalog. A
-- mutable search_path is dangerous because an attacker who can create
-- objects in a schema earlier in the path can capture a name the body
-- uses; pg_catalog, however, is searched implicitly BEFORE the path's
-- own schemas and cannot be preempted that way. There is no capturable
-- name in this function. The lint is true about the form and empty
-- about the risk.
--
-- WHY IT WOULD COST SOMETHING REAL. A SQL function carrying a SET
-- clause is not inlinable — PostgreSQL's inliner refuses any candidate
-- whose proconfig is non-null, on 17.6 as on every version before it.
-- Inlining here is not incidental; it is the design, and 146's own
-- COMMENT says so: "written once and inlined into both the paged reader
-- and the rollup". Verified on production 2026-10-07 by EXPLAIN over
-- network_people_folded: the call does not appear in the plan at all,
-- because the planner expanded it and pushed the component predicates
-- down INTO the GroupAggregate's own Filter —
--
--   Filter: ((COALESCE(max(…years_experience…) …) >= '6')
--        AND (COALESCE(max(…years_experience…) …) <= '10')
--        AND (max(c.archetype) FILTER (…) = 'operator'))
--
-- Pin search_path and that becomes one opaque boolean call evaluated
-- per surviving group AFTER the aggregate, with the filters no longer
-- available to the planner. 148 measured the shape of that cliff from
-- the other side — the same rollup was 835 ms as a plain SQL function
-- and 12 ms once each call got a plan for the filters it actually had.
-- Losing predicate pushdown walks back toward the 835.
--
-- WHAT WOULD CHANGE THE ANSWER. If this function ever grows a reference
-- to one of our own objects — a table, a view, a cast, a helper — the
-- exemption dies with the change that adds it, because then there IS a
-- capturable name. The alternative that keeps both properties is to
-- spell every operator as OPERATOR(pg_catalog.=) and leave the path
-- mutable: provably immune, still inlinable, and the lint still fires,
-- so it buys nothing the paragraph above does not already establish.
--
-- Recorded, therefore, as the house's third standing advisor exemption,
-- beside the deny-all RLS tables and the 069 SECURITY DEFINER set:
-- function_search_path_mutable on network_people_matches is EXPECTED.
-- One finding, reasoned, not a backlog item.

COMMENT ON FUNCTION public.network_people_matches(
  text, text, text, numeric, text[], text, text, text, text, text) IS
  '§205 — the Network page''s filter rule, written once and inlined into both the paged '
  'reader and the rollup. Archetype, domain and years read the canonical record; stage '
  'matches ANY appearance; tier is the person''s best. '
  '160: search_path is left MUTABLE ON PURPOSE. A SET clause would make this '
  'non-inlinable and cost the predicate pushdown 148 tuned for, while buying nothing — '
  'the body names only pg_catalog built-ins, which the path cannot preempt. The '
  'advisor''s function_search_path_mutable finding on this function is expected. '
  'If this body ever references one of our own objects, pin the path in that migration.';
