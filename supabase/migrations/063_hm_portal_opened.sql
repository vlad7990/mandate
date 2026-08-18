-- 063: the trail entry 053 declared and could not write.
--
-- `hm_portal_opened` has been in the activity vocabulary and the CHECK
-- since 053, and has never been written: the portal is the token path
-- with no session, so `record_activity_event` finds `auth.uid()` null
-- and returns without writing (§5b). This is the definer entry point
-- that section said it needed, along the lines of `verify_hm_token`.
--
-- Decisions:
-- - **The token is the credential.** The function takes the portal token,
--   re-validates it (exists, not revoked, not expired) and derives the
--   org and project from the row — it trusts nothing else from the
--   caller. An invalid token writes nothing and returns false.
-- - **Debounced to one event per token per hour.** A hiring manager
--   refreshing the page five times is one visit, and a trail that
--   records non-events is one nobody scrolls (§5b). The debounce reads
--   the trail itself, so it needs no new column.
-- - **`detail` carries the token's label and id** — "who we sent it to",
--   the same label the share card shows — because the actor columns are
--   NULL by construction here and the label is the only honest answer to
--   "who opened it".
-- - **EXECUTE revoked from everyone.** The only caller is the portal
--   page, which runs on the service role (it must — it reads the slate
--   across RLS after verifying the token). service_role bypasses grants,
--   so no grant is needed, no anon surface is added, and the advisor
--   residue stays at seven.

CREATE OR REPLACE FUNCTION public.record_hm_portal_opened(p_token uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tok record;
BEGIN
  SELECT id, project_id, organization_id, label
    INTO v_tok
  FROM public.hiring_manager_tokens
  WHERE token = p_token
    AND revoked_at IS NULL
    AND expires_at > now();
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- One event per token per hour: a refresh is not a second visit.
  IF EXISTS (
    SELECT 1 FROM public.activity_events
    WHERE event_type = 'hm_portal_opened'
      AND detail->>'token_id' = v_tok.id::text
      AND created_at > now() - interval '1 hour'
  ) THEN
    RETURN false;
  END IF;

  PERFORM public.write_activity_event(
    p_organization_id => v_tok.organization_id,
    p_event_type      => 'hm_portal_opened',
    p_visibility      => 'org',
    p_project_id      => v_tok.project_id,
    p_candidate_id    => NULL,
    p_client_id       => NULL,
    p_placement_id    => NULL,
    p_target_user_id  => NULL,
    p_detail          => jsonb_build_object(
                           'label', v_tok.label,
                           'token_id', v_tok.id));
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.record_hm_portal_opened(uuid) FROM public, anon, authenticated;
