-- Search Intelligence — atomic promotion of staged sourcing results.
--
-- Design: docs/superpowers/specs/2026-08-12-sourcing-runs-design.md
--
-- Promoting one staged row is THREE writes: a candidates row, a
-- sourcing_run_candidates attribution link, and the run's imported_count. From
-- the client those are three round trips with no transaction around them —
-- PostgREST has none — so a promote that fails halfway leaves a candidate with
-- no attribution link. That candidate is invisible to every conversion number
-- the product later reports, and nothing about it looks wrong. Hence one RPC.
--
-- SECURITY INVOKER (the default, stated here because it is load-bearing): the
-- function runs as the caller, so RLS on candidates / sourcing_runs /
-- sourcing_run_results / sourcing_run_candidates still scopes every row it
-- touches to the caller's organization. A SECURITY DEFINER version of this
-- would be a cross-org write primitive.
--
-- What it deliberately does NOT do:
--
--   * It does not set subject_notified_at. Notification is a real-world act.
--     Stamping it here would record that a GDPR Art. 14 obligation had been
--     discharged when nobody had been told anything.
--   * It does not mark the run executed. Execution is stamped when results are
--     staged, because result_count describes what the search returned — and a
--     run that yields nothing worth promoting is still a run that executed, and
--     an informative one.
--   * It does not merge. A name-only dedupe match is `ambiguous`, and the
--     recruiter resolves it by passing an explicit link/create decision.

-- ---------------------------------------------------------------------------
-- 0. executed_at must be wall-clock, not transaction time.
--
--    041 stamped executed_at with now(), which is transaction_timestamp() and
--    therefore identical for every run executed inside one transaction. The
--    attribution view orders by (executed_at ASC, id ASC), so with equal
--    timestamps first-touch collapses to a comparison of two random UUIDs —
--    it credits whichever run happens to sort first, not the earlier one.
--
--    In production each execution is its own request, so this rarely bit; but
--    invariant test (9) in sourcing_run_invariants.sql executes two runs in one
--    transaction and asserts the earlier one wins, which made that test a coin
--    flip that has been reporting a guarantee it never checked. clock_timestamp()
--    advances within a transaction and is the more accurate reading of "when was
--    this run executed" regardless.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.mark_sourcing_run_executed(
  p_run_id       uuid,
  p_result_count integer
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_actor  uuid := auth.uid();
  v_target uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required to execute a sourcing run.'
      USING ERRCODE = 'P0001';
  END IF;

  PERFORM set_config('mandate.allow_sourcing_run_transition', 'on', true);

  SELECT sr.id INTO v_target
    FROM public.sourcing_runs AS sr
   WHERE sr.id = p_run_id
     AND sr.status = 'draft'
   FOR UPDATE;

  IF v_target IS NULL THEN
    RAISE EXCEPTION 'Sourcing run % could not be executed (not found, not accessible, or not a draft).', p_run_id
      USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.sourcing_runs AS sr
     SET status = 'executed',
         executed_at = clock_timestamp(),
         executed_by = v_actor,
         result_count = GREATEST(COALESCE(p_result_count, 0), 0),
         updated_at = now()
   WHERE sr.id = p_run_id;

  PERFORM set_config('mandate.allow_sourcing_run_transition', '', true);
END;
$$;

-- ---------------------------------------------------------------------------
-- 1. promote_sourcing_results
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.promote_sourcing_results(
  p_run_id    uuid,
  -- [{"result_id": uuid, "action": "create" | "link", "candidate_id": uuid|null}]
  p_decisions jsonb
)
RETURNS TABLE (created_count integer, linked_count integer, imported_count integer)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_actor        uuid := auth.uid();
  v_run          public.sourcing_runs%ROWTYPE;
  v_decision     jsonb;
  v_result_id    uuid;
  v_action       text;
  v_candidate_id uuid;
  v_staged       public.sourcing_run_results%ROWTYPE;
  v_created      integer := 0;
  v_linked       integer := 0;
  v_imported     integer;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required to promote sourcing results.'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_decisions IS NULL OR jsonb_typeof(p_decisions) <> 'array' THEN
    RAISE EXCEPTION 'Promotion decisions must be a JSON array.'
      USING ERRCODE = 'P0001';
  END IF;

  -- Lock the run for the whole promotion so two recruiters promoting from the
  -- same review table cannot both recompute imported_count from a stale count.
  SELECT * INTO v_run
    FROM public.sourcing_runs AS sr
   WHERE sr.id = p_run_id
   FOR UPDATE;

  IF v_run.id IS NULL THEN
    RAISE EXCEPTION 'Sourcing run % not found (or not accessible).', p_run_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Only an executed run may attribute. The attribution view ignores drafts, so
  -- promoting into one would create candidates that no strategy ever claims.
  IF v_run.status <> 'executed' THEN
    RAISE EXCEPTION 'Sourcing run % is % — results can only be promoted from an executed run.', p_run_id, v_run.status
      USING ERRCODE = 'P0001';
  END IF;

  FOR v_decision IN SELECT * FROM jsonb_array_elements(p_decisions)
  LOOP
    v_result_id  := NULLIF(v_decision->>'result_id', '')::uuid;
    v_action     := COALESCE(v_decision->>'action', '');
    v_candidate_id := NULLIF(v_decision->>'candidate_id', '')::uuid;

    IF v_result_id IS NULL THEN
      RAISE EXCEPTION 'Promotion decision is missing result_id.'
        USING ERRCODE = 'P0001';
    END IF;
    IF v_action NOT IN ('create', 'link') THEN
      RAISE EXCEPTION 'Unknown promotion action "%" for staged result %.', v_action, v_result_id
        USING ERRCODE = 'P0001';
    END IF;

    SELECT * INTO v_staged
      FROM public.sourcing_run_results AS srr
     WHERE srr.id = v_result_id
       AND srr.run_id = p_run_id
     FOR UPDATE;

    IF v_staged.id IS NULL THEN
      RAISE EXCEPTION 'Staged result % does not belong to sourcing run % (or is not accessible).', v_result_id, p_run_id
        USING ERRCODE = 'P0002';
    END IF;

    -- Re-promotion would create a second candidates row for the same person and
    -- double-count the yield. The review table filters promoted rows out; this
    -- is the guarantee behind that.
    IF v_staged.promoted_candidate_id IS NOT NULL THEN
      RAISE EXCEPTION 'Staged result % has already been promoted.', v_result_id
        USING ERRCODE = 'P0001';
    END IF;

    IF v_action = 'link' THEN
      IF v_candidate_id IS NULL THEN
        RAISE EXCEPTION 'Linking staged result % requires a candidate_id.', v_result_id
          USING ERRCODE = 'P0001';
      END IF;

      PERFORM 1
        FROM public.candidates AS c
       WHERE c.id = v_candidate_id
         AND c.project_id = v_run.project_id
         AND c.organization_id = v_run.organization_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Candidate % is not in this run''s project.', v_candidate_id
          USING ERRCODE = 'P0002';
      END IF;

      v_linked := v_linked + 1;
    ELSE
      INSERT INTO public.candidates (
        organization_id, project_id, full_name, current_title, current_company,
        location, email, linkedin_url,
        source_kind, source_platform, source_url, sourced_at
      )
      VALUES (
        v_run.organization_id, v_run.project_id, v_staged.full_name,
        v_staged.current_title, v_staged.current_company, v_staged.location,
        v_staged.email,
        -- Only a LinkedIn profile URL lands in linkedin_url: identityKey reads
        -- that column, and filing a GitHub or company-bio URL there would make
        -- the same person look like two on the next import.
        CASE WHEN v_staged.profile_url ILIKE '%linkedin.com%'
             THEN v_staged.profile_url END,
        'sourced', v_staged.source_platform, v_staged.profile_url, now()
      )
      RETURNING id INTO v_candidate_id;

      v_created := v_created + 1;
    END IF;

    -- Every appearance is recorded. ON CONFLICT because the same candidate can
    -- legitimately be surfaced by several rows of one import; the link is the
    -- fact, and it is already true.
    INSERT INTO public.sourcing_run_candidates (run_id, candidate_id, organization_id)
    VALUES (p_run_id, v_candidate_id, v_run.organization_id)
    ON CONFLICT (run_id, candidate_id) DO NOTHING;

    UPDATE public.sourcing_run_results AS srr
       SET promoted_candidate_id = v_candidate_id,
           promoted_at = now(),
           promoted_by = v_actor
     WHERE srr.id = v_result_id;
  END LOOP;

  -- Recomputed rather than incremented, so a partially-promoted run that is
  -- resumed later converges on the truth instead of drifting.
  SELECT count(*) INTO v_imported
    FROM public.sourcing_run_candidates AS src
   WHERE src.run_id = p_run_id;

  UPDATE public.sourcing_runs AS sr
     SET imported_count = v_imported,
         updated_at = now()
   WHERE sr.id = p_run_id;

  RETURN QUERY SELECT v_created, v_linked, v_imported;
END;
$$;

REVOKE ALL ON FUNCTION public.promote_sourcing_results(uuid, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.promote_sourcing_results(uuid, jsonb)
  TO authenticated, service_role;
