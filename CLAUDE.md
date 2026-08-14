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
- [x] Run Supabase advisor sweep (mcp_supabase_get_advisors) and fix any new findings — migrations `058`/`059`, 2026-08-14. Security 33 findings → 9; what stayed and why is in §5g of the handoff. **Re-run after any migration that adds tables or policies.**
- [ ] **Enable leaked-password protection** (Supabase Auth dashboard toggle, not SQL — founder's call). The only security finding left with an unapplied fix.
- [ ] Add hCaptcha/Turnstile to /request-access form
- [ ] Rotate Supabase service role key (was exposed in terminal)
- [ ] Review all RLS policies on pre-existing tables — **partially done.** `users` was reviewed and rewritten in `058`/`059`: its 002/003 policies predated the 046 sweep and let a suspended account read the whole member roster (§5h). That is a reason to expect the same class of bug on the other pre-046 tables, not evidence they are clean — they have not been re-read.
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
- [ ] Add error monitoring (Sentry or similar)
- [ ] Write onboarding documentation
- [ ] Set up status page
- [ ] Run Lighthouse audit on / marketing page and fix any LCP/CLS issues from animations before public launch
- [ ] Test all landing page animations on mobile devices
- [ ] Verify simulator works correctly in production (rate limiting, API responses)
