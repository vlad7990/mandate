# THE ESCALATION HOP HAS A CEILING — THE GATE — 2026-10-08 — DRAFT

**Awaiting the founder's word. Four rulings. D1 sets the two numbers; D2 decides
whether a ceiling is cheaper than deleting the feature; D3 decides who may see
what a model call cost; D4 decides whether the eval harness shares this
instrument or gets its own.**

Reserves migration **163** (current tip: `162_the_escalation_target_is_a_known_model.sql`).
Nothing is applied. The SQL in Part 4 is a draft awaiting the rulings below.

The ask: **"draft the ceiling design."** It follows C9 (2026-10-08), which made
`escalateInference` refuse a `to` model that is not `active` in
`provider_models`. That closed the authority hole — the hop can no longer reach
an unbenchmarked model — and left the money hole open: nothing anywhere bounds
how many hops happen.

---

## Part 1 — What it does today, measured

### Lifetime production AI spend is $4.12

Read from `inference_runs` joined to `provider_models` prices on 2026-10-08
(cache reads at 0.1×, cache writes at 1.25×, the Anthropic multipliers):

| model | runs | input | cache write | output | est. cost |
|---|---|---|---|---|---|
| `claude-sonnet-4-6` | 61 | 766,093 | 4,545 | 69,719 | $3.3611 |
| `claude-sonnet-5` | 14 | 121,098 | 0 | 25,970 | $0.7528 |
| `claude-haiku-4-5` | 1 | 4,209 | 0 | 664 | $0.0075 |
| **total** | **76** | | | | **$4.1215** |

Two months of production, 76 model calls, four dollars. Every cost argument
below is an argument about a bill that does not yet exist.

### Every run in history succeeded

`outcome` across all 76 rows is `ok`. **Zero `schema_failed`, zero
`provider_error`, zero `refused`.**

This is stronger than the fact the tracker has been carrying ("escalation has
fired 0 times ever"). The hop's *precondition* has never occurred either. There
has never been a deterministic schema failure on any capability, so the
escalation branch in `generate-evaluation.ts:168` has never been entered — not
once, on the 7 `generate_evaluation` runs that exist.

### The hop is currently inert anyway

C9's gate holds it shut: `generate_evaluation`'s pair targets `claude-opus-5`,
which is `benchmarking`, and a non-`active` target skips the hop. So today the
exposure is zero by two independent mechanisms — no trigger, and a closed gate.

**This spec is about the state after someone benchmarks opus-5 and activates
it,** which is the moment both mechanisms fall away at once.

### Where ceilings already exist, and where they do not

| path | ceiling | instrument |
|---|---|---|
| `/api/demo` | 10/hr/IP, **200/day global** | `rate_limit_policy` scope `demo_ip` |
| `/apply` | yes, fails closed | `limitClosed("apply", …)` |
| HM + portal submit | 5/hr/token, 300/day | `hm_submit_*`, `portal_submit_*` |
| `regenerateEvaluationAction` (signed in) | **none** | — |
| the inference seam, any capability | **none** | — |
| the escalation hop | **none** | — |

The pattern is consistent and deliberate: anonymous doors where a stranger can
spend our money are capped; authenticated paths are bounded by a human clicking.
`regenerateEvaluationAction` is the relevant one — a recruiter can re-run a
`generate_evaluation` as often as they like, and with opus-5 armed, each failure
is a premium call.

### The shape of the risk is fan-out, not volume

An escalation is triggered by *failure*, and failures correlate. A prompt
regression, a provider-side format change, or a `max_tokens` squeeze does not
produce one schema failure — it produces one per call until someone notices.
`generate_evaluation` runs on every candidate. A bulk CV intake of 40 candidates
against a newly-broken prompt is 40 sonnet-5 calls **plus 40 opus-5 calls**, and
the second 40 are the expensive ones.

"One hop, never a chain" bounds a single request. Nothing bounds the aggregate.
That is the hole.

---

## Part 2 — Why a COUNT ceiling, not a dollar ceiling

A dollar ceiling is the obvious instrument and it is the wrong one here, for
three reasons that compound.

**1. The target has no price.** `claude-opus-5` carries
`price_input_per_mtok = NULL` and `price_output_per_mtok = NULL` — left NULL on
purpose by migration 162, which reasoned that *"writing plausible-looking
numbers for opus-5 would put invented data in the table that cost reporting
would then treat as fact."* That discipline was right and it has a consequence:
a dollar cap on the one model this ceiling exists to bound would either divide
by NULL (a no-op) or be computed from a number nobody measured (a lie). **Prices
must come from the provider's published documentation, entered by a human, not
inferred by whoever implements this.**

**2. Cost is knowable only after the call.** Tokens arrive in the response's
`usage` block. A *pre-call* dollar check must estimate input tokens from the
request and guess output tokens, and the guess is worst at exactly the moment
that matters — a runaway prompt. A count check needs no estimate.

**3. A count is the honest unit for this event.** The thing being limited is
"how many times may we retry on the premium tier", which is a count. Converting
it to dollars adds a conversion step, a price dependency, and a rounding
argument, and bounds the same thing less precisely.

**Dollars remain the right unit for the eval harness** (C2), where the run is
offline, bounded, and its token volume is known before it starts. That is D4.

---

## Part 3 — The mechanism: reuse 088, build nothing

`check_rate_limit(p_scope, p_key)` from migration 088 already is this ceiling.
It offers exactly the three knobs needed, as data:

```sql
rate_limit_policy (scope, per_key_limit, window_seconds, global_daily_limit)
```

and it already checks the **global counter first** — 061's ordering, so a spent
day does not also burn a project's own allowance on a call that was never going
to run. The global daily cap is the one that actually bounds spend; the per-key
cap stops one project monopolising it.

### Three things that need care

**(a) The seam may not hold a product Supabase client.** `inference.ts` states
the law: *"this module never holds a product Supabase client… Its ONLY database
access is the service-role telemetry insert."* But `limitClosed` in
`src/lib/rate-limit/server.ts` goes through `createServerSupabaseClient()` — a
session client under RLS. Two reasons that cannot be used here:

- it would break Part N, putting an RLS-scoped read inside the one module that
  is forbidden one;
- **there is often no session.** Inference runs from cron (`run_search_health`
  and `run_weekly_report` are 32 of the 76 runs, all from the Monday sweep).
  A session client in a cron context has no user.

So this needs a service-role sibling. `rate_limit` and `rate_limit_policy` are
two of the four deny-all-RLS tables, and `check_rate_limit` is SECURITY DEFINER,
so a service-role call reaches it correctly. The seam's law is extended by one
sentence, not broken: its database access becomes *the telemetry insert and the
ceiling check, both service-role, neither touching product data.*

**(b) Fail closed — and notice that fail-closed is free here.** Money fails
closed (088's rule). For this caller, "closed" means *skip the hop and let the
caller's original schema error stand* — which is byte-identical to what C9
already does for an unknown model status, and to what the product did before
escalation existed at all. So:

> Every negative answer — no pair, wrong from-model, non-active target,
> unreadable registry, ceiling exceeded, ceiling unreachable — produces the
> same outcome: no hop, original error surfaces.

One outcome, six reasons. That is why this ceiling can be added to the seam
without the usual fail-closed anxiety: the closed state is the status quo.

**(c) An unknown scope RAISES.** `check_rate_limit` raises on a scope with no
policy row, by design, so a typo routes through the caller's fail mode. Here
that is fail-closed → skip the hop. **Therefore deploy order does not matter:**
ship the code before migration 163 and escalation stays disarmed, which is where
it already is. No window of unbounded spend exists in either order.

---

## Part 4 — Migration 163, DRAFT, not applied

Two policy rows. Numbers are D1 and the ones below are placeholders carrying my
recommendation, not a decision.

```sql
-- 163 — THE ESCALATION HOP HAS A CEILING
--
-- C9 stopped escalation reaching a model the product has not benchmarked.
-- It did not bound how many hops may happen. Escalation is triggered by
-- failure, and failures correlate: one broken prompt turns a 40-candidate
-- intake into 40 premium retries. "One hop, never a chain" bounds a
-- request; nothing bounded the aggregate.
--
-- Caps as data, on 088's existing function. Fail-closed costs nothing
-- here: a refused hop is exactly the pre-escalation behaviour, so the
-- caller's original schema error surfaces either way.
--
-- Scope naming: one scope per capability that owns a pair, so a runaway
-- in one seam cannot spend another's allowance, and so the numbers can
-- diverge without a code change.

INSERT INTO public.rate_limit_policy
  (scope, per_key_limit, window_seconds, global_daily_limit)
VALUES
  -- Keyed on project_id. 5/hr/project catches a single recruiter
  -- re-running a broken evaluation; 50/day globally is the cap that
  -- actually bounds the bill.
  ('ai_escalation_generate_evaluation', 5, 3600, 50),
  -- Dormant today (parse_cv runs sonnet-4-6, its pair's from is
  -- haiku-4-5). Present so the flip that arms it does not also need a
  -- migration — the pair arming and the ceiling existing should not be
  -- two separate acts of remembering.
  ('ai_escalation_parse_cv', 10, 3600, 100)
ON CONFLICT (scope) DO UPDATE
  SET per_key_limit      = EXCLUDED.per_key_limit,
      window_seconds     = EXCLUDED.window_seconds,
      global_daily_limit = EXCLUDED.global_daily_limit;
```

**Sizing rationale, so the numbers are arguable rather than arbitrary.** The
busiest real month was 76 calls *in total*, of which 7 were
`generate_evaluation`. A 50/day global hop cap is therefore ~7× the entire
historical `generate_evaluation` volume — generous enough that no legitimate
pilot workload touches it, small enough that a runaway stops inside one day at a
cost bounded by 50 premium calls. If opus-5's input is in sonnet-5's
neighbourhood, that is single-digit dollars; the true figure cannot be stated
until someone fills in the prices (Part 2, reason 1).

---

## Part 5 — The code, file by file

Nothing below is written yet. It is deliberately small.

**`src/lib/rate-limit/server.ts`** — add one function:

```ts
/** Tier 1 (money) from a context with no user session — cron, and the
 *  inference seam, which may not hold a product client (Part N). Same
 *  refusal semantics as limitClosed; service-role client because
 *  rate_limit is deny-all RLS and check_rate_limit is SECURITY DEFINER. */
export async function limitClosedServiceRole(
  scope: string,
  rawKey: string
): Promise<RateVerdict>
```

Factored by giving the existing private `check()` a client parameter, so the two
tiers keep sharing one body and the D3 split stays in one place.

**`src/lib/ai/inference.ts`** — one check in `escalateInference`, placed **after**
the activation check so an inert pair never consumes ceiling budget (the
activation read is a 60-second cache; the ceiling check is a write):

```ts
const verdict = await limitClosedServiceRole(
  `ai_escalation_${capability}`,
  opts?.projectId ?? "no-project"
);
if (!verdict.allowed) {
  warnEscalationBlocked(capability, pair.to, "ceiling");  // existing warn-once
  return null;
}
```

`warnEscalationBlocked` already exists from C9 and already latches once per
`(capability, model, reason)`; `"ceiling"` is a third reason, not a new
mechanism.

**Key choice.** `projectId`, raw — not hashed. 088 hashes keys because *"the
database never learns a caller's address"*; a project UUID is already a primary
key in that database, so hashing it would obscure the ops trail for no privacy
gain. Worth stating in the code, because every other call site hashes.

**Null projectId.** Cron paths pass none; they share one `"no-project"` bucket.
A shared bucket is more restrictive, never a bypass — the `clientIpFrom`
fallback reasoning, reused.

---

## Part 6 — Tests

Extending `inference.test.ts`'s `"the activation gate (C9)"` block, whose mocked
`provider_models` already defaults to production's own state:

1. ceiling allows → the hop fires (opus-5 activated in the mock)
2. ceiling refuses → no hop, original error stands, warn-once fires with the
   ceiling reason
3. ceiling **unreachable** → no hop (fail closed, and the Sentry capture happens)
4. **an inert pair never consults the ceiling** — the activation check short-
   circuits first, so a disarmed pair costs neither a registry read nor a
   counter write. This is the ordering test; it is the one that will catch a
   future refactor that moves the checks around.
5. `limitClosedServiceRole` uses the service-role client, not a session client —
   pinned because using the session client would both break Part N and fail
   silently in cron, which is the combination that stays hidden longest.

---

## Part 7 — The rulings

**D1 — the two numbers.** `per_key_limit`/`window_seconds` per project, and
`global_daily_limit`. Recommendation above: 5/hr/project, 50/day global for
`generate_evaluation`. Both are data, changeable without a deploy.

**D2 — ceiling, or delete the pair?** The honest alternative. `generate_evaluation`'s
escalation has never been triggered in 76 runs over two months, its target is
unbenchmarked, and arming it requires an eval run that is itself unauthorised.
Deleting `ESCALATION_PAIRS.generate_evaluation` would remove the risk entirely
and cost a capability nobody has used. **My recommendation is to keep the pair
and build the ceiling**, because the pair is cheap to hold (C9 keeps it inert,
and its arming is a visible failing test), and because the day a provider
changes an output format is exactly the day a retry on a stronger model earns
its keep. But if the answer is "we will never pay for an opus-5 eval", deleting
the pair is more honest than carrying a feature that cannot run.

**D3 — may cost be displayed?** Part 1's table was computed by hand from a join
nothing in the product performs. A `cost_estimate_usd` column on the models
screen, or an ops tile, would make "authorise a spend ceiling" (C2) a decision
with a number behind it instead of a blank cheque. Requires: prices for opus-5,
and a ruling on who may see spend (`models:write` holders? ops only?).

**D4 — does the eval harness share this instrument?** It should not. C2's
blocker is *"authorise a spend ceiling for an eval run"* — an offline, bounded,
dollar-denominated budget, which is a different shape from a per-project hourly
counter. The harness already runs behind `MANDATE_EVAL=1`, where the registry is
never consulted and escalation never fires, so it is untouched by everything
above. Its ceiling is a separate gate.

---

## Part 8 — Out of scope, deliberately

- **A general per-capability AI spend ceiling.** Every capability could carry a
  policy row and the seam could check on every call. That is a bigger change to
  the hottest path in the product, it would put a counter write in front of 76
  calls that cost four dollars, and it is not what the escalation risk needs.
  Revisit when spend is legible (D3) and a real bill exists.
- **A rate limit on `regenerateEvaluationAction`.** A real gap (Part 1's table)
  and a different owner: it bounds an authenticated human, not a failure
  fan-out, and it belongs with the other authenticated-door decisions rather
  than in the inference seam.
- **Cost math in the seam.** `inference.ts` lists cost math among the things
  deliberately absent. Part 2 is the argument for why this ceiling does not
  require breaking that.
- **Benchmarking opus-5.** Needs authorised spend; it is C2, not this gate.
