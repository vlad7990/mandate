# Continuation — roles, the re-skin, clients, placements, the trail, contacts, the advisor sweep

**Date:** 2026-08-13, extended 2026-08-14 with the advisor sweep and the
status sweep that followed it (§5g–§5i)
**Supersedes:** `2026-08-13-platform-features.md` entirely. Both open
decisions in it are now made, and five of its priority items are done. Its
Resend and `ANTHROPIC_API_KEY` blockers are unchanged and repeated below.

Work in `/Users/vladbreygin/Projects/mandate`. Supabase project
`xipyqnltkbtywxqyxupf`. Bash cwd resets to a stale iCloud clone between calls
— always `cd` first or use `git -C`.

`main` is clean, pushed, and deployed to `getmandate.io`.
Migrations `046`–`060` applied; schema and code are in step. 544 tests
(was 389), tsc / lint / build green. **Next migration is 061.**

Nine commits, in order: `498e46f` roles and route guards, `dfd2ca5` the
terminal re-skin, `567d0f5` and `2e482df` responsive repair, `a288eb8` the
client entity, `460bb8c` the placement and fee record, `09acbac` the five
bugs the browser found plus sample data for the revenue screen, `aa213c4`
the activity trail, and the client contacts and notes commit that renamed
this file.

**The client entity is now complete.** 049 gave it identity and a company
profile, 050 the commercial terms, and 054 the contacts and notes that both
of those deliberately left out. Nothing on it is outstanding.

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
**Contacts and notes landed in 054 — see §5c. The entity is complete.**

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

Client **contacts and notes** were scoped out of 049 and out of this pass
too. They landed in `054` — see §5c — and the "who signed off" hole both
halves shared is now `placements.signed_off_by_contact_id` plus its label
snapshot.

---

## 5b. The activity trail

Migration `053`. Who changed what, and the answer to the hole §10 named:
before this, nothing recorded who changed a fee.

### Why it is a new table, not more columns on the EI trail

`executive_audit_events` (032/034/037) covers Executive Intelligence. Two
reasons it could not simply grow, and the second decided it:

**Shape.** It carries one nullable FK per entity and one CHECK listing every
event type in the module — fine for a bounded module, not for the product.

**Visibility.** It is readable by every active member. An audit event about a
fee *contains the fee*: the amount, the rate, the old value and the new one.
Money events in an org-readable table would have handed a viewer the revenue
book one migration after `fees:read` closed that door. Each row here carries
the tier that may read it, and RLS enforces it with the same predicates the
fee tables use — including the own-placement exception, so a credited
researcher sees the fee history of their own placement and nobody else's.

### Three things it does better than 032/034, on purpose

1. **No INSERT policy at all.** 034 had to patch `actor_id = auth.uid()` onto
   the EI trail to stop one user forging another's entry — but a signed-in
   user can still POST an arbitrary `executive_audit_events` row from a
   browser console and invent history under their own name. Here the only
   write paths are SECURITY DEFINER, and `authenticated` cannot insert,
   update or delete. Proven by doing all three as a real role.
2. **Triggers, not application code.** The EI trail is written where somebody
   remembered to call `recordExecutiveAuditEvent`, and never for a change made
   by a hand-run statement during a fix. These rows are written by the
   database on the change itself.
3. **`actor_label` snapshots the name.** `actor_id` is ON DELETE SET NULL, so
   without it a departed colleague's row going away would turn every entry
   they ever made into "unknown".

### What it covers, and the noise it designs out

Placements, placement fees, the fee ledger, fee terms, and the role model
(`role`, `status`, `is_founder` — the AFTER half of 046's BEFORE guard: an
attempt is refused, a change is remembered). `054` added client contacts and
the placement sign-off — four more types, all at `'org'`, and it redefined
the CHECK to do so. Client *notes* write nothing; see §5c.

Two deliberate silences, because a trail that records non-events is one
nobody scrolls: expanding a retainer into three instalments writes **one**
event rather than four, and an edit that changes nothing commercial — a
notes-only change to fee terms, a `updated_at` touch — writes none.

### Things worth knowing before changing it

- **The wording is not stored.** `detail` holds the facts (before/after
  values, amounts, currencies, reasons); the sentence is derived in
  `src/lib/activity/describe.ts`, so a phrase can improve without rewriting
  history and an old row still reads under a new build.
- **`/app/activity` is not capability-gated**, deliberately. Every role has a
  trail to read, just a different one, and hiding the screen from a
  researcher would hide the history of their own placements from them. The
  group filter is built from what the reader can actually see.
- **Search matches `actor_label`**, not a join to `users` — so "what did this
  person do" still finds the work of somebody who has left.
- **Two event types are in the vocabulary but not written.**
  `report_exported` is not, because the only honest place to write it is
  where the PDF is actually produced and that is client-side; logging it at
  generation would record an export that never happened. `hm_portal_opened`
  *cannot* be written by the current RPC at all — the portal is the token
  path with no session, so `auth.uid()` and `current_user_org_id()` are both
  null and the function returns without writing. It needs its own definer
  entry point taking the portal token, along the lines of `verify_hm_token`.
- **Retention is still undecided**, and is now more pressing than it was.
  What *is* decided is that erasing a subject erases its events — the FKs
  cascade, matching 044's position that erasing a candidate erases the
  notification evidence. If that changes, it changes in both places.

### One advisor warning, deliberate

`record_activity_event` is SECURITY DEFINER and executable by
`authenticated`, so the linter flags it exactly as it flags
`current_user_role()`. It has to be — it is the application's only write path
into a table `authenticated` cannot insert into. What it can do is bounded:
it refuses any event type outside the three intent events, stamps the actor
from `auth.uid()` rather than taking it as a parameter, and derives the org
itself. Every other function in 053 has EXECUTE revoked from `authenticated`,
which is why none of them appear in the advisor output.

---

## 5c. Client contacts and notes — the entity closed

Migration `054`. The last piece of the client, and the answer to a question
both halves had independently: **who signed off** had no answer. A placement
recorded who was credited on our side and nothing about who authorised it on
theirs; `hiring_manager_tokens.label` was a free-text string, so "who did we
send this shortlist to" and "who signed the offer off" were two unrelated
pieces of prose that could not be compared.

### The four decisions, all the founder's

1. **A contact is scoped to one client.** `client_id` NOT NULL, cascading.
   A hiring manager who moves banks is a new row at the new bank. The
   Network page folds candidates by identity and this deliberately does not:
   sourcing *produces* duplicate rows without anyone intending it, which is
   what makes folding necessary there, whereas contacts are typed in
   deliberately and every question asked of them is client-scoped. A
   `person_id` pointing at a future people table stays additive.
2. **A portal token can name a contact.** `hiring_manager_tokens.contact_id`,
   nullable. `label` is untouched, so every existing token still works and a
   token can still go to somebody with no contact record. A contact is *not*
   an account — externals stay token-only. The scope mismatch (tokens are
   project-scoped, contacts client-scoped) is validated in the action rather
   than by a trigger, because `projects.client_id` is nullable and the carve-
   out would be the normal case.

   **Wired end to end**, not just in the schema: the share-link card on
   `/hiring-manager` gains a contact picker beside the label field, and the
   label is *derived* from the chosen contact so the two cannot disagree —
   the same rule the placement sign-off uses. The label input is disabled
   rather than ignored when a contact is picked, because a field whose value
   is silently dropped is worse than one that says it is not in use. Archived
   contacts are excluded from the picker and refused by the action.
3. **A placement records who signed it off** — `signed_off_by_contact_id`
   *and* `signed_off_by_label`. Both, because SET NULL on a deleted contact
   would otherwise erase who authorised a booked fee, which is exactly what
   `actor_label` exists to prevent in 053. On `placements`, not the fee side:
   it is the event, not the money, so every active role reads it.
4. **Client notes carry a visibility tier** — `org` and `commercial`, the
   latter resolving to `can_read_fees()`. Otherwise `candidate_notes` (020)
   verbatim, minus `call_duration_minutes` and `interview`, plus an
   `author_label` snapshot that 020 still lacks. The tier is the reason this
   is not simply a copy: "they are squeezing us on the rate" is a sentence a
   viewer must not read, and an org-readable notes table would have undone
   `fees:read` through the side door.

### Two judgement calls made here, not by the founder

**Contacts go on the trail; notes do not.** Four new event types —
`client_contact_added` / `_updated` / `_removed` and
`placement_signoff_changed` — all at `'org'`. `_updated` fires only when an
identity-bearing field moves, so a corrected phone number is not activity,
and `_removed` covers archiving and deletion with `detail.mode` recording
which. Notes write nothing at all: they are the chatty half by design.

**`placement_signoff_changed` watches the label, not the FK.** Because the
FK is ON DELETE SET NULL, deleting a contact rewrites every placement they
signed, and a condition including the FK emitted *"changed the sign-off from
Jane to Jane"* for each one. The recorded answer did not change; only the
link did. Found by the invariants script, not by reading the trigger.

### Art. 14 — considered, and deliberately not implemented

A client contact carries **no** statutory notification duty. The reason is
not that it is B2B — Art. 14 turns on whether the data came from the subject,
not on whether they are at work. It is that candidates are sourced, profiled
and **scored** without their knowledge (043/044), and that profiling is what
makes notification necessary. A contact row holds a name, title, email and
phone collected inside a commercial relationship, with no scoring and no
automated decision-making. Legitimate interest covers it; Art. 14(5)(b)
covers the residual.

**The live edge is `client_notes`,** and it is written into the migration
header rather than left implicit: the moment a note carries an assessment of
the *person* — "difficult", "not really the decision-maker" — that is
profiling of an identified individual who was never told. **If client notes
are ever fed to an agent, or a contact gains a scored or inferred field,
this analysis has to be redone before that ships.**

### Two things 054 fixed that were not asked for

**Org and parent could disagree.** Every org-scoped table in this schema
carries `organization_id` beside a parent FK and *assumes* they agree,
because RLS only ever inspects the former. A crafted insert naming this org
and another org's client was accepted. Harmless on most tables; not harmless
on the primary-contact trigger, which writes to sibling rows. The two new
tables carry a composite FK to `clients (organization_id, id)` making it a
database guarantee. **The pre-054 tables carried the assumption until `055`
swept it out of the schema entirely — see §5d.**

**The demotion trigger is SECURITY INVOKER,** unlike every function in 053.
Those must be DEFINER to write to `activity_events`, which `authenticated`
has no policy on. This one writes to the table the caller is already writing
to, and running it as definer would put a row-modifying statement outside RLS
for no gain.

### Things worth knowing before changing it

- **At most one primary per client, maintained by a trigger** rather than by
  the application clearing the old one first — two statements that can
  interleave, where the loser hits a unique index and gets a message about an
  index. The partial unique index is still there as the guarantee that never
  fires.
- **`email_key` is `nullif(btrim(lower(email)), '')`.** The `nullif` is
  load-bearing: without it an empty string is a value and two contacts with
  no email collide. `contactEmailKey()` mirrors it and there is a test.
- **Archiving, not deleting, is the ordinary way a contact leaves** — a
  portal token and a placement sign-off both point at the row. Delete stays
  for rows created by mistake.
- **The notes panel is given every contact including archived ones**, and
  filters the *picker* itself. Passing the filtered list turned every
  historical note at an archived contact into "a former contact", throwing
  away a name the row still held. Found in the browser.
- **A reader without `fees:read` is not told a commercial note exists.** The
  count says "01 NOTE", not "02 // 1 restricted". Deliberately unlike a
  placement fee, where the row *is* sent and the number withheld — a fee that
  exists and is hidden must be distinguishable from no fee, whereas a note
  nobody told you about is not yours to know exists.

---

## 5d. Org and parent can no longer disagree

Migration `055`. The sweep 054 said was outstanding: **68 composite foreign
keys** asserting that a row's `organization_id` matches its parent's, across
every pre-054 table that had the shape.

Before it, this was accepted by every policy in the product, because RLS only
ever inspects the child's own `organization_id`:

```sql
insert into candidate_notes (organization_id, candidate_id, ...)
values (my_org, some_other_orgs_candidate, ...);
```

**No live data violated any of the 68** — checked pair by pair first, which is
why they could be added and validated immediately rather than as `NOT VALID`.

### Why it is more than tidiness

On most tables a mismatch is a wart: a note carrying a foreign candidate still
only renders to its own org, because the *note* is what RLS filters on. It
does not leak.

It stops being a wart wherever a row is used to **reach** another row. 054
found the concrete case — the primary-contact trigger writes to sibling rows
selected by `client_id`, so a contact naming your org and another org's client
would have demoted that client's primary contact. `is_placement_credited`,
`resolve_client` and the fee-terms lookup are the same shape waiting for the
same input. Removing the class is cheaper than auditing each one forever.

### The load-bearing decision: NO ACTION

Each relationship gains a *second* key alongside the existing single-column
one, which keeps its exact `ON DELETE` semantics. The composite is
`ON DELETE NO ACTION`, and that is not a detail:

**A composite `SET NULL` nulls every column in the key — including
`organization_id`.** Roughly a third of these parents are `SET NULL`, so
deleting a client would have blanked the org on its placements and dropped
them out of RLS entirely: rows visible to nobody, still in the revenue book.
PG 17 does support `SET NULL (column_list)`, but the second key needs no
referential action at all — the original performs it, and `NO ACTION` is
checked at the *end* of the statement, by which time the child column is NULL
and MATCH SIMPLE skips the composite check.

That is reasoning about trigger ordering, so it was **tested before the
migration was written**: a rolled-back probe added the constraint to
`placements`, deleted a client, and confirmed `client_id` went null while
`organization_id` survived — and that a genuine cross-org update was still
refused.

### Two exclusions, both load-bearing

**Everything pointing at `users`** — 37 relationships. `users.organization_id`
is a *membership*, not a parent scope, and it changes: an account is created
with a null org and gets one when a founder approves it. Constraining
`(organization_id, created_by)` would make approving an account, or moving
anyone between orgs, fail against every row they had authored. A cross-org
`created_by` is also not a leak — it is a name on a row, not a key anything
resolves through.

**The seeded EI catalogues.** All 24 `executive_competencies` and all 8
`executive_role_templates` have a **NULL** `organization_id` — that is what
makes them global. A composite key from `executive_search_competencies` would
compare a non-null child org against a null parent org and **reject every row
in the catalogue**. `search_id` on that table was constrained; `competency_id`
could not be while global rows were modelled as NULL-org.

**`056` closed this one** by giving the catalogues the explicit flag this
section said they needed — see §5e. **`057` closed the `users` one**, though
not with a key — see §5f for why a key is the wrong instrument there.

The shape behind it is still worth knowing: a parent with a NULL org can have
no org-scoped children at all, because MATCH SIMPLE only skips when the
*child's* column is null. Correct for the nine tables whose org is nullable —
a project with no organisation is broken, not global — and it is exactly why
a global tier needs a flag rather than a null.

### Cost, and a side benefit

68 constraints and 68 covering indexes on tables holding at most 27 rows each.
The indexes are `(organization_id, parent_id)`, so they also cover the bare
`organization_id` foreign key on the same table: the advisor's unindexed-FK
findings went from **28 to 15**, and the 13 cleared are exactly the org ones.
What remains is mostly `created_by` / `submitted_by` — the excluded class.

---

## 5e. The global catalogue flag

Migration `056`. The exclusion 055 documented, now closed: both EI catalogues
carry an explicit `is_global` flag, and the two relationships that could not
be constrained are constrained.

### The hole was real, and it leaked

Both catalogues are genuinely two-tier and 046's RLS says so — an org admin
may write their own competencies, may never touch a global one, and reads
global plus their own. So an org-private competency is somebody's IP.

Before 056, org A **could not read** org B's private competency — RLS returned
zero rows — but **could attach it** to one of its own searches by naming its
id, because the only key on `competency_id` ignored the organisation. Verified
against the live database before the migration was written, and kept as case
(5) of the invariants file. Unlike most of what 055 fixed this one *leaks*:
those rows are read back with an embed on `executive_competencies(key, name)`,
so the borrowed competency's name renders on org A's screens.

### Why it takes two keys and a generated column

The rule is a disjunction — *the competency is either global, or owned by this
row's own organisation* — and no single foreign key expresses that.

- **`is_global` on the parent**, a real column rather than a generated mirror
  of `organization_id IS NULL`. It is what the first key references, and being
  declared rather than derived means an insert has to say which kind of row it
  is; a CHECK refuses both "global with an owner" and "private with nobody".
- **`competency_is_global` on the child**, denormalised, because only the
  parent knows the tier and a key cannot consult a third table.
- **`competency_org_id` on the child, GENERATED** — NULL when the child claims
  global, else its own `organization_id`. Generated so that "points at a global
  competency or one of mine, never anybody else's" is structurally unwriteable
  rather than merely checked.

Then `(competency_id, competency_is_global) → (id, is_global)` proves the
tier claim is true, and `(competency_org_id, competency_id) →
(organization_id, id)` proves ownership when the claim is "private". **Neither
alone is enough**: the first passes for a row claiming `false` while pointing
at *any* org's private competency; the second is skipped entirely when the
claim is `true`. The invariants file tests both lies in both directions.

`executive_searches.template_id` gets the identical treatment.

### One property worth knowing

The tier key references `is_global`, so **a competency that searches already
use cannot be reclassified**. Promoting an org-private competency to global is
refused while any `executive_search_competencies` row points at it. That is
correct — reclassifying would silently change who may see a search's
competency list — but it means "publish my competency to everyone" is
copy-and-repoint, not an `UPDATE`.

### App-side

Three write paths now record the tier alongside the id, because the pair is a
key and a mismatched pair is refused: the EI intake's template choice and its
competency prefill, and the success-profile weight sync. Both competency
lookups also now prefer an org-private row over a global one on a shared key —
the resolution the template lookup already did, and now required rather than
cosmetic, since id and tier have to come from the same row.

The competency library page reads the flag instead of re-deriving the tier
from the null. It already showed `global` / `org` per row, so nothing moved on
screen.

---

## 5f. The author of a row belonged to its organisation

Migration `057`. The last exclusion: 37 foreign keys pointing at `users`
across 28 tables. It is the one piece of this sweep that is **a trigger, not
a constraint**, and that was measured rather than assumed.

### A foreign key is the wrong instrument here

Both candidate keys are mutable by design. 046's guard explicitly permits a
founder to change `organization_id` and `is_founder`, and 053 gives both their
own audit event types because they are expected to happen. Adding the keys and
then running the product's own operations, rolled back against the live
database, gave:

| Shape | Operation | Result |
|---|---|---|
| 055's plain composite key | founder moves a member between orgs | **refused** |
| 055's plain composite key | clear a departed member's org | **refused** |
| 056's tier shape (`is_founder` as the tier) | toggle `is_founder` on an author | **refused** |

Each of those is a real operation with a UI or an audit event behind it. A key
here does not express an invariant; it freezes a person's lifecycle to
preserve a historical attribution, which is backwards — **the attribution is a
fact about the past, the user row is a fact about the present**.

056 could take the opposite view because refusing to reclassify a competency
searches already use is *correct*. Nothing equivalent is true of a colleague
changing jobs.

### What is actually true, and where it is enforced

> the user named as author was a member of this row's organisation, **or a
> platform operator, at the moment the row was written**

That is enforceable exactly once — on write. It is the same disjunction 056
lands on, with `is_founder` playing the part `is_global` plays there, read at
write time instead of maintained forever. One generic
`guard_author_in_org()` reads the column names from `TG_ARGV`, so 28 tables
share one rule that cannot drift.

Zero rows in the live database violated it before the trigger went on.

### Two details that decide whether it works at all

- **It only checks columns that actually changed.** Without that, re-saving
  any row whose author has since left would fail — the freeze problem again,
  one step removed. A row's attribution is re-validated only when somebody
  rewrites it.
- **It must be SECURITY DEFINER.** It reads `users`, which is RLS'd to the
  caller's own org — so a cross-org author, the exact thing being detected,
  would come back as no rows and be waved through as "unknown user". The check
  would silently pass in precisely the case it exists for. EXECUTE is revoked
  from `authenticated`, as 048 and 053 do. There is a test for this.

### What it is and is not

Integrity, not a new boundary. A cross-org `created_by` leaks nothing today:
`users` is RLS'd, so a foreign name renders as unknown rather than as a name,
and no policy resolves access *through* an author column.
`is_placement_credited` comes closest — it reads `owner_user_id` — but it is
SECURITY INVOKER over `placements`, so a foreign owner cannot see the
placement to be credited on it. What 057 removes is the class of bug where a
code path takes `organization_id` from one context and the author from
another.

**All three exclusions are now closed**, two with keys and one with a check at
the only moment the claim is true.

---

## 5g. The advisor sweep — migration 058

Both reports were run in full, `security` and `performance`. The sweep had
not been run since 054, so 055's 68 composite keys and ~84 indexes, 056's
catalogue flags and 057's 28 triggers all went through the linter for the
first time here.

**Security: 33 findings → 9.** **Performance: 95 → 91**, and the four that
cleared are the four that meant anything.

### What was fixed

**24 functions had a mutable `search_path`.** The pre-046 Executive
Intelligence and sourcing functions — `next_job_spec_version`,
`finalize_job_spec`, the six `allocate_and_insert_*`, the four `approve_*`,
the six `guard_*`, `promote_sourcing_results`,
`purge_staged_results_for_candidate`, `mark_sourcing_run_executed`,
`log_candidate_outreach`, `record_notification_sent` / `_failed`. One
`ALTER FUNCTION` each.

Every body was read before the ALTER, not after, because `search_path =
public` is only safe if nothing resolves outside it. All 24 turned out to
be already `public.`-qualified on every table reference; the only
cross-schema call is `auth.uid()`, which is qualified too; and everything
they resolve unqualified — `now()`, `set_config()`, `gen_random_uuid()`,
`jsonb_array_elements()` — is in `pg_catalog`, which is searched ahead of
anything named. pgcrypto and uuid-ossp are installed into `extensions`, not
`public`, so there is no ambiguity to inherit. Worth recording that all 24
are SECURITY **INVOKER**: the exposure is narrower than the linter's wording
suggests — a caller cannot use it to gain privileges they do not have — but
a caller with a hostile `search_path` still decides which `candidates` table
the function writes to, so it is a real defect and not a lint.

058 ends with a `DO` block that re-runs the check and raises if any function
in `public` still lacks `search_path`. Completeness is asserted by the
migration rather than by the person writing it.

**`rls_auto_enable` was executable by `anon`.** Not on the deliberate list
and not in our migrations — it is the body of the `ensure_rls` event
trigger, the standing guard that turns RLS on for any new table in `public`.
The exposure is theoretical, since it returns the `event_trigger`
pseudo-type and Postgres refuses a direct call outright, but the revoke is
free and the trigger does not need the grant: EXECUTE is checked when an
event trigger is created, not each time it fires. Same reasoning as 048.
Revoked from `public` too, so a role added later does not inherit it.

**The `users` policies: five permissive policies down to two.** The linter
raised two things here and they compound. `auth_rls_initplan` on
`users_can_read_self` — `auth.uid()` re-evaluated per row, which 046 fixed
everywhere else and missed here. And `multiple_permissive_policies` on both
SELECT and UPDATE: Postgres evaluates *every* permissive policy and ORs the
results, so three SELECT policies meant three predicates per row, each
calling a helper that reads `public.users` again.

The rewrite is safe for a reason worth writing down rather than trusting:
permissive policies are OR'd, and USING and WITH CHECK are OR'd
*separately*. A row passes UPDATE if any policy's USING admits it and any
policy's WITH CHECK admits the result — not necessarily the same policy for
both. So one policy whose USING is the disjunction of the old USINGs, and
whose WITH CHECK is the disjunction of the old WITH CHECKs, is exactly the
old behaviour and not merely close to it. Every helper call is now wrapped
`(select ...)` so it is an InitPlan evaluated once per statement.

**Three covering indexes, out of the fifteen asked for.**

- `users(organization_id)` — earned twice over. It is the filter behind the
  members page, settings and the waitlist, it is the predicate in the org
  branch of the SELECT policy above, and it is the child side of an ON
  DELETE CASCADE from `organizations`. 055 excluded `users` from the
  composite-key sweep; that exclusion was about foreign keys, not about
  leaving the hottest filter column in the schema unindexed.
- `candidate_scores(candidate_id)` — ON DELETE CASCADE from `candidates`,
  and neither existing index leads with the column.
- `feedback(candidate_id)` — same parent, worse: NO ACTION, so deleting a
  candidate must *prove* no feedback references them. A full scan every
  time, and a blocked delete at the end of it.

### What was left, and why

**The eleven attribution foreign keys.** `created_by`, `submitted_by`,
`generated_by` on `candidate_notes`, `clients`, `feedback`,
`hiring_manager_tokens`, `job_specs`, `project_reports`, `projects`,
`shortlists` (×2) and `skills`. The honest test is whether deleting the
parent happens, since that is the only operation the index serves — and it
does not. No path in the product deletes a user: the eight `.delete()` call
sites across the app are contacts, notes, skills, fee terms, fee lines,
sourcing results and EI candidate links, and none of them touch `users`. No
query anywhere filters on those columns either — they are read by embedding
the parent, which is a lookup on `users.id`. They are attribution, and
attribution does not earn an index. The one place a user *is* deleted is the
temporary-account recipe in §6, which is operator work against a table
holding one row.

Two more left on the same reasoning: `candidate_notes.project_id` (projects
are never deleted by the product, and notes are read by candidate) and
`hiring_manager_reviews.token_id` (tokens are never deleted).

**79 `unused_index` findings.** Informational, and deliberately ignored for
anything created by 049 or later. They are unused because nothing has
queried them yet — the tables hold fewer than thirty rows — not because they
are dead, and several exist solely to cover a foreign key, which never shows
up as a scan in `pg_stat_user_indexes`. Note the count went *up*, 77 → 79:
the three indexes added above joined the list immediately, which is the
clearest possible demonstration of why the list is not a to-do.

**The six deliberate SECURITY DEFINER findings**, exactly as §2 and 048/053
describe: `current_user_role`, `current_user_org_id`,
`is_current_user_founder`, `record_activity_event`, `verify_hm_token`,
`handle_new_auth_user`. They will appear on every run. Nothing else appears
alongside them, which is the useful result — every function 046–057 added
has its grants right.

### One thing for the founder, not for whoever picks this up

`auth_leaked_password_protection` is still disabled. Enabling it is a
Supabase Auth dashboard toggle — HaveIBeenPwned on password set — not SQL,
and it changes what happens to a real person at signup. Surfaced, not
enabled.

---

## 5h. A suspended account could read the roster — migration 059

Not an advisor finding. Found by the invariants file written to prove 058
changed nothing: the first version of assertion (5) asserted what everyone
assumed — that a suspended account reads only its own row — and it failed
against the live database with all five of the organisation's members in
hand.

The cause is a one-word asymmetry between two helpers that read the same
table:

```
current_user_role()    ... WHERE id = auth.uid() AND status = 'active'
current_user_org_id()  ... WHERE id = auth.uid()
```

046 closed the write half of this and said so at length. The fix there was
to make `current_user_role()` return NULL for a non-active account and route
every generated policy through `can_read_org()`, which tests it.
`public.users` never got that treatment, because its policies predate 046 —
they come from 002/003 — and they reach for `current_user_org_id()`
directly. So every other table in the schema refuses a suspended account,
and this one, the table holding colleagues' names, emails, roles and account
statuses, handed the whole list over. A suspended employee holds their own
anon key; the dashboard's sign-out gate does not stop a request to
PostgREST. `is_current_user_founder()` has the same missing check, so a
suspended founder read every organisation.

059 hoists `can_read_org()` above the disjunction in both policies, which
covers both branches with one conjunct rather than editing a helper the 046
trigger also depends on.

**The self branch stays unconditional, and that is the load-bearing part.**
`/auth/pending` reads its own row before it has an organisation, and the
sign-in gate reads its own `status` on the way to signing itself out. Take
the self-read away and a suspended user cannot be told why they are being
turned away. Both were driven in a browser afterwards precisely because they
are the two things this change could have broken.

Nothing depended on the old behaviour: every read of `public.users` on a
path a suspended or pending account can reach is `.eq("id", user.id)` — the
dashboard layout, the sign-in action, `/auth/pending`. The roster reads are
behind gates a suspended account has already failed.

It is a separate migration from 058 on purpose. 058 claims to be exactly
equivalent and proves it; folding a behaviour change into it would have made
that claim untestable.

---

## 5i. The rest of the schema, swept for the same gap — migration 060

059 raised an obvious question it did not answer: if `users` had this bug,
what else does. So every policy in the database was enumerated and
classified by whether *anything* in it consults `status`. The answer is
worth recording as a map, because it says where to look next time rather
than only what was fixed.

**What is already sound**, and can be trusted without re-deriving it:

- All 39 tables in `public` have RLS enabled, and none has zero policies.
- Every policy that scopes by `current_user_org_id()` is conjoined with a
  helper that resolves through `current_user_role()` — `can_read_org`,
  `can_write_candidates`, `can_write_mandates`, `can_share_clients`,
  `can_read_fees`, `is_org_admin` — all of which require `status = 'active'`.
  **046's generated sweep did its job completely.** The bug was never in the
  generated policies; it was in the two written by hand.
- Every OR-branch sits *inside* one of those conjuncts, including the two
  most likely to escape: the global-catalogue disjunction on
  `executive_competencies` / `executive_role_templates` (056), and the
  own-placement fee exception on `placement_fees` / `placement_fee_lines`
  (050). The second deserves its own note — `is_placement_credited()` has no
  status check of its own, but it is SECURITY INVOKER over `placements`,
  whose SELECT policy *is* status-checked, so a suspended owner cannot see
  the placement to be credited on it. Gated transitively rather than
  directly, which is the same argument §5f makes about cross-org authors.
- The four `cvs` storage policies (047) are status-checked.
- The one view, `sourcing_candidate_attribution`, is `security_invoker =
  true`, so it does not launder RLS. Worth knowing that a view without that
  option would have been a hole nothing else in this sweep would have found.
- `record_activity_event` is SECURITY DEFINER and bypasses RLS by
  construction, but already returns early unless `can_read_org()`. It was
  written after 046 and got this right.

**What was not**: `waitlist`, and only `waitlist`. Both founder-scoped
policies from 030 tested `is_founder` with an inline EXISTS over
`public.users` and never looked at `status`. They matched none of the
patterns any earlier sweep grepped for — no `current_user_org_id()`, no
capability helper — which is exactly why 046 and 059 both passed over them.

The waitlist is every person who has ever asked for access to Mandate: name,
email, company, and their written use case. It is the company's own inbound
pipeline, and a suspended founder could read all of it and triage it —
approve, reject, annotate.

060 makes two changes, and the second is not tidying:

1. `can_read_org()` added — the status gate.
2. The inline EXISTS replaced with `is_current_user_founder()`. The old
   predicate read `public.users` as the calling user, so it was subject to
   the `users` SELECT policy — meaning the waitlist's access rules depended
   on the users policy, and 059 had just changed that policy. **Two tables
   coupled through an implicit RLS dependency is how one gets fixed and the
   other silently does not.** The helper is SECURITY DEFINER and breaks the
   coupling. It is also a per-row correlated subquery replaced by two
   InitPlans, so it is the same class of win 058 was making.

`waitlist_anon_insert` is deliberately untouched: `WITH CHECK (true)` to
`anon, authenticated` is the public `/request-access` form, and a suspended
account submitting a request gains nothing a signed-out stranger does not
already have. The open insert is a rate-limiting problem and is already on
the pre-launch checklist as one.

**`users` and `waitlist` are the only two tables in the schema scoped by
founder or by self rather than by organisation.** That is the whole
explanation for why they are the two 046 did not generate and the two that
carried this bug. Any future table scoped that way should be assumed to have
it until someone proves otherwise.

---

## 6. Verification — what is proven, and the recipe

**RLS was tested by impersonation, not by reading policy text.** Under
`SET LOCAL ROLE authenticated` with a forged JWT claim, each of the four
roles attempted real inserts and updates against the live database. All four
privilege-escalation vectors are refused by the trigger in 046: granting
yourself `is_founder`, moving your row to another organisation, demoting the
last admin, and suspending the last admin.

**The users policies have their own file** —
`supabase/tests/users_policy_invariants.sql`, 21 invariants covering every
principal the product has: the four roles, a founder, a suspended account, a
suspended founder, a pending account, and anon. It was written *before* 058,
run against the live database to capture what each principal reads today,
run again after 058, and passed identically — which is the whole evidence
for the claim that consolidating five policies into two changed nothing a
caller can see. The only assertion that moved between the two runs was (5),
and it moved because of 059.

It also covers the three privilege-escalation refusals from 046 —
self-granting `is_founder`, self-moving organisation, demoting the last
admin — because those are enforced by a trigger the policy rewrite does not
touch, and a widened policy that quietly made them reachable is exactly the
mistake worth guarding against. A **control run** with the *final* assertion
inverted raised, which also proves execution reached the bottom of the file.

Worth recording: assertion (5) failing on its first run is the entire reason
§5h exists. The assertion was written from the documentation, not from the
database, and the database disagreed.

**The status sweep has its own file** —
`supabase/tests/suspended_account_invariants.sql`, 10 invariants. The one
worth copying is assertion (1): instead of naming tables, it **loops over
every RLS-enabled table in `public`** and asserts the same rule against each
— whatever an active admin can read, a suspended member of the same
organisation reads none of, with `users` the one deliberate exception at
self-only. A table added by a future migration is covered the day it exists,
without anyone remembering to add it here, which is the failure mode that
produced the `waitlist` gap in the first place.

Assertion (2) exists because the loop would otherwise be able to pass
vacuously: it pins that at least 15 tables held rows the admin could
actually see, so a broken seed fails loudly rather than turning every
assertion above it into "an empty table leaked nothing". The fixture seeds
18 tables for that reason. Assertion (3) re-runs the whole loop for a
pending account, which is a different shape from suspension. Assertions (8)
and (9) pin the direction that must keep working — an active founder still
reads and still triages the waitlist — because a status gate that was too
enthusiastic would break triage and every other assertion would still pass.

Run before 060 it failed at (5) with the waitlist row in hand, which is the
proof the gap was real; after 060 all ten pass; the **control run** with the
final assertion inverted raised.

**The waitlist page was driven in a browser** under a temporary founder
account with one `SMOKE`-prefixed row: the page renders, the row shows, and
the founder-only gate still admits an active founder. The row and the
account were deleted afterwards and counts checked back to baseline, with
the waitlist itself back to 0. The triage *write* is proven by invariant (9)
against the live database rather than by a browser click.

**The users policies were also driven in a browser**, because §6's own rule
says a policy change is not finished until it has been. Under a temporary
account in a scratch organisation: sign-in and the dashboard layout's
self-read; `/app/settings/members` listing both members through the org
branch; promoting the second member viewer → recruiter, which landed in the
live row through the consolidated UPDATE policy; a suspended account signing
in and getting *"Your account is suspended"* rather than a blank; a pending
account rendering `/auth/pending` with its own email and status, and
bouncing back to it when it tried the dashboard. The last two are the paths
059 had to leave working. Account and scratch org deleted afterwards and row
counts checked back to baseline — 1 org, 2 projects, 1 candidate, 1 client,
0 contacts, 0 notes, 0 placements, 1 user, 1 auth user, 0 sessions, 0
activity events.

One trap found doing it, unrelated to any of the above: **running `npm run
build` while `next dev` is live poisons `.next`**, and the dev server then
404s routes that exist and are in the production route list. `rm -rf .next`
and restart. It looks exactly like a routing bug.

**The "never seen rendered" debt from the previous handoff is now largely
closed.** 27 routes were driven in a browser at five widths, including the
project tree, candidate detail, and sample mode. Still unseen: the HM portal
with real data, and the evidence grid populated.

**The author check has its own file** —
`supabase/tests/author_in_org_invariants.sql`, 11 invariants. Half prove the
rule (cross-org author refused on insert and on re-attribution, own-org and
platform-operator accepted, credit columns covered, and that RLS cannot blind
the check); the other half prove the operations a foreign key would have
broken still work — moving a member between orgs, clearing a departed
member's org, toggling `is_founder`, and editing a row whose author has since
left. That second half is the argument for the shape, so it is tested rather
than asserted. Control run with the final assertion inverted raised.

**The catalogue flag has its own file** —
`supabase/tests/global_catalogue_invariants.sql`, 10 invariants covering every
branch of the disjunction: a global competency attaches, an org's own attaches,
another org's is refused, and lying about the tier is refused in *both*
directions. It also pins the CHECK, the reclassification refusal, the cascade,
and the RLS asymmetry that made the hole worth fixing. Control run with the
final assertion inverted raised.

**The org/parent constraints were proven with their own file** —
`supabase/tests/org_parent_integrity_invariants.sql`, 10 invariants against
the live database. It covers both directions, which matters more here than
usual: three cross-org writes refused, *and* the ordinary same-org write still
accepted, because over-constraining would break the product as thoroughly as
under-constraining leaves it open. It also pins the two exclusions — a global
competency can still be attached to a search, and a user can still be moved
between organisations after authoring rows — so an exclusion that silently
stopped working is a test failure rather than an outage. A **control run** with
the final assertion inverted raised, as with the contacts file.

Unlike the RLS files this one runs as a privileged role: it is about
*constraints*, and a constraint that only held for `authenticated` would be no
constraint at all.

**The contact and note rules were proven the same way** —
`supabase/tests/client_contact_invariants.sql` is 23 invariants run as all
four roles with real inserts, updates and selects against the live database:
the note visibility tier from both sides, the primary-contact trigger, the
email dedupe including the several-NULLs case, the composite org FK, the
sign-off label surviving a deleted contact, and the three event types
alongside the silence on notes. A **control run** with the *final* assertion
inverted was also executed and raised — which is the stronger form of the
control, because it proves execution reached the end of the script and every
assertion before it was genuinely evaluated.

Worth recording: the first run failed on `author_label`, and it was the
**fixture** that was wrong, not the product. The signup trigger has already
created the `public.users` row by the time the seed runs, so every insert
takes the `on conflict do update` branch — and `full_name` was not in the
SET list. An assertion catching its own fixture is the cheapest possible
demonstration that the assertions fire.

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
- **Leaked-password protection is disabled — and cannot be enabled on the
  current plan.** Added by the advisor sweep (§5g), where it was written up
  as a founder decision. The founder made it on 2026-08-14: enable it. It
  then turned out not to be a decision at all.

  Supabase gates the feature at **Pro**, and org `Stratum`
  (`bfomdugfdcxxcneocihl`, which owns `xipyqnltkbtywxqyxupf`) is on `free`.
  The dashboard toggle is locked. There is no SQL for it, the Supabase MCP
  is database-only and exposes no auth-config tool, and there is no
  `SUPABASE_ACCESS_TOKEN` in the shell or in any `.env` file and no Supabase
  CLI installed — so the Management API is not reachable from a session
  either. Nobody can action this without a Pro upgrade (~$25/mo, org-wide,
  and the org owns four other projects).

  After upgrading: `Auth → Providers → Email → "Prevent use of leaked
  passwords"`, or `PATCH /v1/projects/xipyqnltkbtywxqyxupf/config/auth`
  with `{"password_hibp_enabled": true}` and a personal access token.

  **The timing is genuinely free.** HIBP is checked when a password is
  *set* — signup and reset — not on existing rows. Turning it on later does
  not invalidate anyone's password or interrupt an account that already
  exists, so deferring it costs nothing retroactively. That is the argument
  for treating it as a launch-day item rather than an urgent one.

  What *is* available on the free tier, on the same settings page, and is a
  partial substitute: minimum password length (the default is 6; the docs
  say anything under 8 is not recommended) and required character classes.
  The founder set the target on 2026-08-14 — **12 characters, all four
  classes** — and **the dashboard half is still not applied**, for the same
  reason as above: no access token, no CLI, no auth-config tool.

  The app half *is* applied, in `src/lib/auth/password-policy.ts`. Read its
  header before changing either side. The point worth carrying: this module
  is not a boundary and cannot be one — a caller with the anon key reaches
  `supabase.auth.signUp()` without passing through `signUpAction`. It earns
  its place in the *other* direction. Before this, the signup form asked for
  8 characters and no character classes, so once the dashboard is raised to
  12, every user who typed a 9-character password would have passed the
  form's own check and then been handed a raw GoTrue error for a rule the
  form never mentioned. Same argument as §2: the first two layers exist so
  the product tells the truth about itself before the database has to
  refuse.

  It also means the ordering is safe either way round. The app is now
  stricter than the dashboard, which fails closed — nobody can create an
  account the dashboard would later reject.

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
6. ~~Link `/app/candidates/search` into the nav~~ — "AI search", a child of
   Candidates in the Search group. It was minutes of work, as predicted, and
   then it was not: opening it from the rail for the first time showed what
   the page does when the agent fails, which is that it rendered the
   provider's raw JSON body — vendor name, "go to Plans & Billing", and a
   request id — into the page. Fixed in the same commit; see the note below
   on the three places that still do it.
7. **Sample data on the other 36 pages.** Portfolio, Candidates, Mandates and
   now Placements have it. Competencies and Templates still tell the user to
   "check that migration 033 has been applied."

The priority list from the original review is now **done**, apart from items
6 and 7. The obvious next pieces, in the order they earn their keep:

- ~~Client contacts and notes~~ — migration `054`. See §5c.
- **Invoicing**, if the founder decides the accounting boundary should move.
  Everything needed is already on `placement_fee_lines`: an instalment knows
  what it is worth, when it was earned and when it is due.
- ~~An activity/audit trail for core recruiting~~ — `aa213c4`, migration
  `053`. See §5b, and the two event types it leaves unwritten.

- ~~The full Supabase advisor sweep~~ — migrations `058` and `059`. See §5g
  for what was fixed and what was left, and §5h for the gap it turned up.
  Re-run it after the next migration that adds tables or policies; the
  residue to expect is six deliberate SECURITY DEFINER findings, the
  leaked-password toggle (Pro-gated — see §7), and a growing pile of
  `unused_index` noise.
- ~~Review the pre-046 RLS policies for the same status gap~~ — migration
  `060`. §5i is the map: every generated policy is sound, and the two
  hand-written founder/self-scoped tables were the only ones at risk. Both
  are now closed and `suspended_account_invariants.sql` keeps them that way
  for tables that do not exist yet.

Smaller, added by this session:

- ~~AI generators writing the provider's raw error into the database~~ —
  done, and it was **four**, not three: `generate-job-spec.ts`,
  `generate-executive-success-profile.ts`,
  `generate-executive-interview-plan.ts`, and
  `run-executive-company-context.ts`, which writes a different column
  (`company_context_error`) and so did not turn up in the first grep.

  Every failure path now writes through `agentErrorMessage()`, and each
  `markFailed`-style writer applies `safeFailureMessage()` as a backstop, so
  a generator added later cannot leak a provider body by forgetting to.

  Three judgements worth keeping:

  **Not everything in those columns was unsafe.** The interview-plan
  generator writes *"No approved success profile for this search. Approve a
  success profile before generating an interview plan."* — authored for the
  reader and the most useful sentence that view can show. A blanket scrub
  would have destroyed it, so the backstop matches only unmistakable
  provider markers (a JSON error envelope, a `request_id`, a leading HTTP
  status) and the call site decides everything else.

  **The audit trail keeps the real message.** In the two generators that
  record an `executive_audit_events` row on failure, the detail still holds
  the true error — it is ours to read, and recording a sanitised string
  there would defeat the point of recording it. Two audiences, two strings.

  **The detail survives in the throw.** Every one of these call sites still
  throws the rich message, so nothing was lost from logs by sanitising the
  column.

  Verified end to end, not just by unit test: on a scratch org, with
  `calibration_model.dimension_weights` set as fixture data to unlock the
  CTA, GENERATE JOB SPEC was clicked against the live (uncredited) API. The
  failure view now reads *"Job-spec generation could not run. This has been
  logged…"*, the DOM was asserted clean of `Anthropic`, `credit balance`,
  `Plans & Billing` and `req_…`, and the `job_specs.generation_error` column
  was read back afterwards holding the safe sentence. Scratch org deleted;
  counts back to baseline.

- ~~Fix the researcher → `/sourcing` → `/spec` bounce message~~ (§2). The
  redirect to `/spec` is right for anyone who can finalize a spec and wrong
  for a researcher: the proxy caught it and sent them to `/app/no-access`
  naming `/spec`, a screen they never asked for, reporting a capability
  failure for what is really the mandate's state. The two have different
  fixes — one is "ask an admin for a different role", the other is "ask a
  recruiter to finalize the spec" — and the old message pointed at the
  wrong one. The redirect is now conditional on `mandates:write`; everyone
  else stays on `/sourcing`, which they are entitled to, and is told what is
  missing and who clears it.
- **The role now reaches the feedback interpreter as "who is speaking".**
  `submitted_role` is a field on `InterpretFeedbackInput`, not a column —
  the recruiter path passes the parsed role, the HM portal passes
  `hmLabel || "hiring_manager"`. Since 046 the recruiter side is a
  constrained vocabulary rather than free text, so the prompt is worth a
  read with `researcher` and `viewer` in it.
- ~~Client contacts, notes and commercial terms~~ — terms in `050`, contacts
  and notes in `054`. The client entity is complete; §5c records the four
  founder decisions behind the contacts half.
- ~~The screaming-snake page titles hardcode their capitals~~ — twelve, not
  ten. Fixed in `TerminalTitle` rather than at the call sites: the visible
  token is now `aria-hidden` and the `h1` carries an `aria-label` derived
  from it, so `GLOBAL_EXECUTIVE_NETWORK` announces as "Global executive
  network" while the glyphs on screen are untouched. Deriving the name
  instead of passing it meant none of the twelve call sites changed and a
  thirteenth cannot forget; `label` overrides it where the derivation is
  wrong, which so far is only `AI_CANDIDATE_SEARCH` ("Ai candidate search").

  Worth noting the comment above that component previously asserted the DOM
  text was "still `GLOBAL_EXECUTIVE_NETWORK` for copy and for screen
  readers" — half right, and the wrong half was the one that mattered.

Still absent and worth a decision at some point: interview scheduling, tasks
a human can create, tags, saved views, retention and right-to-erasure, DEI
reporting. (The activity/audit trail landed in `053` — see §5b.)

Nothing is scheduled at all — no `vercel.json`, no cron, no `pg_cron` — so
`AGENTS.md`'s agent 14 ("Scheduled + on-demand") has no scheduled path and
weekly reports are manual only. Two things now depend on that gap rather than
merely wanting it: the guarantee-expiry instalment trigger in `050` has to be
marked earned by hand, and `guaranteeState()` derives from dates precisely
because nothing runs to update a stored status.

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

**Who changed a fee is now recorded** — that gap is closed by `053` (§5b),
and fee events inherit exactly the visibility rule described above, including
the own-placement exception. It was worth doing before invoicing rather than
after: an invoicing feature built on an unaudited fee table would have needed
the trail retrofitted underneath it.
