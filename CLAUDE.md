@AGENTS.md

## WORKING RULES

### Git

- **Never commit or push without explicit approval.** Propose the message first.
- Conventional commits — `feat:` / `fix:` / `docs:`. **No attribution footer.**
- Never push to `main` on a shared clone without saying so; never `--force`; never
  discard uncommitted work.

### Green gate — before any commit

All four must pass:

```
npm test          # vitest
npx tsc --noEmit
npm run lint
npm run build
```

If `tsc` trips on `" 2"`-suffixed duplicate files, delete `.next` first and re-run.

### Supabase migrations

Apply to the live DB via MCP `apply_migration` **and** write the numbered file in
`supabase/migrations/`. Both, every time — the live DB and the repo must not drift.

- Check `supabase/migrations/` for the current tip before taking a number.
- **Also check `docs/superpowers/specs/`** — approved specs reserve numbers ahead of
  implementation, and have collided before.
- ⚠️ `001_core_schema.sql` is **0 bytes**. The base schema (`organizations`, `users`,
  `projects`, `candidates`, `candidate_scores`, `feedback`, `job_specs`,
  `boolean_queries`) exists only in the live database. Read it over MCP before writing
  any migration that touches those tables — there is no local fallback.
  - This list said `cvs` until 2026-10-07 and **there is no `cvs` table** — the
    assessment checked, and no table in the database has `cv` in its name. CV data
    lives in columns on `candidates` (`cv_url`, `cv_raw`, `cv_structured`,
    `cv_sha256`, `cv_search`, `cv_processing`, `cv_parse_error`). `005` likewise
    created `onboarding_responses`, which is also gone; onboarding now lives in a
    column on `projects`. **Read the live catalogue, not this paragraph** — a name
    here is a hint, and `information_schema` is the authority.

### Production smoke tests

Use `SMOKE`-prefixed synthetic data. Delete everything afterwards and **confirm 0 rows
remain**.

### Server actions — the failure contract

A server action **returns** its failure; it never throws it to the client.
Next.js redacts errors thrown out of a Server Action in production, so a
thrown message is invisible to the person who caused it — and `next dev`
shows the real one, which is why this survived for months. Anything about
an error message is verified with `npm run build && npm start`, never
`npm run dev`.

Wrap the body in `runAction(SUBJECT, …)` from `@/lib/actions/run`; read the
result with `unwrap(await someAction(…))` from `@/lib/actions/result`.
`src/lib/actions/call-sites.test.ts` fails the build if a call site skips
`unwrap` — a discarded `ActionResult` reports success on a refused mutation.
`assertCapability` / `ForbiddenError` and `redirect()` keep throwing. Full
reasoning in §11 of the handoff.

### AI output — non-negotiable

All AI output is **decision support**. Never a hire/no-hire verdict, never psychological
or mental-health labels, never inference of protected characteristics. Humans review,
edit, and approve every artifact. This binds every agent and every surface.

### Project references

| Thing | Value |
|---|---|
| Repo | `github.com/vlad7990/mandate` |
| Production | `getmandate.io` (Vercel team `vn-mn-product-group`) |
| Supabase project ref | `xipyqnltkbtywxqyxupf` |
| Working clone | `~/Projects/mandate` |

## TOOLCHAIN

Consult `~/.claude/TOOLCHAIN.md` before major design, architecture, or implementation
work. Everything in it is user-scoped and already available in this project — nothing
to install.

Select tools by task. Do not invoke every available MCP, plugin, or skill by default.
Explain a choice only when it materially affects the implementation.

### Design work

**This repo is the design source of truth for anything already built.**

`DesignSync` *does* have Mandate comps — corrected 2026-08-11. Project
`f6c4031e-c28e-450f-8ef1-353834d79b78` holds 14 `.dc.html` comps: `01 Home` through
`05 Pricing` (marketing), `06 App Shell` and `07`–`12` (product screens), plus two
mobile sheets. The earlier note said otherwise because it had only looked at the
*VN & MN Product Group Design System* project, which covers the VN&MN website and
Stratum and would import the wrong brand.

Treat the comps as **art direction, not truth**. They are mockups and they do not
reconcile with the product: the Platform comp invented three agents that do not exist
and badged a column "6" above a list of four; the Pricing comp contradicted the shipped
Starter tier. Take the layout and the voice; take counts, prices, agent names and
limits from `_constants.ts`, `_data/agents.ts` and `_data/pricing.ts`.

Preserve the established language: the Bloomberg-terminal `m-*` class system, the
`--accent` / `--fg-soft` token set, and the existing primitives — `MastHead`,
`StatusChip`, `KpiTile`, `BreadcrumbRail`, `TierComparison`, `LiveTick`.

For significant frontend or UX work:

1. Read the surrounding components first; match their idiom.
2. Load the `impeccable` skill before building or reworking UI.
3. Validate with Playwright at **1440** and **390**.
4. Run a UX, visual-quality, and accessibility pass (`accessibility-compliance`).
5. Fix material issues before considering the task complete.

Target for customer-facing UI is production quality across visual hierarchy, typography,
spacing, responsiveness, interaction, animation, accessibility, perceived performance,
consistency, and polish — not functional completion.

### Reuse before building

Before building substantial reusable UI, infrastructure, utilities, integrations, or
architectural patterns from scratch, inspect the user's own repos (`gh`, authenticated
as `vlad7990`) and adapt proven patterns.

Known prior art:

| Need | Repo | What's there |
|---|---|---|
| Stripe billing | `orravia-health` | `src/lib/billing/{stripe,plans}.ts`, `/api/stripe/{webhook,checkout}` — same stack, same layout |
| Hardened webhook receiver | `cortex-os` | Signed-webhook-only consumption, `billing_provider_events` ledger |

Never copy another project's branding, copy, business logic, secrets, or tightly
coupled code.

## PRE-LAUNCH CHECKLIST

> ### 🔴 THE PRODUCTION DATABASE HAS NO BACKUPS (verified 2026-10-07)
>
> Supabase org `Stratum` is on the **`free`** plan: no backups of any kind, 1-day log
> retention, pausing after a week idle. **There is no restore point.** And a fact that
> survives any upgrade — Supabase states *"database backups do not include objects you store
> via the Storage API"*, so **no plan backs up the `cvs` bucket**. Pro is $25/mo and does
> **not** include an uptime SLA (those start at Team, $599/mo); PITR is a separate $100/mo
> add-on that *replaces* daily backups.
>
> Approved in principle: **Pro + independent file backup**, 24-hour RPO, no PITR. Not yet
> implemented. Steps await authorisation in
> `docs/infrastructure/2026-10-07-recovery-plan.md`. **This outranks everything else on this
> checklist** — no client's candidate data should be accepted until it is done.
>
> Related and separate: `001_core_schema.sql` being 0 bytes means the repo **cannot rebuild
> the database from scratch**. One committed `pg_dump --schema-only` closes it.

> **First-client readiness pack (2026-10-07).** Five companion documents to the assessment:
> `docs/legal/2026-10-07-factual-annexes.md` (12 factual annexes) ·
> `docs/legal/drafts/` (5 **unreviewed, unpublished** legal drafts) ·
> `docs/commercial/2026-10-07-launch-offer-and-promise-audit.md` (4 launch stages, all 21
> pricing promises audited, corrected copy for review) ·
> `docs/infrastructure/2026-10-07-recovery-plan.md` ·
> `docs/enterprise/2026-10-07-buyer-requirements-matrix.md` ·
> `docs/current-state/2026-10-07-go-no-go.md` (**per-segment verdict**: conditional go for a
> controlled pilot, no-go for solo/small, mid-market and enterprise).
>
> **Two rules from that pack worth carrying here.** (1) **Executive Intelligence is a premium
> module, not enterprise readiness** — they are independent and the "Contact sales" label has
> conflated them. (2) **"30-day evaluation history" must never be implemented as deletion.**
> The product has no automatic deletion anywhere (verified across all 159 migrations); adding
> one to enforce a price tier would destroy the customer's own work product. Withdraw the
> claim, or implement it as an **entitlement-gated visibility window** — and note that a
> visibility window is a *pricing* feature, **not** a retention policy. Retention and
> deletion remain undecided (legal items L4/L5) and must be settled for all tiers at once,
> with counsel. **If the implementation contains a `DELETE`, it is the wrong
> implementation.** (3) **Never state the AI provider's no-training commitment and its
> retention window as one fact.** Training: content is not used to train, verified, and
> Mandate has not opted in. Retention: content is held **up to 30 days** (longer if flagged),
> and **Mandate holds no zero-data-retention agreement**. Excluding retention-mandated models
> is not evidence of ZDR. Annex G carries the corrected wording.

> **Current state of the whole product:** `docs/current-state/2026-10-07-mandate-assessment.md`
> — implementation-first inventory of every feature and capability, the 37-capability AI
> matrix with measured production telemetry, journey tracing, gap analysis and a prioritised
> recommendation table. It supersedes `docs/launch-readiness.md` (2026-08-26), which is kept
> as history. **It also found that five lines of this checklist were wrong in both
> directions** — four things were done and unticked, one tick was stale — which is why the
> entries below now carry their evidence rather than just a box. When you close a line here,
> say where the proof is.

### Security & Performance
- [x] Run Supabase advisor sweep (mcp_supabase_get_advisors) and fix any new findings — migrations `058`/`059`, 2026-08-14. Security 33 findings → 9; what stayed and why is in §5g of the handoff. Re-run after `061` on 2026-08-17: security 12, performance 91, **nothing changed and nothing needs to be** — the three new findings are `check_demo_rate_limit` under both SECURITY DEFINER lints and `demo_rate_limit` under `rls_enabled_no_policy`, all deliberate and reasoned about in §12. **Re-run after any migration that adds tables or policies.**
  - **Re-run 2026-10-07 and it was NOT clean** — the first time this line was wrong. The rule above was not followed after the network programme (`143`–`148`), and two `function_search_path_mutable` findings had been sitting there since. Closed by migration `160`: `relationship_warmth` had its path pinned (`ALTER FUNCTION … SET search_path = ''` — it is two evaluations per merge, so nothing is lost), and `network_people_matches` was **deliberately left mutable**, which is now the house's third standing advisor exemption. The reasoning is in `160`'s header and in the function's own COMMENT: a SET clause makes a SQL function non-inlinable, EXPLAIN on production proves the planner currently inlines it and pushes its predicates into the `GroupAggregate` filter — the optimisation `148` recorded 835 ms → 12 ms for — and the body names only `pg_catalog` built-ins, which `search_path` cannot preempt. So it would cost the Network page something real and buy nothing. **If that body ever references one of our own objects, pin the path in the migration that adds it.**
  - **The three standing exemptions, so a future sweep does not re-litigate them:** (1) the four deny-all RLS tables (`inference_runs`, `ops_heartbeats`, `rate_limit`, `rate_limit_policy`) under `rls_enabled_no_policy`; (2) the 61 SECURITY DEFINER lints (12 anon + 49 authenticated), which are the `069` doctrine; (3) `function_search_path_mutable` on `network_people_matches`. Anything else is new and real.
- [ ] **Enable leaked-password protection** — **blocked on plan tier, not on a decision.** Checked 2026-08-14: org `Stratum` (`bfomdugfdcxxcneocihl`) is on `free`, and Supabase gates this feature at Pro. The dashboard toggle is locked; there is no SQL for it and the Supabase MCP has no auth-config tool. Needs a Pro upgrade (~$25/mo, org-wide) first, then `Auth → Providers → Email → "Prevent use of leaked passwords"`, or `PATCH /v1/projects/xipyqnltkbtywxqyxupf/config/auth {"password_hibp_enabled": true}` with a personal access token. HIBP is checked when a password is **set** — signup and reset — so enabling it later disrupts nobody who has already signed up, and delaying it costs nothing retroactively. It will keep appearing in every advisor run until then.
- [ ] **Raise the password floor in the Supabase dashboard — `Auth → Providers → Email`.** Founder's decision 2026-08-14: **minimum length 12, all four character classes** (lowercase, uppercase, digits, symbols). Not plan-gated. The app side is already done and shipped — `src/lib/auth/password-policy.ts` enforces exactly this at signup — but **that is not the boundary**: anyone with the anon key can call `supabase.auth.signUp()` directly and bypass it. Until the dashboard matches, the floor is still the default 6 with no class requirement. The two must stay in sync; the policy module says so at the top.
- [x] Add hCaptcha/Turnstile to /request-access form — **done, and live.** `verifyTurnstile` in `src/app/(marketing)/request-access/actions.ts`, widget in `request-access-form.tsx`; `TURNSTILE_SECRET_KEY` and `NEXT_PUBLIC_TURNSTILE_SITE_KEY` were both set in production ~2026-08-27 (confirmed by name 2026-10-07). This line said "absent and unprotected" until 2026-10-07; the keys had landed six weeks earlier. The check is enforced only when the site key is provisioned, so it degrades honestly in an un-keyed environment.
- [ ] Rotate Supabase service role key (was exposed in terminal)
- [x] Review all RLS policies on pre-existing tables — `058`/`059`/`060`, 2026-08-14. Every policy in the database was enumerated and classified by whether it consults `status`. 046's generated policies are all sound; the two hand-written founder/self-scoped tables were not — `users` (§5h) and `waitlist` (§5i), both fixed. Map of what was checked, including storage, views and SECURITY DEFINER functions, is in §5i. `suspended_account_invariants.sql` loops every RLS-enabled table, so **new tables are covered automatically**.
- [x] Fix unindexed FK warnings on older migrations — 15 findings, 3 indexed and 12 left deliberately. The 11 `created_by`/`submitted_by`/`generated_by` keys do not earn an index: nothing in the product deletes a user and no query filters on them. Reasoning in §5g.

### Before First Client
- [ ] Test full search loop with 8-10 real candidate CVs
- [ ] Verify HM portal works end-to-end with real hiring manager
- [ ] Test Triangulation Report with real data
- [ ] Verify all PDF exports work correctly
- [ ] Test email drafts open correctly in mail client

### Before Public Launch
- [ ] Set up Stripe billing — **still the hard revenue blocker, and still parked last by standing order.** No dependency, no code, and no `plan`/`seat`/`quota` column anywhere in 72 tables, while `(marketing)/_data/pricing.ts` advertises four tiers. Prior art to adapt is in the table above, not to be written from scratch.
- [x] Set up Resend for transactional emails — **done.** `RESEND_API_KEY` + `RESEND_FROM` set in production; `src/lib/email/send.ts` is the one door and the Monday sweep digest has been delivering through it (16 runs, 2026-08-31 → 2026-10-05). Two caveats that are NOT this line: `RESEND_WEBHOOK_SECRET` is absent, so bounce/delivery feedback never arrives; and invoice `from_email` still resolves to `getmandate.io` rather than the agency, pending domain verification.
- [x] Add rate limiting to /request-access — **done.** `limitOpen` + `clientIpFrom` from `@/lib/rate-limit/server` in `request-access/actions.ts`, Postgres-backed per `088` (identity fails open, money fails closed).
- [x] Rate-limit `/api/demo` — migration `061`, 2026-08-14. Was a module-scoped Map, i.e. per serverless instance, so "10/hour/IP" was never the real ceiling. Now Postgres-backed: 10/hour/IP **and 200/day globally**, which is the cap that actually bounds spend. Fails closed. Its 502 body also used to return the provider's raw JSON — vendor, billing advice and a request id — to any anonymous caller; API routes are not redacted the way Server Actions are.
- [x] Add error monitoring (Sentry or similar) — **done.** `@sentry/nextjs` wired at `src/instrumentation.ts`, `src/instrumentation-client.ts`, `src/app/global-error.tsx`, `src/app/(dashboard)/error.tsx` and `withSentryConfig` in `next.config.ts`, with a PII scrubber at `src/lib/observability/scrub.ts`; both DSNs set in production. **One real gap left:** `SENTRY_AUTH_TOKEN` is absent, so `next.config.ts` disables source-map upload and every production stack trace is minified. One env var closes it.
- [ ] Write onboarding documentation
- [x] Set up status page — **done.** `/status` plus the machine-readable `GET /api/health` (`src/lib/status/checks.ts`, 30 s cache, public via the proxy allowlist). Verified live 2026-10-07: `200 {"ok":true,"checks":{"db":"ok","auth":"ok","cron":"ok"}}`. **Still open and not this line:** nothing external polls it, so an outage is found by a customer.
- [ ] Run Lighthouse audit on / marketing page and fix any LCP/CLS issues from animations before public launch
- [ ] Test all landing page animations on mobile devices
- [ ] Verify simulator works correctly in production (rate limiting, API responses)
