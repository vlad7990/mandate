# Continuation — roles, the re-skin, clients, placements, the trail, contacts, the advisor sweep, the action-error contract

**Date:** 2026-08-13, extended 2026-08-14 with the advisor sweep and the
status sweep that followed it (§5g–§5i), 2026-08-17 with the
server-action error contract and the post-061 advisor run (§11–§12), and
2026-08-18 with W7 and the close of the sample-data programme (§13)
**Supersedes:** `2026-08-13-platform-features.md` entirely. Both open
decisions in it are now made, and five of its priority items are done. Its
Resend and `ANTHROPIC_API_KEY` blockers are unchanged and repeated below.

Work in `/Users/vladbreygin/Projects/mandate`. Supabase project
`xipyqnltkbtywxqyxupf`. Bash cwd resets to a stale iCloud clone between calls
— always `cd` first or use `git -C`.

`main` is clean, pushed, and deployed to `getmandate.io`.
Migrations `046`–`061` applied; schema and code are in step. 707 tests
(was 389), tsc / lint / build green. **Next migration is 062.**

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

## 6b. The loop, run end to end — 2026-08-14

Credit landed on the Anthropic account, so the core loop was driven for the
first time, in a scratch organisation, through the browser.

**What ran, and worked:**

| Stage | Result |
|---|---|
| Create mandate (`/app/projects/new`) | Intake + Company Research both COMPLETE in under 10s |
| Title resolution | "Analyzing…" → "Chief Technology Officer · Meridian Freight" |
| Onboarding, all five steps | Origin, must-haves, anti-patterns, stakeholders, weighted priorities |
| Compile calibration model | CALIBRATED |
| Generate job spec | 6,345 characters, five sections |
| Mark as final | FINAL_V01 |
| Sourcing | **blocked — out of credit** |

The chaining is real, not superficial. The spec opened with *"Meridian
Freight is a PE-backed logistics group in active growth mode, pursuing an
acquisition-led expansion strategy…"* — the acquisition angle came from a
stakeholder answer typed three steps earlier, and the vendor-estate framing
from an anti-pattern. The agents are reading each other's output.

### Finding 1 — the credit is already gone

Sourcing failed with *"Your credit balance is too low"*. One mandate through
intake → research → calibration → spec → finalise, plus one candidate
search, exhausted the balance. **Founder action, and it is the blocker for
everything downstream of the spec.** Nothing past FINAL_V01 has ever
executed: sourcing, evaluation, ranking, shortlist, comparison, the whole
Executive Intelligence surface.

Worth sizing before topping up again — five agent calls is not a lot of
runway.

### Finding 2 — every server-action error message is invisible in production

**Fixed on 2026-08-17. The write-up below is the diagnosis; §11 is the fix,
including the one thing that got harder rather than easier by making it.**

**This is the important one, and only a production build shows it.**

Next.js redacts errors thrown from Server Actions in production. The
codebase's pattern is `throw new Error("...")` in the action and
`catch (e) { toast.error(e.message) }` in the client component — roughly
twenty files. In production every one of those toasts renders:

> "An error occurred in the Server Components render. The specific message is
> omitted in production builds to avoid leaking sensitive details. A digest
> property is included on this error instance which may provide additional
> details about the nature of the error."

Confirmed twice, on deliberately different paths: the sourcing generate
button (an AI failure) **and** demoting an organisation's last admin (a
message the product wrote itself, from the 046 guard). It is not
AI-specific; it is every server-action error in the product.

So the careful wording in those actions — "an organization must keep at
least one active admin", "Failed to approve", the fee-terms and contact
messages — has never reached a user in production. In `next dev` the real
message shows, which is exactly why it survived: it looks correct locally
forever.

**The fix is a contract change, not a copy change.** A server action must
*return* its failure as a value rather than throw it, and the client renders
that value. It touches every action/panel pair, so it is its own piece of
work with its own verification. **Done — see §11.**

There is a silver lining worth recording: this redaction is also why the
`e.message` toasts were never a *leak*. The provider payload does not reach
the browser from a server action. The leaks fixed in `9a1c65c` and `fe37b55`
were real because those render server-side — a page body and a database
column — where no redaction applies. The distinction is load-bearing: it
decides which of these are security bugs and which are UX bugs.

### Finding 3 — "~5–10 seconds" is wrong

Both the spec page and the sourcing page promise "~5–10 SECONDS". The spec
generation took **38 seconds** wall-clock (18:17:05 → 18:17:43). The polling
UI handled it correctly and the copy did not. Small, but it is the first
number a new user gets to check the product against.

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

- ~~Every server-action error message is invisible in production~~ — done
  2026-08-17, §11. 104 actions and 95 call sites, one `ActionResult`
  contract, and a test that fails the build if a call site is added without
  `unwrap`.
- ~~Re-run the advisor after 061~~ — done 2026-08-17, §12. Nothing changed;
  the three new findings are all deliberate and all 061's.

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

---

## 11. The server-action error contract — 2026-08-17

§6b finding 2, closed. Every error message a server action produces now
reaches the person who caused it, in a production build. Before this, all of
them rendered the same paragraph about a digest.

It was **not twenty files**. 104 exported actions across 30 modules, and 95
client call sites. The "around twenty" figure in the continuation prompt came
from grepping `error.message`, which finds the panels that *render* a message
and not the actions that produce one.

### The shape

`src/lib/actions/result.ts` — isomorphic, imported by client components:

```ts
type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

class ActionFailure extends Error {}
function unwrap<T>(r: ActionResult<T>): T   // throws ActionFailure if !ok
```

`src/lib/actions/run.ts` — server-only, imported by action modules:

```ts
runAction(subject, async () => { ...the action body, unchanged... })
```

Each action file declares one `SUBJECT` — "The role change", "The sourcing
strategy" — and every exported action in it is `return runAction(SUBJECT,
async () => { … })`. Bodies were not rewritten; they still `throw`, and 348
throw sites are untouched.

### The client still throws, on purpose

`unwrap(await someAction(x))` turns `{ ok: false }` back into an exception —
**on the client**, where nothing is redacted. The failure has already crossed
the boundary as data by then, which is the whole fix.

That choice is what made the change reviewable. Each of the 95 call sites has
its own recovery hanging off `catch`: an optimistic list put back, a `<select>`
reset to what the server still says, a `finally` clearing a spinner. Rewriting
95 recovery blocks into early returns would have touched precisely the code
that has already been debugged in a browser — including the five bugs in
`09acbac` — for no gain. One token per call site touched none of it.

### The thing that got *harder*, not easier

§6b recorded a silver lining: the redaction that made those toasts useless
also meant no provider payload ever reached a browser through a Server Action.

**Returning the message removes that cover.** Every string leaving an action
is now a string a customer can read, and the sourcing path proves it matters:
`generateAllSourcingQueries` lets the Anthropic SDK's error propagate
verbatim, so the message crossing the boundary would have been

> `400 {"type":"error","error":{"type":"invalid_request_error","message":"Your
> credit balance is too low…"},"request_id":"req_011Ce8…"}`

— the exact payload `9a1c65c` and `fe37b55` were written to keep out of a page
body and a database column. So `runAction` decides, and the rule is:

- **A plain `Error` is an outcome the action authored.** Its message was
  written for the reader; it passes through `safeFailureMessage()`, the same
  backstop the `generation_error` columns use.
- **An `Error` *subclass*, or a non-`Error` throw, is a fault.** The Anthropic
  SDK throws subclasses; so do `TypeError` and friends. The reader gets
  `agentErrorMessage()`'s sentence; the real error goes to the server log.

Discriminating on `constructor === Error` rather than on a bespoke
`ActionError` class is what let this land without editing 348 throw sites, and
it puts the default on the safe side: a new `throw` nobody thought about is
only shown if somebody wrote `new Error("a sentence")`. `constructor` and not
`name`, because a subclass that forgets to set `name` inherits `"Error"` and
would take the wrong branch.

No second error mapper was written. `agent-errors.ts` is the sink, as it was.

### What keeps throwing

- **`ForbiddenError`.** The guard layer (§2), not an outcome. A caller who
  reaches an action they hold no capability for is not a user needing a
  friendly sentence — the proxy and RLS are the boundary. The consequence is
  carried deliberately: that one case still shows the digest paragraph.
- **`redirect()` / `notFound()`.** They signal by throwing. Swallowing one
  would turn every successful redirecting action — `createSkillAction`,
  `createProjectAction` — into a silent failure toast. `runAction` reads the
  `digest` string by hand rather than importing
  `next/dist/client/components/redirect-error`, a private path that has moved
  between majors; `skill-form.tsx` already does the same check client-side.
- **The four `<form action={…}>` actions** — `signInAction`, `signUpAction`,
  `createProjectAction`, `createExecutiveSearchAction` — are not converted at
  all. React's form-action type forbids a return value, and they already
  report failure by redirecting with `?error=`, which is server-rendered and
  so was never redacted.

`initiateJobSpec` delegates to `requestRegenerate` rather than wrapping it:
both are actions, and wrapping would nest the envelope and hide a failure
inside a successful outer result. `runAction` also passes an `ActionFailure`
through unchanged, so an action reading another action's result with `unwrap`
does not have a good sentence replaced by a vague one for crossing one more
frame.

### A missed call site is worse than the bug

This is the part the compiler cannot hold. An action returning
`Promise<ActionResult<void>>` called as `await fooAction(x)` type-checks
perfectly — the result is discarded — and the UI then reports **success** on a
mutation the server refused. The redacted toast at least said something had
gone wrong.

`src/lib/actions/call-sites.test.ts` fails the build if any call of an
exported action outside a `"use server"` module is not immediately preceded by
`unwrap(await `. It strips comments and string bodies first, so a doc-comment
mention of an action name is not read as a call, and it pins
`actionModules.length > 25` and `actionNames.size > 90` so a scan that
silently matches nothing fails loudly rather than passing vacuously — the same
argument as assertion (2) in `suspended_account_invariants.sql`.

**Control run**: deleting one `unwrap(` from `role-picker.tsx` failed the test
naming that file and line; restoring it passed. TypeScript catches the other
subset — a result that is read, or an action passed to a typed slot — and
those are not re-checked here.

### Verified in a production build, because nothing else would do

`npm run build && npm start`, driven in a browser under a temporary admin in a
scratch organisation. Both paths from §6b, chosen because they fail for
completely different reasons:

| Path | Before | After |
|---|---|---|
| Demote the org's last admin | the digest paragraph | **"an organization must keep at least one active admin"** |
| BUILD SOURCING QUERIES, no credit | the digest paragraph | **"The sourcing strategy could not run. This has been logged…"** |

Both are in one console log, the old build on `:3002` and the new one on
`:3000`, which is as direct a before/after as this gets.

On the sourcing run the DOM was also asserted clean of `Anthropic`,
`credit balance`, `Plans & Billing`, `req_` and `invalid_request_error` — the
leak the contract change created the opportunity for. The server log holds the
real payload. Two audiences, two strings, as with the audit trail in §8.

The `<select>` in the members row rolled back to `admin` after the refusal,
which is the evidence that the existing recovery blocks still run.

Scratch org, project, job spec, auth user, identity and sessions deleted
afterwards; counts checked back to baseline — 1 org, 2 projects, 1 candidate,
1 client, 1 user, 1 auth user, 0 sessions, 0 contacts, 0 notes, 0 placements,
0 activity events, 0 waitlist, 5 skills, 1 job spec, 0 boolean queries.

586 tests (was 584), tsc / lint / build green.

### Three things found on the way

- **Three actions had no return type annotation at all** —
  `generatePsychologyAction`, `generateClientPsychologyAction`,
  `generateCompanyCultureAction`. They now declare `CandidatePsychology`,
  `ClientPsychology` and `CultureProfile`. Inferred return types are fine
  until something has to wrap them.
- **`SAVE_DRAFT_FINALIZED_MESSAGE` is a sentinel the editor compares against**,
  not just prose. It survives: an authored plain `Error` passes through
  `safeFailureMessage` unchanged, so `msg === SAVE_DRAFT_FINALIZED_MESSAGE`
  still matches on the far side of `unwrap`.
- **"~5–10 SECONDS" is still wrong** (§6b finding 3). Untouched.

---

## 12. The advisor sweep after 061 — 2026-08-17

Run because 061 added a table and an anon-executable SECURITY DEFINER
function. **Security 12, performance 91. Nothing was changed and nothing
needs to be.**

The three findings that are new since §5g are all 061's, and all three are
the deliberate shape:

- **`check_demo_rate_limit` under both the `anon` and the `authenticated`
  SECURITY DEFINER lints.** The caller is a stranger on the marketing page
  with no session — the same argument as `verify_hm_token` (023). The
  function takes no parameter it trusts for anything but a bucket name.
- **`demo_rate_limit` under `rls_enabled_no_policy`.** INFO, and it is the
  *correct* state rather than an omission: RLS on with zero policies is
  deny-all, and the SECURITY DEFINER function is the only path in. Verified
  rather than asserted — as `anon` and as a forged `authenticated` claim,
  the table reads zero rows and refuses an insert, with a **control run**
  inverting the last assertion that raised as expected.

The rest is exactly §5g's residue: six deliberate SECURITY DEFINER
functions, the Pro-gated leaked-password toggle (§7), 12 unindexed
attribution foreign keys, and 79 `unused_index` — the same 79, unchanged.

The continuation prompt expected `demo_rate_limit` to show up for an unused
index and it did not. `demo_rate_limit_expires_idx` exists, and the reason it
is absent from the list is the one §5g gives for why the list is not a to-do
in the first place: an index is flagged for having no recorded scans, and this
one has some, because the demo endpoint has actually been called since 061
landed.

---

## 13. W7, the last of the sample data, and a blocker that was not one — 2026-08-18

`docs/sample-data-inventory.md` is complete: **all 46 dashboard routes**.
This section records only what belongs in a handoff rather than in the
inventory — the things that change how the next piece of work is
approached.

### D1 was a classification error, and it cost six workstreams

The inventory recorded W7's eleven routes as "entirely blocked" on a
founder decision about what a fabricated agent may say about a fabricated
person. Reading the code rather than the screenshots:

- **No page under `/app/executive-intelligence` renders agent output
  directly.** Three action files invoke an agent; every page reads a
  stored row.
- **The assessment — the one screen carrying an evaluative judgement of a
  person — has no agent behind it at all.** Its actions file imports three
  pure functions from `executive-assessment.ts`, which contains no model
  call. `types.ts` says so in a comment, the module ships a separate
  `ASSESSMENT_DISCLAIMER` because of it, and `report.ts` prints
  *"Assessment authored by a human · no AI"* into every report.

So D1's surface was two screens, and both sat inside the precedent W3 and
W6 had already applied. The same thing had happened once before, with
`/comparison` in W6.

**The generalisable lesson:** the survey classified pages by what they
look like. Before recording a blocker against a route, grep what it
imports. Twenty minutes would have saved six workstreams of deferral.

### Three defects found by building on top of shipped sample data

None was a sample-data gap; all three were in code that had passed
review, tests and a browser sweep.

1. **The sample taught six competency names the product does not have.**
   `sample-ei-workspace.tsx` and `sample-ei-report.tsx` hard-coded
   "Partner-level influence", "Talent architecture" and four more — none
   of them in `executive_competencies`, the 24-row catalogue the module's
   own `/competencies` screen renders one click away. Identical in kind to
   the five invented scoring dimensions W6 found, and worse in effect,
   because here the real vocabulary is a screen a prospect can open.
   `executive.test.ts` now parses `033_executive_intelligence_seed.sql`
   and refuses any key or label the migration does not contain.

2. **Two placements were billing searches that were still running.**
   `SAMPLE_PLACEMENTS` had Daniel Okonjo started as COO at Northvale — the
   search W7 is built on — and Priya Anand started as CTO at Larkspur, the
   mandate W3–W6 rests on and whose shortlist screen submits her as a
   candidate. The revenue screen was billing what the portfolio screen was
   still pitching. Both re-attributed to searches their client actually
   closed; no amount changed. Two tests now pin it, and the rule is
   `STARTED`-only on purpose: Cindermere's `FELL THROUGH` row against a
   live search is *correct*, because a fallthrough is what reopens one.

3. **`/app/projects/[id]/shortlist` was in no table in the inventory.** It
   survived six workstreams because the tests walked the *list* and asked
   whether each entry had a route — never the reverse. It now walks the
   route tree too. This is the third guard in the repo built that way
   (`routes.test.ts`, `suspended_account_invariants.sql`), and the pattern
   is worth reaching for by default: **enumerate what exists, not what
   somebody remembered to write down.**

### Reading the rendered page is still finding things tests do not

Two more this session, both in code with passing tests:

- The EI workspace header said **"4 candidates in diligence"** beside its
  own chain saying "2 in diligence · 1 advanced · 1 on hold". One screen
  contradicting itself, exactly as `/comparison` did with "two at Tier 2"
  over a table of three.
- The audit trail dated Rachel Sowande's link to day 30 while her own row
  said day 23 — a fixture that drifted within an hour of being written.

Everything countable in the EI sample is now derived, and there are tests
for both. The tally across this programme: **seven same-thing-twice
defects, three of them found only by looking at a screenshot.**

### The trap in §6's recipe bit again, as documented

Creating the scratch account fires 053's member-audit trigger, so
`activity_events` had two rows before the browser was opened — which made
`hasRealData` true and correctly suppressed the new `/app/activity`
sample. It looked like the feature was broken. It was not: the trail was
showing real rows, which is what it is for. Clear `activity_events` for
the test org after seeding, scoped, as §5b says.

### Verification

- 705 tests (was 641), tsc / lint / build green.
- Driven in a production build (`npm run build && npm start`) under a
  temporary admin in a scratch organisation, per §6.
- **Eleven routes at 360 / 390 / 768 / 1024 / 1440** — 55 page-widths, no
  horizontal overflow. The sweep was control-tested by injecting an
  over-wide element and confirming it was detected.
- The report's figures were read out of the DOM rather than eyeballed:
  100% weighted coverage, 83% weighted evidence strength, thin-evidence
  section naming Technology Strategy at 10%, provenance carrying
  *"ASSESSMENT AUTHORED BY A HUMAN · NO AI"*.
- **The negative case was tested too**, and it is the one that matters
  most: inserting a single real `executive_searches` row made the sample
  vanish from both `/app/executive-intelligence` and `/searches`, with the
  real row rendering in its place. No mixing.
- Four control runs, each of which failed as intended before being
  reverted: an unseeded competency key, a removed module-list entry, a fee
  row downgraded to `org` visibility, and the overflow probe.
- Scratch org, user, identity, sessions and the SMOKE search deleted;
  counts checked back to baseline — 1 org, 2 projects, 1 candidate, 1
  client, 1 user, 1 auth user, 0 sessions, 0 contacts, 0 notes, 0
  placements, 0 activity events, 0 waitlist, 5 skills, 1 job spec, 0
  executive searches, 24 competencies, 8 templates.

**No migrations.** Next is still `062`.

One control run worth recording because it nearly passed silently: the
first attempt to break a competency key used `sed` with an unescaped `&`,
which no-opped, and the test reported green. The guard was fine; the
control was not. *A control run that does not visibly change the file is
not a control run* — check the diff before trusting the result.

---

## 14. The persona-completion programme: Phase 0 verified, Phase 3 built — 2026-08-18

The recruiter persona has a definition of done and a phased plan (agreed
with the founder this session): **Phase 0** unblocks, **Phase 1** the loop
run end to end, **Phase 2** the external surface, **Phase 3** scheduling,
**Phase 4** written verdicts on every absent feature. This section records
what executed and what is blocked, so the next session starts at Phase 1
rather than re-deriving the plan.

### Phase 0 — verified, and both founder actions are NOT done

Verified rather than assumed, which was the point:

- **The Anthropic credit is still negative.** The live key 502s with
  *"Your credit balance is too low"* (req_011CeAFvNoiAkPuZGh2J5Wxm,
  confirmed through the product's own demo endpoint and read from the
  server log). This hard-blocks all of Phase 1 and the agent-dependent
  half of Phase 2.
- **The password floor is still 6.** A direct GoTrue signup with an
  8-character two-class password was **accepted** — the app-side policy in
  `password-policy.ts` is not the boundary, exactly as its header says.
  The probe account was deleted and counts checked back to baseline.
  Worth noting in passing: the signup auto-confirmed the email, so email
  confirmation appears to be off too — one more thing to look at on the
  same dashboard page.

Both are five-minute dashboard actions and both remain open.

### Phase 1 — blocked on credit; preparation done

Nine synthetic CV PDFs for the "CTO · logistics" scratch mandate are
staged (generator script + files in the session tmp dir; regenerating is
one command). The set is shaped to give every downstream stage signal:
three strong-but-different fits, two mids with distinct gaps, one match
for each of the mandate's three anti-patterns, one weak. All fictional,
smoke-prefixed. **Real-CV validation stays a founder checklist item** —
these prove the pipeline runs, not that it parses real-world CVs well.

### Phase 3 — the product's first scheduled path (migration 062)

**What runs:** `run_guarantee_maintenance()` earns `guarantee_passed`
instalments whose placement started and whose guarantee window has passed
— the one §5a consequence that was derivable from stored dates.
`earned_on = guarantee_ends_on`, not the run date, so a late cron still
books the right quarter. 'engagement' and 'shortlist' instalments stay
manual on purpose: whether those happened is a fact about the world the
database does not hold.

**The wiring:** `vercel.json` (daily 06:00 UTC) → `/api/cron/maintenance`
(CRON_SECRET bearer, fails closed with 503 when unset) → the RPC. The
053 audit trigger writes `fee_line_earned` on the same UPDATE with a NULL
actor — the trail renders it as "System" — so the first scheduled writer
in the product is audited by construction rather than by remembering.

**Proven:** `supabase/tests/guarantee_maintenance_invariants.sql`, ten
invariants against the live DB — earn the due line, and *leave alone* the
future one, the fell-through one, the accepted-not-started one, the
cancelled one and the start_date sibling; idempotency; the audit event's
actor/visibility; and the anon grant the route depends on. Control run
with the final assertion inverted raised. Two seed corrections were caught
by 050's own CHECKs on the way, which is those constraints doing their
job. Route driven locally in a production build: 503 / 401 / 200.

**Two deliberate scope cuts, written down rather than implied:**

- **Stalled-search alerting is detection without a channel.** Health is
  computed at render on every portfolio load; there is no email until
  Resend exists. A scheduled job whose output nobody receives is motion,
  not automation — the cron route documents this and the slot waits.
- **Agent 14's weekly sweep** is an Anthropic call per active mandate and
  lands with Phase 1, once credit exists. The route is where it plugs in.

**Deployment state:** CRON_SECRET is set in the Vercel production env
(generated this session, 64 hex chars). Inert until the vercel.json +
route deploy with the next push. Until Vercel Cron's first invocation is
observed in the deploy logs, treat the schedule itself as unverified.

**Advisor re-run after 062:** security 12 → 14, and both new findings are
`run_guarantee_maintenance` under the two SECURITY DEFINER lints — the
deliberate shape, argued in the migration header (same reasoning as
`check_demo_rate_limit`: no input trusted, idempotent, a hostile caller
can only do our maintenance early). The expected residue is now **seven**
deliberate SECURITY DEFINER findings.

**One defect found by driving, not by tests:** the proxy bounced
`/api/cron/maintenance` to `/auth/signin` with a 307 — which a scheduler
reads as success, so the job would have silently never run. `/api/cron/`
is now in `ALWAYS_PUBLIC_PREFIXES` beside `/api/demo`, which is exempt for
the same reason (the route carries its own gate). And one trap variant
worth naming: a `next-server` process from an earlier session held :3000
through every `pkill -f "next start"` (its process name is `next-server`,
which that pattern does not match), so three verification rounds ran
against a stale build that predated the route. Kill by port —
`kill $(lsof -tiTCP:3000 -sTCP:LISTEN)` — before trusting a curl.

### Phase 4 — draft verdicts, for the founder to confirm

Persona-complete requires each absent feature to carry a decision, not an
absence. Drafts, one line each; overrule freely:

- **Interview scheduling — declined for now.** Externals are token-only
  with no calendar identity; scheduling tools are commodity; revisit when
  a client asks for it by name.
- **Human-created tasks — deferred.** The home page's priority queue
  derives "needs you today" from state, which covers the core need; a
  task table is additive when wanted.
- **Tags — deferred.** Skills are the semantic layer the product already
  has; free-form tags would be a second, unstructured one.
- **Saved views — deferred.** List state lives in shareable URLs
  (`parseListParams`), which is most of the value at this team size.
- **Retention & right-to-erasure — deferred to pre-launch, not declined.**
  Half exists: erasing a subject cascades through evidence (043/044/053).
  Missing is scheduled retention and a formal erasure entry point. §5b
  already calls retention "more pressing than it was"; it should land
  before public launch.
- **DEI reporting — declined.** Scoring deliberately never touches
  protected characteristics; DEI analytics would require collecting
  exactly what the product refuses to infer. Only with explicit
  compliance-driven design, never as a side feature.
- **Non-Latin PDF fonts — deferred until sourcing outside Latin-script
  markets.** The embedded-font fix is specified in `glyphs.ts`; §9 states
  the trigger.
- **Network SQL pagination — deferred until a pool approaches the
  2000-row window.** The screen states its cap; migration-040-style
  grouping is the specified fix.

### The one thing this programme waits on

Everything left in Phases 1–2 is executable the hour the Anthropic
balance is positive. Top-up + auto-reload, then: the loop end to end with
the staged CVs, the EI chain live, the researcher path, measured
durations into the four files still promising "~5–10 seconds", the HM
portal, and the PDFs — in that order, with the persona-complete
declaration at the end of Phase 4.

---

## 15. Phase 2 capability, migration 063, and four defects — 2026-08-18

The founder's call mid-session: credit stays blocked, **build the
capability now, verify with live agents later**. So every Phase 2 surface
was driven with seeded data standing in for agent output — the seed
(`phase2-seed.mjs`, session tmp; typed against the real stored shapes,
inserted through the scratch admin's own session so RLS applied) builds a
complete CTO · Meridian Freight mandate: FINAL_V01 spec, four candidates
with full profiles/evaluation/triangulation, scores, a submitted
shortlist, a weekly report, a portal token.

### Proven for the first time

- **The HM portal end to end**: token → render (evidence grid populated —
  both §6 "never seen" items closed) → per-candidate ratings and notes →
  three `feedback` rows + one `hiring_manager_reviews` row → visible on
  the recruiter's /feedback screen. Driven on production, which holds the
  service-role key the local env deliberately lacks.
- **Every PDF read, not just rendered**: evaluation (3pp), weekly report,
  comparison. One cosmetic left: the weekly market-commentary blockquote
  splits awkwardly across a page break.
- **The researcher happy path** (§2's "never exercised"): a researcher on
  a final-spec mandate reaches /sourcing, is not bounced, sees the CTA.
- **The email draft dialog**, now carrying the candidate's seat.

### Four defects, all found by rendering with real-shaped data

1. **The portal's only acknowledgment was a transient toast.** The filled
   form stayed under a live SUBMIT button; a second click writes duplicate
   reviews (the route is deliberately not idempotent). Fix: a persistent
   submitted state replaces the form. Verify in the browser after the next
   deploy.
2. **The evaluation weight scale was self-contradictory in three places.**
   The schema/prompt claimed weights are "integer 0–10" while instructing
   the agent to mirror `dimension_weights` (which sum to 100) exactly; the
   screen `clamp10`ed 24 down to 10; the PDF printed "24/10". Weights are
   relative shares — all three fixed, prompt line rewritten.
3. **Every evaluation export header rendered "—" for the candidate's
   seat** — three call sites hardcoded `candidate_title: null`. Threaded
   through page → report → actions → email dialog.
4. **(Phase 3, recorded in §14): the proxy 307'd the cron route.**

### Migration 063 — `record_hm_portal_opened`

The §5b gap closed: a definer entry point taking the portal token,
validating it, debouncing to one event per token per hour, writing through
`write_activity_event` with the token's label in `detail` (actor NULL →
"System"). EXECUTE revoked from everyone — the only caller is the portal
page on the service role, so **no new advisor finding; the residue stays
at seven**. Five invariants + control run against the live DB
(`hm_portal_opened_invariants.sql`); wired fire-and-forget into
`/hm/[token]`. `report_exported` remains the one unwritten vocabulary
event, for §5b's original reason.

### Duration copy — the four false "~5–10 seconds" claims are gone

Spec screens now say ~30–60s (the one measured datum: 38s, §6b); CV parse
and sourcing say "usually under a minute" — no invented numbers.
**Re-measure all four during the Phase 1 live run** and tighten.

### State

707 tests, tsc / lint / build green. **Next migration is 064.** Scratch
org deleted; counts at baseline (the 3 feedback + 3 hm_tokens rows are the
founder's own, from May). Awaiting credit: tasks 10–12 (the live loop) and
the re-verification of evaluation/triangulation/reports with real agent
output. The persona-complete declaration still waits on that.

---

## 16. Phase 1 — the loop run live, seven defects, and a framework root cause — 2026-08-19

Credit landed 2026-08-18 and the loop ran end to end with real agents for
the first time: intake → research → onboarding (5 steps) → calibration →
FINAL_V01 spec → sourcing → the 9 staged CVs parsed → 9 evaluations →
ranking → HM feedback with a live recalibration → shortlist (Top 3,
submitted) → comparison → the full EI chain (company context → success
profile v1 approved → interview plan v1 approved → human assessment v1
approved → report compiled) → HM portal driven on production with the
real slate. Everything in `8a109f6`.

### Measured durations (now in the UI copy)

Intake ~3s; intake+research 15–18s; calibration 6–20s; **spec 38.7s**
(matches §6b's 38s exactly); sourcing 22s; CV parse 20–23s (40s cold,
first call of a build); evaluation ~90s in `after()`; success profile
~115s; **interview plan 186s** — which mattered, see defect 5. The four
duration strings now carry these numbers.

### The tier check — the CV design held

Strong three at ranks 1–3 (Annelise 8.42 T1, Tobias 8.22 T1, Priyanka
6.64 T2); mids mid-table; all three anti-pattern profiles and the weak CV
in the bottom four (consulting-Partner capped at 4.0, greenfield #8,
vendor-estate #9). After the HM's preference-shift feedback the
recalibration moved technical 7→10, domain 9→7, re-scored all nine, and
swapped Kaufmann/Okafor — and the comparison page's dominant weights
reflected the shift. The chain is consistent end to end.

### Seven defects, all found live, all fixed in `8a109f6`

1. **INDUSTRY_OPTIONS was 8 finance-heavy options** — the research agent
   filed a logistics group under "Consulting". Broadened to 17 + Other;
   verified live ("Logistics & Transportation").
2. **Every slow-action client hung forever on Next 16.2.4.** Onboarding's
   revalidate+redirect 303 arrived with an empty flight body; sourcing's
   `unwrap → router.refresh()` fetched the fresh payload and never
   committed it. Fast actions (skill create, contact add) worked — the
   race only bites when the action runs tens of seconds, which is why
   §11's verification missed it and every agent button had it. **Next
   16.3.1 fixes the root cause** (verified: culture agent 40s, same-page
   commit). Onboarding and CV upload also moved to explicit
   `router.push`, which is the more deterministic shape either way.
3. **16.3.1 enforces "no `cookies()` in render-path `after()`"** — the
   candidate page's background evaluation died on it, and the
   skill-injector inside that path *silently stripped every skill from
   the run* (its catch returns `[]` by design). Both now accept a client
   built during render. Action-path `after()` is unaffected.
4. **Migration 060's composite FKs made nine PostgREST embeds ambiguous**
   ("more than one relationship") — the EI candidates page failed to
   load linked candidates. All embeds between
   executive_search_candidates/competencies and their targets now carry
   explicit FK hints. No other unhinted embeds exist in the codebase
   (swept); note for future embeds: **after 060, every embed between
   org-scoped tables needs a hint.**
5. **The interview-plan unstick timeout (180s) marked a successful 186s
   generation as failed** six seconds before it landed — the recruiter
   saw "generation failed" over a plan that exists. Generating-view
   timeouts now match the routes' 300s `maxDuration` (spec 120s).
6. **The weekly report fabricated citations** — a named acquisition with
   a price tag and a "CargoRex 2026" study, from an agent with no
   research tool, invited by a prompt asking for "a specific market
   signal". Prompt now forbids external citations; the regenerated
   commentary grounds itself in the search's own data. The evaluation
   agent never did this — its prompt pins every claim to the CV.
7. Pluralization in the comparison export ("1 stretch profile sit").

### Re-verified with real output

Evaluation PDF read in full — weights mirror the calibration **bare and
unclamped on all three surfaces** (the §15 contract, now stated
scale-agnostically: wizard calibrations emit 1–10, not 100-sum).
Triangulation fused three live research reports (alignment 62/58/60).
Weekly report narrates the real week including the recalibration.
Comparison PDF's counts are self-consistent (9/3/1/5). HM portal on
production: token → render → three ratings + notes → persistent
SUBMITTED state (§15's ack fix, confirmed with real data) → 4 feedback
rows + 1 review on the recruiter's screen → 063's `hm_portal_opened`
trail event, exactly one, debounced.

### Carried, not fixed

- **The `ř` in "Marek Dvořák" prints as "?" in every PDF** — §9's font
  gap bites ordinary EU names, not just non-Latin markets. The verdict's
  trigger may deserve tightening (founder call, Phase 4 item 7).
- Weekly market-commentary blockquote still splits across a page break;
  a list item's bullet can strand at a page bottom the same way.
- Evaluations generated before ranking say "no other candidates in the
  slate" — competitor context reads candidate_scores, which fill at
  first ranking-page visit. Sequencing fact, not a bug; a regeneration
  picks them up.
- One synchronous panel agent (company intelligence) dies if the page is
  closed mid-run — it's a plain awaited action. The polling-based agents
  (spec, profile, plan) survive navigation. Worth a pass someday.

### State

707 tests, tsc / lint / build green on **Next 16.3.1**. Deployed
(`8a109f6`, 14:32 UTC). No migrations — next is still **064**. Scratch
org, auth user, storage objects and all mandate data deleted; counts
verified back to baseline. phase1-assets deleted per the run-book.
Remaining for persona-complete: **Phase 4 sign-off only** (verdicts
drafted in §14; the live run argues for tightening item 7's trigger).

---

## 17. Phase 4 signed off — the persona programme is complete — 2026-08-19

The founder confirmed all eight §14 verdicts as drafted: interview
scheduling declined for now; human-created tasks, tags, and saved views
deferred; retention & right-to-erasure deferred to pre-launch (not
declined); DEI reporting declined; non-Latin PDF fonts deferred on the
existing trigger — confirmed with §16's finding on record that the glyph
gap already bites ordinary EU names ("Dvořák" → "Dvo?ák"), so the
embedded-font fix in `glyphs.ts` is the first thing to reach for when it
bothers a real client; Network SQL pagination deferred until a pool
approaches the 2000-row window.

With that, the definition of done is met: a recruiter can run one real
search from intake to invoiced placement entirely inside the product
(Phase 1 live loop, §16; placement/fee capability, §5a/§6b), every
artifact is honest (durations measured, weights mirrored, citations
grounded, sample data labelled), and every absent feature carries a
written verdict (§14, confirmed here).

**The Recruiter persona is complete.** The continuation file
(`NEXT-persona-complete.md`) is deleted per its own instruction.

Still founder-owned, unchanged: password floor + email confirmations
(one dashboard page), leaked-password protection (Pro-gated), Resend,
and the deferred build list (Sentry → rate limiting → Resend → Stripe).

---

## 18. The auth floor closed — password policy and email confirmation live — 2026-08-19

Both §0 blockers are done, applied via the Management API
(`PATCH /v1/projects/{ref}/config/auth`) and verified by probe rather
than by reading settings back:

- **password_min_length 6 → 12**, required characters lowercase +
  uppercase + digits + symbols. A direct GoTrue signup with an 8-char
  two-class password is refused by the auth server (422 weak_password,
  reasons: length + characters), and a 12-char letters-only password is
  refused on characters — the boundary now enforces what
  `password-policy.ts` promises, and GoTrue's own error message lists
  the exact symbol set the app's `PASSWORD_SYMBOLS` mirrors.
- **mailer_autoconfirm on → off.** A strong-password signup returns no
  session and an unconfirmed user with `confirmation_sent_at` set; the
  confirmation email delivered to a real inbox and its link confirmed
  the account 15 seconds later, after which sign-in succeeds. The full
  chain — send → deliver → link → confirmed → sign-in — is proven. The
  probe account was deleted and counts checked back to baseline.
- **site_url corrected** from the stale `mandate-eight.vercel.app` to
  `https://getmandate.io` — found in passing; confirmation links are
  built from it, so it was in scope.

The app side needed nothing: signup already validates the same policy,
redirects to a "check your email" notice when no session comes back, and
`/auth/callback` exchanges the confirmation code — all built in §14's
follow-through and waiting for the server to catch up.

Two operational notes: confirmation email is on Supabase's built-in
sender (a handful per hour — fine for founder-controlled access, and the
natural trigger to wire Resend when signups open up); and GoTrue now
rejects undeliverable-looking addresses (`.test` domains) at signup,
which future probe recipes should account for. Leaked-password
protection remains Pro-gated, unchanged.

---

## 19. The Recruiting Manager persona — built, proven, awaiting verdict sign-off — 2026-08-19

Programme plan in `NEXT-recruiting-manager.md`; D1–D4 confirmed by the
founder and executed same-day. Three migrations (**next is 067**):

- **064** — fifth role `manager` (recruiter's writes + `fees:read` +
  new `desk:manage`, minus `org:manage`/`skills:write`; the 046 "one
  function, not a hundred IN clauses" design meant no policy rewrites),
  and `projects.lead_recruiter_id`: nullable ownership, trigger-guarded
  (only desk holders reassign or assign-to-other; leads must be active
  and mandate-capable; in-org rides 057's author trigger — a composite
  FK would have broken member moves, re-proven by invariant 13),
  backfilled from created_by.
- **065** — `mandate_reassigned` joins the activity vocabulary (table
  CHECK + `record_activity_event` allowlist + a new "mandates" group);
  detail carries from/to ids and labels captured at the moment of change.
- **066** — `desk_digests`, append-only, the second read restriction
  after fees (SELECT/INSERT `can_manage_desk`): the digest is the
  manager's read of the desk, decided by §10's reasoning.

**`manager_desk_invariants.sql`** — 14 invariants + control run against
the live DB, explicit about refusal *kinds* (RLS filters vs triggers
raise). Invariant 11 caught a real fail-open on its first run:
`can_manage_desk()` returned NULL for a suspended manager, and the
trigger's `NOT can_manage_desk()` is NULL — an IF that silently does not
fire. The predicate is now coalesced, unlike the 046 predicates, and the
difference is load-bearing (they are only read by RLS, which treats NULL
as false; this one is read negated by a trigger). The
users_policy_invariants principal enumeration was deliberately not
extended — it tests 058/059's read policies, which are role-agnostic;
the manager principal lives in the desk file.

**The desk** (`/app/desk`, nav + route gated on `desk:manage`):
per-member rollup (mandates by lead, candidates, placements by
`owner_user_id`, last activity), mandates list with per-row
reassignment, labelled sample desk for the empty state. The rollup
lives in `src/lib/desk/rollup.ts` and is shared verbatim with the
digest agent so the screen and the digest cannot disagree on a count —
§13's same-thing-twice family prevented structurally. One defect found
seeding live data: the rollup compared `status === "STARTED"` against a
lowercase vocabulary and would have shown every started count as zero.

**The digest** — one Anthropic call per generation across the whole
desk (never per mandate; §14's cost shape), stored append-only,
grounding rules forbidding external citations inherited from §16 defect
6 on day one. The panel states the delivery honesty: renders on the
desk only, no email until Resend.

**Driven live** in a production build under a scratch two-recruiter
desk: manager saw the sample state, then the real rollup (counts exact,
1 unassigned surfaced), reassigned twice (trail rows carry actor +
from/to labels), generated a digest whose every number reproduced from
the rollup and which stated plainly that activity timestamps were
absent. A recruiter has no Desk nav entry and `/app/desk` bounces to
no-access naming the capability; recruiter/viewer/suspended refusals at
the database layer are the invariants' (4)(6)(9)(10)(11). Scratch desk
deleted; counts at baseline; the founder's two mandates now carry their
creator as lead.

One environment note, not a defect: a mid-session network change left
the Node server's connection pool timing out against Supabase
(`UND_ERR_CONNECT_TIMEOUT`) while curl reached it fine — restart the
server, not the database, when sign-in dies with "fetch failed".

### Phase 4 verdicts — drafted, for the founder to confirm

- **Individual targets/quotas — deferred.** The desk shows load and
  outcomes; targets are policy, and imposing a number is the manager's
  call to make outside the product until asked for by name.
- **Commission splits — deferred to the billing programme.** Splits are
  money mechanics; they belong beside Stripe, not before it.
- **Recruiter performance scoring — declined.** The §14 DEI reasoning
  echoes here: scoring the people who work for you is a feature to
  design deliberately with the humans affected, never a bolt-on. The
  desk states facts and declines to grade.
- **Capacity planning / forecasting — deferred** until real desks show
  what loads look like; a model fitted to zero data would be §16-defect-6
  fabrication with extra steps.
- **Time-to-fill benchmarks vs market — declined** in the current form:
  no research tool holds credible benchmark data, and the digest's own
  grounding rules forbid inventing it.
- **Desk CSV export — deferred** until a manager asks; the rollup is
  reproducible arithmetic over readable rows.
- **Manager-scoped digest email — lands with Resend**, already stated on
  the panel.

707 → **721 tests** (roles matrix + vocabulary growth), tsc / lint /
build green. Scratch data deleted, counts verified. The
persona-complete declaration waits on the verdicts above.

---

## 20. Recruiting Manager verdicts confirmed — the persona is complete — 2026-08-19

The founder confirmed all seven §19 verdicts as drafted: targets/quotas
deferred; commission splits deferred to the billing programme;
recruiter performance scoring declined (the §14 reasoning, on record);
capacity planning deferred until real desks exist; market benchmarks
declined in current form; desk CSV export deferred until asked; the
digest email lands with Resend.

The definition of done is met: a recruiting manager can run a desk of
several recruiters entirely inside the product — every mandate's
health, every recruiter's load, pipeline and placements, and the
revenue book (`fees:read`, /app/placements) — with every number derived
rather than asserted (one rollup shared by screen and digest), the one
management action audited by construction, and every absence carrying a
written verdict.

**The Recruiting Manager persona is complete.** Two of seven personas
now served. `NEXT-recruiting-manager.md` deleted per its own
instruction. Next migration is **067**.

---

## 21. The External Identity programme — built, proven live, awaiting verdict sign-off — 2026-08-19

Third persona programme, and the first to cross the org boundary: HM
login + Hiring Company HR + Hiring Company Admin, one build. Plan in
`NEXT-external-identity.md`; D1–D6 confirmed by the founder and executed
same-day. Three migrations (**next is 070**):

- **067 — identity.** `hiring_manager` / `client_hr` / `client_admin`
  join `users.role`; `users.client_id` is the boundary with an XOR
  CHECK (staff carry org and never client; externals the reverse), so a
  role change across the line without the columns moving is refused by
  a constraint, not a trigger. `can_read_org()` stopped meaning "any
  role" and enumerates the five staff roles — the fail-open the plan
  existed to prevent, closed twice over. New predicates
  `current_user_client_id()`, `is_client_admin()` (coalesced — read
  negated in the guard, invariant-11's lesson applied at authoring
  time), `client_org()`. The privilege guard learned three rules:
  client_id moves founder-only; staff can't touch an external's email;
  a client_admin may change *only* status. Deliberately no
  last-client-admin rule — unlike an org, the recruiting firm is always
  there.
- **068 — relationships.** `invitations` (one door, both directions:
  staff at clients:share invite any external; a client_admin invites
  colleagues within the shared set), `mandate_shares` (the D2 act —
  nothing leaves the building without one), `mandate_grants` (HM-only,
  enforced by trigger). Issuance is an RPC, not an INSERT policy: the
  one-account-per-email check reads rows the caller must not see,
  grants ⊆ shared for client_admins, contact find-or-create keeps the
  CRM coherent, and a staff grant auto-creates the share because
  inviting an HM to a mandate *is* the share act. Token secrecy: the
  client_admin lists invitations through `list_client_invitations`,
  which returns every column except the token. `guard_author_in_org`
  gained its third tier — an external of one of the org's clients is a
  legitimate author in that org's trail; without it every
  client_admin-caused trail event was refused and silently swallowed by
  write_activity_event's catch. Nine event types joined the vocabulary,
  all trigger- or RPC-written; `record_activity_event`'s allowlist
  deliberately did not grow.
- **069 — the read surface.** External base-table RLS stays deny-all;
  SECURITY DEFINER RPCs are the boundary (`portal_context`,
  `portal_list_mandates`, `portal_get_mandate`,
  `portal_list_my_reviews`, `portal_list_grants`) because "the slate"
  is a computed shape RLS cannot express without exposing the pool —
  every RPC is console-reachable by design and returns only what the
  page renders. `portal_slate_candidate_ids` mirrors shapeSlate
  (shortlist ids, else top-5 by rank); the pairing is pinned by the
  invariants file. `hiring_manager_reviews.submitted_by_user_id` +
  the author guard attached.

**`external_identity_invariants.sql`** — 16 invariants + control run.
The control run simulated a fail-open regression (a grant the truth
table forbids) and the file aborted at INVARIANT-FAIL (4) as designed;
the clean run passes. Two test-side bugs found by the harness itself
mid-authoring — both were reads made under a principal whose RLS
rightly filtered the verification query to zero (a client_admin reading
mandate_grants, org-B staff reading org-A's trail) — the same lesson
twice: verify through the reader's real surface, or privileged.

**App side.** roles.ts split the vocabulary (STAFF_ROLES /
EXTERNAL_ROLES, `isExternalRole`), externals hold `portal:read` (+
`client:manage-people` for the admin) and — the load-bearing negative —
no staff role holds `portal:read` and no external holds `org:read`,
both pinned in tests. /portal is its own route tree with its own
chrome; the proxy gates it per-navigation (portal:read is never the
skip-fast default), the dashboard layout bounces externals to /portal,
/invite/[token] is hard-public. The members screen offers staff roles
only. The HM submit pipeline was extracted to `src/lib/hm-portal` and
serves both doors — token (label-only, D5) and session (attributed);
`src/lib/email` is the one Resend door with delivery-honesty results,
and the waitlist notifier now rides it. 767 tests (from 721), green
gate held on both commits.

### Driven live on production (`2161bc2` + `d046e76`)

Scratch world: Halewick Search (org) → Rowan (recruiter) → Cindermere
Group (client) with a CTO mandate (3 candidates, shortlist of 2) and a
confidential CFO mandate that was never shared and never appeared on
any external screen — including the client's own admin. The full loop:
staff invite (HM with grant — the CTO auto-shared in the same act, the
invitee landed in the CRM as a contact) → redemption (password set, no
second confirmation loop) → HM portal showing exactly one search →
attributed feedback (review row carries `submitted_by_user_id` →
"Marta Ellison", label auto-filled from the profile, ratings + top
concern persisted) → the mirror feedback rows fired the real
interpretation pipeline in production `after()` (both rows interpreted,
no recalibration requested) → client_admin redeemed, invited an HR
colleague from her own People screen (subset rule visible: only shared
searches offered), suspended and the suspension held at sign-in →
HR redeemed and saw the client-wide shared set. Probe matrix: external
→ /app and /app/desk both bounce to /portal; staff → /portal lands on
no-access naming portal:read; a spent invitation shows the one dead
screen; signed-in externals bounce off /auth/signin through /app to
/portal; the token portal still works end to end (generated against a
portal contact, rendered logged-out). The trail wrote itself: 3
invited (Elena's carries her as actor — the extended author guard
admitting an external into the org's trail), 3 joined with targets, 1
grant, the suspension with the client_admin as actor, the share, 3
contacts. Scratch world deleted; every count verified back to the
pre-drive baseline exactly.

### The one thing that did not deliver: the email itself

Resend refused every send: **403, "The getmandate.io domain is not
verified."** The key works; the domain's authoritative DNS is at
Namecheap (registrar-servers.com — the Vercel DNS zone is configured
but not authoritative), where a Resend DKIM record exists from an old
attempt but the send-subdomain SPF/MX records were never added, so
verification never completed. The delivery-honesty design carried the
drive anyway: the staff toast said plainly "Invitation created, but the
email did not send — share the link by hand", handed over the URL, and
copied it to the clipboard; the client_admin's toast says to ask the
search team. Refused sends now also land in the server logs (`d046e76`)
— a toast reaches one person once. **Founder-owned to unblock email:**
at resend.com/domains open getmandate.io, add the records it lists to
Namecheap DNS (the missing ones are on the `send` subdomain: an MX to
Resend's feedback host and the amazonses SPF TXT; the DKIM record is
already there), click Verify. The D6 SMTP switch (Supabase auth mail
through Resend) also waits on this and on the key being in hand — the
Vercel env var is marked Sensitive and cannot be read back.

### Phase 4 verdicts — drafted, for the founder to confirm

- **Multi-relationship externals** (one email, two recruiting firms
  both working with the same person) — **deferred** until it happens to
  a real user. The refusal is honest at both doors; designing identity
  federation for a collision that has never occurred would be §16-6
  fabrication in schema form.
- **Retiring the token portal — deferred.** Both doors are live and
  share one pipeline; real usage decides, per D5 as confirmed.
- **External notification emails** (new-slate alerts, digest mail) —
  **deferred to a notifications programme**; every panel states today
  what does and does not send. The invitation email lands the moment
  the domain verifies.
- **SSO / SAML for client companies — declined** in current form: no
  client has asked, and enterprise auth belongs beside billing and
  procurement when a client procurement process demands it.
- **External data erasure — joins the §14 retention verdict**
  (deferred to pre-launch, not declined): an external account adds
  users rows, reviews and trail events to the same ledger.
- **Staff-side role changes for externals — deferred.** The database
  permits staff to move an external between the three client roles;
  no UI offers it. Revoke-and-reinvite covers the rare case honestly.
- **Client-side portal branding — deferred** until a client asks; the
  "Portal operated by … via Mandate" line is the honest default.

Deploys `2161bc2` (surfaces) and `d046e76` (send logging) live. tsc /
lint / build green, 767 tests. The persona-complete declaration for
**three externals in one programme** waits on the verdicts above and on
nothing else; email delivery waits on the founder's DNS step and fails
honest until then.

---

## 22. External Identity verdicts confirmed — three personas complete — 2026-08-19

The founder confirmed all seven §21 verdicts as drafted:
multi-relationship externals deferred until real; the token portal
stays; external notification emails deferred to a notifications
programme; SSO/SAML declined in current form; external erasure joins
the §14 retention verdict; staff-side external role changes deferred
(revoke-and-reinvite covers it); portal branding deferred.

The definition of done is met: a hiring manager, a hiring-company HR
employee and a hiring-company admin can each hold a real credentialed
account, see exactly what the D2 share-and-grant model says they see
and nothing else (proven at the RLS/RPC layer by 16 invariants with a
control run, and live on production per §21), submit feedback that is
attributed rather than asserted, and be invited, suspended and
restored — by the recruiting firm at the clients:share tier, or by
their own client_admin within the shared set — with the whole
relationship audited by construction in the owning org's trail. Every
absence carries a written verdict, and the one undelivered piece
(invitation email) fails honest with the link in the inviter's hand,
blocked solely on the founder's Resend DNS step.

**The Hiring Manager, Hiring Company HR and Hiring Company Admin
personas are complete.** Five of seven personas now served.
`NEXT-external-identity.md` deleted per its own instruction. Next
migration is **070**. Still founder-owned: the Resend DNS records at
Namecheap (unblocks invitation email and the D6 SMTP switch), the
exposed Supabase access token revocation, leaked-password protection
(Pro-gated), and the deferred build list (Sentry → rate limiting →
Resend → Stripe) — Resend's code half is now built and waiting on DNS
alone.

---

## 23. Account Lifecycle slice — recovery + resend, proven live, awaiting verdict sign-off — 2026-08-19

The two gaps §21 left open, closed as one slice (plan in
`NEXT-account-lifecycle.md`, D1–D5 confirmed). One migration (**next is
071**):

- **070** — `resend_external_invitation`: same token, fresh 14-day
  clock; staff at clients:share or the client's own admin; accepted and
  revoked invitations refuse (Revoke must not be undone by a resend
  button — re-invite is the honest path); writes
  `external_invitation_resent` with the caller as actor, the external
  client_admin included. `account_lifecycle_invariants.sql`: 5
  invariants, clean pass, control run (an accepted invitation with its
  guard removed) tripping at INVARIANT-FAIL (3) as designed.
- **Recovery** is GoTrue's own flow plus two pages — no schema.
  `/auth/recover` asks for the email and answers identically whether or
  not the address has an account (D2); the recovery link threads
  through `/auth/callback` (which already turns suspended accounts away
  by name) to `/auth/reset`, which enforces the same 12/4 floor as
  signup and redemption — three doors, one floor. The signin page's
  "Forgot Security Key?" tooltip is now a real link. Resend buttons
  with delivery honesty sit beside Revoke on both panels — the staff
  toast hands over the link on email failure; the client_admin's does
  not (token secrecy holds on the client side).

### Driven live on production

Recovery: request for the scratch recruiter → the D2 screen, and
`recovery_sent_at` fresh in GoTrue (the built-in sender dispatched;
real-inbox receipt is founder-confirmable — it is the §18-proven sender
and the same verify→callback mechanics as the proven confirmation
chain). Unknown address → the identical screen, no enumeration. Reset:
a weak password refused, a compliant one accepted; sign-in with the new
password works; the external client_admin reset hers and landed on
/app/home → bounced to /portal — the D1 landing with no persona branch
in the flow. Resend: the staff resend moved a 1-hour clock to 14 days,
wrote one attributed trail event, and toasted the link by hand; the
client_admin's resend did the same from her People view with her as the
event's actor; the invitation then **redeemed successfully after the
resend**. Scratch world deleted, counts verified back to baseline
exactly.

**One defect found live, fixed in the drive:** the reset action landed
on `/app`, which has no page — a 404 over a successful reset (the §16-5
family: success reported as failure). Now `DASHBOARD_HOME`; re-proven
live by the external reset.

### Phase 4 verdicts — drafted, for the founder to confirm

- **Self-service account pages** (change own name/password while signed
  in, staff and portal) — **deferred** to a portal-settings slice; the
  recovery flow covers the lockout case, which was the urgent half.
- **Recovery-link TTL** — **deferred**; GoTrue's default stands until
  it bothers a real person.
- **Rate limiting on /auth/recover** — **joins the pre-launch
  rate-limiting item**, not built ad hoc here; GoTrue's own per-email
  send throttling is the interim floor.
- **SMS / second-factor recovery — declined** at this scale.

Deployed (`070` applied, fixes live). tsc / lint / build green, 767
tests. Completion declaration waits on the verdicts above.

---

## 24. Account Lifecycle verdicts confirmed — the slice is complete — 2026-08-19

The founder confirmed all four §23 verdicts as drafted: self-service
account pages deferred to a portal-settings slice; recovery-link TTL
deferred on GoTrue's default; /auth/recover rate limiting joins the
pre-launch item; SMS/second-factor recovery declined.

The definition of done is met: any principal — staff or external — who
loses their password can recover it through one flow that tells
outsiders nothing, enforces the same floor as every other password
door, and lands each persona on their own home; and an invitation that
expired or never arrived is one honest click to send again, refusing
the states where a resend would lie (accepted, revoked), audited with
its caller as actor. Every absence carries a confirmed verdict.

**The Account Lifecycle slice is complete.**
`NEXT-account-lifecycle.md` deleted per its own instruction. Next
migration is **071**. Founder-owned, unchanged: the Resend DNS records
at Namecheap (invitation and recovery email both upgrade the moment the
domain verifies), the exposed Supabase access token, leaked-password
protection (Pro-gated), and the deferred build list.

---

## 25. Portal-settings slice — self-service name + password, proven live, awaiting verdict sign-off — 2026-08-19

The §23 verdict come due (plan in `NEXT-portal-settings.md`, D1–D5
confirmed). One migration (**next is 072**):

- **071 — `users_update_self` + the guard's self branch.** The policy
  puts one's own row in reach, deliberately not status-gated (a pending
  user fixing their name before approval is fine; what a non-active
  account must not do is refused by the guard *because* it is not
  active — both privileged predicates resolve through
  `current_user_role()`, NULL off-active). The guard branch sits after
  the founder-only column rules and above the external-administration
  block, so an external's self-rename no longer refuses with "only a
  client admin may administer client accounts" — the wrong sentence for
  what used to be the right refusal. Self + non-admin ⇒ only
  `full_name` moves. Two D4 interpretations worth the founder's eye:
  **"non-admin" means "not an active org admin"** (an org admin falls
  through and keeps current powers, the last-admin rules still guarding
  self-demotion and self-suspension); and **the client_admin's 067
  status power over their own row is kept** rather than silently
  removed — they gain self-rename and keep self-suspend, refused role
  and email like everyone else. The branch reads `is_org_admin()`
  negated, so it is coalesced — the invariant-11 lesson's third
  application. Uncoalesced, a pending signup's NULL role would skip the
  branch, fall past the external block (no client) and the last-admin
  rules (not an admin), and RETURN NEW free to write its own role.
- **`self_service_invariants.sql`** — 8 invariants, clean pass. Writes
  made as the forged principal, effects verified privileged (§21's
  lesson). The pending-signup escalation attempt is the fail-open
  tripwire: the **control run** re-created the guard with the bare
  `NOT is_org_admin()` and aborted at INVARIANT-FAIL (3) exactly —
  invariants 1–2 pass even under the regression (an *active* viewer's
  predicate is false, not NULL), which is why the pending principal is
  the one that pins it. Diff verified: clean end-to-end pass vs. abort
  at (3).

**Surfaces (`4647905`).** `src/lib/account/actions.ts` serves both
personas: `renameSelfAction` (RLS + guard enforce; the action writes and
revalidates) and `changePasswordAction`, which re-verifies the current
password via a scoped sign-in on a throwaway client that persists
nothing — a walk-up attacker at an open laptop cannot lock the owner out
(D3) — then `updateUser` under the same 12/4 floor as signup, redemption
and recovery. Four doors, one floor. One shared form component
(`src/components/account/account-forms.tsx`) behind `/portal/settings`
(identity card — name, email, role, company, operated-by line — plus the
two edits; "Account" nav for all external roles) and an Account section
atop `/app/settings` for every staff role, viewer included. Both
surfaces state in place that email is not self-service and who to ask.
The success toast states that other sessions stay signed in — the
absence is spoken, per the house shape. tsc / lint / build green, 767
tests.

### Driven live on production

Scratch world: Selfhaven Search (org) → Rota **Qinn** (recruiter,
typo'd on purpose) → Bramblewood Group (client) → Holis **Vane**
(hiring manager, same). Staff: renamed herself to "Rota Quinn" on
/app/settings — the roster row and the sidebar chip both show it;
password change with a wrong current password refused with "Your
current password is incorrect."; with the right one accepted; the old
password refused at sign-in, the new one in. External HM: the same pair
on /portal/settings — the rename that 067 would have misfired on landed
("Name updated.", identity card updated), wrong-current refused,
change accepted, old password refused at the GoTrue door itself
(invalid_credentials), new one working. Console probe (PostgREST as the
HM, real bearer token): self-PATCH of `role`, `status` and `email` each
refused 403/42501 with the guard's own sentence — "only your name may
be changed on your own account" — and the `full_name` positive control
returned 204, proving the probe path. Scratch world deleted; every
count verified back to the §24 baseline exactly, sessions and refresh
tokens at zero.

### One defect found live, fixed in the drive (`a8399f3`)

The suspended-session gate 500'd instead of refusing honestly. The
dashboard layout's suspended branch calls `signOut()` before its
redirect; GoTrue revocation succeeded, but `@supabase/ssr` then clears
the auth cookies, and **Next.js forbids cookie writes during render by
throwing** — so the redirect never ran and a suspended live session
navigating /app rendered the error boundary (§16-5 family: the right
refusal reported as a crash). Every prior suspension proof went through
the sign-in *action*, where cookie writes are legal; this drive was the
first to walk a live suspended session into /app. The fix is the
canonical `@supabase/ssr` `setAll` try/catch that `supabase-server.ts`
was missing — safe because the proxy refreshes sessions and a revoked
session fails `getUser()` regardless of stale cookies. Re-proven live:
the suspended HM's session now bounces to sign-in with "Your account is
suspended." named, and the portal form is unreachable.

### Phase 4 verdicts — drafted, for the founder to confirm

- **Global session revocation on password change — deferred** to an
  auth-hardening batch alongside leaked-password protection (Pro-gated).
  The success toast states today's behaviour plainly ("Other signed-in
  sessions stay active"), so the absence is spoken, not silent; the
  urgent half of a compromised-credential response is the rotation
  itself, which is now self-service at both doors.
- **Email change — deferred**, stays founder/re-invite territory per
  D2. Email is identity: it mirrors auth.users, keys invitation
  matching, and a self-service change needs GoTrue's email-change
  confirmation mail — which waits on the same Resend DNS step as every
  other send. Both settings surfaces state in place who to ask.
- **Avatar / photo — deferred** until a client asks. The initials chip
  serves identification everywhere a face would; an upload adds a
  storage surface and a moderation question with no requester.
- **Notification preferences — deferred to the notifications
  programme** (which already owns external notification emails, §22).
  Nothing sends unsolicited mail today, so there is nothing to opt out
  of; every panel states what does and does not send.
- **Self-deactivation — declined** at this scale. Status is an
  administrative power held by the org's admins and the client's own
  admin; a person who wants out asks the people who already hold the
  power, and the guard refuses self-status below those tiers by
  design (the client_admin's carried self-suspend being the one
  deliberate exception, pinned by invariant 6). Erasure joins the §14
  retention verdict as before.

Deploys `4647905` (slice) and `a8399f3` (suspended-gate fix) live.
Migration 071 applied via MCP and checked in as the numbered file. The
completion declaration for the portal-settings slice waits on the
verdicts above and on nothing else. Founder-owned, unchanged: the
Resend DNS records at Namecheap, the exposed Supabase access token,
leaked-password protection (Pro-gated), and the deferred build list
(Sentry → rate limiting → Resend → Stripe).

---

## 26. Portal-settings verdicts confirmed — the slice is complete — 2026-08-19

The founder confirmed all five §25 verdicts as drafted: global session
revocation on password change deferred to an auth-hardening batch;
email change deferred as founder/re-invite territory; avatar deferred
until a client asks; notification preferences deferred to the
notifications programme; self-deactivation declined, with the
client_admin's carried self-suspend as the one deliberate exception.
The two D4 interpretations ("non-admin" means "not an active org
admin"; the client_admin keeps their 067 status power on their own
row) stand as built.

The definition of done is met: any signed-in principal — staff or
external, pending or active — can correct their own name from their own
settings surface and see it land where names show; any active principal
can rotate a password they still know without pretending to have lost
it, behind a current-password re-verify and the same 12/4 floor as the
other three doors; what is not self-service (role, status, email,
founder columns) is refused at the database with a sentence written for
the reader, proven by 8 invariants with a verified control run and by
PostgREST probes against production; and every absence carries a
confirmed verdict. The drive also closed a §16-5-family defect nobody
had ever walked into: a live suspended session now gets its honest
refusal instead of a 500.

**The portal-settings slice is complete.** `NEXT-portal-settings.md`
deleted per its own instruction. Next migration is **072**.
Founder-owned, unchanged: the Resend DNS records at Namecheap
(invitation and recovery email upgrade the moment the domain verifies),
the exposed Supabase access token, leaked-password protection
(Pro-gated), and the deferred build list (Sentry → rate limiting →
Resend → Stripe).

---

## 27. The platform operator — built, proven live, awaiting verdict sign-off — 2026-08-19

Persona 6 of 7, first slice of the final-personas programme (plan in
`NEXT-final-personas.md`, D1–D12 confirmed; this is the A-slice, D2–D6).
One migration plus a same-session fixup (**next is 073**):

- **072 — the boolean gets a trail and a lawful read surface.**
  `is_founder` stays the boundary per D2 — no ninth role, no XOR change.
  `member_org_changed` joins the vocabulary and `audit_member_changes`
  writes it to both sides of an organisation move, names resolved at
  write time; the `users_audit` trigger now fires on `organization_id`
  at all — the one founder-only column change was the one leaving no
  record. Founder SELECT policies on `organizations` and `clients`
  (status-gated per 059), and nothing on any recruiting-data table.
- **Two authoring lessons the harness taught before production could:**
  the losing-org move event cannot name the departed member as
  `target_user_id` (the AFTER trigger runs post-move; the author guard
  rightly refuses a foreign user reference and the write was silently
  swallowed) — they ride in `detail` instead; and signup-trigger rows
  carry role `viewer` since 046, not the 002-era `recruiter` — the
  first invariant draft's role change was a no-op that correctly wrote
  no event (§5h's written-from-docs lesson, repeating).
- **`operator_invariants.sql`** — 7 invariants, clean pass: the reach
  matrix (org admin reads own org/client only, founder reads all),
  approval remembered twice (status + first-org, both attributed), the
  move remembered on both sides, founder power intact and attributed,
  waitlist triage row-audited (the deliberate exception — the waitlist
  belongs to no org, so it has no org trail to land in) and unreachable
  below the founder, the D5 mechanical negative (no recruiting-data
  policy may mention the founder predicate — checked against
  pg_policies by name, so a future migration that adds one fails
  loudly), and the suspended founder reading zero orgs. The **control
  run** removed the status-gate conjunct and aborted at INVARIANT-FAIL
  (7) with the suspended founder reading 3 org rows — including the
  real Mandate HQ row, which is exactly what the conjunct protects.

**Surfaces (`6f525c6`, `281009a`).** `platform:operate` joins the
capability vocabulary held by NO role — the proxy resolves it from
`is_founder`, pinned in tests (a customer org's admin reading false is
the assertion, not a gap). `/ops` is its own route tree with its own
chrome: overview (platform counts, pending approvals, organisations,
and the erasure-request queue rendered before its first row with
labelled sample data), accounts (every principal named to its org or
client — the 072 read policies at work), and the waitlist, relocated
with a redirect stub for old bookmarks. `/app/settings` sheds the
founder-only sections and gains a founder-visible "Platform ops" door —
the operator hat and the org-admin hat stop sharing a screen. 778
tests (from 767), tsc/lint/build green.

### Driven live on production

Scratch world: Opshold Search (org) → Orla Deverin (scratch founder,
`is_founder` set by hand per the §6 recipe — the allowlist governs
signup provisioning, not the column) → Sten Marlow (non-founder org
admin) → Perrin Vale (pending signup, viewer per the 046 default) →
Ferncliff Group (client) with Maren Ellsworth (HM external). The
founder's pass: /ops rendered true platform counts (both orgs
including Mandate HQ — the cross-org read landing); approving Perrin
from /ops activated him into Opshold Search and wrote exactly two
attributed events (member_status_changed pending→active,
member_org_changed null→Opshold Search, both with Orla as actor);
/ops/accounts named every principal to its org and the external as
"Ferncliff Group · via Opshold Search"; the waitlist SMOKE row approved
from /ops with reviewed_by stamped; the old /app/settings/waitlist
bookmark redirected. The admin's pass: no Platform ops door on
/app/settings, /ops refused by name (ACCESS DENIED · Platform
operations · from /ops), the old waitlist bookmark refused through the
same gate, and the PostgREST probe read exactly one org and one client
as the admin against both-and-both as the founder. Scratch world
deleted; every count verified to the §24 baseline exactly.

### Phase 4 verdicts — drafted, for the founder to confirm

- **Founder allowlist management UI — declined** per D2 as confirmed:
  adding an operator stays a reviewed code change mirrored in the 002
  trigger; an allowlist screen is how a compromised operator account
  mints another.
- **Impersonation ("view as user") — declined** per D5: the one power
  that would make every attribution in the trail a lie. Support cases
  needing a user's view are founder SQL plus the user's own words.
- **AI agents as principals — deferred** per D6 to its own programme
  with its own NEXT file; the 2026-08-12 founder statement stands
  recorded, and nothing today authenticates as an agent.
- **Operator MFA — joins the auth-hardening batch** (with global
  sign-out on password change and leaked-password protection): the
  operator account is the platform's highest-value credential and
  should be the first to carry a second factor when that batch runs.
- **Org creation/rename/deletion from /ops — deferred** until it is
  needed twice: onboarding a customer org is founder SQL today, rare
  and deliberate, and a screen for it would ship untested against real
  onboarding.

Deploys `6f525c6` and `281009a` live; migration 072 (+ org-move fixup)
applied via MCP and checked in. The completion declaration for the
operator persona waits on the verdicts above and on nothing else.
Founder-owned, unchanged: the Resend DNS records at Namecheap, the
exposed Supabase access token, leaked-password protection (Pro-gated),
and the deferred build list.

---

## 28. The candidate portal — built, proven live, awaiting verdict sign-off — 2026-08-20

Persona 5 of 7, the B-slice of the final-personas programme (D7–D12
confirmed). One migration plus three harness-found fixups (**next is
074**):

- **073 — the token door.** A candidate portal token anchors to
  (organization_id, identity_key) — the SQL transcription of
  candidate-identity.ts, now the third copy of that precedence, sync
  hazard stated in all three — so one link covers every row of the
  person in that org, across searches, present and future; one live
  link per person per org, reissue returns the same one. Read RPCs are
  the D8 truth table (identity and contact as held, source and notice
  date, searches as role title + stage); write RPCs are the D9 acts
  (contact correction across the whole group with the key-bearing
  fields locked and email never self-service; withdrawal to the new
  'withdrawn' stage — a withdrawal recorded as a rejection would be a
  lie; erasure requests into a queue with one-open-per-person; CV
  submission stored and trailed, with the parsed profile moving only by
  the recruiter's own deliberate upload — re-running paid parsing from
  an anonymous endpoint is an abuse surface, the D9 interpretation
  presented below). Six trail event types; anon holds nothing but the
  RPCs.
- **The harness paid for itself three times before production could:**
  `text[] || 'literal'` parses the literal as an array (array_append
  now); `candidates.pipeline_stage` carries a CHECK the first grep
  missed, so 'withdrawn' entered both vocabularies in one commit; and a
  LIMIT after a set-returning function keeps one KEY, not one row — the
  shape-pin assertion now limits rows before expanding keys.
- **`candidate_portal_invariants.sql`** — 8 invariants, clean pass:
  issuance at clients:share with the viewer refused and the same-link
  rule pinned; the context and list shapes pinned by exact key-set
  assertion (a leaked column fails by name — no client name, no score,
  no review, no fee, no other candidate); zero anon table reach; the
  group update landing on every row and never on org B's (D11: two
  orgs, two links); withdrawal once and only where aimed; erasure once;
  and the revoked-link tripwire, whose **control run** (validator
  without the revoked_at check) aborted at INVARIANT-FAIL (8) exactly.

**Surfaces (`903c9b1`, `f058273`).** `/candidate/[token]`, hard-public
like /invite: identity card with the notice status spoken, searches
with "the client behind each search stays confidential until the search
team introduces you", contact form with anchor fields visibly locked,
CV submission with the review sentence, withdrawal with a confirm, the
erasure ask with its honest caveats, one dead screen for every
dead-link state. Staff side: the portal-link affordance sits beside the
notice machinery on the candidate detail page (D10 — the notice is the
natural moment to hand over the window), one live link, copied to hand,
nothing emailed. The erasure queue lights on /ops (resolve/decline
close the ticket, not the data) and on the owning org's /app/settings
while requests are open. 778 tests, tsc/lint/build green throughout.

### Driven live on production

Quillbrook Search (org) → Sela Quintrell (recruiter) → CPO + VP Design
searches → Marlo **Fenwik** (typo'd on purpose; email-keyed, so the
name is self-service) in both. The recruiter issued the link from the
candidate page (copied, 30-day clock). The candidate, sessionless:
renamed to "Marlo Fenwick" + phone + location, landing on BOTH rows and
neither more; withdrew from VP Design only (CPO stayed shortlisted, a
second withdrawal refused); submitted a CV (stored, trailed); filed
erasure with a note. Trail: link_issued → self_updated → withdrew →
cv_submitted → erasure_requested, in order. The recruiter's
/app/settings showed "Erasure requests (1)"; the scratch founder's /ops
queue showed it with org and note, and Resolve closed it with the
founder and a resolution note on the row. A random token drew the one
dead screen. Live negative probes with the real token: the searches RPC
returns exactly added_at/project_id/role_title/stage; a second erasure
refuses with its sentence; bare-anon table reach is empty.

### Two defects found live, fixed in the drive (`f058273`)

The teardown could not delete the CV's storage row by SQL (the storage
protect trigger; the Storage API is the door), which exposed the real
defect: the upload path sat OUTSIDE the org's storage folder, so the
cvs_* policies gave the org's own staff neither read nor delete over a
candidate's submitted CV — including for erasure execution. The context
RPC now returns organization_id (shape pin updated) and the path keys
on it, from the validated token only. Re-proven live end to end: the
resubmitted CV landed under the org folder, the recruiter fetched the
real bytes (200) and deleted them lawfully via the Storage API. One
residue from the diagnosis itself: a SQL rename of the original
mis-pathed row taught that storage bytes key on the name path — ~331
bytes sit orphaned at `cvs/candidate-portal/fa9bc42f…` with no metadata
row; harmless, invisible, purgeable from the dashboard's storage view
whenever convenient. Scratch world otherwise torn down; every count
verified to baseline exactly, the three new tables at zero.

### Phase 4 verdicts — drafted, for the founder to confirm

- **CV submissions are review-first, not parse-on-arrival** — the D9
  interpretation, presented for confirmation rather than assumed: the
  file lands and is trailed, the recruiter re-uploads deliberately.
  Auto-parsing an anonymous endpoint is a paid-API abuse surface, and
  updating cv_url without re-parsing would desync profile from file.
- **Credentialed candidate login — deferred** per D7 as confirmed;
  real usage decides, the HM token→login path in miniature.
- **Client-name disclosure affordance — deferred** until a recruiter
  asks; D8's default-hidden is live, and the portal states the
  confidentiality plainly.
- **Scheduling, messaging, candidate-visible feedback — declined** at
  this scale, per D12.
- **Token TTL (30 days) and notice cadence — deferred** on the current
  defaults until they bother a real person; reissue is one click and
  returns the same link.
- **Portal rate limiting — joins the pre-launch rate-limiting item**
  (with /auth/recover): the token endpoints are anon-reachable by
  design; GoTrue does not cover them.

Deploys `21a00dc`, `903c9b1`, `f058273` live; migration 073 (+ two
fixups) applied via MCP and checked in. The completion declaration for
the Candidate persona waits on the verdicts above — and §27's operator
verdicts still await their own sign-off. Founder-owned, unchanged: the
Resend DNS records at Namecheap, the exposed Supabase access token,
leaked-password protection (Pro-gated), the deferred build list — plus
the one orphaned 331-byte storage object above.

---

## 29. Operator and Candidate verdicts confirmed — all seven personas served — 2026-08-20

The founder confirmed both verdict sets as drafted. §27, the operator:
allowlist UI declined (operators are added by reviewed code change);
impersonation declined (it would make every trail attribution a lie);
agents-as-principals deferred to its own programme with its own NEXT
file; operator MFA first in line for the auth-hardening batch; org
creation/rename/deletion from /ops deferred until needed twice. §28,
the candidate: CV submissions stay review-first, not parse-on-arrival
(the D9 interpretation stands as built); credentialed candidate login
deferred per D7, decided by real usage; the client-name disclosure
affordance deferred until a recruiter asks; scheduling, messaging and
candidate-visible feedback declined at this scale; the 30-day token TTL
and notice cadence stand until they bother a real person; portal rate
limiting joins the pre-launch rate-limiting item.

The operator's definition of done is met: the platform hat is a named
tier (`platform:operate`, held by no role) with its own house at /ops,
every operator act lands in the affected organisation's trail with the
founder as actor — including the organisation move that previously left
no record — the operator's reads stop at accounts and names (no
recruiting-data policy may so much as mention the founder predicate,
pinned mechanically), and every refusal below the tier names it.

The candidate's definition of done is met: any person a search firm
holds data on can be handed one link that shows them everything the
firm holds, corrects what is theirs to correct across every search at
once, submits a newer CV for deliberate review, withdraws from a search
under its own honest name, and asks for erasure through a queue the
owning org and the operator both see — while reading not one score,
review, note, fee, other candidate, or undisclosed client name, pinned
at the RPC layer by exact shape and proven live with a real token.

**The Mandate app Admin and Candidate personas are complete. All seven
personas are served.** The persona programme that began 2026-08-12 with
the founder's statement — every page must know who is looking at it —
closes with seven persona-scoped surfaces (recruiter portfolio, manager
desk, HM portal, client-HR portal, client-admin People view, operator
/ops, candidate token portal), each proven by invariants with control
runs and driven live on production. `NEXT-final-personas.md` deleted
per its own instruction. Next migration is **074**.

Founder-owned, unchanged: the Resend DNS records at Namecheap, the
exposed Supabase access token, leaked-password protection (Pro-gated),
the deferred build list (Sentry → rate limiting → Resend → Stripe), and
the one orphaned 331-byte storage object from §28's diagnosis.

---

## 30. The first agent principal — built, proven live, awaiting verdict sign-off — 2026-08-20

The agents-as-principals slice one, D1–D9 confirmed 2026-08-20 (plan in
`NEXT-agents-as-principals.md`). The feedback interpreter — the service
role's sharpest ambient trust, running inside the HM submit routes'
`after()` — now authenticates as a principal: a users row with role
`agent`, org-carried, credentialed, attributed, suspendable. One
migration (**next is 075**):

- **074 — role 'agent', the interpreter's grants, the boundary, the
  trail door.** `agent` joins `users_role_check` (nine values) and gets
  its own XOR branch: `organization_id NOT NULL` (an unattached agent is
  meaningless — D1), never `client_id`. The grants are RLS policies
  naming the role on exactly the pipeline's tables, enumerated from the
  code (runHmFeedbackPipeline, applyRecalibration, computeAndStoreScores,
  recordCalibrationSnapshot, loadActiveSkills — the §5h rule): projects
  SELECT+UPDATE, feedback SELECT+UPDATE, candidates SELECT,
  candidate_scores SELECT+INSERT+UPDATE, calibration_history INSERT,
  skills SELECT. Nothing else — `agent` appears in NO existing predicate
  (D2), and every policy resolves through `current_user_role()`, which
  is active-only: suspension kills reach with no clause remembering to.
  The privilege guard refuses role changes INTO and OUT OF `agent` below
  the founder. The trail grows `feedback_interpreted` and
  `record_agent_event` — narrower than `record_activity_event` in every
  direction: one event type, callable only by an ACTIVE agent, org and
  actor stamped from the session. App side: `agent` in the vocabulary
  with an EMPTY `can()` grant (capabilities are for humans), parseRole
  admits it, labels honest ("Autonomous agent. Signs in to work, never
  to look…"); the members matrix iterates a new `HUMAN_ROLES` so the
  agent gains no column in screens documenting what people can do, and
  an agent row's role picker locks with "Agent principals are managed
  from Platform ops".
- **`agent_principal_invariants.sql`** — 8 invariants, clean pass: the
  exact read/write reach (writes verified privileged), the negatives
  each by name (zero placement_fees / fee_terms / clients /
  hiring_manager_reviews / organizations / activity_events, a users read
  returning only the self row, both portal RPCs empty, and
  `record_activity_event` writing nothing for an agent), the trail event
  attributed with the review named in detail, the guard boundary (admin
  refused both directions, founder allowed), the suspended agent reading
  zero rows and refused at its own trail door, the XOR, and cross-org
  isolation. **Control run verified:** `can_read_org()` re-created with
  'agent' slipped in aborted at INVARIANT-FAIL (3) — "the agent reads 1
  clients rows" — with the positives still passing under the regression;
  diff vs. the clean pass is the one function body, rollback residue-free.

**The seam (`464f675`).** `src/lib/agents/session.ts` signs the
interpreter in from env credentials (`AGENT_INTERPRETER_EMAIL` /
`AGENT_INTERPRETER_PASSWORD`) on a throwaway client that persists
nothing; the run ends with a signOut that revokes GoTrue's ledger entry.
It verifies its own row is an ACTIVE agent before handing the session
over — a suspended agent's password grant still succeeds at GoTrue, and
running the pipeline blind would burn an Anthropic call on writes that
land nowhere. When the secret is absent or the agent refused, it returns
the reason and NOTHING else — there is deliberately no service-role
fallback; the fallback is the bug this programme removed. Both submit
doors' `after()` pipeline now runs under the agent's RLS with D5
fail-soft (the review and feedback rows are persisted by the door before
the agent is asked to think), records each landed interpretation via
`record_agent_event` with the review id, feedback id, hm_label and
recalibrated flag in detail, and threads the review id from
`persistHmSubmission` (which now returns it). `/ops` accounts grew a
third table — Agents, labelled, with §27's suspend/restore riding free.

**A latent defect the seam closed:** the service-role `after()` could
never build a client for the skill injector (`cookies()` is unavailable
there), so `loadActiveSkills` caught, returned `[]`, and every
recruiter-authored skill was SILENTLY STRIPPED from every HM-portal
interpretation since Skills Studio shipped. The agent session is passed
through `interpretFeedback`'s new options parameter (an options
parameter, not a field of `input` — `input` is serialised wholesale into
the model prompt) into the injector, whose `skills_agent_select` policy
makes the read lawful. Skills reach HM-portal interpretations for the
first time.

### The interpreter account, created by operator hand — the recipe

The §6 auth.users recipe (token columns `''`, `email_confirmed_at`,
`crypt(...,gen_salt('bf'))`, matching `auth.identities` row), then the
role flip in ONE privileged statement (the XOR demands role and org
arrive together):

```sql
update public.users
   set role = 'agent', organization_id = '<org>',
       status = 'active', full_name = 'Feedback Interpreter'
 where id = '<auth user id>';
```

Live account: `vbreygin+interpreter@gmail.com`, id `0b4b1b95-…`, org
Mandate HQ, password minted with `openssl rand`, held ONLY as the env
pair in Vercel production and `.env.local` (never committed). Rotation
is founder territory: re-`crypt()` the auth.users row and update both
env locations in one sitting. The users-count baseline is now **2** (the
founder + the interpreter — a durable principal, not scratch); the
baseline's 3 activity events are the interpreter's own creation trail.

### Driven live on production (getmandate.io, deploy `464f675`)

Scratch world INSIDE Mandate HQ — the interpreter is org-bound (D9:
one real org, operator-hand provisioning), so a scratch org's
submissions would sit outside its lawful reach by design: CTO Search
(Interpreter Drive) → Perl Ashwood (candidate, fit seeded) → HM token
for "Holt Verner". Operator: Orin Faulkes, a scratch is_founder
account, never the real founder credentials. Three acts through the
real token door:

1. **Strong-yes with a stated preference shift** ("transformation over
   regulatory") → interpretation landed with a real model summary,
   recalibration moved the weights exactly as asked (regulatory 5→2,
   transformation 5→8), scores re-ran, calibration_history's
   `changed_by` is the AGENT, and the trail shows "Feedback Interpreter
   — Interpreted hiring-manager feedback from Holt Verner and
   recalibrated the search's weights" with the review named in detail.
2. **Suspended from /ops by the operator's own click** (attributed in
   the trail) → the second submission landed (review 2, feedback row
   intact), its interpretation honestly skipped — the row stayed
   `'{}'`, no event, no agent session left behind — and the skip reason
   logged server-side by the seam's named refusal.
3. **Restored from /ops** → the third submission interpreted again.

Probe matrix with the agent's real JWT via PostgREST: the six D6
surfaces answer; placement_fees, fee_terms, clients,
hiring_manager_reviews, organizations, activity_events and the users
roster (beyond the self row) all refuse by name; both portal RPCs answer
empty; `record_activity_event` returns 204 and writes NOTHING. Teardown
to the new baseline EXACTLY (1 org, 2 users, 2 auth users, 2 projects,
1 client, 1 candidate + 1 score, 3 feedback, 4 hm_reviews, 3 hm_tokens,
3 activity_events, 0 calibration_history, 0 sessions, 0 refresh tokens,
5 skills), zero scratch residue — including the drive's member events,
which do not cascade with a project and were removed by hand.

One cosmetic observation, presented rather than fixed: /ops account
actions read "Reject / Approve" (their waitlist-era names) even on an
active agent, where the acts are suspend/restore. The founder may want
the labels contextual; the semantics are correct today.

### Phase 4 verdicts — drafted, for the founder to confirm

- **Conversion order for the remaining thirteen agents:** the ranker
  and the CV parser next — the highest-volume writers currently wearing
  the triggering human's face (right reach, wrong attribution) — then
  the candidate review agent, then the rest by usage. Each conversion
  enumerates its own grants from its own pipeline's code, per D6; none
  begins without its own NEXT-file phase.
- **Per-agent cost budgets and rate ceilings — deferred**, with one
  named exception: the HM token door triggers a paid Anthropic call
  anonymously, so the submit endpoint joins the pre-launch
  rate-limiting item (with /auth/recover and the candidate portal).
- **Secret rotation cadence — founder-hand, no fixed calendar** at one
  org and one secret; rotate on suspicion, and fold a scheduled cadence
  into the auth-hardening batch when it runs. The recipe above makes
  rotation a two-minute act.
- **Automated agent provisioning at org onboarding — deferred until the
  second customer org** (D9 stands; the operator-hand recipe is the
  provisioning story until then).
- **The metrics agent as the first cron-shaped principal — deferred**;
  D8 stands (mechanical cron stays an RPC), and when scheduled AI
  judgment arrives it enters through this programme's door as its own
  slice.

Deploys `a025445` (074 + invariants) and `464f675` (the seam) live;
migration 074 applied via MCP and checked in as the numbered file. The
completion declaration for the agents-as-principals slice waits on the
verdicts above and on the founder's written confirmation, and
`NEXT-agents-as-principals.md` is deleted only after that confirmation.
Founder-owned, unchanged: the Resend DNS records at Namecheap, the
exposed Supabase access token, leaked-password protection (Pro-gated),
the deferred build list (Sentry → rate limiting → Resend → Stripe,
joined by portal + recovery + HM-submit rate limiting), and the one
orphaned 331-byte storage object from §28's diagnosis.

---

## 31. Agent-principal verdicts confirmed — the interpreter slice is complete — 2026-08-20

The founder confirmed all five §30 verdicts as drafted: the ranker and
CV parser convert next (each with its own grant enumeration and its own
NEXT-file phase), per-agent budgets deferred with the HM submit
endpoint joining the pre-launch rate-limiting item, secret rotation
stays founder-hand with a cadence folded into the auth-hardening batch,
automated provisioning waits for the second customer org, and the
metrics agent's cron-shaped arrival waits for its own slice through
this programme's door.

The definition of done is met: the sharpest ambient trust in the
product — an AI agent making judgments on the service role's master
key — is gone. The feedback interpreter authenticates as a principal
under the same role model as every human: a users row, org-carried,
whose entire reach is six named policies enumerated from its
pipeline's code; whose every act lands in the trail under its own
name with its trigger named in detail; whose suspension is one
operator click that kills sign-ins at GoTrue and in-flight sessions at
the predicate layer while the human act that triggered it stands —
proven by 8 invariants with a verified control run, a real-JWT probe
matrix against production, and a three-act live drive torn down to
baseline exactly. The role joins no existing enumeration, holds no
capability, and navigates nowhere; the seam has no service-role
fallback to quietly regress into. Along the way the slice closed a
defect nobody had seen: recruiter-authored skills, silently stripped
from every HM-portal interpretation since Skills Studio shipped, now
reach the interpreter lawfully through its own grant.

**The agents-as-principals interpreter slice is complete.** The
founder's 2026-08-12 statement — agents authenticate as principals,
not ambient trust — is no longer a plan; one of fourteen agents lives
under it, and the other thirteen have a proven pattern to follow.
`NEXT-agents-as-principals.md` deleted per its own instruction. Next
migration is **075**.

Founder-owned, unchanged: the Resend DNS records at Namecheap, the
exposed Supabase access token, leaked-password protection (Pro-gated),
the deferred build list (Sentry → rate limiting → Resend → Stripe,
joined by portal + recovery + HM-submit rate limiting), and the one
orphaned 331-byte storage object from §28's diagnosis.

---

## 32. Access provisioning — decided: admin-driven now, purchase-provisioned at self-serve launch — 2026-08-20

Asked and decided before the ranker slice opened: should access be
"driven from Supabase" with admins assigning it, or self-set-up at
purchase? The answer is both, sequenced — and the sequencing is the
decision:

- **Now, and for the first clients: access stays admin-driven,
  exactly as built.** All access lives in `users` rows (status, role,
  the org/client XOR) enforced by RLS. The operator approves signups
  and assigns organisations from /ops; each org's own admins promote
  members from viewer upward; externals arrive by invitation only;
  candidates by token only. Creating a customer org is founder SQL per
  the §27 verdict (screen deferred until needed twice). At this scale
  deliberate onboarding is a feature, and it is the model every
  invariant pins.
- **At self-serve launch (with Stripe): the purchase mints the org.**
  The buyer's checkout creates the organisation and makes the buyer
  its FIRST ADMIN — after which access within the org is admin-assigned
  forever, same as today. Nobody buys their way into someone else's
  org. Billing state belongs on `organizations` (a subscription column
  gating at the proxy the way `status` gates today), never on
  individual users.
- **Ordering constraint, stated:** self-serve provisioning waits for
  its floor — Stripe, rate limiting + captcha on the public forms,
  Sentry, Resend — i.e. it is the far end of the deferred build list,
  not a queue-jump. And when it lands, the deferred "automated agent
  provisioning at org onboarding" verdict (§30) comes due in the same
  slice: a purchase-minted org needs its agent principals minted with
  it.

---

## 33. The ranker becomes a principal — built, proven live, awaiting verdict sign-off — 2026-08-20

Slice two of agents-as-principals (plan in `NEXT-agent-ranker.md`,
D1–D8 confirmed 2026-08-20). The highest-volume writer wearing a human
face — every scoring run executed in the triggering human's session —
now runs as its own principal. One migration (**next is 076**):

- **075 — the trail only.** `candidates_ranked` joins the vocabulary
  and `record_agent_event`'s allowlist; per D2 the ranker adds NO table
  grants — everything scoring touches was already named in 074's pool,
  whose authority is identical across kinds by slice one's D1. The
  allowlist is the forgery boundary.
- **`agent_ranker_invariants.sql`** — 5 invariants, clean pass: the
  ranker's attribution (actor, label, trigger named in detail), the
  negative matrix re-run for a SECOND principal, the INDEPENDENT kill
  switch (ranker suspended → ranker reads nothing and its door
  refuses, while the interpreter still reads and still records — the
  D1 proof), the forgery boundary (a recruiter refused by role, an
  unknown event type refused by name), and two-distinct-actors +
  cross-org isolation. One harness authoring error caught and kept as
  a comment: the first draft expected the interpreter to read 2
  projects where org A holds exactly 1 — bad arithmetic, not a
  regression. **Control run verified:** `record_agent_event` re-created
  WITHOUT its `is_agent()` gate aborted at INVARIANT-FAIL (4) — "a
  recruiter recorded candidates_ranked" — with invariants 1–3 passing
  under the regression; diff is the one function body, rollback
  residue-free.

**The seam (`2f53beb`).** `signInRankingAgent()` beside the
interpreter's (shared core, its own env pair `AGENT_RANKER_EMAIL` /
`AGENT_RANKER_PASSWORD` — D1's own kill switch). `runRankerScoring`
(src/lib/ranking/agent-ranker.ts) signs in, scores under the role's
named grants, records ONE `candidates_ranked` event per run that wrote
something — trigger, scored/moved/new counts in detail — and signs out
persisting nothing. All four human-session call sites converted:

1. The ranking page's initial score — which, stated honestly, a
   VIEWER's first visit could never lawfully run before (the
   candidate_scores INSERT needs candidates:write, which org:read does
   not carry; the silent catch hid it). Any first visitor now gets a
   lawful score.
2. The "Refresh scores" CTA — the one surface a human explicitly asks,
   so the one surface a refused ranker speaks: the §11 action-error
   contract carries "The Ranking Agent could not run — an operator has
   suspended it or its credentials are absent. Existing scores stand."
3. The network-copy `after()` re-score — previously built its client
   from whatever the triggering recruiter's cookies gave that context
   (D6's verification: Next 16 request APIs inside a server action's
   after() bind to the human's session where they resolve at all), so
   the run wore the recruiter's face when it ran. Now the ranker's,
   with `new_candidate` as the named trigger.
4. The calibration restore — trigger `weights_edit`, "Restored from
   calibration history".

Per D4's boundary, recalibration re-scoring stays under the
INTERPRETER (its act, already named in `feedback_interpreted` detail —
no double event). Live account: `vbreygin+ranker@gmail.com`, id
`c11544db-…`, Mandate HQ, §30 recipe; credentials in Vercel production
and `.env.local`. The durable users baseline is now **3** (founder,
interpreter, ranker); the baseline trail is 6 events — both agents'
creation records.

### Driven live on production (getmandate.io, deploy `2f53beb`)

Scratch world inside Mandate HQ: CRO Search (Ranker Drive) → Wren
Calloway + Sable Norwich (fit seeded, NO score rows) → HM token →
Orin Faulkes, scratch operator. Three acts:

1. **First ranking-page visit** → both candidates scored under the
   RANKER (Wren 6.4 / rank 1, Sable 6.2 / rank 2), one
   `candidates_ranked` event with actor "Ranking Agent", trigger
   scoring_run, scored 2 / new 2 — and zero agent sessions left
   behind.
2. **Suspended from /ops (the ranker's own row)** → the Refresh CTA
   refused with the D5 sentence verbatim, captured from the browser
   console's ActionFailure; nothing written, no event. Same breath:
   an HM token submission → the INTERPRETER, untouched, interpreted
   AND recalibrated (domain 5→8, technical 5→3, exactly the HM's
   stated preference), its own re-score riding its own session per
   D4 — kill-switch independence proven live, not just in the
   harness.
3. **Restored from /ops** → Refresh ran under the ranker, the second
   event landed, and the leaderboard showed the recalibrated order
   (Sable 6.42 over Wren 6.23).

Probe matrix with the ranker's real JWT via PostgREST: the role's
tables answer; placement_fees, fee_terms, clients,
hiring_manager_reviews, organizations, activity_events and the roster
beyond self all refuse; portal RPCs empty; `record_activity_event`
204s and writes nothing. Teardown to the pre-drive baseline exactly —
the one surviving session is the founder's own live browser sign-in,
deliberately untouched.

### Phase 4 verdicts — drafted, for the founder to confirm

- **The CV parser opens as slice three** — the first conversion that
  must ADD grants: `candidates` UPDATE (writing cv_structured) and a
  storage read under the org folder, each with its own enumeration and
  invariants, including the negative that an agent can parse a CV but
  never delete one.
- **"Scores as of <time>" on the ranking page — deferred.** The header
  already shows "Computed HH:MM UTC" and rank_changed_at dates every
  movement; a staleness banner would invent urgency the data does not
  claim. Revisit only if a suspended ranker confuses a real recruiter.
- **/ops agent rows stay label-plain — deferred.** Two agents read
  fine as two named rows; an agent_kind chip adds vocabulary the
  operator doesn't need until the roster grows past a screen.
- **The /ops action labels ("Reject / Approve" on active accounts) —
  presented again**, unchanged from §30's observation, now twice as
  visible with two agents: the acts are suspend/restore and the
  buttons still wear waitlist-era names. One small relabel whenever
  the founder wants it; semantics correct today.

Deploy `2f53beb` live; migration 075 applied via MCP and checked in as
the numbered file. The completion declaration for the ranker slice
waits on the verdicts above and the founder's written confirmation;
`NEXT-agent-ranker.md` is deleted only after that. Founder-owned,
unchanged: the Resend DNS records at Namecheap, the exposed Supabase
access token, leaked-password protection (Pro-gated), the deferred
build list (Sentry → rate limiting → Resend → Stripe, with portal +
recovery + HM-submit rate limiting), and the one orphaned 331-byte
storage object.

---

## 34. Ranker verdicts confirmed — the ranker slice is complete — 2026-08-20

The founder confirmed all four §33 verdicts as drafted: the CV parser
opens as slice three (the first conversion that must ADD grants —
candidates UPDATE and the org-folder storage read, with the
parse-but-never-delete negative pinned in its own invariants); the
"scores as of" staleness banner deferred (the header's computed time
and rank_changed_at already say what is true); /ops agent rows stay
label-plain until the roster outgrows a screen; and the /ops
"Reject / Approve" relabel to Suspend / Restore stays a founder-timed
cosmetic, semantics correct today.

The definition of done is met: the product's highest-volume writer no
longer wears a human face. Every scoring run — the first visit's
read-repair, the deliberate refresh, the background re-score after a
network copy, the post-restore recompute — signs in as the Ranking
Agent, works under the role's named grants, lands one trail event with
its trigger named, and leaves no session behind. A refused ranker
degrades one leaderboard refresh with a sentence a human reads; it
never eats the click, the copy, or the restore that asked. The
operator holds a kill switch per agent, proven live: ranking suspended
while feedback interpretation ran untouched — one row's status, one
agent's silence, nobody else's. Slice one built the shape; slice two
proved the shape REPEATS — one small migration, one seam file, one
account, one drive — which is the fact the remaining twelve
conversions now rest on. Two quiet honesty dividends shipped with it:
a viewer's first ranking-page visit can finally score lawfully, and
the network-copy re-score stopped borrowing whatever cookies survived
its after().

**The agents-as-principals ranker slice is complete.** Two of fourteen
agents now authenticate as principals; the pattern is proven
repeatable. `NEXT-agent-ranker.md` deleted per its own instruction.
Next migration is **076**; the CV parser's Phase 0 opens on the
founder's word.

Founder-owned, unchanged: the Resend DNS records at Namecheap, the
exposed Supabase access token, leaked-password protection (Pro-gated),
the deferred build list (Sentry → rate limiting → Resend → Stripe,
with portal + recovery + HM-submit rate limiting), and the one
orphaned 331-byte storage object from §28's diagnosis.

---

## 35. The CV parser becomes a principal — built, proven live, awaiting verdict sign-off — 2026-08-20

Slice three of agents-as-principals (plan in `NEXT-agent-cv-parser.md`,
D1–D9 confirmed 2026-08-20). The judgment that reads a person's CV and
writes their identity now signs its own name. One migration (**next is
077**):

- **076 — the pool's first widening, by exactly one surface.**
  `candidates_agent_update` (the parser persists what it concluded —
  profile, fit, and the identity columns it overwrites), plus
  `candidate_parsed` in the vocabulary and the `record_agent_event`
  allowlist. NO storage policy, and none needed: both call sites hold
  the file bytes in memory at parse time, so the seam takes bytes and
  the agent never touches storage — the §33 storage-read guess,
  corrected by the code at Phase 0 (the §5h rule doing its job on a
  VERDICT for the first time).
- **`agent_cv_parser_invariants.sql`** — 5 invariants, clean pass: the
  parser's profile AND identity writes attributed with the trigger
  named; the third principal's negative matrix; **parse-never-delete
  pinned twice** — by effect (a DELETE landing on zero rows, zero
  storage reach with a real object present) and mechanically (no
  storage.objects policy may mention is_agent(), the §27 D5 shape, so
  a future storage grant fails loudly); the allowlist at three; and
  three-way kill-switch independence. **Control run verified:**
  `can_write_candidates()` with 'agent' slipped in aborted at
  INVARIANT-FAIL (3) — "the parser deleted a candidate" — the
  write-side enumeration regression caught by the exact reach it would
  smuggle in.

**The seam (`d9a964b`).** `runCvParseAndPersist` splits at judgment
(D2): the recruiter keeps the file choice, the placeholder row, and
every storage act; the agent signs in, runs the model call with Skills
Studio riding its own session, persists the conclusions, records one
`candidate_parsed` event per landed parse, and signs out persisting
nothing. D5 fail-soft: a refused parser leaves the upload SUCCEEDED —
file stored, row standing, `cv_parse_error` carrying the agent-named
sentence rendered by the candidate page's existing failure banner; a
real parse failure keeps today's error contract, written by the agent
that failed, with no trail event (a log line, not history). Both call
sites converted; `parseCv` gained the `skillClient` options parameter
(interpretFeedback's shape — never a field of the serialised input).
Live account: `vbreygin+cvparser@gmail.com`, id `106a6551-…`, Mandate
HQ, §30 recipe; credentials in Vercel production and `.env.local`.
Durable baseline: **4 users**, **9 trail events** (three agents' full
creation records).

### Driven live on production (getmandate.io, deploy `d9a964b`)

Scratch world inside Mandate HQ: CDO Search (Parser Drive) with
calibration and company context; a hand-built fixture PDF (a fictional
"Avery Penhallow" CV); Orin Faulkes, scratch operator. Three acts
through the real upload form — whose copy, it turns out, already
promised "The CV Parsing Agent will extract…" before the agent
existed; the label is finally true:

1. **Upload** → the model read the PDF and extracted the real identity
   (Avery Penhallow, avery.penhallow@example.com, VP Data Platforms at
   Meridian Grid, archetype "Transformer", fit_dimensions present),
   the file landed under the org path, and the trail carried
   `candidate_parsed` with actor "CV Parsing Agent", trigger upload,
   identity_changed true. Zero agent sessions left behind.
2. **Suspended from /ops** → the second upload SUCCEEDED as D5
   promises: file stored, row standing under its filename fallback,
   `cv_parse_error` carrying the exact sentence, rendered in the
   failure banner (screenshot in the drive record), no profile, no
   event — and in the same breath the RANKER scored the first
   candidate on a ranking-page visit, three-way kill-switch
   independence live.
3. **Restored from /ops** → a third upload parsed fully; the second
   `candidate_parsed` event landed.

Probe matrix with the parser's real JWT via PostgREST: reads answer;
the 076 UPDATE grant proven by a lawful PATCH; the DELETE landed on
zero rows; clients, reviews, organizations, events, fees, the roster
beyond self, and a storage list over a folder with real files all
refused or answered empty. Teardown: the three drive CVs deleted
lawfully via the Storage API as an org principal (the protect trigger
refuses SQL, as designed), rows to baseline — with one teardown
honesty note: the residue filter's time cutoff caught the parser's own
CREATION status event (written at 14:41, inside the drive window) and
deleted durable history; caught by the baseline diff, reconstructed by
hand with the original timestamp and detail. The lesson, recorded:
residue filters key on the drive's SCRATCH ids, never on a time
window that can contain a durable row's birth.

### One affordance gap, found live

The parse-failure banner tells the recruiter to "retry when the agent
is restored" — but offers no retry control; the only retry is a fresh
upload. The sentence writes a cheque the UI doesn't cash. Presented as
a verdict below rather than fixed unbidden.

### Phase 4 verdicts — drafted, for the founder to confirm

- **Slice four: the Candidate Review / Evaluation agent** — the next
  AI judgment wearing a human face (generate-evaluation runs in the
  recruiter's session), and a read-mostly conversion by first look;
  its Phase 0 enumerates as always. Alternative orderings (the digest
  writer, the sourcing agents) wait unless the founder prefers one.
- **A one-click "Retry parse" on the failure banner — recommended**
  now that the failure can name a suspended agent and the file is
  already stored: a small action that re-reads the stored bytes (the
  recruiter's lawful storage read) and hands them to the seam. Without
  it, D5's sentence promises a retry the UI makes the recruiter
  re-upload for.
- **Model/version stamping in agent event details — deferred** until
  an audit asks; the trail names who and what, and the model id is one
  grep away in the seam for any given deploy.
- **The /ops Suspend/Restore relabel — standing**, third surfacing,
  now visible on three agent rows.

Deploy `d9a964b` live; migration 076 applied via MCP and checked in as
the numbered file. The completion declaration for the CV parser slice
waits on the verdicts above and the founder's written confirmation;
`NEXT-agent-cv-parser.md` is deleted only after that. Founder-owned,
unchanged: the Resend DNS records at Namecheap, the exposed Supabase
access token, leaked-password protection (Pro-gated), the deferred
build list (Sentry → rate limiting → Resend → Stripe, with portal +
recovery + HM-submit rate limiting), and the one orphaned 331-byte
storage object.

---

## 36. CV-parser verdicts confirmed — the parser slice is complete — 2026-08-20

The founder confirmed all four §35 verdicts as drafted: the Candidate
Review / Evaluation agent opens as slice four (its Phase 0 enumerates
from generate-evaluation's code when the founder says go); the
one-click "Retry parse" on the failure banner is ACCEPTED as follow-up
build — a small action re-reading the stored bytes under the
recruiter's lawful storage read and handing them to the seam, so D5's
sentence stops writing a cheque the UI doesn't cash (first act of
slice four's session, or sooner on request); model/version stamping in
agent event details deferred until an audit asks; the /ops
Suspend/Restore relabel stays founder-timed.

The definition of done is met: the judgment that reads a person's CV
and writes their identity — their name, their email, what the firm
believes about their fit — no longer wears the uploading recruiter's
face. The parse signs in as its own principal, holds exactly one grant
more than the pool had (candidates UPDATE, enumerated from code after
the code corrected a confirmed verdict's guess — no storage, no
delete, both pinned twice), lands one trail event per conclusion with
its trigger named, and fails the D5 way: the file always lands, the
profile says why it is empty in the agent's own name, and the human
retries against a restored agent instead of a silent void. Three
uploads on production proved the three states; the third principal's
probe matrix held; the teardown caught and corrected its own filter's
overreach against durable history, and the lesson is in the traps.

**The agents-as-principals CV-parser slice is complete.** Three of
fourteen agents now authenticate as principals — the interpreter, the
ranker, the parser — each with its own credential, its own kill switch
proven independent, and its own name in the trail. The pattern has
now survived a slice that widens authority, not just one that reuses
it. `NEXT-agent-cv-parser.md` deleted per its own instruction. Next
migration is **077**; slice four's Phase 0 opens on the founder's
word.

Founder-owned, unchanged: the Resend DNS records at Namecheap, the
exposed Supabase access token, leaked-password protection (Pro-gated),
the deferred build list (Sentry → rate limiting → Resend → Stripe,
with portal + recovery + HM-submit rate limiting), and the one
orphaned 331-byte storage object from §28's diagnosis.

---

## 37. The evaluator becomes a principal — built, proven live, awaiting verdict sign-off — 2026-08-20/21

Slice four of agents-as-principals (plan in `NEXT-agent-evaluator.md`,
D1–D8 confirmed 2026-08-20). One migration (**next is 078**):

- **077 — vocabulary only.** `candidate_evaluated` + its allowlist
  admission; zero table grants (the 074/076 pool covers the pipeline).
  **`agent_evaluator_invariants.sql`** — 4 invariants, clean pass: the
  spread-preserving write with the PARSER's fields intact (the D6 pin,
  asserted by effect where RLS cannot express jsonb-key discipline);
  the fourth principal's negative matrix; the forgery boundary in BOTH
  directions (the agent door refuses by role, the HUMAN door refuses
  the agent's event type by name); four-way kill-switch independence.
  **Control run verified:** `record_activity_event` admitting
  `candidate_evaluated` aborted at INVARIANT-FAIL (3) — a recruiter
  forging the evaluator's conclusion through the human intent door.

**The seam (`b16560e`).** `ensureCandidateEvaluation` signs in the
Evaluation Agent per run and returns a typed result; the profile
page's render-built client and its after()-cookie caveat — the FOURTH
occurrence — are deleted, not worked around, and any visitor's
cache-miss (a viewer included, who could never persist the write
before) now generates lawfully. Per D5 the regenerate flow lost its
pre-clear: the old report stands until the single spread-preserving
write replaces it. One event per LANDED evaluation, trigger named
(profile_view / regenerate). Live account:
`vbreygin+evaluator@gmail.com`, id `900ea788-…`, §30 recipe;
credentials in Vercel production and `.env.local`. Durable baseline:
**5 users, 12 trail events** (four agents' creation records).

### Driven live on production (deploys `b16560e`, `66dbf74`)

Scratch world inside Mandate HQ: CFO Search (Evaluator Drive) →
Nerissa Coldwell (parser-shaped profile seeded) → Orin Faulkes,
scratch operator. The acts:

1. **Profile visit on a cache miss** → the evaluation generated in
   after() under the EVALUATOR (a live agent session visible
   mid-generation, gone after signOut), landed with parser fields
   intact, event trigger profile_view. **Regenerate** → fresh
   generated_at, second event, trigger regenerate.
2. **Suspended from /ops** → Regenerate refused with its sentence
   captured verbatim from the live toast ("…The existing report
   stands.") and the report SURVIVED byte-identical (same
   generated_at, no third event) — D5 proven live. **Restored** → the
   regenerate landed (one observation: the browser's fetch dropped the
   long-running action POST with "Failed to fetch" while the server
   completed the work — the act landed, the toast lied by omission;
   recorded as an observation on long server actions, not a defect of
   the slice).
3. **The D7 retry-parse acts — which caught a real defect.** The first
   suspended-parser upload showed the D5 sentence but NO Retry button:
   the refused-upload path never wrote `cv_url`, so the row didn't
   know where its file was and the §35 gap had reopened one door down.
   Fixed (`66dbf74`: the refusal branch records cv_url like the
   network-copy branch always did), redeployed, re-driven end to end:
   upload under a suspended parser → banner WITH the button → retry
   refused with the "still unavailable" sentence → parser restored →
   **Retry Parse parsed from the STORED file** — identity extracted,
   error cleared, event trigger `retry`, exactly one storage object
   (no re-upload). The button's promise, cashed and proven.

Probe matrix with the evaluator's real JWT: pool reads answer;
clients, reviews, organizations, events, fees, roster-beyond-self,
candidates DELETE (zero rows), and portal RPCs all refuse. Teardown to
baseline exactly ON THE FIRST PASS — residue keyed on scratch ids
only, per the §35 lesson, and no durable history was touched.

### Phase 4 verdicts — drafted, for the founder to confirm

- **Slice five: the candidate-intelligence cluster opens with the
  Positioning agent** (runPositioning — the next judgment writing what
  the firm says ABOUT a person to a client), with candidate research /
  triangulation / psychology following in that cluster's own order;
  the desk digest writer waits behind them.
- **Long-action honesty — recommended small fix**: Regenerate (and any
  ~90s action) can outlive the browser's patience; move the toast to
  optimistic "Regenerating — this takes about a minute" or poll, so a
  dropped fetch stops reading as failure while the work lands.
- **Evaluation staleness note — deferred** until a recruiter asks;
  generated_at is on the report and the Regenerate button is one
  click.
- **The /ops Suspend/Restore relabel — standing**, fourth surfacing.

Deploys `b16560e` and `66dbf74` live; migration 077 applied via MCP
and checked in. The completion declaration waits on the verdicts above
and the founder's written confirmation; `NEXT-agent-evaluator.md` is
deleted only after that. Founder-owned, unchanged: the Resend DNS
records, the exposed Supabase access token, leaked-password protection,
the deferred build list (with the rate-limiting bundle), and the
orphaned 331-byte storage object.

---

## 38. Evaluator verdicts confirmed — the evaluator slice is complete — 2026-08-21

The founder confirmed all four §37 verdicts as drafted: slice five
opens with the Positioning agent, leading the candidate-intelligence
cluster (research, triangulation, psychology follow in the cluster's
own order; the digest writer waits behind them); the long-action
honesty fix is ACCEPTED as follow-up build — an optimistic toast or
poll on Regenerate-class actions so a dropped fetch stops reading as
failure while the work lands (first act of slice five's session, or
sooner on request); the evaluation-staleness note stays deferred until
a recruiter asks; the /ops Suspend/Restore relabel stays founder-timed.

The definition of done is met: the judgment that writes what the firm
believes about a candidate signs its own name. Every evaluation — a
visitor's cache-miss, a deliberate regenerate — runs as the Evaluation
Agent under the pool's existing grants, lands one trail event with its
trigger named, preserves every field the parser wrote, and fails the
D5 way: a refused evaluator surfaces a sentence and destroys nothing,
proven live with a byte-identical surviving report. The slice also
deleted the after()-cookie caveat's fourth occurrence instead of
working around it, let a viewer's visit persist an evaluation for the
first time, and — through its D7 acts — caught, fixed and re-proved
the Retry-parse button's missing cv_url key, so the §36-accepted
affordance now works end to end from the stored file.

**The agents-as-principals evaluator slice is complete.** Four of
fourteen agents now authenticate as principals — interpreter, ranker,
parser, evaluator — with four independent kill switches proven live
and a trail that names every judgment's author and trigger.
`NEXT-agent-evaluator.md` deleted per its own instruction. Next
migration is **078**; the Positioning agent's Phase 0 opens on the
founder's word.

Founder-owned, unchanged: the Resend DNS records at Namecheap, the
exposed Supabase access token, leaked-password protection (Pro-gated),
the deferred build list (Sentry → rate limiting → Resend → Stripe,
with the rate-limiting bundle), and the one orphaned 331-byte storage
object from §28's diagnosis.

---

## 39. The positioner becomes a principal — built, proven live, awaiting verdict sign-off — 2026-08-21

Slice five of agents-as-principals (plan in
`NEXT-agent-positioning.md`, D1–D8 confirmed 2026-08-21), opening the
candidate-intelligence cluster. The session also shipped the
§38-accepted long-action honesty fix first, as its own commit
(`f54f1e7`): Regenerate-class actions now show an optimistic toast
("Regenerating — this takes about a minute") and a transport-level
drop (TypeError only — anything the server answered still reads as
failure) switches to polling the evaluation's generated_at stamp, so
a dropped fetch stops reading as failure while the work lands. One
migration (**next is 079**):

- **078 — vocabulary only, as Phase 0 predicted from the code.**
  `candidate_positioned` + its allowlist admission (five types); zero
  table grants — the 074/076 pool covers the whole pipeline, and the
  kit write travels through `update_cv_structured_field` (021), which
  is SECURITY INVOKER and resolves to the pool's candidates UPDATE
  under the agent's own RLS. The CHECK rebuild carried the LIVE list
  read from pg_constraint (identical to 077's file) plus the new value.
  **`agent_positioning_invariants.sql`** — 5 invariants, clean pass:
  the kit landing through the RPC with the parser's fields AND the
  evaluator's report intact (the D7 pin); the RPC write org-bound
  under the agent; the fifth principal's negative matrix; the forgery
  boundary both directions; five-way kill-switch independence.
  **Control run verified (novel per slice):**
  `update_cv_structured_field` re-created as SECURITY DEFINER — the
  realistic drift for the first RPC-mediated agent write — aborted at
  INVARIANT-FAIL (2) "the cross-org RPC write did not raise under the
  agent", with invariant 1 passing under the regression; restored,
  `prosecdef` verified false, clean pass re-verified, residue-free.

**The seam (`90f050f`).** `signInPositioningAgent` beside the four
existing (own env pair `AGENT_POSITIONING_EMAIL` / `_PASSWORD` — D1's
own kill switch). `runPositioningAndPersist` splits at judgment: the
recruiter's action keeps the gate and the ownership assertion; the
agent reads its inputs (projects, candidate, last-10 feedback), runs
the skill-injected model call — the skill client rides
`RunPositioningContext`, never the serialised input — persists
`positioning_kit` through the RLS-bound RPC, records ONE
`candidate_positioned` event with the trigger named
(generate / regenerate) and `replaced_existing` in detail, and signs
out persisting nothing. Per D5 there is no pre-clear anywhere: the
old kit stands until the single key replace lands. Live account:
`vbreygin+positioning@gmail.com`, id `b9597207-…`, Mandate HQ, §30
recipe; credentials in Vercel production and `.env.local`. Durable
baseline: **6 users, 15 trail events** (five agents' creation
records).

### Driven live on production (deploy `qzim1s394` = `90f050f`)

Scratch world inside Mandate HQ (prefix `07800000` for the harness,
`0d4` for the drive): CMO Search (Positioning Drive) → Maren Osgood
(parser-shaped profile + evaluator report seeded, NO kit) → Orin
Faulkes, scratch is_founder operator. Three acts:

1. **Generate kit** → the model wrote a real kit (3 pitches, 3
   emails) in ~60s; it landed with the EVALUATOR's report intact,
   one `candidate_positioned` event with actor "Positioning Agent",
   trigger generate, replaced_existing false — and zero agent
   sessions left behind.
2. **Suspended from /ops by the operator's own click** (attributed in
   the trail) → Regenerate refused with the D5 sentence captured
   verbatim from the live toast ("The Positioning Agent could not run
   — an operator has suspended it or its credentials are absent. The
   existing kit stands.") and the kit SURVIVED byte-identical (same
   generated_at, no event, no session).
3. **Restored from /ops** → Regenerate landed in 48s: fresh
   generated_at, second event with trigger regenerate and
   replaced_existing true, the evaluation still intact, zero
   sessions.

Probe matrix with the positioner's real JWT via PostgREST: the pool
answers (projects, candidates, feedback, skills, candidate_scores);
clients, hiring_manager_reviews, organizations, activity_events,
placement_fees, fee_terms and the roster beyond self all refuse;
candidates DELETE landed on zero rows with the row surviving;
portal_context empty; `record_activity_event` 204'd and wrote
NOTHING; an unknown event type refused by name at the agent door.
Sign-out revoked the probe session. **Teardown to baseline exactly ON
THE FIRST PASS** — residue keyed on scratch ids only (candidate,
project, operator target/actor), the positioner's creation trail
untouched, the one surviving session the founder's own live browser
sign-in. No defect found live — the first drive of the programme to
close clean.

### Phase 4 verdicts — drafted, for the founder to confirm

- **Slice six: candidate research (`runCandidateResearch`) next** in
  the candidate-intelligence cluster — it feeds triangulation, so it
  goes first; triangulation then psychology follow, each with its own
  Phase 0 on the founder's word. The digest writer stays behind the
  cluster.
- **Long-action honesty on the positioning panel — deferred.** The
  drive's two generations ran 48–60s and no fetch dropped; the
  f54f1e7 stamp-poll pattern extends naturally (the kit carries
  generated_at) if a drop is ever observed live. Not built unbidden.
- **The /ops Suspend/Restore relabel — standing, fifth surfacing**,
  and the drive added a new face to it: suspending an active agent
  toasts "Positioning Agent rejected." — the waitlist-era verb now
  lives in the confirmation too, on five agent rows.
- **Model/version stamping in agent event details — still deferred**
  until an audit asks (unchanged from §35).

Deploys `qzim1s394` (the seam) and `a7uqfytdq` (the long-action fix +
Phase 0 doc) live; migration 078 applied via MCP and checked in as the
numbered file. The completion declaration for the positioning slice
waits on the verdicts above and the founder's written confirmation;
`NEXT-agent-positioning.md` is deleted only after that.

Founder-owned, unchanged: the Resend DNS records at Namecheap, the
exposed Supabase access token, leaked-password protection (Pro-gated),
the deferred build list (Sentry → rate limiting → Resend → Stripe,
with the rate-limiting bundle), and the one orphaned 331-byte storage
object from §28's diagnosis.

---

## 40. Positioner verdicts confirmed — the positioning slice is complete — 2026-08-21

The founder confirmed all four §39 verdicts as drafted: candidate
research opens as slice six (it feeds triangulation, so it leads the
cluster's remaining order — triangulation then psychology, each with
its own Phase 0); the positioning panel's long-action fix stays
deferred until a drop is observed live; model/version stamping stays
deferred until an audit asks; and the /ops Suspend/Restore relabel —
standing since §30, surfaced five times — was TIMED with the same
breath: "do the /ops relabel." It ships in this session as its own
commit.

The definition of done is met: the judgment that writes what the firm
says ABOUT a person to a client — the pitches, the emails, the
positioning summary — signs its own name. Every kit runs as the
Positioning Agent under the pool's existing grants, lands one trail
event with its trigger named, preserves every neighbouring field (the
parser's profile, the evaluator's report — pinned by invariant), and
fails the D5 way: a refused positioner surfaces its sentence and the
existing kit stands byte-identical, proven live. The slice's novel
surface — the first agent write mediated by an RPC — got its own
control run: SECURITY DEFINER drift on `update_cv_structured_field`
is caught by name the moment it lands. The drive closed clean, the
first of the programme to find no defect, and the teardown hit
baseline exactly on the first pass.

**The agents-as-principals positioning slice is complete.** Five of
fourteen agents now authenticate as principals — interpreter, ranker,
parser, evaluator, positioner — with five independent kill switches
proven live and a trail that names every judgment's author and
trigger. `NEXT-agent-positioning.md` deleted per its own instruction.
Next migration is **079**; candidate research's Phase 0 opens now on
the founder's word ("proceed").

Founder-owned, unchanged: the Resend DNS records at Namecheap, the
exposed Supabase access token, leaked-password protection (Pro-gated),
the deferred build list (Sentry → rate limiting → Resend → Stripe,
with the rate-limiting bundle), and the one orphaned 331-byte storage
object from §28's diagnosis.

---

## 41. The researcher becomes a principal — built, proven live, awaiting verdict sign-off — 2026-08-21

Slice six of agents-as-principals (plan in `NEXT-agent-research.md`,
D1–D8 confirmed 2026-08-21). The judgment that searches the public web
for a person and writes a dossier about them now signs its own name.
One migration (**next is 080**):

- **080 is next; 079 shipped vocabulary only**, as Phase 0 predicted:
  `candidate_researched` + the allowlist at six; zero table grants
  (the pool covers the pipeline; the kit write rides the 021 RPC; the
  web_search tool is Anthropic-side and adds no database authority).
  **`agent_research_invariants.sql`** — 5 invariants, clean pass: the
  dossier landing with ALL prior agents' fields intact; the
  history-intact pin (all six agent event types recorded and COUNTED);
  the sixth principal's negative matrix; the forgery boundary both
  directions; six-way kill-switch independence. **Control run
  verified (novel per slice), with a discovery:** the CHECK re-created
  from 077's stale file plus the new value (candidate_positioned
  silently dropped — the standing trap's exact drift) was NOT caught
  by the exception gate, because `write_activity_event` never raises
  by 053's design — under a stale CHECK, prior slices' events do not
  error, they VANISH with only a server-side WARNING. The first
  control-run draft omitted the count gate and the regression sailed
  through — proof by demonstration. The count gate is therefore THE
  tripwire, and the harness aborted at INVARIANT-FAIL (2) "5 of 6
  history probes landed — the vocabulary lost a prior slice's event
  type SILENTLY". Constraint restored and verified, clean pass re-run,
  zero residue.

**The seam (`117212f`).** `signInCandidateResearchAgent` beside the
five existing (own env pair `AGENT_RESEARCH_EMAIL` / `_PASSWORD`).
`runCandidateResearchAndPersist` splits at judgment: the recruiter's
action keeps the gate and the ownership assertion; the agent reads
the candidate and project, runs the web_search-carrying model call
(max 7 searches; skill client rides ctx; suspension refuses at
sign-in, BEFORE any web search or Anthropic spend), persists
`candidate_intelligence` through the RLS-bound RPC, records one
`candidate_researched` event with the trigger (research / re_research)
and `sources_count` in detail, and signs out persisting nothing. Per
D5 no pre-clear. Live account: `vbreygin+research@gmail.com`, id
`f50705ea-…`, Mandate HQ, §30 recipe; credentials in Vercel
production and `.env.local`. Durable baseline: **7 users, 18 trail
events** (six agents' creation records).

### Driven live on production (deploy `dl0v06spq` = `117212f`)

Scratch world inside Mandate HQ (harness `07900000`, drive `0d5`):
CTO Search (Research Drive) → Tobin Merrivale (fictional by design —
the real web coming back thin IS the mechanics proven) → Orin
Faulkes, scratch is_founder operator. Three acts:

1. **Research candidate** → the model searched the live web and the
   dossier landed in 41s with **31 real sources** attached
   server-side, every neighbouring field intact, one
   `candidate_researched` event (actor "Candidate Research Agent",
   trigger research, sources_count 31), zero agent sessions.
2. **Suspended from /ops — through the §40-relabeled buttons, their
   first live use**: the row reads Suspend / Restore and the toast
   said "Candidate Research Agent suspended." Re-research refused
   with the D5 sentence captured verbatim ("…The existing dossier
   stands."), the dossier byte-identical, no event, no session — and
   no web search made, the refusal landing before any spend.
3. **Restored** ("…restored." toast) → re-research landed in 38s:
   fresh generated_at, second event with trigger re_research and
   replaced_existing true.

Probe matrix with the researcher's real JWT: pool answers; clients,
reviews, organizations, events, fees, roster-beyond-self refuse;
DELETE zero rows; portal RPC empty; the human door 204s writing
nothing; an unknown type refused by name. Sign-out revoked the probe
session. **Teardown to baseline exactly on the first pass** — 18
events, the researcher's creation trail untouched, the founder's own
browser session the only survivor. No defect found live — the second
consecutive clean drive.

### Phase 4 verdicts — drafted, for the founder to confirm

- **Slice seven: Triangulation** (`runTriangulation`) — next in the
  cluster; it consumes the researcher's dossier, the company report
  and the HM report, so its Phase 0 should enumerate whether those
  reads widen the pool (company_context lives on projects — likely
  covered; the §5h rule decides, not this guess). Psychology follows.
- **The stale-CHECK discovery — recommended as a standing trap
  entry**: a CHECK rebuilt from an old file makes agent trail events
  vanish SILENTLY (053's swallow). Every future slice's invariants
  should carry the history-intact count, and the trap list should say
  why the count, not the exception, is the tripwire.
- **Long-action honesty on the research panel — deferred, evidence
  strengthened**: two live runs at 41s and 38s, no drop observed;
  the f54f1e7 pattern extends if one ever is.
- **Web-search spend ceilings — stays under the deferred per-agent
  budgets verdict** (§30), noting the suspension gate now provably
  sits BEFORE the spend.

Deploy `dl0v06spq` live; migration 079 applied via MCP and checked in.
The completion declaration for the research slice waits on the
verdicts above and the founder's written confirmation;
`NEXT-agent-research.md` is deleted only after that.

Founder-owned, unchanged: the Resend DNS records at Namecheap, the
exposed Supabase access token, leaked-password protection (Pro-gated),
the deferred build list (Sentry → rate limiting → Resend → Stripe,
with the rate-limiting bundle), and the one orphaned 331-byte storage
object from §28's diagnosis.

---

## 42. Researcher verdicts confirmed — the research slice is complete — 2026-08-21

The founder confirmed all four §41 verdicts as drafted: Triangulation
opens as slice seven (its Phase 0 checks whether the company_context
reads widen the pool — the code decides); the stale-CHECK discovery
becomes a standing trap entry (every future slice's invariants carry
the history-intact COUNT, because write_activity_event's 053 swallow
means a stale rebuild makes agent events vanish silently — the count,
not the exception, is the tripwire); the research panel's long-action
fix stays deferred with strengthened evidence; web-search spend stays
under the deferred per-agent budgets verdict, the suspension gate
provably ahead of the spend.

The definition of done is met: the judgment that searches the public
web for a person and writes a dossier about them signs its own name.
Every research run works under the pool's existing grants, reaches
the web only through Anthropic's tool with no database authority
added, attaches its sources server-side, lands one trail event with
its trigger and source count named, preserves every neighbouring
field, and fails the D5 way — a refused researcher surfaces its
sentence, spends nothing, and the existing dossier stands
byte-identical, proven live. The slice's control run went further
than designed and surfaced a latent audit hazard (silent event loss
under a stale CHECK) plus the invariant shape that catches it, now
standing doctrine. The drive was also the §40 relabel's first live
proof: Suspend/Restore on the row, honest verbs in the toast.

**The agents-as-principals research slice is complete.** Six of
fourteen agents now authenticate as principals — interpreter, ranker,
parser, evaluator, positioner, researcher — with six independent kill
switches and a trail that names every judgment's author, trigger, and
(for the researcher) its evidence base. `NEXT-agent-research.md`
deleted per its own instruction. Next migration is **080**;
Triangulation's Phase 0 opens now on the founder's word ("proceed
with slice seven").

Founder-owned, unchanged: the Resend DNS records at Namecheap, the
exposed Supabase access token, leaked-password protection (Pro-gated),
the deferred build list (Sentry → rate limiting → Resend → Stripe,
with the rate-limiting bundle), and the one orphaned 331-byte storage
object from §28's diagnosis.

---

## 43. The triangulator becomes a principal — built, proven live, awaiting verdict sign-off — 2026-08-21

Slice seven of agents-as-principals (plan in
`NEXT-agent-triangulation.md`, D1–D8 confirmed 2026-08-21). The
judgment that lines the company, the hiring manager and the person up
against each other and writes the firm's synthesis now signs its own
name. One migration (**next is 081**):

- **080 — vocabulary only, the narrowest slice yet.**
  `candidate_triangulated` + the allowlist at seven; zero table grants
  (Phase 0's answer held: the company and HM reports live on
  projects.company_context, inside 074's projects_agent_select).
  **`agent_triangulation_invariants.sql`** — 5 invariants, clean pass:
  the report landing with FOUR sibling agents' fields intact; the
  history-intact COUNT at seven (§42 doctrine); the negative matrix;
  the forgery boundary both directions; seven-way kill-switch
  independence. **Control run verified (novel per slice), stronger
  than designed:** `is_agent()` re-created as a direct role read
  without the status='active' gate — the "simplification" drift —
  aborted at INVARIANT-FAIL (5) one gate EARLIER than planned: "the
  suspended triangulator reads 1 candidates". The agent SELECT
  policies gate on is_agent() too (074's shape: org_id is not
  status-gated; is_agent() IS the suspension kill), so the regression
  disarms reads and door together and is caught at first touch.
  Restored to the current_user_role() form, verified, clean pass
  re-run, zero residue.

**The seam (`ffb6234`).** `signInTriangulationAgent` beside the six
existing. `runTriangulationAndPersist` splits at judgment; D5 carries
TWO refusals with different owners: the agent refusal ("The
Triangulation Agent could not run — … The existing report stands.")
and the readiness refusal, returned as a typed `missing_inputs`
result so the action renders today's exact human sentence
("Triangulation needs all three base reports first. Missing: …").
One `candidate_triangulated` event per landed report, trigger
generate/regenerate. Live account:
`vbreygin+triangulation@gmail.com`, id `107208f0-…`, Mandate HQ, §30
recipe; credentials in Vercel production and `.env.local`. Durable
baseline: **8 users, 21 trail events** (seven agents' creation
records).

### Driven live on production (deploy `9ych59qs1` = `ffb6234`)

Scratch world inside Mandate HQ (harness `08000000`, drive `0d6`):
COO Search (Triangulation Drive) → Sable Trentworth with all three
base reports seeded → Orin Faulkes, scratch operator. One harness
note, not a product defect: the first seed shaped
candidate_intelligence too thinly and the candidate page's server
render crashed on it — the panel legitimately expects the full report
type (arrays it maps over); reseeded full-shape, page healthy. The
acts:

1. **Generate report** → the synthesis landed in 66s with all four
   sibling keys intact, one `candidate_triangulated` event (actor
   "Triangulation Agent", trigger generate), zero agent sessions.
2. **Suspended from /ops** ("Triangulation Agent suspended." — the
   relabeled verbs' second live proof) → Regenerate refused with the
   D5 sentence verbatim, the report byte-identical, no event, no
   session.
3. **Restored** → Regenerate landed in 57s: fresh generated_at,
   second event with trigger regenerate and replaced_existing true.

Probe matrix with the triangulator's real JWT: pool answers; clients,
reviews, organizations, events, fees, roster-beyond-self refuse;
DELETE zero rows; portal RPC empty; the human door 204s writing
nothing; an unknown type refused by name. Sign-out revoked the probe
session. **Teardown to baseline exactly on the first pass** — 21
events, the triangulator's creation trail untouched, the founder's
own browser session the only survivor.

### Phase 4 verdicts — drafted, for the founder to confirm

- **Slice eight: Psychology** (`generatePsychologyAction`) closes the
  candidate-intelligence cluster. Its Phase 0 should note it carries
  RECRUITER CONTEXT (free text prepended to the system prompt and
  persisted to cv_structured.psychology_context) plus three
  human-annotation keys (notes/flags/confidence overrides) that are
  HUMAN writes and must stay human — the seam boundary will need one
  more sentence than usual. The digest writer follows the cluster.
- **The is_agent() discovery — recorded, no action needed**: the
  suspension kill is a single point (is_agent() over
  current_user_role()) by DESIGN, and the 080 control run now proves
  a regression there is caught at first touch by every slice's
  suspended-reads invariant. The redundancy is in the harnesses, not
  the schema — which is where it belongs.
- **Harness seeding — trap entry recommended**: scratch worlds that
  seed agent-report keys must seed the FULL report type (the panels
  map over its arrays server-side); an under-shaped seed crashes the
  page and reads as a product defect until diffed.
- **Long-action honesty — deferred, unchanged** (66s and 57s, no
  drop observed).

Deploy `9ych59qs1` live; migration 080 applied via MCP and checked
in. The completion declaration for the triangulation slice waits on
the verdicts above and the founder's written confirmation;
`NEXT-agent-triangulation.md` is deleted only after that.

Founder-owned, unchanged: the Resend DNS records at Namecheap, the
exposed Supabase access token, leaked-password protection (Pro-gated),
the deferred build list (Sentry → rate limiting → Resend → Stripe,
with the rate-limiting bundle), and the one orphaned 331-byte storage
object from §28's diagnosis.

---

## 44. Triangulator verdicts confirmed — the triangulation slice is complete — 2026-08-21

The founder confirmed all four §43 verdicts as drafted: Psychology
opens as slice eight, closing the candidate-intelligence cluster
(its Phase 0 must draw the seam boundary around the recruiter-context
prepend and the three human-annotation keys, which stay human); the
is_agent() finding stands recorded with no schema action — the
single-point suspension kill is by design and the redundancy lives in
the harnesses; the harness-seeding trap enters the list (scratch
worlds seeding agent-report keys seed the FULL report type — panels
map over its arrays server-side); long-action honesty stays deferred.

The definition of done is met: the judgment that synthesises what the
firm knows about the company, the hiring manager and the person into
a decision-grade verdict signs its own name. Every synthesis runs
under the pool's existing grants, preserves all four sibling agents'
fields (pinned by invariant), lands one trail event with its trigger
named, and fails the D5 way twice over — the agent refusal with its
sentence and a byte-identical surviving report, and the readiness
refusal carrying the recruiter's own unchanged "Missing: …" sentence
through a typed result. The slice's control run gave the programme's
central safety mechanism its first direct regression proof, and the
proof came back stronger than designed: is_agent() without its status
gate is caught at FIRST TOUCH, at the reads, by an invariant every
slice already carries.

**The agents-as-principals triangulation slice is complete.** Seven
of fourteen agents now authenticate as principals — interpreter,
ranker, parser, evaluator, positioner, researcher, triangulator —
with seven independent kill switches proven live.
`NEXT-agent-triangulation.md` deleted per its own instruction. Next
migration is **081**; Psychology's Phase 0 opens now on the founder's
word ("proceed with slice eight").

Founder-owned, unchanged: the Resend DNS records at Namecheap, the
exposed Supabase access token, leaked-password protection (Pro-gated),
the deferred build list (Sentry → rate limiting → Resend → Stripe,
with the rate-limiting bundle), and the one orphaned 331-byte storage
object from §28's diagnosis.

---

## 45. The psychology agent becomes a principal — built, proven live, awaiting verdict sign-off — 2026-08-21

Slice eight of agents-as-principals (plan in
`NEXT-agent-psychology.md`, D1–D8 confirmed 2026-08-21) — the
candidate-intelligence cluster's closing slice. The judgment that
writes a behavioural read of a person now signs its own name. One
migration (**next is 082**):

- **081 — the first pool widening since 076, and the narrowest
  kind**: `candidate_notes_agent_select`, SELECT only, on a table
  humans AUTHOR — the agent reads recruiter testimony as input and
  can never write, edit, or delete it. Plus `candidate_profiled` and
  the allowlist at eight. (Phase 0's §5h catch: the live notes
  policies require can_read_org(), which excludes agents; the 020
  file's blanket policy is superseded — pg_policies is ground truth.)
  **`agent_psychology_invariants.sql`** — 5 invariants, clean pass:
  the TWO-write shape (psychology + psychology_context); the widest
  neighbours pin yet (five agent keys AND the three human annotation
  keys survive); the notes boundary (read answers,
  INSERT/UPDATE/DELETE refused against a live note); history COUNT at
  eight; eight-way kill-switch independence including the notes read
  dying with suspension. **Control run verified (novel per slice):**
  the grant re-created FOR ALL — 020's old blanket drift — aborted at
  INVARIANT-FAIL (2) "the agent wrote a candidate note (1 rows, 1
  tampered/forged)": under the blanket policy the forged insert
  landed AND the delete removed the human's original. Restored to FOR
  SELECT, verified. One harness authoring error caught and kept as a
  comment: an unscoped post-reset count read the DURABLE production
  notes (4 where the harness org holds 1) — counts scope on the
  harness org id, the §35 residue lesson's counting twin.

**The seam (`cc5307c`).** `signInPsychologyAgent` beside the seven
existing. `runPsychologyAndPersist` splits at judgment; the action
hands `recruiterContext` through, and the agent reads candidate +
last-10 notes + project, runs the context-wrapped skill-injected call
(context and skill client both riding ctx), makes the two single-key
writes (psychology, then psychology_context set-or-cleared — today's
order and window), records one `candidate_profiled` event with the
trigger and a `has_recruiter_context` BOOLEAN — the text never enters
the trail; it lives visibly in psychology_context — and signs out
persisting nothing. Live account: `vbreygin+psychology@gmail.com`,
id `33b7586e-…`, Mandate HQ, §30 recipe; credentials in Vercel
production and `.env.local`. Durable baseline: **9 users, 24 trail
events** (eight agents' creation records).

### Driven live on production (deploy `45e3il3i3` = `cc5307c`)

Scratch world inside Mandate HQ (harness `08100000`, drive `0d7`):
CPO Search (Psychology Drive) → Wren Alderbury with a seeded
human-authored call note → Orin Faulkes, scratch operator. The acts:

1. **Analyse, with recruiter context through the dialog** → the
   profile landed in 32s; the context persisted VERBATIM to
   psychology_context; the evaluator's report intact; one
   `candidate_profiled` event (actor "Psychology Agent", trigger
   generate, has_recruiter_context true); zero agent sessions. The
   notes read fed the run under the 081 grant.
2. **Suspended from /ops** ("Psychology Agent suspended.") →
   Regenerate refused with the D5 sentence verbatim and BOTH keys
   stood byte-identical — the two-write shape's refusal proven live.
3. **Restored** → Regenerate landed in 19s (the fastest agent yet):
   fresh generated_at, second event with trigger regenerate,
   replaced_existing true, has_recruiter_context true.

Probe matrix with the psychology agent's real JWT: candidate_notes
ANSWERS (the 081 grant, org-wide as granted); notes INSERT 403; notes
DELETE zero rows with the row surviving; the pool answers; clients,
reviews, organizations, events, fees, roster-beyond-self refuse;
candidates DELETE zero rows; portal RPC empty; the human door 204s
writing nothing. Sign-out revoked the probe session. **Teardown to
baseline exactly on the first pass** — 24 events, the psychology
agent's creation trail untouched, the 3 durable notes intact, the
founder's own browser session the only survivor.

### Phase 4 verdicts — drafted, for the founder to confirm

- **The candidate-intelligence cluster is COMPLETE** on this slice's
  confirmation: parse → evaluate → position → research → triangulate
  → profile, six judgments about a person, each under its own name.
  **Slice nine: the desk digest writer** opens next per the confirmed
  queue — a manager-facing surface whose Phase 0 must enumerate what
  a digest lawfully reads across projects (likely wider reads than
  any candidate-scoped agent; the code decides).
- **The /ops agent roster — re-presented** (§33 deferred it "until
  the roster grows past a screen"): eight agent rows now sit under
  AGENTS (8), on their way to fourteen. An agent-kind chip or a
  two-column grouping is a small change whenever the founder calls
  it; reading eight identical rows is still workable today.
- **The harness-counting lesson — trap entry**: post-reset
  verification counts scope on the harness org id, exactly as
  residue filters scope on scratch ids; an unscoped count reads
  durable production rows and fails honest invariants.
- **Long-action honesty — deferred, strengthened again** (32s and
  19s; the psychology agent is the fastest in the roster).

Deploy `45e3il3i3` live; migration 081 applied via MCP and checked
in. The completion declaration for the psychology slice waits on the
verdicts above and the founder's written confirmation;
`NEXT-agent-psychology.md` is deleted only after that.

Founder-owned, unchanged: the Resend DNS records at Namecheap, the
exposed Supabase access token, leaked-password protection (Pro-gated),
the deferred build list (Sentry → rate limiting → Resend → Stripe,
with the rate-limiting bundle), and the one orphaned 331-byte storage
object from §28's diagnosis.

---

## 46. Psychology verdicts confirmed — the slice and the candidate-intelligence cluster are complete — 2026-08-21

The founder confirmed all four §45 verdicts as drafted: the desk
digest writer opens as slice nine (its Phase 0 enumerates the
cross-project reads a digest lawfully makes — the code decides); the
/ops agent-roster grouping stays founder-timed with the re-present on
record at eight rows; the harness-counting lesson enters the traps
(post-reset counts scope on the harness org id); long-action honesty
stays deferred with its strongest evidence yet.

The definition of done is met twice over. The slice: the judgment
that writes a behavioural read of a person signs its own name, reads
human testimony through a SELECT-only grant that the control run
proved cannot silently widen without an invariant naming the forged
note, carries the recruiter's stated context honestly (verbatim on
the profile, a boolean in the trail), and fails the D5 way with both
of its keys standing byte-identical. The cluster: **the
candidate-intelligence cluster is COMPLETE** — parse, evaluate,
position, research, triangulate, profile; six judgments about a
person, each authenticating as its own principal, each with its own
kill switch proven live, each landing one trail event with its
trigger named.

**The agents-as-principals psychology slice is complete.** Eight of
fourteen agents now authenticate as principals.
`NEXT-agent-psychology.md` deleted per its own instruction. Next
migration is **082**; the desk digest writer's Phase 0 opens now on
the founder's word ("proceed with slice nine").

Founder-owned, unchanged: the Resend DNS records at Namecheap, the
exposed Supabase access token, leaked-password protection (Pro-gated),
the deferred build list (Sentry → rate limiting → Resend → Stripe,
with the rate-limiting bundle), and the one orphaned 331-byte storage
object from §28's diagnosis.

---

## 47. The digest writer becomes a principal — built, proven live, awaiting verdict sign-off — 2026-08-21

Slice nine of agents-as-principals (plan in `NEXT-agent-digest.md`,
D1–D8 confirmed 2026-08-21) — the first conversion outside the
candidate cluster, and the §35 parser split generalised: the MANAGER
builds the rollup under desk:manage and hands it over in memory; the
agent judges, INSERTs, records, and sees nothing. One migration
(**next is 083**):

- **082 — one INSERT-only grant on the append-only record table**,
  the mirror of 081's SELECT-only: `desk_digests_agent_insert` with
  created_by PINNED to auth.uid() (a digest cannot land under a
  human's name), plus `desk_digest_generated` (the first
  non-candidate agent event) and the allowlist at nine.
  **`agent_digest_invariants.sql`** — 5 invariants, clean pass, and
  the control run returned a STRUCTURAL DISCOVERY in two acts: an
  added agent UPDATE policy alone is INERT, because an UPDATE's WHERE
  reads existing rows under SELECT policies and the no-archive pin
  grants none — the archive-blindness IS the immutability. Only the
  full drift (SELECT + UPDATE added together, "let the agent read its
  archive and fix typos") landed a rewrite, and the harness aborted
  at INVARIANT-FAIL (2). Related, from the first draft:
  INSERT..RETURNING id is refused for the same reason — the seam
  inserts BLIND, by design, and the harness documents both. The
  first control run that regresses by ADDING policies.

**The seam (`da39db3`).** `signInDeskDigestAgent` beside the eight
existing. `runDeskDigestAndPersist` takes the manager-assembled
input, runs the model call, inserts without read-back, records one
event with counts (members, unassigned) and never names, signs out.
D5 is structural: append-only means a refused or failed run has
nothing it can destroy. Live account: `vbreygin+digest@gmail.com`,
id `2e3b9603-…`, Mandate HQ, §30 recipe; credentials in Vercel
production and `.env.local`. Durable baseline: **10 users, 27 trail
events** (nine agents' creation records), desk_digests durable
count 0.

### Driven live on production (deploy `huxu02sig` = `da39db3`)

No scratch world needed beyond the operator — the digest reads the
REAL desk under Orin Faulkes (0d8). The acts:

1. **Generate digest** → landed in 25s, the desk_digests row
   `created_by` = the AGENT, one `desk_digest_generated` event
   (actor "Desk Digest Agent", trigger generate, members_count 2,
   unassigned 0), zero agent sessions.
2. **Suspended from /ops** → Regenerate refused with the D5 sentence
   verbatim ("…The previous digest stands."), the digest count
   unchanged at 1 — nothing to destroy, nothing destroyed.
3. **Restored** → Regenerate landed in 16s and APPENDED: two rows,
   the first surviving untouched — append-only proven live — second
   event with trigger regenerate.

Probe matrix with the digest writer's real JWT: desk_digests SELECT
empty (the writer cannot read the record it feeds); UPDATE and DELETE
land on zero rows with both rows surviving; an INSERT with a forged
human `created_by` 403s; clients, placements, organizations,
activity_events, roster-beyond-self all refuse; the human door 204s
writing nothing. Sign-out revoked the probe session. **Teardown to
baseline exactly on the first pass** — the drive's digest rows and
events keyed on the KNOWN-ZERO durable baseline (0 digests, 0 digest
events before the drive), 27 events, the digest writer's creation
trail untouched, the founder's session the only survivor.

### Phase 4 verdicts — drafted, for the founder to confirm

- **The remaining five agents** (intake, company research,
  onboarding, role spec, boolean search — plus shortlist and copilot
  read-shaped surfaces) queue by usage on the founder's word, each
  with its own Phase 0; the metrics agent's cron-shaped arrival still
  waits for its own slice (§30, standing).
- **The skills-injection gap on the digest — surfaced** (Phase 0
  observation): the digest is the one model call recruiter-authored
  skills cannot steer. One line in the seam whenever the founder
  wants managerial tone steerable; not built unbidden.
- **The RETURNING/SELECT-policy discovery — trap entry recommended**:
  under RLS, INSERT..RETURNING and UPDATE/DELETE WHERE clauses read
  rows under SELECT policies — a write-only principal inserts blind,
  and a write policy added without SELECT is inert. Both directions
  now proven by the 082 control run.
- **Long-action honesty — deferred, strongest evidence yet** (25s
  and 16s).

Deploy `huxu02sig` live; migration 082 applied via MCP and checked
in. The completion declaration for the digest slice waits on the
verdicts above and the founder's written confirmation;
`NEXT-agent-digest.md` is deleted only after that.

Founder-owned, unchanged: the Resend DNS records at Namecheap, the
exposed Supabase access token, leaked-password protection (Pro-gated),
the deferred build list (Sentry → rate limiting → Resend → Stripe,
with the rate-limiting bundle), and the one orphaned 331-byte storage
object from §28's diagnosis.

---

## 48. Digest verdicts confirmed — the digest slice is complete — 2026-08-21

The founder confirmed all four §47 verdicts as drafted: the remaining
five agents (intake, company research, onboarding, role spec, boolean
search — plus the shortlist and copilot read-shaped surfaces) queue by
usage, each with its own Phase 0, the metrics agent's cron-shaped
arrival still waiting for its own slice (§30, standing); the
skills-injection gap on the digest stays surfaced, one seam line
whenever managerial tone should become steerable, not built unbidden;
the RETURNING/SELECT-policy discovery enters the traps as doctrine —
under RLS, INSERT..RETURNING and UPDATE/DELETE WHERE clauses read rows
under SELECT policies, so a write-only principal inserts blind and a
write policy added without SELECT is inert, both directions proven by
the 082 control run; long-action honesty stays deferred with its
strongest evidence yet (25s and 16s, zero drops).

The definition of done is met. The judgment that writes the
Monday-morning read across every recruiter's desk signs its own name;
the manager's session performs the rollup its capability lawfully
holds and hands the assembled input to the seam in memory — the §35
parser split generalised, the negative matrix seven invariant files
pin left untouched; the agent judges, inserts blind into a table it
cannot read, records one event carrying counts and never names, and
fails the D5 way with nothing it can destroy — append-only made
fail-soft structural. The 082 control run returned the programme's
first regression-by-ADDING-policies: an agent UPDATE policy alone
proved INERT (the WHERE clause found no rows to read), and only the
full SELECT+UPDATE drift landed a rewrite the harness caught at the
append-only pin.

**The agents-as-principals digest slice is complete.** Nine of
fourteen agents now authenticate as principals — and the first
conversion outside the candidate-intelligence cluster proves the
house shape carries. `NEXT-agent-digest.md` deleted per its own
instruction. Next migration is **083**; slice ten's Phase 0 opens now
on the founder's word — the company-side grouping, first judgment the
Company Intelligence generator.

Founder-owned, unchanged: the Resend DNS records at Namecheap, the
exposed Supabase access token, leaked-password protection (Pro-gated),
the deferred build list (Sentry → rate limiting → Resend → Stripe,
with the rate-limiting bundle), and the one orphaned 331-byte storage
object from §28's diagnosis.

---

## 49. The Company Intelligence Agent becomes a principal — built, proven live, awaiting verdict sign-off — 2026-08-21

Slice ten of agents-as-principals (plan in
`NEXT-agent-company-intel.md`, D1–D8 confirmed 2026-08-21, two event
kinds) — the first of the company-side grouping, the first
ZERO-NEW-GRANT slice, and the first principal whose judgment reaches
the public web. One principal holds both judgments: the Company
Intelligence Report and the hiring-manager dossier. One migration
(**next is 084**):

- **083 — vocabulary only**: `company_researched` + `hm_researched`
  into the CHECK (live pg_constraint list) and the allowlist at
  eleven. NO policies created, widened, or touched — 074's projects
  S+U and skills S already cover the whole judgment; the pool grant
  is shared with the interpreter, and identity stays the credential
  plus the allowlist entries. **`agent_companyintel_invariants.sql`**
  — 5 invariants, clean pass: the merge-write lands with every
  sibling key surviving byte-identical; the vocabulary boundary
  pinned by a direct-insert probe at the TABLE (the only tripwire
  that fires past the function allowlists); history intact at eleven
  by COUNT; the negative matrix unchanged; kill switches independent
  at ten with the suspended-reads-zero check. The control run
  **DROPPED the CHECK constraint entirely** ("the app allowlists
  make it redundant") — the first regression that REMOVES a boundary
  rather than widening one. The forged insert landed and the harness
  aborted at INVARIANT-FAIL (2); drift and harness ran in ONE
  transaction, so the abort itself rolled the drop back —
  residue-free by construction, the constraint verified live after.

**The seam (`cdf6f52`).** The interpreter's shape, not the parser
split: every read this judgment makes (one projects row) is lawfully
the agent's own, so `runCompanyIntelligenceAndPersist` and
`runHiringManagerResearchAndPersist` sign in the tenth principal,
read the row under its own SELECT, run the web-searching model call
(skills ride the agent's session via `skillClient` — no digest-style
gap), merge the report into company_context under its own name,
record the event with counts and booleans, and sign out persisting
nothing. Stakeholder resolution moved into the HM seam — the
identity lives on the row the agent lawfully reads. The recruiter's
actions keep only the mandates:write gate and the D5 sentence. Live
account: `vbreygin+companyintel@gmail.com`, id `ef5638ff-…`, Mandate
HQ, §30 recipe; `AGENT_COMPANYINTEL_*` in Vercel production and
`.env.local`. Durable baseline: **11 users, 30 trail events** (ten
agents' creation records).

### Driven live on production (deploy `88y56hua1` = `cdf6f52`)

Scratch world 0d9 inside Mandate HQ: an is_founder operator and one
labelled scratch project (Shopify — a real, researchable company;
stakeholder Mikhail Parakhin, its public CTO). The acts:

1. **Research company** → landed in ~80s: intelligence_report on the
   row, 48 sources server-extracted, 7 leaders, one
   `company_researched` event (actor "Company Intelligence Agent",
   trigger research, counts in detail), siblings intact, zero agent
   sessions after the run.
2. **Suspended from /ops** → BOTH buttons refused with the D5
   sentence VERBATIM in ~600ms — refused at sign-in, before any web
   search was made or token spent; one kill switch covering both
   acts. The report stood byte-identical; the event count did not
   move.
3. **Restored** → Re-research landed in ~64s (trigger `re_research`,
   39 sources); **Research HM** landed in ~70s (27 sources,
   `stakeholder_override` false) — the HM's name in the report the
   recruiter renders, NEVER in the trail. Three merge-writes, every
   sibling key surviving all three.

Probe matrix with the agent's real JWT: the pool's lawful reads
answer (projects 3, candidates 1, notes 3, skills 5, users
self-only); clients, placements, organizations, activity_events,
desk_digests all ZERO; the human door 204s writing nothing; a
nonsense event type is refused by name; UPDATEs against refused
tables land on zero rows. Sign-out revoked the probe session.
**Teardown to baseline exactly on the first pass** — drive events
(operator creation, suspend/restore, the three agent acts) swept on
scratch keys; 30 events, the tenth creation trail untouched, the
founder's session the only survivor.

### Phase 4 verdicts — drafted, for the founder to confirm

- **The remaining agents** (intake, onboarding, role spec, boolean
  search — plus shortlist and copilot read-shaped surfaces) queue by
  usage on the founder's word; the metrics agent's cron-shaped
  arrival still waits for its own slice (§30, standing).
- **The culture generator, nearest sibling** (Phase 0 observation):
  the third company_context writer shares this slice's exact seam
  shape (same gate, same merge-write, no web search) — a
  near-mechanical conversion whenever the founder queues it; not
  built unbidden.
- **The HM override selector — surfaced**: the action accepts a
  stakeholder-name override the UI never passes; the first
  stakeholder is always researched. A product gap, founder-timed.
- **Long-action honesty — deferred, evidence extended**: the
  web-searching runs are the product's longest (64–80s live) and all
  three landed with zero transport drops; the f54f1e7 policy stands
  — extend only if a drop is observed live.

Deploy `88y56hua1` live; migration 083 applied via MCP and checked
in; tsc/vitest 790/eslint/build green. The completion declaration
for the company-intelligence slice waits on the verdicts above and
the founder's written confirmation; `NEXT-agent-company-intel.md` is
deleted only after it.

Founder-owned, unchanged: the Resend DNS records at Namecheap, the
exposed Supabase access token, leaked-password protection (Pro-gated),
the deferred build list (Sentry → rate limiting → Resend → Stripe,
with the rate-limiting bundle), and the one orphaned 331-byte storage
object from §28's diagnosis.

---

## 50. Company-intelligence verdicts confirmed — the slice is complete — 2026-08-21

The founder confirmed all four §49 verdicts as drafted: the remaining
agents (intake, onboarding, role spec, boolean search — plus the
shortlist and copilot read-shaped surfaces) queue by usage, each with
its own Phase 0, the metrics agent's cron-shaped arrival still
waiting for its own slice (§30, standing); the culture generator
stands recorded as the nearest sibling — the third company_context
writer on this slice's exact seam shape, a near-mechanical conversion
whenever the founder queues it, not built unbidden; the HM override
selector gap stays surfaced and founder-timed; long-action honesty
stays deferred with its evidence extended to the product's longest
calls (64–80s web-searching runs, zero drops).

The definition of done is met. The judgment that researches a company
in real time — and its pair, the hiring-manager dossier — signs its
own name: one principal, two acts, one kill switch proven live to
refuse BOTH at sign-in, before a single search is spent. The first
zero-new-grant slice proved the pool doctrine carries: 083 touched
only the vocabulary, and the identity remains the credential plus the
allowlist entries while the grants stay shared. The first
web-reaching principal keeps the web at arm's length — reach capped
in code, sources server-extracted, the trail carrying counts and
booleans while the hiring manager's name never leaves the report
body. The control run recorded the programme's first
boundary-REMOVED regression: the dropped CHECK caught only by the
direct-insert probe at the table, the abort rolling the drift back
itself.

**The agents-as-principals company-intelligence slice is complete.**
Ten of fourteen agents now authenticate as principals.
`NEXT-agent-company-intel.md` deleted per its own instruction. Next
migration is **084**; the remaining queue opens on the founder's
word.

Founder-owned, unchanged: the Resend DNS records at Namecheap, the
exposed Supabase access token, leaked-password protection (Pro-gated),
the deferred build list (Sentry → rate limiting → Resend → Stripe,
with the rate-limiting bundle), and the one orphaned 331-byte storage
object from §28's diagnosis.

---

## 51. The Culture Agent becomes a principal — built, proven live, awaiting verdict sign-off — 2026-08-21

Slice eleven of agents-as-principals (plan in `NEXT-agent-culture.md`,
D1–D8 confirmed 2026-08-21) — the second of the company-side grouping
and the second ZERO-NEW-GRANT slice: the projects row and the
feedback tail are read under 074's grants (the feedback SELECT is the
interpreter's, reused — human testimony read under a grant minted ten
slices ago), the merge-write rides the pool's projects UPDATE. One
migration (**next is 085**):

- **084 — vocabulary only**: `culture_profiled` into the
  CHECK (live pg_constraint list) and the allowlist at twelve.
  **`agent_culture_invariants.sql`** — 5 invariants, clean pass: the
  merge-write lands with the recruiter's context VERBATIM on
  culture_context and every sibling surviving (intelligence_report,
  hm_intelligence, culture_notes, culture_flags); the
  DELETE-WHEN-EMPTY pin (a context-less regenerate REMOVES
  culture_context — stale context must not outlive the read it
  shaped); the context TEXT provably absent from the trail; history
  intact at twelve by COUNT; kill switches independent at eleven.
  The control run **ADDED a users_agent_select roster policy** ("so
  agents can label people in reports") — the first regression of the
  PEOPLE boundary itself, the programme's most-repeated refusal. The
  harness aborted at INVARIANT-FAIL (2) reading three users rows
  where one was lawful; drift and harness in one transaction, the
  abort rolling the policy back — residue-free by construction.

**The seam (`3b2e1ab`).** The interpreter's shape:
`runCompanyCultureAndPersist` signs in the eleventh principal, reads
the row and the feedback tail under its own grants, derives (skills
ride the agent's session via skillClient; wrapWithRecruiterContext
unchanged), merges culture_profile under its own name, carries the
context verbatim or deletes the key, records the event with
has_recruiter_context and feedback_count, signs out. The action keeps
the mandates:write gate, the request-only context string handover,
and the D5 sentence. Live account: `vbreygin+culture@gmail.com`, id
`78b8eb2a-…`, Mandate HQ, §30 recipe; `AGENT_CULTURE_*` in Vercel
production and `.env.local`. Durable baseline: **12 users, 33 trail
events** (eleven agents' creation records).

### Driven live on production (deploy `bkjwzi0ss` = `3b2e1ab`)

Scratch world 0da inside Mandate HQ: an is_founder operator, a
labelled scratch project, two seeded feedback rows. A drive lesson
worth its line: the culture panel's header button only TOGGLES the
context drawer — the act lives on the drawer's "Run" (the psychology
trap, rediscovered on a second panel). The acts:

1. **Analyse (no context)** → landed in ~34s: culture_profile on the
   row, NO culture_context key, one `culture_profiled` event
   (actor "Culture Agent", trigger analyse, has_recruiter_context
   false, feedback_count 2).
2. **Suspended from /ops** → Run refused with the D5 sentence
   VERBATIM in ~900ms; nothing moved.
3. **Restored → regenerate WITH context** → landed in ~14s, toast
   "Profile regenerated with your context": the context verbatim on
   culture_context (the drawer's prefill on the next open proved the
   round-trip), the event's boolean TRUE, the text appearing ZERO
   times in the trail.
4. **Context-less regenerate** → landed in ~9s: culture_context
   DELETED — the delete-when-empty honesty proven live; the third
   event's boolean false; siblings intact through all three merges;
   zero agent sessions after every run.

Probe matrix with the agent's real JWT: lawful reads answer
(projects 3, feedback 5, candidates 1, notes 3, skills 5, users
self-only); clients, placements, organizations, activity_events,
desk_digests all ZERO; the human door 204s writing nothing; a
nonsense type refused by name. Sign-out revoked the probe session.
**Teardown to baseline exactly on the first pass** — 33 events, the
eleventh creation trail untouched, the founder's session the only
survivor.

### Phase 4 verdicts — drafted, for the founder to confirm

- **The company-side grouping is COMPLETE** — company intelligence,
  the HM dossier, and culture all sign their own names. The remaining
  agents (intake, onboarding, role spec, boolean search — plus the
  shortlist and copilot read-shaped surfaces) queue by usage on the
  founder's word; the metrics agent's cron-shaped arrival still waits
  for its own slice (§30, standing).
- **The context-drawer pattern — a recorded trap, second sighting**:
  panels whose header button toggles a drawer (psychology, culture)
  put the act on the drawer's "Run"; drives must click through.
- **Long-action honesty — deferred stands**: 9–34s runs, zero drops.

Deploy `bkjwzi0ss` live; migration 084 applied via MCP and checked
in; tsc/vitest 790/eslint/build green. The completion declaration for
the culture slice waits on the verdicts above and the founder's
written confirmation; `NEXT-agent-culture.md` is deleted only after
it.

Founder-owned, unchanged: the Resend DNS records at Namecheap, the
exposed Supabase access token, leaked-password protection (Pro-gated),
the deferred build list (Sentry → rate limiting → Resend → Stripe,
with the rate-limiting bundle), and the one orphaned 331-byte storage
object from §28's diagnosis.

---

## 52. Culture verdicts confirmed — the slice and the company-side grouping are complete — 2026-08-21

The founder confirmed all three §51 verdicts as drafted: the
remaining agents (intake, onboarding, role spec, boolean search —
plus the shortlist and copilot read-shaped surfaces) queue by usage
on the founder's word, the metrics agent's cron-shaped arrival still
waiting for its own slice (§30, standing); the context-drawer
pattern enters the traps as doctrine — panels whose header button
toggles a drawer (psychology, culture) put the act on the drawer's
"Run", and drives must click through; long-action honesty stays
deferred with the evidence unchanged in kind (9–34s, zero drops).

The definition of done is met twice over. The slice: the judgment
that reads a company's culture from context, onboarding, and the
feedback tail signs its own name; human testimony is read under a
grant minted ten slices ago for the interpreter — reading is not
authoring, and the human door still refuses the agent; the
recruiter's stated context is carried honestly in both directions —
verbatim on the column when given, the key DELETED when withheld,
a boolean and counts in the trail, the text provably absent from it;
and the control run recorded the programme's first regression of the
people boundary itself, caught at the roster pin. The grouping:
**the company-side grouping is COMPLETE** — company intelligence,
the hiring-manager dossier, and culture; three judgments about the
client side of a search, two principals, three kill switches proven
live, every landed act carrying its trigger.

**The agents-as-principals culture slice is complete.** Eleven of
fourteen agents now authenticate as principals.
`NEXT-agent-culture.md` deleted per its own instruction. Next
migration is **085**; the remaining queue opens on the founder's
word.

Founder-owned, unchanged: the Resend DNS records at Namecheap, the
exposed Supabase access token, leaked-password protection (Pro-gated),
the deferred build list (Sentry → rate limiting → Resend → Stripe,
with the rate-limiting bundle), and the one orphaned 331-byte storage
object from §28's diagnosis.

---

## 53. The Boolean Search Agent becomes a principal — built, proven live, awaiting verdict sign-off — 2026-08-21

Slice twelve of agents-as-principals (plan in
`NEXT-agent-boolean.md`, D1–D8 confirmed 2026-08-21) — the
sourcing-side opener and the first NEW-GRANT slice since 082. One
migration (**next is 086**):

- **085 — three policies and the vocabulary**:
  `job_specs_agent_select` (the brief is read-only),
  `boolean_queries_agent_select` (the current draft IS model input on
  the regen path) and `boolean_queries_agent_insert` (the versioned
  append, WITH CHECK pinning the org). NO UPDATE, NO DELETE — the
  version history is immutable to the agent; the recruiter's edit and
  restore acts keep their human policies. `sourcing_queries_generated`
  into the CHECK; allowlist at thirteen.
  **`agent_boolean_invariants.sql`** — 5 invariants, clean pass: six
  at v1 plus a regen at v2 land org-scoped; the version-history pin
  (agent UPDATE/DELETE on landed queries land on zero rows); the
  TENANT PIN; events carry the trigger, slot enum, counts, and a
  has_recruiter_feedback boolean with the text provably absent;
  history at thirteen by COUNT; kill switches independent at twelve.
  The control run **rebuilt the freshly-minted INSERT grant with the
  org conjunct dropped** ("is_agent() already gates it") — the
  cross-tenant insert LANDED in another tenant's project and the
  harness aborted at INVARIANT-FAIL (2); drift and harness in one
  transaction, the abort rolling the rebuild back — residue-free by
  construction. The first control run to regress the ORG boundary,
  and the first to target a grant minted in the same migration.

**The seam (`d13f27f`).** The interpreter's shape over three lawful
reads — the projects row, the final spec, the current draft:
`runSourcingGenerateAllAndPersist` and
`runSourcingRegenerateAndPersist` sign in the twelfth principal; the
actions keep the candidates:write gate, hand ids plus the
request-only feedback string, and map the seam's statuses onto the
surface's established messages (no-final-spec, already-generated)
plus the D5 sentence. boolean_queries has no created_by column — the
trail event is the sole attribution, and the schema was not widened.
Live account: `vbreygin+boolean@gmail.com`, id `bd78e9f0-…`, Mandate
HQ, §30 recipe; `AGENT_BOOLEAN_*` in Vercel production and
`.env.local`. Durable baseline: **13 users, 36 trail events** (twelve
agents' creation records).

### Driven live on production (deploy `9n12h1o84` = `d13f27f`)

Scratch world 0db inside Mandate HQ: an is_founder operator, a
labelled scratch project with a seeded FINAL job spec. The acts:

1. **Build Sourcing Queries** → landed in ~30s: six rows at version
   1, one event (trigger generate_all, slots_count 6,
   has_recruiter_feedback false, actor "Boolean Search Agent").
2. **Suspended from /ops** → Regenerate refused with the D5 sentence
   VERBATIM in ~600ms; every version stood.
3. **Restored → regenerate** — twice, and the pair proved the
   boolean honest in BOTH directions: a first attempt whose feedback
   never reached the seam landed v2 with `has_recruiter_feedback:
   false` (the trail told the truth about an empty handover — the
   drive's mis-aimed textarea, not the product's defect), and the
   corrected attempt landed v3 with the boolean TRUE and the
   feedback text appearing ZERO times in the trail. Version history
   append-only throughout; zero agent sessions after every run.

Probe matrix with the agent's real JWT: the new lawful reads answer
(job_specs 2, boolean_queries 8) beside the pool's (projects 3,
feedback 3, candidates 1, skills 5, users self-only); clients,
placements, organizations, activity_events, desk_digests all ZERO;
the agent's UPDATE and DELETE on boolean_queries land on zero rows;
the human door 204s writing nothing; a nonsense type refused by
name. Sign-out revoked the probe session. **Teardown to baseline
exactly on the first pass** — 36 events, the twelfth creation trail
untouched, the durable job spec standing, the founder's session the
only survivor.

### Phase 4 verdicts — drafted, for the founder to confirm

- **The remaining agents** (intake, onboarding, role spec — plus the
  shortlist and copilot read-shaped surfaces) queue by usage on the
  founder's word; the metrics agent's cron-shaped arrival still
  waits for its own slice (§30, standing).
- **Target companies — recorded as convertible-when-it-persists**:
  the judgment returns its report to the UI and lands nothing; the
  day it persists, it converts on this slice's shape.
- **The feedback-in-input-object observation — surfaced**: the regen
  feedback rides the model-input JSON (predates the ctx/wrapper
  doctrine); a one-line move to wrapWithRecruiterContext whenever
  the founder wants the prompt shapes uniform. Not changed unbidden.
- **Long-action honesty — deferred stands**: ~30s build, ~15–25s
  regens, zero drops.

Deploy `9n12h1o84` live; migration 085 applied via MCP and checked
in; tsc/vitest 790/eslint/build green. The completion declaration for
the boolean-search slice waits on the verdicts above and the
founder's written confirmation; `NEXT-agent-boolean.md` is deleted
only after it.

Founder-owned, unchanged: the Resend DNS records at Namecheap, the
exposed Supabase access token, leaked-password protection (Pro-gated),
the deferred build list (Sentry → rate limiting → Resend → Stripe,
with the rate-limiting bundle), and the one orphaned 331-byte storage
object from §28's diagnosis.

---

## 54. Boolean-search verdicts confirmed — the slice is complete — 2026-08-21

The founder confirmed all four §53 verdicts as drafted: the remaining
agents (intake, onboarding, role spec — plus the shortlist and
copilot read-shaped surfaces) queue by usage on the founder's word,
the metrics agent's cron-shaped arrival still waiting for its own
slice (§30, standing); target companies stands recorded as
convertible-when-it-persists — a judgment that lands nothing has no
trail event, and it converts on this slice's shape the day it does;
the feedback-in-input-object observation stays surfaced and
founder-timed — one line to wrapWithRecruiterContext whenever the
prompt shapes should become uniform; long-action honesty stays
deferred (~30s builds, zero drops).

The definition of done is met. The judgment that writes the sourcing
strings — six slots in one act, single slots on iteration — signs its
own name; the brief it reads is read-only, the draft it iterates is
its own lawful read, and the history it appends to is immutable to it
by construction: no UPDATE, no DELETE, the recruiter's edit and
restore acts untouched under their own policies. The first new grants
in three slices arrived with their own novel proof — the control run
regressed the ORG boundary on the very grant the migration minted,
and the harness caught an agent's query landing in another tenant's
project. The trail told the truth in both directions live: an empty
feedback handover recorded false, a real one recorded true, and the
recruiter's words never rode the trail either way.

**The agents-as-principals boolean-search slice is complete.** Twelve
of fourteen agents now authenticate as principals.
`NEXT-agent-boolean.md` deleted per its own instruction. Next
migration is **086**; the remaining queue opens on the founder's
word.

Founder-owned, unchanged: the Resend DNS records at Namecheap, the
exposed Supabase access token, leaked-password protection (Pro-gated),
the deferred build list (Sentry → rate limiting → Resend → Stripe,
with the rate-limiting bundle), and the one orphaned 331-byte storage
object from §28's diagnosis.

---

## 55. The Intake Agent becomes a principal — built, proven live, awaiting verdict sign-off — 2026-08-21

Slice thirteen of agents-as-principals (plan in
`NEXT-agent-intake.md`, D1–D8 confirmed 2026-08-21) — the
fourteen-agent map's FIRST agent converted thirteenth, the third
ZERO-NEW-GRANT slice, and the first FIRE-AND-FORGET conversion. One
migration (**next is 087**):

- **086 — vocabulary only**: `intake_analyzed` into the CHECK (live
  pg_constraint list); allowlist at fourteen. NO policies touched —
  074's projects S+U cover the judgment, and the clients registry
  stays the recruiter's. **`agent_intake_invariants.sql`** — 5
  invariants, clean pass: the judgment lands with the HUMAN's fields
  surviving (one_line_input, created_by); the brief's text provably
  absent from the trail; the clients registry refused in BOTH shapes
  — the table reads zero AND the resolve_client RPC (SECURITY
  INVOKER) gives birth to nothing under an agent; history at
  fourteen by COUNT; kill switches independent at thirteen. The
  control run **rewrote record_agent_event to INSERT into the trail
  directly** ("skip the wrapper") — the act landed with a NULL
  actor, wearing the system's blank face, and the harness aborted at
  the SIGNATURE PIN; transactional DDL rolled the rewrite back —
  residue-free by construction. The first control run to regress the
  ATTRIBUTION itself.

**The seam (`4b9d53b`).** The parser split, INVERTED: the recruiter's
act (opening the mandate — the optimistic INSERT, the placeholders,
the brief) lands first; inside after(), `runIntakeAnalysisAndPersist`
signs in the thirteenth principal, judges the one-line brief, UPDATEs
the mandate's shape under its own name (title, company, calibration,
context — never client_id, never created_by), records the event, and
RETURNS the analysis; the recruiter's cookie context then does the
client bookkeeping the judgment enables — resolve_client, the link,
the promotion — exactly as before. A refused run leaves the mandate
honestly at "Analyzing…" with its brief intact; the D5 sentence
lives in the server log (fire-and-forget has no toast to ride). Live
account: `vbreygin+intake@gmail.com`, id `58d6103b-…`, Mandate HQ,
§30 recipe; `AGENT_INTAKE_*` in Vercel production and `.env.local`.
Durable baseline: **14 users, 39 trail events** (thirteen agents'
creation records).

### Driven live on production (deploy `79ufrd1sl` = `4b9d53b`)

Three mandates opened through the REAL /app/projects/new form by the
0dc operator. The acts:

1. **Open a mandate** → the page landed instantly on the placeholder;
   ~20s later the title resolved to "VP of Platform Engineering" /
   "Drivecorp Photonics" — the SPLIT VISIBLE IN THE ROWS: the
   intake_analyzed event under "Intake Agent" (input_chars 107,
   company_identified true), the client row born under "Drive 0dc
   Operator". One judgment, two signatures, each honest.
2. **Suspended from /ops → second mandate** → stayed honestly at
   "Analyzing…": brief intact, NO analysis, NO event, NO client
   born, the D5 sentence in the server log.
3. **Restored → third mandate** → analyzed and linked (second event,
   second client row under the operator).

Probe matrix with the agent's real JWT: projects 5 (the pool's
lawful read, mid-drive), users self-only, skills 5; clients,
placements, organizations, activity_events, desk_digests all ZERO —
and the star probe: `resolve_client` under the agent's JWT refused
BY NAME ("new row violates row-level security policy for table
clients"). The human door 204s writing nothing; a nonsense type
refused. Sign-out revoked the probe session. **Teardown to baseline
exactly on the first pass** — 39 events, the thirteenth creation
trail untouched, the founder's session the only survivor.

### Phase 4 verdicts — drafted, for the founder to confirm

- **The remaining agents** (onboarding, role spec — plus the
  shortlist and copilot read-shaped surfaces) queue by usage on the
  founder's word; the metrics agent's cron-shaped arrival still
  waits for its own slice (§30, standing).
- **The stuck-mandate gap — surfaced**: a failed or refused intake
  leaves "Analyzing…" forever, true before this slice and true
  after; a retry surface or an honest failed-state title is product
  work, founder-timed.
- **The skills gap, second sighting — surfaced**: intake never sees
  recruiter-authored skills; one seam line whenever the founder
  wants intake steerable.
- **Long-action honesty — nothing to defer**: the run is
  fire-and-forget; the recruiter never waits on it.

Deploy `79ufrd1sl` live; migration 086 applied via MCP and checked
in; tsc/vitest 790/eslint/build green. The completion declaration for
the intake slice waits on the verdicts above and the founder's
written confirmation; `NEXT-agent-intake.md` is deleted only after
it.

Founder-owned, unchanged: the Resend DNS records at Namecheap, the
exposed Supabase access token, leaked-password protection (Pro-gated),
the deferred build list (Sentry → rate limiting → Resend → Stripe,
with the rate-limiting bundle), and the one orphaned 331-byte storage
object from §28's diagnosis.

---

## 56. Intake verdicts confirmed — the slice is complete — 2026-08-21

The founder confirmed all four §55 verdicts as drafted: the remaining
agents (onboarding, role spec — plus the shortlist and copilot
read-shaped surfaces) queue by usage on the founder's word, the
metrics agent's cron-shaped arrival still waiting for its own slice
(§30, standing); the stuck-mandate gap stays surfaced and
founder-timed — a failed or refused intake leaves "Analyzing…"
forever, and the retry surface or honest failed-state title is
product work; the skills gap's second sighting stays surfaced —
intake becomes steerable with one seam line whenever wanted; and
long-action honesty has nothing to defer on a fire-and-forget run.

The definition of done is met. The judgment that turns a one-line
brief into a structured mandate signs its own name — and the slice
proved a new shape for the house: the parser split inverted, the
agent handing its analysis BACK for the client bookkeeping only a
human may do. The drive showed one judgment wearing two honest
signatures in the same rows — the analysis event under the Intake
Agent, the client row under the operator who asked — and the
registry's boundary answered a live probe by name. The control run
recorded the programme's first regression of attribution itself: an
act stripped of its signature was caught by the pin that insists
every agent act wears the agent's name.

**The agents-as-principals intake slice is complete.** Thirteen of
fourteen agents now authenticate as principals — every judgment the
product runs on demand now signs its own name; only the metrics
agent's cron-shaped arrival remains (§30, standing), with the
onboarding and role-spec surfaces and the read-shaped
shortlist/copilot queue behind it. `NEXT-agent-intake.md` deleted per
its own instruction. Next migration is **087**.

Founder-owned, unchanged: the Resend DNS records at Namecheap, the
exposed Supabase access token, leaked-password protection (Pro-gated),
the deferred build list (Sentry → rate limiting → Resend → Stripe,
with the rate-limiting bundle), and the one orphaned 331-byte storage
object from §28's diagnosis.

---

## 57. The Search Health Agent becomes a principal — built, proven live, awaiting verdict sign-off — 2026-08-21

Slice fourteen of agents-as-principals (plan in
`NEXT-agent-metrics.md`, D1–D8 confirmed 2026-08-21) — **the LAST of
the fourteen-agent map**: Metrics / Search Health, deferred since §30
as "cron-shaped", converted now as what Phase 0 found it to be — two
on-demand judgments that persist, with the scheduled sweep left as a
documented socket (D8). One principal holds both judgments: health
suggestions and the weekly report (the company-intelligence
precedent). One migration (**next is 088**):

- **087 — one grant and the vocabulary**:
  `project_reports_agent_insert` — INSERT only, is_agent() + org +
  **generated_by PINNED to auth.uid()**; NO SELECT (the seam mints
  the row's id itself and inserts BLIND — 082's RETURNING doctrine
  applied constructively), NO UPDATE, NO DELETE — landed reports are
  the recruiter's records. The health judgment added ZERO grants:
  every read is the pool's (074/085) and the merge rides 074's
  projects UPDATE; `dismissHealthSuggestionAction` stays the
  recruiter's overlay act. `health_suggested` +
  `weekly_report_generated` into the CHECK (live pg_constraint list);
  allowlist at sixteen; trigger `on_demand` with **`scheduled`
  RESERVED** (D4). **`agent_metrics_invariants.sql`** — 5 invariants,
  clean pass: the pool answers both judgments; the health merge lands
  with sibling columns byte-identical; the blind insert lands with
  the minted id under the agent's name; THE IMPERSONATION PIN; the
  tenant conjunct beside it; INSERT..RETURNING refused (082 reproven
  on this table); the agent's project_reports SELECT answering ZERO;
  history at sixteen by COUNT; the negative matrix unchanged; the
  landed-reports pin (agent UPDATE and DELETE on zero rows); forgery
  both directions; kill switches independent at fourteen. The control
  run **dropped the generated_by conjunct** ("we trust the app to
  stamp it") — the agent's report LANDED UNDER A RECRUITER's NAME and
  the harness aborted at INVARIANT-FAIL (2); drift and harness in one
  transaction, the abort rolling the rebuild back — residue-free by
  construction, all three conjuncts verified live after. Thirteen
  slices bookended by the two faces of attribution fraud: 086 caught
  anonymity, 087 catches impersonation.

**The seam (`ea5e65b`).** The interpreter's shape twice over:
`computeProjectHealth` and `computePipelineMetrics` gained an
optional client (the skillClient pattern applied to metrics — the
cookie client stays every human surface's default), and the
fourteenth principal computes health and pipeline UNDER ITS OWN
SESSION. `runHealthSuggestionsAndPersist` applies the HEALTH GATE
itself — a healthy search returns before any token is spent — then
judges (skills ride the agent's session), merge-UPDATEs the blob
under its own name, and records the event with a status enum and a
count. `runWeeklyReportAndPersist` assembles the Monday-aligned week
deterministically from its own reads, judges, MINTS THE ROW's ID
ITSELF, inserts blind with generated_by = its own identity, records
the event with a date and counts, and hands the minted id back. The
actions keep their gates (mandates:write; clients:share — the
client-facing artifact's gate), the established healthy-gate message,
revalidatePath, and the D5 sentences. Live account:
`vbreygin+metrics@gmail.com`, id `a4b3f2ce-…`, Mandate HQ, §30
recipe; `AGENT_METRICS_*` in Vercel production and `.env.local`.
Durable baseline: **15 users, 42 trail events** (fourteen agents'
creation records) — and the founder's own May demo report makes
project_reports' durable count **1**.

### Driven live on production (deploys `feduk2zo7` = `ea5e65b`, `12t02ic2m` = `7c072fd`)

Scratch world 0dd inside Mandate HQ: an is_founder operator and one
labelled scratch project (5 candidates, seeded feedback, one sourcing
query), shaped HEALTHY first so the gate could be exercised both
ways. The acts:

1. **The healthy way** — the panel does not render at all on a
   healthy project (no affordance, the honest tooltip on surfaces
   that show the button); and the SERVER's own gate answered a
   stale-UI race live: with suggestions already on screen, the
   feedback freshened underneath and Refresh clicked without a
   reload, the action refused in ~1.4s with the established message
   VERBATIM — before any token was spent.
2. **One defect found live, fixed in the drive (`7c072fd`)**: the
   first generate attempt failed — the structured-output API refuses
   `additionalProperties: true` on object types (400), so every
   health-suggestions run had failed since the API tightened
   validation; the panel predates the agents programme and had not
   been driven since. D5 held through the failure: blob null, no
   event, no session left behind. Schema fixed, redeployed.
3. **Generate on the stalled project** → landed in ~30s: 5
   suggestions on the row, siblings intact, one `health_suggested`
   event (actor "Search Health Agent", trigger on_demand,
   health_status stalled, suggestions_count 5).
4. **Weekly report** → landed in ~37s: the row bearing the
   SEAM-MINTED id with `generated_by` = the agent — the first
   client-facing artifact row in the product that names an agent as
   its author — and one event carrying the week date and counts
   (candidates 5, feedback 0).
5. **Suspended from /ops by the operator's click** → BOTH surfaces
   refused with their D5 sentences VERBATIM in ~400–460ms — one kill
   switch covering both judgments, refused at sign-in; the blob
   byte-identical (md5-compared), the report table gaining nothing.
6. **Restored → regenerate** → landed in ~24s: a fresh blob, the
   second event, zero agent sessions after every run.

Probe matrix with the agent's real JWT via PostgREST: the pool's
lawful reads answer (projects 3, candidates 6, feedback 4,
boolean_queries 1, candidate_scores 3, skills 5, users self-only);
**project_reports SELECT answers ZERO** — the star probe, the blind
insert's other face; clients, placements, organizations,
activity_events, desk_digests all ZERO; INSERT..RETURNING refused by
name (42501); a FORGED generated_by (the operator's id) refused by
name — the impersonation pin answering live; the agent's UPDATE and
DELETE on the landed report 204 onto zero rows, the row surviving
un-rewritten; the human door 204s writing nothing; a nonsense type
refused by name. Sign-out revoked the probe session. **Teardown to
baseline exactly on the first pass** — the project cascade, the trail
rows swept on scratch keys (they do not cascade), the operator's full
auth chain removed with the `user_id::uuid` cast, the agent's revoked
refresh tokens cleared; 42 events, the fourteenth creation trail
untouched, the founder's session (and its own 4-token rotation
chain) the only survivor.

### Phase 4 verdicts — drafted, for the founder to confirm

- **Slice fourteen CLOSES THE MAP** — all fourteen agents of
  AGENTS.md now authenticate as principals: every judgment the
  product runs signs its own name, on demand, under its own kill
  switch. The onboarding and role-spec surfaces and the read-shaped
  shortlist/copilot conversions remain queued by usage outside the
  map's scope (§50/§52/§54/§56, standing).
- **The scheduled sweep — recorded as CHANNEL-BLOCKED, ready**: the
  cron route's own comments refuse motion without automation, and the
  channel (Resend) is a founder item. When it is provisioned, the
  sweep lands in `/api/cron/maintenance` with NO new migration: the
  CRON_SECRET-gated route signs in THIS SAME principal, the trigger
  value `scheduled` is already reserved in the vocabulary, and the
  kill switch already covers it (D7/D8).
- **The health-schema defect class — surfaced**: `additionalProperties:
  true` broke a surface silently for however long the API has
  refused it; the other thirteen agents' schemas were grepped clean
  this session, but a smoke-run of rarely-driven AI surfaces after
  provider-side validation changes is worth a line in the pre-launch
  checklist. Founder-timed.
- **Long-action honesty — deferred stands**: ~24–37s runs, zero
  transport drops, consistent with the f54f1e7 policy's evidence.

Deploys `feduk2zo7` and `12t02ic2m` live; migration 087 applied via
MCP and checked in; tsc / vitest 790 / eslint / build green. The
completion declaration for the metrics slice — and for the
fourteen-agent map it closes — waits on the verdicts above and the
founder's written confirmation; `NEXT-agent-metrics.md` is deleted
only after it.

Founder-owned, unchanged: the Resend DNS records at Namecheap, the
exposed Supabase access token, leaked-password protection (Pro-gated),
the deferred build list (Sentry → rate limiting → Resend → Stripe,
with the rate-limiting bundle), the one orphaned 331-byte storage
object from §28's diagnosis, the stuck-mandate retry gap (§55), and
the intake and digest skills gaps.

---

## 58. Search-health verdicts confirmed — the slice and the fourteen-agent map are complete — 2026-08-21

The founder confirmed all four §57 verdicts as drafted: slice
fourteen closes the map, with the onboarding and role-spec surfaces
and the read-shaped shortlist/copilot conversions queued by usage
outside it (§50/§52/§54/§56, standing); the scheduled sweep stands
recorded as channel-blocked and READY — when Resend is provisioned it
lands in `/api/cron/maintenance` with no new migration, this same
principal signing in from the CRON_SECRET-gated route under the
already-reserved `scheduled` trigger; the health-schema defect class
stays surfaced and founder-timed — a smoke-run of rarely-driven AI
surfaces after provider-side validation changes joins the pre-launch
awareness list; long-action honesty stays deferred with the evidence
unchanged in kind (~24–37s runs, zero drops).

The definition of done is met twice over. The slice: the judgment
that diagnoses a stalled search and the judgment that writes the
client-facing weekly report both sign their own names; the health
gate is the agent's own act, honest in both directions live; the
report lands through a door that can never wear a human's name —
generated_by pinned in the grant, the id minted in the seam, the
insert blind — and the control run proved the pin by dropping it,
catching the programme's first impersonation the way 086 caught its
first anonymity. The map: **all fourteen agents of AGENTS.md now
authenticate as principals** — fourteen users rows, fourteen
credentials, fourteen independent kill switches, every judgment
recorded in the trail under its own name with its trigger named in
detail, and the service role's ambient trust gone from every AI
surface in the product. The founder's 2026-08-12 statement — agents
authenticate as principals, not ambient trust — is no longer a
programme; it is the product's standing shape.

**The agents-as-principals search-health slice is complete, and the
fourteen-agent map is closed.** `NEXT-agent-metrics.md` deleted per
its own instruction. Next migration is **088**.

Founder-owned, unchanged: the Resend DNS records at Namecheap, the
exposed Supabase access token, leaked-password protection (Pro-gated),
the deferred build list (Sentry → rate limiting → Resend → Stripe,
with the rate-limiting bundle), the one orphaned 331-byte storage
object from §28's diagnosis, the stuck-mandate retry gap (§55), and
the intake and digest skills gaps.

---

## 59. Error monitoring lands — built, proven live, awaiting verdict sign-off — 2026-08-24

First item of the deferred build list (Sentry → rate limiting →
Resend → Stripe), opened on the founder's word after §58 closed the
fourteen-agent map. Plan in `NEXT-sentry.md`, D1–D8 confirmed
2026-08-21, **D2 amended and re-confirmed 2026-08-24**. **No
migration — the database was not touched; the counter stays at 088.**

The motivating evidence was one week old: §57's health-schema 400 had
been failing SILENTLY on every run since the provider tightened
validation, and `(dashboard)/error.tsx` said so in its own comment —
"until error monitoring lands, the console is the only record."

### What landed (`240af3b`, `16beba2`, `e5a7cc8`)

`@sentry/nextjs` 10.70.0, hand-wired per D1 — **not** the wizard,
which scaffolds example pages and rewrites config wholesale. Five
files and one config wrapper, deliberately removable (D7):

- **`instrumentation.ts`** — server init plus `onRequestError`: the
  hook that catches what `runAction` never sees (server component
  renders, the route handlers, the token doors, and the
  fire-and-forget `after()` paths whose only record was a log line).
- **`instrumentation-client.ts`** — client init, same doctrine.
- **`app/global-error.tsx`** — NEW root boundary. A root-layout error
  previously showed Next's unstyled page and recorded NOTHING
  anywhere.
- **`(dashboard)/error.tsx`** — keeps its console record, sends the copy.
- **`lib/observability/sentry.ts`** — the one seam-side door.
  `captureSeamError` is a drop-in for `console.error` that logs FIRST
  (D5: Sentry is a copy, never a replacement) and derives its `seam`
  tag from the house's own `[label]` convention;
  `captureActionFault` / `captureGuardTrip` carry runAction's
  EXISTING outcome-vs-fault discrimination into telemetry — authored
  reader sentences never become events, provider payloads and
  TypeErrors do, `ForbiddenError` rides as a warning. One line at one
  seam covers all ~348 action throw sites.

### Two corrections the phase made to itself

- **A D3 violation, caught before any event was sent.** Phase 1's
  mechanical `console.error` → `captureSeamError` swap was too broad:
  it routed the **14 D5 REFUSAL logs** ("suggestions skipped — an
  operator suspended it") to Sentry. A suspension is an operator's
  act, not a fault. Those sites are console-only again; 40 genuine
  fault sites remain captured.
- **The PII boundary moved from inline config into a HARNESS**
  (`lib/observability/scrub.ts` + `scrub.test.ts`, 11 tests) — the
  house idiom, where a boundary is pinned by something that fails
  loudly rather than by a one-time inspection. Phase 0 planned to
  verify D4 by eyeballing one event in the Sentry UI; the harness
  proves it on every commit, forever, and **it immediately found a
  leak the plan had missed**: a 500-character cap limits VOLUME, not
  CONTENT — a provider error quoting the serialised model input still
  shipped the first candidates' names, CVs, and hiring-manager
  feedback inside the cap. The scrub now redacts by KEY (the value
  keys our own seams serialise become `[redacted]`; a bulk container
  key truncates the message at that point) and a test pins the
  counter-case: §57's own 400 body — "additionalProperties: true is
  not supported" — passes through UNTOUCHED, because blanket
  truncation would have hidden the very fault this slice was built in
  response to.

### D2 amended — the marketplace path abandoned

As drafted: marketplace install with a founder-hand claim. As
executed: the terms acceptance never registered for the team, through
**three founder attempts and sixteen CLI retries**, while the
dashboard reported success; the team's only marketplace installation
remains Resend (2026-08-13). Amendment, founder-confirmed: **Sentry
provisioned directly at sentry.io, the DSN set as env by hand** — the
AGENT_* credential shape. Kill switch, PII boundary, fail-soft and
removability all unchanged; only unified billing is forfeited, which
at the free tier is nothing.

### Driven live on production

**The client half** (getmandate.io, browser): ingest returned **HTTP
200**, event `57e7739c…`. The event AS SENT — read through the SDK's
`afterSendEvent` hook, i.e. after `beforeSend` — carried a provider
payload quoting two candidates, their CVs, their employers and a
hiring manager's words, reduced to `"invalid schema for input {…
[structured input redacted]"`. No user, no request data, no cookies,
no headers; breadcrumbs navigation-only with zero data payloads.

**The server half** (a temporary token-gated probe under
`/api/cron/`, 404 without the token, **since deleted with its env
token**): ingest returned **HTTP 200**, event `c527af61…`; options
confirmed live as `enabled: true`, `tracesSampleRate: 0` (D6
errors-only), `sendDefaultPii: false` (D4); the same redaction on the
server's own bytes; and `tags: { seam: "search-health" }` — the
derivation from the `[label]` convention proven, not assumed.

**One platform trap, and it is the slice's own lesson.** The first
DSN attempt shipped Sentry code to the browser **with no DSN**:
Vercel marks new environment variables SENSITIVE by default, and a
sensitive variable is never inlined into a client bundle. Server
capture would have worked while browser capture silently did nothing
— a half-blind monitor that looks healthy, which is precisely the
failure class this slice exists to end. It was caught only because
the probe reads BYTES rather than trusting a dashboard. Both gates
were hardened in response (they key on `NODE_ENV` plus the DSN's
presence, so a laptop's `.env.local` cannot ship events and a missing
`NEXT_PUBLIC_VERCEL_ENV` cannot blind the browser half). Second
trap, recorded: Sentry's transport caches the native `fetch` at
init, so patching `window.fetch` cannot observe it — `afterSendEvent`
is the honest observer.

### Phase 4 verdicts — drafted, for the founder to confirm

- **Alert routing joins the Resend slice** (D8 stands): the Sentry UI
  is the only channel today, which is right at one operator; email or
  Slack routing lands when the channel exists, and it is the same
  founder item that unblocks the §58 scheduled sweep.
- **The health-schema defect class — now covered, and worth a
  standing habit**: the monitor would have caught §57 on its first
  failed click. Recommend a smoke-run of rarely-driven AI surfaces
  after any provider-side validation change; Sentry makes it cheap
  rather than mandatory.
- **Source maps — deferred, not forgotten**: `withSentryConfig`
  uploads only when `SENTRY_AUTH_TOKEN` exists, and it does not.
  Server stack traces are readable without it; browser traces are
  minified. A two-minute founder-hand token whenever a client-side
  fault proves hard to read.
- **Tracing and session replay stay OFF** (D6): the deferred list
  said error monitoring, and performance tracing is its own decision.
  Replay is refused on principle — it screenshots candidate data by
  design.

Deploys through `4hnz79y48` live; no migration; tsc / vitest **801**
(11 new) / eslint / build green. The completion declaration for the
error-monitoring slice waits on the verdicts above and the founder's
written confirmation; `NEXT-sentry.md` is deleted only after it.

Founder-owned, unchanged: the Resend DNS records at Namecheap, the
exposed Supabase access token, leaked-password protection (Pro-gated),
the remaining deferred build list (rate limiting → Resend → Stripe),
the one orphaned 331-byte storage object from §28's diagnosis, the
stuck-mandate retry gap (§55), and the intake and digest skills gaps.

---

## 60. Error-monitoring verdicts confirmed — the slice is complete — 2026-08-24

The founder confirmed all four §59 verdicts as drafted: alert routing
joins the Resend slice (the Sentry UI is the right channel at one
operator, and the same founder item unblocks §58's scheduled sweep);
the smoke-run habit for rarely-driven AI surfaces after provider-side
validation changes stands recorded, made cheap rather than mandatory
by the monitor itself; source maps stay deferred pending a
founder-hand `SENTRY_AUTH_TOKEN`, with server traces already readable
without one; and tracing and session replay stay OFF — the deferred
list said error monitoring, and replay is refused on principle
because it screenshots candidate data by design.

The definition of done is met. The product's faults now have a
record that is not a terminal buffer: every server-action fault, both
route boundaries, every route handler and `after()` path, and forty
named agent-seam catch sites report under one removable dependency —
five files and one config wrapper, with the 348 throw sites and the
seams' log lines left Sentry-ignorant. What is recorded is honest in
both directions: authored reader sentences and operator suspensions
are NOT faults and never become events, while the provider payloads
that used to vanish into a console now arrive tagged by seam. And the
boundary that lets a recruiting product send telemetry to a third
party at all is pinned by a harness rather than a promise — the same
doctrine the fourteen agent slices used, applied to a vendor: eleven
tests that failed loudly the first time they were run, catching a
leak the plan itself had missed.

**The error-monitoring slice is complete.** `NEXT-sentry.md` deleted
per its own instruction. Next migration is still **088** — this slice
never touched the database.

Founder-owned, unchanged: the Resend DNS records at Namecheap, the
exposed Supabase access token, leaked-password protection (Pro-gated),
the remaining deferred build list (rate limiting → Resend → Stripe),
the one orphaned 331-byte storage object from §28's diagnosis, the
stuck-mandate retry gap (§55), and the intake and digest skills gaps.

---

## 61. Rate limiting lands — built, proven live, awaiting verdict sign-off — 2026-08-24

Second item of the deferred build list (Sentry ✓ §60 → **rate
limiting** → Resend → Stripe). Plan in `NEXT-rate-limiting.md`, D1–D8
confirmed 2026-08-24. One migration (**next is 089**) — the first
since the fourteen-agent map closed.

### What landed (`b6878d5`, `c3730df`, `6cebce0`)

- **088 — 061 generalised, not replaced.** `rate_limit_policy` holds
  the caps as DATA (a ceiling is an UPDATE, not a deploy): eleven
  scopes across three tiers. `rate_limit` shares 061's
  bucket-key-carries-the-window design; both tables RLS-on with ZERO
  policies — the SECURITY DEFINER `check_rate_limit(scope, key)` is
  the entire API. Keys arrive PRE-HASHED (D6): the database never
  learns a caller's address, email, or token. An unknown scope RAISES
  rather than refusing, routing a typo'd door through the app's D3
  split. `/api/demo` migrated with its numbers byte-for-byte;
  `check_demo_rate_limit` stays as a thin wrapper for one release.
- **`rate_limit_invariants.sql`** — 5 invariants, clean pass: the
  per-key window refuses with an honest retry_after; the window is a
  DELETE (expiry re-admits, the prune sweeps); THE GLOBAL PIN; the
  mechanism's own boundary (unknown-scope raise, zero-policy pin both
  roles, direct INSERT refused); demo's caps unchanged. **Control run
  verified**: the function rebuilt WITHOUT the global branch — the
  fresh key's check LANDED with the day spent and the harness aborted
  at INVARIANT-FAIL (3), "the spend is unbounded"; drift and harness
  in one transaction, the abort rolling the rebuild back, the live
  function verified intact after.
- **The guards.** `lib/rate-limit/core.ts` (pure — the salted-hash
  boundary, its own 5-test harness: a raw IP, email, or token never
  reaches a bucket key) and `server.ts` (the D3 split and nothing
  else). Tier 1 fails CLOSED with 429 + Retry-After: the HM token
  door — rate-checked BEFORE the token is verified, keyed on token
  AND ip — and the portal door keyed on the external identity; the
  §30 verdict's endpoint, finally closed. Tier 2 fails OPEN with
  authored D5 sentences (outcomes, never Sentry events, per §59-D3):
  request-access, recovery (keyed on IP AND email hash — the same
  sentence whether or not the account exists), sign-in (no global
  cap by design), sign-up, and the candidate portal's four writes
  behind one token-keyed guard. Every fail-open path captures to
  Sentry, so "the limiter was down" is a fact held, not assumed.
- **Turnstile (D4)** — wired env-gated end to end on
  `/request-access`: no keys → no widget, no verification; an outage
  fails open with a capture; a wrong token is refused. **The keys are
  the founder's one open item on this slice** — provision at
  Cloudflare, add the secret normally and the SITE key
  `--no-sensitive` (§59's trap), and the captcha is live with no
  deploy.

### Driven live on production

1. **The HM door end-to-end**: two real submissions through the real
   token door landed (reviews persisted, the interpreter's runs
   landing under its own name, the counters at 3 with a
   parser-refused attempt honestly counted); the bucket pre-loaded to
   its ceiling → the third submission refused **429** with the D5
   sentence VERBATIM and `Retry-After: 2237` matching its own "38
   minutes"; the reviews count did not move; the bucket deleted (what
   expiry does) → the next submission landed. The window rolls live.
2. **Sign-in**: three real bad-password attempts counted against the
   IP hash — the SAME hash as the HM door's ip bucket, one caller
   one identity across scopes — then refused at the ceiling with the
   sentence verbatim.
3. **Recovery, both keys separately**: the IP key's sentence on a
   fresh address once the location was spent; the EMAIL key's
   enumeration-safe sentence on the spent address — and the probe
   submitted the address IN DIFFERENT CASE, landing in the same
   bucket: `normalizeEmailKey` proven live.
4. **Access request**: a real application landed; the refusal
   sentence rendered verbatim; the global cap tripped live (a fresh
   key refused `reason: global` with an honest until-midnight retry).
5. **THE OUTAGE, simulated live** (~40s, EXECUTE revoked then
   restored): the money door answered **429 spending nothing**; the
   identity door passed THROUGH to the real credentials error — never
   the rate sentence; both fail paths captured with named scopes
   (`[rate-limit] check unreachable for sign_in_ip / hm_submit_token`).
   D3's split is not a design note; it is observed production
   behaviour.
6. **One defect found live, fixed in the drive (`6cebce0`)**: the
   marketing layout mounted NO Toaster — every toast.error on
   /request-access, the rate refusal included, rendered NOWHERE while
   the server-side refusal held. The §57 defect class again: a
   rarely-driven error path, silently broken since the form shipped.
   Sentry could not have seen this one (nothing threw); only driving
   the surface did.

**Teardown to baseline exactly on the first pass** — the scratch
project cascade, the drive's trail events, the scratch waitlist rows,
every drive bucket, and the interpreter's session chain; 15 users /
42 events / 1 report / `rate_limit` EMPTY, the founder's session the
only survivor.

### Phase 4 verdicts — drafted, for the founder to confirm

- **Turnstile keys — the slice's one open founder item**: the wiring
  is live and honestly absent until the keys exist. Five minutes at
  Cloudflare whenever wanted; no deploy needed.
- **Tier 3 (copilot, agent surfaces) stays deferred** (D8): every
  request has a name and every agent a kill switch; queue per-user
  ceilings behind first-client usage data.
- **The Vercel WAF as later belt-and-braces** (D8 stands): a coarse
  outer layer that drops floods before they reach a function;
  plan-gated, founder-hand, complementary — not a replacement for a
  limiter that can tell money from identity.
- **The toast-less marketing layout — surfaced as a class**: two
  slices, two silently-dead error surfaces (§57's schema 400, §61's
  toaster). The standing habit from §59 — smoke-run rarely-driven
  surfaces — earns its second data point.
- **The demo wrapper retires in 089**: `check_demo_rate_limit` and
  the orphaned `demo_rate_limit` table drop together once this
  release has settled; the route moves to the shared helper in the
  same change.

Deploys through `4awxher94` live; migration 088 applied via MCP and
checked in; tsc / vitest 806 (5 new) / eslint / build green. The
completion declaration waits on the verdicts above and the founder's
written confirmation; `NEXT-rate-limiting.md` is deleted only after
it.

Founder-owned, unchanged: the Resend DNS records at Namecheap, the
exposed Supabase access token, leaked-password protection
(Pro-gated), the remaining deferred build list (Resend → Stripe), the
Turnstile keys (new, this slice), the one orphaned 331-byte storage
object from §28's diagnosis, the stuck-mandate retry gap (§55), and
the intake and digest skills gaps.

---

## 62. Rate-limiting verdicts confirmed — the slice is complete — 2026-08-24

The founder confirmed all five §61 verdicts as drafted: the Turnstile
keys stay the slice's one open founder item (the wiring live and
honestly absent until they exist — the secret added normally, the
site key `--no-sensitive`, no deploy); Tier 3 per-user ceilings stay
deferred behind first-client usage data; the Vercel WAF stands
recorded as later belt-and-braces, complementary to a limiter that
can tell money from identity; the dead-surface defect class enters
the record with its second data point (§57's schema 400, §61's
toast-less marketing layout — smoke-run rarely-driven surfaces,
because Sentry cannot see a toast that nothing throws); and the demo
wrapper retires in 089 together with the orphaned 061 table, the
route moving to the shared helper in the same change.

The definition of done is met. Every unauthenticated door the
product has now knocks against a counter whose caps are data, whose
windows are keys, and whose only API is one SECURITY DEFINER
function behind zero-policy RLS; no raw IP, email, or token ever
reaches a bucket. The endpoint the §30 verdict named a programme ago
— anonymous strangers triggering paid interpreter runs — refuses at
its ceiling with an honest sentence and an honest Retry-After,
proven live with real submissions through the real token door. And
the slice's one genuinely novel decision — money fails closed,
identity fails open — is not a design note but observed production
behaviour: during a real forty-second limiter outage the billed door
answered 429 spending nothing while sign-in passed through to the
real credentials error, both fail paths captured under named scopes.

**The rate-limiting slice is complete.** `NEXT-rate-limiting.md`
deleted per its own instruction. Next migration is **089**.

Founder-owned, unchanged: the Resend DNS records at Namecheap, the
exposed Supabase access token, leaked-password protection
(Pro-gated), the remaining deferred build list (Resend → Stripe), the
Turnstile keys (§61), the one orphaned 331-byte storage object from
§28's diagnosis, the stuck-mandate retry gap (§55), and the intake
and digest skills gaps.

---

## 63. The channel opens — Resend built, proven live, awaiting verdict sign-off — 2026-08-24

Third item of the deferred list (plan in `NEXT-resend.md`, D1–D8
confirmed 2026-08-24). Migration **089** (§62's confirmed cleanup)
rode along; **next is 090**. Phase 0's reframe held: the channel was
already BUILT — client code, key, and marketplace install all
predated the slice — and the entire blocker was DNS.

### The gate, as it actually closed (three rounds, each diagnosed)

1. First check: only DKIM in the zone — the SPF TXT and MX on host
   `send` absent at Namecheap's AUTHORITATIVE server (not
   propagation; the source answering directly). 2. Records landed on
   the second attempt — verified by dig against the authoritative NS
   — but Resend still 403'd: its verification state lagged the zone.
   3. With DNS provably green and the dashboard reading Verified,
   the 403 persisted — **the 115-day-old production API key belonged
   to a DIFFERENT Resend account than the newly-verified domain.** A
   fresh key from the verified account, rotated into env, opened the
   channel on the first probe. Recorded as doctrine: a key sends
   only from domains verified in ITS OWN account; "the dashboard
   says verified" and "this key can send" are different facts.

### What landed (`0a042e6` and the drive)

- **The scheduled sweep — §58's promise kept, no migration.** The
  cron route's documented socket filled: Mondays UTC (the schedule's
  own clock), `?sweep=force` behind CRON_SECRET for drives. The
  sweep signs in THE SEARCH HEALTH AGENT, enumerates active mandates
  under the agent's OWN RLS, runs both judgments per mandate
  sequentially (a parallel burst is a bill spike) with **trigger
  `scheduled` — 087's reserved value, spent at last** — and sends
  the founder allowlist one digest whose honesty rules have their
  own 6-test harness: every mandate listed once whatever happened,
  failures say FAILED, a suspended agent still produces a digest
  saying so.
- **089**: demo wrapper + orphaned 061 table dropped; `/api/demo` on
  the shared limiter; invariants re-ran clean and gained retirement
  pins.
- **send.ts joined Sentry (D4)**: refused/network sends capture with
  recipient COUNTS and status codes only — proven live the same day
  by the slice's own 403s.
- Both on-demand seams gained the trigger parameter (mechanical).

### Driven live on production (deploy `mqtqs5pf6`)

1. **First delivery in the product's history**: the waitlist ping —
   submitted through the real form, `POST /request-access` flipping
   from `error` to `info` in the same log that had recorded 403s all
   day. Three founder inboxes received it.
2. **The forced sweep**: one scratch active mandate → `{ran: true,
   mandates: 1, digest: "sent"}`; the report row under the agent's
   name, the suggestions blob landed (at_risk — the empty pipeline's
   honest reading), BOTH events under "Search Health Agent" with
   `trigger: scheduled`, zero agent sessions after.
3. **The suspended sweep**: agent suspended → `{mandates: 0,
   agent_refused: true, digest: "sent"}` — no judgments, no writes
   (events and reports counts unmoved), and the SKIPPED digest still
   delivered: the kill switch covers the scheduled face, and the
   monitor does not go silent when its subject is down.
4. **Rotations recorded**: RESEND_API_KEY (the cross-account fix)
   and CRON_SECRET (needed for the drive; Vercel Cron reads the env
   var, so rotation is free) — both in Vercel production and
   `.env.local`.

**Teardown to baseline exactly** — scratch project cascade, drive
events, probe waitlist rows, buckets, the agent's session chain, the
durable projects' statuses restored (paused during the drive so the
sweep saw only scratch), and the SQL suspend/restore's two
member_status_changed rows swept by hand; 15 users / 42 events / 1
report, the founder's session the only survivor.

### Phase 4 verdicts — drafted, for the founder to confirm

- **Next Monday is the sweep's first natural run** (06:00 UTC): both
  durable mandates judged, one digest. Nothing to do; stated so it
  is expected rather than a surprise.
- **The invitation and portal-link surfaces** share the now-proven
  send door and their product logic was proven in their own slices;
  they were not re-driven end-to-end. First real use will be their
  live proof, now observable in Sentry if it fails.
- **The GoTrue SMTP switch** stays surfaced, founder-hand (Supabase
  dashboard), unblocked as of today.
- **Sentry alert routing** (§60) is now unblocked — Sentry-side
  config, founder-timed.
- **The two-accounts trap enters doctrine**: provider keys and
  provider resources must be verified to live in the SAME account;
  age of a working-looking key proves nothing.

Migration 089 applied via MCP and checked in; tsc / vitest 812 /
eslint / build green. Completion waits on the verdicts above and the
founder's written confirmation; `NEXT-resend.md` is deleted only
after it.

Founder-owned, unchanged: the exposed Supabase access token,
leaked-password protection (Pro-gated), Stripe (the deferred list's
last item), the Turnstile keys (§61), the one orphaned 331-byte
storage object, the stuck-mandate retry gap (§55), and the intake
and digest skills gaps. The Resend DNS item — carried since §7 —
comes OFF the list.

---

## 64. Resend verdicts confirmed — the slice is complete; Stripe deferred to product-development's end — 2026-08-24

The founder confirmed all §63 verdicts as drafted: next Monday's
06:00 UTC run is the sweep's first natural pass (expected, not a
surprise); the invitation and portal-link surfaces stand on the
proven send door with first real use as their live proof,
Sentry-visible on failure; the GoTrue SMTP switch and Sentry alert
routing are unblocked and founder-timed; the two-accounts key trap
enters doctrine.

**One sequencing decision, made here**: Stripe — the deferred list's
last item — is NOT next. The founder's call: Stripe lands as the
LAST phase of product development, after the remaining product work,
not before it. The infrastructure arc that began at §59 closes at
three of four (Sentry ✓, rate limiting ✓, Resend ✓), with Stripe
parked deliberately.

The definition of done is met. The product can speak: three wired
surfaces deliver, the fourteen-agent map's one scheduled judgment
runs on its own clock under its own kill switch with 087's reserved
vocabulary spent, delivery failures land in Sentry rather than only
in grep, and the DNS item carried since §7 is off the founder's
list.

**The Resend slice is complete.** `NEXT-resend.md` deleted per its
own instruction. Next migration is **090**.

Founder-owned, unchanged: the exposed Supabase access token,
leaked-password protection (Pro-gated), the Turnstile keys (§61),
Stripe (parked to product-development's end), the one orphaned
331-byte storage object, the stuck-mandate retry gap (§55), and the
intake and digest skills gaps.

---

## 65. The stuck mandate learns to say so — retry surface built, proven live, and the gap's living victim found — 2026-08-24

First slice of product development (the founder's queue, §64's
sequencing standing). Plan in `NEXT-intake-retry.md`, Phase 0 run
2026-08-24, D1–D8 confirmed in writing the same day. One migration
(**next is 091**):

- **090 — one nullable column, no policies, no grants.**
  `projects.intake_error text` — NULL while analyzing and after
  success; a sentence means the page owes the recruiter honesty.
  Every write rides existing UPDATE policies. The trail needed NO
  migration: `intake_analyzed` was already in the CHECK and
  `record_agent_event` passes detail through — `trigger: "retry"`
  is vocabulary, not schema.

**What landed (`c3c1ef9`).** The job-spec failure arc, applied to
the mandate row. Three writers, all honest: the seam's human half
marks `failed` and `agent_unavailable` under the recruiter's cookie
session (the markGenerationFailed precedent — the agent's writes
stay judgment-only, and the refused case HAS no agent session to
sign with, which is the tell that marking is human bookkeeping);
the poller's window now MARKS instead of silently abandoning
(`markIntakeTimedOut`, guarded on "analysis still absent AND no
marker" so a landed run is never clobbered); and the agent's
success UPDATE clears the marker atomically with the title landing,
so a slow run arriving after a timeout marker leaves no stale
sentence. The retry (`retryIntakeAnalysisAction`) is the
recruiter's act through creation's own gate (mandates:write), with
the MARKER AS THE LATCH: retry is only offered from the
marked-failed state, and the guarded UPDATE that clears it decides
who fires the paid call — double-clicks and concurrent tabs
coalesce without a new index. The kill switch answers the CLICK: a
fast sign-in pre-flight (~the seam's own 400ms refusal) turns a
suspended agent into a thrown D5 sentence the button toasts —
the retry click has a reader present, unlike the fire-and-forget
create — at the deliberate cost of one extra GoTrue mint+revoke
per retry click. Surfaces: the project page swaps the eternal
skeleton for an honest failed block (the sentence verbatim, the
brief intact, Retry capability-gated; title, breadcrumb, company
line and agent-stack meta all stop echoing "Analyzing…"), and the
Mandates list renders a marked row as "Analysis failed — open to
retry". Sentences are authored constants in `lib/ai/intake-failure.ts`
(no server-only, so the harness reaches them), pinned in BOTH
directions per §59's doctrine: authored text passes
`safeFailureMessage` untouched, the §57-shaped provider body is
replaced. The poller re-arms its window when the effect re-arms —
the component survives router.refresh(), and without the reset a
retry's fresh run would have been timed out instantly by the old
clock.

### Driven live on production (deploy `mandate-lbb8vlj5l` = `c3c1ef9`)

Scratch world 0e0 inside Mandate HQ: an is_founder operator
(§30/§6 recipe), the Intake Agent suspended from /ops by the
operator's click. The acts:

1. **Open a mandate under the suspended agent** → the page landed
   on the placeholder and turned HONEST in ~4s: h1 "Intake
   analysis failed", company "—", the brief intact, the refusal
   sentence VERBATIM in the alert, Retry present. The row: marker
   set, zero events, zero clients, zero agent sessions (D5 held).
2. **Retry while suspended** → the D5 sentence in a TOAST at click
   time (the pre-flight refusing), the marker untouched, nothing
   else moved.
3. **Restore → retry** → "Retry started" toast, landed in ~22s:
   title "VP of Data Platforms", client "Nerivane Systems" born
   under the OPERATOR and linked, marker cleared by the success
   UPDATE, ONE `intake_analyzed` event under "Intake Agent" with
   **trigger "retry"**, input_chars 105, zero agent sessions after.
   One judgment, two signatures — §55's split, now with the retry
   named in the trail.
4. **The timeout arc** — an SQL-crafted placeholder with no run in
   flight: the poller waited its window out and MARKED it ("Intake
   analysis timed out. Please retry."), the honest block rendered,
   and the Mandates list showed "Analysis failed — open to retry"
   over "—" while the analyzed row beside it showed its real title.

**Teardown to baseline exactly** — with one new trap recorded: the
§30 account flip's single UPDATE fires FOUR member-change trigger
events (org, role, status, founder), actor NULL, member named in
detail — the suspend/restore two-event rule generalises to the
creation flip, sweep on `detail->>'member'`. Also reconfirmed: a
data-modifying CTE cannot see a same-statement trigger's insert
(the §30 flip must be its own statement), and counts read inside a
deleting statement read the pre-delete snapshot — verify with a
fresh statement. Final state: 42 events, 15/15 users, 2 projects,
1 client, 1 report, 0 marked rows, the founder's session and
5-token chain the only survivors.

### The drive's real find: the gap's living victim

The Mandates list showed a THIRD "Analyzing…" row that was nobody's
scratch: **`2fc2bad8-…`, the founder's own mandate, opened
2026-08-12** — "Head of Prime Brokerage IT in Capital Markets
Investment Banking" — stuck at the placeholder for twelve days,
since before the intake agent conversion. Phase 0's D8 claim ("the
durable baseline carries no stuck mandate") was WRONG; the drive
corrected it. The row was left UNTOUCHED — it is the founder's
record, and the surface now handles it without backfill: opening
its page lets the window close, the marker lands, and Retry
appears.

### Phase 4 verdicts — drafted, for the founder to confirm

- **The definition of done** — a failed or refused intake now says
  so on every surface that used to lie, the retry is proven in both
  directions live, and the trail names retries. Confirmation closes
  the slice.
- **The found mandate `2fc2bad8-…` is the founder's act**: open it
  and let the surface mark it, then Retry (the brief is intact) —
  or close it. Recommended as the slice's first real use; nothing
  was done to it this session.
- **The pre-flight cost stands recorded**: one GoTrue mint+revoke
  per retry click buys the kill switch a voice at click time.
  Cheap at this volume; revisit only if retries somehow become hot.
- **The latch's concurrency claim is design-and-test-pinned, not
  driven**: a single browser cannot honestly race itself; the
  guarded-UPDATE shape is the job-spec `wasExisting` precedent and
  the second click's `started: false` path is exercised in code
  review terms only. Recorded, not hidden.
- **Deferred stands**: the intake skills-injection one-liner stays
  its own queue item (`applySkillsToPrompt`, the job-spec seam's
  precedent); no cron sweep of stuck mandates — the poller plus
  marker close the loop without one.

Deploy `mandate-lbb8vlj5l` live on getmandate.io; migration 090
applied via MCP and checked in; tsc / vitest **815** (3 new) /
eslint / build green. Drive prefix 0e0 spent; next is 0e1. The
completion declaration waits on the verdicts above and the
founder's written confirmation; `NEXT-intake-retry.md` is deleted
only after it.

Founder-owned, unchanged: the exposed Supabase access token,
leaked-password protection (Pro-gated), the Turnstile keys (§61),
Stripe (parked to product-development's end), the one orphaned
331-byte storage object, the stuck mandate `2fc2bad8-…` awaiting
the founder's own retry, and the intake and digest skills gaps.

---

## 66. Retry verdicts confirmed — the slice is complete, and the gap's living victim is analyzed — 2026-08-24

The founder confirmed all five §65 verdicts as drafted, and in the
same breath delegated the found mandate's retry. Both are done.

**The retry of `2fc2bad8-…`, driven through the product's own
surface** (scratch operator 0e1, torn down after): opening the page
armed the poller; the window closed and the surface marked the
twelve-day-old row honestly ("Intake analysis timed out. Please
retry."); the Retry click landed the analysis in ~25s. The mandate
now reads **"Head of Prime Brokerage IT"**, the trail carries its
first event — `intake_analyzed` under the Intake Agent with
**trigger "retry"** — and a client row was born: **"Capital Markets
Investment Bank", created_by the FOUNDER**, because the seam hands
`resolveClientId` the MANDATE's creator, not the clicker; the
delegated click produced exactly the rows the founder's own click
would have. The client's name is the brief's generic descriptor
(the model judged company_identified true) — renaming it to the
real bank in /app/clients is the founder's editorial act, noted,
not a defect. Teardown swept the operator's chain and the creation
flip's four member events (the §65 trap, applied); the durable rows
stayed.

**New durable baseline: 43 events** (the retry event is the
founder's mandate's first) **and 2 clients** ("Capital Markets
Investment Bank" joins). 15/15 users, 2 projects, 1 report, the
founder's session — and, for the first time since 2026-08-12,
**zero mandates stuck at "Analyzing…" and zero marked rows** in the
product.

The definition of done is met, twice over. The slice: a failed or
refused intake now says so everywhere it used to lie — the marker,
the block, the list line, the toast — and the retry is the
recruiter's own gated act, latched against double-spend, with the
kill switch answering the click itself. The proof: the §55 gap's
oldest real victim — the founder's own mandate — was recovered
through nothing but the shipped surface: no SQL touched the row;
the poller marked it, the button retried it, the agent signed it.

**The stuck-mandate retry slice is complete.**
`NEXT-intake-retry.md` deleted per its own instruction. Next
migration is **091**; next drive prefix is 0e2; next handoff § is 67.

Founder-owned, unchanged: the exposed Supabase access token,
leaked-password protection (Pro-gated), the Turnstile keys (§61),
Stripe (parked to product-development's end), the one orphaned
331-byte storage object, the "Capital Markets Investment Bank"
client rename (editorial, whenever), and the intake and digest
skills gaps — the intake one-liner now the queue's likely next
head.

---

## 67. Intake becomes steerable — the skills gap's third sighting closed, proven by a steered title — 2026-08-24

The queue's head on the founder's word (§66). The design was
pre-confirmed doctrine, not a new decision: §56 recorded "intake
becomes steerable with one seam line whenever wanted," and the line's
shape is §30/§50 standing — `applySkillsToPrompt` riding the AGENT's
OWN session client, because inside `after()` there are no cookies and
omitting the client silently strips every skill (the §30 latent
defect this injector's own comment warns about). No migration; the
counter stays at 091. The intake agent's skills read was lawful since
086 (074's `skills_agent_select` — the §55 probe matrix already
showed skills 5).

**What landed (`c6ab31a`, copy fix `2bfec59`).** One seam line plus
its import in `runIntakeAnalysisAndPersist`: the system prompt now
carries the org's active skills. At intake time the mandate has no
client_id yet, so client-scoped skills stay quiet BY DESIGN — search
skills and the project's role skills fire (a role skill for a mandate
being born can only exist on a retry, which is now a real path). And
one honesty rider: Skills Studio's copy claimed skills reach "all six
AI agents" in three places — stale long before this slice and wronger
after it. The copy now says what stays true without a number
("injected into every AI agent run").

### Driven live on production (deploy `mandate-3rn3xdmh9` = `c6ab31a`)

Scratch world 0e2: an is_founder operator authored a skill through
the REAL Skills Studio form — "0e2 Steering Probe", search_skill,
trigger gated on the nonce token `zephyrline`, instruction "set
role_title to exactly 'Director of Platform Reliability (Steered)',
leave every other field faithful" — then opened a mandate through the
real form whose brief SAID "Head of Site Operations for Bramwell
Foundry … zephyrline …". The analysis landed in ~25s reading
**"Director of Platform Reliability (Steered)"** — the recruiter's
sentence overrode the brief's stated title — while company_name and
the client row stayed faithful ("Bramwell Foundry", born under the
operator): the steer was surgical, not a blast radius. The nonce
trigger kept the skill inert for any other run. Teardown to baseline
exactly on the first pass (skill, mandate, client, operator chain,
the flip's four member events; 43 events / 15 users / 2 projects /
2 clients / 5 skills / founder's session).

### Phase 4 verdicts — drafted, for the founder to confirm

- **The definition of done** — the third sighting closes: intake now
  reads the same recruiter-authored skills as every other judgment,
  under the same session-client doctrine, proven by a live steer
  through the product's own surfaces end to end.
- **Client-scoped silence at intake stands as design**: no client is
  known while the mandate is being born; a client skill that should
  shape intake can be authored as a search skill with a trigger.
  Recorded, not a gap.
- **The digest one-liner is now the skills gap's last sighting**
  (§47 standing: the digest writer is the one model call without
  injection) — same shape, founder-timed.
- **The Skills Studio copy is now count-free** — the enumerated
  "six agents" card had been wrong for eleven slices; a count in UI
  copy is a dead-surface defect waiting to happen, and the fix is to
  stop counting.

Deploys `mandate-3rn3xdmh9` and `mandate-o33hkfly3` live; no
migration; tsc / vitest 815 / eslint / build green. Drive prefix 0e2
spent; next is 0e3. The completion declaration waits on the verdicts
above and the founder's written confirmation.

Founder-owned, unchanged: the exposed Supabase access token,
leaked-password protection (Pro-gated), the Turnstile keys (§61),
Stripe (parked to product-development's end), the one orphaned
331-byte storage object, the "Capital Markets Investment Bank"
client rename (editorial), and the digest skills gap — the last of
its kind.

---

## 68. Intake-skills verdicts confirmed — the slice is complete — 2026-08-24

The founder confirmed all four §67 verdicts as drafted: the third
sighting closes with intake reading recruiter-authored skills under
the standing session-client doctrine, proven by a live steer;
client-scoped silence at intake stands as design; the digest
one-liner is the skills gap's last sighting, founder-timed; and the
Skills Studio copy stays count-free — UI counts are dead-surface
defects, and the fix is to stop counting.

**The intake skills-injection slice is complete.** No NEXT file
existed for a one-liner whose design was §56's standing verdict;
nothing to delete. Migration counter unchanged at **091**.

---

## 69. The digest reads the recruiter's skills — the gap's LAST sighting closed, proven by a steered headline — 2026-08-24

On the founder's word in the same breath as §68's confirmation. The
same standing doctrine, the last surface: §47 recorded the digest as
"the one model call without skills injection" — true through eleven
subsequent slices, closed now. No migration; the counter stays at
**091**. The digest agent's skills read was lawful all along —
`skills_agent_select` (074) gates on `is_agent()` role-wide, not
per-principal; what was missing was only the seam line.

**What landed (`e831732`).** `generateDeskDigest` gains an optional
skills context threaded from `runDeskDigestAndPersist`: the agent's
own session as the client (§30's after()-has-no-cookies lesson), and
`projectId: null` BY NATURE — a desk digest belongs to no mandate,
so org-wide search skills (and pre-049 null-client client skills)
fire while role skills stay silent by design. The pure generator
stays callable without context, which is what keeps it testable.

### Driven live on production (deploy `mandate-fwp130lz6` = `e831732`)

Scratch world 0e3: an is_founder operator authored "0e3 Digest
Steering Probe" through the real Skills Studio form — search_skill,
trigger "ONLY when composing a desk digest", instruction "begin the
headline with exactly 'STEERED-0E3:'" — then clicked Generate digest
on the real desk. The digest landed in ~25s with its headline
reading **"STEERED-0E3: The desk carries 2 active mandates…"** — the
recruiter's sentence at the head of the agent's document, the rest
faithful to the rollup (2 mandates, both the founder's, zero
placements — no motion manufactured). The row under "Desk Digest
Agent", the event under the same name with trigger "generate", zero
agent sessions after. Teardown to baseline exactly on the first pass
(the digest row and its event both keyed on KNOWN-ZERO baselines —
0 digests, 0 digest events; the skill, the operator chain, the
flip's four member events): 43 events / 15 users / 2 projects /
2 clients / 5 skills / 0 digests / the founder's session.

### Phase 4 verdicts — drafted, for the founder to confirm

- **The definition of done** — every model call in the product now
  reads recruiter-authored skills: the gap recorded at §47 and
  sighted at §55 and §56 has no remaining surface. Skills Studio's
  count-free copy ("every AI agent run") became true the moment this
  landed.
- **The digest's org-wide-only scope stands as design**: a desk
  digest belongs to no mandate and no client; role skills silent,
  search skills authoritative. Recorded, not a gap.
- **The steering probes are now a house pattern**: a nonce-triggered
  search skill plus one real run is a cheap, surgical, teardown-clean
  proof that skills reach any seam — worth reusing when the next
  seam joins.

Deploy `mandate-fwp130lz6` live; no migration; tsc / vitest 815 /
eslint / build green. Drive prefix 0e3 spent; next is 0e4. The
completion declaration waits on the verdicts above and the founder's
written confirmation.

Founder-owned, unchanged: the exposed Supabase access token,
leaked-password protection (Pro-gated), the Turnstile keys (§61),
Stripe (parked to product-development's end), the one orphaned
331-byte storage object, and the "Capital Markets Investment Bank"
client rename (editorial). The skills gap list is now EMPTY.

---

## 70. Digest-skills verdicts confirmed — the slice is complete; the skills gap list is empty — 2026-08-24

The founder confirmed all three §69 verdicts as drafted: the gap
recorded at §47 has no remaining surface — every model call in the
product reads recruiter-authored skills, and Skills Studio's
count-free copy became true the moment the digest line landed; the
digest's org-wide-only scope stands as design (no mandate, no
client — role skills rightly silent); and the nonce-triggered
steering probe enters the house pattern book — a cheap, surgical,
teardown-clean proof that skills reach any seam, to be reused
whenever a new seam joins.

**The digest skills slice is complete.** No NEXT file existed for
the one-liner; nothing to delete. Migration counter unchanged at
**091**. The founder's same message picked the next slice: the HM
override selector (§49) — Phase 0 run and D1–D8 drafted in
`NEXT-hm-override.md`, the build gated on written confirmation.

---

## 71. The HM override gets its selector — §49's gap closed, both trail faces driven — 2026-08-24

The §49/§50 standing gap (plan in `NEXT-hm-override.md`, D1–D8
confirmed 2026-08-24). A UI-threading slice exactly as drafted: no
migration (the counter stays **091**), no grants, no seam change —
the server boundary was built and proven refusing at §49; this slice
gave it the surface it was built for.

**What landed (`9dbd3bc`).** The page threads the FULL valid
stakeholder list (the seam's own filter, so the selector offers
exactly the names the server will accept); the panel grows a
house-styled select that appears only when there is a choice (2+
stakeholders — byte-identical to before with 0 or 1), defaulting to
the stored report's subject when it still matches; the meta line
finally renders `report.hm_name` — the field placed on the report at
083 precisely so a dossier stays attributable, rendered nowhere until
now; and the D3 rule rides a pure helper (`overrideFor`, 5 tests):
the override name is passed ONLY when the selection differs from the
default, so the trail's `stakeholder_override: true` keeps meaning
"the recruiter chose".

### Driven live on production (deploy `mandate-rk1u7ydsf` = `9dbd3bc`)

Scratch world 0e4: a ready mandate ("Head of Quality Engineering",
fictional Vantrell Instruments) with TWO fictional stakeholders. The
acts:

1. **Research the default** (Corwin Aldenberg — CTO) → landed in
   ~95s: the meta line named the subject, and the event carried
   trigger `research`, **stakeholder_override false** — the §49
   face, unchanged by the selector's existence.
2. **Select the second and re-research** (Ilse Vantroska — VP
   Quality) → landed in ~80s: the subject FLIPPED on the meta line,
   the report replaced (one slot, a legible act), and the event
   carried trigger `re_research`, **stakeholder_override TRUE — the
   face §49 never drove, driven**. Both events under "Company
   Intelligence Agent"; a text-probe of the trail found NEITHER
   stakeholder name in any detail blob.
3. **The stale-name refusal** — the second stakeholder renamed by
   SQL while still selected on the open page → Re-research refused
   in ~1s with the seam's authored sentence VERBATIM in the toast
   ("Stakeholder "Ilse Vantroska" not found in this project."), NO
   third event, no session left behind.

Research-quality footnote, expected and honest: both dossiers led
with the agent's IDENTITY DISAMBIGUATION WARNING — fictional names
have no public footprint, and the agent said so rather than
inventing one (35 sources on the first run, all conservative
archetype reads). The drive proves the threading and the trail, not
the fiction.

**Teardown to baseline exactly on the first pass** — 6 events swept
(two hm_researched + the flip's four member events), the mandate,
the operator's chain; 43 events / 15 users / 2 projects / 2 clients
/ 5 skills / the founder's session.

### Phase 4 verdicts — drafted, for the founder to confirm

- **The definition of done** — a mandate with three stakeholders can
  now get a dossier on any of them; the report names its subject;
  the trail's override flag means what it says, proven in both
  directions live.
- **The one-slot report stands** (D4/D8 as confirmed): replacement
  is legible, not silent; per-stakeholder dossier STORAGE waits on
  usage.
- **The stale-selection face is the seam's sentence, kept**: a
  renamed stakeholder refuses by name at the toast — no silent
  fallback to the first stakeholder, which would research the wrong
  person quietly.
- **Long-action honesty — evidence extended, policy unchanged**:
  ~80–95s web runs, zero transport drops, consistent with f54f1e7.

Deploy `mandate-rk1u7ydsf` live; no migration; tsc / vitest **820**
(5 new) / eslint / build green. Drive prefix 0e4 spent; next is 0e5.
The completion declaration waits on the verdicts above and the
founder's written confirmation; `NEXT-hm-override.md` is deleted
only after it.

Founder-owned, unchanged: the exposed Supabase access token,
leaked-password protection (Pro-gated), the Turnstile keys (§61),
Stripe (parked to product-development's end), the one orphaned
331-byte storage object, and the "Capital Markets Investment Bank"
client rename (editorial).

---

## 72. HM-override verdicts confirmed — the slice is complete — 2026-08-24

The founder confirmed all four §71 verdicts as drafted: any
stakeholder is researchable with the report naming its subject and
the trail's override flag meaning what it says, proven in both
directions live; the one-slot report stands with replacement legible
and per-stakeholder storage deferred on usage; the stale-selection
face stays the seam's sentence — never a quiet wrong-person
research; and long-action honesty stands with the evidence extended
(~80–95s, zero drops) and the f54f1e7 policy unchanged.

**The HM override selector slice is complete.**
`NEXT-hm-override.md` deleted per its own instruction. Migration
counter unchanged at **091**. The founder's same message picked the
next slice: the onboarding surface conversion — Phase 0 to run,
D1–D8 to draft, the build gated on written confirmation.

---

## 73. A correction to §69 — the "every model call" claim was overstated — 2026-08-24

§69 (and §70's confirmation of it) declared the skills gap list
empty: "every model call in the product reads recruiter-authored
skills." The onboarding conversion's Phase 0 audit proved that claim
WRONG. The true scope was "every AGENT-PRINCIPAL seam": seven seams
still call the model with no skills injection —
`derive-calibration` (the onboarding surface's own judgment, running
under the recruiter's cookie session), the three executive-
intelligence generators (`generate-executive-success-profile`,
`generate-executive-interview-plan`, `run-executive-company-context`),
`generate-shortlist-report`, `run-candidate-search`, and
`run-sourcing-search`.

The claim is corrected here rather than papered over: the §-record
said something false for three sections and the correction is part
of the record. The onboarding conversion (Phase 0 below, D1–D8
drafted in `NEXT-onboarding-agent.md`) closes the first of the
seven; the remaining six queue by usage, founder-timed, and the
"skills gap list" reopens with exactly six entries.

---

## 74. The calibration signs its own name — the fifteenth principal, built, proven live, awaiting verdict sign-off — 2026-08-24

The onboarding surface conversion (plan in `NEXT-onboarding-agent.md`,
D1–D8 confirmed 2026-08-24) — the FIRST conversion outside the
fourteen-agent map, and the fourth zero-new-grant principal. One
migration (**next is 092**):

- **091 — vocabulary only**: `calibration_derived` into the CHECK
  (rebuilt from the LIVE pg_constraint list, 55 values) and the
  record_agent_event allowlist at SEVENTEEN. 074's role-wide pool
  covers the whole judgment: projects S+U, calibration_history
  INSERT, skills S. **`agent_calibration_invariants.sql`** — 5
  invariants, clean pass: the SPLIT lands honestly (the recruiter's
  answers and the sibling calibration keys survive the agent's
  merge); THE SNAPSHOT PIN (changed_by = the agent — derived weights
  attributable forever, the §30 interpreter precedent) plus the
  event's name-and-label pin; history intact at seventeen by COUNT;
  the negative matrix unchanged (clients zero, resolve_client births
  nothing, both trail doors refuse a recruiter, unknown type refused);
  kill switches independent at FIFTEEN. The control run TRIMMED
  `calibration_derived` from the allowlist ("the type is new, nobody
  records it yet") — the seventeen-probe loop aborted at
  INVARIANT-FAIL (3), drift and harness in one transaction, the
  abort rolling the trim back; allowlist and CHECK verified intact
  after.

**The seam (`ce54f3c`).** The split (D2): `submitOnboarding` stores
the sanitised answers under the RECRUITER's own session FIRST —
their answers are their act, persisted before the agent is asked to
think — then `runCalibrationDerivationAndPersist` signs the
fifteenth principal in, reads the row it lawfully sees, judges with
the org's skills in the prompt (D6 — the FIRST of §73's seven
uninjected seams closed), merge-writes ONLY dimension_weights +
weights_rationale, snapshots history under its own name, records
`calibration_derived` with the trigger and COUNTS (never text), and
signs out persisting nothing. Live account:
`vbreygin+calibration@gmail.com`, id `1df9d3b6-…`, Mandate HQ, §30
recipe; `AGENT_CALIBRATION_*` in Vercel production and `.env.local`.
**New durable baseline: 16 users, 46 events** (the fifteenth's
creation trail).

### Driven live on production (deploy `mandate-3i7azj55m` = `ce54f3c`)

Scratch world 0e5: an is_founder operator, an intake-shaped mandate
("Director of Manufacturing Systems", fictional Kestrel Foundry),
the REAL five-step onboarding wizard. The acts:

1. **Submit the wizard** → landed in ~20s: five dimension weights on
   the row, the sibling role_title untouched, the answers stored;
   the snapshot's **changed_by = "Calibration Agent"**; ONE
   `calibration_derived` event under the agent's name, trigger
   `initial`, counts 3/1/1/3; a text-probe of the whole trail found
   NEITHER the answers' text nor the stakeholder's name; zero agent
   sessions after.
2. **Suspended from /ops → resubmit** → the D5 sentence VERBATIM in
   the toast ("…Your answers are saved; re-run calibration when it
   is restored."), the answers surviving, no second event, no
   snapshot, nothing destroyed.
3. **Restored → steering probe → resubmit** → the rerun landed in
   ~20s with `weights_rationale` beginning **"STEERED-0E5:"** — a
   recruiter-authored skill provably steering the fifteenth
   principal's judgment on its first rerun — the second event
   carrying trigger `rerun`, the second snapshot under the agent.

**Teardown to baseline exactly on the first pass** — 8 events swept
(two calibration_derived, the suspend/restore pair, the flip's
four), the mandate, its two snapshots, the probe skill, the
operator's chain. Final: 46 events / 16 users / 15 agents /
2 projects / 2 clients / 5 skills / 0 history rows / the founder's
session.

### Phase 4 verdicts — drafted, for the founder to confirm

- **The definition of done** — the judgment that sets the scoring
  model every candidate is measured by no longer runs on ambient
  human identity: it signs its own name in the model blob's history,
  wears its own kill switch, is honest in refusal with the
  recruiter's answers safe, and reads the org's skills.
- **The role-spec surface is the nearest sibling** — the same file
  family, near-mechanical after this shape; queued by usage on the
  founder's word.
- **§73's list shrinks to SIX** — the remaining uninjected seams
  (three executive generators, shortlist report, candidate search,
  sourcing search), founder-timed.
- **Long-action honesty — nothing new to defer**: ~20s foreground
  runs, inside the proven range, zero drops.

Deploy `mandate-3i7azj55m` live; migration 091 applied via MCP and
checked in; tsc / vitest 820 / eslint / build green. Drive prefix
0e5 spent; next is 0e6. The completion declaration waits on the
verdicts above and the founder's written confirmation;
`NEXT-onboarding-agent.md` is deleted only after it.

Founder-owned, unchanged: the exposed Supabase access token,
leaked-password protection (Pro-gated), the Turnstile keys (§61),
Stripe (parked to product-development's end), the one orphaned
331-byte storage object, and the "Capital Markets Investment Bank"
client rename (editorial).

---

## 75. Calibration verdicts confirmed — the fifteenth principal is complete — 2026-08-24

The founder confirmed all four §74 verdicts as drafted: the scoring
model's judgment no longer runs on ambient human identity — it signs
its own name in the blob's history, wears its own kill switch, is
honest in refusal with the recruiter's answers safe, and reads the
org's skills; the role-spec surface stands as the near-mechanical
sibling, picked in the same breath; §73's uninjected-seam list
shrinks to six, founder-timed; and long-action honesty has nothing
new to defer.

**The onboarding surface conversion is complete.**
`NEXT-onboarding-agent.md` deleted per its own instruction. Next
migration is **092**. The role-spec conversion's Phase 0 follows —
NOT zero-new-grant this time (the agent needs a job_specs UPDATE
door), so the full gate applies.

---

## 76. The job spec signs its own name — the sixteenth principal, built, proven live, awaiting verdict sign-off — 2026-08-24

The role-spec surface conversion (plan in `NEXT-rolespec-agent.md`,
D1–D8 confirmed 2026-08-24) — the FIRST NEW-GRANT conversion since
087, and the first grant pinned on an EDITORIAL state. One migration
(**next is 093**):

- **092 — one grant, double-pinned, and the vocabulary.**
  `job_specs_agent_update` — UPDATE for is_agent() + org **with
  `is_final = false` in BOTH USING and WITH CHECK**: the agent can
  neither touch a finalized spec nor finalize one; the canonical
  version stays the recruiter's editorial act forever. NO INSERT
  (the versioned placeholder is the human's allocation), NO DELETE.
  `job_spec_generated` into the CHECK (rebuilt from the live list,
  56 values) and the allowlist at EIGHTEEN.
  **`agent_rolespec_invariants.sql`** — 5 invariants, clean pass:
  the judgment lands on the human's placeholder with the allocation
  surviving (version, created_by); attribution pins; history at
  eighteen by COUNT; THE IS_FINAL PIN both directions plus agent
  INSERT refused and the negative matrix; kill switches independent
  at SIXTEEN. The control run DROPPED the WITH CHECK conjunct
  ("USING already refuses finalized rows") — the agent FINALIZED a
  draft and the harness aborted at INVARIANT-FAIL (4); the two
  conjuncts guard different faces, and dropping either is the
  drift. Both pins verified intact live after.

**The seam (`616ffe3`).** The split stood as built — only the
judgment's identity moved: `generateAndStoreJobSpec` signs the
sixteenth principal in per run, reads the project and placeholder it
lawfully sees, judges with skills riding ITS session (no longer
borrowing the recruiter's cookies inside after()), lands the draft
through 092's pinned door, and records `job_spec_generated` with
trigger/version/sections count — never the spec's text. FAILURE
BOOKKEEPING STAYS HUMAN (the 090 doctrine): a refused agent lands
its D5 sentence in generation_error via the cookie session — the
refused case HAS no agent session to sign with, which is the tell.
Live account: `vbreygin+rolespec@gmail.com`, id `ec4d9072-…`,
Mandate HQ, §30 recipe; `AGENT_ROLESPEC_*` in Vercel production and
`.env.local`. **New durable baseline: 17 users, 49 events.**

### Driven live on production (deploy `mandate-kooae68g0` = `616ffe3`)

Scratch world 0e6: a calibrated mandate ("Head of Treasury
Technology", fictional Marlowe Clearing). The acts:

1. **Generate Job Spec** → V01 landed in ~55s (6.2k chars), the
   event under "Role Spec Agent", trigger `initial`, version 1,
   sections 5, no text leak.
2. **Suspended from /ops → Re-run AI** → the error view rendered
   "V02 generation failed" with the D5 sentence VERBATIM and Retry —
   the human bookkeeping marked the row while V01's draft stood
   untouched below.
3. **Restored → Retry** → V03 landed clean (V02 keeps its honest
   failure record — versions never lie), the second event carrying
   trigger `regenerate`, version 3.
4. **The recruiter finalized V03** through the real confirm dialog —
   then the LIVE PIN PROBE (the agent's identity against the live
   rows, rolled back): its UPDATE on the finalized V03 landed
   NOWHERE, and its attempt to finalize the V01 draft landed
   NOWHERE — both faces of 092's pin answering on production rows.
5. **The steering probe** → V04's overview begins **"STEERED-0E6:"**
   — recruiter skills provably riding the agent's OWN session.

**Teardown to baseline exactly on the first pass** — with one
refinement recorded: a mid-drive SQL restore (instead of /ops) wrote
a NULL-actor member_status_changed naming the AGENT; the sweep keyed
it by VALUE (`from = 'suspended'`), which cannot collide with the
durable creation trail (`from = 'pending'`) — value keys, never time
windows, extended to trigger-written residue. Final: 49 events /
17 users / 16 agents / 2 projects / 2 clients / 5 skills / 1 spec
(the founder's May demo) / the founder's session.

### Phase 4 verdicts — drafted, for the founder to confirm

- **The definition of done** — the job-spec judgment signs its own
  name with its own kill switch, and the editorial boundary is a
  database pin proven live in both directions, not an app-side
  promise: no agent can touch or author the canonical version.
- **AGENTS.md #1–#5 are now all principals** — intake, company
  research, onboarding/calibration, role spec, and the map's
  original fourteen. The remaining conversions (read-shaped
  shortlist/copilot) and §73's six uninjected seams queue by usage,
  founder-timed.
- **The version ledger's honesty stands**: a failed V02 keeps its
  failure record rather than being reused — versions never lie
  about what happened; recorded as design, not waste.
- **Long-action honesty — evidence extended**: ~55s spec runs
  behind the polling skeleton, zero drops; f54f1e7 unchanged.

Deploy `mandate-kooae68g0` live; migration 092 applied via MCP and
checked in; tsc / vitest 820 / eslint / build green. Drive prefix
0e6 spent; next is 0e7. The completion declaration waits on the
verdicts above and the founder's written confirmation;
`NEXT-rolespec-agent.md` is deleted only after it.

Founder-owned, unchanged: the exposed Supabase access token,
leaked-password protection (Pro-gated), the Turnstile keys (§61),
Stripe (parked to product-development's end), the one orphaned
331-byte storage object, and the "Capital Markets Investment Bank"
client rename (editorial).

---

## 77. Role-spec verdicts confirmed — the sixteenth principal is complete — 2026-08-24

The founder confirmed all four §76 verdicts as drafted: the job-spec
judgment signs its own name with the editorial boundary a database
pin proven live in both directions; AGENTS.md #1–#5 are all
principals, with the read-shaped shortlist/copilot conversions and
§73's six uninjected seams queued by usage; the version ledger's
honesty stands as design; and long-action honesty has nothing new to
defer.

**The role-spec surface conversion is complete.**
`NEXT-rolespec-agent.md` deleted per its own instruction. Next
migration is **093**. The founder's same message picked the next
slice — the shortlist conversion — and called the session boundary:
this session ends here at the founder's word, the next one primed
from this document and memory. Durable state at handoff: 17 users /
49 events / 16 agents / 2 projects / 2 clients / 5 skills / 1
job_spec; deploys through `mandate-kooae68g0`; main at the §77
commit; tsc / vitest 820 / eslint / build green.

---

## 78. The shortlist report signs its own name — the seventeenth principal, built, proven live, awaiting verdict sign-off — 2026-08-24

The shortlist conversion (plan in `NEXT-shortlist-agent.md`, D1–D8
confirmed 2026-08-24 with D3's post-submit refusal included) — the
SEVENTEENTH principal, the read-shaped conversion, and the second
grant pinned on an EDITORIAL state. One migration (**next is 094**):

- **093 — two policies, one door pinned, and the vocabulary.**
  `shortlists_agent_select` (the slate row IS the model input, and
  per the 082 doctrine an UPDATE without SELECT is INERT) and
  `shortlists_agent_update` — UPDATE for is_agent() + org **with
  `submitted_at IS NULL` in BOTH USING and WITH CHECK**: the agent
  can neither touch a SUBMITTED slate nor submit one — what was
  sent never silently changes, and submission stays the recruiter's
  editorial act forever. NO INSERT (the row's allocation is the
  human's act in ensureShortlist), NO DELETE.
  `shortlist_report_generated` into the CHECK (rebuilt from the
  live pg_constraint list, 57 → 58) and the allowlist at NINETEEN.
  **`agent_shortlist_invariants.sql`** — 5 invariants, clean pass:
  the judgment lands with the human's composition surviving
  (candidate_ids, narrative, slate_size, created_by, submitted_at
  still NULL); attribution pins; history at nineteen by COUNT; THE
  SUBMITTED PIN both directions plus agent INSERT refused and the
  negative matrix; kill switches independent at SEVENTEEN. The
  control run dropped the WITH CHECK conjunct ("USING already
  refuses submitted rows" — 092's exact drift, one table over) —
  the agent SUBMITTED a slate and the harness aborted at
  INVARIANT-FAIL (4), self-rolling-back. Both pins verified intact
  live after.

**The seam (`4a6f6d4`).** The split stood as composed — the slate,
the narrative, the slate size, and Submit stay the recruiter's acts
(persisted before the agent is asked to think; the builder even
auto-saves a dirty narrative first), and the `clients:share` gate
stays in the action (the §57 precedent). The judgment moved whole:
`runShortlistReportAndPersist` signs the seventeenth principal in
per run, reads the slate row and its context under ITS OWN session
(093's SELECT plus the pool's candidates / candidate_scores /
projects reads), judges with skills riding its session (D6 — the
SECOND of §73's six uninjected seams closed; the list is FIVE),
merge-writes ONLY report_content through the pinned door — with a
`.select()` making a zero-row landing LOUD, so a submit racing past
the read reports "submitted", never success — records
`shortlist_report_generated` with trigger/slate/scenarios COUNTS,
and signs out persisting nothing. The seam also answers the pin
BEFORE the spend: a submitted slate refuses honestly without
burning a model call. D5 is the foreground sentence through the
existing toast; there is no row-marking bookkeeping because this
surface has none to mark and needs none. Live account:
`vbreygin+shortlist@gmail.com`, id `99ae9e2c-…`, Mandate HQ, §30
recipe with a sign-in smoke test (session revoked after);
`AGENT_SHORTLIST_*` in Vercel production and `.env.local`. **New
durable baseline: 18 users, 52 events, 17 agents** (the
seventeenth's creation trail is THREE member events — org/role/
status; the §65 "four" includes the founder flip only when
is_founder changes, which an agent's flip never touches).

### Driven live on production (deploy `mandate-pzpl3rbut` = `4a6f6d4`)

Scratch world 0e7 inside Mandate HQ: an is_founder operator (Odile
Fairbrass), a seeded mandate ("Head of Market Surveillance",
fictional Aldgate Clearing Partners) with three fully-shaped ranked
candidates, plus a second mandate holding a fresh draft shortlist
for the pin probe. The acts, all through the real UI:

1. **Compose + Generate** → slate 02/03 through the pool buttons,
   narrative typed, Generate clicked → the report landed (~20s)
   with ONE event under "Shortlist Agent", trigger `initial`,
   detail slate 2 / scenarios 4 — counts, never names; zero agent
   sessions after.
2. **Regenerate** → the second event, trigger `regenerate`.
3. **Suspended from /ops by the operator's click → Regenerate** →
   the D5 sentence VERBATIM in the foreground toast ("The Shortlist
   Agent could not run — an operator has suspended it or its
   credentials are absent. Your slate and narrative are saved;
   generate the report when it is restored."), the prior report
   still rendering below it, no third event, nothing destroyed,
   refusal in ~4s with no model spend.
4. **Restored → steering probe** → a nonce-triggered search_skill
   planted, the nonce appended to the narrative, Regenerate → the
   executive summary begins **"STEERED-0E7:"** — recruiter-authored
   skills provably riding the seventeenth principal's own session.
5. **The recruiter finalized the submission** (their toast, their
   `shortlist_published` event, candidates advanced) — then the
   LIVE PIN PROBE (the agent's real identity against the production
   rows, self-rolled-back): its UPDATE on the SUBMITTED slate
   touched ZERO rows (USING), its attempt to stamp `submitted_at`
   on the fresh draft was REFUSED by name (WITH CHECK), and its
   INSERT was refused — all three faces of 093 answering on
   production rows. A text-probe of the whole trail found NO
   candidate name, NO steer token, NO report text.

**A finding for the record — the transport-drop mask.** The local
network dropped TWICE mid-run (ERR_NETWORK_CHANGED); both times the
client toast said "Failed to fetch" while the server run FINISHED
HONESTLY — report landed, event recorded, session revoked. The §38
evidence class (f54f1e7) extends to this surface: on a foreground
seam with no poller, a transport TypeError can dress a LANDED
report as a failure until reload. Recorded as evidence, not a
defect of this slice — the server side never lied, and the drops
were the operator's wifi, not the product.

**Teardown to baseline exactly on the first pass** — 10 events
swept by VALUE keys (the operator's four creation events, three
report events, the publish, and the agent's suspend/restore pair
keyed `from='active'/'suspended'` — which cannot collide with the
durable `from='pending'` creation trail; the census also recorded
that member events key by the member's NAME, not id). Final: 52
events / 18 users / 17 agents / 2 projects / 2 clients / 5 skills /
1 job_spec / 0 shortlists / zero scratch sessions.

### Phase 4 verdicts — drafted, for the founder to confirm

- **The definition of done** — the judgment that writes the
  client-facing submission narrative no longer runs on ambient
  human identity: it signs its own name in the trail, wears its own
  kill switch (proven live in ~4s, no model spend on refusal), is
  honest in refusal with the slate, narrative, and prior report
  untouched, and reads the org's skills under its own session.
- **The submission boundary is a database pin, proven live in both
  directions on production rows** — and the confirmed D3 refusal
  held: a submitted slate's report can no longer be regenerated by
  anyone's agent; the submitted report is the record. The seam
  refuses BEFORE the model spend, and detects the race after it.
- **§73's list shrinks to FIVE** — the remaining uninjected seams
  (three executive generators, candidate search, sourcing search),
  founder-timed. The read-shaped copilot conversion stays queued
  behind this slice.
- **Long-action honesty — evidence extended, nothing new to
  defer**: ~20s foreground runs inside the proven range; the two
  transport drops observed were local-network, with the server
  completing honestly both times; the "Failed to fetch masks a
  landed report until reload" note joins the §38 record.

Deploy `mandate-pzpl3rbut` live; migration 093 applied via MCP and
checked in; tsc / vitest 820 / eslint / build green. Drive prefix
0e7 spent; next is 0e8. The completion declaration waits on the
verdicts above and the founder's written confirmation;
`NEXT-shortlist-agent.md` is deleted only after it.

Founder-owned, unchanged: the exposed Supabase access token,
leaked-password protection (Pro-gated), the Turnstile keys (§61),
Stripe (parked to product-development's end), the one orphaned
331-byte storage object, and the "Capital Markets Investment Bank"
client rename (editorial).

---

## 79. Shortlist verdicts confirmed — the seventeenth principal is complete — 2026-08-24

The founder confirmed all four §78 verdicts as drafted: the
submission narrative's judgment signs its own name with its own
kill switch, honest in refusal with nothing destroyed; the
submission boundary is a database pin proven live in both
directions on production rows, with the confirmed D3 refusal
standing as design — the submitted report is the record; §73's
uninjected-seam list shrinks to five, founder-timed; and
long-action honesty has nothing new to defer, with the
transport-drop mask joining the §38 record as evidence.

**The shortlist conversion is complete.**
`NEXT-shortlist-agent.md` deleted per its own instruction. Next
migration is **094**. SEVENTEEN principals live. Remaining queue:
the read-shaped copilot conversion and §73's five uninjected seams
(three executive generators, candidate search, sourcing search),
by usage on the founder's word.

---

## 80. The copilot signs its own name — the eighteenth principal, built, proven live, awaiting verdict sign-off — 2026-08-24

The copilot conversion (plan in `NEXT-copilot-agent.md`, D1–D8
confirmed 2026-08-24) — the EIGHTEENTH principal (AGENTS.md #13),
the queue's last read-shaped conversion, and the FIFTH zero-new-grant
slice: every read the snapshot makes was already in the pool, 093's
shortlists SELECT completing the coverage. One migration (**next is
095**):

- **094 — vocabulary only.** `copilot_answered` into
  the CHECK (rebuilt from the live pg_constraint list, 58 → 59) and
  the allowlist at TWENTY. **`agent_copilot_invariants.sql`** — 5
  invariants, clean pass: READ COVERAGE by count (the slice's
  distinctive pin — feedback tail, shortlists, candidates, scores,
  the project row all visible to the agent); the act's attribution
  and counts-only detail; history at twenty by COUNT; the negative
  matrix including 093's submitted-pin answering under the
  eighteenth's session; kill switches independent at EIGHTEEN. The
  control run minted a NEW SHAPE: it regressed a POOL grant ANOTHER
  slice minted — `feedback_agent_select` (074) dropped in the
  harness transaction — and the coverage pin aborted at
  INVARIANT-FAIL (1) reading 0 of 2 feedback rows, self-rolling-back.
  The harness guards INHERITED coverage, not just its own migration,
  because a pool policy dropped in a future RLS cleanup is exactly
  how an assembled context dies silently.

**The defect §-recorded at Phase 0, repaired here:** the shortlist
context read selected a `label` column that never existed —
PostgREST errored from the day it shipped, the code swallowed it as
`shortlist: null`, and the copilot NEVER SAW A SHORTLIST. The §57
silently-dead class, third sighting. The read now selects the real
columns, and the drive proved the repair by content.

**The seam (`a92f3dd`).** The split (D2): the HUMAN DOOR stays at
the threshold — `authorizeCopilotAccess` proves the caller may ask
about the project under THEIR OWN cookie session (active member,
org match, the project readable by their RLS) before any agent
exists. Then `signInCopilotAgent` signs the eighteenth principal in
per request; the snapshot assembles under ITS session; skills ride
its session (D6); the model streams; ONE `copilot_answered` event
lands AFTER the stream completes (a failed or aborted stream
records nothing — no judgment landed) carrying the page-context
string and COUNTS, never the question or the answer; and signOut
revokes the session as the stream closes. The panel threads its
pathname so the event can say WHERE the recruiter was asking from.
Live account: `vbreygin+copilot@gmail.com`, id `4fdc3416-…`,
Mandate HQ, §30 recipe, sign-in smoke-tested and revoked;
`AGENT_COPILOT_*` in Vercel production and `.env.local`. **New
durable baseline: 19 users, 55 events, 18 agents** (the three-event
creation trail, the §78 count holding).

### Driven live on production (deploy `mandate-2uhi2n3p0` = `a92f3dd`)

Scratch world 0e8 inside Mandate HQ: an is_founder operator
(Casimir Ledbrook), a seeded mandate ("VP of Payments
Infrastructure", fictional Harwick Ledger Systems) with two ranked
candidates, one HM feedback row, and a one-candidate draft slate.
The acts, all through the real panel:

1. **"Who is on the shortlist right now, and is the slate
   balanced?"** → the answer opened "**Current shortlist: Wren
   Halloway only (1 of 3 slots filled)**" and reasoned from the
   actual slate, the actual weights, and the live HM feedback — the
   REPAIRED READ PROVEN BY CONTENT: no prior copilot could have
   said any of that. The event landed under "Copilot Agent",
   context `project`, messages 1, candidates 2 — counts only; zero
   agent sessions after.
2. **Suspended from /ops → asked again** → the D5 sentence VERBATIM
   in the panel's "⚠" bubble ("The Copilot Agent could not run — an
   operator has suspended it or its credentials are absent. Your
   conversation is safe on this device; ask again when it is
   restored."), refusal in seconds with no model spend, no event,
   the history intact on the device.
3. **Restored → steering probe from the RANKING page** → a
   nonce-triggered skill planted, the nonce typed into the question
   → the answer began **"STEERED-0E8:"** — recruiter-authored
   skills provably riding the eighteenth principal's session — and
   the second event carried context `ranking` (the pathname
   threading proven live), messages 5.
4. **The probe matrix** (the agent's real identity against
   production rows, self-rolled-back): clients 0, organizations 0,
   activity_events 0, users self-only, shortlists INSERT refused. A
   text-probe of the whole trail found NO candidate name, NO nonce,
   NO steer token, NO fragment of any question or answer.

**Teardown to baseline exactly on the first pass** — 8 events swept
by VALUE keys (the operator's four, the two answers, the agent's
suspend/restore pair keyed `from='active'/'suspended'`). Final: 55
events / 19 users / 18 agents / 2 projects / 2 clients / 5 skills /
1 job_spec / 0 shortlists / zero scratch sessions.

### Phase 4 verdicts — drafted, for the founder to confirm

- **The definition of done** — the product's most-available AI
  surface no longer runs on ambient human identity: every answer
  signs the Copilot Agent's name with WHERE it was asked from,
  wears its own kill switch (proven live in the panel, no model
  spend on refusal), and reads the org's skills under its own
  session, with the human door intact at the threshold.
- **The read-shaped queue is EMPTY** — shortlist and copilot were
  its last two entries. Every AI surface in the product that
  persists OR answers now authenticates as a principal: EIGHTEEN
  identities, eighteen kill switches. What remains is §73's five
  uninjected seams (three executive generators, candidate search,
  sourcing search), founder-timed.
- **The dead shortlist read is repaired and its class has a
  harness answer** — the pool-grant control run is the first
  guard aimed at inherited coverage; recorded as a pattern for
  future zero-new-grant slices.
- **The per-turn event stands as drafted** — two turns wrote two
  events with honest counts; if real usage proves the trail too
  chatty, thinning is its own founder-timed slice.

Deploy `mandate-2uhi2n3p0` live; migration 094 applied via MCP and
checked in; tsc / vitest 820 / eslint / build green. Drive prefix
0e8 spent; next is 0e9. The completion declaration waits on the
verdicts above and the founder's written confirmation;
`NEXT-copilot-agent.md` is deleted only after it.

Founder-owned, unchanged: the exposed Supabase access token,
leaked-password protection (Pro-gated), the Turnstile keys (§61),
Stripe (parked to product-development's end), the one orphaned
331-byte storage object, and the "Capital Markets Investment Bank"
client rename (editorial).

---

## 81. Copilot verdicts confirmed — the eighteenth principal is complete; the read-shaped queue is empty — 2026-08-24

The founder confirmed all four §80 verdicts as drafted: the
most-available AI surface signs its own name with its own kill
switch and the human door intact at the threshold; the read-shaped
queue is EMPTY, with every answering or persisting AI surface now
one of eighteen principals; the dead shortlist read stands repaired
with the pool-grant control run recorded as the pattern guarding
inherited coverage; and the per-turn event stands as drafted, its
thinning founder-timed if real usage ever warrants it.

**The copilot conversion is complete.** `NEXT-copilot-agent.md`
deleted per its own instruction. Next migration is **095**.
EIGHTEEN principals live. The remaining queue, by usage on the
founder's word: §73's five uninjected seams — the three executive
generators, candidate search, and sourcing search.

---

## 82. The executive intelligence signs its own name — the nineteenth principal, three judgments, built, proven live, awaiting verdict sign-off — 2026-08-24

The executive-generator cluster (plan in `NEXT-execintel-agent.md`,
D1–D8 confirmed 2026-08-24) — the NINETEENTH principal, ONE identity
holding THREE judgments (the §50 companyintel precedent, scaled),
closing three of §73's five uninjected seams in one slice. The
LARGEST grant cluster since 074. One migration (**next is 096**):

- **095 — nine policies, double-pinned twice, actor-pinned once.**
  executive_searches S+U (the context blob's landing; intake-field
  survival is the INVARIANTS' pin — the 074 projects precedent);
  role_success_profiles and executive_interview_plans S+U each with
  **`status = 'draft'` in BOTH USING and WITH CHECK** (the 092 pin,
  twice: the agent can neither touch an approved artifact nor move
  one out of draft — approval stays the recruiter's act forever);
  both competency-library SELECTs (including the GLOBAL rows — the
  grounding that stops hallucinated keys); and
  executive_audit_events INSERT with **actor_id pinned to
  auth.uid()** (the 087 impersonation pin, executive-ledger
  edition). Vocabulary: THREE types (success_profile_generated,
  interview_plan_generated, executive_context_researched), CHECK
  59 → 62, allowlist TWENTY-THREE.
  **`agent_execintel_invariants.sql`** — 6 invariants, clean pass.
  **FINDING recorded in the harness**: approval immutability was
  ALREADY a trigger boundary (guard_* triggers + GUC-passing
  approve_*() functions) — 095's pins are the RLS layer of the same
  boundary, and the harness DISARMS the trigger for its whole
  transaction so every refusal it proves is the RLS pin's own:
  defense-in-depth proven in isolation. The control run dropped the
  WITH CHECK status conjunct (092's drift, third sighting) — with
  the trigger disarmed, ONLY the pin stood, the drift removed it,
  the agent APPROVED a draft profile, and the harness aborted at
  INVARIANT-FAIL (5), self-rolling-back. Also recorded: the durable
  global competency library holds 25 real rows — coverage pins
  count on harness ids, never the durable set (§35 extended).

**The seam (`734eb9d`).** Three generators, one conversion shape —
the pre-092 cookie-SSR after() pattern replaced by the agent's
session in each: `runAndStoreExecutiveCompanyContext` (web-reaching;
suspension refuses at sign-in BEFORE any search is spent),
`generateAndStoreSuccessProfile`, and
`generateAndStoreInterviewPlan`, each signing the nineteenth
principal in per run, judging with skills riding ITS session (D6 —
three seams closed; §73's list is TWO), landing on the human's
draft placeholder (or merging the context blob with the intake
surviving), auditing the GENERATED event under the AGENT's id (the
actor pin permits nothing else), recording the main-trail event
with trigger and COUNTS, and signing out. FAILURE BOOKKEEPING STAYS
HUMAN ×3 (090): the marks and the *_generation_failed ledger events
keep the cookie session — under the agent session, a failed event
signed with the clicker's id would be REFUSED by the very pin that
protects the ledger, which is the doctrine enforcing itself. The
actions thread `initial`/`regenerate` triggers. Live account:
`vbreygin+execintel@gmail.com`, id `1e3dd291-…`, Mandate HQ, §30
recipe, sign-in smoke-tested and revoked; `AGENT_EXECINTEL_*` in
Vercel production and `.env.local`. **New durable baseline: 20
users, 58 events, 19 agents.**

### Driven live on production (deploy `mandate-231ccnmjf` = `734eb9d`)

Scratch world 0e9: an is_founder operator (Ottoline Fairweather)
drove the REAL executive intake — fictional Bellwether Custody
Group, a digital-asset custodian mid-MiCA-conversion, hiring its
first Chief Risk Officer. The acts:

1. **The intake created the search** → the context judgment ran
   web-reaching in after() (~2.5 min, the longest web run yet) →
   status `ready`, 39 sources, the `executive_context_researched`
   event under the agent, trigger `initial`, counts only.
2. **Generate Success Profile** → V1 landed (~2.5 min, 22.5k chars,
   8 weighted competencies from the real library), the main-trail
   event AND the executive-ledger `profile_generated` entry BOTH
   under the agent's name.
3. **The recruiter approved V1** through the real confirm dialog
   ("Approval is recorded with your name… this version becomes
   immutable") — then a candidate joined and **Generate Interview
   Plan** landed the third judgment (~4.5 min, 33k chars, 6 stages,
   ZERO uncovered competencies).
4. **Suspended from /ops → all three surfaces refused** with the
   D5 sentence VERBATIM: profile V3 marked through the error view
   with Retry; plan V2 marked identically; and a SECOND search
   created through the real intake landed `company_context_status
   = 'failed'` with the sentence and Retry — the initial trigger's
   refusal, with NO web search spent.
5. **Restored → the retry landed V4 (trigger `regenerate`) → the
   steering probe landed V5**: `role_mission` begins
   **"STEERED-0E9:"** — recruiter skills provably riding the
   nineteenth principal's session. (The first probe draft, which
   named no schema field, did NOT steer V4 — under strict
   structured output a skill must name the field it targets;
   recorded as skill-authoring guidance, not a seam defect.)
6. **THE LIVE PIN PROBE** (the agent's real identity, production
   rows, the trigger guard DISARMED so the RLS pin answered alone,
   self-rolled-back): the approved profile's UPDATE touched ZERO
   rows; approve-by-UPDATE refused on the draft profile AND the
   draft plan; a FORGED-ACTOR ledger insert (the recruiter's id
   under the agent's session) refused; artifact INSERT refused. A
   text-probe of the whole main trail found NO company name, NO
   candidate name, NO steer token, NO content fragment.

**Teardown to baseline on the second census pass** — the first pass
caught a residue: the executive intake RESOLVES A CLIENT ROW
(fictional Bellwether was born into clients), now recorded in the
teardown checklist for executive drives. Eleven events swept by
value keys and the three types' known-zero baselines. Final: 58
events / 20 users / 19 agents / 2 projects / 2 clients / 5 skills /
1 job_spec / 0 executive rows / zero scratch sessions.

### Phase 4 verdicts — drafted, for the founder to confirm

- **The definition of done** — the three judgments that define an
  executive search (what the company is, what success looks like,
  how to interview for it) no longer run on ambient human identity:
  one principal, one kill switch proven refusing all three surfaces
  honestly with no model or web spend, every act signed in BOTH
  ledgers, and the editorial boundary (approval) a database pin
  proven live in five faces on production rows.
- **The approval boundary is now defense-in-depth by
  construction** — the pre-existing trigger guard and 095's RLS
  pins are two independent layers, and the harness proves the RLS
  layer with the trigger deliberately disarmed; either survives
  the other's loss.
- **§73's list shrinks to TWO** — candidate search and sourcing
  search, founder-timed.
- **Long-action honesty — NEW EVIDENCE CLASS**: these are the
  longest runs in the product (2.5–4.5 min behind polling
  surfaces; one stale-page state observed where a landed V4 still
  read "generating" until reload). Zero drops, terminal states
  honest throughout — but the stale-poll window grows with run
  length, and a poller refresh on these surfaces joins the
  founder-timed awareness list.
- **Skill-authoring guidance recorded**: under strict structured
  output, a steering skill must NAME the output field it targets;
  vague "first narrative field" instructions may not survive the
  schema. Worth a line in Skills Studio's help text, founder-timed.

Deploy `mandate-231ccnmjf` live; migration 095 applied via MCP and
checked in; tsc / vitest 820 / eslint / build green. Drive prefix
0e9 spent; next is 0ea. The completion declaration waits on the
verdicts above and the founder's written confirmation;
`NEXT-execintel-agent.md` is deleted only after it.

Founder-owned, unchanged: the exposed Supabase access token,
leaked-password protection (Pro-gated), the Turnstile keys (§61),
Stripe (parked to product-development's end), the one orphaned
331-byte storage object, and the "Capital Markets Investment Bank"
client rename (editorial).

---

## 83. Executive-intelligence verdicts confirmed — the nineteenth principal is complete — 2026-08-24

The founder confirmed all five §82 verdicts as drafted: the three
judgments that define an executive search sign one principal's name
in both ledgers behind one kill switch, with the editorial boundary
proven in five faces on production rows; the approval boundary
stands as defense-in-depth by construction, each layer proven
without the other; §73's uninjected-seam list shrinks to TWO
(candidate search, sourcing search), founder-timed; the
long-action evidence class extends to 2.5–4.5-minute runs with the
stale-poll refresh joining the founder-timed awareness list; and
the skill-authoring guidance (name the target field under strict
structured output) stands recorded for Skills Studio's help text,
founder-timed.

**The executive-generator cluster conversion is complete.**
`NEXT-execintel-agent.md` deleted per its own instruction. Next
migration is **096**. NINETEEN principals live. The remaining
queue, by usage on the founder's word: §73's last two seams —
candidate search and sourcing search — and behind them the
pre-launch checklist.

---

## 84. The candidate search signs its own name — the twentieth principal, two judgments, built, proven live, awaiting verdict sign-off — 2026-08-24

The closing slice (plan in `NEXT-search-agents.md`, D1–D8 confirmed
2026-08-24) — the TWENTIETH principal, ONE identity holding TWO
judgments, and the SIXTH zero-new-grant conversion. The Phase 0
audit's decisive finding reshaped the slice: of §73's last two
"seams", only candidate search was LIVE. `runSourcingSearch` had NO
caller anywhere — no `source_connectors` table, no settings surface,
no wiring into the sourcing-runs flow (which shipped manual-import
by design) — latent code from `767735f`, not a seam. The confirmed
D8 answer: the live seam converts on its page; the latent runner
converts AT ITS CONTRACT. One migration (**next is 097**):

- **096 — vocabulary only** (the 094 shape): TWO types into the
  CHECK (rebuilt from the LIVE pg_constraint list, 62 → 64) and the
  allowlist TWENTY-THREE → TWENTY-FIVE. `candidate_search_answered`
  records live from this slice; `sourcing_search_executed` is
  minted AHEAD of its channel (the slice-fourteen `scheduled`
  precedent). **`agent_search_invariants.sql`** — 5 invariants,
  clean pass: read coverage by COUNT on harness ids including the
  SKILLS read (D6 is the slice's point, so its read is the coverage
  pin's subject); both acts attributed with counts and a text-probe
  proving no query text rides the trail; history intact at
  twenty-five; the negative matrix (candidates INSERT refused — the
  pool has no agent door into the pool's tables, S and U only;
  clients/organizations/events zero; users self-only; the recruiter
  refused at the agent door; unknown type refused); kill switches
  independent at TWENTY. The control run TRIMMED
  `candidate_search_answered` from the allowlist (091's drift
  class, "the type is new") — the record refused BY NAME, the
  harness aborted, drift and harness in one transaction,
  residue-free by construction.

**The seam (`bf9ff2c`).** TWO conversions, one principal:

- **The pool search** — the page split (D2): the cookie session
  stays the human door and keeps the DISPLAY reads; the judgment
  moved into `runCandidateSearchAsAgent`, which signs the twentieth
  principal in per queried render, re-reads the pool under ITS
  session (never cookie-fetched rows handed sideways), applies the
  same structural filters, judges with skills riding its session
  (D6), records `candidate_search_answered` with COUNTS and filter
  booleans — never the query's text — and signs out in a finally.
  GET semantics made fail-soft trivial: the query and filters live
  in the URL.
- **The sourcing search, seam-bound (D8 as confirmed)** — the raw
  runner is now UNEXPORTED; `runSourcingSearchAsAgent` is the only
  door: the policy gate first (no usable source = hard stop, free),
  sign-in second (a suspended agent refuses BEFORE any billed
  search), skills riding the agent's session, the event with counts
  (rounds, domain COUNT, leads — never a domain list, never a
  person) on a landed run only. The compliance boundary survived
  the seam untouched — allowed_domains scoped, LinkedIn blocked at
  the tool parameters. Proven by EIGHT vitest tests (refusal
  spending nothing, skills in the system prompt, the blocklist on
  the tool call, counts-only trail, sign-out on every path) — the
  latent judgment's drive, since no surface exists to drive. When
  the connector surface ships, its search is born signed.

Live account: `vbreygin+search@gmail.com`, id `541167be-…`, Mandate
HQ, §30 recipe, sign-in smoke-tested and revoked; `AGENT_SEARCH_*`
in Vercel production and `.env.local`. **New durable baseline: 21
users, 61 events, 20 agents.**

### Driven live on production (deploy `mandate-9ii8gw3vy` = `bf9ff2c`)

Scratch world 0ea INSIDE Mandate HQ (the principal is org-bound):
an is_founder operator (Perrin Oakhurst), a scratch mandate
("0EA Director of Post-Trade Operations", fictional Thornfield
Clearing), three seeded scored candidates. The acts:

1. **A real query on the real page** ("post-trade settlement
   leaders with FCA remediation experience who have run a T+1
   migration") → parsed criteria + FOUR ranked matches with real
   grounded reasoning (the seeded T+1 candidate at 95, the org's
   one durable candidate ranked honestly last at 32); ONE
   `candidate_search_answered` event under the agent's name —
   counts 4/4/4, filter booleans, trigger `query`; zero agent
   sessions after.
2. **The text-probe** — the whole trail carries NO query text, NO
   candidate name, NO company name.
3. **Suspended from /ops → the search refused** with the D5
   sentence VERBATIM ("The Candidate Search Agent could not run —
   an operator has suspended it or its credentials are absent.
   Your query and filters are safe in this page's address; search
   again when it is restored."), the form and filters intact above
   it, NO event recorded.
4. **Restored → steering probe** — a `search_skill` authored
   through the REAL Skills Studio, NAMING its target field per the
   §82 guidance ("the parsed_criteria.intent field MUST begin
   STEERED-0EA:") → the next search's intent began
   **"STEERED-0EA:"** on production — a recruiter-authored skill
   provably steering the twentieth principal's first rerun; the
   second event landed, the text-probe still clean (not even the
   steer token rode the trail).

**Teardown to baseline exactly on the first pass** — 8 events swept
by value keys (two answers by their known-zero type, the operator's
four member events keyed by NAME, the agent's suspend/restore pair
keyed by from/to VALUES — the creation trail's `from='pending'`
stayed durable), the mandate, its three candidates and scores, the
probe skill, the operator's chain. Final census: 21 users / 20
agents / 61 events / 2 projects / 2 clients / 5 skills / 1
job_spec / 0 scratch rows / the founder's session only. The
teardown reconnaissance itself re-proved the doctrine: a 2-hour
window caught the PREVIOUS slice's durable creation trail — time
windows would have eaten §82's history.

### Phase 4 verdicts — drafted, for the founder to confirm

- **The definition of done** — the judgment that answers "who in
  our pool matches this?" no longer runs on ambient human identity:
  it signs its own name in the trail, wears its own kill switch
  proven refusing honestly with nothing destroyed and nothing
  spent, reads the org's skills (proven steering on production),
  and records counts, never content.
- **The sourcing judgment is seam-bound, not driven** — there is no
  surface to drive, so its proof is the eight-test vitest contract
  plus the harness's minted-ahead vocabulary; the §-record states
  plainly that the live drive covers the pool judgment only. When
  the connector surface ships, the search arrives born signed
  behind the same kill switch — and its live drive happens THEN,
  on its own slice.
- **§73's list EMPTIES** — every uninjected seam found by the
  onboarding audit is closed: seven seams, six slices, principals
  fifteen through twenty. The skills gap that §69 wrongly declared
  dead in one sweep is now actually dead, with the correction and
  the closure both in the record.
- **Long-action honesty — nothing new to defer**: the pool search
  answers inside the page render (~10–20s), inside the proven
  range, zero drops observed.

Deploy `mandate-9ii8gw3vy` live; migration 096 applied via MCP and
checked in; tsc / vitest **828** (820 + the eight seam tests) /
eslint / build green. Drive prefix 0ea spent; next is 0eb. The
completion declaration waits on the verdicts above and the
founder's written confirmation; `NEXT-search-agents.md` is deleted
only after it.

Founder-owned, unchanged: the exposed Supabase access token,
leaked-password protection (Pro-gated), the Turnstile keys (§61),
Stripe (parked to product-development's end), the one orphaned
331-byte storage object, the "Capital Markets Investment Bank"
client rename (editorial), the stale-poll refresh on the long
executive surfaces (§82), and the Skills Studio help-text line on
field-named steering skills (§82).

---

## 85. Candidate-search verdicts confirmed — the twentieth principal is complete; §73's list is EMPTY — 2026-08-24

The founder confirmed all four §84 verdicts as drafted: the pool
judgment signs its own name behind its own kill switch, proven
refusing honestly with nothing destroyed and steering live on
production; the sourcing judgment stands seam-bound with its
eight-test vitest contract as the record plainly states, its live
drive deferred to the slice that ships its connector surface; §73's
uninjected-seam list is EMPTY — seven seams, six slices, principals
fifteen through twenty, the correction and the closure both in the
record; and long-action honesty stands with nothing new deferred.

**The candidate-search conversion is complete.**
`NEXT-search-agents.md` deleted per its own instruction. Next
migration is **097**. TWENTY principals live — every AI judgment in
the product authenticates as a principal, reads recruiter-authored
skills, and signs its own name. The agents-as-principals programme's
conversion queue is EMPTY.

Ahead, on the founder's word: the pre-launch checklist (CLAUDE.md),
and the founder-owned items — the exposed Supabase access token,
leaked-password protection (Pro-gated), the Turnstile keys (§61),
Stripe (parked to product-development's end), the orphaned 331-byte
storage object, the "Capital Markets Investment Bank" rename
(editorial), the stale-poll refresh on the long executive surfaces
(§82), and the Skills Studio help-text line on field-named steering
skills (§82).

---

## 86. The terminal re-skin closes — one language, product-wide — 2026-08-24

The founder's 2026-08-13 call ("terminal wins, everywhere") reached
its last holdouts. The audit found the ~12 soft pages of that date
already converted by the intervening arcs — the true remainder was
one page, three auth surfaces, and residue:

- **`/app/settings`** — the LAST shadcn Card/Table page, converted
  to the members-page idiom (MastHead sections, square bordered
  containers, the relative-wrapper scroll table with its sr-only
  containing-block fix carried over).
- **The auth trio** (signin, signup, pending) — already terminal in
  voice, squared in form: every `rounded`/`rounded-lg`/
  `rounded-full` stripped, the static card `shadow-2xl` removed
  (the kpi-tile doctrine: no rounded corners, no dropshadow). The
  first surface a buyer meets off the terminal marketing site now
  matches it.
- **Residue squared**: the sidebar logo mark (5px/1px radii), the
  chart legend/tooltip swatches (2px).
- **Eight orphaned soft primitives DELETED** — card, table, dialog,
  badge, select, tabs, sheet, button (a closed dependency cluster,
  zero external importers after the settings conversion; ~1,100
  lines gone). Nobody can reach for a soft component again.

`rounded-none` overrides and prose containing "g**rounded**" were
the audit's false positives; the one floating dropdown keeps its
functional shadow. Verified live on production (deploy
`mandate-5wgcbbed7` = `7cc0589`): signin square edge to edge,
settings rendering the full terminal idiom with the twenty agents
in the roster table. The scratch visual account (Vesper Quill)
swept to baseline — 21 users / 61 events / founder's session only.
Gate green: tsc / vitest 828 / eslint / build.

The re-skin the 2026-08-13 memory carried is DONE. Next, on the
founder's word: the pre-launch checklist, then the founder-owned
list.

---

## 87. The compass, the notch, and honest colors — the second cosmetic pass — 2026-08-24

Four founder asks, one deploy (`mandate-bnfl0n1z4` = `08c70d6`):

- **The compass logo adopted** (founder's artwork). The mark was
  cropped from the source PNG (its plate is #010b21, sampled from
  the pixels) into the full icon set — favicon 16/32, a
  PNG-embedded ICO, apple-touch 180, mark 192/512 — plus the
  dashboard rail, the marketing nav and footer, and the auth navs.
  TRAP: Turbopack DECODES `src/app/favicon.ico` and refuses
  non-RGBA PNGs inside ICO — the app-dir copy is deleted and the
  static `public/favicon.ico` (served verbatim) carries it.
- **The mandate notch.** The founder chose the notched corner from
  the four drafted shapes: one 8px 45° clip, bottom-right — the
  compass chevron embedded in the button plate. `.btn-notch` in
  globals.css, applied to all 78 solid CTAs (the
  `bg-primary-container text-on-primary-container` idiom — every
  match audited as a real button). Solid fills only: clip-path
  shears borders, so outlined/ghost buttons stay square.
- **The copilot label repaired at the token layer** — the
  --color-error defect class, fourth sighting: `--color-on-primary`
  was never defined, so `text-on-primary` generated nothing in TEN
  files, and the copilot's white-ish inherited text sat on the pale
  periwinkle `--primary` fill. Fix: `--color-on-primary` → the navy
  the shadcn slot already documents (7.7:1 on the pale fill), and
  the copilot launcher moved to the standard accent-fill CTA
  pairing (white on #2563eb, 5.2:1) with the notch.
- **RAG colors, reversing the earlier restraint by founder's
  word**: `--positive` #bec6e0 → green #4ade80, `--warning` →
  text-grade amber #fbbf24 with a new `--color-warn` utility
  (warn chips/accents had ALIASED tertiary/--info and rendered
  blue-grey — a warning that didn't warn), `--danger` stays
  #ffb4ab. All WCAG-checked 9.9–10.3:1 on the card surface; the
  dataviz doctrine holds (status colors ship beside labels, never
  color alone). Repointed the warn-semantic sites: status-chip +
  kpi-tile warn tones, analytics stalled fill, metrics stalled
  chip, health-suggestions medium, placements fell-through, the
  AI-search 40–60 match band. Everything else (tiers, deltas,
  active chips, chart fills) flowed green/red through the tokens.

Verified live on production: the project surface shows the rail
mark, the readable notched copilot, green COMPLETE/ACTIVE, red
AT RISK/LOW PIPELINE. The impeccable detector's one advisory (the
terminal-grid texture) is the product's committed signature — the
brief wins. Gate green: tsc / vitest 828 / eslint / build.

TRAP RE-PROVEN: mid-pass, `cd` into the job tmp dir reset the
shell to the iCloud CLONE — reads after it hit a stale 127-line
sidebar until the pwd check caught it. All edits verified landed
in the live repo (absolute-path audit).

**Baseline note:** durable events are now 62 — the founder's own
`mandate_shared` act (21:37 UTC, their live session) landed during
the pass. Founder-authored, durable, not residue. The scratch
visual account was swept; 21 users / founder's session only.

Cosmetic follow-ups, founder-timed: the OG card stays typographic
(no old lettermark to contradict; compositing the compass into it
is optional), and the auth "pending" page has no nav to mark.

---

## 88. The agent registry page — the twenty principals, on the record for the user — 2026-08-24

`/app/agents` (deploy `mandate-97vpfkvrr` = `b852a94`), "Agents" in
the system rail. A server component in the full terminal idiom:
static registry (five groups, each principal's judgment in one
sentence plus its "stays human" line) joined to LIVE status from
the users table — keyed by the principal's exact full_name, the
same name the trail records, so a suspended agent reads SUSPENDED
the moment an operator flips it. Honest edges: a provisioned agent
missing from the registry renders under "Undocumented principals"
rather than vanishing; a documented agent missing from the DB reads
NOT PROVISIONED. The RAG tokens carry the chips (active green,
suspended red). Founders see the /ops kill-switch note. Also this
pass: the notch-completeness commit (`2e6fac8`) — two shared button
constants, signup submit, project-view CTA, copilot send, and
marketing's m-btn--primary; proven programmatically on production
(every solid fill reports a clip-path). OPERATOR NOTE, surfaced to
the founder: the Mac's data volume hit 100% mid-build (406/460Gi
used); regenerable .next caches were cleared (~1GB freed) but the
disk itself is the founder's to triage.

---

## 89. The Engage arc approved — Scout as workflow, four new principals queued — 2026-08-24

The founder approved the Mandate Scout / Engage design spec
(`docs/superpowers/specs/2026-08-24-mandate-scout-engagement-design.md`,
committed `965668e`) as written, including its defaults: org autonomy
cap defaults to Level 1; a deploy-time ceiling holds every org ≤ Level
2 until the §12 counsel questions clear; every outreach strategy is
human-approved at every level; slice-one sender identity is
noreply@getmandate.io with the recruiter named in the body; counsel
raised when #22 nears. Scout is a WORKFLOW (mission state +
orchestration + surface), never a principal. Candidate Search #13 and
Ranking #4 stay as built. The Agents page carries the funnel taxonomy
(Understand / Discover / Evaluate / Deliver / Assist; Engage appears
with its first principal).

**The arc, in order, each slice gated on its own D1–D8 confirmation:**
097 #21 Outreach Strategy (+ outreach_strategies, org_comms_policy;
zero new infra; scout_missions/scout_actions may land in
Assist/Discover form) → 098 #24 Candidate Relationship
(network_profiles + resolver + durable DNC before any autonomous
send) → 099–100 comms service + #22 Engagement (the infrastructure
slice; inbound email is the arc's largest genuine gap) → 101 #23
Pre-Screen (two evidence tracks, no verdict key — harness-pinned).
The founder chose to begin the arc NEXT; the pre-launch checklist
queues behind it.

---

## 90. Engage slice one — the Outreach Strategy Agent (#21), the twenty-first principal — 2026-08-24 — CONFIRMED §91

D1–D8 confirmed in writing 2026-08-24 (NEXT-outreach-strategy.md,
committed `70cfcd5`); built and driven the same evening. **This § is a
DRAFT: no completion is declared and NEXT-outreach-strategy.md is not
deleted until the founder confirms these verdicts.**

**Migration 097** (MCP + `supabase/migrations/097_agent_outreach_strategy.sql`,
commit `3e18cac`): the first slice since 085 that mints tables rather
than converting a surface. `outreach_strategies` — agent I+S, agent U
double-pinned status='draft' BOTH faces (the 092 family); INSERT pins
status at birth AND created_by to the signing session; the human door
(approve/decline/supersede) gated `can_share_clients` — the SAME
predicate as the contact log, because the act that authorizes contact
is pinned like the contact record; approved_by actor-pinned in WITH
CHECK (the 087 decided_by family); a decision without a decider is
refused by table CHECK; ONE live draft per candidate-lane (partial
unique index). `org_comms_policy` — policy as data (088), admin-only
writes, agent read; **`linkedin` cannot enter allowed_channels BY
CONSTRAINT** — the source-policy doctrine enforced at the data layer.
ONE new read grant: `candidate_outreach_agent_select` (the history
read; Phase 0 found candidate_outreach had NO agent face). NO agent
write on the contact record — sends stay human until 099. Vocabulary:
`outreach_strategy_drafted`, CHECK rebuilt from the live list 64→65,
allowlist TWENTY-FIVE→TWENTY-SIX. `mission_id` landed nullable and
unread (D8 as confirmed: Scout's tables deferred).

**The harness** (`supabase/tests/agent_outreach_strategy_invariants.sql`):
read coverage on harness ids including the new history grant; the
draft born under the agent's name with a counts-only event (text-probe
clean); history intact at twenty-six by COUNT; the pins all faces —
agent cannot birth a decided row, sign another's name, leave 'draft',
or touch a decided row; the human decision actor-pinned (an approval
wearing another's name refused); a viewer refused; two live drafts
refused; the agent refused at candidate_outreach INSERT and at
org_comms_policy UPDATE (a recruiter too; the admin lands; linkedin
refused by CHECK); negative matrix unchanged; kill switches
independent at TWENTY-ONE. **Control run verified**: the agent UPDATE
rebuilt with the WITH CHECK status conjunct dropped ("USING already
refuses decided rows") — the agent moved its own draft to 'superseded'
and the harness aborted at INVARIANT-FAIL (4), drift and harness in
one transaction, residue-free by construction. The two conjuncts guard
different faces: USING is what the agent may touch, WITH CHECK is what
it may leave behind.

**The principal.** Live account `vbreygin+strategy@gmail.com`, id
`1a6bbc30-…`, Mandate HQ, §30 recipe (the flip its own statement, +3
member events keyed by the agent's name); sign-in smoke-tested via
GoTrue and the session revoked. `AGENT_OUTREACH_STRATEGY_*` in Vercel
production (sensitive). **`.env.local` is founder-hand this slice** —
the file is permission-protected from the session that built this; the
pair to append is in the job report. **New durable baseline: 22 users
/ 21 agents / 65 events / 1 org_comms_policy row** (2 projects, 2
clients, 5 skills, 1 job_spec, 1 candidate unchanged).

**The seam** (`src/lib/ai/run-outreach-strategy.ts`): signs the
twenty-first principal in per drafting act; re-reads mandate,
evidence, contact history, and comms policy under ITS session; judges
with skills riding the session (D6); **clamps deterministically**
(`src/lib/outreach/strategy-policy.ts`, 10 vitest contracts — client
name scrubbed under never/after_nda, compensation content cut under
human_only, channel clamped to the allowed set) — layer one of 099's
two-layer check; INSERTs the draft; records counts; signs out in a
finally. The panel (`strategy-panel.tsx`) renders the draft source in
the outreach tab: approve/decline/redraft on a draft, mailto + copy on
approved — level ≤1 sending is the recruiter's own mail client, and
the panel says the Art. 14 notice is appended by Mandate at send time,
not part of the draft. **Redraft is human-first** (the pin conflict
found in Phase 0): the recruiter's session supersedes, the agent
drafts the next version, and a refusal rolls the supersede back.
compose.ts unchanged — the agent writes recruiter-block text only, so
the notice guarantee needed nothing. /app/agents grew the ENGAGE
chapter with the "stays human" line; the footer counts twenty
independent siblings.

### Driven live on production (deploy `mandate-7qjgbiqbj` = `3e18cac`)

Scratch world 0eb INSIDE Mandate HQ: operator Wren Halloway
(is_founder admin, never the real founder), mandate "0EB Head of
Treasury Operations" (fictional Thornbridge Capital Partners), one
sourced candidate with evidence and a nine-day-old outreach log. The
acts, each verified in the database as it landed:

1. **Draft** → v1 landed status='draft' under the AGENT's id, 5
   talking points grounded in the seeded T+1/FCA evidence; ONE
   `outreach_strategy_drafted` event, actor-label the agent's name,
   detail counts only (evidence_keys 3, prior_contacts 1,
   policy_clamped false); **text-probe ZERO** across the whole trail
   (no candidate name, no company, no draft text); zero agent
   sessions after.
2. **Approve** → status='approved', approved_by = the OPERATOR,
   stamped; the mailto + copy affordances rendered.
3. **New draft (v2) → Redraft** → the ledger reads v1 approved / v2
   superseded (the human's act) / v3 draft — the human-first
   supersede proven live.
4. **Suspended from /ops → the refusal, VERBATIM** ("The Outreach
   Strategy Agent could not run — an operator has suspended it or its
   credentials are absent. Nothing was drafted; the contact log and
   history are untouched. Try again when it is restored."), captured
   by MutationObserver; strategies still 3, events still 3, nothing
   destroyed. **Restored** from /ops (the buttons now read
   Suspend/Restore — §30's cosmetic note is resolved).
5. **Steering probe** — a search skill authored through the real
   Skills Studio, NAMING its target field (§82 guidance): the next
   draft's angle began **"STEERED-0EB:"** on production — a
   recruiter-authored skill provably steering the twenty-first
   principal.
6. **/app/agents** — the ENGAGE chapter live, the principal ACTIVE.

Screenshots (`.playwright-mcp/`): strategy-0eb-empty-panel,
strategy-0eb-draft-v1, strategy-0eb-approved-mailto,
strategy-0eb-suspended-d5, strategy-0eb-steered-angle,
agents-0eb-engage-chapter.

Teardown on scratch ids to the new durable baseline EXACTLY — the
suspend/restore residue keyed by VALUE (from 'active'/'suspended' vs
creation's 'pending', the documented trap) was caught at 67 and
removed to 65; the principal's 3 creation events stand durable.

**One honest wound from the drive:** the Playwright browser held the
FOUNDER's live session; signing it out to admit the scratch operator
was a GLOBAL GoTrue signout and revoked the founder's own device
session too (auth.sessions read 0 at teardown). Nothing else was
touched; the founder signs in again once. Future drives should prefer
deleting only the browser's own session row by id, or a separate
browser profile.

### Phase 4 verdicts — drafted, for the founder to confirm

- **The slice is live at level ≤1 end to end**: draft → human decision
  → the recruiter's own mail client. No autonomous send exists
  anywhere; the comms service (and its second policy layer) is 099's.
- **Next slice per the confirmed order: 098 #24 Candidate
  Relationship** — network_profiles + resolver + durable DNC before
  any autonomous send; its own NEXT file and D1–D8 gate before
  anything is built.
- **org_comms_policy has no settings surface yet** — defaults serve
  slice one; the admin editing surface belongs with the approvals
  queue when the arc's surfaces consolidate (or earlier by founder
  call).
- **The clamp is intentionally conservative** (drop/scrub, never
  rewrite); a false positive costs a lightly thinner draft, never a
  leak. Its vocabulary (comp regex, stand-in phrase) is code the
  founder may tune.
- **`.env.local` append is founder-hand** (the pair is in the job
  report); production is already live without it — local dev refuses
  honestly until it lands.

---

## 91. §90 confirmed — Engage slice one COMPLETE; 098 #24 opens next — 2026-08-25

The founder confirmed §90 in writing 2026-08-25. The Outreach
Strategy Agent (#21) is complete: the twenty-first principal, the
ENGAGE chapter open, level ≤1 outreach live end to end (agent drafts,
human decides, the recruiter's own mail client sends).
NEXT-outreach-strategy.md deleted on the confirmation, per doctrine.
§90's drafted verdicts stand as confirmed: next slice is **098 #24
Candidate Relationship** (network_profiles + resolver + durable DNC
before any autonomous send), opening with its own Phase 0 and D1–D8
gate; the org_comms_policy settings surface waits for the approvals
queue; the clamp stays conservative. Founder-hand items open:
`.env.local` pair append, and one fresh sign-in on the founder's own
browser (the §90 global-signout wound). Numbers: next migration 098,
next handoff § 92, next drive prefix 0ec; durable baseline 22 users /
21 agents / 65 events / 1 org_comms_policy row.

---

## 92. Engage slice two — the Candidate Relationship Agent (#24), the twenty-second principal — 2026-08-25 — CONFIRMED §93

D1–D8 confirmed in writing 2026-08-25 (NEXT-relationship-agent.md,
committed `3f2f877`); built and driven the same night. **This § is a
DRAFT: no completion is declared and NEXT-relationship-agent.md is
not deleted until the founder confirms these verdicts.**

**Migration 098** (MCP + `supabase/migrations/098_agent_relationship.sql`,
commit `7ddef02`): the person becomes REAL. `network_profiles` —
UNIQUE (org, identity_key); dnc-with-reason table CHECK (a
suppression without a reason cannot exist, and relationship_state
cannot claim do_not_contact while dnc says otherwise); NO INSERT or
DELETE doors for anyone (profiles are born by the resolver,
relationship data survives). **One Phase-0 live-read correction to
the confirmed draft, stronger than drafted:** the SQL identity rule
already existed as `candidate_identity_key()` (073 — the portal
withdraw RPC uses it), so 098 REUSES it for resolver + backfill and
refactors `count_network_people()` onto it — the rule now has ONE SQL
home and zero new transcriptions. **The resolver is data-layer**: a
BEFORE trigger on candidates' identity columns find-or-creates and
(re)links `network_profile_id` on EVERY birth path — manual, import,
promotion RPC, portal self-update — and an identity edit RE-links
(proven in harness: the sibling row keeps its person). **DNC writes
are RPC-only** (guard trigger + transaction-local GUC, the 043
guard_subject_notified family — upgraded from the drafted agent-only
pin to bind HUMANS outside the RPCs too): `set_network_dnc` (human,
reason mandatory, actor recorded, refuses agents by name),
`clear_network_dnc` (FOUNDER ONLY, reason mandatory), and the
portal's withdraw/erasure RPCs suppress SYSTEMICALLY (dnc_set_by
NULL, evented). Vocabulary: `relationship_updated` (agent, allowlist
TWENTY-SEVEN) + `network_dnc_set` / `network_dnc_cleared` (HUMAN
types — refused at the agent's trail door, proven); CHECK 65 → 68.

**The harness** (`supabase/tests/agent_relationship_invariants.sql`):
resolver determinism/uniqueness/re-link; the agent's merge-write
lands with dnc untouched; counts-only trail, text-probe clean;
history at twenty-seven; THE COLUMN PIN all faces (agent direct-dnc
refused, agent do_not_contact transition refused both ways, RECRUITER
direct-dnc refused — the RPC-only hole closed, reasonless suppression
refused at RPC and at table CHECK even through an armed GUC, the
recruiter's suppression actor-stamped, the founder's clear alone,
lawful maintenance of a suppressed profile survives with dnc intact);
the erasure RPC's systemic suppression; viewer/insert/delete refusals;
negative matrix incl. the erasure queue unreadable to the agent; kill
switches at TWENTY-TWO. **Control run verified**: guard rebuilt with
v_allowed forced true ("the RPCs are the only callers anyway") — the
agent SET do-not-contact by direct UPDATE and the harness aborted at
INVARIANT-FAIL (4a) — the first control to regress a COLUMN pin. One
harness defect found mid-run and fixed honestly: after an owner-side
check the script had not re-entered the authenticated role, so the
"viewer" probe briefly tested the superuser — the missing re-entry is
now commented in the file. GUC discipline recorded: a successful DNC
RPC leaves the GUC armed for the transaction, so the harness disarms
after every success or later refusal checks test nothing.

**The principal.** Live account `vbreygin+relationship@gmail.com`, id
`a99848b0-…`, Mandate HQ, §30 recipe; sign-in smoke-tested and
revoked; `AGENT_RELATIONSHIP_*` in Vercel production. `.env.local`
stays founder-hand (both Engage pairs are in the job reports). **New
durable baseline: 23 users / 22 agents / 68 events / 1 profile** (2
projects, 2 clients, 5 skills, 1 job_spec, 1 candidate unchanged).

**The seam + surfaces** (`run-relationship.ts`, `relationship-merge.ts`
+ 5 vitest → 843, `profile-resolver.ts` read-side,
`relationship-card.tsx` on the network table, `relationship-actions.ts`):
the agent re-reads profile + appearances + contact history +
strategies under ITS session; org-wide skills only (a person is
cross-project, the digest precedent); `last_meaningful_contact_at` is
DETERMINISTIC (the newest contact's stamp, never the model's);
`buildRelationshipUpdate` is the pure clamp — only the four
maintainable fields can exist in the update, no state write on a
suppressed profile, out-of-vocabulary states write nothing. **#21
learned about people (D6)**: `runOutreachStrategyAndPersist` refuses
a suppressed person BEFORE any model spend, with the suppression
named in the toast. The registry's ENGAGE chapter carries two
principals; the footer counts twenty-one siblings.

### Driven live on production (deploy `mandate-nn7lcjttx` = `7ddef02`)

Scratch world 0ec INSIDE Mandate HQ: operator Odile Fenwick
(is_founder admin, never the real founder), mandate "0EC Chief Risk
Officer" (fictional Halbrook Reinsurance Group), one sourced
candidate with evidence, one outbound touch and one INBOUND reply.
The acts, each verified in the database as it landed:

1. **The trigger proved itself at seed time**: the scratch candidate's
   INSERT created the person on production before any code ran.
2. **Update relationship** → the agent judged the thread correctly:
   cold → ENGAGED off the inbound reply, follow-up set from the
   "travelling until the 9th" evidence, last-meaningful-contact
   stamped deterministically; ONE `relationship_updated` event under
   the agent's name, counts only (contacts 2, disposition_fields 3);
   **text-probe ZERO**; zero agent sessions after.
3. **Do-not-contact by hand** (reason typed, mandatory) → dnc true,
   actor-stamped to the operator, state do_not_contact,
   `network_dnc_set` evented.
4. **#21 refused the suppressed person VERBATIM** ("This person is
   marked do-not-contact on their relationship record — no strategy
   was drafted and no model call was spent. Only a founder-level act
   with a recorded reason can clear the suppression.") — 0 strategy
   rows, 0 events, 0 spend.
5. **Founder-level clear** (reason typed, mandatory) → dnc false,
   state back to cold, `network_dnc_cleared` evented.
6. **Suspended from /ops → D5 VERBATIM** ("The Candidate Relationship
   Agent could not run — an operator has suspended it or its
   credentials are absent. The relationship record is untouched. Try
   again when it is restored."), captured by MutationObserver;
   restored.
7. **Steering probe** — a Skills-Studio-authored skill NAMING its
   target field: the next update's disposition summary began
   **"STEERED-0EC:"** on production, and the agent honestly re-judged
   the cleared profile back to engaged from the reply evidence.
8. **/app/agents** — ENGAGE carries both principals.

Screenshots (`.playwright-mcp/`): relationship-0ec-cold-card,
relationship-0ec-engaged, relationship-0ec-dnc-card,
relationship-0ec-strategy-dnc-refusal, relationship-0ec-suspended-d5,
relationship-0ec-steered-summary, agents-0ec-engage-two.

Teardown on scratch ids and KNOWN-ZERO baselines (the new event
types had zero durable rows — the whole classes swept clean), the
suspend/restore residue keyed by VALUE, the operator's session
revoked by the operator's own deletion — NO global signout this time
(§90's lesson applied). Durable baseline landed EXACTLY; the one
remaining session is the FOUNDER's own fresh sign-in (01:36 UTC),
which also heals §90's wound.

### Phase 4 verdicts — drafted, for the founder to confirm

- **The Engage arc's policy substrate is COMPLETE for 099**: durable
  person, enforceable DNC (RPC-only, founder-only clear, systemic on
  withdrawal/erasure), relationship state — everything §5's comms
  service ladder reads now exists ahead of it.
- **Next slice per the confirmed order: 099–100 comms service + #22
  Engagement** — the infrastructure slice (outreach extensions,
  suppression list, inbound_messages, webhook routes,
  engagement_states, caps); largest and riskiest; its own NEXT file
  and D1–D8 gate; outbound-only Level 2 before any inbound.
- **The network aggregator still folds at read time** (D8d as
  confirmed) — moving the page onto the stored key is its own later
  cleanup; the overlay joins on identity_key today.
- **Withdrawal sets person-level DNC** (as drafted and confirmed) —
  deliberately conservative; the founder-only clear is the release
  valve, and the first real withdrawal will test the ergonomics.
- **`.env.local` appends stay founder-hand** (both Engage pairs);
  production is live without them.

---

## 93. §92 confirmed — Engage slice two COMPLETE; 099–100 opens next — 2026-08-25

The founder confirmed §92 in writing 2026-08-25. The Candidate
Relationship Agent (#24) is complete: the twenty-second principal,
the durable person live with enforceable RPC-only DNC, and the
Engage arc's policy substrate finished ahead of the comms service.
NEXT-relationship-agent.md deleted on the confirmation, per doctrine.
§92's drafted verdicts stand as confirmed: next is **099–100 — the
Candidate Communication Service + #22 Engagement**, the arc's
infrastructure slice (outreach extensions, suppression, inbound
machinery behind its own gate, engagement_states, caps as data),
opening with its own Phase 0 and D1–D8 gate; outbound-only Level 2
ships before any inbound. Founder-hand items open: both Engage
`.env.local` pairs. Numbers: next migration 099, next handoff § 94,
next drive prefix 0ed; durable baseline 23 users / 22 agents / 68
events / 1 network_profile / 1 org_comms_policy.

---

## 94. Engage slice three — the Candidate Communication Service (099, stage one of the confirmed pair) — 2026-08-25 — CONFIRMED §95

D1–D8 confirmed in writing 2026-08-25 (NEXT-comms-engagement.md,
committed `1dff6bc`); stage one built and driven the same night.
**This § is a DRAFT: no completion is declared, stage two (100 #22)
does not start, and NEXT-comms-engagement.md is not deleted until the
founder confirms these verdicts.**

**The headline: MANDATE SENT ITS FIRST CANDIDATE EMAIL — and the
record was whole.** The 0ed drive's send landed at
`vbreygin+0ed-candidate@gmail.com` (founder-controlled mailbox, real
delivery) with the outreach row 'sent' + Resend's reference +
`includes_privacy_notice true` + thread_key + strategy-scoped
idempotency key, the `candidate_notifications` row (art14-v1,
provider-ref'd), and **`subject_notified_at` STAMPED — the Art. 14
discharge the outreach panel has promised since 044, provider-
confirmed for the first time in the product's history.**

**Migration 099** (MCP + `supabase/migrations/099_comms_service.sql`,
commits `0c46b8b`/`9abc6e8`): deterministic infrastructure only — no
principal, no model call, NO vocabulary. candidate_outreach provider
extensions (all nullable, manual logs and mailto untouched;
idempotency UNIQUE where present; provider-coherence CHECKs);
`email_suppressions` (admin-manual-insert only — a by-hand 'bounce'
is refused, an agent is refused and blind; removal founder-hand);
**`complete_candidate_send`** — the atomic completion (provider ref +
notification + stamp through 044's own `record_notification_sent`,
REUSED); `record_email_delivery_event` — the webhook door, inert
without a provider-named row, forward-only (a late 'delivered'
cannot erase a bounce), suppressing the bounced address org-scoped
and lowercased. **A real 044 rule surfaced by the harness's first
run**: `candidate_notifications_one_sent_idx` permits ONE sent
notification per candidate EVER — so a second notice-carrying send
SKIPS the statutory record rather than failing a send the provider
already made; the completion encodes that and the harness pins it.

**The harness** (`supabase/tests/comms_service_invariants.sql`):
queued-before-provider idempotency; THE ATOMIC COMPLETION; completes
exactly once; agent refused by name at the RPC; the direct stamp
still guard-refused; the one-sent rule; the webhook door's whole
matrix under role anon; suppression policy faces; the extensions
open no agent surface. **Control run verified**: the completion
rebuilt with the notification half dropped ("the outreach row
already says the notice went") — the record came apart and the
harness aborted at INVARIANT-FAIL (2). The 043 two-writes doctrine,
proven at three.

**The service** (`src/lib/comms/`): `send-candidate-message.ts`
walks spec §5's ladder in order with every branch a NAMED refusal;
the ladder decisions are PURE (`send-policy.ts`, 13 vitest contracts
— vitest 856) with the service as thin IO; the send-time disclosure
clamp reuses strategy-policy.ts (095's two-layer precedent
completes); the provider adapter is the only file that knows Resend
exists, through lib/email/send.ts; replyTo is the sending
recruiter's real address (D8f as confirmed — thread_key minted for
the future inbound gate); agent actors refused by construction.
"Send via Mandate" leads on approved strategies with mailto demoted
beside it.

**A defect found and fixed mid-drive, the /api/cron class exactly:**
the proxy 307-bounced Resend's sessionless webhook POST to sign-in —
found by curling the route, as the proxy's own comment says the cron
bounce was. `/api/webhooks/` joined ALWAYS_PUBLIC_PREFIXES (the
route's own svix gate fails closed); the route now answers its
honest 503 dormancy on production until the founder wires the
dashboard secret (`RESEND_WEBHOOK_SECRET`).

### Driven live on production (deploys `mandate-70j9nkm3c` = `0c46b8b`, then `9abc6e8`)

Scratch world 0ed INSIDE Mandate HQ: operator Tamsin Elsworth
(is_founder admin), mandate "0ED Head of Fund Operations" (fictional
Wexford Crest Partners), one sourced candidate whose address was the
founder-controlled mailbox. The acts, each verified in the database:

1. **#21 drafted → approved → SEND VIA MANDATE** → the real send,
   the whole record (above); toast "Sent — the contact record is
   stamped"; the Art. 14 banner flipped to NOTIFIED.
2. **Idempotency** — a second click: "This strategy was already sent
   — the contact log has the record." No second email.
3. **Send-time DNC refusal** (v2 approved first, then the person
   suppressed by hand): "This person is marked do-not-contact (Asked
   for no further contact this quarter (0ed drive)) — nothing was
   sent. Only a founder-level act with a recorded reason clears the
   suppression." Verbatim, naming the recorded reason.
4. **Founder clear**, then **the org daily cap at 1** (one send
   already made): "The organisation's daily send cap (1) is reached —
   nothing was sent today." Cap restored to NULL after.
5. **Webhook honesty**: 307 found → fixed → deployed → 503
   "webhook not configured" (dormant-safe, reachable).

Screenshots (`.playwright-mcp/`): comms-0ed-approved-send-button,
comms-0ed-sent-notified, comms-0ed-send-dnc-refusal,
comms-0ed-cap-refusal.

Teardown on scratch ids and known-zero baselines to the durable
baseline EXACTLY (23 users / 22 agents / 68 events / 1 profile /
zeros across outreach, notifications, suppressions, strategies; cap
NULL; the founder's session only). The drive's one real email stands
in the founder's own inbox as evidence.

### Phase 4 verdicts — drafted, for the founder to confirm

- **Level ≤1 candidate email is LIVE end to end**: draft (#21) →
  human approval → the service's ladder → Resend → the atomic
  record with the Art. 14 duty provider-confirmed. The mailto flow
  stands beside it, untouched.
- **Founder-hand to activate delivery tracking**: create the webhook
  in the Resend dashboard pointing at
  `https://getmandate.io/api/webhooks/resend` (events: delivered,
  bounced, complained) and set `RESEND_WEBHOOK_SECRET` in Vercel
  production (+ redeploy). Until then sends work and the status
  honestly stays 'sent'.
- **Stage two next on this confirmation: 100 — #22 Candidate
  Engagement Agent** (engagement_states with the escalated-row pin
  and the draft column per D8b, the thread view, vocabulary
  `engagement_updated`), its own harness + control + 0ee drive +
  §95 draft.
- **`.env.local` pairs remain founder-hand** (both Engage agents).

---

## 95. §94 confirmed — the comms service COMPLETE; stage two (100, #22) unlocked — 2026-08-25

The founder confirmed §94 in writing 2026-08-25. Stage one of the
099–100 pair is complete: the Candidate Communication Service live at
level ≤1 end to end, the first candidate email sent with the whole
record, the Art. 14 discharge provider-confirmed. §94's drafted
verdicts stand as confirmed. NEXT-comms-engagement.md SURVIVES (it
covers the pair) with stage one marked confirmed; **stage two — 100,
the #22 Candidate Engagement Agent, the twenty-third principal —
runs next** per the confirmed D4: engagement_states (escalated-row
pin BOTH faces; the `draft` jsonb column per D8b), the thread view in
the outreach panel (direction + delivery status + sender honesty),
vocabulary `engagement_updated` (allowlist TWENTY-EIGHT, CHECK 69),
its own harness + escalated-pin control + 0ee drive + §96 verdicts
drafted. Founder-hand items open: Resend dashboard webhook +
RESEND_WEBHOOK_SECRET (+ redeploy); both Engage `.env.local` pairs.
Numbers: next migration 100, next handoff § 96, next drive prefix
0ee; durable baseline 23 users / 22 agents / 68 events / 1
network_profile / 1 org_comms_policy.

---

## 96. Engage slice four — the Candidate Engagement Agent (#22), the twenty-third principal — 2026-08-25 — DRAFT

Stage two of the confirmed 099–100 pair (D4/D8b, confirmed in
writing 2026-08-25), built and driven the same night. **This § is a
DRAFT: no completion is declared and NEXT-comms-engagement.md is not
deleted until the founder confirms these verdicts.**

**Migration 100** (MCP + `supabase/migrations/100_agent_engagement.sql`,
commit `b1f4983`): `engagement_states` — one row per candidate+project
LANE (UNIQUE), the 8-state CHECK exactly as confirmed
(awaiting_reply|replied|responding|timing_follow_up|declined|
interested|escalated|closed), `next_follow_up_at`, and `draft` jsonb —
the D8b column: the proposed follow-up the human approves and sends
through the service, or it dies unsent. **The escalation-coherence
CHECK is bidirectional** — `(state = 'escalated') =
(escalation_reason IS NOT NULL)`: an escalation without a reason is
not a record, and a reason cannot outlive its escalation (the resolve
clears both in one act). RLS per spec §11: org S; human U
(can_write_candidates — resolution, dismissal, closure); **#22 S+I+U
with THE ESCALATED PIN both faces**: USING refuses the agent any
escalated row (it can raise an escalation, never touch or resolve
one — resolution is the human's act), WITH CHECK restates
raise-must-carry-its-reason. NO human INSERT (a lane exists because
the agent judged a thread); NO DELETE for anyone. Vocabulary:
`engagement_updated` (counts only); CHECK rebuilt from the LIVE
pg_constraint list, 68 → 69; allowlist TWENTY-EIGHT.

**The harness** (`supabase/tests/agent_engagement_invariants.sql`):
read coverage under the agent (thread / approved strategy /
resolver-born profile / policy — every judgment input, nothing more);
the lane born and maintained by the agent with a counts-only,
text-probe-clean, correctly-attributed trail; history at
twenty-eight by COUNT; THE ESCALATED PIN all faces (the raise lands
with its reason; the escalated row then DEAD to the agent — resolve
attempt and draft touch both land nowhere; a reasonless raise refused
at policy AND table CHECK; the reason-without-escalation refused even
owner-side; the recruiter's resolve lands with the reason cleared;
viewer lands nowhere; no human INSERT door, no DELETE door; trail
doors refuse unknown types and humans); negative matrix incl. the
erasure queue; kill switches at TWENTY-THREE. **Control run verified**:
`engagement_states_agent_update` rebuilt with the escalated conjunct
dropped from USING ("the seam refuses escalated lanes anyway") — the
agent RESOLVED ITS OWN ESCALATION and the harness aborted at
INVARIANT-FAIL (4b); drift and harness in ONE transaction, the abort
rolling the rebuild back; live policy verified intact after.

**The principal.** Live account `vbreygin+engagement@gmail.com`, id
`8c1eb484-…`, Mandate HQ, §30 recipe, the flip as its OWN statement;
sign-in smoke-tested (self-read active agent, lanes readable) and the
session revoked; `AGENT_ENGAGEMENT_*` in Vercel production.
`.env.local` stays founder-hand (the pair is in this job's report,
joining the two prior Engage pairs). **New durable baseline: 24 users
/ 23 agents / 71 events** (the +3 creation trail keyed by member
name) **/ 1 profile / 1 policy** — 2 projects, 2 clients, 1
candidate, 5 skills, 1 job_spec unchanged; all send/lane classes
zero.

**The seam + surfaces** (`run-engagement.ts`, `engagement.ts`,
`engagement-merge.ts` + 12 vitest → 868, `engagement-actions.ts`,
`engagement-panel.tsx`, the outreach panel's thread view,
`session.ts` kind `engagement`): the agent re-reads the thread
(097's contact grant), the approved strategy, the relationship
record, and the comms policy under ITS session; **project-scoped
skills — a lane IS a mandate (D6)**; the spec-§10 HARD GATES run
deterministically FIRST (privacy / request-for-human / legal
lexicons — the conversation stops before any model turn);
`buildEngagementUpdate` is the pure clamp — only the four
maintainable fields, no reasonless escalation, an escalated lane
proposes nothing, and the draft is clamped through the SAME
strategy-policy validator as 097's drafts and 099's sends (three
layers, one rule). A suppressed person and an escalated lane are
both refused BEFORE any model spend. The thread view labels every
row honestly: provider rows "sent via Mandate" with the delivery
fact, bare outbound rows "logged by hand", `sent_by_principal`
rendered as the agent label the day Scout earns it. The registry's
ENGAGE chapter carries three principals; the footer counts
twenty-two siblings.

### Driven live on production (deploy `mandate-6e9iz5q7l` = `b1f4983`)

Scratch world 0ee INSIDE Mandate HQ: operator Selma Voss (is_founder
admin, never the real founder), mandate "0EE VP Engineering"
(fictional Corvane Analytics Group), one sourced candidate (a
founder-controlled test address), a hand-logged outbound touch and an
inbound "travelling until Thursday" reply, one approved strategy.
The acts, each verified in the database as it landed:

1. **The resolver proved itself again at seed time** — the scratch
   candidate's INSERT birthed the person before any code ran.
2. **Open engagement lane** → the agent judged the thread correctly:
   lane born `timing_follow_up`, next touch 2026-08-28 (the Friday
   after "travelling until Thursday"), a proposed follow-up saying it
   will reach back out on Friday; ONE `engagement_updated` event,
   counts only (thread 2, inbound 1, has_draft true); zero agent
   sessions after.
3. **Send via Mandate on the PROPOSAL — the D8b loop closed**: the
   human's click sent the agent's draft through the comms service
   under the OPERATOR's name — provider `resend` + ref, delivery
   `sent`, `sent_by_principal` FALSE (honest), `thread_key` minted,
   notice carried, the candidate_notifications row AND the Art. 14
   stamp landed atomically via `complete_candidate_send`; the lane's
   draft cleared and the lane awaits the reply — Mandate's SECOND
   candidate email, and its first agent-drafted, human-sent one.
4. **The thread view is honest**: the provider row reads "sent via
   Mandate · sent", the hand-logged touch reads "logged by hand".
5. **The hard gate, deterministic**: an inbound "stop contacting me
   and delete my data" → Update engagement escalated the lane with
   `hard_gate: true` — the privacy reason verbatim, NO model call,
   no draft; the agent's own button dead while escalated (proven
   disabled), the banner naming the reason; the human resolved it.
6. **AN UNPLANNED FINDING, the layers working in depth**: after a
   follow-up inbound RETRACTED the deletion request ("meant for
   another sender"), the hard gate — which reads the LATEST inbound
   only — correctly let the model take its turn, and the MODEL
   escalated anyway: "the data-deletion and unsubscribe request on
   record requires a human to review… whether the retraction is
   sufficient." Policy uncertainty escalated honestly rather than
   guessed at — the spec-§10 agent-recommended lane observed live,
   unprompted.
7. **Steering probe** — a Skills-Studio-authored, PROJECT-scoped
   skill naming its target schema field: the next proposal's draft
   subject began **"STEERED-0EE:"** on production.
8. **Suspended from /ops → D5 VERBATIM** ("The Candidate Engagement
   Agent could not run — an operator has suspended it or its
   credentials are absent. The conversation record is untouched. Try
   again when it is restored."), captured by MutationObserver;
   restored.
9. **/app/agents** — 23 principals, ENGAGE carries three, the footer
   counts twenty-two siblings.

Screenshots (`.playwright-mcp/`): engagement-0ee-panel-empty,
engagement-0ee-proposal-card, engagement-0ee-thread-honest,
engagement-0ee-escalated-hardgate, engagement-0ee-model-escalation,
engagement-0ee-steered-draft, engagement-0ee-suspended-d5,
agents-0ee-engage-three.

Teardown on scratch ids and KNOWN-ZERO baselines (every send/lane
class swept whole), the suspend/restore residue keyed by VALUE with
the creation trail's pending→active untouched, the operator's session
revoked by the operator's own deletion — no global signout. Durable
baseline landed EXACTLY; the one remaining session is the founder's.

### Phase 4 verdicts — drafted, for the founder to confirm

- **The 099–100 pair is functionally complete**: the service sends,
  the agent manages, the human decides. Level ≤1 outbound engagement
  is live end to end — draft (#21) → approve → send (099) → judge the
  thread (#22) → propose → human send (099) — with the escalated pin,
  the DNC family, the caps, and the Art. 14 machinery all enforced in
  the database.
- **The hard gates are deterministic-first as specced (§10)**, and
  the drive showed the model layer catching what the lexicon layer
  deliberately passes (the retracted-deletion case) — two layers,
  both observed working, neither trusted alone.
- **Inbound stays designed-NOT-built** (spec §6, D8f): the drive's
  inbound rows were hand-logged/seeded; no MX, no webhook-mailbox, no
  classification judgment shipped. The thread_key routing is minted
  and waiting.
- **Next per the confirmed §89 order: 101 #23 Pre-Screen** — noting
  the spec's counsel gate (§12) stands BEFORE any level ≥3 conduct;
  #23's evidence/interest capture at the current ceiling needs its
  own NEXT file and D-gate.
- **`.env.local` appends stay founder-hand** (all three Engage
  pairs); production is live without them.

---

## 97. §96 confirmed — the Engage pair 099–100 COMPLETE; 101 #23 Pre-Screen opens Phase 0 — 2026-08-25

The founder confirmed §96 in writing 2026-08-25. The Candidate
Engagement Agent (#22) is complete: the twenty-third principal, the
conversation lane durable with the escalated pin, the D8b loop
proven live (agent proposes, human sends through the service), the
hard gates deterministic-first with the model layer observed
catching what the lexicon deliberately passes. §96's drafted
verdicts stand as confirmed and NEXT-comms-engagement.md is DELETED —
the 099–100 pair is closed. **Next per the confirmed §89 order: 101
#23 Pre-Screen, opening with its own Phase 0 and D1–D8 gate**; the
spec-§12 counsel gate stands BEFORE any level ≥3 conduct, and
inbound stays designed-NOT-built (spec §6) — the slice must be
scoped to the shipped ceiling. Founder-hand items open: Resend
dashboard webhook + RESEND_WEBHOOK_SECRET (+ redeploy); all three
Engage `.env.local` pairs. Numbers: next migration 101, next handoff
§ 98, next drive prefix 0ef; durable baseline 24 users / 23 agents /
71 events / 1 network_profile / 1 org_comms_policy.

---

## 98. Engage slice five — the Pre-Screen Agent (#23), the twenty-fourth principal — 2026-08-25 — DRAFT

D1–D8 confirmed in writing 2026-08-25 (NEXT-prescreen-agent.md);
built and driven the same session. **This § is a DRAFT: no
completion is declared and NEXT-prescreen-agent.md is not deleted
until the founder confirms these verdicts.**

**Migration 101** (MCP + `supabase/migrations/101_agent_prescreen.sql`,
commit `d74450e`): `prescreens` — one LIVE row per candidate+project
lane (partial UNIQUE where status <> 'abandoned' — an abandoned
pre-screen is history, and the lane may be re-proposed); the
confirmed D3 deviations `question_set` jsonb and `escalation_reason`
with 100's bidirectional coherence CHECK; completion-stamp coherence
((status='complete') = (completed_at IS NOT NULL)). RLS per the
confirmed D5: org S; human U (can_write_candidates — invited on
send, abandon, resolve); **#23 INSERT pinned status='proposed' (born
a PROPOSAL — a birth at any other status refused, proven) and
UPDATE double-pinned BOTH faces: USING admits only
proposed/invited/in_progress — a COMPLETE pre-screen is TERMINAL to
the agent (what the candidate said never silently changes) and
abandoned/escalated rows are the human's; WITH CHECK refuses
'abandoned' (walking away is a human act).** NO DELETE for anyone.
Vocabulary `prescreen_updated` (counts only); CHECK rebuilt from the
LIVE list, 69 → 70; allowlist TWENTY-NINE.

**The harness** (`supabase/tests/agent_prescreen_invariants.sql`):
read coverage; the birth pin both ways; counts-only attributed
trail, question-text probe clean; history at twenty-nine by COUNT;
THE PINS all faces (unstamped completion refused; the COMPLETE row
dead to the agent — rewrite AND reopen land nowhere; the stamp
coherence binding even the owner; agent abandonment refused;
reasonless escalation refused; the escalated row the human's; the
human's resolve and abandon landing; re-propose admitted, duplicate
refused; **the NO-VERDICT probe scanning every landed jsonb for
/score|pass|verdict|qualif/i and finding nothing**); negative
matrix; kill switches at TWENTY-FOUR. **Control run verified**:
`prescreens_agent_update` rebuilt with the USING status conjunct
dropped ("the seam refuses terminal rows anyway") — the agent
REOPENED A COMPLETED PRE-SCREEN and rewrote its evidence; abort at
INVARIANT-FAIL (4c); drift and harness in ONE transaction, rolled
back; live pin verified intact after.

**The principal.** Live account `vbreygin+prescreen@gmail.com`, id
`82cce3bc-…`, Mandate HQ, §30 recipe, the flip its own statement;
smoke-tested and revoked; `AGENT_PRESCREEN_*` in Vercel production.
`.env.local` stays founder-hand (FOUR Engage-arc pairs now
outstanding). **New durable baseline: 25 users / 24 agents / 74
events** (the +3 creation trail keyed by member name); 1 profile / 1
policy / 2 projects / 2 clients / 1 candidate / 5 skills / 1
job_spec unchanged; every send/lane/pre-screen class zero.

**The counsel boundary, held (D2).** Nothing §12-gated shipped: the
agent COMPUTES the evidence gap — `evidence-coverage.ts`, a PURE
function over cv_structured × the five calibration dimensions that
deliberately never reads the score-shaped fit_dimensions — DRAFTS
the invitation and one question per unknown, and STRUCTURES the
answers; humans conduct the conversation and send every message
through the 099 service. §12 items 1–3 stay OPEN and gate level ≥3;
the mitigations shipped here by construction: human-conducted,
no-verdict (three layers: no column, the clamp's recursive
`stripVerdictKeys`, the harness probe), recruiter-ready DERIVED in
code and never stored. The invitation carries the SYSTEM-CONTROLLED
AI-disclosure block (`prescreenDisclosure` — appended by the send
action after the questions, outside anyone's edit; §12.1's
always-disclose pre-commitment, wording open for counsel).

**The seam + surfaces** (`run-prescreen.ts`, `prescreen.ts`,
`prescreen-merge.ts` + `evidence-coverage.ts` + 13 vitest → 881,
`prescreen-actions.ts`, `prescreen-panel.tsx`, `session.ts` kind
`prescreen`): project-scoped skills (a pre-screen IS a mandate's
act); the spec-§10 hard gates SHARED with #22 — one lexicon, one
rule, run before any model spend; the transcript copied from the
thread DETERMINISTICALLY (never the model's to write from memory);
`applyCommsPolicy` reused a FOURTH time on the proposed questions
(097 draft-time, 100 proposal-time, 099 send-time, 101
question-time); a suppressed person and a terminal record refused
before spend; the review panel renders the coverage chips, the two
tracks side by side, and the derived recruiter-ready line — never a
grade. The registry's ENGAGE chapter carries FOUR principals; the
footer counts twenty-three siblings.

### Driven live on production (deploy `mandate-e0ax67ffr` = `d74450e`)

Scratch world 0ef INSIDE Mandate HQ: operator Ingrid Kaslow
(is_founder admin, never the real founder), mandate "0EF Head of
Platform" (fictional Bellwether Clearing Group), two sourced
candidates (founder-controlled test addresses) — one with a rich CV
(3 dimensions evidenced, regulatory + transformation unknown), one
nearly blank with a "rather speak to a real person" reply already
logged. The acts, each verified in the database as it landed:

1. **The coverage chips rendered from the pure function** — 3 strong
   / 2 unknown, no model call, sources on hover.
2. **Start pre-screen** → born a PROPOSAL exactly per the gap: TWO
   questions (regulatory, transformation), 3 dimensions already
   validated from the CV, interest honestly `unknown` (no
   conversation yet); counts-only event; verdict probe ZERO; zero
   agent sessions after.
3. **Send invitation via Mandate — the human's act**: provider
   `resend` + ref, notice carried, notification + Art. 14 stamp
   atomic, `sent_by_principal` FALSE, the NUMBERED QUESTIONS and the
   SYSTEM DISCLOSURE BLOCK verifiably in the sent body; the
   pre-screen marked INVITED under the operator's session.
4. **The candidate's reply captured** (hand-logged inbound with
   EMIR/CFTC and consolidation answers, strong interest,
   three-month notice) → **Update pre-screen**: regulatory
   VALIDATED with the answer verbatim and its source; transformation
   graded conservatively PARTIAL; interest `strong`, notice "Three
   months"; the transcript's 2 turns copied deterministically;
   status COMPLETE with the stamp; **the derived Recruiter-ready
   chip appeared — evidence beside it, no grade anywhere**; verdict
   probe ZERO on the live row; the agent's button dead on the
   terminal record (proven disabled).
5. **Steering probe** — a Skills-Studio-authored, PROJECT-scoped
   skill naming its target schema field: the captured
   interest_profile.motivation began **"STEERED-0EF:"** on
   production.
6. **The hard gate on the second lane**: Start pre-screen against
   the "rather speak to a real person" reply → ESCALATED
   deterministically ("the candidate asked for a human",
   `hard_gate: true`, no model spend, no questions drafted); the
   human resolved it to ABANDONED — both human-only acts proven in
   the drive as in the harness.
7. **Suspended from /ops → D5 VERBATIM** ("The Pre-Screen Agent
   could not run — an operator has suspended it or its credentials
   are absent. The pre-screen record is untouched. Try again when it
   is restored."), captured by MutationObserver; restored.
8. **/app/agents** — 24 principals, ENGAGE carries four, the footer
   counts twenty-three siblings.

Screenshots (`.playwright-mcp/`): prescreen-0ef-coverage,
prescreen-0ef-proposal, prescreen-0ef-complete-tracks,
prescreen-0ef-escalated-hardgate, prescreen-0ef-suspended-d5,
agents-0ef-engage-four.

Teardown on scratch ids and KNOWN-ZERO baselines, the
suspend/restore residue keyed by VALUE with the creation trail
untouched, the operator's session revoked by the operator's own
deletion — no global signout. Durable baseline landed EXACTLY; the
one remaining session is the founder's.

### Phase 4 verdicts — drafted, for the founder to confirm

- **THE ENGAGE ARC IS BUILT.** All four §89 principals live — #21
  Outreach Strategy, #24 Relationship, #22 Engagement, #23
  Pre-Screen — plus the comms service beneath them. The confirmed
  order 097→098→099-100→101 is complete end to end at level ≤1:
  every message a human's send, every suppression enforced in the
  database, every artifact verdict-free, every escalation a human's
  to resolve.
- **The counsel gate (§12) was never touched**: no AI-conducted
  conversation, no autonomous send, no level ≥3 — those stay behind
  counsel and Scout's mission system (both explicitly deferred).
- **Inbound stays designed-NOT-built** (spec §6): every inbound in
  this drive was hand-logged; the thread_key routing and the
  webhook door wait behind their own gate.
- **After the arc, per the standing order: the pre-launch
  checklist** (CLAUDE.md) — advisor sweep, Turnstile, key rotation,
  RLS review, FK indexes — with Scout's mission system and the
  inbound gate as their own future D-gated slices.
- **`.env.local` appends stay founder-hand** (all four Engage
  pairs); production is live without them.

---

## 99. §98 confirmed — THE ENGAGE ARC IS COMPLETE; Skills Studio review opens — 2026-08-25

The founder confirmed §98 in writing 2026-08-25. The Pre-Screen
Agent (#23) is complete: the twenty-fourth principal, the no-verdict
record with its terminal pin, the counsel boundary held. §98's
drafted verdicts stand as confirmed and NEXT-prescreen-agent.md is
DELETED. **The Engage arc — #21, #24, the comms service, #22, #23 —
is COMPLETE at level ≤1**; Scout's mission system and the inbound
gate remain deferred behind their own future D-gates, and the §12
counsel items gate level ≥3. Founder-hand items open: Resend
dashboard webhook + RESEND_WEBHOOK_SECRET (+ redeploy); the four
Engage `.env.local` pairs. Numbers: next migration 102, next
handoff § 100, next drive prefix 0f0; durable baseline 25 users /
24 agents / 74 events / 1 network_profile / 1 org_comms_policy.
Next on the founder's word: a review of Skills Studio and the
skill-creation process.

---

## 100. Skills Studio review + repairs — 2026-08-25 — DRAFT

On the founder's word (§99): a full review of Skills Studio and the
skill-creation process, then the repairs, built and driven the same
session (commit `7b4577e`, deploy `mandate-nq0bh4ao1`, drive 0f0).
**This § is a DRAFT: no completion is declared until the founder
confirms these verdicts.**

### The review, as found

The pipeline: admin-only at both layers (skills:write = admin; RLS
is_org_admin — no capability/RLS mismatch); three scopes (org-wide
search, client-scoped client, project-scoped role); injection under
the AGENT's own session via 074's skills_agent_select, XML-escaped,
appended trailing (authoritative), degrade-to-base-prompt on any
failure. All 33 model-calling seams inject — the header claim
"injected into every AI agent run" is true. The trust story is
sound: skills steer JUDGMENT (proven STEERED-0E5→0EF), and
everything consequential sits behind deterministic clamps a skill
cannot talk past (disclosure/comp clamps, DNC guard, no-verdict
strip, the editorial pins). Precedence and trigger conditions are
ADVISORY by design — prose in the injected block, model-judged; the
UI says so honestly.

### Findings → repairs (all shipped)

1. **REAL DEFECT, fixed: create dropped the client scope.** The
   form collected `applies_to_client_id`, the parser validated it,
   and the INSERT omitted the column — every client-targeted skill
   created through the form landed with a NULL client, which the
   injector reads as "fires for EVERY client": silent scope
   WIDENING. Repaired; no live damage (all five durable skills are
   org-wide search skills, untouched).
2. **The list now shows client scope** — a "Client · name" /
   "Every client" chip on every client skill (the widened scope was
   previously invisible where you'd look for it), and the stale
   "same scope as a search skill" copy is gone from both the type
   card and the section blurb.
3. **"Where does it run?" de-enumerated** (the §82/stop-counting
   class): "Every agent run…" instead of a stale eight-surface list.
4. **Migration 102 — the studio gets a trail.** Five HUMAN event
   types (skill_created/updated/paused/activated/deleted; CHECK
   rebuilt from the LIVE list, 70 → 75). The intent door
   (`record_activity_event`) grows the family ADMIN-GATED inside
   the RPC — only the role that can change a skill can claim to
   have changed one; a recruiter and an agent are refused by name
   (insufficient_privilege), and the agent's own door refuses the
   family too. The agent allowlist is UNTOUCHED at twenty-nine.
   Trail detail carries the skill's NAME, type and scope — never
   the instructions' text. The feed describes all five acts, filed
   under mandates (skills change how every search scores);
   `APP_RECORDABLE_EVENTS`' pinned test updated deliberately — the
   tripwire fired as designed. **Harness + control run verified**
   (`skills_studio_invariants.sql`): the admin's five acts land
   attributed and counted; recruiter/agent/unknown-type refused at
   every door; agent history intact at twenty-nine. CONTROL (§42
   family): the CHECK rebuilt WITHOUT the skill family — 0 of 5
   events VANISHED SILENTLY and the count aborted the harness;
   drift rolled back.
5. **Zero-row honesty**: update / toggle / delete now `.select()`
   and refuse loudly when nothing landed (previously a stale or
   foreign id reported success).
6. **Guardrails**: length caps (name 120 / description 300 /
   trigger 1k / instructions 4k) with honest refusal sentences —
   every active skill rides every model call for its scope, and a
   dump should be split, not injected.

### Driven live on production (deploy `mandate-nq0bh4ao1` = `7b4577e`)

Scratch operator Petra Nyland (is_founder admin, never the real
founder). Through the repaired UI path: a client skill "0F0 Client
Preference Probe" scoped to a durable client — **applies_to_client_id
LANDED at create (the exact column that was dropped), the "Client ·
RBC Capital Markets" chip rendered in the list, `skill_created`
appeared in the trail under the operator's name with the client
linked and the scope booleans set, and the instructions' text was
provably absent from the trail (probe zero)**. Pause → Delete (the
/ops confirm-override trap applied) → `skill_paused` +
`skill_deleted` evented; the activity feed rendered all three acts
("Created the skill … (client-scoped)"). Screenshots
(`.playwright-mcp/`): skills-0f0-client-chip, skills-0f0-trail.
Teardown on the probe's name and the operator's — durable baseline
landed EXACTLY (25 users / 24 agents / 74 events / 5 skills; the one
session is the founder's).

### Phase 4 verdicts — drafted, for the founder to confirm

- **The studio's honesty gaps are closed**: scope lands as picked,
  scope is visible where it is managed, changes to the one surface
  that steers every agent now write their own record, and a
  no-op save can no longer report success.
- **Not built, deliberately**: skill versioning (what did it say
  BEFORE the edit — the trail records that a change happened, not
  the previous text) and a per-run active-skill count cap. Both are
  real; neither blocks the pre-launch checklist. Queue them on the
  founder's word.
- **Advisory precedence stands as designed** — deterministic
  precedence enforcement would require a resolver in the injector;
  the current prose rule plus field-naming steering practice is
  proportionate at five skills.
- **Next per the standing order: the pre-launch checklist.**

---

## 101. §100 confirmed — Skills Studio repairs COMPLETE; the Skill Creator architecture document under review — 2026-08-25

The founder confirmed §100 in writing 2026-08-25. The studio's
integrity repairs stand: scope lands as picked, scope visible,
changes evented and admin-gated, mutations truthful, caps in place.
The founder then tabled an external "Skill Creator Architecture"
document for analysis — whether adopting it in whole or part would
strengthen the process. The analysis follows this entry's session;
any adopted slices get their own D-gates. Numbers: next migration
103, next § 102, next drive 0f1; durable baseline 25 users / 24
agents / 74 events / 5 skills / 1 network_profile / 1
org_comms_policy.

---

## 102. The Skill Creator hardening slice — 2026-08-25 — DRAFT

The §101-tabled analysis adopted in its narrow form on the founder's
written scope (version table now, provenance when Scout lands),
built the same session (commit `bc21e96`, deploy `mandate-c5uhdotuo`).
**This § is a DRAFT: no completion is declared until the founder
confirms these verdicts.**

**Migration 103 — `skill_versions`** (MCP + numbered file):
append-only history fed by a SECURITY DEFINER trigger on skills
INSERT/UPDATE — the 098 resolver doctrine, every write path covered,
no app code to remember. NO foreign key to skills: **history
survives deletion of the current row** (the org FK stays and
cascades — tenant-erasure scope). Scope columns are plain uuids so a
deleted project/client cannot rewrite what the scope WAS. Actor =
`changed_by` (auth.uid(), NULL for owner-side writes, honestly) plus
denormalized `changed_by_label` (the 053 actor_label doctrine).
APPEND-ONLY by construction: SELECT (can_read_org) is the only
policy anyone holds; rows are born definer-side; no agent face — an
agent reads the ACTIVE skill through 074's grant, never the archive.
**Backfill**: the five durable skills received v1 'created'
snapshots (actor NULL — the migration wrote them), so the first
future edit of an existing skill still leaves its prior text
reconstructable. New durable baseline: **5 skill_versions** joins
the count set.

**The harness** (`supabase/tests/skill_version_invariants.sql`,
rolled back): create → v1 'created' actor-stamped with the label;
edit → v2 carrying the new text while v1 KEEPS THE OLD; pause and
reactivate reconstructable (v3 false / v4 true); append-only both
faces (the admin's rewrite and delete of history land nowhere);
**deleting the skill deletes nothing of its history** (4 of 4
survive the row); org boundary (a second org reads zero) and the
agent reads zero. **Control run verified**: the trigger DROPPED
in-transaction ("the app records versions anyway") → the edit
produced NO v2, the prior text became unrecoverable, abort at
INVARIANT-FAIL (1); drift rolled back, trigger verified live after.

**Injector observability**: both load-failure paths now reach
Sentry through `captureSeamError` — fail-OPEN to the base prompt
preserved (a run never blocks on skills), fail-LOUD added (a silent
load failure is how every recruiter skill quietly stopped applying
once before — the §30 after()/cookies() class).

**Injector unit proofs** (`skill-injector.test.ts`, 10 tests,
vitest 881 → 891): deterministic scope filtering — active injects,
paused never, wrong-project role skill never, wrong-client client
skill never, null-client client skill fires org-wide (the pre-049
rule, pinned); XML/meta-characters cannot close the wrapper (exactly
one `</skill>` and one `</active_skills>` — the wrapper's own);
attribute quotes escaped; multiple skills serialize
deterministically in LOAD ORDER, once each (no semantic-precedence
claim — the model resolves conflicts and the UI says so); load
failure preserves the base prompt with the seam evented.

**AGENTS.md** gains the five-concept architecture vocabulary —
Agent / Capability / Skill / Deterministic Policy / Workflow — with
the §20 decision rule (name which one it is before writing code).

**Deviation from the tabled scope, reported**: the v1 BACKFILL was
added (the spec did not ask for it) — without it, the first edit to
a pre-103 skill would have produced a v1 of the NEW text and the
prior wording would be unrecoverable, defeating the table's purpose.

**Deferred per the confirmed scope**: run-provenance (applied skill
ids/versions on agent events — Scout-era), per-run token budgets and
count caps, capability targeting, structured skills, history UI,
safety-preview UX, CAPABILITY.md rollout.

Green gate: tsc clean / vitest 891 / eslint clean / build clean.
Numbers: next migration 104, next § 103, next drive 0f1; durable
baseline 25 users / 24 agents / 74 events / 5 skills / 5
skill_versions / 1 network_profile / 1 org_comms_policy.

---

## 103. §102 confirmed — the Skill Creator hardening slice COMPLETE; the product pass tabled — 2026-08-25

The founder confirmed §102 in writing 2026-08-25. skill_versions is
live (append-only, trigger-fed, history survives deletion, v1
backfilled), the injector fails loud, the injector has its unit
proofs, and the vocabulary is doctrine in AGENTS.md. The founder
then tabled FIVE product items for analysis (naming de-AI-ing, a
role-template creator, an Optimizer, the copilot persona, a Kanban
board) — the analysis and the continuation prompt close this
session. Numbers: next migration 104, next § 104, next drive 0f1;
durable baseline 25 users / 24 agents / 74 events / 5 skills / 5
skill_versions / 1 network_profile / 1 org_comms_policy.

---

## 104. The naming pass — de-AI'd surfaces, the copilot becomes MANDY — 2026-08-25 — DRAFT

Product-pass slice one (NEXT-product-pass.md item 1 + item 4's UI
half), on the founder's word with the persona name picked: MANDY.
Commit `febf40d`, deploy
`mandate-irvvgqsdo`. **This § is a DRAFT: no completion is declared
and NEXT-product-pass.md is not deleted until the founder confirms
the product pass's slices.**

**De-AI'd names**: nav "AI search" → "Pool search" (nav-model +
test), the search page's breadcrumb/title/intro ("AI_CANDIDATE_
SEARCH" → "POOL_SEARCH"; "The AI parses" → "The Candidate Search
Agent parses"; "Sorted by AI match score" → "Sorted by match
score"), the registry's prose to agent language, Skills Studio
"every AI agent run" → "every agent run". THE DISCLOSURE BOUNDARY
STANDS UNTOUCHED: the pre-screen invitation's AI-disclosure block
and the §12.1 always-disclose pre-commitment are law, not naming.
The marketing title ("AI Executive Search Operating System") was
left as the founder's own call — say the word and it changes.

**Mandy**: the copilot persona renamed across the floating button,
panel header, message byline, aria labels, confirm and error
sentences. The PRINCIPAL stays "Copilot Agent" in the database and
registry (the trail join key and history's honesty); Mandy is
introduced in its registry line. localStorage history key and API
routes unchanged — existing conversations survive the rename.

**Verified live (drive 0f1, scratch operator Hattie Cormorant,
teardown exact 25/74/1)**: Pool search in nav and page with zero
AI-named strings; the Mandy button and panel on a real mandate; the
only remaining "Copilot" on the page is the RSC payload's internal
component name, not visible text. Screenshots:
naming-0f1-pool-search, naming-0f1-mandy-panel. Green gate: tsc /
vitest 891 (nav test updated with the label) / eslint / build.

Next per NEXT-product-pass.md: slice two, the candidate pipeline
Kanban board. Numbers: next migration 104, next § 105, next drive
0f2.

---

## 105. §104 confirmed — the naming pass COMPLETE; Kanban board next — 2026-08-25

The founder confirmed §104 in writing 2026-08-25. Pool search, agent
language, and Mandy stand. The session closes at the context ceiling;
the product pass continues in the next session per
NEXT-product-pass.md: slice two = the candidate pipeline Kanban
board (columns from the twelve pipeline_stage values, drag = an
evented stage change under the human's session, NO migration), then
the role-template creator (migration 104, D-gated), Optimizer Phase
0, the task domain, then the pre-launch checklist. Numbers: next
migration 104, next § 106, next drive 0f2; durable baseline 25 users
/ 24 agents / 74 events / 5 skills / 5 skill_versions / 1
network_profile / 1 org_comms_policy.

---

## 106. The pipeline Kanban board — product-pass slice two — 2026-08-25 — DRAFT

Product-pass slice two (NEXT-product-pass.md item 5a), per the
confirmed scope: per-mandate board, columns = the twelve
`pipeline_stage` values, drag = a stage change under the HUMAN's
cookie session through existing machinery; NO migration, NO new
principal, NO task domain. Commit `1cede08`, deploy
`mandate-kf4b3huac`, drive 0f2. **This § is a DRAFT: no completion
is declared and NEXT-product-pass.md is not edited until the founder
confirms.**

**The build**: `/app/projects/[id]/pipeline` — twelve columns in
funnel order (live CHECK read at session start, not the file), each
with a stage-toned accent bar, count, and terminal grammar
(`font-mono-label` headers, square borders, `tabular-nums`). Cards
move two ways, both through the EXISTING `updatePipelineStage`
server action (`candidates:write`, RLS `candidates_role_update`
behind it): pointer drag, hand-rolled on pointer events
(mouse-only BY DESIGN — a touch drag would kill board scroll; no
DnD dependency added), and a per-card stage `<select>` — the
keyboard and touch path, mirroring the detail page's control.
Optimistic overlay with revert-on-refusal and adjust-during-render
reconciliation (a stale overlay can never mask a change made from
another surface). Read-only board for roles without
`candidates:write` (route open like the candidate list; the meta
line says "read-only"). "Pipeline" joins the mandate module strip
after Candidates; the action's revalidate list gains the board
path. Sample ids land on `SampleNotBuilt` and the module is named
in `SAMPLE_MODULES_PENDING` — that list's own doctrine ("the next
module the product grows should land here before it lands in the
sample"). `STAGE_ACCENTS` is a parallel record over
`PipelineStage`, drift-tested (vitest 891 → 892).

**THE EVENTING FINDING — a founder call at this gate.** The
analysis line "(evented via existing machinery)" assumed machinery
that does not exist: live reads show `record_activity_event`'s
allowlist carries NINE human intent types, none stage-shaped, and
the CHECK's 75 types have no human candidate-stage event
(`candidate_withdrew` is the candidate portal's own act;
`placement_status_changed` is placements). A recruiter's stage
change — the dropdown that shipped months ago AND the new drag —
records NOTHING in the trail. `updatePipelineStage` even carries
the comment "userId reserved for a future audit-trail column".
Eventing it requires a vocabulary migration (CHECK rebuild +
intent-door allowlist + TS vocab + describe sentence — the
`placement_status_changed` from/to shape is the template), which
the confirmed scope excluded and 104 is reserved. The drive
verified the stage change LANDS under the human's session (the
record is the row, honestly stamped); the trail silence is
pre-existing, now documented. OPTIONS: ride `candidate_stage_changed`
into migration 104 alongside the role-template work, or accept the
silence until the task domain (5b) forces the question.

**Verified live (drive 0f2, scratch operator Quill Farrow,
recruiter)**: board renders 12 columns with six seeded candidates in
their stages; drag Found → Reviewed landed (toast "Tamsin Reece →
Reviewed", card moved, row at `reviewed` with `updated_at` stamped
at drag time); drag into an EMPTY Finalist column landed ("Nadia
Okafor → Finalist"); the select path landed Interviewed → Offer
("Petr Havel → Offer"); activity_events on all three moves: ZERO
(the finding above, proven live). Teardown EXACT first pass — the
candidate birth trigger minted 6 network_profiles from name-only
seeds (`name:<person>|<company>` identity keys — no email needed;
noted for future seeding), all swept by id; member events by
member name; auth family by user id, own rows only. Baseline
restored 25 users / 24 agents / 74 events / 5 skills / 5
skill_versions / 1 network_profile / 1 org_comms_policy / 2
projects / 2 clients / 1 candidate / 1 job_spec / 25 auth.
Screenshots: pipeline-0f2-board, pipeline-0f2-moved.

Green gate: tsc / vitest 892 / eslint / build (route in the table).
Next per NEXT-product-pass.md after confirmation: slice three, the
role-template creator (migration 104, its own D-gate). Numbers:
next migration 104, next § 107, next drive 0f3.

---

## 107. §106 confirmed — the Kanban board COMPLETE; the eventing ruled into 104 — 2026-08-25

The founder confirmed §106 in writing 2026-08-25 and ruled the
eventing finding: `candidate_stage_changed` RIDES MIGRATION 104
with the role-template slice — the vocabulary (CHECK rebuild from
the live 75-type list + the intent-door allowlist + TS
ACTIVITY_EVENT_TYPES/APP_RECORDABLE_EVENTS + a describe sentence on
the placement_status_changed from/to shape) and the recordActivity
call in `updatePipelineStage` (from-stage read before the update,
counts-and-stages detail, never free text). NEXT-product-pass.md
marks slice two DONE; the file stands until the whole pass closes.
Next: role-template creator Phase 0 (live schema reads first per
doctrine), D-gate drafted, BUILD GATED on written confirmation.
Numbers: next migration 104, next § 108, next drive 0f3; durable
baseline unchanged 25 users / 24 agents / 74 events / 5 skills / 5
skill_versions / 1 network_profile / 1 org_comms_policy.

---

## 108. The role-template creator + the stage-event rider — 2026-08-25 — DRAFT

Product-pass slice three on the founder's confirmed D1–D8 (D3(b) =
the exec ledger, founder's word). Commit `e90537d`, deploy
`mandate-ctfo5k204`, migrations 104 AND 105, drive 0f3. **This § is
a DRAFT: no completion is declared; NEXT-role-templates.md and
NEXT-product-pass.md stand until the founder confirms.**

**Built.** 104: `candidate_stage_changed` into the activity CHECK
(live 75→76) and into record_activity_event WITH the writer gate
(`can_write_candidates()` — the 102 skill_% precedent; a viewer
cannot forge a stage move); `template_created/updated/deleted` into
the exec ledger's CHECK (30→33); `created_by` on
executive_role_templates (updated_at stays app-stamped — the
D-gate's "house trigger" turned out not to exist; every surface
stamps in the action, so this one does too — deviation recorded).
The seam: updatePipelineStage reads the prior stage and records
{from, to} on every REAL move (no-ops record nothing) — the §106
silence closed for the dropdown and the board in one call site.
Creator surface: New/Edit/Delete on the templates page behind
skills:write (label now "Skills & templates"), shared TemplateForm
(auto-slug key, SHADOW WARNING when the key matches a global,
19 intake-default fields — the form's own names, nothing else
lands — and the 24-competency weight list), in-use delete refusal
with the count sentence, .select() zero-row honesty, exec-ledger
events (key/title/shadows_global — never the defaults' text),
ROUTE_RULES ×2, the stale "nothing to set up here" copy corrected.

**THE 105 FINDING — the harness caught a boundary that never
held.** Assertion 5 (delete backstop) FAILED on first run, and the
failure was REAL: 032's original single-column FK was ON DELETE
SET NULL — deleting a referenced template silently DETACHED every
referencing search (NULLing template_id), which MATCH SIMPLE-
exempted 056's two composite NO ACTION constraints. The guarantee
056's own commentary states ("a template referenced by any search
cannot be deleted") never held; provenance was one superuser
mistake from vanishing. 105 rebuilt the FK NO ACTION; the
assertion now passes and pins it. The record does not lose its
pointer because somebody deleted the template.

**Harness** (role_template_invariants.sql, live, rolled back):
admin authors + created_by pinned / recruiter refused / global
UPDATE lands zero rows / coherence CHECK refuses org-claiming-
global / referenced delete refused (post-105) / intent door three
faces (viewer refused insufficient_privilege, recruiter's event
lands with the right face, agent door refuses the human type) /
§42 exact-count. CONTROL RUN: the writer gate dropped → the
VIEWER's forged stage event LANDED → INVARIANT-FAIL (6a),
self-rolled-back; live door verified intact after.

**Drive 0f3** (scratch admin Perrin Ashgrove + scratch recruiter
Sable Winterton, both torn down): 8 global cards + New Template /
form with live shadow warning on `cto_seed_saas` / org row landed
(org-scoped, is_global false, created_by = operator, 2 weights) /
ledger `template_created` shadows_global TRUE / THE OVERRIDE AT
THE SURFACE: ?template=cto_seed_saas resolved the ORG row — chip
named the shadow, defaults prefilled from it / search created from
it: tier pair (template_is_global false, template_org_id
generated), 2 competency rows source "template", search_created in
the ledger / referenced delete REFUSED with the count sentence
verbatim / edit round-trip (prefill exact, template_updated) /
disposable template created + deleted clean (template_deleted) /
THE RIDER ON THE BOARD: drag found→reviewed landed
candidate_stage_changed under the operator with {from, to} and the
feed rendered "Moved the candidate from found to reviewed" /
recruiter face: all nine cards readable, ZERO authoring
affordances. UNPLANNED FINDING: creating the search AUTO-RAN the
Executive Intelligence Agent's context research (15 sources,
trigger "initial", counts-only event) — §82's machinery working
unprompted; template-drive teardowns must sweep that event and the
intake-resolved client, and both were (the §82 checklist held).
Teardown EXACT first pass: durable baseline 25 users / 24 agents /
74 events / 5 skills / 5 skill_versions / 1 network_profile / 1
org_comms_policy / 2 projects / 2 clients / 1 candidate / 1
job_spec / 25 auth, AND the exec side at 8 templates / 0 searches
/ 0 competency rows / 0 ledger rows / 0 profiles. Screenshots:
templates-0f3-list-with-new, templates-0f3-shadow-warning,
templates-0f3-override-prefill, templates-0f3-delete-refusal,
templates-0f3-stage-event-feed, templates-0f3-recruiter-readonly.

Green gate: tsc / vitest 893 / eslint / build. Numbers: next
migration 106, next § 109, next drive 0f4. Next per the pass after
confirmation: Optimizer Phase 0, then the task domain, then the
pre-launch checklist.

---

## 109. §108 confirmed — slice three COMPLETE; Optimizer Phase 0 opens — 2026-08-25

The founder confirmed §108 in writing 2026-08-25. Org-authored role
templates, the stage-event rider, and the 105 backstop stand;
NEXT-role-templates.md deleted per doctrine. The product pass moves
to slice four: THE OPTIMIZER — Phase 0 first (enumerate which
optimizations EXIST vs which need NEW judgments, per the §103
analysis and the AGENTS.md §20 test: a UI feature unifying existing
capabilities, NOT a new principal), then its gate; BUILD GATED on
written confirmation. Hard boundary restated: presentation polish is
the Positioning Agent's ADVISORY lane — the record is never
rewritten; the no-verdict doctrine untouched. Numbers: next
migration 106, next § 110, next drive 0f4; durable baseline
unchanged.

---

## 110. The Optimizer — product-pass slice four — 2026-08-25 — DRAFT

Slice four on the founder's confirmed D1–D8 with all three rulings
(human provenance on the calibration apply; the advisory set stays
advisory; zero migration with a stop-and-re-gate clause — the D3
live read passed: calibration_history_role_insert admits humans
under can_write_mandates, so the clause never fired). Commit
`fbfcf94`, deploy `mandate-nozp9um59`, drive 0f4. NO migration, NO
principal, NO new vocabulary. **This § is a DRAFT: no completion is
declared; NEXT-optimizer.md and NEXT-product-pass.md stand until
the founder confirms.**

**Built.** `/app/projects/[id]/optimize` (module strip after
Metrics) — composition, not relocation: the health-suggestions
panel, the coverage panel and the existing quick acts (spec
regenerate, generate-all where lawful) are the same components and
server actions their home surfaces use. Rule-based HealthAlerts
render as advisory signal rows. The honest healthy state per D4:
the page exists, says the search is healthy, keeps the quick acts.
THE ONE NEW ACT (D2): `applyCalibrationSuggestionAction` — the
`applicable_payload` contract §103's inventory found half-wired is
now finished. Pure bridge `bridgeCalibrationSuggestion` (8 vitest →
901): ±3 band REFUSED not clamped, [0,10] clamp with the EFFECTIVE
delta reported, bound no-ops refused, no-baseline refusal mirrors
applyRecalibration's skip. The panel offers Apply only when a
preview can say before → after; the confirm names the re-score;
weights + suggestion dismissal land in ONE update so a repeat click
cannot double-apply; the history snapshot wears the RECRUITER's
face with the suggestion id in change_reason; gated
mandates:write — the same predicate the RLS INSERT enforces.

**Drive 0f4** (scratch recruiter Wren Calloway; stalled mandate +
healthy control, torn down): the at-risk face (chip, two alert
rows, panel offering); a REAL agent run (~35s) dealt every face
unprompted — 3 sourcing with replacements, 1 advisory feedback
(Dismiss only, correctly), 1 calibration (transformation +1);
preview verbatim "transformation 8 → 9 · Applying re-scores every
candidate"; confirm sentence exact; applied → weights 8→9 with
nothing else moved, suggestion dismissed, history snapshot
change_type recalibration / changed_by THE OPERATOR / reason naming
the suggestion id — the provenance ruling proven live; the sourcing
apply landed linkedin_exact v1 on the same surface; the healthy
control (after the seed was topped to 5 candidates + feedback — the
first thin seed was honestly AT RISK by the live rules, a seeding
lesson, not a defect) rendered the honest healthy line with zero
alerts and the panel absent by its own gate. Re-score note: the
scratch candidates carry no parsed profiles, so computeAndStoreScores
ran over zero scoreable rows — the failure-tolerant contract held
(weights kept). Teardown EXACT first pass to
25/24/74/5/5/1/1/2/2/1/1 + queries 0 + calibration_history 0.
Screenshots: optimize-0f4-at-risk, optimize-0f4-weight-preview,
optimize-0f4-applied, optimize-0f4-healthy.

Green gate: tsc / vitest 901 / eslint / build. Numbers: next
migration 106, next § 111, next drive 0f5. Next per the pass after
confirmation: Kanban (b) — the task domain, its own gate — then the
pre-launch checklist.

---

## 111. §110 confirmed — the Optimizer COMPLETE; task-domain Phase 0 opens — 2026-08-25

The founder confirmed §110 in writing 2026-08-25. The Optimizer
stands (calibration apply with human provenance, composition
surface, zero migration); NEXT-optimizer.md deleted per doctrine.
The product pass reaches its final slice: KANBAN (b) — THE TASK
DOMAIN. Per the §103 analysis this is a NEW DOMAIN, not a UI slice:
tasks table, assignees, status, RLS (org SELECT / assignee+desk
UPDATE), desk-page integration, member-facing views — its own
migration (106), harness and D-gate; nothing smuggled from (a).
Phase 0 first; BUILD GATED on written confirmation. Numbers: next
migration 106, next § 112, next drive 0f5; durable baseline
unchanged.
