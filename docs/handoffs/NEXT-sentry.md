# NEXT — Error monitoring lands (Sentry, the deferred list's first item)

Status: **Phase 0 complete — D1–D8 drafted, awaiting the founder's
written D-confirmation. No build work past this file until then.**

First item of the deferred build list (Sentry → rate limiting →
Resend → Stripe, founder-ordered 2026-08-12), opened on the founder's
word 2026-08-21 after §58 closed the fourteen-agent map. The
motivating evidence is one week old: the health-schema 400 (§57) had
been failing SILENTLY on every run since the API tightened validation
— the dashboard error boundary's own comment says "Until error
monitoring lands, the console is the only record." This slice makes
the record. **No migration — the database is untouched; the counter
stays at 088.**

---

## Phase 0 — enumeration from the code (the §5h rule)

### The error surfaces, enumerated

1. **`runAction` (`src/lib/actions/run.ts`)** — the central seam:
   every server-action failure in the product passes through ONE
   catch. The outcome/fault discrimination ALREADY EXISTS there and
   is exactly a capture policy: a plain `Error` is an authored
   sentence for the reader (an OUTCOME — not Sentry's business); a
   subclass or non-Error throw is a FAULT (provider payloads,
   TypeErrors) and today goes only to `console.error`. One capture
   line on the fault branch covers all ~348 action throw sites.
   `ForbiddenError` rethrows are guard trips — visible in Sentry as
   warnings, not errors.
2. **The route error boundary (`(dashboard)/error.tsx`)** — client
   capture point for every dashboard page; currently console-only by
   its own admission. **There is NO root `global-error.tsx`**: an
   error thrown in the root layout today shows Next's unstyled page
   and records nothing anywhere.
3. **`onRequestError` (instrumentation.ts — does not exist yet)** —
   Next's server hook catches what runAction never sees: server
   component renders, route handlers (`/api/cron/maintenance`,
   `/api/copilot`, `/api/demo`, the HM and portal token doors), and
   the fire-and-forget `after()` blocks (a refused intake run's D5
   sentence lives only in the server log today — §55).
4. **The ~95 `console.error` sites** — mostly seams that SWALLOW
   errors into statuses (`"failed"` from the agent runners) so no
   throw ever reaches a hook. These stay `console.error`; the named
   agent-seam catch sites additionally get one small helper
   (`captureSeamError` — seam label + agent kind as tags). Enumerated
   sites only, nothing sprayed.

### What must NEVER ride to Sentry (the trail doctrine, extended)

The product's telemetry vocabulary is settled: counts, enums, dates,
ids — never names, never free text (§30–§58, fourteen times over).
Sentry is a third party; the same boundary applies harder. Candidate
names, briefs, feedback text, report content, model-input JSON (the
seams serialise it into prompts — a provider error can EMBED it):
none of it leaves the building. `safeFailureMessage`'s paranoia about
provider payloads, applied at the telemetry door.

### Provisioning (Vercel Marketplace, discovered)

`sentry` is on the marketplace (observability). It is CONNECTABLE —
`vercel integration add sentry` hands off to a browser claim +
registration step: **founder-hand**, like every credential minting in
this programme. The integration delivers env automatically; the
DSN-absent SDK no-ops, which is the kill switch for free.

---

## Decisions for confirmation

### D1 — The SDK, wired by hand

`@sentry/nextjs`, hand-wired — NOT the wizard (it scaffolds example
pages and rewrites config wholesale; this codebase wants deliberate
files): `instrumentation.ts` (server init + `onRequestError`),
`instrumentation-client.ts`, `withSentryConfig` in next.config.ts for
source maps, plus a new root `global-error.tsx` (styled like the
dashboard boundary) and the one `captureSeamError` helper. Next
16.3/Turbopack compatibility is verified in Phase 1 before anything
lands; source-map upload only if the build stays green.

### D2 — Provisioning and the kill switch

Marketplace install (`vercel integration add sentry`), the claim
handshake founder-hand; `SENTRY_AUTH_TOKEN` (source maps) as a Vercel
secret, DSN in Vercel production and `.env.local`. Unset DSN = SDK
no-ops = telemetry off with zero code change: the kill switch is the
env pair, same shape as every agent credential.

### D3 — What is captured (and what is NOT)

- runAction's FAULT branch only — authored outcome sentences never
  become Sentry events; `subject` rides as a tag. ForbiddenError as
  warning.
- The two boundaries (dashboard error.tsx, new global-error.tsx).
- `onRequestError` for everything route-shaped and after()-shaped.
- The named agent-seam catch sites via `captureSeamError` (seam +
  agent_kind tags — the trail's own vocabulary).
- NOT captured: D5 refusals (suspension is an operator's act, not a
  fault), the health gate's refusal, agent_unavailable statuses,
  status-mapped user messages. Honest refusals are not errors.

### D4 — The PII boundary

`sendDefaultPii: false`; no request bodies, no cookies, no emails.
The only identity on an event is the users-row uuid (the trail's own
actor shape) and role. `beforeSend` drops provider-message bodies
over a short length cap (a provider error can embed the model input,
which embeds candidate data) and strips known free-text fields.
Breadcrumbs: navigation and console category only, no fetch bodies.
Session replay stays OFF — it screenshots PII by design.

### D5 — Fail-soft

Sentry absent, down, or blocked changes NOTHING: every existing
`console.error` line stays (Sentry is a COPY of the record, not its
replacement), no reader-facing sentence changes, no code path awaits
a Sentry response (fire-and-forget transport only).

### D6 — Scope of telemetry

Errors only: `tracesSampleRate: 0`, no APM, no release health, no
replay. The deferred list says "error monitoring"; performance
tracing is a separate future decision, not smuggled in. Environment
tag from `VERCEL_ENV`; enabled in production only (preview/dev send
nothing).

### D7 — The boundary stated

Sentry sees the product's FAULTS, never its DATA: it is observability
of the machine, not a processor of candidates. SDK imports exist in
exactly the init files, the two boundaries, and the one helper — the
348 throw sites and 95 log sites stay Sentry-ignorant, so the
dependency can be removed by deleting five files and one config
wrapper.

### D8 — Out of scope

- Alert routing to email/Slack — channel-shaped; the Sentry UI
  suffices at current scale, and email routing joins the Resend era.
- Uptime/cron monitors (different category; Checkly-shaped, unqueued).
- Client breadcrumb enrichment, source-map upload for previews.
- The stuck-mandate retry surface (§55) stays product work — Sentry
  will now RECORD those failures, not fix them.
- The rate-limiting bundle — next in the deferred list, its own slice.

---

## Phases 1–4 — the ladder, adapted (GATED)

**No build work past Phase 0 until the founder's written
D-confirmation.** Then: Phase 1 — marketplace install (founder-hand
claim), hand-wiring, green gate (tsc / vitest 790 / eslint / build),
deploy. Phase 2 — driven live on production: a deliberate
founder-gated probe fault thrown server-side and client-side,
confirmed end-to-end in the Sentry UI, then REMOVED; the PII probe —
inspect a captured agent-seam fault in the UI and verify no bodies,
no emails, no names, no model input. Phase 3 — the seam captures
proven on a real fault shape with tags correct; boundary capture
proven by a forced render error. Phase 4 — §59 drafted with verdicts
(including whether alert email joins the Resend slice); no completion
declaration until the founder's written confirmation; this file is
deleted only after it.
