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
  `projects`, `candidates`, `candidate_scores`, `feedback`, `job_specs`, `cvs`,
  `boolean_queries`) exists only in the live database. Read it over MCP before writing
  any migration that touches those tables — there is no local fallback.

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

### Security & Performance
- [x] Run Supabase advisor sweep (mcp_supabase_get_advisors) and fix any new findings — migrations `058`/`059`, 2026-08-14. Security 33 findings → 9; what stayed and why is in §5g of the handoff. Re-run after `061` on 2026-08-17: security 12, performance 91, **nothing changed and nothing needs to be** — the three new findings are `check_demo_rate_limit` under both SECURITY DEFINER lints and `demo_rate_limit` under `rls_enabled_no_policy`, all deliberate and reasoned about in §12. **Re-run after any migration that adds tables or policies.**
- [ ] **Enable leaked-password protection** — **blocked on plan tier, not on a decision.** Checked 2026-08-14: org `Stratum` (`bfomdugfdcxxcneocihl`) is on `free`, and Supabase gates this feature at Pro. The dashboard toggle is locked; there is no SQL for it and the Supabase MCP has no auth-config tool. Needs a Pro upgrade (~$25/mo, org-wide) first, then `Auth → Providers → Email → "Prevent use of leaked passwords"`, or `PATCH /v1/projects/xipyqnltkbtywxqyxupf/config/auth {"password_hibp_enabled": true}` with a personal access token. HIBP is checked when a password is **set** — signup and reset — so enabling it later disrupts nobody who has already signed up, and delaying it costs nothing retroactively. It will keep appearing in every advisor run until then.
- [ ] **Raise the password floor in the Supabase dashboard — `Auth → Providers → Email`.** Founder's decision 2026-08-14: **minimum length 12, all four character classes** (lowercase, uppercase, digits, symbols). Not plan-gated. The app side is already done and shipped — `src/lib/auth/password-policy.ts` enforces exactly this at signup — but **that is not the boundary**: anyone with the anon key can call `supabase.auth.signUp()` directly and bypass it. Until the dashboard matches, the floor is still the default 6 with no class requirement. The two must stay in sync; the policy module says so at the top.
- [ ] Add hCaptcha/Turnstile to /request-access form
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
- [ ] Set up Stripe billing
- [ ] Set up Resend for transactional emails
- [ ] Add rate limiting to /request-access
- [x] Rate-limit `/api/demo` — migration `061`, 2026-08-14. Was a module-scoped Map, i.e. per serverless instance, so "10/hour/IP" was never the real ceiling. Now Postgres-backed: 10/hour/IP **and 200/day globally**, which is the cap that actually bounds spend. Fails closed. Its 502 body also used to return the provider's raw JSON — vendor, billing advice and a request id — to any anonymous caller; API routes are not redacted the way Server Actions are.
- [ ] Add error monitoring (Sentry or similar)
- [ ] Write onboarding documentation
- [ ] Set up status page
- [ ] Run Lighthouse audit on / marketing page and fix any LCP/CLS issues from animations before public launch
- [ ] Test all landing page animations on mobile devices
- [ ] Verify simulator works correctly in production (rate limiting, API responses)
