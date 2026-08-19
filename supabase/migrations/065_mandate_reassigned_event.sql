-- `mandate_reassigned` joins the activity vocabulary.
--
-- The D3 action of the Recruiting Manager persona: a manager moving a
-- mandate between recruiters is exactly the kind of change §5b's trail
-- exists to witness — who moved it, from whom, to whom. The detail payload
-- carries `from_user_id`, `to_user_id` and both labels, written at the
-- moment of the change so the trail survives later renames and departures,
-- the same reasoning as `actor_label`.
--
-- Two allowlists move together, as 053 requires: the table CHECK and the
-- IN (...) inside `record_activity_event` (the app's only entry point,
-- which refuses anything outside its subset so the intent API cannot
-- fabricate money or member entries).

ALTER TABLE public.activity_events
  DROP CONSTRAINT IF EXISTS activity_events_type_known;

ALTER TABLE public.activity_events
  ADD CONSTRAINT activity_events_type_known
  CHECK (event_type IN (
    'placement_recorded', 'placement_status_changed',
    'placement_signoff_changed', 'placement_deleted',
    'fee_recorded', 'fee_updated', 'fee_line_earned', 'fee_line_cancelled',
    'fee_reversed', 'fee_terms_created', 'fee_terms_updated',
    'fee_terms_deleted',
    'client_contact_added', 'client_contact_updated', 'client_contact_removed',
    'member_role_changed', 'member_status_changed', 'member_founder_changed',
    'shortlist_published', 'report_exported', 'hm_portal_opened',
    'mandate_reassigned'
  ));

CREATE OR REPLACE FUNCTION public.record_activity_event(
  p_event_type text,
  p_project_id uuid DEFAULT NULL::uuid,
  p_candidate_id uuid DEFAULT NULL::uuid,
  p_client_id uuid DEFAULT NULL::uuid,
  p_detail jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_org uuid := (SELECT public.current_user_org_id());
BEGIN
  IF p_event_type NOT IN ('shortlist_published', 'report_exported',
                          'hm_portal_opened', 'mandate_reassigned') THEN
    RAISE EXCEPTION 'record_activity_event: % is not an app-recordable event', p_event_type;
  END IF;

  IF v_org IS NULL OR (SELECT public.can_read_org()) IS NOT TRUE THEN
    RETURN;
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
$function$;
