-- 111 — PLATFORM AGENTS (F-1 fix, §128 ruled BLOCKING by the founder 2026-08-25)
--
-- The defect: all 24 agent principals live in Mandate HQ, and every agent
-- policy was anchored `is_agent() AND organization_id = current_user_org_id()`.
-- In any other organization an agent-session write RLS-filtered to ZERO rows
-- with no error — the pipeline reported success and the product stalled
-- silently ("AI parse in flight" forever, no cv_parse_error, no retry).
--
-- The ruling: agents are the PLATFORM's workforce, not one org's members.
-- Their org anchor yields to the IDENTITY anchor — is_agent(), which carries
-- the /ops kill switch (current_user_role() resolves NULL for a suspended
-- row, so is_agent() is false within one run). Every domain-narrowing
-- conjunct (draft-only, author pins, escalation rules) is preserved verbatim.
--
-- §126 R2 gains its named SECOND legal cross-org family: agent-anchored
-- policies, ruled by the founder via the F-1 fix order. The first family
-- (founder console) is unchanged.
--
-- record_agent_event: the event's organization is now derived from the
-- SUBJECT (the project, else the candidate), falling back to the agent's own
-- org only when no subject is given — an agent acting on org X writes org
-- X's trail, under its own face, never HQ's.

-- ── The intent door ─────────────────────────────────────────────────────
create or replace function public.record_agent_event(
  p_event_type text,
  p_project_id uuid default null,
  p_candidate_id uuid default null,
  p_detail jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
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
                          'prescreen_updated') then
    raise exception 'record_agent_event: % is not an agent-recordable event', p_event_type;
  end if;

  if not public.is_agent() then
    raise exception 'record_agent_event: only an active agent principal may record agent events'
      using errcode = 'insufficient_privilege';
  end if;

  -- The subject's org, not the agent's: the trail belongs to the org the
  -- work was done FOR.
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
$$;

revoke all on function public.record_agent_event(text, uuid, uuid, jsonb) from public, anon;

-- ── The 42 agent policies, re-anchored ──────────────────────────────────

drop policy if exists boolean_queries_agent_insert on public.boolean_queries;
create policy boolean_queries_agent_insert on public.boolean_queries
  for insert to authenticated with check ((select is_agent()));

drop policy if exists boolean_queries_agent_select on public.boolean_queries;
create policy boolean_queries_agent_select on public.boolean_queries
  for select to authenticated using ((select is_agent()));

drop policy if exists calibration_history_agent_insert on public.calibration_history;
create policy calibration_history_agent_insert on public.calibration_history
  for insert to authenticated with check ((select is_agent()));

drop policy if exists candidate_notes_agent_select on public.candidate_notes;
create policy candidate_notes_agent_select on public.candidate_notes
  for select to authenticated using ((select is_agent()) and organization_id is not null);

drop policy if exists candidate_outreach_agent_select on public.candidate_outreach;
create policy candidate_outreach_agent_select on public.candidate_outreach
  for select to authenticated using ((select is_agent()));

drop policy if exists candidate_scores_agent_insert on public.candidate_scores;
create policy candidate_scores_agent_insert on public.candidate_scores
  for insert to authenticated with check ((select is_agent()));

drop policy if exists candidate_scores_agent_select on public.candidate_scores;
create policy candidate_scores_agent_select on public.candidate_scores
  for select to authenticated using ((select is_agent()));

drop policy if exists candidate_scores_agent_update on public.candidate_scores;
create policy candidate_scores_agent_update on public.candidate_scores
  for update to authenticated
  using ((select is_agent()))
  with check ((select is_agent()));

drop policy if exists candidates_agent_select on public.candidates;
create policy candidates_agent_select on public.candidates
  for select to authenticated using ((select is_agent()));

drop policy if exists candidates_agent_update on public.candidates;
create policy candidates_agent_update on public.candidates
  for update to authenticated
  using ((select is_agent()))
  with check ((select is_agent()));

drop policy if exists desk_digests_agent_insert on public.desk_digests;
create policy desk_digests_agent_insert on public.desk_digests
  for insert to authenticated
  with check ((select is_agent()) and created_by = (select auth.uid()));

drop policy if exists engagement_states_agent_insert on public.engagement_states;
create policy engagement_states_agent_insert on public.engagement_states
  for insert to authenticated with check ((select is_agent()));

drop policy if exists engagement_states_agent_select on public.engagement_states;
create policy engagement_states_agent_select on public.engagement_states
  for select to authenticated using ((select is_agent()));

drop policy if exists engagement_states_agent_update on public.engagement_states;
create policy engagement_states_agent_update on public.engagement_states
  for update to authenticated
  using ((select is_agent()) and state <> 'escalated')
  with check ((select is_agent()) and (state <> 'escalated' or escalation_reason is not null));

drop policy if exists executive_audit_events_agent_insert on public.executive_audit_events;
create policy executive_audit_events_agent_insert on public.executive_audit_events
  for insert to authenticated
  with check ((select is_agent()) and actor_id = (select auth.uid()));

drop policy if exists executive_competencies_agent_select on public.executive_competencies;
create policy executive_competencies_agent_select on public.executive_competencies
  for select to authenticated using ((select is_agent()));

drop policy if exists executive_interview_plans_agent_select on public.executive_interview_plans;
create policy executive_interview_plans_agent_select on public.executive_interview_plans
  for select to authenticated using ((select is_agent()));

drop policy if exists executive_interview_plans_agent_update on public.executive_interview_plans;
create policy executive_interview_plans_agent_update on public.executive_interview_plans
  for update to authenticated
  using ((select is_agent()) and status = 'draft')
  with check ((select is_agent()) and status = 'draft');

drop policy if exists executive_search_competencies_agent_select on public.executive_search_competencies;
create policy executive_search_competencies_agent_select on public.executive_search_competencies
  for select to authenticated using ((select is_agent()));

drop policy if exists executive_searches_agent_select on public.executive_searches;
create policy executive_searches_agent_select on public.executive_searches
  for select to authenticated using ((select is_agent()));

drop policy if exists executive_searches_agent_update on public.executive_searches;
create policy executive_searches_agent_update on public.executive_searches
  for update to authenticated
  using ((select is_agent()))
  with check ((select is_agent()));

drop policy if exists feedback_agent_select on public.feedback;
create policy feedback_agent_select on public.feedback
  for select to authenticated using ((select is_agent()));

drop policy if exists feedback_agent_update on public.feedback;
create policy feedback_agent_update on public.feedback
  for update to authenticated
  using ((select is_agent()))
  with check ((select is_agent()));

drop policy if exists job_specs_agent_select on public.job_specs;
create policy job_specs_agent_select on public.job_specs
  for select to authenticated using ((select is_agent()));

drop policy if exists job_specs_agent_update on public.job_specs;
create policy job_specs_agent_update on public.job_specs
  for update to authenticated
  using ((select is_agent()) and is_final = false)
  with check ((select is_agent()) and is_final = false);

drop policy if exists network_profiles_agent_select on public.network_profiles;
create policy network_profiles_agent_select on public.network_profiles
  for select to authenticated using ((select is_agent()));

drop policy if exists network_profiles_agent_update on public.network_profiles;
create policy network_profiles_agent_update on public.network_profiles
  for update to authenticated
  using ((select is_agent()))
  with check ((select is_agent()));

drop policy if exists org_comms_policy_agent_select on public.org_comms_policy;
create policy org_comms_policy_agent_select on public.org_comms_policy
  for select to authenticated using ((select is_agent()));

drop policy if exists outreach_strategies_agent_insert on public.outreach_strategies;
create policy outreach_strategies_agent_insert on public.outreach_strategies
  for insert to authenticated
  with check ((select is_agent()) and status = 'draft' and created_by = (select auth.uid()));

drop policy if exists outreach_strategies_agent_select on public.outreach_strategies;
create policy outreach_strategies_agent_select on public.outreach_strategies
  for select to authenticated using ((select is_agent()));

drop policy if exists outreach_strategies_agent_update on public.outreach_strategies;
create policy outreach_strategies_agent_update on public.outreach_strategies
  for update to authenticated
  using ((select is_agent()) and status = 'draft')
  with check ((select is_agent()) and status = 'draft' and created_by = (select auth.uid()));

drop policy if exists prescreens_agent_insert on public.prescreens;
create policy prescreens_agent_insert on public.prescreens
  for insert to authenticated
  with check ((select is_agent()) and status = 'proposed');

drop policy if exists prescreens_agent_select on public.prescreens;
create policy prescreens_agent_select on public.prescreens
  for select to authenticated using ((select is_agent()));

drop policy if exists prescreens_agent_update on public.prescreens;
create policy prescreens_agent_update on public.prescreens
  for update to authenticated
  using ((select is_agent()) and status = any (array['proposed','invited','in_progress']))
  with check ((select is_agent()) and status <> 'abandoned');

drop policy if exists project_reports_agent_insert on public.project_reports;
create policy project_reports_agent_insert on public.project_reports
  for insert to authenticated
  with check ((select is_agent()) and generated_by = (select auth.uid()));

drop policy if exists projects_agent_select on public.projects;
create policy projects_agent_select on public.projects
  for select to authenticated using ((select is_agent()));

drop policy if exists projects_agent_update on public.projects;
create policy projects_agent_update on public.projects
  for update to authenticated
  using ((select is_agent()))
  with check ((select is_agent()));

drop policy if exists role_success_profiles_agent_select on public.role_success_profiles;
create policy role_success_profiles_agent_select on public.role_success_profiles
  for select to authenticated using ((select is_agent()));

drop policy if exists role_success_profiles_agent_update on public.role_success_profiles;
create policy role_success_profiles_agent_update on public.role_success_profiles
  for update to authenticated
  using ((select is_agent()) and status = 'draft')
  with check ((select is_agent()) and status = 'draft');

drop policy if exists shortlists_agent_select on public.shortlists;
create policy shortlists_agent_select on public.shortlists
  for select to authenticated using ((select is_agent()));

drop policy if exists shortlists_agent_update on public.shortlists;
create policy shortlists_agent_update on public.shortlists
  for update to authenticated
  using ((select is_agent()) and submitted_at is null)
  with check ((select is_agent()) and submitted_at is null);

drop policy if exists skills_agent_select on public.skills;
create policy skills_agent_select on public.skills
  for select to authenticated using ((select is_agent()));
