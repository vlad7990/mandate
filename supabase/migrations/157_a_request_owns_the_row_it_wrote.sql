-- §209 — WHAT A MERGE MOVED
--
-- Gate: docs/superpowers/specs/2026-09-29-what-a-merge-moved-gate.md
-- Rulings: D1, D2, D3 as recommended. D4 RELAX THE INDEX (the founder's
-- call, against the gate's own recommendation) — several open erasure
-- requests may stand against ONE PERSON; still only one per IDENTITY.
--
-- Three things, one cause. §208 gave the ledger lineage for COPIES
-- (`carried_from`) and nothing for MOVES. A merge MOVES the discarded
-- person's reasons onto the survivor, and records nowhere that they moved.
-- Downstream of that:
--
--   · The erasure request never learned which ledger row it wrote —
--     `record_network_suppression` RETURNS the id and the caller used it as
--     a truthiness test. So the decline re-found the row by
--     (profile, source='erasure', earliest unlifted): a FINGERPRINT, under a
--     comment claiming lineage. It picks the right row only while a profile
--     never holds two erasure rows, and a merge is exactly what makes it
--     hold two. Declining the second then lifted the FIRST — a suppression
--     nobody declined — and per §208 D2 that lift TRAVELS to every copy of
--     the wrongly-chosen row.
--
--   · Two people who had each asked to be forgotten COULD NOT BE MERGED.
--     The repoint below collided with the partial unique index and aborted
--     the whole merge on a duplicate key. Proven live before this migration
--     was written.
--
-- D1 binds a request to its row, which makes the decline exact and makes
-- D4's relaxation safe: with several open requests on one person, "which
-- row is this request's?" has an answer stored rather than inferred.
--
-- No new event type (CHECK untouched), no new app-recordable intent (door
-- count untouched), no new anon-executable function, no new grant.

-- ---------------------------------------------------------------------------
-- 1. D4 — one open request per IDENTITY, not per person
-- ---------------------------------------------------------------------------
--
-- The old index keyed on COALESCE(network_profile_id::text, identity_key),
-- so two requests naming one person collided — which is what a merge
-- produces the instant it repoints the second one. Keying on the identity
-- alone keeps the portal's real guard (the same link cannot file twice: a
-- token's key is frozen at issue) and lets two identities that turn out to
-- be one human both stand open.
--
-- `candidate_erasure_open()` is an EXISTS over four ORed arms, so more open
-- requests can only make it answer TRUE more readily — the fail-closed
-- direction. The ops queue and the settings card list requests, never
-- assuming one per person.

DROP INDEX IF EXISTS public.candidate_erasure_requests_open_idx;

CREATE UNIQUE INDEX IF NOT EXISTS candidate_erasure_requests_open_key_idx
  ON public.candidate_erasure_requests (organization_id, identity_key)
  WHERE status = 'open';

COMMENT ON INDEX public.candidate_erasure_requests_open_key_idx IS
  '§209 D4 — one open erasure request per IDENTITY. It used to be one per PERSON, which meant two people who had each asked to be forgotten could not be merged at all: the merge repoints every request to the survivor, and the second repoint was a duplicate key that aborted the merge whole. Several open requests may now stand against one person; candidate_erasure_requests.suppression_id is what keeps each one answerable.';

-- ---------------------------------------------------------------------------
-- 2. D1 — a request owns the row it wrote
-- ---------------------------------------------------------------------------

ALTER TABLE public.candidate_erasure_requests
  ADD COLUMN IF NOT EXISTS suppression_id uuid
    REFERENCES public.network_suppressions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS candidate_erasure_requests_suppression_idx
  ON public.candidate_erasure_requests (suppression_id);

COMMENT ON COLUMN public.candidate_erasure_requests.suppression_id IS
  '§209 D1 — the network_suppressions row 098''s immediate suppression wrote when this request was filed, or NULL when the request suppressed nobody (no resolvable person) or predates this slice ambiguously. A not_subject decline lifts THIS row and no other. ON DELETE SET NULL because the ledger row outranks the pointer: a request that can no longer name its row must lift nothing rather than guess, which is the whole defect this column closes.';

-- ---------------------------------------------------------------------------
-- 3. D2 — the ledger records a MOVE as it records a copy
-- ---------------------------------------------------------------------------
--
-- No FK on `moved_from_profile`: the profile it names is DELETED moments
-- later by the merge that set it. The label is a snapshot for the same
-- reason — §158's frozen-row shape, one level down.

ALTER TABLE public.network_suppressions
  ADD COLUMN IF NOT EXISTS moved_from_profile uuid,
  ADD COLUMN IF NOT EXISTS moved_from_label   text,
  ADD COLUMN IF NOT EXISTS moved_at           timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.network_suppressions'::regclass
       AND conname  = 'move_is_complete'
  ) THEN
    ALTER TABLE public.network_suppressions
      ADD CONSTRAINT move_is_complete CHECK (
        (moved_at IS NULL) = (moved_from_profile IS NULL)
      );
  END IF;
END $$;

COMMENT ON COLUMN public.network_suppressions.moved_from_profile IS
  '§209 D2 — the person this reason was filed against before a merge moved it here, or NULL if it has always been this person''s. A MOVE IS NOT A COPY: `carried_from` is what a lift follows, and this column never widens a lift by one person. No FK — the profile it names is deleted by the same merge that stamps it.';

-- ---------------------------------------------------------------------------
-- 4. Filing binds the row it wrote (D1)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.candidate_portal_request_erasure(
  p_token uuid, p_note text DEFAULT NULL::text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tok     public.candidate_portal_tokens%ROWTYPE;
  v_profile uuid;
  v_covered uuid[];
  v_request uuid;
  v_sup     uuid;
BEGIN
  v_tok := public.candidate_portal_token_row(p_token);

  -- Who is this, as a person? The profile that literally keys this way,
  -- else the person §203's alias says this key now belongs to.
  SELECT np.id INTO v_profile
    FROM public.network_profiles np
   WHERE np.organization_id = v_tok.organization_id
     AND np.identity_key = v_tok.identity_key;
  IF v_profile IS NULL THEN
    SELECT a.profile_id INTO v_profile
      FROM public.network_profile_aliases a
     WHERE a.organization_id = v_tok.organization_id
       AND a.identity_key = v_tok.identity_key;
  END IF;

  -- What did the ask cover? Every row that is this person right now, plus
  -- every row that still computes this key (a CV mid-parse has no person).
  SELECT coalesce(array_agg(c.id), '{}'::uuid[]) INTO v_covered
    FROM public.candidates c
   WHERE c.organization_id = v_tok.organization_id
     AND (
       (v_profile IS NOT NULL AND c.network_profile_id = v_profile)
       OR public.candidate_identity_key(
            c.email, c.linkedin_url, c.full_name, c.current_company)
          = v_tok.identity_key
     );

  BEGIN
    INSERT INTO public.candidate_erasure_requests
      (organization_id, identity_key, network_profile_id, covered_candidate_ids,
       requested_via_token, requester_label, note)
    VALUES (v_tok.organization_id, v_tok.identity_key, v_profile, v_covered,
            v_tok.id, v_tok.recipient_label,
            nullif(btrim(coalesce(p_note, '')), ''))
    RETURNING id INTO v_request;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'your erasure request is already with the team'
      USING ERRCODE = 'check_violation';
  END;

  -- 098: an open erasure request suppresses the person immediately — the
  -- workflow sets DNC, not a checkbox (spec §7.1). §207: aimed at the person
  -- resolved above. §208: recorded as a LEDGER ROW, so it stands beside any
  -- other reason instead of overwriting one.
  --
  -- §209 D1: and the request KEEPS THE ROW'S ID. This return value was
  -- discarded, so the decline had to re-find the row by (profile, source)
  -- and picked the wrong one whenever a merge had put two erasure rows on
  -- one person. Binding it is the whole fix; everything else here is
  -- unchanged.
  IF v_profile IS NOT NULL THEN
    v_sup := public.record_network_suppression(
               v_profile, 'erasure requested via their portal', 'erasure');

    IF v_sup IS NOT NULL THEN
      UPDATE public.candidate_erasure_requests
         SET suppression_id = v_sup
       WHERE id = v_request;

      PERFORM public.write_activity_event(
        p_organization_id => v_tok.organization_id,
        p_event_type      => 'network_dnc_set',
        p_visibility      => 'org',
        p_detail          => jsonb_build_object(
                               'person', v_tok.recipient_label,
                               'reason', 'erasure requested via their portal',
                               'source', 'erasure'));
    END IF;
  END IF;

  PERFORM public.write_activity_event(
    p_organization_id => v_tok.organization_id,
    p_event_type      => 'candidate_erasure_requested',
    p_visibility      => 'org',
    p_detail          => jsonb_build_object('person', v_tok.recipient_label));
END;
$$;

REVOKE ALL ON FUNCTION public.candidate_portal_request_erasure(uuid, text)
  FROM public, authenticated;
GRANT EXECUTE ON FUNCTION public.candidate_portal_request_erasure(uuid, text)
  TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. D2 — the move stamps ITSELF
-- ---------------------------------------------------------------------------
--
-- A trigger rather than a line in merge_network_profiles, for the reason
-- §208 made refresh_network_suppression one: the record of a move must not
-- be something a future writer can forget. "This row's profile_id changed"
-- IS the move, wherever it is written from, so that is where it is caught.
-- merge_network_profiles is not touched by this slice at all.
--
-- The label is read from the profile being left, which still exists at this
-- moment — the merge deletes it further down. If it cannot be read the
-- column stays NULL, which is an honest absence; the card renders the move
-- without a name rather than inventing one (§175).

CREATE OR REPLACE FUNCTION public.network_suppressions_stamp_move()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_label text;
BEGIN
  -- Branch on the ROW, never on FOUND: a SELECT INTO below would set FOUND
  -- for whatever ran last, and this condition must depend only on the two
  -- profile ids in hand (the trap migration 156 was written to fix).
  IF NEW.profile_id IS DISTINCT FROM OLD.profile_id
     AND NEW.moved_from_profile IS NULL THEN
    SELECT p.display_name INTO v_label
      FROM public.network_profiles p
     WHERE p.id = OLD.profile_id;

    NEW.moved_from_profile := OLD.profile_id;
    NEW.moved_from_label   := v_label;
    NEW.moved_at           := now();
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.network_suppressions_stamp_move()
  FROM public, anon, authenticated;

COMMENT ON FUNCTION public.network_suppressions_stamp_move() IS
  '§209 D2 — stamps a suppression with the person it was moved off, the first time it moves. `moved_from_profile IS NULL` guards it so a merge of a merge keeps naming the person the reason ORIGINALLY belonged to rather than the most recent waypoint. `carried_from` is never touched: a move is not a copy, and a lift still travels only along copies.';

DROP TRIGGER IF EXISTS network_suppressions_stamp_move ON public.network_suppressions;
CREATE TRIGGER network_suppressions_stamp_move
  BEFORE UPDATE OF profile_id ON public.network_suppressions
  FOR EACH ROW EXECUTE FUNCTION public.network_suppressions_stamp_move();

-- ---------------------------------------------------------------------------
-- 6. The backfill, and what it will not guess (D1)
-- ---------------------------------------------------------------------------
--
-- Bind an OPEN request to its row ONLY where the person holds exactly one
-- unlifted erasure row — then it is not an inference, it is the only
-- candidate. Where a profile holds none or several, the binding is
-- unknowable (the return value was discarded at the time), so it stays NULL
-- and the decline will say so rather than lift the wrong person's
-- suppression. Same call §208 D4 made about `carried_from`, for the same
-- reason: the overwrite already happened, and guessing is worse than saying
-- "not recorded".

UPDATE public.candidate_erasure_requests r
   SET suppression_id = s.id
  FROM public.network_suppressions s
 WHERE r.status = 'open'
   AND r.suppression_id IS NULL
   AND r.network_profile_id IS NOT NULL
   AND s.profile_id = r.network_profile_id
   AND s.source = 'erasure'
   AND s.lifted_at IS NULL
   AND 1 = (SELECT count(*) FROM public.network_suppressions s2
             WHERE s2.profile_id = r.network_profile_id
               AND s2.source = 'erasure'
               AND s2.lifted_at IS NULL);
