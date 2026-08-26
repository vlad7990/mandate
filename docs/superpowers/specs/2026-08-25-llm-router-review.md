# LLM ROUTER — REPOSITORY-GROUNDED ARCHITECTURE REVIEW — 2026-08-25 — DRAFT

**Status: DRAFT review, nothing implemented. This document answers the
founder's router proposal against the repository as it exists today
(commit 46a5f03 era) and adds the section the proposal was missing:
founder/admin-managed providers and models (Part R). Build waits on
the founder's written word against the decisions in Part Q.**

---

## A. Executive verdict

**Not a router first — a wrapper first.** Mandate does not yet have
the substrate a router routes THROUGH: there is no shared call path
(38 files each call the SDK directly), no token/usage capture (zero
`response.usage` reads anywhere), no prompt caching (zero
`cache_control` anywhere), and no evaluation harness. A
capability-aware multi-provider router built today would be
configuration without data — we could not tell whether a cheaper
model degraded a single capability, and we could not even say what
any capability costs now.

The honest sequence is: (1) one thin **inference seam** every call
already flows through, capturing usage and naming the capability;
(2) prompt caching + the Anthropic-native cheap tier (Haiku 4.5 /
Sonnet class per capability) behind that seam — this captures most
of the cost win with zero provider risk; (3) the eval harness; and
only then (4) multi-provider adapters, justified by eval data. The
proposal's shape (capability policy → selection → adapter →
validation → escalation) is directionally right; most of its layers
are premature TODAY and cheap to add LATER if step 1 is done
correctly.

## B. What actually exists in the repository

- **One provider, one model, everywhere.** `@anthropic-ai/sdk` is
  the only AI dependency. Every one of ~38 model-calling files pins
  `claude-sonnet-4-6` as a local `const` (e.g. `INTERVIEWER_MODEL`,
  `DEMO_MODEL`, `COPILOT_MODEL`) — per-seam constants, no central
  registry. Sonnet 4.6 is now the *previous* Sonnet generation
  (Sonnet 5 is current at the same list price, with introductory
  pricing below it through 2026-08-31).
- **The only abstraction is `src/lib/anthropic.ts`** — a 14-line
  client singleton (`getAnthropic()`). Nothing else is shared:
  request construction, model choice, `max_tokens` (1024–8000),
  parsing, and error mapping are per-seam.
- **Structured output is universal and Anthropic-native.** 35 seams
  use `output_config.format.json_schema` + a per-seam `normalize*()`
  coercion layer. No seam parses free-text JSON. This is the
  strongest guarantee in the codebase and must not be weakened.
- **Six web-search seams**, five on the old `web_search_20250305`
  variant and one (sourcing search) on `web_search_20260209` — an
  unnoticed version drift the review surfaces in passing. No other
  tool use exists; no client-side tool loops.
- **One streaming seam**: Copilot (SSE, `max_tokens` 1500).
- **Zero prompt caching, zero usage capture, no retry logic beyond
  the SDK's default `max_retries: 2`.** Failure handling is
  deliberate and human-facing (agent-errors.ts: two honest
  sentences; 090: the requester records failure, never the agent;
  §129: `{count:"exact"}` on agent writes).
- **Skills injection appends AFTER the base system prompt**
  (`injectSkillsIntoPrompt` returns `basePrompt + skills`) — which
  happens to be exactly the cache-friendly order: stable base
  prefix first, org/project-variable skills after.
- **Security doctrine the router must not disturb:** agents are
  real Supabase principals with sessions and RLS pins; the model
  call is *inside* the agent session but the model never touches
  data — the seam reads under RLS, prompts the model, writes under
  RLS. Provider choice therefore cannot change data authority *if
  the router stays below the seam's reads/writes* (Part N).

## C. Model-seam inventory (35 generation seams + 2 doors)

All currently `claude-sonnet-4-6`. "Tier" = recommended target tier
from Part G (Anthropic-family first; cross-provider only after
evals).

| Seam (src/lib/ai unless noted) | Web | Stream | Workload class | Tier |
|---|---|---|---|---|
| parse-cv | — | — | extraction from documents | Economy |
| analyze-role (intake) | — | — | classification + extraction | Standard |
| derive-calibration | — | — | structured scoring model | Standard |
| generate-sourcing (booleans) | — | — | query generation | Economy |
| run-role-analysis | — | — | re-analysis vs working set | Standard |
| interpret-feedback | — | — | interpretation + weight deltas | Standard |
| generate-evaluation | — | — | candidate evaluation | Standard/Premium |
| generate-comparison | — | — | slate comparison | Standard |
| generate-job-spec | — | — | long-form generation | Standard |
| generate-shortlist-report | — | — | synthesis/report | Standard |
| run-positioning | — | — | narrative + emails | Standard |
| run-psychology | — | — | behavioural read | Premium |
| run-triangulation | — | — | multi-report reconciliation | Premium |
| run-candidate-research | ✔ | — | web dossier | Premium (web) |
| run-company-intelligence | ✔ | — | web company report | Premium (web) |
| run-hiring-manager-research | ✔ | — | web HM report | Premium (web) |
| run-executive-company-context | ✔ | — | EI web context | Premium (web) |
| run-sourcing-search | ✔ | — | web sourcing execution | Premium (web) |
| run-client-psychology | — | — | client behavioural read | Premium |
| run-company-culture | — | — | culture profile | Standard |
| run-coverage-analysis | — | — | coverage vs spec | Standard |
| run-engagement / run-prescreen | — | — | outbound drafts (human-approved) | Standard |
| run-outreach-strategy | — | — | outreach strategy | Standard |
| run-relationship | — | — | network updates | Economy/Standard |
| run-search-health | — | — | health suggestions | Economy |
| run-weekly-report / desk-digest-agent | — | — | scheduled reports | Standard (batch-shaped) |
| run-target-companies | — | — | list generation | Economy |
| run-candidate-search | — | — | pool Q&A | Standard |
| generate-interview-plan / generate-client-interview | — | — | interview composition | Standard |
| generate-executive-success-profile / generate-executive-interview-plan | — | — | EI artifacts | Premium |
| api/copilot (door) | — | ✔ SSE | conversational copilot | Standard |
| api/demo (door, marketing) | ✔ | — | rate-limited public sim | Standard (leave alone) |

Deterministic tier (no model, already correct): RLS, DNC, caps,
comms execution, gap computation (`computeMandateGaps`), coverage
computation, dedupe/strip, schema normalizers, Skill scoping — the
repo already refuses to ask a model what code can decide. Tier 0 is
not a proposal here; it is standing doctrine.

## D. Existing reusable infrastructure (do not rebuild)

`getAnthropic()` (becomes the adapter's internals) · the universal
`output_config` + `normalize*()` validation pattern (already the
"deterministic validation" the cheap-first strategy needs) ·
agent-errors' honest-sentence mapping · 090/§129 failure doctrine ·
`applySkillsToPrompt` (already cache-order-correct) · caps-as-data
(088's `rate_limit_policy` is the house precedent for
config-as-data — the provider/model registry should copy this
shape) · the agents-as-principals session layer (the security
boundary the router lives beneath) · vitest + the mocked-SDK tests
(`run-candidate-search.test.ts` shows the seam-mocking pattern an
eval harness can extend).

## E. Gaps (what genuinely needs building)

1. **A shared inference seam.** Nothing common sits between 38 call
   sites and the SDK. This is the single prerequisite for
   everything else in the proposal.
2. **Usage capture.** No tokens, latency, cache hits, or model
   recorded anywhere — routing decisions today would be blind.
3. **Prompt caching.** Zero `cache_control`; every EI/research call
   re-sends its full system prompt at full price.
4. **A model registry.** 38 hardcoded constants; changing model =
   38 edits (the current Sonnet 4.6 → Sonnet 5 upgrade would touch
   every file).
5. **An eval harness.** Nothing measures output quality per
   capability; provider migration is un-testable today.
6. **(Later) provider adapters + org provider policy.** Nothing
   exists; nothing should, yet.

## F. Recommended architecture — the smallest correct shape

**Phase 1 — `runInference()` (the seam).** One server-only module,
`src/lib/ai/inference.ts`:

```
runInference({
  capability: "parse_cv",          // stable slug, one per seam
  system, messages, schema?,       // exactly today's shapes
  tools?, maxTokens, stream?,
})
```

It resolves the model from a **capability→model map** (code
constant, one file), calls Anthropic exactly as the seams do today,
and **records usage**: capability, model, input/output/cached
tokens, latency, retries, outcome. Adoption is mechanical per seam
(same request, same response handling); the §13 same-thing-38-times
rule finally collapses. NOT in phase 1: provider abstraction,
policy tables, fallback chains, cost math.

**Phase 2 — caching + Anthropic-native tiering behind the seam.**
`cache_control` on the system prompt (see Part J), and per-
capability model assignment from Part G — all inside the one map.

**Phase 3 — evals (Part I), then judge the cross-provider question
with data.** Only if a non-Anthropic model wins a capability's eval
at material savings does a `ProviderAdapter` interface get a second
implementation — and Part R's registry gets its first non-Anthropic
row.

**Decision flow, simplified from the proposal:** capability →
(org/provider policy when Part R lands) → model map → adapter →
call → existing normalize/validate → accept | mark-failed (today's
doctrine) | escalate (only where Part G names an escalation pair).
The proposal's separate "task requirements" layer is folded into
the capability map — with one provider and ~35 fixed capabilities,
requirements are static properties of the capability, not runtime
inputs. Route by **capability, not agent** — the proposal is right,
and the repo already proves it: the Interviewer principal runs two
capabilities (per-candidate plan, client question set) through two
pipelines; the seams are already capability-shaped.

## G. Model-tier recommendation (Anthropic-family first)

Current lineup relevant to Mandate: Haiku 4.5 ($1/$5, 200K ctx,
64K out, structured outputs ✔, **prompt-cache minimum 4096
tokens**), Sonnet 4.6 ($3/$15, today's model), Sonnet 5 ($3/$15
list, intro $2/$10 through 2026-08-31, current generation), Opus 5
($5/$25). Fable-class is not proposed for any seam.

- **Economy — Haiku 4.5**: parse-cv, generate-sourcing,
  run-target-companies, run-search-health, run-relationship.
  Mechanical extraction/generation with tight schemas and cheap
  human-visible validation. 3× cheaper than today.
- **Standard — Sonnet class** (4.6 today; benchmark Sonnet 5 as the
  default upgrade — same price, current generation): the long
  middle of the table, including Copilot and both interview
  composers.
- **Premium — Sonnet class, candidate for Opus 5 upgrade where
  evals justify**: triangulation, psychology pair, EI artifacts,
  and ALL web-search seams (web+structured+long output is the
  fragile combination; never move these first).
- **Escalation**: only two pairs worth wiring initially —
  parse-cv Economy→Standard on schema-normalize failure or empty
  required fields, and generate-evaluation Standard→Premium on
  validation failure. Escalation triggers are the DETERMINISTIC
  signals the repo already computes (schema invalid, zero-row,
  empty normalize) — never model-reported confidence, agreeing
  with the proposal.
- **The demo route stays put** — marketing-fenced, rate-limited,
  verified §142; not worth re-verifying for pennies.

## H. Benchmark candidates — order of testing

1. **Sonnet 4.6 → Sonnet 5** (same price, current gen; upgrade is
   overdue regardless of the router; drift risk: literal
   instruction-following may change seam outputs — evals first).
2. **Haiku 4.5 on the five Economy capabilities** (in-family, keeps
   `output_config` guarantees; the only real question is quality).
3. Only after 1–2: one OpenAI economy model and one Gemini Flash
   model on parse-cv + boolean generation, as a data-gathering
   spike — via a throwaway eval script, NOT a product dependency.
   (Per the proposal's own rule, no names assumed current; the
   spike starts by listing each provider's live lineup.)

## I. Evaluation harness — smallest useful design

Not a platform. Per capability: a fixture directory of 5–10 REAL
representative inputs (sanitized), a runner script that calls the
capability's seam with a model override, and two graders — (a) the
seam's own normalize/validate + per-capability deterministic
assertions (schema validity, required coverage, provenance
citations present — e.g. the client-interview gap-strip is already
an automatic grader), and (b) a rubric pass by a stronger model for
instruction adherence/omissions, with recruiter (founder) spot
checks. Output: a table per (capability × model): pass rate,
tokens, latency, cost. Runs offline via a script, not in vitest's
suite (paid calls). The mocked-SDK test pattern already in the repo
is the harness's skeleton.

## J. Prompt-caching opportunities (concrete)

Highest value first; the mechanic is `cache_control: {type:
"ephemeral"}` on the last system block, since render order is
tools→system→messages and skills already append after the base:

1. **Copilot** (`src/app/api/copilot/route.ts`) — repeated turns,
   same system+snapshot prefix; the one conversational seam.
2. **The five web/research seams** (`run-company-intelligence`,
   `run-candidate-research`, `run-hiring-manager-research`,
   `run-executive-company-context`, `run-sourcing-search`) —
   biggest prompts, often re-run per mandate.
3. **generate-evaluation / generate-interview-plan /
   generate-client-interview** — long stable doctrine prompts,
   invoked per candidate on the same mandate.

Caveats the implementation must respect: system prompts must be
long enough (Haiku 4.5's minimum cacheable prefix is 4096 tokens —
most Economy seams' prompts will NOT cache on Haiku; Sonnet-class
minimum is 1024); the boundary belongs at the END of the base
prompt, BEFORE skills injection (skills vary per org/project and
would otherwise fork the cache); verification is
`usage.cache_read_input_tokens` — which requires Phase 1's usage
capture first. Caching lives in the **seam/adapter**, driven by a
per-capability flag — not in every prompt builder.

## K. Batch opportunities

Real but small today: `run-weekly-report` and `desk-digest-agent`
(scheduled), future bulk regeneration. The Batches API is 50% off
with ≤24h latency. Verdict: batch belongs in **application
orchestration** (the cron layer that already exists), not in the
router — the caller knows it can wait; the seam should merely
accept an `execution: "batch"` hint later. Defer entirely until a
scheduled workload's spend is visible in Phase-1 numbers.

## L. Cost / observability design (Phase 1 scope)

One table, `inference_runs` (or, cheaper start: a structured log
line + Sentry breadcrumb — the founder should rule): capability,
model, provider, input_tokens, cached_input_tokens, output_tokens,
latency_ms, outcome (ok | schema_failed | provider_error |
refused), retries, escalated_from, project_id nullable, created_at.
No prices in code — cost is computed at read time from ONE pricing
map (single file, versioned), per the proposal's own no-price-
tables rule. Trail impact: NONE — inference telemetry is ops data,
not the org-visible activity trail; the 87-value CHECK does not
widen for this. RLS: deny-all like ops_heartbeats; read path is
founder console/ops surfaces later.

## M. Failure / fallback taxonomy

| Failure | Action | Provider switch? |
|---|---|---|
| 429 / 5xx / 529 | SDK auto-retry (exists), then honest sentence + human retry (exists) | No |
| Timeout / network | Same | No |
| Schema invalid / empty normalize | ESCALATE one tier where Part G names a pair; else mark-failed (090) | No — tier, not provider |
| Zero-row RLS write | Refuse loudly (§129) — NEVER retried anywhere | Never |
| Refusal / safety | Honest sentence; no auto-retry on another model (a refusal is content policy, not capacity) | No |
| DNC / caps / comms policy | Application law — the model is never re-asked | Never |
| Provider outage (future, multi-provider) | Alternate provider same tier ONLY for capabilities the eval harness has certified on that provider | Yes, certified-only |

The standing doctrine (fail soft per-seam, human bookkeeping,
honest sentences) is kept verbatim; the router only ADDS the
schema-failure escalation hop.

## N. Security and governance

The seam boundary is the whole answer: `runInference()` receives
prompt strings and returns validated objects — it never holds a
Supabase client, so provider choice cannot change what an agent
reads or writes. Rules to write into the seam's header as law:
provider keys stay in env/Vercel (never DB — the registry stores
key *names*, Part R); Skills keep influencing judgment only —
`applySkillsToPrompt` output is prompt text and skills gain no
vocabulary to name models/providers/tiers; agents never choose
models (the capability map is code/founder-data, not model output);
org context flows into telemetry and (later) org policy filtering,
never into prompt-visible configuration. Future org restrictions
("Anthropic only", "US region only") become a WHERE-clause over the
Part R registry — cheap to retrofit precisely because selection is
already centralized; nothing more is needed now.

## O. Implementation sequence (each its own gate, R4 style)

1. **Slice 1 — the seam + usage capture + registry map** (+ the
   incidental fixes it makes free: web-search version drift, and
   the Sonnet 5 upgrade *decision* staged behind evals). No
   behavior change; pure refactor + telemetry.
2. **Slice 2 — prompt caching** on Part J's list; verify via
   captured `cache_read_input_tokens`.
3. **Slice 3 — eval harness** + Sonnet 5 and Haiku benchmarks; then
   flip Economy capabilities in the map where evals pass.
4. **Slice 4 — founder/admin model management** (Part R) with
   cross-provider adapters only if slice-3 data justifies them.
5. Escalation pairs, org provider policy, batch — each only when
   its predecessor's data exists.

## P. Deliberately deferred

Multi-provider adapters and SDKs · the runtime "task requirements"
object · a DB-backed capability policy (code map first; DB when
Part R lands) · org-level provider restrictions (schema-anticipated
only) · batch execution mode · per-candidate/per-mission cost
aggregates · billing anything · automatic cross-provider failover ·
any change to the marketing demo · model-reported-confidence
signals (rejected outright, not deferred).

## R. ADDED — Founder/Admin-managed providers and models

The proposal's missing piece, drafted here as recorded direction
(gates with slice 4):

- **`model_providers` + `provider_models` as data**, on the
  caps-as-data precedent (088) and Skills Studio's admin surface
  pattern (102): provider row = name, adapter kind (anthropic |
  openai | google | …), env var NAME for its key, status,
  data_region note; model row = provider, model id, tier,
  supports_structured_output / tools / web / streaming, context,
  max output, cache minimum, status (active | benchmarking |
  retired), pricing snapshot for estimates.
- **Admin-gated writes exactly like Skills**: founders/admins add a
  provider or model from a settings surface; RLS admin-only;
  changes recorded on the trail as new admin intents
  (`model_provider_added` / `model_assignment_changed` — CHECK
  widens at THAT gate, not now).
- **Keys never enter the database.** Adding a provider stores the
  env-var name; the founder sets the secret in Vercel by hand (the
  standing env-pair doctrine — the session may not write env
  files, and neither may the app).
- **Activation is gated by evals, structurally**: a capability can
  only be assigned a model whose registry row is `active`, and a
  row can only become active from `benchmarking` — the eval
  harness's pass is the door. An admin can therefore ADD any
  model, but cannot put an unbenchmarked model in front of
  customers.
- **Capability assignments** (capability → model + fallback) become
  the DB successor of slice 1's code map, admin-editable per the
  same gate; org-level allow/deny lists slot in as a filter when an
  enterprise customer first needs one.
- **R1–R3 carry over**: no verdicts changes, no outbound changes;
  agents and Skills gain no say in any of these tables.

## Q. Decisions requiring the founder's approval

1. Sequence as in Part O — wrapper-first, router-later? (The
   review's core recommendation.)
2. Slice 1 telemetry sink: `inference_runs` table (migration) vs
   structured logs first? (Recommend the table — dashboards and
   pricing math need queryable rows.)
3. Approve benchmarking Sonnet 5 as the Standard/Premium default
   (same price, current generation) and Haiku 4.5 for the five
   named Economy capabilities?
4. Authorize the throwaway cross-provider eval SPIKE (H.3 — adds no
   product dependency), or stay Anthropic-only until in-family
   savings are exhausted?
5. Confirm Part R's direction (registry-as-data, keys-in-env,
   eval-gated activation, admin surface on the Skills pattern) as
   the recorded design for founder/admin-added models?
6. Confirm the demo route and both portal doors are out of scope.

Numbers at drafting: 38 model-calling files, 35 structured-output
seams, 6 web seams (5 on `web_search_20250305`, 1 on
`web_search_20260209`), 1 streaming seam, 0 cache_control, 0 usage
reads, model constant `claude-sonnet-4-6` ×38; vitest 996; next
migration 118, next § 146, next drive 104.
