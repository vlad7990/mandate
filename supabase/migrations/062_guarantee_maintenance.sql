-- 062: scheduled maintenance — guarantee-expiry instalments earn themselves.
--
-- The first scheduled job in the product. 050 left three instalment
-- triggers with no status transition behind them ('engagement',
-- 'shortlist', 'guarantee_passed') and §5a records the consequence:
-- "marked earned by hand from the panel — again because nothing is
-- scheduled." This closes the one of the three that is derivable from
-- stored dates and nothing else.
--
-- ## Why only guarantee_passed
--
-- 'engagement' and 'shortlist' are judgment calls — whether the engagement
-- began or the shortlist was delivered is a fact about the world that the
-- database does not hold, so a human keeps marking those. Whether a
-- guarantee has passed IS held: `placements.guarantee_ends_on` is a
-- generated column off start_date + guarantee_days. A date-derived fact
-- earning on a schedule is automation; the other two earning on a schedule
-- would be invention.
--
-- ## The three decisions in the WHERE clause
--
-- 1. **`p.status = 'started'` only.** An offered or accepted placement has
--    no guarantee running. A fell_through placement must never earn its
--    guarantee instalment — and if it fell through *after* the guarantee
--    cleared but before this ran, a human decides, because Postgres cannot
--    know whether the fee survives the dispute. Conservative on purpose.
-- 2. **`earned_on = guarantee_ends_on`, not current_date.** The date that
--    decides the quarter is the date the fact became true. A cron that was
--    down for a week still books the line into the right quarter — same
--    rule as 050's "a report run in March does not change in June".
-- 3. **`status = 'pending'` only**, which is what makes it idempotent: a
--    second run in the same minute matches nothing, and a line a human
--    cancelled stays cancelled.
--
-- ## The audit trail comes free, and that is why this is an UPDATE
--
-- 053's `placement_fee_lines_audit` trigger fires on any UPDATE that moves
-- status to 'earned' and writes `fee_line_earned` at 'fees' visibility.
-- This function goes through the same UPDATE path as the panel, so the
-- event is written by the same trigger — with a NULL actor, which
-- `describeActor` renders as "System". A maintenance job that bypassed the
-- trigger would be the one writer in the product whose changes the trail
-- misses.
--
-- ## Grants — the advisor will flag this, deliberately (seventh entry)
--
-- SECURITY DEFINER, executable by anon and authenticated. Same argument as
-- `check_demo_rate_limit` (061): the caller is Vercel Cron hitting
-- /api/cron/maintenance with no session, so there is no privileged role to
-- grant it to — there is no service-role key in the app's environment, by
-- design. What a hostile caller with the anon key can do with it is our
-- maintenance, early: it takes no input, trusts nothing from the caller,
-- derives every row it touches from dates already in the database, and is
-- idempotent. Running it a million times earns exactly the lines a single
-- run would have earned. The route above it carries the CRON_SECRET gate;
-- this function is safe even if reached around that gate.

CREATE OR REPLACE FUNCTION public.run_guarantee_maintenance()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  earned_count integer;
BEGIN
  UPDATE public.placement_fee_lines l
  SET status     = 'earned',
      earned_on  = p.guarantee_ends_on,
      updated_at = now()
  FROM public.placements p
  WHERE p.id = l.placement_id
    AND l.kind = 'instalment'
    AND l."trigger" = 'guarantee_passed'
    AND l.status = 'pending'
    AND p.status = 'started'
    AND p.guarantee_ends_on IS NOT NULL
    AND p.guarantee_ends_on <= current_date;

  GET DIAGNOSTICS earned_count = ROW_COUNT;
  RETURN earned_count;
END;
$$;

REVOKE ALL ON FUNCTION public.run_guarantee_maintenance() FROM public;
GRANT EXECUTE ON FUNCTION public.run_guarantee_maintenance() TO anon, authenticated;
