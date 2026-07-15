# Mandate — Codex Handoff

Handoff for completing the Mandate recruiting app (AI-native executive search platform).
Prepared 2026-07-15. No secrets included — env var names only.

---

## 1. Repo State

- **Branch:** `main` (also the PR base branch)
- **HEAD:** `ce4e7a5` — "Fix favicon — replace Next.js default app/favicon.ico with Mandate M logo"
- **Working tree:** clean — `git status --short` empty, no uncommitted diff
- **Package manager:** npm (`package-lock.json` present; no yarn/pnpm/bun lockfiles)
- **Node:** v22.22.2 (no `.nvmrc` — consider adding one)
- **Framework:** Next.js 16.2.4 (App Router, Turbopack), React 19.2.5, TypeScript 5, Tailwind 4, shadcn/radix-ui, `@anthropic-ai/sdk` 0.91.x, `@supabase/ssr` + `supabase-js`, `@react-pdf/renderer`, `mammoth` (DOCX parsing)

### Commands

```bash
npm install          # install
npm run dev          # dev server on port 3001 (next dev -p 3001)
npm run build        # production build
npm run lint         # eslint
npm start            # serve production build
# NO test script exists — package.json has no "test" entry and the repo has zero test files
```

---

## 2. Architecture Map

Source layout: `src/app` (routes), `src/lib` (domain logic), `src/components` (~130 TSX components). ~234 source files total. Auth/session gating runs through `src/proxy.ts` (Next 16 middleware/proxy).

### Pages (App Router)

**Public / marketing**
| Route | Purpose |
|---|---|
| `/` | Marketing landing page (static, animated hero + embedded live simulator calling `/api/demo`) |
| `/request-access` | Closed-beta waitlist application form (static page + client form) |
| `/hm/[token]` | Unauthenticated hiring-manager portal — token-in-URL access to a project's slate + feedback form |

**Auth** (Supabase Auth): `/auth/signin`, `/auth/signup`, `/auth/callback`, `/auth/pending` (waitlist-status holding page), `/auth/signout`

**Recruiter dashboard** (authenticated)
| Route | Purpose |
|---|---|
| `/home` | Dashboard home |
| `/analytics` | Cross-project search analytics |
| `/candidates`, `/candidates/search`, `/candidates/network` | Global candidate pool, search, network graph |
| `/projects/new` | Create search project (one-line role intake) |
| `/projects/[id]` | Project workspace hub (company/client/HM intelligence panels) |
| `/projects/[id]/onboarding` | Dynamic calibration questionnaire |
| `/projects/[id]/spec` | AI-generated job spec, versioned + editable |
| `/projects/[id]/sourcing` | Boolean / X-Ray query generation |
| `/projects/[id]/candidates`, `.../candidates/new`, `.../candidates/[candidateId]` | Candidate list, CV upload (PDF/DOCX), candidate detail + evaluation |
| `/projects/[id]/ranking`, `.../ranking/compare` | Scored leaderboard, head-to-head comparison |
| `/projects/[id]/calibration-history` | Scoring model version history |
| `/projects/[id]/feedback` | Recruiter/HM feedback → recalibration |
| `/projects/[id]/shortlist` | Slate builder (top 3/5/custom) |
| `/projects/[id]/comparison` | Candidate comparison master table |
| `/projects/[id]/metrics` | Search health metrics |
| `/projects/[id]/reports` | PDF report generation/export |
| `/projects/[id]/hiring-manager` | HM portal management + share-link generation |
| `/settings`, `/settings/skills[...]`, `/settings/waitlist` | Profile, skill-injection management, waitlist admin (founder-only) |

### API routes

| Route | Purpose |
|---|---|
| `/api/copilot` | Recruiter Copilot streaming chat endpoint (Claude, project-context-aware) |
| `/api/demo` | Public landing-page simulator — role intake demo with in-memory rate limiting + Claude web_search |
| `/hm/[token]/api/submit` | HM portal feedback submission (token-authenticated) |

Most mutations are Next.js **server actions** colocated with pages, not API routes.

### Supabase

- **Project ref:** `xipyqnltkbtywxqyxupf` (also in `.mcp.json` for MCP access)
- **31 migrations** in `supabase/migrations/` (~1,800 lines SQL), in dependency order:
  - `001` core schema; `002` auth status + founders; `003–004` RLS recursion fix + RLS perf sweep
  - `005` onboarding responses; `006–013` job specs (structured, atomic versioning, idempotent generation, repair)
  - `014` candidates + CV storage; `015` ranking; `016` feedback/recalibration; `017` shortlists; `018` skills
  - `019–021` candidate contact/notes, structured CV atomicity; `022` recruiter assessment
  - `023` HM portal; `024` project reports; `025` HM feedback type; `026` client psychology
  - `027` health suggestions; `028` rank change history; `029` calibration history; `030` waitlist; `031` advisor sweep (perf/security fixes)
- **Auth model:** Supabase Auth (email). `handle_new_auth_user()` trigger auto-creates a `users` row with role/status. Founder allowlist (three emails) hardcoded in `src/lib/auth/founders.ts` and replicated in DB (migration 002) — founders auto-promote to admin; everyone else lands in waitlist status and sits at `/auth/pending` until approved via `/settings/waitlist`.
- **RLS:** enabled across tables — founder-only policies for admin surfaces, user-self access for own data, token-scoped access for HM portal. Migrations 003/004/031 addressed recursion and advisor findings. CLAUDE.md still flags reviewing policies on pre-existing tables.
- **Storage:** CV files (PDF/DOCX) in Supabase Storage (migration 014).

### AI agent pipeline (`src/lib/ai/`, ~40 files, model: claude-sonnet-4-6 via `anthropic.ts`)

Agents are stateless; orchestration is in the app layer (server actions); all state persists to Supabase. No agent-to-agent calls.

**The 14 core agents** (per `AGENTS.md`), roughly in pipeline order:

| # | Agent | Files | Input → Output |
|---|---|---|---|
| 1 | Intake | `role-analysis-agent.ts`, `analyze-role.ts` | one-line role → role structure, scope, missing info |
| 2 | Company Research | `company-intelligence-agent.ts` | company name → industry/org/tech-maturity brief (uses Claude web_search) |
| 3 | Onboarding | `onboarding-analysis.ts` | research + role → dynamic questionnaire; captures must-haves/anti-patterns |
| 4 | Role Spec | `generate-job-spec.ts`, `job-spec-analysis.ts` | onboarding → versioned job spec |
| 5 | Calibration | `derive-calibration.ts` | onboarding + spec → weighted scoring model |
| 6 | Boolean Search | `sourcing-analysis.ts`, `generate-sourcing.ts` | calibration → LinkedIn Boolean / X-Ray / ATS queries |
| 7 | CV Parsing | `cv-parsing.ts`, `parse-cv.ts` | PDF/DOCX upload → structured candidate profile |
| 8 | Candidate Review | in `cv-parsing.ts` | parsed CV → strengths/weaknesses/risks vs role |
| 9 | Ranking | `scoring-engine.ts`, `scoring-math.ts` | review + calibration → multi-dimension score, tier, leaderboard |
| 10 | Feedback | `feedback-analysis.ts`, `interpret-feedback.ts` | feedback → preference changes, bias flags → recalibration (`src/lib/recalibration/recalibrate.ts`) |
| 11 | Shortlist | `shortlist-report.ts`, `generate-shortlist-report.ts` | ranking → slate with trade-off analysis |
| 12 | Positioning | `positioning-agent.ts`, `run-positioning.ts` | selected candidate → narrative/perception analysis |
| 13 | Recruiter Copilot | `copilot-agent.ts`, `copilot-context.ts` | question + project context → streamed answer (`/api/copilot`) |
| 14 | Search Health | `search-health-agent.ts`, `run-search-health.ts` | pipeline state → health metrics, stall alerts |

**Extended agents beyond the spec:** `triangulation-agent.ts` (multi-source Triangulation Report), `candidate-research-agent.ts`, `hiring-manager-research-agent.ts`, `client-psychology-agent.ts`, `psychology-agent.ts`, `company-culture-agent.ts`, `target-companies-agent.ts`, `weekly-report-agent.ts`, `comparison-analysis.ts` / `generate-comparison.ts`, `candidate-evaluation.ts` / `generate-evaluation.ts`.

**Supporting systems:** skill injection (`src/lib/skills/skill-injector.ts` — recruiter-authored prompt skills injected into agent calls), intelligence overlays (`src/lib/intelligence/overlays.ts`), PDF documents (`src/lib/pdf/` — evaluation, comparison, weekly-report + shared styles).

---

## 3. Launch Checklist

### Current CLAUDE.md checklist (verbatim status)

**Security & Performance**
- [ ] Supabase advisor sweep (migration 031 written; re-run `get_advisors` to confirm clean)
- [ ] hCaptcha/Turnstile on `/request-access`
- [ ] Rotate Supabase service role key (was exposed in a terminal)
- [ ] Review RLS policies on pre-existing tables
- [ ] Fix unindexed FK warnings on older migrations

**Before First Client**
- [ ] Test full search loop with 8–10 real candidate CVs
- [ ] Verify HM portal end-to-end with a real hiring manager
- [ ] Test Triangulation Report with real data
- [ ] Verify all PDF exports
- [ ] Test email drafts open correctly in mail client

**Before Public Launch**
- [ ] Stripe billing
- [ ] Resend transactional emails
- [ ] Rate limiting on `/request-access`
- [ ] Error monitoring (Sentry or similar)
- [ ] Onboarding docs, status page
- [ ] Lighthouse audit of `/` (animation LCP/CLS); test animations on mobile
- [ ] Verify simulator in production (rate limiting, API responses)

### Remaining launch blockers → relevant files

| Blocker | Status | Files to touch |
|---|---|---|
| **Captcha** | Not started; provider undecided (hCaptcha vs Cloudflare Turnstile) | `src/app/request-access/page.tsx`, `src/app/request-access/request-access-form.tsx` (client form + its server action); add verification server-side |
| **Rate limiting on request-access** | Missing. Only `/api/demo` has rate limiting, and it's **in-memory** (resets per instance — inadequate on Vercel Fluid Compute) | `src/app/request-access/request-access-form.tsx` (server action), reference implementation in `src/app/api/demo/route.ts`; durable store undecided (Upstash Redis / Vercel Marketplace equivalent) |
| **Service role key rotation** | Operational task, no code change unless key is inlined anywhere (it isn't — read via `process.env.SUPABASE_SERVICE_ROLE_KEY`) | Rotate in Supabase dashboard → update Vercel env + local `.env.local`. Audit usages: `grep -rn SUPABASE_SERVICE_ROLE_KEY src/` |
| **Sentry / error monitoring** | Nothing installed | `next.config.ts` (currently empty), add `instrumentation.ts` / `@sentry/nextjs` wizard output, plus a `global-error.tsx` if absent |
| **Resend / transactional email** | Stub only — `src/lib/waitlist/notify.ts` calls Resend but no API key wired; no emails for HM invites or feedback notifications | `src/lib/waitlist/notify.ts`; add sends for HM portal share links (`src/app/(dashboard)/projects/[id]/hiring-manager/`) and waitlist approval (`/settings/waitlist` actions) |
| **Tests** | **Zero test files, no test runner installed, no `test` script.** Biggest gap. | Everything. Suggested start: Vitest unit tests for `scoring-math.ts`, `scoring-engine.ts`, `recalibrate.ts`, `cv-parsing` pure functions; Playwright E2E for auth → project creation → CV upload → ranking → shortlist → HM portal loop |
| **Stripe billing** | No code at all (post-launch per checklist) | Greenfield |

---

## 4. Verification State

All checks run 2026-07-15 on `main` @ `ce4e7a5`:

- **`npm run build`:** ✅ PASSES. Compiled in 3.1s, TypeScript pass 4.3s, all 20 static pages generated, 39 routes emitted (2 static: `/`, `/request-access`; rest dynamic), proxy middleware compiled. No errors or warnings.
- **`npx tsc --noEmit`:** ✅ Exit 0, zero errors.
- **`npm run lint`:** ✅ Exit 0. Two warnings in `src/app/layout.tsx:96`: `@next/next/google-font-display` and `@next/next/no-page-custom-font` (custom font loaded via `<link>` instead of `next/font`).

### Known runtime issues

- **Dev-server Turbopack root misresolution (machine-specific):** a stray `package-lock.json` in `/Users/vladb` (parent of the repo) makes Turbopack infer the wrong workspace root, so `tailwindcss` fails to resolve during `npm run dev` even though it's installed. Fix: set `turbopack.root` to the project dir in `next.config.ts` (currently empty — fix NOT yet applied) or delete the stray parent lockfile. Production build is unaffected.
- No other known runtime errors. No error monitoring exists, so production runtime health is unobserved — check Vercel runtime logs.

### Manually tested vs not

- **Visually iterated recently:** marketing landing page, simulator widget, favicon/OG cards, pricing copy (see recent commits).
- **NOT verified end-to-end (explicitly per CLAUDE.md):** full search loop with real CVs, HM portal flow, Triangulation Report, PDF exports, email drafts, simulator behavior in production. Treat every dashboard flow as untested until proven — there is no test suite to say otherwise.

---

## 5. Environment / Deploy Context

### Required env vars (names only)

| Var | Scope | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | client+server | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client+server | publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | server only | ⚠️ scheduled for rotation |
| `ANTHROPIC_API_KEY` | server only | all agent calls |
| `RESEND_API_KEY` | server only | not yet set — email stub inactive |
| `RESEND_FROM` | server only | sender address for Resend |
| `NEXT_PUBLIC_SITE_URL` | client+server | canonical URL (getmandate.io) |
| `VERCEL_URL` | auto-injected | fallback URL on Vercel |

### Deploy

- **Vercel project:** name `mandate`, project `prj_tB0GXtbyHjSV7UBhCWWycS3W6tvZ`, team `team_UM7qyUosQWwUXP8eRsboZR9n` (`.vercel/project.json`)
- **Domain:** getmandate.io (site metadata configured in commit `56de81c`)
- **Supabase project ref:** `xipyqnltkbtywxqyxupf`

### Provider decisions

- **Email:** ✅ decided — **Resend** (integration stubbed, needs key + wiring)
- **Captcha:** ❌ undecided — CLAUDE.md says "hCaptcha/Turnstile"; recommendation is Turnstile (free, privacy-friendly, works well on Vercel) but confirm with Vlad
- **Rate limiting:** ❌ undecided — current in-memory approach in `/api/demo` won't survive serverless instance churn; needs a durable store (e.g., Upstash Redis via Vercel Marketplace) — confirm with Vlad before adding a dependency
- **Billing:** Stripe (decided, post-launch, not started)

---

## 6. Test Data

There are **no seed scripts or fixtures** (`supabase/seed*` and `scripts/` don't exist). No shared demo credentials exist. Bootstrap test data manually:

1. **Test recruiter (founder path):** add a test email to the allowlist in `src/lib/auth/founders.ts` **and** the founders logic from `supabase/migrations/002_auth_status_and_founders.sql` (both must match), then sign up at `/auth/signup` — founder emails auto-promote to admin.
2. **Test recruiter (waitlist path):** sign up with any email → lands on `/auth/pending` → approve it from `/settings/waitlist` while logged in as a founder. This also exercises the waitlist flow.
3. **Waitlist entries:** submit `/request-access` a few times with test emails.
4. **Project:** `/projects/new` → enter a one-line role (e.g., "VP Engineering for a Series B fintech in London") → complete the onboarding questionnaire → finalize spec + calibration. Requires a valid `ANTHROPIC_API_KEY`; each full project setup makes multiple Claude calls.
5. **Candidates:** upload PDF or DOCX CVs at `/projects/[id]/candidates/new` (mammoth handles DOCX). Use synthetic CVs — checklist calls for 8–10 to exercise ranking properly.
6. **HM token:** from `/projects/[id]/hiring-manager`, generate a share link — the emitted `/hm/[token]` URL works unauthenticated in an incognito window; submit feedback there to exercise `/hm/[token]/api/submit` and the feedback → recalibration loop.
7. **Local env:** copy env var names from §5 into `.env.local` (no `.env.example` exists — creating one would be a good first contribution).

---

## Suggested priority order for Codex

1. Fix Turbopack `turbopack.root` in `next.config.ts` (unblocks local dev on this machine, one-liner)
2. Test infrastructure: Vitest + first unit tests on scoring/recalibration math, then Playwright for the core loop (largest risk-reduction per hour)
3. Rate limiting + captcha on `/request-access` (security blockers, small surface)
4. Wire Resend end-to-end (waitlist approval + HM invite emails)
5. Sentry setup
6. Run the "Before First Client" manual verification pass with synthetic data from §6
