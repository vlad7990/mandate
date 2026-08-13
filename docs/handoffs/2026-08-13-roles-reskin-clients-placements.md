# Continuation — roles, the terminal re-skin, the client entity, and placements

**Date:** 2026-08-13
**Supersedes:** `2026-08-13-platform-features.md` entirely. Both open
decisions in it are now made, and five of its priority items are done. Its
Resend and `ANTHROPIC_API_KEY` blockers are unchanged and repeated below.

Work in `/Users/vladbreygin/Projects/mandate`. Supabase project
`xipyqnltkbtywxqyxupf`. Bash cwd resets to a stale iCloud clone between calls
— always `cd` first or use `git -C`.

`main` is clean, pushed, and deployed to `getmandate.io`.
Migrations `046`–`052` applied; schema and code are in step. 505 tests
(was 389), tsc / lint / build green. **Next migration is 053.**

Seven commits, in order: `498e46f` roles and route guards, `dfd2ca5` the
terminal re-skin, `567d0f5` and `2e482df` responsive repair, `a288eb8` the
client entity, `460bb8c` the placement and fee record, `09acbac` the five
bugs the browser found plus sample data for the revenue screen.

---

## 1. The decisions, now made

Both were the founder's to make, and neither is derivable from the code.

**Terminal wins.** Sharp corners, uppercase mono labels, `//` separators,
tabular numerals — everywhere. The reasoning: the marketing site, the OG card
and the landing page already commit to it, so a buyer converting off that
site was landing in a softer, more generic product. Done and shipped; the
soft language no longer exists anywhere in the dashboard.

**Four staff roles: `admin`, `recruiter`, `researcher`, `viewer`.** Chosen
over both a minimal admin/recruiter pair and a persona-shaped five-role set.
Hiring managers and clients stay on the token portal at `/hm/[token]` and get
no login — that is what kept the role model a column on `users` rather than a
`project_members` graph with per-project RLS on every recruiting table. It is
the decision to revisit if clients are ever meant to live in the product.

**The client entity is identity plus company profile.** Company research and
client psychology are canonical on the client and snapshotted per mandate;
client skills scope to a client. Contacts, notes and commercial terms were
all considered and excluded from that pass — see §5. Commercial terms landed
with the placement record in 050 (§5a), as a separate `fee_terms` table
rather than columns on `clients`, for a reason that only became visible once
`fees:read` existed: `clients` is readable by every active role and an
agreement is not, and RLS is row-level, so they cannot share a row.
**Contacts and notes are still not built.**

---

## 2. Roles and route guards

`src/lib/auth/roles.ts` is the source of truth for the capability matrix;
`supabase/migrations/046` mirrors it in Postgres. They must stay in sync and
both say so at the top.

| | admin | recruiter | researcher | viewer |
|---|---|---|---|---|
| `org:read` | ■ | ■ | ■ | ■ |
| `candidates:write` | ■ | ■ | ■ | □ |
| `mandates:write` | ■ | ■ | □ | □ |
| `clients:share` | ■ | ■ | □ | □ |
| `fees:read` | ■ | ■ | ◩ | □ |
| `skills:write` | ■ | □ | □ | □ |
| `org:manage` | ■ | □ | □ | □ |

`fees:read` arrived with 050 and is the **first capability that restricts a
read** — everything above it is a write tier over data every active role can
see. ◩ is the own-placement exception: a researcher sees the fee on a
placement they own or sourced and on no other. See §10.

`is_founder` is deliberately **not** a role. It is the platform-operator flag
gating Mandate's own waitlist and cross-org administration — not a customer
tier. A founder is an `admin` *and* a founder.

**Three layers, one of which is a boundary.** `src/proxy.ts` decides whether
a route renders; `assertCapability` decides whether a mutation runs; RLS
decides whether Postgres accepts the row. Only the third is a security
boundary — a signed-in user holds their own anon key and can reach PostgREST
from a browser console. The first two exist so the product tells the truth
about itself before the database has to refuse.

Note the middleware file is `src/proxy.ts` (Next 16), not `middleware.ts`.

**Why the action sweep was cheap.** Twenty action files each carried a
private `requireAuth()` returning `{userId, organizationId}`. They now
delegate to `requireActionContext(cap)`. That covered every exported action
in those files — 84 at the time, 85 now — without editing them one at a time,
and means the check cannot be missing from one action in a file where the
others have it. Two actions had no guard at all and were found by audit, not
by the sweep — `regenerateCompanyContextAction` checked only that you were
signed in.

### Two things 046 fixed that were not asked for

**Suspended users could still write.** No policy anywhere looked at `status`.
A suspended account kept its `organization_id`, so RLS kept accepting its
reads and writes; only the dashboard layout's redirect stopped it, and a
redirect is not a boundary. `current_user_role()` returns NULL unless the
account is active, and every policy requires a non-null role.

**The `cvs` storage bucket was org-scoped only** (047). It is a bucket, not a
table in `public`, so 046 did not touch it — a viewer could upload a CV or
delete the pool's documents. Found by walking what a researcher actually
does, which is also how `boolean_queries` turned out to be in the wrong tier:
filed under mandates, a researcher would have reached the sourcing screen and
had every button on it fail at the database.

### Consequences carried deliberately

**New accounts land at `viewer`, not `recruiter`.** The signup trigger wrote
`recruiter` for every non-founder, which was harmless while the column meant
nothing and would now mean an approved stranger arrives able to open mandates
and export to clients. **This changes onboarding**: approving an account no
longer gives it a working session — an admin must promote it from
`/app/settings/members`. Approving is still founder-only, because it assigns
the organisation.

**A researcher cannot reach `/sourcing` on a mandate whose spec is not
final.** The sourcing page redirects to `/spec`, which needs
`mandates:write`, so they land on no-access naming the wrong screen. Correct
in substance — a researcher may not finalize a spec — but the message is
wrong. Neither seeded project has a final spec, so the happy path has still
never been exercised.

**`current_user_role()` will keep tripping the Supabase advisor** as a
SECURITY DEFINER function callable by `authenticated`. It has to be: RLS
predicates evaluate as the calling role, so revoking it would make every read
in the product return nothing. `048` explains this next to the one revoke
that was safe to make.

---

## 3. The terminal re-skin

Mostly three edits repeated: radius off every dashboard surface, section and
panel titles from sentence-case `font-semibold` to mono uppercase, and the
same for chips, stage labels and empty states.

The leverage was in four shared components. `PageHeader` and `ListPanel` are
used by exactly the three screens that were soft; `Panel` by the fifteen
files that are most of the mandate workspace and all of the candidate detail.
Re-voicing those moved most of the product.

**The rules, if you are adding a screen.** They are written out at the top of
`PageHeader` in `src/components/ui/page-shell.tsx`, and the reference
implementations are `/app/settings/members` and `/app/no-access`.

- Uppercase in CSS, never `.toUpperCase()` — screen readers read the DOM
  text, so the announced name stays "Portfolio" while the eye gets
  `PORTFOLIO`. Transforming the string puts the shouting in the
  accessibility tree.
- Context lines are mono, uppercase, letter-spaced, `tabular-nums`, `//`
  between clauses.
- Nothing is rounded. The sidebar logo mark keeps its own geometry — it is
  the brand, not a surface.
- `TerminalTitle` for screaming-snake page titles; it inserts the break
  opportunities (see §4).

Portfolio carries `MANDATE // PORTFOLIO`, the shape picked when the decision
was made. It is the only screen with the wordmark in its title. The KPI tiles
stayed a four-tile grid rather than the label→number rows of the ASCII
sketch — the sketch was shorthand for "terminal", not a layout spec.

There is **no light theme** to check: `src/app/layout.tsx` hard-codes `dark`
on `<html>`. `next-themes` is a dependency but is not wired up.

---

## 4. Responsive repair — and the pattern behind it

Nine layout bugs, all pre-existing except one, surfaced by sweeping 27 routes
at five widths rather than by reading JSX.

**The recurring cause is worth naming: `flex-1` shrinks, it does not wrap.**
Five of the nine were a `flex-1` child in a `flex-wrap` row with no
`flex-basis`, so the row never broke to a second line and the content was
crushed instead — the ranking row's name squeezed to 10px, the skills row's
content to 13px, the mandate hero's h1 to 109px. The fix each time is a
`basis-[Npx]` declaring the width below which wrapping beats shrinking, and
`flex-wrap` on the parent if it is missing.

The others, each worth knowing once:

- **A table cell needs `max-w-0` before `truncate` bites.** The Candidates
  name column sized to the longest title — 736px for one candidate.
- **`sr-only` is `position: absolute`.** With no positioned ancestor its
  containing block is the root, so although each span is 1px wide it is
  *placed* at its static position — out at x≈700 inside a 720px table — and
  extends the document's scrollable width past the `overflow-x-auto` that
  should have clipped it. The whole Members page scrolled sideways while
  nothing visible was over-wide. Fix: `relative` on the scroll wrapper.
  This one was mine, introduced with the members screen.
- **A screaming-snake title is one unbreakable word.** `TerminalTitle` puts
  a `<wbr>` after each underscore: a break opportunity with nothing added to
  the text, so no hyphen appears and copy and screen readers are unchanged.
  `break-all` would give `GLOBAL_EXECUT / IVE_NETWORK`.
- **`shrink-0` on caller-supplied prose.** `MastHead` had it on both its
  label chip and its meta, and callers pass sentences to both.
- **An `<input>` will not shrink below its intrinsic ~20-character width**
  without `min-w-0`, whatever `flex-1` says.
- **A segmented control is one unit** and cannot shrink below the sum of its
  segments unless allowed to stack.

**Current state: clean at 360 / 390 / 768 / 1024 / 1440 across 27 routes**
— 135 page-widths — with no page scrolling sideways and no element
overflowing its container. SVG internals are excluded from that check by
design: recharts measures ticks and legend text inside its own viewBox, and
an SVG element's `scrollWidth` is not a page layout overflow.

---

## 5. The client entity

`projects.company_name` had been a text column since 001. Two mandates at the
same bank were unrelated rows sharing a string, and there was nowhere to put
anything that belongs to the client rather than to one search.

**The schema was already written, on the wrong row.** The executive-search
intake captures industry, business model, revenue range, headcount, funding
stage, ownership structure, geographic footprint and regulatory environment —
a complete company profile, stored per search and retyped for every search at
the same company. Migration 049 lifts those eight columns onto `clients`
rather than inventing a schema, so the intake populates a client and a client
can prefill the intake.

**What the client owns, and what the mandate keeps.** Company research and
client psychology are canonical on `clients` and reused across its mandates —
before this, a second mandate at the same bank re-ran identical research.
Each mandate still keeps the copy it used: a shortlist PDF exported in March
must render what it was built from, and reading through to a live record
would silently rewrite it in June. Same reasoning as the calibration
snapshots in 029. So `projects.company_context` and
`projects.client_psychology` did not move — they changed meaning from "the
only copy" to "the frozen copy".

**Dedupe** is a generated `name_key` column (`lower(btrim(name))`) plus a
unique index on `(organization_id, name_key)`. `clientNameKey()` in
`src/lib/clients/types.ts` must keep agreeing with it; there is a test that
says so. Legal suffixes are deliberately *not* normalised — "Acme Ltd" and
"Acme Limited" are different clients, and merging them is a human decision
the product does not make.

**Resolution** goes through the `resolve_client` RPC rather than
select-then-insert: role analysis runs in a background `after()` callback, so
two mandates opened at the same client seconds apart would both read "no such
client" and both insert. `ON CONFLICT` makes the unique index the arbiter.
The RPC is SECURITY INVOKER on purpose, and that was verified — a researcher
calling it directly is refused exactly as if they had inserted by hand.

**Client skills now scope.** `skills.applies_to_client_id` narrows a rule to
one client's mandates; null keeps the pre-049 org-wide behaviour so skills
written before this do not silently stop firing. None of the eight agent
runners changed — `loadActiveSkills` resolves the client from the project it
was already being given, which is why this cost one query rather than a
plumbing change through every call site.

### The trap in the backfill

`projects/new/actions.ts` inserts a mandate as **"Analyzing…"** and lets the
role-analysis agent fill the real name in afterwards. A naive backfill
therefore creates a client called "Analyzing…" and attaches every
half-analysed mandate in the org to it. Excluded in three places — the
migration, the RPC, and `isResolvableClientName` — because each is reachable
without the others. Both spellings are matched: the source uses U+2026 but
three dots survive some editors.

### Deliberately not in this pass

No contacts, no notes, no commercial terms. Fee terms in particular belong to
the client but fee *amounts* belong to the placement, so doing half of it
here would make the placement record harder rather than easier.

That call held up: **commercial terms landed whole with 050** (§5a), and
deferring them is what let them be modelled as one polymorphic `fee_terms`
table scoped to either a client or a mandate. Built in 049 they would have
been columns on `clients` — which `fees:read` would then have had to
retro-fit out of a table every role can read. **Contacts and notes are still
outstanding** and are now the last piece of the entity.

The clients list is also not paginated, unlike Mandates and Candidates: a
client count is bounded by how many companies an agency works for. It wants
`parseListParams` like the others the day that stops being true.

---

## 5a. The placement and fee record

Migrations `050`–`052`. The acceptance test was "can the product answer what
did we bill this quarter", and it can: `/app/placements`.

### The five commercial decisions, all the founder's

1. **Both fee models** — contingent percentage and retained in stages,
   chosen per client or per mandate. This is why a fee is a *ledger of
   lines* and not a column: a contingent fee is one line, a retained search
   is three, and a shape that holds only one of those needs migrating the
   first time the other is sold.
2. **Terms default on the client, override on the mandate, snapshot on the
   placement.** Same frozen-copy rule as `company_context` in 049 — if the
   placement read through to live terms, raising your rate next year would
   restate last year's revenue.
3. **A fallthrough is a status change plus a negative reversal line**, never
   a deletion or an edit of the original. The quarter that billed the fee
   still reports billing it; the clawback lands in the quarter it happened.
   A report run in March does not change in June.
4. **Multi-currency, rate fixed at booking**, stored beside the amount, so
   asking the same question twice returns the same number. Rates are typed
   in — there is no FX feed and nowhere to schedule one.
5. **Scope stops at "fee earned / invoiceable".** No invoice numbers, no
   cash received. That is an accounting system's book of record and a
   second one here would drift from it.

### The tables, and why the money is separate

`placements` is the event — dates, status, who is credited — and every
active role reads it. `fee_terms`, `placement_fees` and
`placement_fee_lines` hold every number and are behind `fees:read`.

**That split is not tidiness; it is the only way to write the rule.** RLS is
row-level, so "sees that a placement happened but not what it paid" cannot
be expressed as a policy on a table holding both. Compensation is on the fee
side for the same reason — a percentage applied to a salary is a fee.

`placement_fee_lines` carries instalments *and* reversals with a `kind`
discriminator and a signed amount, so a period's revenue is one `SUM` over
one table rather than a sum minus a sum — the form that goes wrong when
someone forgets the second half. The signs are CHECK constraints, not a
convention.

### Things worth knowing before changing it

- **There is deliberately no `guarantee_passed` status.** It would be a
  value that becomes wrong by the passage of time, and nothing is scheduled
  anywhere in this project to correct it. `guaranteeState()` derives it from
  the dates on every read.
- **The pipeline stage is kept in step by a trigger**, not by application
  code, because placements are written from three actions and will be from
  more. It only moves forwards, never resurrects a `rejected` candidate and
  never demotes `hired`.
- **Instalments earn on status transitions** (`accepted`, `started`).
  Engagement, shortlist and guarantee-expiry instalments have no status
  behind them and are marked earned by hand from the panel — again because
  nothing is scheduled.
- **A fee that cannot be computed is not written.** No agreement and no
  typed percentage means the offer is recorded and the fee is not; the panel
  says so rather than showing a silent zero. A fee of zero and a fee that
  could not be computed are different facts.
- **Rewriting a fee leaves earned lines alone.** If anything has been
  billed, the header changes and the ledger does not.
- **`ON CONFLICT` cannot use a partial unique index** — 051 exists only
  because 050 made the `fee_terms` scope indexes partial. The predicate was
  redundant: a plain unique index already allows any number of NULLs.

### What is not in it

No invoicing, no payment tracking, no commission splits. Credit is two
columns (`owner_user_id`, `sourced_by_user_id`) rather than a
`placement_credits` table, because splits are out of scope and a join table
answering "is this yours" with at most two rows is a join on every fee read
for nothing. It becomes a table the day a fee is split.

Client **contacts and notes are still not built** — they were scoped out of
049 and stayed out of this pass. Both halves now want the same thing ("who
signed off"), so they are the obvious next increment on the client entity.

---

## 6. Verification — what is proven, and the recipe

**RLS was tested by impersonation, not by reading policy text.** Under
`SET LOCAL ROLE authenticated` with a forged JWT claim, each of the four
roles attempted real inserts and updates against the live database. All four
privilege-escalation vectors are refused by the trigger in 046: granting
yourself `is_founder`, moving your row to another organisation, demoting the
last admin, and suspending the last admin.

**The "never seen rendered" debt from the previous handoff is now largely
closed.** 27 routes were driven in a browser at five widths, including the
project tree, candidate detail, and sample mode. Still unseen: the HM portal
with real data, and the evidence grid populated.

**The fee rules were proven the same way** — `supabase/tests/placement_fee_invariants.sql`
is 21 invariants run as all four roles with real inserts, updates and
selects, including both halves of the own-placement exception, and it was
run against the live database. A **control run** with one assertion
deliberately wrong was also executed, and raised — without it, a passing
rolled-back script proves only that nothing threw. Worth repeating: an empty
result from a `DO` block is not evidence on its own.

### What driving it in a browser found that nothing else could

Five bugs, all in `09acbac`, none of which tsc, lint or 505 tests saw:

1. **Every server action on the candidate page was broken.** A `"use server"`
   module may only export async functions; `outreach-actions.ts` exported
   `OUTREACH_CHANNELS`, which made the whole page's action manifest invalid.
   It survived because it only fires when an action is invoked from that
   page, and the outreach panel had never been driven. **This is the strongest
   argument in the repo for the browser rule** — it had been shipped and live.
2. **React resets a form after its action returns, including on a throw**, so
   a server-side validation failure wiped what the user typed and silently
   reverted a controlled `<select>`, which then posted the wrong value on the
   retry. Anything with server-side validation wants `onSubmit`, not `action`.
3. Saving a client agreement always failed — the partial-index/`ON CONFLICT`
   problem above.
4. `formatMoney` rounded to whole units, so a retainer's three instalments
   rendered as a column summing to one more than its own headline.
5. The archetype `<select>` overflowed the candidate header at 360 and 390 —
   a `<select>` sizes to its widest *option* and these carry a sentence each.
   Pre-existing, and missed by the earlier sweep.

### The temporary-account recipe

Dashboard routes 307 without a session, and there is no service-role key in
`.env.local`, so seeing any of this in a browser needs an account. Insert
into `auth.users` directly — GoTrue rejects the row unless the token columns
are `''` rather than NULL, which is the trap:

```sql
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous,
  confirmation_token, recovery_token, email_change, email_change_token_new,
  email_change_token_current, phone_change, phone_change_token,
  reauthentication_token
) values (
  '00000000-0000-0000-0000-000000000000', gen_random_uuid(),
  'authenticated', 'authenticated', 'probe@mandate.test',
  crypt('SomePassw0rd!', gen_salt('bf')), now(), now(), now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
  false, false, '', '', '', '', '', '', '', ''
);
```

Then an `auth.identities` row with the same id, then set
`organization_id` / `status` / `role` on the `public.users` row the signup
trigger created. **Delete all of it afterwards** — `public.users`,
`auth.identities`, `auth.sessions`, `auth.refresh_tokens`, `auth.users` — and
check the row counts.

Sample mode needs an org with **no data**, so seeing those four components
means a scratch organisation, not the founder's.

---

## 7. Blockers not ours to clear

Unchanged from the previous two handoffs.

- **Resend.** The marketplace resource `resend-email-violet-dog` is still
  `Onboarding`, attached to no project, and there is no
  `MANDATE_RESEND_API_KEY` in any environment. DNS is half-done:
  `resend._domainkey.getmandate.io` exists, but `send.getmandate.io` has no
  SPF TXT and no bounce MX, and the root SPF authorises Namecheap forwarding
  rather than SES. Both founder actions. Do not fall back to a test sender.
- **`ANTHROPIC_API_KEY` has no credit.** Blocks the coverage-analysis agent's
  first real run, comparison layers 4 and 5, and deleting the losing branch
  in `run-sourcing-search.ts`.

---

## 8. What is next

From the original review's priority order, with the done items struck:

1. ~~Pagination and list filtering~~ — `ba2abeb`.
2. ~~Roles and route guards~~ — `498e46f`.
3. ~~Client entity~~ — `a288eb8`, identity and company profile only. See §5
   for the three pieces deliberately left out.
4. ~~Placement and fee record~~ — `460bb8c` / `09acbac`, migrations 050–052.
   See §5a and §10.
5. ~~Design system consolidation~~ — `dfd2ca5`.
6. **Link `/app/candidates/search` into the nav.** Still unlinked. A
   620-line AI natural-language search that nothing points at. Minutes of
   work; left alone deliberately because it is item 6. Note the nav now has
   a Clients entry, so there is a worked example of adding one — `NAV` in
   `src/components/dashboard/nav-model.ts` plus an icon in `sidebar.tsx`.
7. **Sample data on the other 36 pages.** Portfolio, Candidates, Mandates and
   now Placements have it. Competencies and Templates still tell the user to
   "check that migration 033 has been applied."

The priority list from the original review is now **done**, apart from items
6 and 7. The obvious next pieces, in the order they earn their keep:

- **Client contacts and notes** (§5a) — the last piece of the client entity,
  and the placement record now wants the same thing.
- **Invoicing**, if the founder decides the accounting boundary should move.
  Everything needed is already on `placement_fee_lines`: an instalment knows
  what it is worth, when it was earned and when it is due.
- **An activity/audit trail for core recruiting.** More pressing now that
  money is in the schema — `executive_audit_events` still covers only the EI
  module, so nothing records who changed a fee.

Smaller, added by this session:

- **Fix the researcher → `/sourcing` → `/spec` bounce message** (§2).
- **The role now reaches the feedback interpreter as "who is speaking".**
  `submitted_role` is a field on `InterpretFeedbackInput`, not a column —
  the recruiter path passes the parsed role, the HM portal passes
  `hmLabel || "hiring_manager"`. Since 046 the recruiter side is a
  constrained vocabulary rather than free text, so the prompt is worth a
  read with `researcher` and `viewer` in it.
- **Client contacts, notes and commercial terms** were scoped out of §5 and
  are the obvious next increment on the entity — but the contacts half is
  worth doing with, not before, the placement record, since both want to
  know who signed off.
- **The ten screaming-snake page titles hardcode their capitals**, so screen
  readers announce `GLOBAL_EXECUTIVE_NETWORK` underscores and all. The rest
  of the product uppercases in CSS. Worth reconciling.

Still absent and worth a decision at some point: activity/audit trail for
core recruiting (`executive_audit_events` covers only the EI module),
interview scheduling, tasks a human can create, tags, saved views, retention
and right-to-erasure, DEI reporting. Nothing is scheduled at all — no
`vercel.json`, no cron, no `pg_cron` — so `AGENTS.md`'s agent 14 ("Scheduled
+ on-demand") has no scheduled path and weekly reports are manual only.

---

## 9. Known limitations carried deliberately

**The PDF fonts are the base-14 set, so no non-Latin script renders.**
`sanitizeForPdf` maps symbols a model might emit onto characters the font
has, but it cannot render a script the font lacks — a candidate named in
Chinese or Cyrillic comes out as question marks, which for a recruiting
product erases the person. It warns in dev rather than swallowing it. The
real fix is an embedded font, and it should land before sourcing outside
Latin-script markets. See `src/lib/pdf/glyphs.ts`.

**react-pdf fails silently.** A column narrower than its own heading
overprints its neighbour; a character outside WinAnsi is emitted as whatever
byte sits at that position. Neither errors. Anything new reaching a PDF wants
a look at rendered output, not just the JSX.

**The Network page cannot page in SQL.** A person there is several candidate
rows folded by identity, and which rows fold is only knowable once all are
compared, so a LIMIT cuts a person in half rather than the list short. It
takes a 2000-row window, says so on screen, and pages the render. Doing it
properly means grouping by identity in Postgres, along the lines of migration
040. See `CANDIDATE_ROW_CAP`.

---

## 10. Fee visibility — the first read restriction, and what it costs

Worth its own section because it is the first place the product tells one
signed-in colleague less than another, and every instinct in the codebase up
to 049 was the opposite.

**`fees:read` is a fifth capability, not a reuse of `clients:share`,** even
though the two resolve to the same two roles today. Same reasoning 046 used
to keep `mandates:write` and `clients:share` apart: "may put something in
front of a client" and "may see what we billed" are unrelated questions that
will diverge, and re-splitting a merged capability means revisiting every
policy.

**There is no `fees:write`.** Recording what a placement paid is part of
running the mandate, so the fee tables take `can_write_mandates()` on the
write side — the same two roles. A second capability there would be a name
with nothing behind it. `can_read_fees()` on SELECT, `can_write_mandates()`
on the rest.

**The own-placement exception is per-row and therefore lives in RLS.** A
capability cannot express "whoever is credited on *this* placement", so
`is_placement_credited()` does, and `canReadPlacementFees()` in
`src/lib/fees/access.ts` mirrors it for the UI. The helper is SECURITY
INVOKER on purpose: it reads `placements`, which has its own RLS, so a
placement the caller cannot see cannot unlock a fee they cannot see either.
Making it DEFINER would turn a helper into a hole.

**What it costs, and what to watch.**

- The exception does **not** extend to `fee_terms`. That is the client
  agreement, not one placement's money, and there is no placement to be
  credited on. A credited researcher reads the fee and not the contract.
- Credit is read-only. Being on a placement never confers a write.
- `/app/placements` is deliberately **not** gated in the nav or the route
  table. It renders for every active role, shows the placements, drops the
  money columns and says plainly that fees are restricted. Hiding it would
  leave a researcher unable to see that the placements they sourced were
  recorded at all — and a page that silently reports zero revenue is a lie,
  not a restriction.
- Where a fee would be, a role without access sees the word **Restricted**,
  never a blank. A blank reads as "no fee recorded", and a recruiter chasing
  an unrecorded fee has to be able to tell those two apart.

**Nothing yet records who changed a fee.** The audit gap in §8 was a nice-to-
have while the schema held no money. It is now the most obvious hole in this
area, and it is the reason to do the activity trail before invoicing.
