-- 120 — MODEL REGISTRY (LLM router slice 4, Part R; gate 1885da9,
-- built on the founder's word 2026-08-25).
--
-- The provider/model registry becomes DATA on the 088 caps-as-data
-- precedent: natural keys, config as rows, changes as UPDATEs. Three
-- tables — model_providers, provider_models, capability_assignments —
-- admin-read/admin-write under RLS (is_org_admin(): agents hold role
-- 'agent' and are refused by the same test; anon holds only
-- Supabase-default privileges and no policy here speaks to it, the
-- 088/118 closure — the ruled roster stays TWELVE named grants).
--
--   * KEYS NEVER ENTER THE DATABASE. A provider row stores the NAME of
--     an env var; the founder sets the secret in Vercel by hand (the
--     standing env-pair doctrine). The shape CHECK admits an env-var
--     name and cannot admit a key: no lowercase, no punctuation beyond
--     underscore.
--   * ACTIVATION IS EVAL-GATED STRUCTURALLY. New models INSERT into
--     'benchmarking' (the trigger refuses active-at-birth); a row
--     becomes 'active' only FROM 'benchmarking' and only carrying a
--     benchmark_ref (the eval harness's pass is the door); a
--     capability can be assigned only an active model on an active
--     provider; an assigned model cannot leave 'active'. An admin can
--     ADD any model — they cannot put an unbenchmarked one in front
--     of customers.
--   * ORDER MATTERS BELOW: tables → seed → triggers. The three models
--     production already runs seed as 'active' (their evidence is
--     §150's benchmark and §147's incumbency); every row an admin
--     adds later meets the triggers.
--   * capability_assignments seeds ZERO rows (gate J.2): a row here is
--     an explicit founder override that wins over the code map in
--     src/lib/ai/model-map.ts; absence means the ruled map governs,
--     which keeps its tripwire test meaningful.
--   * adapter_kind admits ONLY 'anthropic' (gate J.4): the CHECK
--     widens in the migration that ships a second adapter, never
--     before — Q4's deferral made structural.
--   * Pricing columns are informational estimates for the console
--     (gate J.5); Part L's read-time pricing map stays the cost
--     authority and nothing routes or bills off them. Sonnet 5's
--     introductory pricing is deliberately NOT recorded (it expires
--     2026-08-31); list prices only.
--
-- The trail: activity CHECK rebuilt 87 → 89 (model_provider_added,
-- model_assignment_changed); the intent door widens 20 → 22, both
-- admin-gated exactly like the skill family. record_agent_event is
-- UNTOUCHED at TWENTY-NINE — registry changes are human acts.

-- ---------------------------------------------------------------------------
-- 1. The tables
-- ---------------------------------------------------------------------------

create table public.model_providers (
  name         text primary key,
  adapter_kind text not null check (adapter_kind in ('anthropic')),
  -- An env-var NAME, never a value: the runtime reads process.env by
  -- this name; the secret itself lives in Vercel, set by hand.
  key_env_var  text not null check (key_env_var ~ '^[A-Z][A-Z0-9_]*$'),
  status       text not null default 'active'
                 check (status in ('active', 'disabled')),
  data_region  text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.provider_models (
  -- The provider's own model string — what the API is actually called
  -- with, and what inference_runs.model already records.
  model_id                   text primary key,
  provider                   text not null
                               references public.model_providers(name),
  tier                       text
                               check (tier in ('economy', 'standard', 'premium')),
  supports_structured_output boolean not null default true,
  supports_tools             boolean not null default true,
  supports_web_search        boolean not null default false,
  supports_streaming         boolean not null default true,
  context_window             integer,
  max_output_tokens          integer,
  cache_min_tokens           integer,
  price_input_per_mtok       numeric,
  price_output_per_mtok      numeric,
  status                     text not null default 'benchmarking'
                               check (status in ('benchmarking', 'active', 'retired')),
  benchmark_ref              text,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  -- An active row must name the eval evidence behind it.
  constraint provider_models_active_needs_evidence
    check (status <> 'active' or benchmark_ref is not null)
);

create index provider_models_provider_idx
  on public.provider_models (provider);

create table public.capability_assignments (
  -- A capability slug from the code map. No CHECK over the 35 (it
  -- would need widening every new seam): the app writes only typed
  -- slugs, and a typo'd row is inert — the resolver never asks for it
  -- and the console shows it.
  capability text primary key,
  model_id   text not null
               references public.provider_models(model_id),
  -- Plain uuid, no FK (the 118 shape): the override's history must
  -- survive the admin's departure.
  updated_by uuid,
  updated_at timestamptz not null default now()
);

create index capability_assignments_model_idx
  on public.capability_assignments (model_id);

-- ---------------------------------------------------------------------------
-- 2. RLS — admin territory, all three tables
-- ---------------------------------------------------------------------------

alter table public.model_providers enable row level security;
alter table public.provider_models enable row level security;
alter table public.capability_assignments enable row level security;

create policy model_providers_admin_all on public.model_providers
  for all to authenticated
  using ((select public.is_org_admin()))
  with check ((select public.is_org_admin()));

create policy provider_models_admin_all on public.provider_models
  for all to authenticated
  using ((select public.is_org_admin()))
  with check ((select public.is_org_admin()));

create policy capability_assignments_admin_all on public.capability_assignments
  for all to authenticated
  using ((select public.is_org_admin()))
  with check ((select public.is_org_admin()));

-- The seam reads assignments through the service-role client (which
-- bypasses RLS) with a 60s in-process cache and the code map as
-- fallback — a registry outage can never block a model call.

-- ---------------------------------------------------------------------------
-- 3. Seed — BEFORE the triggers exist, the migration-order door.
--    The three models production already runs, active with their
--    evidence named.
-- ---------------------------------------------------------------------------

insert into public.model_providers
  (name, adapter_kind, key_env_var, status)
values
  ('anthropic', 'anthropic', 'ANTHROPIC_API_KEY', 'active')
on conflict (name) do nothing;

insert into public.provider_models
  (model_id, provider, tier,
   supports_structured_output, supports_tools, supports_web_search,
   supports_streaming, context_window, max_output_tokens,
   cache_min_tokens, price_input_per_mtok, price_output_per_mtok,
   status, benchmark_ref)
values
  ('claude-sonnet-4-6', 'anthropic', 'standard',
   true, true, true, true, 200000, 64000, 1024, 3, 15,
   'active', 'incumbent — pre-registry production model (§147)'),
  ('claude-sonnet-5', 'anthropic', 'standard',
   true, true, true, true, 200000, 64000, 1024, 3, 15,
   'active', 'evals/results/2026-08-25.md (§150 flip word)'),
  ('claude-haiku-4-5', 'anthropic', 'economy',
   true, true, false, true, 200000, 64000, 4096, 1, 5,
   'active', 'evals/results/2026-08-25.md (§150 flip word)')
on conflict (model_id) do nothing;

-- ---------------------------------------------------------------------------
-- 4. The structural activation gate — triggers, created AFTER the seed
-- ---------------------------------------------------------------------------

create or replace function public.guard_provider_model_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'active' then
      raise exception
        'provider_models: a new model enters benchmarking — activation is the eval harness''s door';
    end if;
    return new;
  end if;

  -- UPDATE. Active only from benchmarking: a retired model re-enters
  -- benchmarking before it can come back.
  if new.status = 'active' and old.status <> 'active'
     and old.status <> 'benchmarking' then
    raise exception
      'provider_models: % may become active only from benchmarking (it is %)',
      new.model_id, old.status;
  end if;

  -- Production never points at an inactive row: clear the capability
  -- assignments before a model leaves 'active'.
  if old.status = 'active' and new.status <> 'active'
     and exists (select 1 from public.capability_assignments a
                  where a.model_id = new.model_id) then
    raise exception
      'provider_models: % is assigned to a capability — clear the assignment first',
      new.model_id;
  end if;

  return new;
end;
$$;

create trigger provider_models_activation_gate
  before insert or update on public.provider_models
  for each row execute function public.guard_provider_model_status();

create or replace function public.guard_assignment_active_model()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
      from public.provider_models m
      join public.model_providers p on p.name = m.provider
     where m.model_id = new.model_id
       and m.status = 'active'
       and p.status = 'active'
  ) then
    raise exception
      'capability_assignments: % is not an active model on an active provider — benchmark and activate it first',
      new.model_id;
  end if;
  return new;
end;
$$;

create trigger capability_assignments_active_gate
  before insert or update on public.capability_assignments
  for each row execute function public.guard_assignment_active_model();

-- ---------------------------------------------------------------------------
-- 5. The trail. CHECK rebuilt from 117's list (87 values) + the two
--    registry intents = 89. record_agent_event untouched at 29.
-- ---------------------------------------------------------------------------

ALTER TABLE public.activity_events
  DROP CONSTRAINT IF EXISTS activity_events_type_known;

ALTER TABLE public.activity_events
  ADD CONSTRAINT activity_events_type_known CHECK (event_type IN (
    'placement_recorded', 'placement_status_changed',
    'placement_signoff_changed', 'placement_deleted',
    'fee_recorded', 'fee_updated', 'fee_line_earned',
    'fee_line_cancelled', 'fee_reversed', 'fee_terms_created',
    'fee_terms_updated', 'fee_terms_deleted',
    'client_contact_added', 'client_contact_updated',
    'client_contact_removed',
    'member_role_changed', 'member_status_changed',
    'member_founder_changed', 'member_org_changed',
    'shortlist_published', 'report_exported', 'hm_portal_opened',
    'mandate_reassigned',
    'external_invited', 'external_invitation_revoked',
    'external_invitation_resent', 'external_joined',
    'external_role_changed', 'external_status_changed',
    'mandate_shared', 'mandate_unshared',
    'external_access_granted', 'external_access_revoked',
    'candidate_portal_link_issued', 'candidate_portal_link_revoked',
    'candidate_self_updated', 'candidate_withdrew',
    'candidate_erasure_requested', 'candidate_cv_submitted',
    'feedback_interpreted', 'candidates_ranked', 'candidate_parsed',
    'candidate_evaluated', 'candidate_positioned',
    'candidate_researched', 'candidate_triangulated',
    'candidate_profiled', 'desk_digest_generated',
    'company_researched', 'hm_researched', 'culture_profiled',
    'sourcing_queries_generated', 'intake_analyzed',
    'health_suggested', 'weekly_report_generated',
    'calibration_derived', 'job_spec_generated',
    'shortlist_report_generated', 'copilot_answered',
    'success_profile_generated', 'interview_plan_generated',
    'executive_context_researched', 'candidate_search_answered',
    'sourcing_search_executed', 'outreach_strategy_drafted',
    'relationship_updated', 'network_dnc_set', 'network_dnc_cleared',
    'engagement_updated', 'prescreen_updated',
    'skill_created', 'skill_updated', 'skill_paused',
    'skill_activated', 'skill_deleted',
    'candidate_stage_changed',
    'task_assigned', 'task_completed',
    'objective_created', 'objective_closed',
    'interview_plan_generation_requested',
    'interview_plan_generation_failed',
    'interview_plan_approved',
    'client_interview_generation_requested',
    'client_interview_generation_failed',
    'client_interview_approved',
    'client_interview_answered',
    -- 120: the model registry's two admin acts.
    'model_provider_added', 'model_assignment_changed'
  ));

-- The intent door widens 20 → 22. Both registry intents are admin
-- acts, gated exactly like the skill family — the same refusal covers
-- every non-admin member and every agent.

CREATE OR REPLACE FUNCTION public.record_activity_event(
  p_event_type   text,
  p_project_id   uuid DEFAULT NULL,
  p_candidate_id uuid DEFAULT NULL,
  p_client_id    uuid DEFAULT NULL,
  p_detail       jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org uuid := (SELECT public.current_user_org_id());
BEGIN
  IF p_event_type NOT IN ('shortlist_published', 'report_exported',
                          'hm_portal_opened', 'mandate_reassigned',
                          'skill_created', 'skill_updated', 'skill_paused',
                          'skill_activated', 'skill_deleted',
                          'candidate_stage_changed',
                          'task_assigned', 'task_completed',
                          'objective_created', 'objective_closed',
                          'interview_plan_generation_requested',
                          'interview_plan_generation_failed',
                          'interview_plan_approved',
                          'client_interview_generation_requested',
                          'client_interview_generation_failed',
                          'client_interview_approved',
                          'model_provider_added',
                          'model_assignment_changed') THEN
    RAISE EXCEPTION 'record_activity_event: % is not an app-recordable event', p_event_type;
  END IF;

  -- 102 + 120: skills and the model registry are admin territory —
  -- only the role that can change one can claim to have changed one.
  -- Agents are 'agent', not admin; the same refusal covers them.
  IF (p_event_type LIKE 'skill\_%'
      OR p_event_type IN ('model_provider_added', 'model_assignment_changed'))
     AND (SELECT public.is_org_admin()) IS NOT TRUE THEN
    RAISE EXCEPTION 'record_activity_event: % is an admin act', p_event_type
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_event_type = 'candidate_stage_changed'
     AND (SELECT public.can_write_candidates()) IS NOT TRUE THEN
    RAISE EXCEPTION 'record_activity_event: % is a candidate-writer act', p_event_type
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Assigning work is the desk's act; completing rides the actor
  -- stamp (the RLS pin already proved the right to complete).
  IF p_event_type = 'task_assigned'
     AND coalesce((SELECT public.can_manage_desk()), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'record_activity_event: % is a desk act', p_event_type
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 107: setting or closing an objective is an okr-writer's act. The
  -- detail carries titles, scopes and outcomes — never amounts (R1:
  -- these rows are org-visible and the money is not).
  IF p_event_type IN ('objective_created', 'objective_closed')
     AND coalesce((SELECT public.can_write_okrs()), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'record_activity_event: % is an okr-writer act', p_event_type
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 116 + 117: both interview lifecycles are a mandate-writer's act.
  IF p_event_type IN ('interview_plan_generation_requested',
                      'interview_plan_generation_failed',
                      'interview_plan_approved',
                      'client_interview_generation_requested',
                      'client_interview_generation_failed',
                      'client_interview_approved')
     AND coalesce((SELECT public.can_write_mandates()), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'record_activity_event: % is a mandate-writer act', p_event_type
      USING ERRCODE = 'insufficient_privilege';
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
$$;

-- CREATE OR REPLACE resets grants; re-declare the door's audience.
REVOKE ALL ON FUNCTION public.record_activity_event(text, uuid, uuid, uuid, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.record_activity_event(text, uuid, uuid, uuid, jsonb) TO authenticated, service_role;
