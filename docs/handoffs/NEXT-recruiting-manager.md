# Programme — the Recruiting Manager persona

Second of the seven personas (the Recruiter closed 2026-08-19, handoff
§17). The buyer persona: the person who runs the search firm, signs the
contract, and asks "how is my desk doing" — today they'd have to log in
as an admin and click through every mandate one at a time.

Work in `/Users/vladbreygin/Projects/mandate` (Bash cwd resets to a
stale iCloud clone — check `pwd` first, every time; the Playwright MCP's
file roots also point at the clone, see memory). Supabase project
`xipyqnltkbtywxqyxupf`. main is clean, pushed and deployed at `b5ae79c`.
**Next migration is 064.** 707 tests, tsc / lint / build green on Next
16.3.1. Baseline: 1 org, 2 projects, 1 candidate, 1 client, 1 user,
1 auth user, 0 sessions/contacts/notes/placements/activity/waitlist,
5 skills, 24 global competencies, 8 global templates, 1 job_spec — plus
3 feedback and 3 hm_tokens rows from May that are the founder's own.

## The goal, and the finish line

When everything below is done, send the message **"Recruiting Manager
persona is complete."** Not before. Definition of done: *a recruiting
manager can run a desk of several recruiters entirely inside the
product — every mandate's health, every recruiter's load, pipeline and
placements, and the firm's revenue book, without asking anyone — with
every number derived rather than asserted, and every absent feature
carrying a written verdict.*

## What already exists (do not rebuild)

- **Visibility is not the gap.** `org:read` has meant "sees everything"
  since 046; an admin already reads every mandate, candidate, placement
  and the activity trail. What's missing is *attribution* (whose desk is
  this?) and *aggregation* (one screen that answers the manager's
  question).
- **Fees:** `fees:read` + the per-row credit exception (§10) is exactly
  the manager/recruiter split money needs — a manager role slots into
  the existing capability, no new fee model.
- **Raw material for the dashboard:** portfolio home, /analytics,
  /placements with the revenue book, /activity (§5b, org-wide, actor
  attribution), per-project search health computed at render, weekly
  report agent per mandate, the guarantee cron (062).
- **Agent 14's slot:** §14 left "weekly sweep — an Anthropic call per
  active mandate" parked in the cron route pending credit. Credit
  exists now; the manager persona is its natural customer.

## Phase 0 — decisions the founder makes first

Four decisions shape every migration after them. Settle these before
writing a line:

- **D1 — Is "manager" a fifth role, or what `admin` already means?**
  Today admin = manager in capabilities. But roles.ts's own argument
  ("coinciding capabilities diverge") says a firm will want managers who
  see the whole desk and the money *without* being able to suspend
  members or edit the org. Proposal: a fifth role `manager` =
  recruiter's writes + `fees:read` + the new desk views, minus
  `org:manage`. The CHECK constraint (046), the signup trigger, roles.ts
  and every invariants file that enumerates principals must move
  together.
- **D2 — The ownership model.** `projects.created_by` is authorship,
  not assignment; nothing in the schema says whose mandate it is.
  Proposal: `projects.lead_recruiter_id` (FK to users, org-checked like
  every 060 composite), backfilled from `created_by`, reassignable by
  admin/manager, surfaced everywhere a mandate is named. A
  project_members join table is the "supporting researchers" future —
  defer it; one lead column is what the dashboard needs.
- **D3 — May a manager reassign, or only observe?** Proposal: reassign
  yes (it's the single management *action* the persona needs; audited
  through the 053 trail), but no other new writes — a manager who wants
  to edit a mandate has recruiter capabilities already.
- **D4 — What is "desk health"?** Proposal: derive, don't invent — roll
  up the existing per-mandate search-health states per recruiter, plus
  load (active mandates), pipeline counts by stage, activity recency,
  and placements/fees (manager sees money; the §10 exception already
  covers credited recruiters). No new scoring model.

## Phase 1 — the model (migrations 064+)

Role + ownership, with the discipline the last programme proved out:

1. Migration adding the role (if D1 says yes) and
   `lead_recruiter_id`, org-composite FK included — **remember §16's
   lesson: after 060, every new PostgREST embed needs an explicit FK
   hint.**
2. RLS: manager slots into existing predicates (`can_read_fees` etc.);
   reassignment write path guarded; last-admin protections untouched.
3. Invariants files with control runs (invert the final assertion, and
   *check the control actually changed the file*): role capability
   matrix probed as all five roles + founder + suspended + pending +
   anon; the suspended-account loop (assertion 1 of
   `suspended_account_invariants.sql`) picks up any new table
   automatically, but the principal enumeration in
   `users_policy_invariants.sql` must add the fifth role by hand.
4. Backfill `lead_recruiter_id` from `created_by`; assert no orphans.

## Phase 2 — the desk surfaces

The manager dashboard, from existing parts. Every new screen ships with
labelled sample data (standing rule — no bare empty states):

1. **/app/desk** (name TBD): per-recruiter rollup — active mandates,
   stage funnel, health states, last activity, placements and fees this
   quarter. Drill-down to a recruiter's mandate list.
2. **Reassignment** from the mandate header (D3), written to the
   activity trail with actor and both recruiters in `detail`.
3. **Revenue view:** the placements/fees book grouped by recruiter and
   by client — mostly a re-cut of /app/placements queries the manager
   role can already read.
4. **Nav and route guards:** desk routes visible to manager+admin,
   researcher/viewer refused at the proxy like every 046 route; drive
   it as all roles in the browser, not just the happy path.

## Phase 3 — the manager's agent

The weekly desk sweep, plugged into the slot §14 reserved: the cron (or
on-demand button first — cheaper to verify) walks active mandates,
reuses each mandate's stored health rather than re-deriving it, and one
Anthropic call synthesises the desk digest a manager would read Monday
morning. Cost control: one call per digest, not per mandate; the
per-mandate weekly report agent already exists for depth. No email until
Resend (deferred list untouched) — the digest renders in the dashboard,
and the empty channel is stated on the screen, §14-style ("detection
without a channel" honesty).

## Phase 4 — live verification, verdicts, sign-off

1. Scratch org per §6's recipe ('' not NULL token columns; clear
   `activity_events` after seeding) — **plus a wrinkle the recruiter
   programme never had: signups now require email confirmation (§18),
   so scratch accounts must be inserted confirmed, and GoTrue rejects
   `.test` addresses only on real signups, not direct inserts.**
   Seed *two* recruiters + one manager; run a small live loop on each
   recruiter's mandate (credit exists; reuse the phase1 CV generator —
   `docs/handoffs/phase1-assets/generate-cvs.mjs` was deleted with the
   directory but lives in git history at `948df84^..8a109f6`, restore
   with `git show`).
2. Drive every desk surface as manager, recruiter, researcher, viewer:
   the recruiter must NOT gain the desk view, the researcher must not
   see money, the manager must see both recruiters' desks.
3. Production build throughout (`npm run build && npm start`, kill by
   port — `kill $(lsof -tiTCP:3000 -sTCP:LISTEN)`); expect first-run
   defects, fix as found — the last programme found seven this way.
4. Written verdicts on the absences a manager will ask about — draft
   list to confirm or overrule: individual targets/quotas; commission
   splits; capacity planning; time-to-fill benchmarks vs market;
   recruiter performance scoring (careful: §14's DEI reasoning has an
   echo here — scoring *people who work for you* is a feature to design
   deliberately or decline, not to bolt on); CSV export of the desk.
5. Founder confirms the verdicts → cleanup to baseline → declaration.

## Conventions and traps (carried forward)

- Green gate before any commit; branch → ff → push. Migrations via MCP
  **and** a numbered file. Update the 2026-08-13 handoff (§19 next);
  delete this file when the programme completes.
- Slow agent actions: polling views' unstick timeouts must exceed
  measured latency (§16 defect 5); `after()` in render paths cannot
  touch `cookies()` (§16 defect 3).
- react-pdf: read every PDF; the `ř` glyph gap (§16) will appear in any
  desk export with EU names until the glyphs.ts fix lands.
- Sample data: derived counts only — the EI programme's
  "screen contradicting itself" defect family (§13) is the thing the
  desk rollup is most at risk of reintroducing.
- Agent prompts that could cite the outside world must be forbidden
  from it unless they hold a research tool (§16 defect 6) — the desk
  digest prompt inherits this rule on day one.
