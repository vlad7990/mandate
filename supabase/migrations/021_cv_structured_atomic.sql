-- Atomic JSONB single-key updates on candidates.cv_structured.
--
-- Background: the inline-edit profile UI persists individual keys
-- inside the cv_structured JSONB blob (summary, strengths,
-- development_areas, risks, domain, scale, years_experience, archetype
-- mirror, full_name mirror). The first cut implemented this as a
-- read-modify-write cycle in the server action, which races with
-- (a) other inline edits that hit the same row, and (b) the executive
-- evaluation generator which writes its result into the same JSONB
-- under the `evaluation` key. Whoever wrote last wiped the others'
-- changes silently.
--
-- Fix: a SECURITY INVOKER RPC that mutates one key per call using
-- jsonb_set / `-` operator inside a single statement. PostgreSQL's row
-- lock during UPDATE serialises concurrent calls — the second writer
-- sees the first writer's commit and applies its key on top, never
-- against a stale snapshot.
--
-- The function does NOT use SECURITY DEFINER on purpose — RLS on
-- public.candidates still applies via the caller's identity, so an
-- attacker can't reach a row their org can't already see.

CREATE OR REPLACE FUNCTION public.update_cv_structured_field(
  p_candidate_id uuid,
  p_project_id   uuid,
  p_key          text,
  p_value        jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_rows_changed integer;
BEGIN
  IF p_candidate_id IS NULL OR p_project_id IS NULL THEN
    RAISE EXCEPTION 'candidate_id and project_id are required';
  END IF;
  IF p_key IS NULL OR length(btrim(p_key)) = 0 THEN
    RAISE EXCEPTION 'key cannot be blank';
  END IF;

  -- Atomic single-statement update. NULL p_value clears the key via
  -- the `-` operator; any other JSON value (including JSON null) is
  -- written through jsonb_set with create_missing=true.
  UPDATE public.candidates
     SET cv_structured = CASE
           WHEN p_value IS NULL
             THEN COALESCE(cv_structured, '{}'::jsonb) - p_key
           ELSE jsonb_set(
             COALESCE(cv_structured, '{}'::jsonb),
             ARRAY[p_key],
             p_value,
             true
           )
         END,
         updated_at = now()
   WHERE id         = p_candidate_id
     AND project_id = p_project_id;

  GET DIAGNOSTICS v_rows_changed = ROW_COUNT;

  IF v_rows_changed = 0 THEN
    -- Either the row doesn't exist, the project_id doesn't match, or
    -- RLS blocked the row. Surface the same opaque error in all three
    -- cases so we don't leak existence-or-ownership information to
    -- callers who don't have access.
    RAISE EXCEPTION 'candidate not found or not authorised';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.update_cv_structured_field(uuid, uuid, text, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.update_cv_structured_field(uuid, uuid, text, jsonb)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.update_cv_structured_field(uuid, uuid, text, jsonb) IS
  'Atomically set or delete a single top-level key on candidates.cv_structured. NULL p_value deletes the key. RLS-bound (SECURITY INVOKER).';
