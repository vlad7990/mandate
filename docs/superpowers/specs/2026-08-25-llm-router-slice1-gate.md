# LLM ROUTER — SLICE 1 GATE — THE SEAM — 2026-08-25 — DRAFT

**Status: Phase-0-verified gate DRAFT. Nothing is built. The build
starts only on the founder's written word against THIS document; the
review (docs/superpowers/specs/2026-08-25-llm-router-review.md, commit
8649cdd) is the ruled architecture, this gate is the slice-1 contract.
R4 stands: one slice per gate — slices 2 (caching), 3 (evals + tier
flips), 4 (Part R + providers) each gate separately.**

---

## A. Part Q — the founder's confirmations, recorded

- **Q1 CONFIRMED** — wrapper-first sequencing per Part O.
- **Q2 CONFIRMED** — telemetry sink is the `inference_runs` TABLE
  (migration 118), deny-all RLS on the ops_heartbeats precedent
  (migration 115), not structured logs.
- **Q3 CONFIRMED** — Sonnet 5 + Haiku 4.5 benchmarks authorized FOR
  SLICE 3. No model changes in this slice.
- **Q4 DEFERRED** — cross-provider spike waits until in-family
  savings are exhausted.
- **Q5 CONFIRMED** — Part R (registry-as-data on the Skills/088
  patterns, keys in env NEVER the DB, eval-gated activation) is
  recorded direction; gates at slice 4.
- **Q6 CONFIRMED** — the marketing demo route and both portal doors
  are OUT OF SCOPE.

## B. Phase 0 — the repository verified (2026-08-25, live run)

Every load-bearing claim re-verified against ~/Projects/mandate at
HEAD 8649cdd. Two corrections to the review's drafted numbers; both
narrow the work, neither changes the shape.

| Claim | Verified |
|---|---|
| Model-calling files | **36 files, 38 call sites** (not "38 files"). 34 seams in src/lib/ai + 2 doors (api/copilot, api/demo). Two files carry two call sites each: `generate-sourcing.ts` (generateAllSourcingQueries at :62, regenerateSingleQuery at :113) and `run-sourcing-search.ts` (runToolLoop at :167, structureFindings at :219). |
| Model constant | `claude-sonnet-4-6` pinned as a local const in 36 production files (37 grep hits minus one test file). Copilot's lives in `copilot-agent.ts` as exported `COPILOT_MODEL`; `CLIENT_INTERVIEW_MODEL` and `SOURCING_SEARCH_MODEL` are also exported. |
| Structured output | `output_config` in 36 files — universal, Anthropic-native. Confirmed. |
| Web seams | 6 total. **The ruled drift fix touches FOUR files, not five**: `run-candidate-research`, `run-company-intelligence`, `run-hiring-manager-research`, `run-executive-company-context` are on `web_search_20250305`; `run-sourcing-search` is already on `web_search_20260209`; the fifth old-variant occurrence is **api/demo/route.ts — ruled untouched by Q6**, so it stays on 20250305 exactly as §142 verified it. `web_search_20260209` is confirmed current and supported on Sonnet 4.6 (claude-api reference, cached 2026-06). |
| Streaming | One seam: api/copilot — `messages.create({stream: true})`, max_tokens 1500, SSE. Confirmed. |
| Caching / usage | 0 `cache_control`, 0 `usage` reads anywhere. Confirmed. |
| Shared abstraction | `src/lib/anthropic.ts` — 14-line `getAnthropic()` singleton, nothing else shared. Confirmed. |
| Skills order | `injectSkillsIntoPrompt()` (src/lib/skills/skill-injector.ts:168) appends skills AFTER the base prompt — cache-friendly order confirmed, preserved verbatim for slice 2. |
| Precedent | Migration 115 `ops_heartbeats`: RLS enabled, zero policies, zero grants, service-role-only writes. Confirmed as the template. |
| Numbers | Latest migration 117 → next 118. vitest **996 passed** (68 files), fresh run. Next § 146, next drive 104. Anon grant roster TWELVE (ruled §136). Activity CHECK 87, intent door 20, allowlist 29 — none widen this slice. |

## C. Deliverable 1 — migration 118: `inference_runs`

One table, ops data, on the ops_heartbeats pattern:

```sql
create table public.inference_runs (
  id            uuid primary key default gen_random_uuid(),
  capability    text not null,
  model         text not null,
  provider      text not null default 'anthropic',
  input_tokens  integer,
  cached_input_tokens integer,
  output_tokens integer,
  latency_ms    integer,
  outcome       text not null check (outcome in
                  ('ok','schema_failed','provider_error','refused')),
  retries       integer not null default 0,
  escalated_from text,          -- null this slice; slice 3+ wiring
  project_id    uuid,           -- nullable, NO foreign key (below)
  created_at    timestamptz not null default now()
);
alter table public.inference_runs enable row level security;
-- deny-all: no policies, no grants, ever (115 precedent).
```

- **Zero anon grants** — the ruled roster stays TWELVE. The seam
  writes through the service-role client inside server code only.
- **`project_id` carries no FK** — telemetry must survive project
  deletion (cost history), and a plain uuid avoids adding to the
  unindexed-FK debt the checklist already tracks. Founder may rule an
  FK + index instead; the gate default is no FK.
- **No prices anywhere** — cost math is a read-time concern for a
  later slice, per Part L.
- Trail impact NONE: inference telemetry is ops data. CHECK stays 87,
  door stays 20, allowlist stays 29.
- Durable baseline GAINS `inference_runs` (durable 0; drive rows
  swept in teardown).

## D. Deliverable 2 — the seam and the map

**`src/lib/ai/inference.ts`** — server-only (`import "server-only"`),
one module every model call flows through:

- `runInference({ capability, request, projectId? })` → the raw
  `Anthropic.Message`, having called `getAnthropic()` exactly as the
  seams do today (`getAnthropic()` becomes the seam's internals).
  `request` is today's request object byte-for-byte: same `system`,
  `messages`, `output_config`, `tools`, per-seam `max_tokens`. The
  seam resolves `model` from the map — the ONLY field it supplies.
- `runInferenceStream({ capability, request })` → the raw async
  event iterable, for the one SSE seam (copilot). Usage is read from
  the stream's `message_delta`/final usage events; latency stamps at
  stream end; SSE pass-through behavior is byte-identical.
- **Telemetry write**: one `inference_runs` insert per call —
  capability, model, provider `'anthropic'`, `usage.input_tokens`,
  `usage.cache_read_input_tokens` (→ cached_input_tokens),
  `usage.output_tokens`, latency_ms, outcome, retries 0,
  escalated_from null, project_id when the caller has one.
  Fire-and-forget: a failed telemetry insert logs and NEVER blocks or
  fails the model call — telemetry must not change product behavior.
- **Outcome mapping**: `ok` = response returned;
  `refused` = `stop_reason === "refusal"`;
  `provider_error` = SDK throw (row written, error RETHROWN unchanged
  so every seam's existing agent-errors/090 handling fires exactly as
  today). `schema_failed`: the seam keeps a module-private
  WeakMap(response → run id) and exports
  `markInferenceSchemaFailed(response)`; seams that already have a
  normalize-failure branch add that one line inside it. No response
  shapes change. (Founder may strike schema_failed marking to a later
  slice; the column ships either way.)
- `retries` records 0 this slice — the SDK's internal max_retries: 2
  is not observable per-call, and inventing a number would be
  dishonest bookkeeping. App-level retries do not exist today.
- **The seam never holds a product Supabase client.** Its only DB
  access is the module-level service-role insert into
  `inference_runs`. It receives prompt strings and returns raw
  responses — every read-under-RLS and write-under-RLS stays in the
  callers, so provider choice can never change data authority
  (Part N, verbatim law in the module header).

**`src/lib/ai/model-map.ts`** — ONE file, code constant:
`Capability` union type + `CAPABILITY_MODEL: Record<Capability,
string>` — **every entry `claude-sonnet-4-6`, no exceptions, this
slice**. 35 capabilities: one slug per seam file (34) plus `copilot`.
The two dual-call files record both their calls under one slug
(`generate_sourcing`, `sourcing_search`) — rows are distinguishable
by shape, and capability is text, so a later split needs no
migration. The demo door is NOT in the map; it keeps its direct call
untouched. Exported consts (`COPILOT_MODEL`,
`CLIENT_INTERVIEW_MODEL`, `SOURCING_SEARCH_MODEL`) become re-exports
of their map entries so every importer and test stays green.

The 35 slugs: `parse_cv, analyze_role, derive_calibration,
generate_sourcing, run_role_analysis, interpret_feedback,
generate_evaluation, generate_comparison, generate_job_spec,
generate_shortlist_report, run_positioning, run_psychology,
run_triangulation, run_candidate_research, run_company_intelligence,
run_hiring_manager_research, run_executive_company_context,
sourcing_search, run_client_psychology, run_company_culture,
run_coverage_analysis, run_engagement, run_prescreen,
run_outreach_strategy, run_relationship, run_search_health,
run_weekly_report, desk_digest, run_target_companies,
run_candidate_search, generate_interview_plan,
generate_client_interview, generate_executive_success_profile,
generate_executive_interview_plan, copilot`.

## E. Deliverable 3 — the adoption sweep

**35 files, 37 call sites** (36 files / 38 sites minus the demo
door). Mechanical per seam: replace `anthropic.messages.create({...,
model: LOCAL_CONST})` with `runInference({ capability, request })`;
response handling, normalize*() coercion, error mapping, max_tokens —
all preserved EXACTLY. Standing doctrine travels untouched:
`{count:"exact"}` zero-row refusals, agent-errors honest sentences,
090 requester-records-failure bookkeeping, skills injected AFTER the
base prompt.

The ONE behavior change ruled into this slice: the four
`web_search_20250305` seams named in Part B flip to
`web_search_20260209`. Demo stays on 20250305 (Q6; §142 verified it
as-is — not worth re-verifying for pennies).

**NOT in this slice**: caching, cost math, prices, fallbacks,
escalation, providers, policy tables, batch hints, any model change,
any prompt change, any touch of the demo route or portal doors.

## F. Deliverable 4 — tests

Unit tests for the pure logic only (the mocked-SDK pattern from
`run-candidate-search.test.ts`):

- map completeness — every `Capability` has a model; every value is
  `claude-sonnet-4-6` this slice (the test that slice 3 will edit
  deliberately, under its own gate);
- outcome mapping — stop_reason → outcome, SDK throw → provider_error
  + rethrow, refusal → refused;
- telemetry row shape — correct columns from a mocked usage block;
  insert failure does not throw out of the seam.

Green gate: tsc, eslint, build, vitest 996 + the new tests, zero
existing-test edits (re-exported consts make this hold).

## G. D-ladder on the founder's word (mirrors §144)

1. Migration 118 — file + MCP apply (project xipyqnltkbtywxqyxupf).
2. Seam + map + adoption sweep (Parts D–E).
3. Unit tests (Part F) → green gate.
4. Commit → deploy (`vercel --prod --yes` — git push does NOT
   deploy).
5. **Drive 104**, scratch principal: run one real capability live
   (search-health or copilot — cheap, no outbound), verify the
   `inference_runs` row lands with honest tokens/latency/outcome and
   the product behavior is byte-identical; teardown by value. Traps
   carried: browser autofills the founder's real credentials — always
   overwrite; clearCookies to sign out; member-audit by name;
   public.users before auth.users; fresh-statement counts; sign_in_ip
   buckets from browser sign-ins; rate_limit sweeps whole per its
   zero baseline; **sweep the drive's inference_runs rows** (durable
   baseline stays 0).
6. §146 DRAFTED — no completion declared; awaits confirmation.
7. Memory updated (next-build-priority-deferred.md + MEMORY.md line).

## H. Numbers at gate drafting (all fresh, 2026-08-25)

36 model-calling files / 38 call sites (35 files / 37 sites in
scope); 35 capabilities in the map; 4 web seams flip to 20260209;
0 cache_control; 0 usage reads; vitest 996/68 green; next migration
118; next § 146; next drive 104; anon roster 12 (inference_runs adds
ZERO); CHECK 87; door 20; allowlist 29; durable baseline gains
inference_runs 0.

**Awaiting the founder's written word against this document.**
