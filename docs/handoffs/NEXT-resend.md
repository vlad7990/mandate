# NEXT — Resend: the channel opens (the deferred list's third item)

Status: **Phases 1–4 EXECUTED (2026-08-24, D1–D8 confirmed). The
channel is OPEN — first delivery in the product's history; the
scheduled sweep proven live in both faces (running and
agent-suspended), events carrying 087's reserved `scheduled`
trigger. §63 verdicts DRAFTED — awaiting the founder's written
confirmation; this file is deleted only after it.**

Third item of the deferred build list (Sentry ✓ §60 → rate limiting ✓
§62 → **Resend** → Stripe), opened on the founder's word 2026-08-24.
Next migration: **089** — already spoken for by §62's confirmed
verdict (the demo wrapper retires); the sweep itself needs NONE.

---

## Phase 0 — enumeration from the code (the §5h rule)

### The finding that reframes the slice

**This is not a build-the-channel slice. The channel is built.**
Phase 0 found:

- `src/lib/email/send.ts` — a complete Resend client with the
  delivery-honesty rule (never throws, never pretends: `sent` /
  `not-configured` / `refused` / `network`, and every caller must
  surface a failure to the person who initiated the send).
- `RESEND_API_KEY` and `RESEND_FROM` — **live in Vercel production
  for 115 days.**
- The marketplace Resend installation — present since 2026-08-13.
- Three surfaces FULLY WIRED and currently failing honestly:
  external invitations (both the org-side and portal-side people
  actions), candidate portal link emails, and the waitlist founder
  notification.
- **The live proof, from §61's own drive**: the waitlist notifier
  fired three times on production and Resend answered each with
  `403 — The getmandate.io domain is not verified. Please add and
  verify your domain on resend.com/domains.`

**The entire blocker is one founder-hand act**: add the DNS records
Resend lists for `getmandate.io` (SPF, DKIM, and the bounce MX) at
Namecheap and let verification pass. This is the founder item every
handoff since §7 has carried. The moment it verifies, three product
surfaces start delivering with ZERO code change.

### What the channel unblocks, enumerated

1. **Working instantly** (wired, zero code): invitations, candidate
   portal links, waitlist pings.
2. **The scheduled sweep** (§58's standing promise): the
   `/api/cron/maintenance` socket documents exactly where it plugs
   in; the Search Health Agent, its `scheduled` trigger value, and
   its kill switch have been staged since 087 — NO migration. The
   cron already runs daily at 06:00 UTC.
3. **Stalled-search alerts** — the cron route's own comment: health
   is "detection without a channel"; the channel arrives.
4. **Sentry alert routing** (§60's confirmed verdict) — Sentry-side
   config once email exists; no code.
5. **Auth email via SMTP** — GoTrue still uses Supabase's built-in
   sender (rate-limited, generic sender address); the recover
   action's comment anticipated "the SMTP switch". Founder-hand in
   the Supabase dashboard, no code.

### What deliberately does NOT send

The weekly report's "Draft Client Email" opens the recruiter's OWN
mail client by design — client-facing mail comes from a person, not
from noreply@. Candidate outreach composes drafts, same reasoning.
Neither converts.

---

## Decisions for confirmation

### D1 — The gate is DNS, and the slice waits for it

Like §59 gated on the DSN: no simulated sends, no sandbox domain.
The founder adds the records Resend lists at resend.com/domains →
Namecheap; Phase 1 begins when verification is green. (`onboarding@
resend.dev` test sends are refused as a proof mechanism — proving
delivery from a domain we don't ship with proves nothing.)

### D2 — The three wired surfaces get driven, not rebuilt

Post-verification, Phase 3 drives each live: an invitation to a
scratch external (received, link redeems), a candidate portal link
(received), a waitlist submission (founder inbox pings). Zero code
changes expected; any defect found is fixed in the drive, §57-style.

### D3 — The scheduled sweep lands, exactly as staged

A `runScheduledSweep()` seam invoked from `/api/cron/maintenance`
(CRON_SECRET-gated, fails closed), **Mondays only** (the route runs
daily; the sweep checks the weekday): for each ACTIVE project, the
cron signs in THE SEARCH HEALTH AGENT — same credential, same kill
switch, suspension refuses the whole sweep at sign-in —
`runWeeklyReportAndPersist` then `runHealthSuggestionsAndPersist`
(its own health gate spends nothing when healthy), each event
carrying **trigger `scheduled`** — the vocabulary value RESERVED in
087, used for the first time. Then ONE digest email to the founder
allowlist: mandate titles, health statuses, reports written,
suggestions generated — counts and titles, no candidate data. D5
fail-soft: a refused agent skips the judgments but the digest still
reports what it found (including "the agent is suspended"); a
refused SEND leaves everything landed and logs + captures — the
sweep's writes are the record, the email is only the channel.

### D4 — Delivery honesty joins Sentry

`send.ts` keeps returning outcomes; its `refused` and `network`
paths additionally `captureSeamError` (`seam: email`) — recipient
counts and reason codes only, never addresses or bodies (§59-D4
extended). The waitlist notifier's 403s would have been in Sentry
from day one of the §60 slice had this existed; now they will be.

### D5 — What the reader sees

Unchanged where already authored (invitation failures already
surface to the inviter). The sweep digest states its own gaps
honestly: a project whose agent run failed is listed with "run
failed" rather than dropped — a digest that silently omits failures
reads as "all healthy", the §59 half-blind-monitor lesson applied to
email.

### D6 — What may ride an email

Email is the product speaking to NAMED people — a different boundary
from telemetry: invitations carry names by design. The rule is
scoped per message: the sweep digest carries mandate titles and
counts, never candidate names, briefs, or feedback; auth mail
carries what GoTrue puts in it; nothing carries model input. Email
CONTENT is never stored — the trail records acts (events already
exist for invitations), not correspondence.

### D7 — The boundary stated

Email is a channel, not a record and not a trigger: nothing in the
product changes state because an email was sent or failed — the
sweep's writes land first and stand regardless; the invitation's row
exists before its email. Removing RESEND_API_KEY returns every
surface to its honest not-configured state (the kill switch, the
same env-pair shape as everything else).

### D8 — Out of scope

- GoTrue SMTP switch — surfaced as founder-hand config (item 5
  above); recorded, not driven by this slice.
- Client-facing report email and candidate outreach stay
  draft-based (the recruiter's own mail client, by design).
- Marketing/drip email, per-recipient preferences, unsubscribe
  infrastructure — none exists to need it; nothing here is bulk.
- Sentry alert routing — Sentry-side config, founder-timed.
- Stripe — the deferred list's last item, its own slice.

---

## Phases 1–4 — the ladder, adapted (GATED)

**No build work past Phase 0 until the founder's written
D-confirmation — and Phase 1 additionally waits on DNS verification
(D1), the founder-hand gate.** Then: **Phase 1** — migration 089
(§62's confirmed cleanup: demo wrapper + 061 table retired, the demo
route onto the shared helper) and the sweep seam + D4 capture
wiring; green gate; deploy. **Phase 2** — invariants-grade proof
where it applies: vitest on the sweep's weekday gate and digest
assembly (counts, the run-failed honesty), the 089 migration's
compat pin re-run. **Phase 3** — driven live on production: the
three wired surfaces (real inbounds), then the sweep forced once
out-of-schedule via CRON_SECRET with the digest received, events
carrying `scheduled` under the Search Health Agent, then the agent
SUSPENDED and the sweep re-forced — judgments refused, the digest
still honest; teardown of scratch rows to baseline. **Phase 4** —
§63 drafted with verdicts; no completion declaration until the
founder's written confirmation; this file is deleted only after it.
