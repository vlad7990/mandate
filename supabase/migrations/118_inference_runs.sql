-- 118 — INFERENCE RUNS (LLM router slice 1 gate confirmed, fda4764)
--
-- One row per model call, written by the runInference() seam. This is
-- the usage capture the router review named as the prerequisite for
-- everything else (Part L): before this table, no token, latency, or
-- outcome of any model call was recorded anywhere — routing decisions
-- would have been blind.
--
-- Ops data, NOT the activity trail: the 87-value CHECK does not widen
-- for this, and no org ever reads these rows through a session.
--
-- Zero policies, deliberately — the deny-all shape (§127: a deny-all
-- table never gains a session policy; ops_heartbeats/115 is the
-- precedent). No anon grants: the roster is TWELVE and ruled (§136) —
-- inference_runs adds ZERO. The seam writes through the service-role
-- client inside server code only, fire-and-forget: a failed telemetry
-- insert never blocks or fails the model call it describes.
--
-- No prices anywhere — cost is computed at read time from one pricing
-- map in a later slice (the review's no-price-tables rule).
--
-- project_id carries NO foreign key: telemetry must survive project
-- deletion (cost history), and a plain uuid adds nothing to the
-- unindexed-FK debt the checklist tracks.

create table public.inference_runs (
  id                  uuid primary key default gen_random_uuid(),
  capability          text not null,
  model               text not null,
  provider            text not null default 'anthropic',
  input_tokens        integer,
  cached_input_tokens integer,
  output_tokens       integer,
  latency_ms          integer,
  outcome             text not null check (outcome in
                        ('ok', 'schema_failed', 'provider_error', 'refused')),
  retries             integer not null default 0,
  escalated_from      text,
  project_id          uuid,
  created_at          timestamptz not null default now()
);

alter table public.inference_runs enable row level security;
