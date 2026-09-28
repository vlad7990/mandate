-- §208 — SUPPRESSION BECOMES A LEDGER, AND A LIFT TRAVELS
--
-- Gate: docs/superpowers/specs/2026-09-28-how-far-a-lift-travels-gate.md
-- (CONFIRMED, five rulings, all recommendations taken).
--
-- ## The defect this exists for
--
-- §207's drive left a residue — a `not_subject` decline lifted the request's
-- own person but not the person slice one had carried the suppression to.
-- Researching that found the real fault underneath: both carries (§203's
-- merge, §207's repoint) implement "the earlier suppression wins" by
-- OVERWRITING the destination's whole dnc quadruple.
--
--   B asks a recruiter to stop contacting them in March.
--   In April a merge brings in A, suppressed in January by an erasure.
--   A's record is earlier, so it wins — and B's own reason, date and
--   recruiter are GONE. The product can no longer say why B is suppressed;
--   it says why A was.
--
-- A person can only hold one suppression at a time, and the second one
-- destroys the first. That is why "how far does a lift travel" could not be
-- answered on its own: travelling a lift over that model would un-suppress
-- somebody who had asked for themselves an hour earlier.
--
-- ## The model (D1)
--
-- `network_suppressions` — one row per REASON per person, each with who,
-- when, why, which act, and the row it was carried from. Nothing is ever
-- overwritten and nothing is ever deleted; a row is LIFTED.
--
-- `network_profiles.dnc` and its three companions stay exactly where they
-- are, as DERIVED columns recomputed from the governing (earliest unlifted)
-- row. A dozen files read that column — the send ladder, the Network badge,
-- the relationship card, four agent context builders, the profile resolver —
-- and not one of them changes. `guard_network_dnc` still refuses every hand
-- that tries to write them directly; the refresh below opens its door the
-- way every other legitimate writer does.
--
-- ## The lift (D2)
--
-- A lift travels ONLY along recorded lineage, ONLY downwards (a copy never
-- reaches back to the original — that is somebody else's answer), and never
-- silently: `network_suppression_reach` lets a caller show who else will be
-- affected BEFORE the act, and every affected person gets their own
-- `network_dnc_cleared`.
--
-- No new event type (CHECK untouched), no new app-recordable intent (the
-- door count is untouched), no new anon-executable function.

-- ---------------------------------------------------------------------------
-- 1. The ledger
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.network_suppressions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  profile_id      uuid NOT NULL REFERENCES public.network_profiles(id) ON DELETE CASCADE,
  reason          text NOT NULL,
  -- Which act put it here. 'carried' is a copy of another row, and
  -- `carried_from` says which.
  source          text NOT NULL CHECK (source IN ('recruiter', 'withdrawal', 'erasure', 'carried')),
  set_at          timestamptz NOT NULL DEFAULT now(),
  set_by          uuid REFERENCES public.users(id),
  carried_from    uuid REFERENCES public.network_suppressions(id) ON DELETE SET NULL,
  lifted_at       timestamptz,
  lifted_by       uuid REFERENCES public.users(id),
  lift_reason     text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  -- A lift is a founder act with a recorded reason, or it has not happened.
  CONSTRAINT lift_is_complete CHECK (
    (lifted_at IS NULL) = (lifted_by IS NULL AND lift_reason IS NULL)
  ),
  CONSTRAINT carried_rows_say_from_where CHECK (
    (source = 'carried') = (carried_from IS NOT NULL) OR carried_from IS NULL
  )
);

COMMENT ON TABLE public.network_suppressions IS
  '§208 — every reason a person is not to be contacted, one row each, never overwritten and never deleted. network_profiles.dnc and its three companions are DERIVED from the earliest unlifted row here (refresh_network_suppression). `carried_from` records lineage so a lift can travel exactly as far as the suppression did, and no further.';

CREATE INDEX IF NOT EXISTS network_suppressions_open_idx
  ON public.network_suppressions (profile_id) WHERE lifted_at IS NULL;
CREATE INDEX IF NOT EXISTS network_suppressions_carried_idx
  ON public.network_suppressions (carried_from);
CREATE INDEX IF NOT EXISTS network_suppressions_org_idx
  ON public.network_suppressions (organization_id);

ALTER TABLE public.network_suppressions ENABLE ROW LEVEL SECURITY;

-- The same posture the dnc columns have now: the org READS its own; every
-- write goes through a definer function, so there is no INSERT or UPDATE
-- policy to find.
DROP POLICY IF EXISTS org_network_suppressions_read ON public.network_suppressions;
CREATE POLICY org_network_suppressions_read ON public.network_suppressions
  FOR SELECT TO authenticated
  USING (organization_id = (SELECT public.current_user_org_id()));

-- ---------------------------------------------------------------------------
-- 2. The derivation — the whole reason the readers do not change
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.refresh_network_suppression(p_profile uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_gov public.network_suppressions%ROWTYPE;
BEGIN
  IF p_profile IS NULL THEN RETURN; END IF;

  -- D3 — the EARLIEST unlifted reason governs: it is the first time they
  -- said it. `id` breaks a tie so two rows stamped in the same instant
  -- cannot make the badge flicker between them.
  SELECT * INTO v_gov
    FROM public.network_suppressions s
   WHERE s.profile_id = p_profile AND s.lifted_at IS NULL
   ORDER BY s.set_at ASC, s.id ASC
   LIMIT 1;

  PERFORM set_config('mandate.allow_dnc_write', 'on', true);

  IF FOUND THEN
    UPDATE public.network_profiles p
       SET dnc = true,
           dnc_reason = v_gov.reason,
           dnc_set_at = v_gov.set_at,
           dnc_set_by = v_gov.set_by,
           relationship_state = 'do_not_contact',
           updated_at = now()
     WHERE p.id = p_profile
       AND (p.dnc IS DISTINCT FROM true
            OR p.dnc_reason IS DISTINCT FROM v_gov.reason
            OR p.dnc_set_at IS DISTINCT FROM v_gov.set_at
            OR p.dnc_set_by IS DISTINCT FROM v_gov.set_by
            OR p.relationship_state IS DISTINCT FROM 'do_not_contact');
  ELSE
    -- Nothing stands. 098's clear did exactly this, including leaving a
    -- relationship state that was never do_not_contact alone.
    UPDATE public.network_profiles p
       SET dnc = false,
           dnc_reason = NULL,
           dnc_set_at = NULL,
           dnc_set_by = NULL,
           relationship_state = CASE WHEN p.relationship_state = 'do_not_contact'
                                     THEN 'cold' ELSE p.relationship_state END,
           updated_at = now()
     WHERE p.id = p_profile AND p.dnc;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_network_suppression(uuid)
  FROM public, anon, authenticated;

-- Every write to the ledger refreshes the person it is about. A trigger
-- rather than a call at each site: the derivation must not be something a
-- future writer can forget.
CREATE OR REPLACE FUNCTION public.network_suppressions_refresh()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.profile_id IS DISTINCT FROM NEW.profile_id THEN
    PERFORM public.refresh_network_suppression(OLD.profile_id);
  END IF;
  PERFORM public.refresh_network_suppression(
    CASE WHEN TG_OP = 'DELETE' THEN OLD.profile_id ELSE NEW.profile_id END);
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.network_suppressions_refresh()
  FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS network_suppressions_refresh ON public.network_suppressions;
CREATE TRIGGER network_suppressions_refresh
  AFTER INSERT OR UPDATE OR DELETE ON public.network_suppressions
  FOR EACH ROW EXECUTE FUNCTION public.network_suppressions_refresh();

-- ---------------------------------------------------------------------------
-- 3. Recording a suppression
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.record_network_suppression(
  p_profile uuid,
  p_reason  text,
  p_source  text,
  p_set_by  uuid DEFAULT NULL,
  p_set_at  timestamptz DEFAULT NULL,
  p_carried_from uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org uuid;
  v_id  uuid;
BEGIN
  IF p_profile IS NULL THEN RETURN NULL; END IF;
  SELECT organization_id INTO v_org FROM public.network_profiles WHERE id = p_profile;
  IF v_org IS NULL THEN RETURN NULL; END IF;

  -- A carry is idempotent: the same origin never lands twice on one person,
  -- so re-running a repoint cannot stack copies.
  IF p_carried_from IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.network_suppressions s
     WHERE s.profile_id = p_profile AND s.carried_from = p_carried_from
       AND s.lifted_at IS NULL
  ) THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.network_suppressions
    (organization_id, profile_id, reason, source, set_at, set_by, carried_from)
  VALUES (v_org, p_profile, btrim(p_reason), p_source,
          coalesce(p_set_at, now()), p_set_by, p_carried_from)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_network_suppression(uuid, text, text, uuid, timestamptz, uuid)
  FROM public, anon, authenticated;

/** The governing row for a person, or NULL. */
CREATE OR REPLACE FUNCTION public.governing_network_suppression(p_profile uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT s.id FROM public.network_suppressions s
   WHERE s.profile_id = p_profile AND s.lifted_at IS NULL
   ORDER BY s.set_at ASC, s.id ASC
   LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.governing_network_suppression(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.governing_network_suppression(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. The reach of a lift, before it happens (D2)
-- ---------------------------------------------------------------------------
--
-- "Never silently" is this function's whole job: a caller asks who else a
-- lift would touch, shows those names, and only then acts.

CREATE OR REPLACE FUNCTION public.network_suppression_reach(p_suppression uuid)
RETURNS TABLE (suppression_id uuid, profile_id uuid, display_name text, is_origin boolean)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  WITH RECURSIVE tree AS (
    SELECT s.id, s.profile_id, s.carried_from
      FROM public.network_suppressions s
     WHERE s.id = p_suppression AND s.lifted_at IS NULL
    UNION ALL
    -- DOWNWARDS only: a copy never reaches back to the original.
    SELECT c.id, c.profile_id, c.carried_from
      FROM public.network_suppressions c
      JOIN tree t ON c.carried_from = t.id
     WHERE c.lifted_at IS NULL
  )
  SELECT t.id, t.profile_id, p.display_name, (t.id = p_suppression)
    FROM tree t JOIN public.network_profiles p ON p.id = t.profile_id;
$$;

REVOKE ALL ON FUNCTION public.network_suppression_reach(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.network_suppression_reach(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Lifting
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.lift_network_suppression(
  p_suppression uuid,
  p_reason      text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org    uuid := (SELECT public.current_user_org_id());
  v_actor  uuid := (SELECT auth.uid());
  v_row    record;
  v_people jsonb := '[]'::jsonb;
  v_n      integer := 0;
BEGIN
  IF NOT (SELECT public.is_current_user_founder()) THEN
    RAISE EXCEPTION 'lift_network_suppression: only a founder-level act with a recorded reason un-sets do-not-contact'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF nullif(btrim(coalesce(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'lift_network_suppression: the un-set must record its reason'
      USING ERRCODE = 'check_violation';
  END IF;

  -- The origin and everything carried from it, in one act, each person
  -- recorded separately.
  FOR v_row IN
    SELECT r.suppression_id, r.profile_id, r.display_name
      FROM public.network_suppression_reach(p_suppression) r
      JOIN public.network_profiles p ON p.id = r.profile_id
     WHERE p.organization_id = v_org
  LOOP
    UPDATE public.network_suppressions
       SET lifted_at = now(), lifted_by = v_actor, lift_reason = btrim(p_reason)
     WHERE id = v_row.suppression_id AND lifted_at IS NULL;

    v_n := v_n + 1;
    v_people := v_people || to_jsonb(v_row.display_name);

    PERFORM public.write_activity_event(
      p_organization_id => v_org,
      p_event_type      => 'network_dnc_cleared',
      p_visibility      => 'org',
      p_detail          => jsonb_build_object(
                             'person', v_row.display_name,
                             'reason', btrim(p_reason),
                             'carried', v_row.suppression_id <> p_suppression));
  END LOOP;

  IF v_n = 0 THEN
    RAISE EXCEPTION 'lift_network_suppression: no standing suppression in your organisation matches'
      USING ERRCODE = 'no_data_found';
  END IF;

  RETURN jsonb_build_object('lifted', v_n, 'people', v_people);
END;
$$;

REVOKE ALL ON FUNCTION public.lift_network_suppression(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.lift_network_suppression(uuid, text) TO authenticated;

-- The founder's blunt instrument, kept at its old name and signature so the
-- relationship card does not change: every reason standing against this
-- person, and everything carried from them.
CREATE OR REPLACE FUNCTION public.clear_network_dnc(
  p_profile_id uuid,
  p_reason     text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org uuid := (SELECT public.current_user_org_id());
  v_id  uuid;
  v_any boolean := false;
BEGIN
  IF NOT (SELECT public.is_current_user_founder()) THEN
    RAISE EXCEPTION 'clear_network_dnc: only a founder-level act with a recorded reason un-sets do-not-contact'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF nullif(btrim(coalesce(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'clear_network_dnc: the un-set must record its reason'
      USING ERRCODE = 'check_violation';
  END IF;

  LOOP
    SELECT s.id INTO v_id
      FROM public.network_suppressions s
      JOIN public.network_profiles p ON p.id = s.profile_id
     WHERE s.profile_id = p_profile_id AND s.lifted_at IS NULL
       AND p.organization_id = v_org
     ORDER BY s.set_at ASC, s.id ASC
     LIMIT 1;
    EXIT WHEN v_id IS NULL;
    PERFORM public.lift_network_suppression(v_id, p_reason);
    v_any := true;
  END LOOP;

  IF NOT v_any THEN
    RAISE EXCEPTION 'clear_network_dnc: no suppressed profile in your organisation matches'
      USING ERRCODE = 'no_data_found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.clear_network_dnc(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.clear_network_dnc(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. D4 — the backfill, and what it cannot know
-- ---------------------------------------------------------------------------
--
-- One row per profile suppressed today, carrying its existing quadruple.
-- `carried_from` is NULL because lineage before this slice was already
-- overwritten — so PRE-EXISTING SUPPRESSIONS NEVER TRAVEL, and the ledger
-- says that rather than guessing. Production holds none of these right now;
-- the statement is here because the next database to run these migrations
-- may not.

INSERT INTO public.network_suppressions
  (organization_id, profile_id, reason, source, set_at, set_by, carried_from)
SELECT p.organization_id, p.id,
       coalesce(p.dnc_reason, 'suppressed before §208, reason not recorded'),
       CASE
         WHEN p.dnc_reason = 'erasure requested via their portal' THEN 'erasure'
         WHEN p.dnc_reason = 'candidate withdrew via their portal' THEN 'withdrawal'
         ELSE 'recruiter'
       END,
       coalesce(p.dnc_set_at, p.created_at), p.dnc_set_by, NULL
  FROM public.network_profiles p
 WHERE p.dnc
   AND NOT EXISTS (SELECT 1 FROM public.network_suppressions s
                    WHERE s.profile_id = p.id AND s.lifted_at IS NULL);
