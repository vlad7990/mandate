# Stripe Billing — Design

**Date:** 2026-08-10
**Status:** Design — 6 decisions approved by user; awaiting spec approval before implementation
**Depends on:** `public.organizations` (tenant table, mig 002), `public.current_user_org_id()` (mig 004)
**Migration:** **039** — see *Migration numbering collision* below
**Mode:** Stripe **test mode only** for this build. Live mode is a separate, later change.

## Purpose

Turn the three plans already advertised on the landing page into real, enforced,
Stripe-backed subscriptions — and gate the five features those plans promise but which
currently ship to every account.

Stripe is the **source of truth** for subscription state. The database holds a *mirror*,
written only by the webhook. Nothing in the app grants an entitlement on its own authority.

## Decisions (approved)

1. **Flat per-account subscription.** One subscription per organization. Seats and searches
   are entitlement *limits*, not billed quantities. No proration maths, no seat-sync.
2. **Executive Intelligence is a separate add-on** — a second line item on the same
   subscription, not bundled into any tier.
3. **No free trial.** Access is already waitlist + founder-approved; approved accounts
   subscribe immediately. No trial-expiry states, no unpaid AI spend.
4. **Seat enforcement deferred.** `seat_limit` is stored as an entitlement but **not
   enforced** — there is no membership table to enforce against. Search caps and feature
   gates *are* enforced now.
5. **Monthly-only.** The "Save 20% with annual billing" line comes off the landing page in
   this build. No annual prices created.
6. **All five advertised features gated** — HM Portal, Triangulation, calibration
   history + restore, Global Executive Network, custom skills.

## Scope

**In:** Stripe products/prices (test mode), migration 039, entitlement resolution library,
`/api/stripe/webhook`, Checkout + Customer Portal flows, `/settings/billing`, five feature
gates, active-search cap, landing-page copy fix, tests.

**Out:** live mode, annual prices, seat enforcement, multi-tenancy, usage metering, invoice
emails (Resend is a separate checklist item), tax/VAT collection, dunning email content,
in-app upgrade/downgrade UI beyond the Portal.

## Prior art — adapt, don't rebuild

`vlad7990/orravia-health` already runs this integration on the same stack (Next.js App
Router + TypeScript + Supabase admin client) with the same file layout. **Adapt it rather than
writing from scratch.** Conventions carried over:

- **Pin the Stripe API version** (orravia pins `2025-08-27.basil`). Letting Stripe choose means
  a server-side API upgrade can change response shapes under a running deployment.
- **Integer cents, never floats.** `39900` / `99900` / `189900`. Divide by 100 only at the
  render boundary.
- **`getStripe()` returns `null` when unconfigured**, so routes degrade to a clear "billing not
  set up" response instead of throwing at import time and taking the route tree down.
- **`toIso(epochSeconds)`** — Stripe sends epoch seconds, Postgres stores ISO-8601 UTC.
- `HANDLED_WEBHOOK_EVENTS` as a const array + `isHandledEvent` guard.
- `maxNetworkRetries: 2`.

`vlad7990/cortex-os` independently implements a signed-webhook receiver with a
`billing_provider_events` table — the same event-ledger design as `stripe_events` here, which
means the approach is already proven twice in-house.

**Deliberate divergences from orravia:**

| orravia | Mandate | Why |
|---|---|---|
| Idempotency via upsert on `stripe_subscription_id` alone | Event ledger **+** live re-fetch | Upsert-on-latest-event writes backwards when Stripe delivers out of order |
| Trusts the event payload | Re-fetches the subscription from Stripe | Ordering is not guaranteed |
| Maps `trialing → active` | No trial branch | Decision 3 — no trials |
| Prices are unapproved dev fixtures | Prices are approved and already public | Landing page has advertised them since May |

Do **not** carry over orravia's branding, plan names, copy, or health-domain logic.

## Migration numbering collision

`docs/superpowers/specs/2026-08-10-executive-risk-reviews-design.md` also claims migration
**039** for `executive_risk_reviews`. Billing is being built first, so:

- **Billing takes 039.**
- **Risk Reviews moves to 040.** That spec's "Data model (migration 039)" heading needs
  updating when Risk Reviews is picked up. Flagged, not yet edited — it's an approved spec
  and I won't touch it without the go-ahead.

## Stripe object model

Four products, one monthly price each. Test mode.

| Product | Price | Env var | Plan key |
|---|---|---|---|
| Mandate Starter | $399 / mo | `STRIPE_PRICE_STARTER` | `starter` |
| Mandate Growth | $999 / mo | `STRIPE_PRICE_GROWTH` | `growth` |
| Mandate Agency | $1,899 / mo | `STRIPE_PRICE_AGENCY` | `agency` |
| Executive Intelligence (add-on) | **TBD — open item** | `STRIPE_PRICE_EI_ADDON` | `ei_addon` |

**Price IDs are configuration, never hardcoded amounts.** The price→plan map lives in
`src/lib/billing/plans.ts` and reads env. Changing a price in Stripe must never require a
code change to the *amount*; only a new price ID rotation does.

**One subscription, two items.** Base plan + optional EI add-on ride on a single
subscription: one invoice, one Portal, one lifecycle, one set of webhooks. Two separate
subscriptions would double every state transition for no benefit.

## Data model — migration 039

### `public.organizations` — billing mirror columns

```
stripe_customer_id       text unique              -- set once, never reassigned
stripe_subscription_id   text unique
plan                     text not null default 'none'
                           check (plan in ('none','starter','growth','agency'))
plan_status              text not null default 'inactive'
                           -- mirrors Stripe: active, past_due, canceled, incomplete,
                           -- incomplete_expired, unpaid, paused, inactive
ei_addon                 boolean not null default false
seat_limit               integer                  -- stored, NOT enforced (decision 4)
active_search_limit      integer                  -- enforced
current_period_end       timestamptz
cancel_at_period_end     boolean not null default false
billing_exempt           boolean not null default false
billing_updated_at       timestamptz
```

`billing_exempt` is **load-bearing**: it is how founder/internal orgs (`mandate-hq`, seeded in
mig 002) keep full access without a subscription. Without it, shipping this migration locks
you out of your own product. Exempt orgs resolve to full Agency + EI entitlements and skip
every gate.

### `public.stripe_events` — idempotency ledger

```
id            text primary key       -- Stripe event id (evt_...)
type          text not null
received_at   timestamptz not null default now()
payload       jsonb not null
```

Append-only (INSERT + SELECT policies only, no UPDATE/DELETE), matching the
`executive_audit_events` pattern. The webhook inserts the event id first; a duplicate key
violation means "already processed" and the handler returns 200 without re-applying. Stripe
retries aggressively — this is what makes retries safe.

### Entitlement resolution

Resolution is **derived, never stored as a blob**. One TS module is the single source of
truth for the plan matrix:

| Entitlement | none | starter | growth | agency |
|---|---|---|---|---|
| Core 14 agents | ✗ | ✓ | ✓ | ✓ |
| Active searches | 0 | 3 | 10 | ∞ |
| Seats *(stored, unenforced)* | 0 | 1 | 5 | ∞ |
| HM Portal | ✗ | ✗ | ✓ | ✓ |
| Triangulation | ✗ | ✗ | ✓ | ✓ |
| Calibration history + restore | ✗ | ✗ | ✓ | ✓ |
| Global Executive Network | ✗ | ✗ | ✗ | ✓ |
| Custom skills | ✗ | ✗ | ✗ | ✓ |
| Executive Intelligence | add-on | add-on | add-on | add-on |

EI is orthogonal — `ei_addon` is true or false regardless of base plan.

`src/lib/billing/entitlements.ts` exposes:
- `resolveEntitlements(org)` — pure function, org row → entitlement set. Unit-tested across
  every plan × status × exempt combination.
- `requireEntitlement(feature)` — server-side guard; throws/redirects when absent.

**Statuses that grant access:** `active`. **Grace:** `past_due` keeps access (Stripe smart
retries run ~3 weeks) with a persistent warning banner. **Revoked:** `canceled`, `unpaid`,
`incomplete_expired`, `paused`, `inactive` → entitlements drop to `none`.

## Webhook — `/api/stripe/webhook`

```
runtime = 'nodejs'          // raw body required; Fluid Compute default, not edge
dynamic = 'force-dynamic'
```

**Order of operations, strictly:**

1. Read the **raw** body via `await req.text()` — not `req.json()`. Signature verification
   fails on a re-serialized body.
2. `stripe.webhooks.constructEvent(raw, sig, STRIPE_WEBHOOK_SECRET)`. Invalid signature → 400,
   no processing.
3. Insert into `stripe_events`. Duplicate → return 200 immediately (already handled).
4. **Re-fetch the subscription live from Stripe** (`subscriptions.retrieve`) rather than
   trusting the event payload.
5. Map price IDs → plan + `ei_addon`, write the mirror onto `organizations`, stamp
   `billing_updated_at`.
6. Return 200. Any unhandled throw → 500 so Stripe retries.

Step 4 is the important one. **Stripe does not guarantee event ordering.** A stale
`subscription.updated` arriving after a newer one would otherwise write backwards — silently
restoring an entitlement the customer just cancelled. Re-fetching makes the handler
order-independent by construction, which is cheaper and far more reliable than comparing
timestamps.

**Events handled:**

| Event | Action |
|---|---|
| `checkout.session.completed` | Bind `organization_id` (from `client_reference_id`) ↔ `stripe_customer_id`. **Binding only — grants nothing.** |
| `customer.subscription.created` / `.updated` / `.deleted` | The sole source of entitlement state. Re-fetch → write mirror. |
| `invoice.payment_failed` | Surface dunning banner (status arrives via the subscription event). |
| `invoice.paid` | Clear dunning banner. |

Everything else: record in `stripe_events`, return 200, no action.

**The webhook has no user session**, so it writes through the service-role client
(`src/lib/supabase-service-role.ts`), bypassing RLS. It is the *only* code path permitted to
write billing mirror columns.

## Checkout and Portal

**Checkout.** Server action → `stripe.checkout.sessions.create` with `mode: 'subscription'`,
`client_reference_id: organizationId`, `metadata.organization_id`, line items = chosen plan
price (+ EI price when selected), `success_url` / `cancel_url` back to `/settings/billing`.

**The success page grants nothing.** It polls `plan_status` and shows "Activating your
subscription…" until the webhook lands — usually a second or two. Granting on redirect is the
classic way to hand out free subscriptions: the redirect is attacker-controllable, the
webhook signature is not.

**Customer Portal.** Server action → `billingPortal.sessions.create` with `return_url` to
`/settings/billing`. The Portal owns plan changes, cancellation, payment method updates, and
invoice history. Allowed products are configured in the Stripe dashboard — we build no
upgrade/downgrade UI of our own.

**`/settings/billing`** shows: current plan + status, EI add-on state, renewal or cancellation
date, dunning banner when `past_due`, and either a Subscribe (Checkout) or Manage (Portal)
button. Sits alongside the existing `/settings` routes.

## Enforcement surfaces

**Two layers, both mandatory.** UI gating alone is decoration — every server action and route
handler behind a gated feature calls `requireEntitlement()` server-side. The UI gate exists so
the product reads correctly (locked state + upgrade CTA), never as the security boundary.

| # | Feature | Server surfaces to gate |
|---|---|---|
| 1 | HM Portal | `projects/[id]/hiring-manager/actions.ts` (token issue/revoke), **and `/hm/[token]` itself** |
| 2 | Triangulation | `run-triangulation.ts` entry in `candidates/[candidateId]/actions.ts` |
| 3 | Calibration history | `projects/[id]/calibration-history/actions.ts` (incl. restore) |
| 4 | Global Executive Network | `candidates/network/page.tsx` + `network/actions.ts` |
| 5 | Custom skills | `settings/skills/actions.ts` (create/edit/delete) |

**`/hm/[token]` is the subtle one.** It is public and unauthenticated, so it has no session to
derive an org from. The gate must resolve the token's `organization_id` and check *that* org's
entitlement. Otherwise every HM link issued under Growth keeps working forever after a
downgrade to Starter. Downgraded orgs' live links must return the standard "link unavailable"
state — not a billing message, which would leak tenant state to an external hiring manager.

**Existing skills on downgrade** are retained, not deleted — they stop being editable and stop
being injected into agent prompts. Same principle everywhere: **gates remove access, never
data.**

### Active-search cap

Enforced in the project-creation server action **and** as a DB trigger on `projects` insert
that counts non-archived projects for the org against `active_search_limit` (NULL = unlimited).
Defense in depth, consistent with how the EI module hardened its invariants at the database
layer. Existing over-cap orgs are never force-archived — the cap blocks *new* searches only.

## Failure modes

| Situation | Behavior |
|---|---|
| Payment fails | `past_due` → access retained + banner during Stripe's retry window |
| Retries exhausted | `unpaid`/`canceled` → entitlements → `none`; **all data retained**, read-only |
| Customer cancels | Access continues to `current_period_end` (`cancel_at_period_end` true) |
| Webhook missed entirely | Stripe retries 3 days; `/settings/billing` reconciles on load by re-fetching from Stripe |
| Checkout abandoned | No customer binding, no state written |
| Org has no subscription | Subscribe wall on `/settings/billing`; app otherwise read-only |

Account approval (existing `users.status`) and billing entitlement are **independent gates**.
An approved user without a subscription is a normal, expected state.

## UI and design

Billing is mostly backend, but it ships real customer-facing surface: `/settings/billing`,
five locked feature states with upgrade CTAs, and a dunning banner. Those are held to the
production-quality bar, not merely "functional".

**Design language source of truth is this repo.** `DesignSync` was checked — the only
available project is *VN & MN Product Group Design System*, which covers the VN&MN website and
Stratum. **There are no Mandate comps.** Building `/settings/billing` from that kit would
import the wrong brand.

Build against what Mandate already has: the Bloomberg-terminal `m-*` class system, the
`--accent` / `--fg-soft` token set, and the existing primitives — `MastHead`, `StatusChip`,
`KpiTile`, `BreadcrumbRail`, `Card`, `Button`. `/settings/billing` should read as a sibling of
the existing `/settings` routes, not a bolted-on Stripe page.

**Locked states matter more than the billing page.** A gated feature that renders a dead link
or a raw error is the failure mode to avoid. Each of the five gets a deliberate locked state:
what the feature is, which plan unlocks it, one upgrade CTA. `StatusChip` already carries the
right visual vocabulary.

**Process:** load the `impeccable` skill before building these surfaces; validate with
Playwright at **1440** and **390**; run an accessibility pass (contrast on the dunning banner
and locked states, focus order through Checkout/Portal CTAs, screen-reader labelling of
lock icons). Fix material issues before calling it done.

**Exception:** `/hm/[token]` when the org is downgraded returns the standard "link
unavailable" state — no billing copy, no upgrade CTA. That page is seen by an external hiring
manager who must not learn the customer's payment status.

## Testing

**Unit (vitest, `npm test`):** plan matrix across every plan × status × exempt combination;
price→plan mapping; `resolveEntitlements` for `billing_exempt`; out-of-order event handling;
webhook signature rejection.

**DB invariants (`supabase/tests/billing_invariants.sql`,** following the existing
`executive_*_invariants.sql` convention, run inside a rolled-back transaction): `plan` check
constraint rejects garbage; `stripe_customer_id` uniqueness; `stripe_events` has no
UPDATE/DELETE policy; search-cap trigger fires; exempt org bypasses.

**Webhook (local):** `stripe listen --forward-to localhost:3001/api/stripe/webhook` +
`stripe trigger` for each handled event. Replay the same event twice to prove idempotency.

**Prod smoke (test mode):** SMOKE-prefixed org → subscribe with `4242 4242 4242 4242` →
verify entitlement + gates open → Portal cancel → verify downgrade + gates close → delete all
SMOKE rows → **confirm 0 rows remain**.

**Green gate before any commit:** `npm test`, `npx tsc --noEmit`, `npm run lint`,
`npm run build` — all four. Delete `.next` first if `tsc` trips on `" 2"`-suffixed duplicates.

## Environment variables

`STRIPE_SECRET_KEY` · `STRIPE_WEBHOOK_SECRET` · `STRIPE_PRICE_STARTER` ·
`STRIPE_PRICE_GROWTH` · `STRIPE_PRICE_AGENCY` · `STRIPE_PRICE_EI_ADDON` ·
`NEXT_PUBLIC_APP_URL`

Test-mode values on Vercel (team `vn-mn-product-group`) across Development, Preview, and
Production. **Test keys in Production env is deliberate** — this build is test-mode-only, and
the live-mode switch is a separate change with its own smoke pass.

## Landing page

`src/app/(marketing)/page.tsx`:
- **Remove** "Save 20% with annual billing" (~L1005) — monthly-only, decision 5.
- Wire tier CTAs to Checkout for signed-in approved users; `/request-access` otherwise.
- Consider softening "1 user / 5 users / Unlimited users" — those caps are stored but
  unenforced until multi-tenancy ships. **Flagged, not decided.**

Also worth a copy pass: Starter promises "Full intelligence stack" while Growth adds
Triangulation and the HM Portal, which are part of that stack. Once gates are live that reads
as a contradiction.

## Implementation sequence

1. Create test-mode products/prices in Stripe; record price IDs
2. Confirm `organizations` live schema (MCP), then migration 039 — **apply via MCP
   `apply_migration` AND write `supabase/migrations/039_billing.sql`**
3. `src/lib/billing/plans.ts` + `entitlements.ts` + unit tests
4. `/api/stripe/webhook` + idempotency + local `stripe listen` verification
5. Checkout + Portal server actions + `/settings/billing`
6. The five gates + active-search cap + DB trigger
7. Landing page copy fix
8. Full green gate → smoke test → commit

Proposed commits (conventional, no attribution footer):
`feat: billing foundation — migration 039, plan matrix, entitlement resolution` ·
`feat: billing — Stripe webhook with idempotent event ledger` ·
`feat: billing — Checkout, Customer Portal, /settings/billing` ·
`feat: billing — gate HM portal, triangulation, calibration history, network, skills` ·
`docs: billing design spec`

## Open items

1. **EI add-on price — undecided.** Blocks step 1. Needs a number.
2. **`organizations` live schema unverified.** MCP timed out during this spec (connection
   timeout on three calls; project may be paused). `001_core_schema.sql` is 0 bytes, so no
   local file describes the table. **Confirm before writing 039.**
3. **Which orgs get `billing_exempt`?** Presumably `mandate-hq`. Any others?
4. **Canceled-org access.** Spec assumes read-only retention. Confirm that's right rather
   than a hard block.
5. **Seat-count copy** on the landing page while seats are unenforced (see above).
