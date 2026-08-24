# NEXT — Rate limiting (the deferred list's second item)

Status: **Phase 0 complete — D1–D8 drafted, awaiting the founder's
written D-confirmation. No build work past this file until then.**

Second item of the deferred build list (Sentry ✓ §60 → **rate
limiting** → Resend → Stripe), opened on the founder's word
2026-08-24. Next migration: **088** — the first since the
fourteen-agent map closed.

The bundle has been accumulating named members since §30: the HM
submit door (which triggers a paid model call anonymously),
`/auth/recover`, the candidate portal, and `/request-access` (with
captcha, per the pre-launch checklist).

---

## Phase 0 — enumeration from the code (the §5h rule)

### The prior art this slice must extend, not reinvent

**Migration 061 already solved this once**, for `/api/demo`, and its
reasoning is the slice's foundation:

- The limiter began as a module-scoped `Map`. On Vercel that means
  *per instance* — "10 per hour per IP" was really "per IP per
  instance", with no ceiling on instances, resetting on every deploy
  and cold start.
- 061 moved both counters into **Postgres**: a `bucket_key` primary
  key with the window baked into the key (`ip:<addr>:<YYYYMMDDHH24>`,
  `global:<YYYYMMDD>`), so expiry is a delete and there is no window
  arithmetic to get wrong. RLS on with **zero policies** — the
  SECURITY DEFINER function is the entire API, which is what actually
  closes the table to `anon`.
- **Two limits, because they stop different things**: per-IP stops
  one hammering visitor; a **global daily cap** is the circuit
  breaker that actually bounds spend, because a per-IP limit is
  worthless against a caller with many IPs and rotating IPs is cheap.
- It **fails closed**: an outage should cost nothing.

Everything below is that shape, generalised.

### The doors, enumerated by what abusing them COSTS

**Tier 1 — anonymous and billed (a stranger can spend our money):**

| Door | Shape | Today |
|---|---|---|
| `/api/demo` | web_search + tokens | **LIMITED (061)** — 10/hr/IP, 200/day global |
| `/hm/[token]/api/submit` | `verify_hm_token` → `after()` → `runHmFeedbackPipeline` — a full interpreter-agent run | **UNLIMITED** (the §30 verdict named it) |
| `/portal/api/mandates/[id]/submit` | same pipeline, external-identity token | **UNLIMITED** |

**Tier 2 — anonymous, unbilled, but abusable:**

| Door | Shape | Abuse |
|---|---|---|
| `submitAccessRequestAction` | `waitlist` INSERT | table spam; the checklist also wants captcha |
| `requestRecoveryAction` | `resetPasswordForEmail` | mail-bombing a real person; user enumeration |
| `signInAction` | `signInWithPassword` | credential stuffing |
| `signUpAction` | `auth.signUp` | account spam |
| `/candidate/[token]` actions | contact update, withdraw, erasure, **CV upload to storage** | storage fill; token-gated |

**Tier 3 — authenticated but unmetered:**
`/api/copilot` (streaming model call, session-gated by the proxy but
with no per-user ceiling) and the fourteen agent surfaces. A signed-in
member can spend without bound. Lower priority — there is a name on
every request and a kill switch on every agent.

### The mechanical note

Server actions can be limited: `headers()` yields `x-forwarded-for`
inside an action exactly as it does in a route handler. No door needs
restructuring; each gains a guard line.

---

## Decisions for confirmation

### D1 — Generalise 061 rather than add a vendor

`088` promotes `demo_rate_limit` into a general
`public.rate_limit` table plus **`check_rate_limit(p_scope text,
p_key text)`** — same bucket-key-carries-the-window design, same
zero-policy RLS, same SECURITY DEFINER-is-the-whole-API shape, same
opportunistic prune. Caps live in ONE table
(`rate_limit_policy`: scope, per-key limit, window, global daily cap)
so a ceiling is a data change, not a deploy. `/api/demo` migrates onto
it with its numbers unchanged; `check_demo_rate_limit` stays as a
thin wrapper for one release so nothing breaks mid-deploy.

**Not Upstash/Redis**: 061 already argued it — "a counter is not
worth an Upstash account", Postgres is already the boundary for
everything else, and a second datastore is a second thing that can be
down. **Not the Vercel WAF as the primary**: its rules are per-IP and
per-path, blind to the token, the org, and the tier — it cannot fail
open for identity and closed for money (D3), and it is plan-gated.
See D8 for where it *does* belong.

### D2 — Which doors, and the caps

Tier 1 (**fails closed**):
- `hm_submit` — **5 per token per hour**, 30 per IP per hour, **300
  per day global**. The token is the honest key: it is one hiring
  manager's one review, and five submissions in an hour is already
  generous.
- `portal_submit` — same numbers, keyed on the external identity.
- `demo` — unchanged (10/hr/IP, 200/day), migrated onto the new table.

Tier 2 (**fails open**, see D3):
- `access_request` — 3/hr/IP, 100/day global.
- `password_recovery` — 3/hr/IP **and 3/hr per email address hash**
  (the email is the abused resource, not the IP), 200/day global.
- `sign_in` — 10/hr/IP, no global cap (a global cap on sign-in is a
  self-inflicted outage).
- `sign_up` — 5/hr/IP, 100/day global.
- `candidate_portal_write` — 20/hr per token.

Tier 3 — **not in this slice** (D8).

### D3 — Fail closed for money, fail OPEN for identity

061 fails closed, correctly: an outage should cost nothing. But
applying that uniformly would mean a limiter outage **locks every
user out of the product** — a self-inflicted outage strictly worse
than the abuse it prevents. So the rule is split and stated:

- **Tier 1 (billed) fails CLOSED** — refuse, spend nothing.
- **Tier 2 (identity/waitlist) fails OPEN** — allow, and record the
  degradation loudly (server log + a Sentry capture, which §60 just
  made possible). A brief unlimited window on sign-in is survivable;
  a lockout is not.

Every fail-open path is a `captureSeamError` with a `seam:
rate-limit` tag, so "the limiter was down" is a fact we hold rather
than a thing we assume.

### D4 — Captcha on `/request-access`

**In scope, as Cloudflare Turnstile** — free, privacy-preserving, no
account-linking, and the pre-launch checklist names it beside rate
limiting. Provisioning is founder-hand (site key + secret, the
`AGENT_*` env shape, §59's amended-D2 lesson: **set the public site
key `--no-sensitive` or it will not reach the browser**). The verify
call is server-side in the action, and — per D3's split — a Turnstile
**outage fails open with a captured warning**, because a broken
captcha must not close the only door a new customer has.

If the founder prefers to defer captcha, the rate limit alone still
lands and D4 becomes an out-of-scope line; the two are independent.

### D5 — What the reader sees

A refusal is honest and specific, never a generic error, and it says
when to come back. Route handlers answer **429 with a `Retry-After`
header**; actions throw an authored sentence (the plain-`Error`
branch — so, per §59's D3, these never become Sentry events, being
outcomes rather than faults):

- HM/portal submit: *"This review has already been submitted several
  times in the last hour. Your feedback is safe — try again in N
  minutes."*
- Recovery: *"A reset link has already been requested for this
  address. Check your inbox, or try again in N minutes."* — the same
  sentence whether or not the account exists (**no enumeration**).
- Sign-in: *"Too many sign-in attempts from this location. Try again
  in N minutes."*
- Access request: *"We've already received a request from you. We'll
  be in touch."*

### D6 — What a counter may remember

An IP address is personal data. The bucket key stores a **salted
hash** of the IP (and of the email, for the recovery key), never the
raw value — the counter needs identity-of-caller, not identity-of-
person, and a hash serves the former exactly. Nothing about rate
limiting enters the activity trail: it is infrastructure, not a
recruiting act, and §30–§58's vocabulary stays closed. Sentry
receives scope enums and counts only, never a key — §59's D4 already
refuses bodies and headers, and this keeps the *tags* honest too.

### D7 — The boundary stated

The limiter is a **counter, not an authority**: it never decides who
someone is, only how often that someone may knock. It holds no
policy about roles, orgs, or capabilities — those are RLS's, and one
layer with one job each is why this codebase can reason about either.
A door that is rate limited is still fully guarded by everything that
guarded it before; the limit is added in front, and removing it
weakens nothing but the ceiling.

### D8 — Out of scope

- **Tier 3 per-user ceilings** (copilot, the fourteen agent
  surfaces): every request has a name and every agent has a kill
  switch. Queue it behind first-client usage data, when we know what
  normal looks like.
- **The Vercel WAF / BotID** as a coarse outer layer: genuinely
  complementary (it drops floods before they reach a function, where
  ours costs a Postgres round-trip), but plan-gated and founder-hand,
  and it cannot express D3's split. Recommended as a *later*
  belt-and-braces, not as this slice's mechanism.
- **Distributed/burst algorithms** (token bucket, sliding window):
  061's fixed window is coarse and that is fine at this scale; the
  shape moves without callers changing if it ever is not.
- **Alerting on limit breaches** — channel-shaped, joins Resend
  (§58/§60's standing item).

---

## Phases 1–4 — the proven ladder (GATED)

**No build work past Phase 0 until the founder's written
D-confirmation.** Then: **Phase 1** — migration 088 (the generalised
table, function, and policy rows; `/api/demo` migrated with its
numbers intact) plus `rate_limit_invariants.sql` in the house idiom —
the counter increments and refuses at the boundary, the window rolls,
the global cap trips independently of the per-key cap, the table
answers `anon` ZERO rows directly (the zero-policy pin), a raw IP
never appears in a bucket key, and a **control run** that drops the
global cap conjunct and proves the harness catches unbounded spend.
**Phase 2** — the guards at the enumerated doors, D5 sentences, D3's
split wired and each fail-open path capturing; Turnstile if D4 is
confirmed; green gate. **Phase 3** — driven live on production: a
real HM token submitted past its ceiling (refused with the sentence,
the review still safe), recovery limited without enumeration, sign-in
limited then recovering after the window, the global cap tripped in a
scratch scope, and the limiter's own outage simulated to prove money
fails closed while identity fails open. **Phase 4** — §61 drafted
with verdicts; no completion declaration until the founder's written
confirmation; this file is deleted only after it.
