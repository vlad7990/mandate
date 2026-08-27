-- ---------------------------------------------------------------------------
-- 131 — §177 rider: the agent-recordable allowlist admits the role seam's
-- event. 29 -> 30.
--
-- FOUND BY DRIVE 118, not by any gate. §177 asserted "allowlist stays 29"
-- on a misreading: the 29 is not the count of agent PRINCIPALS, it is the
-- allowlist INSIDE record_agent_event naming which events an agent may
-- write. `calibration_rederived` was absent, so the function raised, the
-- seam caught it with captureSeamError, and the re-derivation succeeded
-- with an EMPTY TRAIL — the exact fire-and-forget failure the house
-- already has a standing lesson about. The trail was read back, which is
-- the only reason this was seen at all.
--
-- Body is otherwise byte-identical to the version 110 left behind.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.record_agent_event(
  p_event_type text,
  p_project_id uuid DEFAULT NULL::uuid,
  p_candidate_id uuid DEFAULT NULL::uuid,
  p_detail jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_org uuid;
begin
  if p_event_type not in ('feedback_interpreted', 'candidates_ranked',
                          'candidate_parsed', 'candidate_evaluated',
                          'candidate_positioned', 'candidate_researched',
                          'candidate_triangulated', 'candidate_profiled',
                          'desk_digest_generated', 'company_researched',
                          'hm_researched', 'culture_profiled',
                          'sourcing_queries_generated', 'intake_analyzed',
                          'health_suggested', 'weekly_report_generated',
                          'calibration_derived', 'job_spec_generated',
                          'shortlist_report_generated', 'copilot_answered',
                          'success_profile_generated', 'interview_plan_generated',
                          'executive_context_researched',
                          'candidate_search_answered', 'sourcing_search_executed',
                          'outreach_strategy_drafted',
                          'relationship_updated', 'engagement_updated',
                          'prescreen_updated',
                          -- 131 (§177): which role, written by the
                          -- Calibration Agent under its own session.
                          'calibration_rederived') then
    raise exception 'record_agent_event: % is not an agent-recordable event', p_event_type;
  end if;

  if not public.is_agent() then
    raise exception 'record_agent_event: only an active agent principal may record agent events'
      using errcode = 'insufficient_privilege';
  end if;

  if p_project_id is not null then
    select organization_id into v_org from public.projects where id = p_project_id;
  end if;
  if v_org is null and p_candidate_id is not null then
    select organization_id into v_org from public.candidates where id = p_candidate_id;
  end if;
  if v_org is null then
    v_org := (select public.current_user_org_id());
  end if;
  if v_org is null then
    return;
  end if;

  perform public.write_activity_event(
    p_organization_id => v_org,
    p_event_type      => p_event_type,
    p_visibility      => 'org',
    p_project_id      => p_project_id,
    p_candidate_id    => p_candidate_id,
    p_detail          => coalesce(p_detail, '{}'::jsonb)
  );
end;
$function$;

-- A new/replaced function inherits PUBLIC EXECUTE. Revoke it, or the anon
-- roster silently grows — the standing lesson from 129.
REVOKE ALL ON FUNCTION public.record_agent_event(text, uuid, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_agent_event(text, uuid, uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.record_agent_event(text, uuid, uuid, jsonb) TO authenticated;
