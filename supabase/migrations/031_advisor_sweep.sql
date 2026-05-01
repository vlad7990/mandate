-- Advisor sweep for migrations 028 / 029 / 030
--
-- Closes the actionable advisor findings on the three new objects:
--
-- 1. calibration_history — three foreign keys (changed_by, feedback_id,
--    organization_id) had no covering index, forcing seq scans on the
--    referenced tables when those FKs participate in a join.
-- 2. waitlist — same issue on reviewed_by.
-- 3. waitlist_founder_{select,update} — both policies called auth.uid()
--    directly inside the EXISTS subquery, so Postgres re-evaluated the
--    auth lookup once per row. Wrapping in (select auth.uid()) lets
--    the planner hoist the call out of the row loop.
--
-- The waitlist_anon_insert policy intentionally keeps WITH CHECK (true)
-- — the public /request-access form must be unauthenticated. Rate
-- limiting (hCaptcha / Turnstile) is tracked separately and lands
-- before public launch.

CREATE INDEX IF NOT EXISTS calibration_history_changed_by_idx
  ON public.calibration_history (changed_by);

CREATE INDEX IF NOT EXISTS calibration_history_feedback_id_idx
  ON public.calibration_history (feedback_id);

CREATE INDEX IF NOT EXISTS calibration_history_organization_id_idx
  ON public.calibration_history (organization_id);

CREATE INDEX IF NOT EXISTS waitlist_reviewed_by_idx
  ON public.waitlist (reviewed_by);

DROP POLICY IF EXISTS waitlist_founder_select ON public.waitlist;
CREATE POLICY waitlist_founder_select
  ON public.waitlist
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = (select auth.uid()) AND u.is_founder = true
    )
  );

DROP POLICY IF EXISTS waitlist_founder_update ON public.waitlist;
CREATE POLICY waitlist_founder_update
  ON public.waitlist
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = (select auth.uid()) AND u.is_founder = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = (select auth.uid()) AND u.is_founder = true
    )
  );
