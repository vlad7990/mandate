# The pre-launch checklist, slice seven — THE STATUS PAGE — Phase 0 + THE D-GATE — 2026-08-25 — DRAFT

**Status: DRAFT. Nothing here is confirmed. Build waits on the
founder's written word against THIS document.** The checklist line is
"Set up status page"; Phase 0 read it against the code and against the
structural truth every status page lives with.

Scope: what "is Mandate up?" means, who can ask it, and what answers
honestly.

---

## Part 1 — What Phase 0 found, in code

### The dependency graph a status page would speak for

1. **Vercel** — serving, functions, and the daily cron
   (`vercel.json`: `/api/cron/maintenance` at 06:00 UTC).
2. **Supabase** — Postgres behind RLS, Auth (GoTrue), Storage (CVs).
3. **Anthropic** — every one of the 24 agent principals.
4. **Resend** — founder notifications + the Monday digest; the
   delivery webhook is built but DORMANT until the founder wires
   `RESEND_WEBHOOK_SECRET` (it answers 503 by design).
5. **Turnstile** — optional, keys founder-pending.

### What exists today, and what does not

- **No health endpoint of any kind.** The only API routes are
  copilot, demo, the Bearer-gated cron, and the svix-gated webhook.
- **No persisted cron heartbeat.** The daily run leaves Vercel logs
  and — only when something earned or swept — fee events and weekly
  report rows. A silent cron failure is invisible until Monday's
  digest doesn't arrive.
- **A status claim read from nowhere:** the sign-in footer hardcodes
  "Node Status: Active" as decorative copy. Against the honesty
  doctrine this is a defect of the same family the handbook's D3 law
  guards against — a sentence the code cannot back.
- **No status link** on the marketing surface.
- Sentry is live for error monitoring (§ D4 scrub harness) — alerting
  exists; *public availability signalling* does not.

### The structural truth

A status page served by the same Vercel deployment it reports on is
blind to the outage class that matters most: when Vercel or the
deployment itself is down, the page is down with it. Industry
practice is an external monitor + externally hosted status page. But
an in-product page CAN honestly report every *degraded* state — DB
unreachable, auth failing, cron stale — and those are the likelier
failures. The honest design is both, each naming its own limits.

### Two ruled constraints that bind this slice

- **The anon grant roster is TWELVE and ruled (§136).** A status page
  must not mint a thirteenth. Server-side checks run inside the route
  with the service-role client (the HM-portal precedent) — no new
  grants, no new policies.
- **The proxy allowlist is the trap (§138's defect).** Any new public
  route joins `PUBLIC_PAGES` / `ALWAYS_PUBLIC_PREFIXES` in the same
  commit that creates it.

---

## Part 2 — THE D-GATE (drafted, awaiting the founder's word)

### D1 — `/api/health`: the machine-readable answer

A public, unauthenticated, cheap endpoint returning
`{ ok, checks: { db, auth, cron } }` with per-check `ok | degraded`
and nothing else — no versions, no table names, no error strings.
Checks:

- **db** — a round trip through PostgREST using the anon key against
  an existing anon door (zero-row, read-only; e.g.
  `verify_staff_invitation` with a random uuid). Proves API + DB
  without exposing a row or minting a grant.
- **auth** — GoTrue's own `/auth/v1/health`.
- **cron** — heartbeat staleness (D3): last stamp older than 26 h
  reads `degraded`.

Results cached in-memory ~30 s so scraping the endpoint cannot become
load. Joins `ALWAYS_PUBLIC_PREFIXES`.

**Recommend: as stated.**

### D2 — `/status`: the human-readable page

A public marketing route (terminal language, the /handbook pattern —
`PUBLIC_PAGES` in the same commit) rendering the same checks as
lights — a dot plus a word, never colour alone — with timestamps,
and stating its own blind spot in words: this page shares the
product's infrastructure; if it is unreachable, that is itself the
signal, and the external monitor (D4) is the authority. Footer gains
the Status link beside Handbook. No history/uptime percentages in
v1 — nothing is persisted to compute them honestly.

**Recommend: as stated.**

### D3 — the cron heartbeat: migration 115

A tiny `ops_heartbeats` table (name PK, `last_ok_at`, `detail`
jsonb), deny-all RLS — no session policies, the limiter-pair
precedent (§127: deny-all never gains a session policy); the cron
route stamps it via the service-role client at the end of every
successful run, and `/api/health` reads it the same way. No new anon
grants, no new policies beyond deny-all.

**Recommend: as stated. Migration 115 claims: the table + its
deny-all RLS.**

### D4 — the external monitor — FOUNDER-OWNED

An off-platform uptime monitor pinging `/` and `/api/health`
(UptimeRobot's free tier suffices; BetterStack if a hosted public
status page + `status.getmandate.io` CNAME is wanted later). This is
an account signup + two URLs — founder hands only. Surfaced once
here per the standing rule; the slice ships without it and the
/status page's own-blind-spot sentence covers the gap honestly until
it exists.

**Recommend: UptimeRobot free, two monitors, no DNS in v1.**

### D5 — the "Node Status: Active" footer on /auth/signin

Ruling wanted: either wire it to the same health read (an extra
fetch on every sign-in render for a decorative line) or soften the
copy to something the code can back. **Recommend: soften the copy —
the sign-in page should not spend a round trip on flavor, and a
hardcoded "Active" is exactly the unread status claim this slice
exists to end.**

### D6 — the ladder on confirmation

Migration 115 (file + MCP) · `/api/health` + heartbeat stamping in
the cron route · `/status` page + footer link + proxy allowlist ·
D5 copy fix · green gate (tsc / vitest 964+new / eslint / build) ·
commit · deploy · **drive 101**: `/status` and `/api/health` read
green in prod from a logged-out browser; the cron invoked with
`?sweep=` absent via its Bearer secret stamps the heartbeat and the
page's cron light flips from degraded to ok; teardown = none needed
(the heartbeat row is durable state, baseline gains ops_heartbeats
1) · § DRAFTED, no completion declared.

---

## Part 3 — Named rulings

- **R1 — no light without a reading.** Every status the page shows
  is a live check or a persisted heartbeat; nothing is hardcoded
  "operational", including the sign-in footer.
- **R2 — the health endpoint exposes states, not internals.**
  `ok | degraded` per subsystem and a timestamp; no error detail, no
  versions, no names of anything.
- **R3 — same-platform honesty.** The page states in words that it
  shares the product's infrastructure and names the external monitor
  as the authority for full outage.
- **R4 — no thirteenth anon grant.** All server-side reads for
  status run inside routes with the service-role client; the
  heartbeat table is deny-all.

Numbers at drafting: next migration 115 (claimed by D3), next § 139,
next drive 101 (claimed by D6); vitest 964; anon grant roster TWELVE;
durable baseline 25/24/74/5/5/1/1/2/2/1/1 + tasks 0 + objectives 0 +
auth 25 + orgs 1 + staff_invitations 0 + rate_limit 0 (ops_heartbeats
+1 durable on D6's drive).
