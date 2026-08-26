# LLM ROUTER — SLICE 4 GATE — PART R MODEL REGISTRY — 2026-08-25 — DRAFT

**Status: Phase-0-verified gate DRAFT. Nothing is built. Build
starts only on the founder's written word against THIS document.
Slices 1–3 are closed law (§147 seam / §149 caching / §152
evals+flips); this is the LAST gate of the router sequence — the
escalation pairs (Part G: parse_cv Economy→Standard,
generate_evaluation Standard→Premium, deterministic signals only)
gate AFTER this slice per O.5, and the Q4 cross-provider spike
stays deferred: no provider is added speculatively.**

---

## A. What this slice is

Part R as recorded direction (Q5 confirmed): the provider/model
registry becomes **data** — `model_providers` + `provider_models` +
`capability_assignments` on the 088 caps-as-data precedent and the
Skills Studio admin-surface pattern. Admin-gated writes; keys NEVER
enter the database (rows store env-var NAMES; the founder sets
secrets in Vercel by hand — the standing env-pair doctrine); model
activation is eval-gated STRUCTURALLY; capability assignments become
the DB successor of slice 1's code map WITH the code map as
fallback. Anthropic-only rows seed the registry — the three models
production already runs.

## B. Phase 0 — verified facts the design stands on

1. **088's caps-as-data shape** (`088_rate_limit.sql`): plain table,
   natural PK (`scope`), seeded `INSERT … ON CONFLICT DO UPDATE`,
   RLS enabled with the policies the surface needs and nothing more.
   Raising a ceiling is an UPDATE, not a deploy. The registry copies
   this: natural keys (`name`, `model_id`, `capability`), config as
   rows, changes as UPDATEs.
2. **The Skills Studio admin pattern** is THREE layers, verified in
   place: (a) action layer — `requireActionContext("skills:write")`
   in `settings/skills/actions.ts`, with `skills:write` granted to
   admin alone (roles.ts); (b) route layer — `route-access.ts` maps
   the write pages to `skills:write`; (c) trail layer — the skill
   family inside `record_activity_event` is admin-gated by
   `is_org_admin()` (102), and trail rows carry names/types, never
   instruction text. `is_org_admin()` = `current_user_role() =
   'admin'` (046) — agent principals hold role `'agent'` and are
   refused by the same test, no extra clause needed.
3. **The CHECK/door widening precedent** (117, the latest): DROP +
   re-ADD `activity_events_type_known` rebuilt from the LIVE list —
   currently **87** values; `record_activity_event`'s intent
   allowlist currently admits **20**, with per-family privilege
   gates inside the RPC. `record_agent_event` stays untouched at
   TWENTY-NINE (ruled) — registry changes are human acts; the agent
   door refuses them automatically.
4. **The seam** (`inference.ts`): `resolveOverrides()` is the ONE
   model-choice point, calling `modelForCapability()`; the module's
   only DB access is the service-role telemetry carve-out,
   fire-and-forget with `warnTelemetry` warn-once. Part N law in the
   header: no product Supabase client, agents/skills/models get no
   say in model choice. The eval fence throws on overrides outside
   `MANDATE_EVAL=1`.
5. **The map** (`model-map.ts`): 35 slugs; `CAPABILITY_THINKING`
   keyed by capability carries §150's benchmarked thinking config
   (generate_evaluation = Sonnet 5 thinking-off — benchmarked FOR
   that model); the tripwire test pins the ruled mapping.
6. **118's grant doctrine**: new tables add ZERO anon grants — the
   roster is TWELVE and ruled (§136); anon's Supabase-default table
   privileges are closed by RLS carrying no anon policies (the 088
   comment names this exact shape).
7. **The proxy** (`src/proxy.ts`): `/app/settings/*` is already
   behind the session wall — the /join public-allowlist trap does
   NOT bite here. What a new settings surface DOES need is its
   `route-access.ts` capability rows (the skills precedent, lines
   78–80).

## C. Migration 120 — `120_model_registry.sql`

Three tables, seeded, then guarded. **Order matters**: tables →
seed → constraint triggers, so the three production models can seed
as `active` while every row an ADMIN later inserts must enter
through the benchmarking door.

**`model_providers`** — `name` text PK · `adapter_kind` text NOT
NULL CHECK (`'anthropic'` only — the CHECK widens in the same
migration that ships a second adapter, never before; this is Q4's
deferral made structural) · `key_env_var` text NOT NULL (an env-var
NAME, shape-checked `^[A-Z][A-Z0-9_]*$` — never a value; the
secret itself lives in Vercel, set by the founder's hand) ·
`status` text NOT NULL CHECK in (`active`,`disabled`) ·
`data_region` text · timestamps.

**`provider_models`** — `model_id` text PK (the API model string) ·
`provider` text NOT NULL REFERENCES model_providers(name) · `tier`
text CHECK in (`economy`,`standard`,`premium`) ·
`supports_structured_output` / `supports_tools` /
`supports_web_search` / `supports_streaming` booleans ·
`context_window` / `max_output_tokens` / `cache_min_tokens`
integers · `price_input_per_mtok` / `price_output_per_mtok`
numeric, nullable — informational estimates for the console ONLY;
Part L's read-time pricing map stays the cost authority and nothing
routes or bills off these columns · `status` text NOT NULL CHECK in
(`benchmarking`,`active`,`retired`) DEFAULT `benchmarking` ·
`benchmark_ref` text · timestamps · table CHECK: `status <>
'active' OR benchmark_ref IS NOT NULL` (an active row must name the
eval evidence behind it).

**`capability_assignments`** — `capability` text PK · `model_id`
text NOT NULL REFERENCES provider_models · `updated_by` uuid ·
`updated_at`. No CHECK over the 35 slugs (it would need widening
every new seam): the app writes only `Capability`-typed slugs, and
a typo'd row is inert — the resolver never asks for it and the
console shows it.

**The structural activation gate** (constraint triggers, created
AFTER the seed):

- INSERT on provider_models refuses `status = 'active'` — every new
  model enters `benchmarking`. An admin can ADD any model; only the
  eval harness's pass opens the next door.
- UPDATE of provider_models.status admits `active` only FROM
  `benchmarking` (a retired model re-enters benchmarking first),
  and refuses leaving `active` while any capability_assignments row
  references the model — production never points at an inactive
  row.
- INSERT/UPDATE on capability_assignments refuses any model whose
  status ≠ `active` or whose provider's status ≠ `active` — an
  unbenchmarked model structurally cannot be put in front of
  customers.

**RLS** — enabled on all three; one policy set per table, `FOR ALL
TO authenticated USING/WITH CHECK (is_org_admin())`. Admin reads
and writes; every other member, every agent (role `'agent'`), and
anon (no anon policies — the 088/118 closure) are refused. The seam
reads through the service-role client, which bypasses RLS by
design. Anon roster stays TWELVE; agent allowlist stays 29.

**The trail** — CHECK rebuilt from 117's live list, **87 → 89**:
`model_provider_added`, `model_assignment_changed`. The intent door
widens **20 → 22**, both gated `is_org_admin()` exactly like the
skill family (the same refusal covers agents). Semantics (decision
J.1): `model_provider_added` = a provider OR model row entered the
registry (`detail.kind` says which, plus name/model_id/tier);
`model_assignment_changed` = anything that changes what production
MAY run — a status transition (benchmarking→active,
active→retired) or a capability assignment set/cleared
(`detail.kind`, `detail.from`, `detail.to`). Detail carries names
and statuses — never key env-var names, never prompt text.

## D. Seed — the three models production already runs

Provider row: `anthropic` / adapter `anthropic` / key_env_var
`ANTHROPIC_API_KEY` / active. Model rows, all `active` (seeded
before the triggers exist — the migration-order door):

| model_id | tier | benchmark_ref |
|---|---|---|
| claude-sonnet-4-6 | standard | `incumbent — pre-registry production model (§147)` |
| claude-sonnet-5 | standard | `evals/results/2026-08-25.md (§150 word)` |
| claude-haiku-4-5 | economy | `evals/results/2026-08-25.md (§150 word)` |

Capability metadata columns filled from the slice-3 phase-0 facts
(Haiku cache minimum 4096, Sonnet-class 1024, etc.). Intro pricing
for Sonnet 5 is NOT recorded (it expires 2026-08-31); list prices
only, as estimates.

**capability_assignments seeds ZERO rows** (decision J.2): an
assignment row is an explicit founder override that WINS over the
code map; absence means the code map governs — which keeps the
tripwire meaningful and the durable baseline honest. The ruled
§150/§152 mapping stays where it is law today: in the map, pinned
by the tripwire.

## E. The read path — DB successor, code-map fallback

A small addition beside the map (`src/lib/ai/registry.ts`), used by
`resolveOverrides()`:

- Reads the whole `capability_assignments` table (≤35 rows) through
  the service-role client into an in-process cache, TTL 60s — one
  query per process per minute, not one per call. An assignment
  change is live within a minute of the founder's click, no deploy.
- Any read failure → `warn`-once (the `warnTelemetry` pattern) and
  **fall back to the code map**: model calls are never blocked,
  failed, or reshaped by registry availability — the same doctrine
  as the telemetry insert.
- Resolution order in production: assignment row → code map. The
  eval fence is untouched: `MANDATE_EVAL=1` overrides still beat
  both, and still throw outside the fence.
- **The thinking rule** (decision J.6): `CAPABILITY_THINKING` was
  benchmarked per capability FOR the map's model. It applies only
  when the resolved model EQUALS the map's model; a DB override to
  a different model sends no thinking param (today's default
  behavior on every model) until an eval rules otherwise.
- `INFERENCE_PROVIDER` stays the telemetry constant this slice —
  every seedable row is Anthropic, `getAnthropic()` and its env
  read are UNCHANGED. Dynamic per-provider key lookup ships with a
  second adapter, not before.

## F. Admin surface — `/app/settings/models`, the Skills pattern

- **New capability `models:write`**, granted to admin alone
  (roles.ts + roles.test.ts + the no-access screen's label). Not
  `skills:write` — changing what model runs a capability is its own
  named power (decision J.3).
- **route-access.ts**: the whole `/app/settings/models` prefix maps
  to `models:write` — unlike the skills list (org:read), the
  registry's RLS is admin-only SELECT, so a non-admin page render
  would be an empty lie; the route refuses instead.
- **Page** (server component, Skills page shape): providers,
  models (status, tier, benchmark_ref), and the 35-capability
  assignment table showing the map's default beside any DB
  override. Terminal visual language.
- **actions.ts** (Skills actions shape): `requireActionContext
  ("models:write")` · manual field validation with hard caps ·
  writes through the session client (RLS admin) · `runAction`
  wrapper with a SUBJECT sentence · `recordActivity` for the two
  intents. Actions: add provider · add model (enters benchmarking)
  · activate model (asks for benchmark_ref) · retire model ·
  set/clear a capability assignment. Every refusal surfaces the
  database's own sentence — the triggers are the law, the actions
  are convenience.

## G. Tests

- Registry resolver unit tests (mocked service client): override
  wins over map · absence falls back · read failure falls back and
  warns once · TTL refresh · thinking rule (equal model → map
  thinking; different model → none) · eval fence still throws.
- roles.test.ts: `models:write` admin-only.
- The existing tripwire stays UNTOUCHED — it pins the ruled code
  map, which remains production law wherever no assignment row
  exists.
- Green gate: tsc · vitest (1025 + new) · eslint · build.

## H. Drive 107 — live proof, then teardown by value

Deployed (`vercel --prod --yes` — git push does not deploy), then:

1. Founder-admin session: open `/app/settings/models`, see the
   seeded registry and the 35 assignments showing map defaults.
2. Add a scratch model row (e.g. `claude-opus-5`) — lands
   `benchmarking`. Attempt to assign it to a capability → REFUSED
   by the trigger (unbenchmarked model, the door's whole point).
   Attempt to activate without benchmark_ref → REFUSED.
3. Activate with a benchmark_ref, assign it to ONE low-stakes
   capability, run that capability once, verify the
   inference_runs row records the override model; clear the
   assignment, verify the next run records the map's model again.
4. Non-admin refusals: a recruiter session gets the no-access
   screen on the route AND zero rows through RLS; the scratch
   agent path is refused by `is_org_admin()` on the intents.
5. Teardown by value: the scratch model row and its assignment,
   the drive's trail rows (two intents, by value), the drive's
   inference_runs rows (swept per standing law). Scratch
   principals per the standing recipe if one is minted; browser
   traps observed (overwrite autofill; clear cookies AND
   localStorage). Durable baseline after: model_providers 1,
   provider_models 3, capability_assignments 0 — everything else
   unchanged.

## I. Deliberately NOT in this slice

Cross-provider adapters and SDKs (adapter_kind CHECK admits only
`anthropic`) · the Q4 spike (stays deferred; Anthropic-only until
in-family savings are exhausted) · escalation pairs (gate next, per
O.5) · org-level allow/deny lists (a WHERE-clause retrofit when an
enterprise customer first needs one) · dynamic key lookup ·
cost/billing math (Part L's read-time map, later slice) · batch ·
any change to the demo route, the eval fence, the tripwire's
authority, or `record_agent_event`.

## J. Decisions requiring the founder's word

1. **Trail semantics**: TWO intents as ruled, with
   `model_provider_added` covering provider+model adds and
   `model_assignment_changed` covering status transitions AND
   assignment set/clear (detail.kind disambiguates) — or widen the
   vocabulary further?
2. **Assignments seed ZERO rows** — a DB row is an explicit
   founder override; the ruled map stays law elsewhere. Confirm?
3. **New capability `models:write`** (admin-only) and the whole
   `/app/settings/models` prefix admin-gated — diverging from the
   skills list's org:read read surface, because the registry's RLS
   is admin-only. Confirm?
4. **adapter_kind admits only `'anthropic'`** until a second
   adapter ships — the structural form of Q4's deferral. Confirm?
5. **Pricing snapshot columns** are nullable informational
   estimates (console display only; no routing, no billing; Part
   L's pricing map stays the cost authority). Confirm?
6. **The thinking rule**: map thinking config applies only when
   the resolved model equals the map's model. Confirm?

---

Numbers at drafting (verified §152, 2026-08-25): next migration
120 · next § 153 · next drive 107 · vitest 1025 · activity CHECK 87
→ 89 here · intent door 20 → 22 here · agent allowlist 29
(untouched) · anon roster TWELVE (untouched) · durable baseline
gains model_providers 1, provider_models 3, capability_assignments
0. D-ladder on the founder's word: migration 120 · seed · read
path with fallback · admin surface · unit tests · green gate ·
commit · deploy · drive 107 · §153 DRAFTED, no completion declared
· memory updated.
