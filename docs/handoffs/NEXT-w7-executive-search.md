# NEXT — W7 Executive Search, then activity and shortlist

Paste the block below as the first message of a fresh session.

This file is the continuation prompt, not a handoff. The handoff is
`2026-08-13-roles-clients-placements-advisor-action-errors.md` and the survey
is `docs/sample-data-inventory.md`. Delete this file once the work lands.

---

```
Read these three first, in this order:

1. docs/sample-data-inventory.md — all 46 dashboard routes. W1–W6 are done;
   §1 holds the decisions, and D1 is the only one still open.
2. docs/handoffs/2026-08-13-roles-clients-placements-advisor-action-errors.md
   — the state of the world. §2 is the role model, §6 the verification
   recipe, §11 the server-action contract, §12 the last advisor sweep.
3. CLAUDE.md — working rules. Note especially: never commit or push without
   approval (propose the message first), the four-command green gate, the
   server-action failure contract, and that migrations go to the live DB via
   MCP *and* into a numbered file.

Work in /Users/vladbreygin/Projects/mandate. Supabase project
xipyqnltkbtywxqyxupf. Bash cwd can reset to a stale iCloud clone at
"/Users/vladbreygin/Mandate Recruiting/mandate" — check `pwd` first.

main is clean and pushed at 3ffff42. Migrations 046–061 applied; next is
062. 641 tests, tsc / lint / build green. Baseline live data: 1 org
(Mandate HQ), 2 projects, 1 candidate, 1 client, 1 user, 1 auth user, 0
sessions, 0 contacts, 0 notes, 0 placements, 0 activity events, 0 waitlist,
5 skills, 24 global competencies, 8 global templates, 1 job_spec.

## The task: W7 Executive Search — but survey it before you plan it

The inventory says W7's eleven routes are "entirely blocked on D1". **Check
that before believing it.** The same claim was made about
/app/projects/[id]/comparison in W6 and was wrong: that page calls no model
at all — its master table, tier bands, reality statement and "final partner
take" are computed in TypeScript by `comparison-export.ts`. The survey
classified pages by what they look like, not by what they call.

A grep run at the end of the last session says the same is true across most
of W7. **No page under /app/executive-intelligence renders agent output
directly** — they read stored rows. Only three action files invoke an agent:

    searches/new/actions.ts                          (company context)
    searches/[id]/success-profile/actions.ts         (success profile)
    searches/[id]/candidates/[candidateId]/interview-plan/actions.ts

Notably **the executive assessment is not agent-generated** — its actions
file has no agent call, so the assessment is authored by a recruiter. The
inventory lists `.../assessment` as `generated` and D1-blocked, and that
looks wrong. Confirm it rather than taking this note's word for it.

If that holds, D1's real surface is two screens — the success profile and
the interview plan — not eleven. That may be small enough to answer with
the existing precedent rather than a founder decision. **The precedent is:
a score never travels without the fact that produced it** (see
`sample-candidate-detail.tsx`, and its application to five dimensions and
six people in `sample-reports.tsx`). Everything W3–W6 needed fell inside it.

### Current state of the eleven routes

Four already render: /searches/[id] and .../report have sample components
from earlier work; /competencies and /templates need nothing (D4, 613526a).
/searches/new is a form.

Four have an `isSampleId` branch rendering `SampleNotBuilt` — the honest
"not in the sample yet" state added by the W4 sweep: /searches/[id]/
candidates, .../success-profile, .../assessment, .../interview-plan. They
no longer redirect silently; they are waiting for content.

/app/executive-intelligence itself and /searches are `thin` / `empty-only`
with no sample branch, because they have no dynamic segment — they need the
`shouldShowSample` treatment that /app/analytics and /app/candidates/network
got in W6 and W4.

## Then two things outside every workstream

- **/app/projects/[id]/shortlist** appears in no table in the inventory. A
  gap in the original survey, found when the module rail needed a complete
  list. It is the last entry in `SAMPLE_MODULES_PENDING`, so the sample
  mandate rail still says "not in the sample // Shortlist".
- **/app/activity** is genuinely last — the trail is a projection of the
  other entities, and 053's describe.ts derives the sentence from stored
  facts. Seeded before them it reads as noise.

## How the sample is built now — read this before adding a screen

Six workstreams have settled a shape. Follow it rather than re-deciding.

- **Fixtures in `src/lib/sample/`**, one file per workstream, all re-exported
  from `index.ts`. `data.ts` (mandates, candidates, clients, placements,
  skills, network), `mandate-modules.ts` (W3), `reports-analytics.ts` (W6),
  `sourcing.ts` (W5).
- **Components in `src/components/sample/`.** Server components, no queries.
- **Read-only, always.** No control that cannot work — the call made in
  5107767 and applied every time since. Where a screen is nothing but a
  pending write (/candidates/new, the sourcing import wizard), the honest
  `SampleNotBuilt` state is the deliverable, not a gap.
- **D3 is answered**: page-level labelling only — `SampleBanner` plus
  `// sample data` in the subtitle. No per-row chip. Written into the header
  of `src/lib/sample/index.ts`. Do not invent a third mechanism.
- **Derive, never restate.** Every number that appears on two screens is
  computed from one source. This is not tidiness; see the traps below.
- **`src/lib/sample/routes.test.ts`** walks the route tree and fails the
  build if any dynamic dashboard route stops handling a sample id. Its
  exemption list is empty and needs a written reason to grow.

## Traps that cost time, in the order they bit

- **A sample id is not a uuid.** A route that passes one to PostgREST gets
  22P02, which is not PGRST116, so it falls into the `redirect("/")` arm
  meant for "not yours" and lands the reader on the dashboard with no
  message. Twenty routes did this. `routes.test.ts` now guards it.
- **Two screens describing the same thing drift silently.** W3 found the
  mandate page claiming spec v4 and nine dimensions while /spec said
  FINAL_V01 and /calibration-history said five. W6 found the sample using
  five invented dimension names the product does not have. Both were only
  visible because a second screen got built. Assume any number you type
  twice is already wrong.
- **A guard that a control run walks through is not a guard.** Two tests
  passed this session while the thing they checked was broken —
  `call-sites.test.ts` matched a leftover import, and `routes.test.ts`
  matched `isSampleId` in an import line rather than a call. Always invert
  something and watch it fail.
- **Screenshots catch what tests do not.** The comparison screen said "two
  at Tier 2" beside a table showing three. Read the rendered page.
- **Running `npm run build` while `next dev` is live poisons .next**, and
  dev then 404s routes that exist. `rm -rf .next` and restart.
- **053's member-audit trigger fires on seeds using `on conflict do
  update`**, so clear activity_events for test orgs after seeding. Scope the
  delete; never a bare DELETE.
- **`:has-text("Mandate")` matches the sidebar wordmark**, which links to
  /app/home. Use href selectors when driving the browser.

## Verification — this project expects it

- UI changes are driven in a browser under a temporary account (§6 recipe;
  GoTrue needs '' not NULL in the token columns). Sample mode needs an org
  with **no data**, so that means a scratch organisation.
- Anything about error messages uses `npm run build && npm start`, never
  `npm run dev`.
- Check 360 / 390 / 768 / 1024 / 1440 for horizontal overflow.
- Policy or function changes are proven by impersonation against the live DB
  with real inserts, followed by a control run with the last assertion
  inverted. Seven worked examples in supabase/tests/*_invariants.sql.
- The founder's org is the live one. Delete test data and check counts
  against the baseline above before finishing.

## Founder-owned, do not start

- **D1** — what a fabricated agent may say about a fabricated person. Read
  the survey above first; it may be a two-screen question rather than an
  eleven-route one.
- **The Anthropic balance is negative** and auto-reload is off, so no agent
  path runs. D2's "seed a mandate and let the agents fill it" is still not
  executable.
- **Password floor** — Auth → Providers → Email: minimum length 12, all four
  character classes. Not plan-gated, five minutes. The app already enforces
  it (src/lib/auth/password-policy.ts); until the dashboard matches, the real
  floor is 6.
- **Leaked-password protection** is Pro-gated and the org is on free. §7.
- **Resend** — marketplace resource still Onboarding, DNS half-done. §7.

## Conventions

Commit on a branch, fast-forward to main, push — after proposing the
message. Migrations numbered and applied via the Supabase MCP *and* written
to supabase/migrations/. One handoff doc per session: update the existing
one rather than starting a new file, and rename it if its name stops
describing its contents. Delete docs/handoffs/NEXT-w7-executive-search.md
when this work lands.
```
