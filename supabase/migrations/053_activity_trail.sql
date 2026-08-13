-- The activity trail for core recruiting.
--
-- `executive_audit_events` (032, hardened in 034, extended in 037/038/039)
-- covers the Executive Intelligence module and nothing else. Everything
-- outside it — every mandate, candidate, client, shortlist and, since 050,
-- every fee — changed with no record of who changed it or when.
--
-- That was a nice-to-have while the schema held no money. 050 put money in
-- it, and "someone altered a booked fee and nobody knows" is a different
-- class of problem from "someone edited a job spec".
--
-- ## Why this is a new table and not more columns on the EI trail
--
-- Two reasons, and the second is the load-bearing one.
--
-- **Shape.** The EI trail carries one nullable FK per entity — `search_id`,
-- `profile_id`, `plan_id`, `assessment_id`, `risk_review_id` — and one CHECK
-- listing every event type in the module. That works for a bounded module
-- and does not survive being extended to the whole product.
--
-- **Visibility.** `executive_audit_events` is readable by every active
-- member of the org. An audit event about a fee *contains the fee* — the
-- amount, the percentage, the old value and the new one. Putting fee events
-- in an org-readable table would hand a viewer the entire revenue book
-- through the back door and silently undo `fees:read` a migration after it
-- was introduced. The trail therefore needs a per-row visibility tier,
-- which is not something the EI table can grow without changing what its
-- existing rows mean.
--
-- ## Three things this does better than 032/034, deliberately
--
-- 1. **There is no INSERT policy.** 034 had to add `actor_id = auth.uid()`
--    to stop a user forging another person's audit entry, but a signed-in
--    user can still POST an arbitrary `executive_audit_events` row from a
--    browser console — inventing history under their own name. Here the
--    only write paths are SECURITY DEFINER: triggers, and one RPC that
--    stamps the actor itself. `authenticated` cannot insert at all.
-- 2. **Triggers, not application code.** The EI trail is written by
--    `recordExecutiveAuditEvent`, which means an event is recorded only
--    where somebody remembered to call it, and never for a change made by a
--    hand-run statement during a fix. The rows below are written by the
--    database on the actual change, so the trail cannot drift from the data
--    and cannot be skipped by the person with the most reason to skip it.
-- 3. **The actor's name is snapshotted.** `actor_id` is
--    ON DELETE SET NULL, so a departed colleague's row going away would
--    otherwise turn every entry they ever made into "unknown". `actor_label`
--    keeps the name the trail was written with.
--
-- ## What is deliberately not decided here
--
-- Retention. Nothing prunes this table, and the right-to-erasure question
-- in the handoff is still open. What *is* decided is that erasing a subject
-- erases its events: the FKs cascade, matching migration 044's existing
-- position that erasing a candidate erases the notification evidence. If
-- that position changes, it changes in both places.
--
-- ## The one advisor warning this adds, and why it stays
--
-- `record_activity_event` is SECURITY DEFINER and executable by
-- `authenticated`, so the linter flags it exactly as it flags
-- `current_user_role()`. It has to be: it is the application's only write
-- path into the trail, and the whole point of routing writes through a
-- definer function is that `authenticated` has no INSERT policy on the
-- table. Revoking EXECUTE would leave the intent events unwritable.
--
-- What it can do is bounded: it refuses any event type outside the three
-- intent events, stamps `actor_id` from `auth.uid()` rather than taking it
-- as a parameter, and derives the organisation from
-- `current_user_org_id()`. The worst a caller can do with it is record a
-- true-shaped intent event against their own name in their own org.
--
-- Every other function here — `write_activity_event` and the five trigger
-- functions — has EXECUTE revoked from `authenticated`, which is why none
-- of them appear in the advisor output. 048 made the same call for
-- `guard_user_privilege_changes` and explains the reasoning at length.


-- ---------------------------------------------------------------------------
-- 1. The table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.activity_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  -- Null when the change had no signed-in actor — a migration, a hand-run
  -- fix, a background job. Recorded as null rather than guessed, because an
  -- audit trail that invents an actor is worse than one that admits it does
  -- not know.
  actor_id        uuid REFERENCES public.users(id) ON DELETE SET NULL,
  actor_label     text,

  event_type      text NOT NULL,

  -- What it was about. Nullable FKs rather than a polymorphic
  -- (subject_type, subject_id) pair: core recruiting has a small, bounded
  -- set of top-level entities, and real foreign keys keep the cascade and
  -- erasure semantics a text/uuid pair would throw away. The EI trail made
  -- the same call and it has held.
  project_id      uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  candidate_id    uuid REFERENCES public.candidates(id) ON DELETE CASCADE,
  client_id       uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  placement_id    uuid REFERENCES public.placements(id) ON DELETE CASCADE,
  -- The person a member event is *about*, as opposed to the actor.
  target_user_id  uuid REFERENCES public.users(id) ON DELETE SET NULL,

  -- The facts, including before/after values. Presentation is not stored:
  -- the sentence a person reads is derived in `src/lib/activity/describe.ts`
  -- so wording can improve without rewriting history.
  detail          jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Who may read this row. See §3 — this is the reason the table exists
  -- separately from the EI trail.
  visibility      text NOT NULL DEFAULT 'org'
                    CHECK (visibility IN ('org', 'fees', 'admin')),

  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT activity_events_type_known CHECK (event_type IN (
    -- Placements: the event, not the money. Visible at 'org'.
    'placement_recorded',
    'placement_status_changed',
    'placement_deleted',
    -- Money. Always 'fees'.
    'fee_recorded',
    'fee_updated',
    'fee_line_earned',
    'fee_line_cancelled',
    'fee_reversed',
    'fee_terms_created',
    'fee_terms_updated',
    'fee_terms_deleted',
    -- The role model. Always 'admin'.
    'member_role_changed',
    'member_status_changed',
    'member_founder_changed',
    -- Intent events, written by the app rather than by a trigger, because
    -- no row changes when a document leaves the building.
    'shortlist_published',
    'report_exported',
    'hm_portal_opened'
  ))
);

-- The feed's own index: one org, newest first.
CREATE INDEX IF NOT EXISTS activity_events_org_idx
  ON public.activity_events (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS activity_events_project_idx
  ON public.activity_events (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS activity_events_candidate_idx
  ON public.activity_events (candidate_id, created_at DESC);
CREATE INDEX IF NOT EXISTS activity_events_client_idx
  ON public.activity_events (client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS activity_events_placement_idx
  ON public.activity_events (placement_id, created_at DESC);
CREATE INDEX IF NOT EXISTS activity_events_actor_idx ON public.activity_events (actor_id);
CREATE INDEX IF NOT EXISTS activity_events_target_idx ON public.activity_events (target_user_id);


-- ---------------------------------------------------------------------------
-- 2. The writer
-- ---------------------------------------------------------------------------
--
-- One SECURITY DEFINER function every trigger goes through, so the actor
-- resolution and the label snapshot are written once rather than five
-- times.
--
-- It never raises. An audit write must not be able to fail the mutation it
-- describes — a fee that cannot be saved because its audit row was rejected
-- is a worse outcome than a fee saved without one, and the constraint that
-- would reject it is a bug in this file rather than a problem with the fee.
-- The same reasoning as `recordExecutiveAuditEvent` swallowing its errors,
-- except here it is enforced in the database rather than in one caller.

CREATE OR REPLACE FUNCTION public.write_activity_event(
  p_organization_id uuid,
  p_event_type      text,
  p_visibility      text DEFAULT 'org',
  p_project_id      uuid DEFAULT NULL,
  p_candidate_id    uuid DEFAULT NULL,
  p_client_id       uuid DEFAULT NULL,
  p_placement_id    uuid DEFAULT NULL,
  p_target_user_id  uuid DEFAULT NULL,
  p_detail          jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_label text;
BEGIN
  IF p_organization_id IS NULL THEN
    RETURN;   -- an event with no org cannot be read by anyone; drop it
  END IF;

  IF v_actor IS NOT NULL THEN
    SELECT coalesce(nullif(btrim(full_name), ''), email)
      INTO v_label
      FROM public.users
     WHERE id = v_actor;
  END IF;

  INSERT INTO public.activity_events (
    organization_id, actor_id, actor_label, event_type, visibility,
    project_id, candidate_id, client_id, placement_id, target_user_id, detail
  ) VALUES (
    p_organization_id, v_actor, v_label, p_event_type, p_visibility,
    p_project_id, p_candidate_id, p_client_id, p_placement_id, p_target_user_id,
    coalesce(p_detail, '{}'::jsonb)
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'activity trail: could not record % (%)', p_event_type, SQLERRM;
END;
$$;

REVOKE ALL ON FUNCTION public.write_activity_event(
  uuid, text, text, uuid, uuid, uuid, uuid, uuid, jsonb) FROM public, anon, authenticated;

-- The app-level entry point, for the events no row change can express —
-- a shortlist published, a report exported, an HM portal link opened.
--
-- Deliberately narrower than the table: it cannot write a fee or member
-- event, so the intent API cannot be used to forge a money entry. The actor
-- is stamped from `auth.uid()` inside the function and is not a parameter,
-- so a caller cannot attribute their action to somebody else — which is the
-- hole 034 had to patch on the EI trail and this one never opens.
CREATE OR REPLACE FUNCTION public.record_activity_event(
  p_event_type   text,
  p_project_id   uuid DEFAULT NULL,
  p_candidate_id uuid DEFAULT NULL,
  p_client_id    uuid DEFAULT NULL,
  p_detail       jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid := (SELECT public.current_user_org_id());
BEGIN
  IF p_event_type NOT IN ('shortlist_published', 'report_exported', 'hm_portal_opened') THEN
    RAISE EXCEPTION 'record_activity_event: % is not an app-recordable event', p_event_type;
  END IF;

  IF v_org IS NULL OR (SELECT public.can_read_org()) IS NOT TRUE THEN
    RETURN;   -- not an active member of any org; nothing to record
  END IF;

  PERFORM public.write_activity_event(
    p_organization_id => v_org,
    p_event_type      => p_event_type,
    p_visibility      => 'org',
    p_project_id      => p_project_id,
    p_candidate_id    => p_candidate_id,
    p_client_id       => p_client_id,
    p_detail          => p_detail
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_activity_event(text, uuid, uuid, uuid, jsonb)
  FROM public, anon;
GRANT EXECUTE ON FUNCTION public.record_activity_event(text, uuid, uuid, uuid, jsonb)
  TO authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 3. RLS — read only, and the fee rule carried through
-- ---------------------------------------------------------------------------
--
-- SELECT is the only policy. With RLS enabled and no INSERT, UPDATE or
-- DELETE policy, `authenticated` can do none of those — the trail is
-- append-only *and* unforgeable, and neither property depends on the
-- application behaving.
--
-- The visibility tiers mirror the capabilities exactly, so the trail can
-- never disclose more than the screen the event came from:
--
--   'org'   every active member, like the placement it describes
--   'fees'  `fees:read`, or credited on that placement — the same
--           predicate the fee tables themselves use, including the
--           own-placement exception, so a researcher sees the history of
--           their own placement's fee and nobody else's
--   'admin' org administration, because a role change is not everyone's
--           business and a viewer has no reason to watch the member list

ALTER TABLE public.activity_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS activity_events_select ON public.activity_events;
CREATE POLICY activity_events_select ON public.activity_events
  FOR SELECT TO authenticated
  USING (
    organization_id = (SELECT public.current_user_org_id())
    AND (SELECT public.can_read_org())
    AND CASE visibility
      WHEN 'org'  THEN true
      WHEN 'fees' THEN (SELECT public.can_read_fees())
                       OR (placement_id IS NOT NULL
                           AND public.is_placement_credited(placement_id))
      WHEN 'admin' THEN (SELECT public.is_org_admin())
      ELSE false
    END
  );


-- ---------------------------------------------------------------------------
-- 4. Placements — the event, at 'org'
-- ---------------------------------------------------------------------------
--
-- No amounts in `detail`. These rows are readable by every active member,
-- and the whole point of 050's table split was that the event is public
-- within the org and the money is not.

CREATE OR REPLACE FUNCTION public.audit_placements()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.write_activity_event(
      p_organization_id => NEW.organization_id,
      p_event_type      => 'placement_recorded',
      p_visibility      => 'org',
      p_project_id      => NEW.project_id,
      p_candidate_id    => NEW.candidate_id,
      p_client_id       => NEW.client_id,
      p_placement_id    => NEW.id,
      p_detail          => jsonb_build_object(
                             'status', NEW.status,
                             'offer_date', NEW.offer_date));
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Only a real transition. `updated_at` moving is not activity.
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      PERFORM public.write_activity_event(
        p_organization_id => NEW.organization_id,
        p_event_type      => 'placement_status_changed',
        p_visibility      => 'org',
        p_project_id      => NEW.project_id,
        p_candidate_id    => NEW.candidate_id,
        p_client_id       => NEW.client_id,
        p_placement_id    => NEW.id,
        p_detail          => jsonb_build_object(
                               'from', OLD.status,
                               'to', NEW.status,
                               'start_date', NEW.start_date,
                               'reason', NEW.fell_through_reason));
    END IF;
    RETURN NEW;
  END IF;

  -- DELETE: the placement row is going, so `placement_id` must not point at
  -- it — the FK would cascade this very row away. Recorded against the
  -- mandate instead, which is where someone would look for it.
  PERFORM public.write_activity_event(
    p_organization_id => OLD.organization_id,
    p_event_type      => 'placement_deleted',
    p_visibility      => 'org',
    p_project_id      => OLD.project_id,
    p_candidate_id    => OLD.candidate_id,
    p_client_id       => OLD.client_id,
    p_detail          => jsonb_build_object('status', OLD.status));
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.audit_placements() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS placements_audit ON public.placements;
CREATE TRIGGER placements_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.placements
  FOR EACH ROW EXECUTE FUNCTION public.audit_placements();


-- ---------------------------------------------------------------------------
-- 5. The money, at 'fees'
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.audit_placement_fees()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.write_activity_event(
      p_organization_id => NEW.organization_id,
      p_event_type      => 'fee_recorded',
      p_visibility      => 'fees',
      p_placement_id    => NEW.placement_id,
      p_detail          => jsonb_build_object(
                             'total', NEW.total_fee_amount,
                             'currency', NEW.currency,
                             'base_total', NEW.total_fee_base_amount,
                             'base_currency', NEW.base_currency,
                             'model', NEW.fee_model,
                             'percentage', NEW.fee_percentage,
                             'terms_source', NEW.terms_source));
    RETURN NEW;
  END IF;

  -- The three things whose change is worth a line. A `updated_at` touch or
  -- a re-saved identical fee is not activity, and a trail that records
  -- non-events is one nobody scrolls.
  IF NEW.total_fee_amount IS DISTINCT FROM OLD.total_fee_amount
     OR NEW.fee_percentage IS DISTINCT FROM OLD.fee_percentage
     OR NEW.currency       IS DISTINCT FROM OLD.currency THEN
    PERFORM public.write_activity_event(
      p_organization_id => NEW.organization_id,
      p_event_type      => 'fee_updated',
      p_visibility      => 'fees',
      p_placement_id    => NEW.placement_id,
      p_detail          => jsonb_build_object(
                             'total_from', OLD.total_fee_amount,
                             'total_to', NEW.total_fee_amount,
                             'percentage_from', OLD.fee_percentage,
                             'percentage_to', NEW.fee_percentage,
                             'currency_from', OLD.currency,
                             'currency_to', NEW.currency,
                             'currency', NEW.currency));
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.audit_placement_fees() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS placement_fees_audit ON public.placement_fees;
CREATE TRIGGER placement_fees_audit
  AFTER INSERT OR UPDATE ON public.placement_fees
  FOR EACH ROW EXECUTE FUNCTION public.audit_placement_fees();


-- The ledger.
--
-- Deliberately silent on the initial expansion: saving a retained fee
-- inserts three pending instalments at once, and three "instalment created"
-- lines under one "fee recorded" line is noise that buries the events that
-- matter. What is recorded is money actually moving — an instalment earned,
-- an instalment cancelled, and a reversal booked.

CREATE OR REPLACE FUNCTION public.audit_fee_lines()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.kind <> 'instalment' THEN
      PERFORM public.write_activity_event(
        p_organization_id => NEW.organization_id,
        p_event_type      => 'fee_reversed',
        p_visibility      => 'fees',
        p_placement_id    => NEW.placement_id,
        p_detail          => jsonb_build_object(
                               'label', NEW.label,
                               'kind', NEW.kind,
                               'amount', NEW.amount,
                               'currency', NEW.currency,
                               'base_amount', NEW.base_amount,
                               'base_currency', NEW.base_currency,
                               'earned_on', NEW.earned_on,
                               'reason', NEW.reason));
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status IN ('earned', 'cancelled') THEN
    PERFORM public.write_activity_event(
      p_organization_id => NEW.organization_id,
      p_event_type      => CASE NEW.status
                             WHEN 'earned' THEN 'fee_line_earned'
                             ELSE 'fee_line_cancelled'
                           END,
      p_visibility      => 'fees',
      p_placement_id    => NEW.placement_id,
      p_detail          => jsonb_build_object(
                             'label', NEW.label,
                             'amount', NEW.amount,
                             'currency', NEW.currency,
                             'base_amount', NEW.base_amount,
                             'base_currency', NEW.base_currency,
                             'earned_on', NEW.earned_on,
                             'due_on', NEW.due_on));
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.audit_fee_lines() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS placement_fee_lines_audit ON public.placement_fee_lines;
CREATE TRIGGER placement_fee_lines_audit
  AFTER INSERT OR UPDATE ON public.placement_fee_lines
  FOR EACH ROW EXECUTE FUNCTION public.audit_fee_lines();


-- The agreement. `client_id` is set where the terms are client-scoped so the
-- client screen can show its own commercial history.

CREATE OR REPLACE FUNCTION public.audit_fee_terms()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.fee_terms;
  v_type text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_row := OLD;
    v_type := 'fee_terms_deleted';
  ELSIF TG_OP = 'INSERT' THEN
    v_row := NEW;
    v_type := 'fee_terms_created';
  ELSE
    v_row := NEW;
    v_type := 'fee_terms_updated';
    IF NEW.fee_model      IS NOT DISTINCT FROM OLD.fee_model
       AND NEW.fee_percentage   IS NOT DISTINCT FROM OLD.fee_percentage
       AND NEW.fixed_fee_amount IS NOT DISTINCT FROM OLD.fixed_fee_amount
       AND NEW.currency         IS NOT DISTINCT FROM OLD.currency
       AND NEW.fee_basis        IS NOT DISTINCT FROM OLD.fee_basis
       AND NEW.guarantee_days   IS NOT DISTINCT FROM OLD.guarantee_days
       AND NEW.payment_terms_days IS NOT DISTINCT FROM OLD.payment_terms_days
       AND NEW.instalment_plan  IS NOT DISTINCT FROM OLD.instalment_plan THEN
      RETURN NEW;   -- nothing commercial changed
    END IF;
  END IF;

  PERFORM public.write_activity_event(
    p_organization_id => v_row.organization_id,
    p_event_type      => v_type,
    p_visibility      => 'fees',
    p_project_id      => v_row.project_id,
    p_client_id       => v_row.client_id,
    p_detail          => jsonb_build_object(
                           'model', v_row.fee_model,
                           'percentage', v_row.fee_percentage,
                           'fixed_amount', v_row.fixed_fee_amount,
                           'currency', v_row.currency,
                           'guarantee_days', v_row.guarantee_days,
                           'payment_terms_days', v_row.payment_terms_days,
                           'scope', CASE WHEN v_row.client_id IS NOT NULL
                                         THEN 'client' ELSE 'mandate' END));

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.audit_fee_terms() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS fee_terms_audit ON public.fee_terms;
CREATE TRIGGER fee_terms_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.fee_terms
  FOR EACH ROW EXECUTE FUNCTION public.audit_fee_terms();


-- ---------------------------------------------------------------------------
-- 6. The role model, at 'admin'
-- ---------------------------------------------------------------------------
--
-- 046 added a BEFORE trigger that refuses the four privilege-escalation
-- moves. This is the AFTER half: what was allowed still gets written down.
-- Between them, an attempt is refused and a change is remembered.
--
-- Three separate event types rather than one `member_updated`, because
-- "promoted to admin", "suspended" and "made a platform operator" are three
-- different things to find when reading back.

CREATE OR REPLACE FUNCTION public.audit_member_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid := coalesce(NEW.organization_id, OLD.organization_id);
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    PERFORM public.write_activity_event(
      p_organization_id => v_org,
      p_event_type      => 'member_role_changed',
      p_visibility      => 'admin',
      p_target_user_id  => NEW.id,
      p_detail          => jsonb_build_object(
                             'from', OLD.role, 'to', NEW.role,
                             'member', coalesce(nullif(btrim(NEW.full_name), ''), NEW.email)));
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.write_activity_event(
      p_organization_id => v_org,
      p_event_type      => 'member_status_changed',
      p_visibility      => 'admin',
      p_target_user_id  => NEW.id,
      p_detail          => jsonb_build_object(
                             'from', OLD.status, 'to', NEW.status,
                             'member', coalesce(nullif(btrim(NEW.full_name), ''), NEW.email)));
  END IF;

  IF NEW.is_founder IS DISTINCT FROM OLD.is_founder THEN
    PERFORM public.write_activity_event(
      p_organization_id => v_org,
      p_event_type      => 'member_founder_changed',
      p_visibility      => 'admin',
      p_target_user_id  => NEW.id,
      p_detail          => jsonb_build_object(
                             'from', OLD.is_founder, 'to', NEW.is_founder,
                             'member', coalesce(nullif(btrim(NEW.full_name), ''), NEW.email)));
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.audit_member_changes() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS users_audit ON public.users;
CREATE TRIGGER users_audit
  AFTER UPDATE OF role, status, is_founder ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.audit_member_changes();
