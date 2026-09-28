-- §208 — FOUND IS NOT A VARIABLE YOU OWN
--
-- Drive 141 found this before its first scenario finished.
--
-- `refresh_network_suppression` read the governing row, then opened the DNC
-- guard's door with `PERFORM set_config(...)`, then branched on FOUND. But
-- **PERFORM SETS FOUND**: set_config returns a row, so FOUND was true even
-- when the SELECT had found nothing, and the "somebody is suppressed" branch
-- ran with an empty row — writing dnc = true with a NULL reason.
--
-- The CHECK constraint `network_profiles_dnc_recorded` refused it, loudly, on
-- the drive's first merge. Without that constraint this would have been a
-- person suppressed for no stated reason: the exact failure the whole
-- suppression programme exists to prevent, introduced by the slice that
-- exists to prevent it.
--
-- The fix is to stop trusting a global that three other statements can move:
-- the branch tests the row it actually read.

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

  -- v_gov.id, NOT FOUND: the PERFORM above resets FOUND.
  IF v_gov.id IS NOT NULL THEN
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
