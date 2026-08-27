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

---

## 112. The task domain — product-pass slice five, THE PASS'S LAST — 2026-08-25 — DRAFT

Slice five on the founder's confirmed D1–D8 and all four rulings as
recommended (R1 assignees = active admin/manager/recruiter/
researcher; R2 nullable project_id with ActionItem widened; R3 no
DELETE — cancelled is the walk-away; R4 desk-only creation). Commit
`668f26a`, deploy `mandate-ozckj5yoe`, migration 106, drive 0f5.
**This § is a DRAFT: no completion is declared; NEXT-task-domain.md
and NEXT-product-pass.md stand until the founder confirms.** NOTE
FOR THE RECORD: an earlier pre-draft "D1–D8 confirmed" arrived
before the gate existed and was DECLINED as unattachable — the gate
was drafted, presented with the four named rulings, and confirmed
against the real document. The doctrine held.

**Built.** 106 = `tasks` (org conventions; coherence CHECKs done ⇔
stamped ⇔ signed; unassigned is a real state) + 097-shape RLS
(org-wide SELECT; desk-only INSERT with created_by pinned; UPDATE
for desk-or-assignee with the completed_by pin — nobody signs
another's completion; NO DELETE for anyone) +
guard_task_assignee_changes() on the 064 model (assignee must be
ACTIVE and in the R1 set; only the desk assigns or reassigns; the
author never changes; predicates COALESCED per the 064 lesson) +
task_assigned/task_completed (CHECK 76→78 rebuilt from
pg_constraint; intent door 10→12, task_assigned desk-gated inside
the RPC; grants re-declared; labels snapshotted at write time).
Surfaces: the desk gains a Tasks section (create/assign/reassign/
complete/cancel) and an open-tasks (overdue) column; the roster
widened to researchers with the mandate-reassign picker filtered
back to lead-capable roles (the 064 trigger would refuse a
researcher lead); the digest input gains per-member open/overdue
counts through the ONE shared rollup; /app/home gains MY_TASKS
(complete button; honest absence when empty) and the action queue
gains task_overdue (attention, above the chores) and task_due
(routine, last) under its consequence rules — ActionItem's project
now nullable, "your desk" the label when it is. vitest 904 (queue
task rows + describe cases).

**Harness** (task_invariants.sql, live, rolled back): manager
creates+assigns with the pinned author / recruiter INSERT refused /
assignee completes own (stamped+signed) / NON-assignee lands ZERO
rows / forged completed_by refused / viewer AND agent refused as
assignees BY NAME + non-desk reassignment refused / intent door
three faces (recruiter's task_assigned insufficient_privilege;
assignee's task_completed lands with the right face; agent door
refuses) / §42 exact counts + org containment. CONTROL RUN: the
assignee-or-desk disjunction dropped to plain can_read_org → a
THIRD recruiter completed someone else's task → INVARIANT-FAIL
(4), self-rolled-back; live policy verified intact after.

**Drive 0f5** (scratch manager Elowen Thack + scratch recruiter
Jory Penhale, both torn down): desk Tasks section live with the
real roster; overdue project-scoped task created for Jory
(task_assigned under the MANAGER with Jory's snapshotted label) +
an unassigned desk task; cancel leaves the row saying cancelled;
Jory's /app/home showed the NEEDS_YOU aggregate ("1 of your task is
past due" · "your desk") AND MY_TASKS with the overdue mark;
Complete landed done+stamped+signed-by-Jory with task_completed
under HIS face, and both panels honestly emptied. Teardown EXACT
first pass to 25/24/74/5/5/1/1/2/2/1/1 + tasks 0 (no candidates
seeded — no network-profile residue this drive). Screenshots:
tasks-0f5-desk-board, tasks-0f5-my-tasks-needs-you.

Green gate: tsc / vitest 904 / eslint / build. Numbers: next
migration 107, next § 113, next drive 0f6. On confirmation THE
PRODUCT PASS IS COMPLETE — next per the standing order: THE
PRE-LAUNCH CHECKLIST (advisor sweep, Turnstile, key rotation, RLS
review, FK indexes).

---

## 113. §112 confirmed — THE PRODUCT PASS COMPLETE; the OKR/KPI programme tabled — 2026-08-25

The founder confirmed §112 in writing 2026-08-25. All five slices of
the §103 product pass stand confirmed (naming §105, pipeline Kanban
§107, role templates + rider §109, Optimizer §111, task domain
§113's own predecessor §112) — NEXT-task-domain.md and
NEXT-product-pass.md deleted per doctrine. THE PASS IS CLOSED.

The founder then tabled the next programme, taking the slot ahead of
the pre-launch checklist: OKRs AND KPIs — a component letting
Recruiters and Managers set objectives and metrics (financial,
quantitative, qualitative) to measure performance and delivery, tied
to the pipeline (Kanban) data with metric tracking; financial
metrics landing on the Placements page, the rest enhancing
Analytics; the whole enabling strategy creation; then rolled out
per persona EXCEPT Admins (technical support only). Brief captured
in NEXT-okr-programme.md. Phase 0 first; the D-gate is drafted and
presented BEFORE any confirmation attaches (§112's process note is
precedent); BUILD on the founder's written word against the drafted
gate. Numbers: next migration 107, next § 114, next drive 0f6;
vitest 904; durable baseline unchanged (25/24/74/5/5/1/1/2/2/1/1,
tasks 0); allowlist 29, activity CHECK 78, intent door 12.

---

## 114. The OKR/KPI programme, slice one — the objectives domain — 2026-08-25 — DRAFT

Slice one on the founder's confirmed D1–D9 and all four rulings as
recommended (D2 = okrs:write to recruiter/manager/admin, admins
excluded from surfaces and from OWNING — the guard refuses an admin
owner; D8's rider = the TS mirror reconciled). The gate document
itself is committed: docs/superpowers/specs/2026-08-25-okr-kpi-design.md.
Commits `ebd7ffc` + `78bc536`, deploy `mandate-4yb1toinm`, migration
107, drive 0f6. **This § is a DRAFT: no completion is declared;
NEXT-okr-programme.md stands until the founder confirms.**

**Built.** 107 = `objectives` (org conventions; owner NOT NULL;
period NOT NULL with ordering CHECK; coherence CHECKs closed ⇔
stamped ⇔ signed; abandoned unstamped — the walk-away) +
`objective_key_results` (kind CHECK financial/quantitative/
qualitative; the metric vocabulary as a CHECK — nine quantitative
slugs + two financial; target⇔kind, currency⇔financial,
attestation⇔qualitative biconditionals; **NO candidate column — R2
structural**) + guard_objective_owner_changes() on the 064 model
(author immutable; only the desk hands an objective to someone else;
owner must be an ACTIVE manager or recruiter — ADMIN REFUSED BY NAME,
R4; predicates COALESCED) + 097-shape RLS (org-wide SELECT with the
FEES-TIER clause on financial rows — `kind <> 'financial' OR
can_read_fees()`, the 053/054 tiered-row precedent, R1; okr-writer
INSERT with created_by pinned; owner-or-desk UPDATE with the close
pin AND the attestation pin — nobody signs another's close or
attestation; NO DELETE for anyone on either table, R3) +
objective_created/objective_closed (CHECK 78→80 rebuilt from
pg_constraint; intent door 12→14, both gated can_write_okrs inside
the RPC; grants re-declared; detail carries titles/scopes/outcomes —
NEVER amounts).

Surfaces: `okrs:write` in roles.ts (recruiter/manager/admin);
/app/objectives (org:read view, no ROUTE_RULES entry — the Kanban
shape, controls behind okrs:write: create with the desk-only owner
picker filtered to active managers+recruiters, per-objective KR
composer with kind-driven fields, attest, close met/missed, abandon
behind window.confirm); Analytics gains the OBJECTIVES section
(non-financial KRs only — financial rows not even fetched, R1);
Placements gains the financial-objective strip under the existing
seesFees; `computeObjectiveProgress` (src/lib/okrs/) computes LIVE —
stage-derived metrics read the `candidate_stage_changed` EVENT STREAM
(the honest Kanban tie; pipeline.ts's own "until a stage-history
table exists" caveat answered with the history that already exists),
financial metrics sum whatever fee lines RLS returned (the
Placements-page doctrine). D8 rider: ACTIVITY_EVENT_TYPES reconciled
46→80 (the 067-era external block + the 091–101 agent events had
drifted; the feed rendered them as raw slugs) with describe
sentences for all 34. vitest 904→929.

**Deviations from the gate, recorded:** (a) the `current_value`
snapshot column was dropped — progress is computed at read time,
never stored (§13's same-thing-twice family; the metrics machinery's
settled answer); (b) no `unit` column — currency covers financial
and the metric slug implies the rest; (c) the credited-placement
exception does NOT extend to financial KR reads — a KR aggregates a
period's book, so no single placement's credit could honestly anchor
it; can_read_fees() alone gates the row.

**Harness** (okr_invariants.sql, live, rolled back): twelve
invariants — recruiter self-creates with created_by pinned / manager
desk-sets for another / recruiter refused setting another's owner /
ADMIN, VIEWER and AGENT refused as owners BY NAME / researcher and
viewer refused creation / non-owner update lands ZERO rows +
non-desk handoff refused + author rewrite refused / close pin both
faces / THE MONEY BOUNDARY: viewer and researcher read ZERO
financial rows while reading the quantitative one, fees:read
recruiter reads it / attestation pin both faces + non-owner KR edit
zero rows / the three structural CHECKs refuse currencyless money, a
scored milestone, a rogue metric / intent door three faces
(researcher insufficient_privilege; recruiter's event wears the
right face; agent door refuses the human type) / §42 exact counts +
org containment. CONTROL RUN: the financial clause dropped from the
KR SELECT policy → the VIEWER read the money row → INVARIANT-FAIL
(8), self-rolled-back; live policy verified intact after.

**Drive 0f6** (scratch manager Maren Callow + scratch recruiter
Tobias Wrenfield, both torn down): Tobias created "Q3 fintech
delivery" (whole book, Aug–Oct) — no owner picker on the
recruiter's form — then all three KR kinds: submissions 0/12 AT
RISK, fees_earned US$0/US$250,000 AT RISK, qualitative milestone
PENDING → Attest landed "attested · Tobias Wrenfield" and read MET;
Analytics OBJECTIVES section showed the quantitative and qualitative
rows and NO MONEY ANYWHERE; **0f6 FINDING: with zero real placements
the Placements page's sample short-circuit HID the real financial
strip — a real fees_earned target suppressed by a gate keyed on
placements alone; fixed (`78bc536`, the strip escapes the ternary,
seesFees + RLS still the boundary) and redeployed mid-drive**, after
which the strip rendered US$0 / US$250,000 with the owner and
period; Maren's form DID show the owner picker with exactly the
legal vocabulary (Myself / Maren Callow / Tobias Wrenfield — no
admin, no viewer, no agent), desk-set an objective OWNED by Tobias
scoped to the IT Operations mandate, and closed it MISSED under her
own signature (owner Tobias, author+closer Maren, stamp biconditional
verified in the DB); the trail read all three sentences under the
right faces ("Set the objective … for Tobias Wrenfield" ×2, "Closed
the objective … — missed"). Teardown by VALUE: the three objective
events by title, the two objectives and three KRs by title/label,
the scratch pair by email (public.users before auth.users —
users_id_fkey is NO ACTION), and the SIX member-audit trigger rows
the provisioning wrote (member_org/role/status_changed ×2, swept by
member name — a 0f6 lesson for every future scratch-operator drive).
Baseline EXACT: 25/24/74/5/5/1/1/2/2/1/1 + tasks 0 + objectives 0 +
key_results 0 + auth 25. Screenshots (.playwright-mcp):
okr-0f6-board-three-kinds, okr-0f6-milestone-attested,
okr-0f6-analytics-section, okr-0f6-placements-strip,
okr-0f6-desk-set-owner, okr-0f6-closed-missed, okr-0f6-trail-events.

Green gate: tsc / vitest 929 / eslint / build. Numbers: next
migration 108, next § 115, next drive 0f7; activity CHECK 80,
intent door 14, agent allowlist 29 (untouched — agents hold no
goals). On confirmation the programme proceeds per D9: researcher →
viewer → externals (own gates) → admins never; after the programme,
THE PRE-LAUNCH CHECKLIST (standing order).

---

## 115. §114 confirmed — OKR slice one COMPLETE; the researcher slice Phase 0 opens — 2026-08-25

The founder confirmed §114 in writing 2026-08-25. Slice one of the
OKR/KPI programme stands (migration 107, /app/objectives, Analytics +
Placements integration, the mirror reconciliation, drive 0f6).
NEXT-okr-programme.md marks slice one DONE; the file stands until the
whole programme closes (the NEXT-product-pass precedent). Per D9 the
programme proceeds to the RESEARCHER slice: Phase 0 first, the D-gate
drafted and presented, BUILD GATED on written confirmation against
the drafted document. Phase 0 facts verified live: candidates carry
NO actor attribution (only `source`, a channel string) — owner-
attributed candidate metrics would need new machinery; placements
carry `sourced_by_user_id` (050 — "often a researcher", the reason
the fee-read exception exists). Numbers: next migration 108, next
§ 116, next drive 0f7; durable baseline unchanged.

---

## 116. The OKR programme, slice two — THE RESEARCHER — 2026-08-25 — DRAFT

Slice two on the founder's confirmed D1–D6 + R1–R3 (D4 as
recommended — placements_sourced admitted, the founder's line:
staff delivery yes, candidates as people never). Gate:
docs/superpowers/specs/2026-08-25-okr-researcher-gate.md. Commit
`9e96bdb`, deploy `mandate-phjj6z2mv`, migration 108, drive 0f7.
**This § is a DRAFT: no completion is declared; NEXT-okr-programme.md
stands until the founder confirms.**

**Built.** 108 = can_write_okrs() and the owner guard widened to
researcher (D1) + **the D3 refusal in the database, BOTH faces**:
guard_financial_key_results() (new trigger, 064 model, coalesced)
refuses a financial key result whose parent objective's owner holds
no fees tier by role, and the owner guard gains the second face — a
financial-CARRYING objective cannot be HANDED to a researcher (the
desk reassigning ownership must not turn the money dark for its own
subject) + the metric CHECK rebuilt with **placements_sourced** (D4):
the vocabulary's tenth quantitative slug and its first
OWNER-attributed metric — placements the objective's owner sourced,
from 050's sourced_by_user_id, status started, start_date in period,
COUNTS ONLY. TS: okrs:write += researcher in roles.ts (the first
role holding OKR authoring WITHOUT fees:read — the divergence 054's
commentary predicted, now real and database-refused);
ROLE_SUMMARIES.researcher names their objectives; the desk's owner
picker widens; computeObjectiveProgress takes the owner and counts
the sourced placements. No new routes, events, or door widening —
the objective events ride can_write_okrs, so the researcher passes
automatically. vitest 929 (matrix combinatorics absorb the new
grant).

**Harness** (okr_invariants.sql rewritten to THIRTEEN invariants,
live, rolled back): the researcher LANDS everywhere they were
refused (desk-set as owner in (4); self-create with a
placements_sourced key result in (5); their objective_created wears
their own face at the door in (12)); the VIEWER becomes every
refused face; **D3 pinned BY NAME in (11)** — the manager's
financial key result on the researcher-owned objective refused by
the trigger, AND the handoff of the financial-carrying objective to
the researcher refused by the guard; admin/viewer/agent owner
refusals, the money-boundary reads, the close and attestation pins,
the structural CHECKs and §42 exact counts (4 objectives / 4 key
results) all stand. The 107 control run remains the documented
drift-catch.

**Drive 0f7** (scratch manager Hesper Aldane + scratch researcher
Cassian Veld, both torn down): Cassian's /app/objectives rendered
the CREATE FORM (D1 live) with NO owner picker (not desk); created
"Source the shortlist bench" (whole book, Aug–Oct) and added the
placements_sourced key result 0/2 (the metric present in the
picker); THE D3 REFUSAL AT THE SURFACE: Cassian's attempted
financial key result died with the database's own sentence in the
toast — "Failed to add the key result: a financial key result needs
an owner who can read it — researchers hold no fees tier" — and no
row landed; Hesper's owner picker read exactly Myself | Cassian
Veld | Hesper Aldane (the researcher admitted, no admin, no viewer,
no agent). Teardown by VALUE, EXACT FIRST PASS — the 0f6 lesson
applied inline: the six member-audit provisioning rows swept by
member name in the same statement as the domain rows; baseline
25/24/74/5/5/1/1/2/2/1/1 + tasks 0 + objectives 0 + key_results 0 +
auth 25. Screenshots (.playwright-mcp): okr-0f7-researcher-board,
okr-0f7-desk-picker-researcher.

Green gate: tsc / vitest 929 / eslint / build. Numbers: next
migration 109, next § 117, next drive 0f8; activity CHECK 80 and
intent door 14 (both untouched); agent allowlist 29. On
confirmation the programme proceeds per D9: viewer → externals (own
gates) → admins never; after the programme, THE PRE-LAUNCH CHECKLIST
(standing order).

---

## 117. §116 confirmed — the researcher slice COMPLETE; the viewer slice Phase 0 opens — 2026-08-25

The founder confirmed §116 in writing 2026-08-25. Slice two stands
(migration 108, the D3 double refusal, placements_sourced, drive
0f7). NEXT-okr-programme.md marks slice two DONE; the file stands
until the programme closes. Per D9 the programme reaches the VIEWER —
the degenerate case: a definitionally non-writing role with no
delivery to measure. Phase 0 verified the surface as built: every
authoring affordance on /app/objectives is behind okrs:write (create
form, KR composer, attest, close, abandon), the subhead names the
viewer's state ("read-only"), Analytics shows them the non-financial
progress, Placements shows them the "Fees restricted" panel and no
strip, and the harness already pins every viewer negative BY NAME
(refused as owner, refused creation, refused at the intent door,
zero financial rows) plus the positive (they READ the board and the
quantitative rows — visibility is the point of the role). The gate
is drafted at docs/superpowers/specs/2026-08-25-okr-viewer-gate.md —
a VERIFICATION-ONLY slice proposal; BUILD (such as it is) GATED on
written confirmation against it. Numbers: next migration 109 (none
proposed by this gate), next § 118, next drive 0f8.

---

## 118. The OKR programme, slice three — THE VIEWER, verification-only — 2026-08-25 — DRAFT

Slice three on the founder's confirmed viewer gate (D1–D3 + R1–R3:
the viewer is a reader of the programme, never an author and never a
subject — the ruling IS the slice). Gate:
docs/superpowers/specs/2026-08-25-okr-viewer-gate.md. No migration
(109 stays next), no capability change, no deploy — the app is
untouched; the slice's deliverable is proof. Drive 0f8. **This § is
a DRAFT: no completion is declared; NEXT-okr-programme.md stands
until the founder confirms.**

**The harness gains the viewer's POSITIVE.** Invariant (8) extended:
the viewer reads every objective on the board (4 of 4) — visibility
is the role's whole OKR experience, so it is now a NAMED invariant,
not a side effect of the KR-count assertions. Full harness (thirteen
invariants, 38 assertions) re-run live and green, rolled back.

**Drive 0f8** (scratch manager Odile Vantrease + scratch viewer Wren
Halloway, both torn down): Odile seeded "Q3 book health" (whole
book, Aug–Oct) with a quantitative KR (candidates_added 0/10) and a
FINANCIAL KR (fees_earned US$100,000); then Wren's face, surface by
surface — /app/objectives subhead read "read-only", the section held
ZERO forms and ZERO buttons, the card showed title/owner/period/
status and the quantitative KR at 0/10 AT RISK, and the financial
row was ABSENT ENTIRELY (not redacted — never sent); Analytics
showed the quantitative line and no money; Placements showed the
"Fees restricted" panel, NO financial-objective strip, and no
sample-revenue block (the sample gate keys on seesFees). **THE
BOUNDARY PROBE, UI bypassed:** from Wren's own live session, a raw
PostgREST INSERT against objectives (anon key + her bearer token)
died 400 with the guard's OWN sentence — "only the desk sets an
objective's owner to someone else" — no row landed, while the same
session's raw READ returned exactly the board (["Q3 book health"]):
refusal on write, visibility on read, both at the database, both in
production. Teardown by VALUE, EXACT first pass (member-audit rows
swept by name inline — the 0f6 lesson now routine): baseline
25/24/74/5/5/1/1/2/2/1/1 + tasks 0 + objectives 0 + key_results 0 +
auth 25. Screenshots (.playwright-mcp):
okr-0f8-viewer-readonly-board, okr-0f8-viewer-placements-restricted.

Gate: vitest 929 (unchanged — no TS touched); the diff is one SQL
test file. Numbers: next migration 109, next § 119, next drive 0f9.
On confirmation the programme reaches ITS LAST OPEN QUESTION per D9:
the EXTERNALS gate (what an OKR means for HM/client personas through
the portal's SECURITY DEFINER reads) — then admins never, the
programme closes, and THE PRE-LAUNCH CHECKLIST takes the slot
(standing order).

---

## 119. §118 confirmed — the viewer slice COMPLETE; the externals Phase 0 opens — 2026-08-25

The founder confirmed §118 in writing 2026-08-25. Slice three stands
(the viewer's read positive pinned, drive 0f8's boundary probe).
NEXT-okr-programme.md marks slice three DONE; the file stands until
the programme closes. Per D9 the programme reaches its LAST open
question: the EXTERNALS. Phase 0 verified: the portal's whole read
surface is five SECURITY DEFINER RPCs (portal_context/list_mandates/
get_mandate/list_my_reviews/list_grants, 069) — objectives appear in
none of them; and a live forged-JWT probe (rolled back) proved the
boundary already holds STRUCTURALLY — an external hiring_manager
reads ZERO objective and key-result rows (org NULL ⇒ the org-match
predicate never true, and no org:read), cannot create, and the
intent door leaves nothing on the trail. The gate is drafted at
docs/superpowers/specs/2026-08-25-okr-externals-gate.md; execution
gated on written confirmation against it. Numbers: next migration
109 (none proposed), next § 120, next drive 0f9 (none proposed).

---

## 120. The OKR programme, slice four — THE EXTERNALS — and the programme's completion claim — 2026-08-25 — DRAFT

Slice four on the founder's confirmed externals gate (D1–D4 +
R1–R3, D2 as recommended: nothing of the programme is ever rendered
to an external; client-visible "commitments" deferred OUT of the
programme behind their own future gate). Gate:
docs/superpowers/specs/2026-08-25-okr-externals-gate.md. No
migration, no capability change, no portal change, no drive, no
deploy — the app untouched. **This § is a DRAFT: no completion is
declared; NEXT-okr-programme.md stands until the founder confirms —
and on THIS §'s confirmation the file is DELETED and the programme
CLOSES.**

**Built: one invariant.** okr_invariants.sql gains **(14) THE
EXTERNAL BOUNDARY** — the harness org acquires a client and an
external hiring_manager principal (the 067 XOR: client_id set, org
NULL), and the invariant pins BY NAME what Phase 0 probed: the
external reads ZERO objectives and ZERO key results (structurally —
the org-match predicate is never true for a NULL org, and
can_read_org() is false for every external role), is refused
creation, and leaves NOTHING at the intent door. Full harness —
FOURTEEN invariants over eight faces (manager, two recruiters,
researcher, viewer, admin, agent, external) — run live and green,
rolled back; durable baseline verified untouched after
(25/24/74/…, objectives 0, key_results 0).

**D1 as doctrine, recorded:** clients hold no org goals — beside
"agents hold no goals" and "admins are support, not subjects" as the
programme's three permanent exclusions.

**The completion claim, for the founder's verdict.** The roster the
§113 brief named is covered, each persona behind its own confirmed
gate: RECRUITER/MANAGER measured (§114 — the domain, migration 107);
RESEARCHER measured (§116 — migration 108, placements_sourced, the
D3 double refusal); VIEWER reads (§118 — verification, the boundary
probe); EXTERNALS see nothing (this §); ADMINS NEVER (the brief's
own word — the exclusion is the ruling, enforced in the owner guard
since 107 and asserted by name in the harness since day one); agents
hold no goals throughout. Financial metrics live on Placements
behind the unmoved fees tier; quantitative and qualitative metrics
enhance Analytics; the whole is tied to the Kanban board's REAL
stage-event stream; strategy creation stands enabled on top —
deferred as its own future work per the slice-one gate (D6).

Gate: vitest 929 (unchanged — no TS touched); the diff is one SQL
test file. Numbers: next migration 109, next § 121, next drive 0f9;
activity CHECK 80; intent door 14; agent allowlist 29. On
confirmation: NEXT-okr-programme.md deleted per doctrine, THE
PROGRAMME CLOSES, and THE PRE-LAUNCH CHECKLIST takes the slot
(CLAUDE.md standing order: advisor sweep, Turnstile, key rotation,
RLS review, FK indexes, first-client testing, onboarding docs,
status page, Lighthouse audit, simulator verification).

---

## 121. §120 confirmed — THE OKR/KPI PROGRAMME IS CLOSED; the pre-launch checklist opens — 2026-08-25

The founder confirmed §120 in writing 2026-08-25. The completion
claim stands: four slices, four confirmed gates, one doctrine
(recruiter/manager §114, researcher §116, viewer §118, externals
§120; admins never; agents hold no goals; clients hold no org
goals). NEXT-okr-programme.md DELETED per doctrine. THE PROGRAMME IS
CLOSED. The programme's residue, all durable: migrations 107–108,
the fourteen-invariant okr harness, /app/objectives, the Analytics
OBJECTIVES section, the Placements financial-objective strip, the
okrs:write capability, the 80-type activity CHECK with the
reconciled TS mirror, and the 14-type intent door.

Per the standing order (CLAUDE.md) the slot passes to THE PRE-LAUNCH
CHECKLIST: advisor sweep, Turnstile on /request-access, service-role
key rotation, RLS review on pre-existing tables, unindexed-FK fixes,
first-client testing, onboarding docs, status page, Lighthouse
audit, simulator verification. Numbers: next migration 109, next
§ 122, next drive 0f9; vitest 929; durable baseline unchanged.

---

## 122. The pre-launch checklist opens — the advisor sweep, and migration 109 — 2026-08-25 — DRAFT

Checklist item one (CLAUDE.md standing order) run live 2026-08-25:
**62 security findings, 132 performance findings, ZERO errors.**
Migration 109 applied (27 indexes + 2 ALTER FUNCTION, verified live).
**This § is a DRAFT: no completion is declared.**

**FIXED (109, purely additive):** all 27 unindexed foreign keys
(INFO) — including the new domains' (tasks ×4, objectives ×4,
objective_key_results ×1) and the older created_by/attribution
columns the checklist bullet named — plus the two
function_search_path_mutable WARNs (candidate_identity_key,
complete_candidate_send pinned to search_path=public; neither is
SECURITY DEFINER — hygiene, not a boundary).

**FOUNDER-OWNED (already on the standing list):**
auth_leaked_password_protection (Pro-gated toggle).

**BY DESIGN, documented here rather than "fixed":**
rate_limit/rate_limit_policy show RLS-enabled-no-policy (INFO) —
088's caps-as-data: default-deny, service-role only, exactly as
built; the token-path RPCs executable by anon (verify_hm_token,
verify_invitation, candidate_portal_*) — the token path IS anon, that
is the product; the predicate and door functions executable by
authenticated — they are the mechanism RLS calls; 43
multiple_permissive_policies (WARN) — the deliberate human-lane +
agent-lane policy pairs; merging them into OR-policies would blur
the named-lane doctrine for a per-row cost that is negligible at
current volume — revisit at real load; 62 unused_index (INFO) — no
traffic yet, expected pre-launch.

**OPEN — the sweep's one real follow-up, ITS OWN SLICE:** EXECUTE
grants on internal SECURITY DEFINER functions that anon (and in some
cases authenticated) should not hold: guard_task_assignee_changes
(106 predates the revoke habit 107/108 adopted),
handle_new_auth_user, record_email_delivery_event,
record_skill_version, run_guarantee_maintenance,
candidates_link_network_profile, check_rate_limit — the last needs
CARE: whether the marketing /request-access path calls it under anon
must be verified live before any grant moves (the 088 machinery must
not break). Grants are behaviour; this pass wants its own
harness-verified slice, drafted before touched.

Remaining checklist after this §: the grants slice above · Turnstile
on /request-access (founder keys pending) · service-role key
rotation (founder act) · the full RLS review pass on pre-existing
tables · first-client testing (search loop, HM portal, Triangulation
Report, PDF exports, email drafts) · onboarding docs · status page ·
Lighthouse/mobile-animation audits · simulator verification · Resend
webhook (founder) · Stripe LAST (founder's call, unchanged).

Numbers: next migration 110, next § 123, next drive 0f9; vitest 929;
activity CHECK 80; intent door 14; durable baseline unchanged.

---

## 123. §122 confirmed — sweep one COMPLETE; the grants-pass Phase 0 — 2026-08-25

The founder confirmed §122 in writing 2026-08-25 (migration 109
stands). Phase 0 for the grants pass ran against CODE, not
assumption — every flagged SECURITY DEFINER function now has a
verified caller story:

**The trap was REAL, three times over.** check_rate_limit is called
through the COOKIE client (src/lib/rate-limit/server.ts:49) — anon
on /request-access; the Resend webhook route builds its client with
the ANON key (api/webhooks/resend/route.ts:14, svix signature at the
app layer) so record_email_delivery_event arrives as anon; and the
Vercel cron (api/cron/maintenance/route.ts:57) uses the cookie
client too — no session, CRON_SECRET at the app layer — so
run_guarantee_maintenance arrives as anon. All three anon grants are
LOAD-BEARING. Revoking any of them would have silently broken the
front door's limiter, the delivery trail, or the guarantee sweep —
fails-closed design means the breakage would read as "everything
rate-limited/unavailable", the worst kind of quiet.

**The safe set is the trigger functions.** record_skill_version
(103) and candidates_link_network_profile (098) turn out to be
TRIGGER functions — never invoked by any session; likewise the guard
family (guard_task_assignee_changes from 106,
guard_objective_owner_changes and guard_financial_key_results from
107/108 — revoked public+anon at birth but Supabase's default
privileges grant authenticated separately, which is why the advisor
still lists them — guard_lead_recruiter_changes from 064,
handle_new_auth_user). Trigger firing does not check the invoker's
EXECUTE; the house already proved the full revoke on
guard_author_in_org (057) and every audit_* function (068) years of
migrations ago.

The gate is drafted at
docs/superpowers/specs/2026-08-25-grants-pass-gate.md; BUILD
(migration 110) gated on written confirmation. Numbers: next
migration 110, next § 124, next drive 0f9.

## 124. §123 confirmed — THE GRANTS PASS ran; migration 110 applied, the matrix diff exact — 2026-08-25 — DRAFT

The founder confirmed §123 in writing 2026-08-25 against the gate doc
(docs/superpowers/specs/2026-08-25-grants-pass-gate.md, commit
26f5e6e). The D-gate ladder ran in order, live, against pg_proc —
never files.

**The privilege matrix, BEFORE (has_function_privilege, live).**
Signatures from pg_proc: the seven triggers all take no arguments;
the machine doors are record_email_delivery_event(text, text, text,
text) and run_guarantee_maintenance(); the control is
check_rate_limit(text, text).

| function | anon | authenticated |
|---|---|---|
| guard_task_assignee_changes | t | t |
| guard_objective_owner_changes | f | t |
| guard_financial_key_results | f | t |
| guard_lead_recruiter_changes | f | t |
| handle_new_auth_user | t | t |
| record_skill_version | t | t |
| candidates_link_network_profile | t | t |
| record_email_delivery_event | t | t |
| run_guarantee_maintenance | t | t |
| check_rate_limit (control) | t | t |

Note 106's guard still carried ANON — only 107/108 were revoked
public+anon at birth; the gate doc's roll-call was right to name all
seven.

**Migration 110 applied** — both faces: the numbered file
supabase/migrations/110_grants_pass_execute_revokes.sql and MCP
apply_migration, identical SQL. D1: REVOKE ALL from public, anon,
authenticated on the seven trigger functions. D2: REVOKE EXECUTE
from authenticated ONLY on the two machine doors. service_role
untouched. Per R1 the migration's comments name all three
load-bearing machine paths (limiter / webhook / cron) so no future
sweep "fixes" them.

**The matrix AFTER — the diff is EXACTLY the planned rows (R2).**

| function | anon | authenticated |
|---|---|---|
| guard_task_assignee_changes | f | f |
| guard_objective_owner_changes | f | f |
| guard_financial_key_results | f | f |
| guard_lead_recruiter_changes | f | f |
| handle_new_auth_user | f | f |
| record_skill_version | f | f |
| candidates_link_network_profile | f | f |
| record_email_delivery_event | t | f |
| run_guarantee_maintenance | t | f |
| check_rate_limit (control) | t | t |

Nine functions changed, fourteen cells flipped, the control
unchanged, service_role true on all ten before and after. Nothing
else moved.

**The harnesses re-ran live, under the revoke.** okr_invariants.sql
(FOURTEEN) and task_invariants.sql (EIGHT), each self-contained
begin/rollback via execute_sql — both green, no exception raised.
This is the behavioural proof of D1's premise: every harness insert
into auth.users fired handle_new_auth_user, and every objective/task
write fired the guard family, all under `set local role
authenticated` with ZERO session grants remaining — triggers fire on
the table owner's authority, not the invoker's EXECUTE. Baseline
verified after both rollbacks: 25 users / 24 agents / 74 events / 5
skills / 5 skill_versions / 1 network_profile / 1 org_comms_policy /
2 projects / 2 clients / 1 candidate / 1 job_spec / 0 tasks / 0
objectives / 0 key_results — exact.

**Drive 0f9 (light), R3 proven from the outside.** An anon REST
probe of check_rate_limit (anon key via get_publishable_keys)
returned a VERDICT, not a privilege error:
`{"allowed": true, "reason": "ok", "retry_after_seconds": 0}` on
scope access_request_ip — the fails-closed limiter still answers
anon, so the front door is open and honest. (A first probe with an
unknown scope returned the P0001 domain error "unknown scope" —
itself proof the function EXECUTED as anon.) The probe's single
bucket row was swept by value
(access_request_ip:0f9-grants-pass-probe:496577, count 1, deleted).
/request-access renders whole in prod (Playwright: headline, all six
fields, submit, the no-credit-card line). No skill edit needed — the
okr harness already fires record_skill_version's sibling pattern and
the trigger family is proven above; no scratch principals were
minted outside the harness rollbacks, so there is nothing to sweep.

Green gate: vitest 929/929 (60 files) — this slice is SQL+docs, no
app code touched, no deploy owed. Numbers now: next migration 111,
next § 125, next drive 0fa; vitest 929; activity CHECK 80; intent
door 14; agent allowlist 29.

Next per §122: the full RLS review pass on pre-existing tables, then
first-client testing, onboarding docs, status page,
Lighthouse/mobile audits, simulator verification. Founder-owned
stack unchanged (Turnstile keys; service-role key rotation + exposed
access token; Resend webhook secret + redeploy; four Engage
.env.local pairs; leaked-password protection; the "Capital Markets
Investment Bank" rename; stale-poll refresh §82). Stripe parked
LAST. This section is DRAFTED; nothing here is confirmed until the
founder's written word.

## 125. §124 confirmed — THE GRANTS PASS IS COMPLETE; the Interviewer gate confirmed, sequenced BEHIND the checklist — 2026-08-25

The founder confirmed in writing 2026-08-25, three rulings in one
word:

**§124 stands — the grants pass is COMPLETE.** Migration 110 is
settled law: seven trigger functions hold zero session grants, the
two machine doors answer anon only, the eleven load-bearing anon
grants stay named in the migration's comments. Sweep two of the
pre-launch checklist closes. The matrices, harness runs, and drive
0f9 recorded in §124 are the permanent record.

**The Interviewer programme gate is CONFIRMED** (commit 0e4b7a1,
docs/superpowers/specs/2026-08-25-interviewer-programme-gate.md):
the 25th principal, mainstream interview_plans on the 037 pattern
(EI's agent 17 untouched), slice one authorised in full, slices
two–four (candidate prep pack, client interview, simulator) gated
separately later. R1–R4 are programme law.

**R5 is RULED: the checklist completes first.** The Interviewer
programme opens only after the pre-launch checklist closes. No slice
builds until then; the confirmed gate waits, not the founder.

ACTIVE NOW, per §122's order: the full RLS review pass on
pre-existing tables — its own Phase 0 (live pg_policies, never
files) and its own gate before anything moves. Then first-client
testing, onboarding docs, status page, Lighthouse/mobile audits,
simulator verification. Founder-owned stack unchanged. Stripe last,
then the Interviewer programme.

Numbers: next migration 111, next § 126, next drive 0fa; vitest 929;
activity CHECK 80; intent door 14; agent allowlist 29; durable
baseline 25/24/74/5/5/1/1/2/2/1/1 + tasks 0 + objectives 0 +
key_results 0.

## 126. THE RLS REVIEW PASS ran — Phase 0 complete, verdict NULL RESULT — 2026-08-25 — DRAFT

Checklist slice three (per §125's order) ran as a read-only Phase 0
— live pg_policies / pg_class / security advisor, never files. The
full record is
docs/superpowers/specs/2026-08-25-rls-review-pass.md; the findings
in one breath:

All FIFTY-SEVEN public tables carry RLS; deny-by-default holds; the
three single-SELECT-policy tables (activity_events, skill_versions,
invitations) take writes only through named definer doors and the
two zero-policy tables (rate_limit, rate_limit_policy) are the
deny-all limiter pair, by design. Exactly ONE anon-writable surface
exists in the whole schema — waitlist_anon_insert, the
/request-access front door, limiter-fronted (0f9) with Turnstile the
founder-pending second lock. The only predicates without org/
identity/client anchors are the FOUR founder-console families, all
gated is_current_user_founder() by name. The money boundary is
intact where it was born (can_read_fees OR is_placement_credited on
reads, can_write_mandates on writes, org-confined throughout). The
advisor holds NOTHING new — its 33 authenticated-definer count even
fell from 42, migration 110 visible from the outside.

Verdict: NOTHING MOVES. No migration, no policy edit, no drive — a
read-only pass changes no behaviour, so there is nothing to
smoke-test that 0f9 and this week's harness runs have not already
proven. Migration 111 and drive 0fa stay unclaimed. Three named
rulings requested with the closure: null results are results (the
sweeps were structural, not sampled); the founder console's four
families are the ONLY legal cross-org predicates, any future
unanchored non-founder policy is a defect by definition; the
deny-all pair never gains a session-role policy.

On confirmation, next per §122: first-client testing (search loop,
HM portal, Triangulation Report, PDFs, email drafts), then
onboarding docs, status page, Lighthouse/mobile audits, simulator
verification. Founder-owned stack unchanged. Stripe last, then the
Interviewer programme (§125 R5).

Numbers: next migration 111, next § 127, next drive 0fa; vitest 929;
activity CHECK 80; intent door 14; agent allowlist 29; durable
baseline 25/24/74/5/5/1/1/2/2/1/1 + tasks 0 + objectives 0 +
key_results 0. This section is DRAFTED; the checklist item closes
only on the founder's written word.

## 127. §126 confirmed — THE RLS REVIEW CLOSES on its null result; first-client testing OPENS — 2026-08-25

The founder confirmed §126 in writing 2026-08-25. The RLS review
pass closes as drafted: nothing moved, the three rulings stand as
law — null results are results; the founder console's four families
are the only legal cross-org predicates and any future unanchored
non-founder policy is a defect by definition; the deny-all limiter
pair never gains a session-role policy. Checklist slice three done.

Slice four — FIRST-CLIENT TESTING — opened its Phase 0 the same
day. The gate is drafted at
docs/superpowers/specs/2026-08-25-first-client-testing-gate.md.
The shape, in one breath: five loops mapped to their surfaces
(search loop / HM portal / Triangulation / four PDF export sites /
mailto drafts); ONE named trap found in Phase 0 — mail clients
truncate long mailto URLs (~2000 chars), so the drive measures
every draft against the ceiling before the founder clicks one; the
gate's heart is D1's line between drive 0fa (mechanical proofs,
scratch principals, torn down by value) and the founder's sessions
(real CVs, a real hiring manager, real judgment — R1: no agent
grades the product's taste). D2 inverts the data doctrine for the
first time — real PII enters prod under the erasure covenant (R2:
the erasure path is proven in the same slice), with a RULING
REQUESTED on end-state disposition (keep the real dataset vs erase
to baseline). D3: findings land as an immutable punch list; fixes
gate separately.

Numbers: next migration 111 (unclaimed), next § 128, drive 0fa
claimed by D1 on confirmation; vitest 929; activity CHECK 80;
intent door 14; agent allowlist 29; durable baseline
25/24/74/5/5/1/1/2/2/1/1 + tasks 0 + objectives 0 + key_results 0.
The gate awaits the founder's written word.

## 128. Drive 0fa — first-client testing, the MECHANICAL half — 2026-08-25 — DRAFT

The founder confirmed the first-client-testing gate in writing
2026-08-25; drive 0fa ran the same day per D1. Scratch org "0fa
Probe Org" (fixed 0fa UUIDs), operator Orin Faulkes (manager),
client Halcyon Logistics, mandate "Head of Platform Engineering",
synthetic CV "Avery Penhallow" (marked SYNTHETIC in its own text).
The founder's saved browser credentials autofilled the sign-in form
and were overwritten unused — the scratch operator doctrine held.

**What ran GREEN, in prod, under Orin's session or a token:**
CV upload to the org-scoped bucket; evaluation PDF (3 pages, valid
PDF 1.3) and its email-draft dialog; comparison PDF; weekly report
page rendering whole from content plus its PDF; recruiter feedback
(divergent from the AI on purpose) landing WITH its interpretation
(the interpretation write runs under the HUMAN session — see F-1's
boundary); HM flow end to end — token issued with a label, the anon
portal rendering slate + evidence grid, a divergent review landing
as per-candidate ratings + top concern (and fanning out two
feedback rows), revoke, then the revoked link refusing with the
honest sentence; candidate portal end to end — token issued from
the Outreach block, anon load greeting the candidate by name,
contact round-trip persisting (phone + location), and an ERASURE
REQUEST landing — the D2 covenant path proven mechanically before
any real CV ever enters. Triangulation's gated empty state renders
honestly (it is an AGENT-INTELLIGENCE fusion — company + candidate
+ HM psychology — with per-source Missing markers; real data is the
founder's session by construction).

**THE PUNCH LIST (D3 — recorded, not fixed):**

- **F-1 · BLOCKS-FIRST-CLIENT (conditional) — cross-org agent
  pipelines stall SILENTLY.** All 24 agent principals live in
  Mandate HQ. In any other organization an agent-session write is
  filtered by RLS to zero rows, Supabase reports no error, and the
  pipeline returns success: observed live as a candidate stuck "AI
  parse in flight" forever — no cv_parse_error, therefore no retry
  affordance, the §42 silent-vanish class at the seam. The trail
  stayed clean (record_agent_event refused the cross-org event;
  founder-org events unpolluted at 74). Boundary: writes under the
  HUMAN session (feedback interpretation) persist fine. Blocks any
  first client provisioned as their OWN organization; invisible
  inside Mandate HQ. Root class: a zero-row UPDATE treated as
  success — the write-blind doctrine biting a seam that needed to
  read its own effect. The drive's remaining agent-shaped data was
  SQL-scaffolded because of F-1, and every such scaffold is named
  here.
- **F-2 · FIX-SOON — the evaluation mailto draft is over the
  ceiling.** Measured live: subject 71 + body 1,524 chars →
  mailto URL 2,290 chars on a MODEST evaluation; the common client
  ceiling is ~2,000. Comparison (1,631) and weekly (1,173) sit
  under it today but scale with slate size. Mitigation already in
  the dialog: Copy / Copy Both. The founder's mail-client session
  decides how it presents; the fix direction is body truncation
  with a "full text copied" fallback, gated separately.
- **F-3 · NOT COVERED — the EI report PDF.** The fourth PDF site
  needs a full executive search (profile → plan → assessment) to
  render; scaffolding that stack was out of the drive's proportion.
  Founder session with real EI data, or a dedicated scaffold later.
- **F-4 · NIT — the HM review does not carry the token's label.**
  The token was issued as "0fa Probe HM @ Halcyon"; the review row
  landed with hm_label ''. The desk cannot tell WHICH hiring
  manager answered when two links are live.
- **F-5 · NIT — hydration mismatch (React #418) on
  /hiring-manager** after generate/revoke interactions.
- **F-6 · COSMETIC — "Top 1 Candidates"** heading on the weekly
  report inlines the count into the phrase.

**Teardown by VALUE, exact first pass:** 8 org activity events
(3 provisioning member-audit + 5 drive), 1 erasure request, 3
feedback, 1 HM review, 1+1 tokens, 2 scores, 1 report, 2
candidates, 3 network profiles, 1 project, 1 client, the storage
object (Storage API — direct SQL delete is trigger-blocked, a
teardown lesson for the recipe), 5 rate-limit buckets, then Orin
public-before-auth (users/identities/sessions/refresh_tokens), then
the org. Baseline EXACT: 25/24/74/5/5/1/1/2/2/1/1 + tasks 0 +
objectives 0 + key_results 0 + auth 25 + orgs 1 + rate_limit 0.
Screenshots (.playwright-mcp): fct-0fa-email-draft-dialog,
fct-0fa-triangulation-empty-honest; PDFs pulled:
evaluation-avery-penhallow (3pp), comparison, weekly-report.

**What remains is the founder's half (D1):** the 8–10 real CVs
(quality judgment), the real hiring manager, Triangulation over
real intelligence, the mail-client check (F-2 decides there), the
real erasure exercise, and the D2 disposition ruling. F-1 needs a
severity ruling first: if the first client is a second
organization, it blocks; if they operate inside Mandate HQ, it
waits.

No code changed; vitest stands 929; no deploy. Numbers: next
migration 111 (unclaimed), next § 129, drive 0fa CONSUMED; activity
CHECK 80; intent door 14; agent allowlist 29. This section is
DRAFTED; the founder's sessions and rulings close the slice.

## 129. F-1 ruled BLOCKING and FIXED — PLATFORM AGENTS (migrations 111 + 112); drive 0fb green — 2026-08-25

The founder ruled 2026-08-25: the first client gets their own
organization, so §128's F-1 blocks — fix it. The fix shipped the
same day, in three parts, and drive 0fb proved it end to end.

**The ruling that shapes the fix: agents are the PLATFORM's
workforce, not one org's members.** The alternative — minting 24
agent principals per organization — was weighed and set aside: it
breaks the one-env-credential-pair-per-agent model and multiplies
the provisioning surface for no doctrine gain. Instead the agents'
org anchor yields to their IDENTITY anchor everywhere it appears:
`is_agent()`, which already carries the /ops kill switch
(current_user_role() resolves NULL for a suspended row within one
run).

**Migration 111 — the policies and the door.** All FORTY-TWO agent
policies across 26 tables re-emitted with the
`organization_id = current_user_org_id()` conjunct dropped and
every domain-narrowing conjunct preserved verbatim (draft-only
gates, author pins, the engagement escalation rule, prescreen
status vocabulary). `record_agent_event` now derives the event's
organization from the SUBJECT — the project's org, else the
candidate's, else the agent's own — so an agent acting for org X
writes org X's trail under its own face, never HQ's. §126 R2 gains
its named SECOND legal cross-org family: agent-anchored policies,
by this ruling.

**The seam honesty (code).** The 0fa stall was a zero-row UPDATE
reported as success. agent-parser.ts now passes `count: 'exact'` on
both persistence writes and REFUSES on zero rows; the upload action
persists the honest failure under the RECRUITER's session (which
always reaches its own org's row) before throwing — the retry
affordance can no longer silently vanish, whatever RLS does to the
agent. This is the class fix's exemplar; the same count-check
belongs in the other agent seams as they are touched (noted, not
swept — D3 discipline).

**Migration 112 — the trail guard.** Drive 0fb's first pass proved
the parse PERSISTED cross-org but the trail write still died
silently inside write_activity_event's WARNING catch:
guard_author_in_org (057) refuses authors who are not members of
the event's org. It gains ONE exception — an ACTIVE agent authors
any org's trail; a SUSPENDED agent falls through to the membership
test and is refused, proven both ways in a rolled-back probe
(active landed, suspended refused). The 057/068/110 zero-session-
grant pattern re-asserted on the function.

**Drive 0fb (scratch org, fixed 0fb UUIDs, prod after deploy):**
the EXACT 0fa stall scenario re-run — synthetic CV uploaded by a
scratch manager in a NON-HQ org. Parse persisted: "Avery
Penhallow", title, company, archetype, fit dimensions,
cv_processing false, no error. The candidate_parsed event landed IN
THE SUBJECT ORG wearing "CV Parsing Agent". Both invariant
harnesses re-ran live under 111+112 — okr FOURTEEN and task EIGHT,
green, rolled back. Teardown by value, exact first pass; baseline
25/24/74/5/5/1/1/2/2/1/1 + 0/0/0 + auth 25 + orgs 1 + rate_limit 0,
no stray storage.

Green gate: tsc / vitest 929 / eslint / build · commit 3031aad
(111 + code) · deployed to production (mandate-1euyfk3mx) ·
migration 112 in this commit. F-1 CLOSES. The residue class stays
named: any agent seam that writes without a count check can still
lie on a FUTURE policy regression — the harness invariant that
would pin it (an agent write asserted cross-org in
supabase/tests/) is the natural first test of the next SQL slice.

Numbers: next migration 113, next § 130, next drive 0fc; vitest
929; activity CHECK 80; intent door 14; agent allowlist 29. §128's
remaining items stand: the founder's real-CV/HM/mail-client
sessions, the D2 disposition ruling, and punch items F-2..F-6
(F-2 mailto ceiling next by severity).

## 130. F-2 FIXED — the mailto ceiling; drafts never clip silently — 2026-08-25

The founder ordered the F-2 fix 2026-08-25. Shipped the same day.

**The fix: one shared helper, five sites converted.**
`src/lib/mail-draft.ts` — `openMailDraft({to?, subject, body})` with a
conservative 1,900-char ceiling on the full mailto URL (drive 0fa
measured a modest evaluation at 2,290 against the ~2,000 ceiling
common mail clients enforce by truncation). Under the ceiling:
opens as before. Over it: the FULL body is copied to the clipboard
FIRST, then the mail client opens with the subject and a one-line
pointer body ("The full draft was too long for a mail link, so it
is on your clipboard — paste it here"); the caller toasts what
happened. If the clipboard is unavailable too, the helper REFUSES
to open at all and the caller points at the Copy affordance — a
clipped client-facing draft is never sent behind the user's back.

Converted sites: the evaluation draft dialog, the comparison export
dialog, the weekly-report dialog, the positioning panel's Open in
Mail, and the outreach strategy panel — the last was a raw
`<a href=mailto:>` carrying the candidate's address and the FULL
approved draft body, the largest exposure of the five, now a button
through the same helper with the recipient preserved.

**Coverage:** four new unit tests (encoding, under-ceiling
pass-through, over-ceiling clipboard+pointer flow with the pointer
URL asserted under the ceiling, clipboard-unavailable refusal) —
vitest 929 → 933. Green gate: tsc / vitest 933 / eslint / build ·
commit dc314a6 · deployed (mandate-by7ws7cem). No DB surface — no
migration, no drive owed; the founder's pending mail-client session
(§128's remaining half) now exercises the pointer-body flow as its
F-2 check.

Punch list state: F-1 CLOSED (§129) · F-2 CLOSED (this) · F-3 (EI
report PDF) not covered · F-4 (HM review drops token label) · F-5
(hydration mismatch /hiring-manager) · F-6 ("Top 1 Candidates")
open. Numbers: next migration 113, next § 131, next drive 0fc;
vitest 933; activity CHECK 80; intent door 14; agent allowlist 29;
durable baseline unchanged.

## 131. F-4 FIXED — token-door HM reviews carry the share link's name; drive 0fc light green — 2026-08-25

The founder ordered the F-4 fix 2026-08-25. Shipped and proven live
the same day.

**The fix.** The token door's submit route always HELD the answer —
`verify_hm_token` returns the share link's issuance label ("Jane
Smith @ Acme") — and never used it; the portal form asks for no
name, so every token-door review landed with hm_label ''. Now
`persistHmSubmission` takes a `fallbackHmLabel`: the body's label
wins when present, the token's issuance label otherwise, and the
resolved label is returned so the interpretation pipeline names the
SAME person the review row does (the mirrored feedback content's
"From:" line included). The /portal door needed nothing — it already
derives its label from the signed-in profile, which is the pattern
this fix extends to the token door. One copy, two doors, per §13.

**Drive 0fc (light, curl-level — no browser, no scratch user):**
minimal 0fc scaffold (org / client / project / candidate / token
labelled "F4 Probe HM @ Halcyon"), then a POST through the live
token door WITHOUT hm_label in the body. The review landed with
`hm_label = 'F4 Probe HM @ Halcyon'`, token_id linked, and the
mirrored feedback opened "HM PORTAL — YES / From: F4 Probe HM @
Halcyon". In passing, the interpreter's trail event landed IN THE
SUBJECT ORG — §129's platform-agents fix observed working from a
second angle. Teardown by value, exact; baseline verified
(25/25 auth/74 events/1 org/1 candidate/1 profile/2 projects/2
clients/rate_limit 0).

Green gate: tsc / vitest 933 / eslint / build · commit 5866d64 ·
deployed (mandate-nb3b5ysls). No DB surface — no migration.

Punch list state: F-1 CLOSED (§129) · F-2 CLOSED (§130) · F-4
CLOSED (this) · F-3 (EI report PDF) not covered · F-5 (hydration
mismatch /hiring-manager) · F-6 ("Top 1 Candidates") open. Numbers:
next migration 113, next § 132, next drive 0fd; vitest 933;
activity CHECK 80; intent door 14; agent allowlist 29; durable
baseline unchanged.

## 132. F-5 and F-6 FIXED — the hydration gate and the counted heading; drive 0fd light green — 2026-08-25

The founder ordered both fixes 2026-08-25. Shipped and verified the
same day.

**F-5 — the hydration mismatch had TWO sources on the share-link
card, and the bigger one was not the timestamp.**
`baseUrl = typeof window !== "undefined" ? window.location.origin : ""`
rendered every token URL path-only on the server and origin-full on
the client — a guaranteed text mismatch on ANY render of the token
list, which is why §128 caught React #418 so reliably. The second
source was `formatRelative`'s Date.now() ("3m ago" server vs "4m
ago" a moment later). The fix is a shared primitive:
`src/lib/use-hydrated.ts` — `useHydrated()` on useSyncExternalStore
(the lint-clean canonical form; the first draft's setState-in-effect
was refused by react-hooks/set-state-in-effect and rewritten). The
card gates both the origin and the relative phrases on it, with the
absolute date as the server-matching fallback, and `formatDate` is
pinned to UTC so a viewer across midnight from the server still
hydrates identically. portal-share-card was checked clean;
portal-content is a SERVER component and cannot hydration-mismatch.
THE CLASS IS WIDER THAN THE PAGE: Date.now()-derived render text
appears in ~10 other client components — recorded as a named sweep
candidate, not swept (D3).

**F-6 — the heading stops counting itself.** "Top 1 Candidates" on
/reports becomes "Top Candidates" — and the markdown export turned
out to carry the same defect INVERTED, a hardcoded "## Top 3
Candidates" regardless of the actual list. Both now read "Top
Candidates" and the list speaks for itself.

**Drive 0fd (light):** scratch org + operator + project + one token
with last_used_at three minutes back — the exact §128 repro shape.
/hiring-manager loaded in prod: ZERO console errors, "Last used 3m
ago" present post-hydration, the token URL rendering with its
origin. Teardown by value (the CTE lesson of the day: sibling CTE
reads see the pre-delete snapshot — "after" counts must be a fresh
statement); baseline verified exact
(25/25/74/1 org/2 projects/rate_limit 0).

Green gate: tsc / vitest 933 / eslint / build · commit 0b6ee80 ·
deployed (mandate-lels23blm).

**THE PUNCH LIST STANDS AT: F-1, F-2, F-4, F-5, F-6 CLOSED; F-3 (EI
report PDF) open** — the one drive-uncovered export, waiting on a
full EI scaffold or the founder's real EI session. §128's remaining
founder half unchanged: real CVs, real HM, mail-client check, D2
disposition ruling. Numbers: next migration 113, next § 133, next
drive 0fe; vitest 933; activity CHECK 80; intent door 14; agent
allowlist 29; durable baseline unchanged.

## 133. F-3 COVERED — the EI report compiled, printed, and proven; THE PUNCH LIST CLOSES — 2026-08-25

The founder ordered the F-3 coverage 2026-08-25. Drive 0fe ran the
full scaffold the same day. No code changed — this was pure
verification of the one export no drive had exercised.

**The discovery that reframed the test:** the EI report's "PDF" is
not @react-pdf — it is the PRINT path (`window.print()`, the
document column already print-styled). So the test is: the compiled
report renders whole from real data, and the print output is a
valid PDF.

**Drive 0fe (scratch org, full EI scaffold):** search "Chief
Technology Officer @ Halcyon Logistics", candidate Avery Penhallow
linked at 'advanced', THREE org competencies with weights 9/8/6,
and the three source artifacts with faithful content — success
profile, three-stage interview plan (stages assigned to the
competency keys), human-authored assessment (strong/strong/moderate
with stage provenance). TWO incidental proofs along the way: the
immutability guards REFUSED approved-at-birth inserts ("Profiles
are created as drafts. Use approve_success_profile()") — 037's
machinery holding exactly as designed — so all three artifacts went
draft-first and were approved through the real RPCs under the
scratch operator's forged JWT, approval stamps verified. The
candidate-stage CHECK also refused an out-of-vocabulary stage.

**The verdict:** the report page rendered the COMPILED document —
"01 What the role requires / 02 Evidence coverage / 03 Evidence
recorded / 04 Where evidence is thin" — with NO gate shown and the
"Print or save as PDF" affordance present; the print path produced
a valid 2-page A4 PDF (207KB, PDF 1.4). Artifacts:
.playwright-mcp/fct-0fe-ei-report-compiled.png +
fct-0fe-ei-report.pdf. Teardown by value including the EI stack
(assessment/plan/profile/weights/competencies/link/search);
baseline verified exact in a fresh statement.

**THE §128 PUNCH LIST IS FULLY CLOSED: F-1 (§129), F-2 (§130), F-4
(§131), F-5 + F-6 (§132), F-3 (this).** What remains of
first-client testing is EXACTLY the founder's half: the 8–10 real
CVs through the loop, the real hiring manager, the mail-client
check, the real erasure exercise, and the D2 disposition ruling.
The mechanical ground is fully cleared.

Numbers: next migration 113, next § 134, next drive 0ff; vitest
933; activity CHECK 80; intent door 14; agent allowlist 29; durable
baseline 25/24/74/5/5/1/1/2/2/1/1 + tasks 0 + objectives 0 +
key_results 0.

## 134. ADMIN MEMBER MANAGEMENT — Phase 0 run, gate DRAFTED — 2026-08-25

The founder asked whether admins can set up and maintain staff
accounts; Phase 0 answered in code and the gate is drafted at
docs/superpowers/specs/2026-08-25-admin-member-management-gate.md.

The answer, in one breath: admins can EDIT roles
(/app/settings/members, setMemberRoleAction — the product's one
users.role writer, with founder/cross-org/external refusals in
words and the .select() read-back that pre-dates the F-1 lesson) —
but CREATION and STATUS are founder-only, and the /ops approval of
an org-less signup files them into THE FOUNDER'S org by silent
default. Under §129's first-client-gets-their-own-org ruling, a
client organisation cannot onboard a single recruiter by itself —
the same single-tenant assumption class as F-1, one layer up.

The gate's shape: D1 staff_invitations (new table on the proven
external-invitation pattern — invitations.client_id is NOT NULL, so
that table is structurally external and stays closed; the verify
door becomes the TWELFTH named load-bearing anon grant), D2 the
invite IS the approval (/join/[token]; invited staff never touch
the pending queue), D3 admins gain suspend/restore with
lockout-proof refusals (never self, never the last active admin,
never the founder, never an agent — the kill switch stays /ops),
D4 /ops loses the silent founder-org default. R5 requests the
sequencing ruling: recommend building BEFORE the first client's org
is provisioned, in parallel with the founder's testing sessions.

Numbers: next migration 113 (claimed by D1 on confirmation), next
§ 135, next drive 0ff (claimed by D5); vitest 933; the gate awaits
the founder's written word.

## 135. §134 confirmed — ADMIN MEMBER MANAGEMENT BUILT; drive 0ff green end to end — 2026-08-25

The founder confirmed the §134 gate in writing 2026-08-25, R5 as
recommended (build now, in parallel with the founder's testing
sessions, ahead of the first client's organisation). The slice
shipped and was proven live the same day.

**Migration 113 — staff_invitations.** The invitation shape COPIED
from the external family, never shared (invitations.client_id is
NOT NULL; that table stays closed): org-scoped, staff-vocabulary
CHECK (agent and every external role excluded by whitelist), token
single-use with a live-per-email-per-org partial unique index,
14-day expiry. Issuance/revocation are RLS-ANCHORED writes from the
admin's own session (org-match + is_org_admin OR founder — anchored
per §126 R2). Two definer doors only: `verify_staff_invitation`,
the anon token door — THE TWELFTH NAMED LOAD-BEARING ANON GRANT,
recorded in the migration's comments at birth — and
`redeem_staff_invitation`, service-role-only on the
redeem_invitation precedent, which stamps org + role + ACTIVE and
spends the token. The invite IS the approval (R1): redeemed staff
never touch the /ops pending queue.

**The members screen** gains the invite panel (name, email, staff
role picker; nothing emailed — the admin hands the /join link over,
the HM-token contract; open invitations listed with revoke) and the
STATUS VERBS beside the role picker. The lockout invariants live as
a PURE RULE (src/lib/members/status-rules.ts, six new tests): never
the founder, never an agent (the kill switch stays /ops — the two
consoles never merge, R2), never yourself, never the last active
admin. The action carries the .select() read-back discipline.

**/join/[token]** mirrors /invite/[token]: anon verify renders the
invitation's face (inviter's name, org, role, expiry); every dead
state collapses to one honest screen; redemption = admin-API
account with email pre-confirmed → service-role redeem → sign-in →
/app/home, half-made accounts deleted on refusal.

**/ops loses the silent founder-org default (D4):** approving an
org-less signup now requires an explicit organisation choice, with
the picker in the pending queue. The founder console keeps every
power; it stops filing strangers into HQ by omission.

**Drive 0ff (scratch org, prod):** admin Petra Ashvale issued a
recruiter invitation for Rowan Ashcombe through the real panel; the
/join page rendered Petra's face and the role; Rowan set a password
and landed at /app/home ACTIVE, recruiter, in the probe org, the
invitation stamped spent by exactly that account; the SPENT link
then showed the dead screen (single-use honesty); Petra suspended
Rowan (status flipped, confirm dialog carrying the honest sentence)
and restored him. One nit found and fixed inline within the slice:
the join page's title doubled the "· Mandate" suffix (3e5ad87).
Teardown by value — 1 invitation, 10 member-audit/trail events, both
scratch principals public-before-auth, org, rate buckets; baseline
EXACT in a fresh statement (25/25/74/1 org/0 staff_invitations).

Green gate: tsc / vitest 939 (933 + 6) / eslint / build · commits
ee9730d + 3e5ad87 · deployed (mandate-hm528zofj). Screenshot:
.playwright-mcp/amm-0ff-members-screen.png.

**Admins can now set up and maintain their organisation's roster
end to end: invite (create), promote/demote (role), suspend/restore
(status) — with the founder console reserved for the open door and
the platform itself.** Remaining on the checklist: the founder's
testing half (§128), onboarding docs, status page, Lighthouse +
mobile audits, simulator verification; then Stripe; then the
Interviewer programme (§125 R5). Numbers: next migration 114, next
§ 136, next drive 100 (hex rolls over); vitest 939; activity CHECK
80; intent door 14; agent allowlist 29; durable baseline unchanged.
This section is DRAFTED; the founder's word closes the slice.

## 136. §135 confirmed — ADMIN MEMBER MANAGEMENT CLOSES — 2026-08-25

The founder confirmed §135 in writing 2026-08-25. The slice closes
as built: migration 113 stands, the twelfth anon grant
(verify_staff_invitation) joins the ruled load-bearing set, the
invite-is-approval doctrine (R1), the two-consoles separation (R2),
the never-merge rule for the two invitation families (R3), and the
lockout-proof refusals (R4) are law. Admins set up and maintain
their own organisation's roster end to end; the founder console
keeps the open door and the platform.

The checklist now stands at: the founder's testing half of §128
(real CVs, real HM, mail-client check, real erasure exercise, D2
disposition ruling) · onboarding docs · status page · Lighthouse +
mobile audits · simulator verification. Founder-owned stack
unchanged. Stripe last, then the Interviewer programme (§125 R5).

Numbers: next migration 114, next § 137, next drive 100; vitest
939; activity CHECK 80; intent door 14; agent allowlist 29; durable
baseline 25/24/74/5/5/1/1/2/2/1/1 + tasks 0 + objectives 0 +
key_results 0.

## 137. ONBOARDING — the docs and the front door; Phase 0 run, gate DRAFTED — 2026-08-25

The founder opened the slice 2026-08-25: the onboarding
documentation, "also we should add access request." Phase 0 read
the second ask against the code and found the hole it names: the
access-request journey has a working FRONT (/request-access →
waitlist → founder review, limiter proven) and a working BACK
(§135's staff invitations + /join) — and a hand-work hole in the
middle that approveWaitlistRequestAction admits in its own comment
("the actual user creation flow is left to … manually"). Deeper: NO
code path can create an organisation at all — the live org was
hand-made in SQL, and organizations has no INSERT policy for any
session role. The docs shelf is empty of anything user-facing.

The gate is drafted at
docs/superpowers/specs/2026-08-25-onboarding-gate.md: D1 approval
becomes a PROVISIONING act with an explicit choice (new org — name
it, organizations gains its first legal founder INSERT policy,
requester invited as that org's ADMIN — or existing org + role),
the waitlist row recording its issued invitation; D2 a public
/handbook route on the marketing surface, markdown-authored in
docs/handbook/, covering the whole journey in the user's language
(no screenshots in v1); D3 docs law — as-built only, the no-verdict
sentence wherever an agent is described. Drive 100: street-to-desk
— a real /request-access submission approved into a NEW scratch org
whose admin then runs §135's invite loop. R1 the founder remains
the only door-opener for new organisations; R2 approval issues an
invitation, never an account.

Numbers: migration 114 + drive 100 claimed by the gate on
confirmation; next § 138; vitest 939. The gate awaits the founder's
written word.

## 138. §137 confirmed — ONBOARDING BUILT; drive 100 street-to-desk green — 2026-08-25

The founder's written word landed against the gate doc and the slice
was built the same day. Migration 114 (file + MCP, applied) carries
the gate's two claims — waitlist.staff_invitation_id (indexed,
ON DELETE SET NULL) and organizations_founder_insert, that table's
first legal INSERT policy — plus a pair the gate had not named and
the act cannot run without: staff_invitations_founder_select and
_founder_insert. 113's admin policies are org-matched, so the
founder's session (org = Mandate HQ) could neither issue nor read
back an invitation for any OTHER organisation; provisioning invites
the requester into the org being provisioned, so the founder needs
the cross-org pair. Anchored policies per §126 R2 — no definer door
was added.

approveWaitlistRequestAction is now the provisioning act: reads the
pending row, refuses re-review, resolves the door (new org — pure
rule orgProvisionRefusal + deriveOrgSlug in src/lib/orgs/, slug
unique-violation in words, requester at role ADMIN — or existing
org + staff role, with the already-a-member check), issues the
invitation with the founder as invited_by, stamps the waitlist row
with status + reviewer + staff_invitation_id in one read-back
update, and returns the /join URL. The waitlist card grew the
explicit choice panel (§135 D4 — no silent defaults; slug derives
from the company name until touched) and approved cards show
"Invitation // org · role · live|accepted|revoked|expired" with the
copyable link — the queue shows which approvals have been handed
their door.

The handbook: eight chapters in docs/handbook/ (requesting access ·
approval + the join contract · first sign-in · the mandate loop ·
HM sharing · candidate portal + erasure · member management · what
the agents do and never do), rendered at a public /handbook on the
marketing surface by a hand-rolled, unit-tested markdown subset
parser (src/lib/handbook/markdown.ts) — no rendering dependency
taken. Content was written against a fresh as-built sweep of every
journey's actual copy; D3 held — nothing promised, the no-verdict
sentence wherever an agent is described, the stale "4 / 14 agents"
string on /app/projects/new NOT repeated (it contradicts the
24-principal registry and is still unfixed). Footer gained the
Handbook link.

DEFECT FOUND IN PROD, fixed d35be36: /join was never in the proxy's
ALWAYS_PUBLIC_PREFIXES — a fresh anonymous visitor (the only kind
an invitation has, by definition) was bounced to /auth/signin; and
the new /handbook was missing from PUBLIC_PAGES, exactly the
silent-hide the allowlist's own comment warns about. Both public
now; /join sits with the other token doors.

Green gate: tsc, eslint, build, vitest 939 → 964 (orgs
provision-rules 13, handbook markdown 12). Commits 9124ae9 (slice)
+ d35be36 (proxy); deployed twice, prod = mandate-386lpo7cu.

Drive 100 (prod, street to desk): Nora Quist submitted the real
/request-access form (100-probe@mandate.test, Quist Search Group) →
row pending → scratch founder (§6a recipe, Mandate HQ) approved via
the NEW-ORG panel — org quist-search-group born under the founder's
session, admin invitation issued, queue showed the live link →
cookies cleared, the real /join link redeemed with a fresh password
→ Nora landed on /app/home as the org's sole active admin ("1
ACCOUNT // 1 ADMIN") → she issued a recruiter invitation for Rex
Marlow from /app/settings/members — §135's loop reached from the
street. Screenshots onboarding-100-*.png. Teardown by value in
order (quist trail events; the four HQ member-audit events
targeting the scratch founder; staff invitations; waitlist row by
email; rate_limit to zero; public.users before auth rows; the org
LAST); baseline verified in a fresh statement — 25/24/74/5/5/1/1/
2/2/1/1/0/0, auth 25, orgs 1, staff_invitations 0, rate_limit 0.

Numbers: next migration 115; next § 139; next drive 101; vitest
964; anon grant roster still TWELVE (114 added policies, not
grants). Remaining per checklist: status page · Lighthouse +
mobile-animation audits · simulator verification · the founder's
testing half of §128 (real CVs, real HM, mail-client check, real
erasure, D2 disposition ruling). The "4 / 14 agents" stale string
is now a named loose end.

Postscript, same day: the "4 / 14 agents" loose end is CLOSED
(f323722, deployed mandate-cc39h3lbk). The count now derives from
AGENT_TILES.length with no roster denominator at all — the 14 was
the AGENTS.md-era number, and any hardcoded denominator would go
stale again the day the Interviewer principal lands. Next migration
115 / § 139 / drive 101 stand.

## 139. THE STATUS PAGE — Phase 0 run, gate DRAFTED — 2026-08-25

The founder called the slice ("run the status page slice next").
Phase 0 read the checklist line against the code: NO health endpoint
exists (the only API routes are copilot, demo, the Bearer-gated cron,
the svix-gated dormant webhook); the daily cron leaves NO persisted
heartbeat — a silent failure is invisible until Monday's digest fails
to arrive; the sign-in footer hardcodes "Node Status: Active", a
status claim read from nowhere; the marketing surface has no status
link. The structural truth is stated plainly: a status page served by
the deployment it reports on is blind to the platform's own outage —
the honest design is an in-product page for degraded states plus an
external monitor for the outage class the page cannot see.

The gate is drafted at
docs/superpowers/specs/2026-08-25-status-page-gate.md: D1 public
/api/health (db via an existing anon door zero-row round trip, auth
via GoTrue's own health, cron via heartbeat staleness; ~30 s cache;
states not internals) · D2 public /status on the marketing surface
(dot plus a word, its own blind spot stated in words, no invented
uptime percentages) · D3 migration 115 = ops_heartbeats, deny-all
RLS, service-role stamped by the cron (no thirteenth anon grant —
R4) · D4 external monitor FOUNDER-OWNED (UptimeRobot free
recommended; surfaced once, not nagged) · D5 ruling wanted on the
sign-in footer's decorative "Active" (recommend: soften the copy) ·
D6 the ladder, claiming drive 101 — whose heartbeat row is DURABLE
state: baseline gains ops_heartbeats 1, no teardown. Both §136's
anon-roster rule and §138's proxy-allowlist trap are bound into the
gate text.

Numbers: migration 115 + drive 101 claimed by the gate on
confirmation; next § 140; vitest 964. The gate awaits the founder's
written word.

## 140. §139 confirmed — STATUS BUILT; drive 101 green — 2026-08-25

The founder's word ("confirmed") landed against the status gate and
the ladder ran the same hour. Migration 115 (file + MCP, applied):
ops_heartbeats, deny-all RLS on the limiter-pair shape — zero
policies, zero grants, service-role only (R4 held: the anon roster
stays TWELVE). The cron route stamps the heartbeat at the end of
every successful run — the stamp says "the cron executed", the
sweep's own outcome travels in detail — best-effort, logged on
failure, never failing the run it reports on.

/api/health (public, ALWAYS_PUBLIC_PREFIXES in the birth commit —
§138's law): {ok, at, checks:{db, auth, cron}}, R2-bounded, 30 s
in-module cache, 200/503 on overall. The db probe is a zero-row
anon-door round trip (verify_staff_invitation with a random uuid);
auth is GoTrue's own health; cron is heartbeat staleness against a
26 h window (pure rule + 6 tests, src/lib/status/heartbeat.ts).
/status (public marketing route, force-dynamic) renders the same
checks through the shared src/lib/status/checks.ts so the machine
answer and the human page can never disagree — dot plus a word, the
blind-spot sentence verbatim, no invented uptime. Footer gained the
Status link; D5 executed as recommended — the sign-in footer's
unread "Node Status: Active" became a System Status LINK with a
neutral brand dot (a green pulse would itself have been an unread
claim).

DEFECT FOUND IN DRIVE, fixed b7312cd: the hosted Supabase gateway
401s /auth/v1/health without an apikey header — the first deploy
read auth as degraded. The probe now carries the anon key (the
publishable one, not a secret).

Drive 101 (prod, logged out): BEFORE = 503 {db ok, auth ok, cron
degraded} — the honest no-reading state; the cron invoked via its
Bearer secret stamped cron_maintenance (row verified, detail
carrying {earned: 0, sweep: not sweep day}); AFTER = 200 all ok,
/status reads "All systems operational." with three dot-plus-word
rows and the honesty paragraph; the sign-in footer shows System
Status, "Node Status: Active" gone from prod. Screenshot
status-101-all-operational.png. Teardown: NONE owed by the gate —
the heartbeat row is durable state; the baseline gains
ops_heartbeats 1.

Green gate: tsc, eslint, build, vitest 964 → 970. Commits 4af874d
(slice) + b7312cd (auth probe); prod = mandate-803yvuqo7. D4
remains FOUNDER-OWNED and open: an UptimeRobot (or similar) account
pinging / and /api/health from outside — surfaced once, the page's
own blind-spot sentence covers the gap honestly until it exists.

Numbers: next migration 116; next § 141; next drive 102; vitest
970; anon grant roster TWELVE; durable baseline gains
ops_heartbeats 1 (now 25/24/74/5/5/1/1/2/2/1/1/0/0 + heartbeats 1).
Remaining per checklist: Lighthouse + mobile-animation audits ·
simulator verification · the founder's testing half of §128.

## 141. LIGHTHOUSE + MOBILE-ANIMATION AUDITS RUN — the typewriter CLS killed — 2026-08-25

The founder called both checklist audits. Lighthouse mobile (prod /,
simulated throttle) BEFORE: perf 0.66, FCP/LCP 4.0 s, **CLS 0.197 —
failing** — and the shift log named one culprit five times over:
p.m-lede in the hero, pushed down 0.03–0.06 per tick. The mechanism
was in TypewriterReveal: it rendered only text.slice(0, visible), so
the H1's box grew character by character and everything below it —
lede, CTAs, trust row — moved on every keystroke of the animation.
Exactly the defect class the checklist line predicted.

THE FIX (335b57d, deployed mandate-k2uq663ih): the untyped remainder
stays in the layout with visibility:hidden — the headline's box and
every line break in it are final from first paint — and the cursor
is anchored to a zero-width position:relative span and positioned
absolute, so it adds no width to the line it blinks on. Order
matters: visible slice · cursor anchor · hidden remainder, so the
cursor blinks at the typing boundary. SSR/no-JS/reduced-motion
behaviour unchanged (full text, no cursor).

AFTER, same audit: perf 0.66 → **0.83**, CLS 0.197 → **0.009**, LCP
4.0 → 3.5 s, TBT 90 ms. Live browser confirm: buffered CLS across
the full typing run 0.0268, remaining entries all the moving cursor
itself (sub-threshold, green). Desktop for the record: perf **0.99**,
LCP 0.8 s, CLS 0.01.

RESIDUAL, named honestly: mobile LCP 3.5 s sits in the
needs-improvement band and is NOT animation-caused — FCP equals LCP,
so it is page weight under 4× throttle (fonts + bundle), out of this
checklist line's scope. A named candidate for a later perf slice,
not a blocker the checklist recognises.

Mobile-animation audit (prod, Playwright at 390×844 and 360×780):
zero horizontal overflow at both widths (flagged right-edge elements
are mid-reveal transforms inside clipped containers — the page never
scrolls sideways); prefers-reduced-motion coverage is comprehensive
(the big CSS reduce block spans particles/stream/shimmer/scanline/
radar/chip-pop; TerminalCursor and TypewriterReveal check
matchMedia in JS); ~20 concurrent hero animations, TBT 90 ms — the
damped-at-640px particle design (marketing.css header note) is
doing its job. Screenshot audit-102-mobile-hero-360.png. No further
defects; both checklist lines CLOSE.

Numbers: vitest 970 unchanged (no pure rule touched); next
migration 116; next § 142; next drive 102 (101 spent on status, the
audits ran as audits, not drives). Remaining per checklist:
simulator verification · the founder's testing half of §128.
D4 external monitor still founder-owned/open.

## 142. SIMULATOR VERIFICATION RUN — null result, the line closes — 2026-08-25

The founder called the last audit line: "verify simulator works
correctly in production (rate limiting, API responses)". Driven in
prod, API and UI both, and everything held — a null result in the
§127 sense: the verification found the design already working.

API responses: a live browser run ("Head of Treasury for Wise in
London") returned the full strict shape — role/company/seniority/
function, a web-grounded scope citing Wise's actual posture (80+
licences, dual listing, banking-licence exploration), five
differentiated weights (7/8/6/9/7), six missing-information items,
exactly three Boolean queries. Malformed JSON and empty role_input
both 400 with honest sentences, and both are counted by the limiter
BEFORE parsing — which is also what made the drive cheap: the IP cap
was exhausted with free 400s, not billed runs.

Rate limiting: the 11th request from the IP refused exactly as
designed — 429, x-ratelimit-scope: ip, Retry-After 2363 s
(consistent with the hour window), and the fair-use message naming
the 10/hr cap. The UI renders the refusal as a polite alert ("You
have run this a few times already — try again in an hour") with a
Try-again and a Book-a-live-run mailto that carries the visitor's
typed brief — graceful, and honest about whose usage tripped it.
The upstream-error path was re-verified in code only (§ the 502
redaction through agentErrorMessage — no billing status leaves the
route); deliberately not driven, since forcing a provider failure in
prod buys nothing the code review didn't.

Labelling doctrine: the example panel's runs carry the ILLUSTRATIVE
badge and the sentence "Written by us to show the shape of the
output. Not generated by the model, and not a live run." — the
marketing vocabulary holding exactly as §141's memory records it.

Screenshots sim-102-live-run-wise.png,
sim-102-rate-limit-refusal.png. Teardown: the two limiter buckets
(demo_ip key + global daily, both count 13 — matching the probe
count exactly) swept; rate_limit 0, ops_heartbeats 1, users 25,
orgs 1 verified in a fresh statement.

With this, EVERY line of the pre-launch checklist that is mine to
run is CLOSED. Remaining are the founder's alone: the §128 testing
half (8–10 real CVs, real HM, mail-client check, real erasure
exercise, D2 disposition ruling) and the founder-owned items
surfaced once (Turnstile keys · service-role key rotation · Resend
webhook secret · Engage env pairs · leaked-password protection ·
the D4 external monitor · the client rename · stale-poll §82).
Stripe stays parked last; the Interviewer programme (§125 R5) waits
on the checklist's own close.

Numbers: vitest 970; next migration 116; next § 143; next drive 102
(the verification ran as an audit, not a numbered drive).

## 143. THE INTERVIEWER PROGRAMME OPENS — slice one BUILT; drive 102 green — 2026-08-25

The founder declared the checklist closed and opened the programme —
R5's line, drawn exactly as the confirmed gate (§125) reserved it.
Slice one built the same session, on the gate's D1 + D2 as ruled.

Migration 116 (file + MCP): public.interview_plans keyed
(project_id, candidate_id), the 037 pattern copied never shared —
versioned, draft→approved→archived, immutability trigger on the
dedicated flag mandate.allow_project_plan_transition, atomic
allocation locking the CANDIDATE row (mainstream linkage is
candidates.project_id itself — no link table exists to lock),
archive-then-promote approval RPC, org RLS + the agent pair
double-pinned status='draft' on both faces. The trail: CHECK 80 →
83 (interview_plan_generation_requested / _generation_failed /
_approved — mandate-writer-gated in the intent door, 14 → 17); the
agent allowlist UNTOUCHED at twenty-nine — the Interviewer reuses
interview_plan_generated with detail.agent_kind='interviewer', EI's
and the mainstream twin distinguishable in one trail.

The TWENTY-FIFTH principal: vbreygin+interviewer@gmail.com minted by
operator hand (§6a recipe, Mandate HQ per the platform-agents
doctrine), env pair AGENT_INTERVIEWER_* in Vercel production;
signInInterviewer() in session.ts; registry 24 → 25 (Evaluate group,
beside its EI sibling); the kill-switch copy says twenty-four. NOTE
for the founder (surfaced once, joins the Engage pairs): the local
.env.local pair could not be written by the session — the file is
permission-fenced — so local dev runs read agent-unavailable until
the pair is added by hand. Prod carries it.

The pipeline (src/lib/ai/interviewer-agent.ts +
generate-interview-plan.ts): sources are the mandate's own record —
job spec (latest, final preferred; provenance stamped), the
calibration's five dimension weights (the generation GATE — no
calibration, no plan, said in the action before a row exists), the
candidate's profile and scores. Dimension coverage is computed
server-side against DIMENSION_KEYS; invented keys stripped; the
agent's own claims ignored. One deliberate improvement on the EI
twin: every agent-session write carries {count:"exact"} and refuses
zero rows (§129's law — the EI pipeline predates it and remains a
named gap). Failure bookkeeping stays human (090): markFailed under
the requester's cookie client, which also records
interview_plan_generation_failed through the intent door.

UI: an Interview plan tab on the candidate page — explainer +
gated Draft button, generating/failed/draft/approved states, the
coverage strip ("computed against the calibration, not the agent's
claims" — uncovered heavy dimensions read as error-toned), stages
with questions/evidence/red-flags, Approve behind a confirm,
Regenerate always minting a NEW version, and the no-verdict sentence
verbatim. The sample candidate gained a labelled sample plan tab
(both standing memory rules held).

Harness: supabase/tests/agent_interviewer_invariants.sql — 037's
negatives re-proven mainstream + the agent pins, run GREEN against
the live schema in a rolled-back transaction. Two harness lessons
recorded in its comments: the forged agent must anchor CROSS-ORG
(same-org anchoring lets the org policy admit what the agent pair
filters — first run proved it by hitting the trigger instead of the
RLS silence), and trail-event counts read as OWNER (org-visible
rows count 0 under the agent's own claims).

Green gate: tsc, eslint, build, vitest 970 → 976. Commit c0ba8ff;
deployed mandate-jf4g9wpqb.

Drive 102 (prod): scratch org Kestrel Search Drive + scratch
recruiter (§6a) + seeded mandate (five-weight calibration) +
candidate Mara Voss → the recruiter pressed Draft Interview Plan →
the Interviewer signed in LIVE under its prod credential and
persisted a 4-stage draft (zero uncovered dimensions; the overview
cited the actual weights 8/7/6/5/3 and folded regulatory into the
domain stage — the calibration visibly steering) → Approve behind
the confirm → status approved, approver stamped. The org trail
told the whole story in order: requested by Drive Recruiter 102 →
generated by Interviewer Agent (agent_kind interviewer, 4 stages)
→ approved by Drive Recruiter 102. Screenshots
interviewer-102-draft-plan.png / interviewer-102-approved-plan.png.
Teardown by value (events → plans → scores → candidates → projects
→ users public-before-auth → org LAST; plus a NEW trap: browser
sign-ins mint a sign_in_ip rate bucket — swept by key); baseline
verified fresh-statement: 26 users / 25 agents / 77 events / orgs 1
/ interview_plans 0 / ops_heartbeats 1 / rate_limit 0 / auth 26.

THE DURABLE BASELINE MOVES: 25→26 users, 24→25 agents, 74→77
events (the Interviewer's three member-audit creation events — the
Interpreter precedent). Numbers: next migration 117; next § 144;
next drive 103; vitest 976; activity CHECK 83; intent door 17;
agent allowlist 29 (unchanged, ruled). Slices two–four (candidate
prep pack / client interview / simulator) remain direction, not
authorisation — each gates separately (R4).

## 144. THE CLIENT INTERVIEW BUILT — the Interviewer's second face; drive 103 green — 2026-08-25 — DRAFTED, NOT CONFIRMED

The client-interview slice ran its full D-ladder on the founder's
written confirmation of
docs/superpowers/specs/2026-08-25-interviewer-client-interview-gate.md
(commit 3368dc3 — Phase 0 verified live the same day: feedback's
candidate_id NULLABLE, the CHECK at four values with the TS union at
three, the Interviewer's calibration_model reads already lawful under
111). The candidate prep pack stays recorded-and-skipped; the
SIMULATOR stays closed and LAST (programme D5) — nothing here touches
it. This section is DRAFTED; the founder's word closes it.

Migration 117 (file + MCP, applied): `client_interviews` — the
037/116 pattern copied a FOURTH time, never shared, keyed by the
MANDATE alone (project_id, version; no candidate axis). The
allocation lock is the PROJECT row FOR UPDATE with the org equality
in the lock's WHERE; the transition flag is DEDICATED
(mandate.allow_client_interview_transition — EI's, 116's and this one
can never interfere); archive-then-promote approval RPC
(approve_client_interview); org RLS + the agent pair double-pinned
status='draft' on both faces. The feedback vocabulary widened 4 → 5
('client_interview' — a new VALUE, not a new pipeline). The trail:
CHECK 83 → 87 (client_interview_generation_requested /
_generation_failed / _approved — mandate-writer-gated, door 17 → 20 —
plus client_interview_answered, which is deliberately NOT
app-recordable: it is sessionless and enters ONLY via the new
SECURITY DEFINER record_client_interview_answered, 063's shape —
token re-validated, APPROVED set required, label in detail, EXECUTE
revoked from everyone so the ruled anon roster stays TWELVE). The
agent allowlist UNTOUCHED at twenty-nine: the Interviewer's composing
act reuses interview_plan_generated with
detail.plan_scope='client_interview'. Two new 088 buckets as data
(client_interview_token 5/hr/300-day-global, client_interview_ip
30/hr) — the answer door is anonymous and billed, so it FAILS CLOSED.

The pipeline (src/lib/ai/client-interview-agent.ts +
generate-client-interview.ts): the gap list is computed SERVER-side
before the model call (computeMandateGaps — every
missing_information item verbatim, onboarding absent, weights absent
or flat at spread < 2) and passed INTO the prompt; on return every
question's cited gap_id is checked against that list and off-list
questions are STRIPPED (finalizeClientInterview), coverage computed
by the app — the agent phrases, it cannot invent (gate D2). Zero
gaps is an HONEST REFUSAL said in the action before a row exists
("nothing to ask the client") and re-checked in the pipeline.
{count:"exact"} + zero-row refusal on the agent write (§129);
failure bookkeeping human (090) via markFailed +
client_interview_generation_failed through the door. The
interpretation of answers is the EXISTING pipeline:
runHmFeedbackPipeline now reads the row's OWN feedback_type (was
hardcoded hm_portal) and accepts candidate_id NULL — one seam
widened, no new machinery.

The answer door: POST /hm/[token]/api/interview-answers — uuid
shape, fail-closed limits BEFORE verification, verify_hm_token, the
body must name the mandate's CURRENT approved set (a mismatch 409s
with a refresh sentence — old answer ids are never silently mapped
onto new questions), ONE mandate-level feedback row per submission
(composeClientInterviewContent, §128 F-4's issuance-label fallback
kept), the definer answered-event fire-and-forget, interpretation in
after() under the Feedback Interpreter's own session.

UI: a "Client interview" panel on /app/projects/[id] directly below
the "Information required" rail it feeds from — explainer + a
LABELLED illustrative example question in the empty state (both
standing memory rules), honest refusal lines (no calibration / no
gaps), generating/failed/draft/approved states, gap-coverage chips
("computed against the mandate's record, not the agent's claims" —
uncovered reads error-toned), per-question why-it-matters + Addresses
lines, Approve for Portal behind a confirm, Regenerate minting a NEW
version, the no-verdict sentence. Portal side: a "Questions from the
search team" section in PortalContent (buildPortalClientInterview
deliberately DROPS gap ids/labels — the desk's machinery never
reaches the client's page), rendered read-only in the founder
preview ("Preview — answers are submitted from the client's share
link") and LIVE only on the token door; the sticky submitted state
mirrors the feedback form's. NAMED RESIDUE: the signed-in /portal
door does not render the section — its reads flow through the
SECURITY DEFINER portal_get_mandate (068's confirmed machinery), and
widening that payload was not in this gate; it needs its own
one-line ruling if the founder wants externals to see the questions
in-account.

Harness: supabase/tests/agent_client_interview_invariants.sql —
eleven invariants GREEN against the live schema in a rolled-back
transaction: 116's negatives re-proven mandate-keyed (immutability,
RPC-only promotion, pre-approved insert refused, exactly-one
approved, flag containment, foreign-org allocation refused), the
agent pins (draft edit lands / approved silent-zero / no
self-promotion / suspended reads ZERO), the plan_scope'd trail
event, the viewer refused at the door, the answered entry point
REFUSED to authenticated and — with the owner's privilege — true on
a live token against the approved set (label + count in detail),
false on a revoked token and on a draft set with no row written, and
the widened CHECK accepting a candidate-less client_interview row
while refusing an unknown type.

Green gate: tsc, eslint, build, vitest 976 → 996 (twenty new: gap
computation, strip/coverage/ids, draft + stored normalizers, body
parsing incl. the hostile-key filter, content composition, the
describe-mirror moved to 87/20). Commit 46a5f03; deployed
mandate-ds3ga76bd.

Drive 103 (prod): scratch org Ledgerline Drive 103 + scratch
recruiter (§6a; the browser AUTOFILLED THE FOUNDER'S REAL
CREDENTIALS on the signin form — the standing trap, overwritten) +
seeded mandate (two missing-info items, differentiated weights
8/7/6/5/3, onboarding {}) → THREE gaps computed → Draft Client
Questions → the Interviewer signed in LIVE and persisted a
6-question v1 draft in ~16s — every question citing a real gap, all
three gaps covered 1q/2q/3q, the missing-info items steering
visibly (comp question from the comp gap, org-shape questions from
the team gap, success-criteria/anti-pattern questions from the
absent onboarding) → Approve for Portal behind the confirm (dialog
via the handler, effect verified in DB: approved, stamped by Drive
Recruiter 103) → share link minted through the real action
(30-day, labelled) → founder preview showed the section READ-ONLY →
clearCookies → /hm/[token] rendered the live form → two answers,
name left BLANK deliberately → submit → sticky acknowledgment → the
feedback row landed mandate-level (candidate_id NULL, type
client_interview) carrying the ISSUANCE label via the F-4 fallback →
the answered event landed with label + count 2 → the Feedback
Interpreter ran in after() and RECALIBRATED off the client's
answers — the full loop the gate promised, closing in one drive.
The org trail told it in order: requested (recruiter) → generated
(Interviewer, plan_scope client_interview) → approved (recruiter) →
hm_portal_opened (label) → answered (label, 2) → interpreted
(Interpreter, recalibrated true). Screenshots
clientinterview-103-panel-empty / -draft-set / -portal-form /
-answers-submitted.png. Teardown by value (events → calibration
snapshot → feedback → sets → tokens → project → users
public-before-auth incl. sessions/refresh/identities → org LAST →
rate_limit swept whole, per its zero baseline); fresh-statement
baseline EXACT first pass: 26 users / 25 agents / 77 events / auth
26 / orgs 1 / projects 2 / clients 2 / feedback 3 /
client_interviews 0 / interview_plans 0 / hm tokens 3 / reviews 4 /
calibration_history 0 / ops_heartbeats 1 / rate_limit 0.

THE DURABLE BASELINE IS UNCHANGED — the slice added no durable
rows, only machinery. Baseline GAINS the table: client_interviews 0.
Numbers: next migration 118; next § 145; next drive 104; vitest
996; activity CHECK 87; intent door 20; agent allowlist 29
(unchanged, ruled); anon roster 12 (unchanged, ruled). Remaining
Interviewer direction: candidate prep pack (D3, skipped by the
founder's word) and the simulator (D5, LAST) — each still gates
separately (R4). Named residue above: /portal rendering of the
question set.

## 145. §144 CONFIRMED — the client-interview slice CLOSES — 2026-08-25

The founder's written word ("confirmed — §144 closes") lands against
§144 as drafted. The client-interview slice is CLOSED: migration 117,
the gap-fed pipeline, the two doors, the harness, drive 103 and the
unchanged durable baseline are law as recorded. Nothing was built on
this confirmation — it closes the record.

What remains of the Interviewer programme, all still gated
separately (R4): the candidate prep pack (D3 — skipped by the
founder's word, direction recorded), the Interview Simulator (D5 —
LAST, closed until its own gate after the programme's other slices),
and the named residue: rendering the approved question set on the
signed-in /portal door needs a one-line ruling to widen
portal_get_mandate's payload (068's confirmed machinery — not
touched without a word). Founder-only items stand unchanged (§128
testing half, the surfaced-once list, D4 monitor; Stripe last).

Numbers at close: next migration 118; next § 146; next drive 104;
vitest 996; activity CHECK 87; intent door 20; agent allowlist 29
(ruled); anon roster 12 (ruled); durable baseline 26 users / 25
agents / 77 events, client_interviews 0 in the counted set.

## 146. LLM ROUTER SLICE 1 BUILT — the seam — 2026-08-25 — DRAFTED

The founder's word ("go") landed against the slice-1 gate (fda4764,
docs/superpowers/specs/2026-08-25-llm-router-slice1-gate.md) and the
D-ladder ran end to end. DRAFTED — no completion declared; §147
confirms or corrects.

**Migration 118 — inference_runs.** One row per model call:
capability / model / provider / input / cached / output tokens /
latency_ms / outcome (ok | schema_failed | provider_error | refused)
/ retries / escalated_from / project_id (nullable, NO FK) /
created_at. Deny-all on the 115 precedent — RLS enabled, zero
policies, zero named grants; the anon roster stays TWELVE. (Phase-0
note now recorded: Supabase's default table privileges appear on
every new table including ops_heartbeats — "deny-all" is
RLS-with-zero-policies, the ruled roster counts NAMED grants.) No
prices anywhere. Trail untouched: CHECK stays 87, door stays 20,
allowlist stays 29.

**The seam.** src/lib/ai/inference.ts — runInference(capability,
request, {projectId?}) and runInferenceStream (copilot's SSE). The
seam supplies ONLY the model, from src/lib/ai/model-map.ts (35
slugs, every entry claude-sonnet-4-6 — a tier flip is slice 3's
gate, and a unit test is the tripwire). Part N law in the module
header: the seam never holds a product Supabase client; its one DB
access is the fire-and-forget service-role telemetry insert, which
logs once and can never block, fail, or reshape a model call.
Provider errors are recorded and RETHROWN unchanged — every seam's
agent-errors/090 handling fires exactly as before. retries records
0, honestly (SDK-internal retries are unobservable; app retries
don't exist).

**The sweep.** 35 files / 37 call sites (demo untouched per Q6),
mechanical: same request objects, same response handling, same
normalize*(), same max_tokens; exported model consts became
re-exports of map entries so every importer and test stayed green.
project_id attribution rides the same expression each file already
passes to applySkillsToPrompt (null stays null — EI seams and the
desk digest are correctly unattributed). The ruled drift fix:
run-candidate-research, run-company-intelligence,
run-hiring-manager-research, run-executive-company-context moved
web_search_20250305 → web_search_20260209; sourcing-search was
already there; the demo door STAYS on 20250305 (§142 verified,
out of scope).

**DISPOSITION — schema_failed wiring.** markInferenceSchemaFailed()
shipped in the seam (WeakMap response → run id) but NO call site
uses it yet: every existing failure branch wraps the provider call
AND the parse in one catch, so marking there would stamp
schema_failed on provider errors — a lie. The clean wiring belongs
to slice 3's escalation work, which needs exactly that signal
separation. The gate's escape hatch anticipated this; the column
ships, the outcome enum is complete, rows simply never carry
schema_failed this slice.

**Green gate.** tsc clean · eslint clean · vitest 1010 (996 + 14
seam tests: map completeness + the all-sonnet tripwire, outcome
mapping, buildRunRow honesty incl. absent-usage nulls, provider
error rethrow-unchanged, telemetry-failure isolation,
markInferenceSchemaFailed by id + stranger no-op, stream
pass-through + usage-off-the-stream, mid-stream error) · build
clean. Commit d3ec865, deployed mandate-mnqwopfzf.

**Drive 104 GREEN (live, prod).** Scratch principal minted in SQL
(auth.users + identities pair; the auth trigger cut the public row
viewer/pending — promoted recruiter/active). The autofill trap
fired EXACTLY as §-recorded — the founder's real credentials
pre-filled; overwritten. Signed in, opened Head of IT Operations,
asked Mandy one question — the answer STREAMED normally
(byte-identical product behavior), and the row landed: copilot /
claude-sonnet-4-6 / anthropic / 7,869 in / 0 cached / 151 out /
5,090 ms / ok / retries 0 / project_id = the mandate's uuid. The 0
cached is itself slice 2's baseline measurement. Screenshot
router-104-copilot-live-answer.png. NEW TRAP LEARNED: promoting a
user by direct SQL UPDATE fires the member-audit trigger — three
member_* events landed and were swept by id alongside
copilot_answered. Teardown by value (events → inference_runs →
rate_limit whole → public.users → auth.identities → auth.users →
clearCookies); fresh-statement baseline EXACT first pass: 26 users /
25 agents / 77 events / auth 26 / orgs 1 / projects 2 / clients 2 /
candidates 1 / skills 5/5 / job_specs 1 / network 1 /
ops_heartbeats 1 / interview_plans 0 / client_interviews 0 /
staff_invitations 0 / rate_limit 0 / inference_runs 0.

THE DURABLE BASELINE IS UNCHANGED — baseline GAINS the table:
inference_runs 0. Slices 2 (caching) / 3 (evals + tier flips) / 4
(Part R + providers) each gate separately (R4); Q4's cross-provider
spike stays deferred. Numbers: next migration 119; next § 147; next
drive 105; vitest 1010; activity CHECK 87; intent door 20; agent
allowlist 29 (ruled); anon roster 12 (ruled).

## 147. §146 CONFIRMED — slice 1 CLOSES; the router continues — 2026-08-25

The founder's word ("if everything in this slice is working we can
continue") lands conditionally against §146; the condition was
re-verified live before closing: /api/health 200 (db/auth/cron ok),
durable baseline exact (26/25/77), inference_runs quiet at its
durable 0. SLICE 1 IS CLOSED: migration 118, the seam, the map, the
35-file sweep, the four-seam web-drift fix, drive 104's honest row
and the unchanged baseline are law as recorded. The schema_failed
disposition (shipped unwired, wiring = slice 3) stands as recorded
direction.

"Continue" proceeds under R4: slice 2 (prompt caching, Part J) gates
next — Phase-0-verified gate DRAFT first, build only on the
founder's written word against it. Slices 3 and 4 wait their turns.

## 148. LLM ROUTER SLICE 2 BUILT — copilot conversation caching — 2026-08-25 — DRAFTED

The founder's word ("go") landed against the slice-2 gate (0788898)
and the D-ladder ran. DRAFTED — no completion declared; §149
confirms or corrects.

**The gate's Phase-0 correction held.** Slice 2 caches ONE
capability — the copilot conversation — because measurement rewrote
Part J: every candidate base prompt sits under Sonnet 4.6's
1024-token cacheable minimum (largest ≈991 est.), and the eight
non-copilot candidates are single-shot against the 5-minute TTL.
They stay deferred WITH their numbers until slice 3's eval harness
creates repeated identical runs.

**Built (commit 69762dc, deployed mandate-3fzuektvf).** Migration
119 adds cache_creation_input_tokens to inference_runs (writes are
the proof an entry exists, and bill 1.25×) — no policy/grant/roster
change. model-map gains CACHED_CONVERSATION_CAPABILITIES = {copilot}.
The seam owns the mechanism (Part J's own rule): exported pure
stampConversationCache() converts the LAST user message's tail to a
cache_control:{ephemeral} block (string content → its equivalent
text block, wire-identical; assistant-tailed/empty lists untouched;
only block kinds that legally carry cache_control are stamped —
thinking blocks refuse). Unflagged capabilities send byte-identical
messages (unit-tested via reference equality). The candidates
snapshot query gained ORDER BY id (copilot-context.ts) — an
unordered array was a silent prefix invalidator; scores/feedback/
shortlist were already ordered. vitest 1010 → 1018 (8 new: flag
roster, string→block stamp, last-block-only, assistant-tail no-op,
no caller mutation, cache-write capture, absent-usage null, flagged
stream sends stamped messages).

**Drive 105 GREEN (live, prod) — the cache proven by its own
telemetry.** Scratch principal (drive105), autofill trap
overwritten again, two-turn Mandy conversation on Head of IT
Operations, both answers streamed normally. The rows told the whole
story: turn 1 = input 3 / cached 0 / **cache_creation 8,032** /
out 134 / ok; turn 2 = input 3 / **cached 8,032** /
cache_creation 146 / out 248 / ok — turn 2 read the ENTIRE turn-1
prefix at ~0.1×, ~98% of its input served from cache, writing only
the 146 new tokens. Screenshot router-105-cached-conversation.png.
NEW TEARDOWN LESSON: clearCookies does NOT clear localStorage — the
copilot panel's client-side history carried drive 104's conversation
into drive 105's (harmless here, but sweep localStorage.clear() +
clearCookies from now on). Teardown by value (5 events: 3 member_*
from the §146-known promotion trap + 2 copilot_answered →
inference_runs → rate_limit whole → public.users → auth.identities
→ auth.users → localStorage + cookies); fresh-statement baseline
EXACT first pass: 26/26/25 agents/77 events/orgs 1/projects 2/
clients 2/candidates 1/skills 5/5/job_specs 1/network 1/
ops_heartbeats 1/interview_plans 0/client_interviews 0/
staff_invitations 0/rate_limit 0/inference_runs 0.

THE DURABLE BASELINE IS UNCHANGED — inference_runs stays a durable
0 and gains the cache_creation_input_tokens column. Slices 3
(evals + tier flips + schema_failed wiring + the eight deferred
caching candidates) and 4 (Part R + providers) gate separately
(R4). Numbers: next migration 120; next § 149; next drive 106;
vitest 1018; activity CHECK 87; intent door 20; allowlist 29
(ruled); anon roster 12 named grants (ruled).

## 149. §148 CONFIRMED — slice 2 CLOSES; slice 3 gates — 2026-08-25

The founder's word ("lets go") lands against §148 as drafted. SLICE
2 IS CLOSED: migration 119, the copilot conversation cache, the
stamped seam, the ORDER BY pin, drive 105's write-then-read proof
(8,032 tokens written turn 1, read at ~0.1× turn 2) and the
unchanged durable baseline are law as recorded. The localStorage
teardown lesson joins the standing trap list.

Slice 3 gates next under R4 — evals + the Q3-authorized benchmarks
(Sonnet 5, Haiku 4.5) + tier flips only where evals pass +
schema_failed wiring + re-judging the eight deferred caching
candidates. Phase-0-verified gate DRAFT first; build on the word.

## 150. LLM ROUTER SLICE 3 — harness built, matrix RUN — 2026-08-25 — DRAFTED, FLIP WORD PENDING

The founder's first word ("please continue") landed against the
slice-3 gate (03bafc3); the build phase and the benchmark matrix
both completed. DRAFTED — the SECOND word (the flip ruling against
the table below) is what changes production models; nothing flipped
yet.

**Built (commits 8010176 + 60c9d5b, deployed mandate-3cr96caet).**
evals/ harness: env-gated vitest (`npm run eval`, MANDATE_EVAL=1;
`npm test` spends nothing); fenced overrides in the seam
(modelOverride/thinkingOverride THROW outside eval mode — Part N
holds; __setEvalOverrides for the seams' internal calls); eval runs
recorded in memory, never the prod table; real fixtures exported
once from the two live mandates (8 fixtures, 5 capabilities; thin-N
stated); two graders (deterministic seam assertions + Sonnet 4.6
rubric judge); results append to evals/results/. schema_failed
WIRED on six seams (parse-only try, outer behavior byte-identical;
representative unit proof run-relationship.schema.test.ts). vitest
1024. KEY LESSON: Vercel sensitive-flagged env vars are UNPULLABLE
(`vercel env pull` writes "[SENSITIVE]") — correct posture; the
first matrix attempt 401'd on the placeholder and doubled as the
harness's mechanical verification ($0). evals/setup.ts now resolves
ANTHROPIC_API_KEY founder-side (.env.local read at eval runtime),
which is how the real run executed.

**The matrix (30 live cells, ~$1.50, evals/results/2026-08-25.md):**
- **Sonnet 5 adaptive: REJECTED as drop-in.** 5/8 cells truncated
  at the seams' own max_tokens ("Unterminated string…", one
  "no text block") — the Phase-0 canary (thinking inside
  max_tokens + ~35% tokenizer) fired exactly as predicted.
- **Sonnet 5 thinking-off: strong (rubric 4–5) and ~2× faster on
  big generations** (evaluation 70s → 31s) but +30–40% input
  tokens — at the identical post-intro list price, a net cost
  increase.
- **Haiku 4.5: flip-grade on three of four economy capabilities**
  (target-companies 5+4, relationship 4 at 1.1s/⅓ price, sourcing
  4) — but FAILED search-health 1/2 deterministically (1 suggestion
  vs the required 3–5).
- Baseline 4.6 passed everything. Judge debts noted (max_tokens
  300 → 600; give it the fixture digest).
- The eight deferred caching candidates STAY deferred — every
  prefix confirmed under the 1024-token minimum; the bulk lives in
  never-repeating user payloads.

**RECOMMENDED FLIPS awaiting the word:** run_target_companies +
run_relationship + generate_sourcing → claude-haiku-4-5;
run_search_health HOLDS; generate_evaluation = founder's judgment
call (sonnet-5 thinking-off halves a page-blocking latency at
+30% tokens); parse_cv waits on CV files (surfaced once);
everything else holds. On the word: map edits + tripwire repin +
green gate + deploy + drive 106 (one flipped capability live,
row shows the new model) + §151.

Numbers: next migration 120 (none used); next § 151; next drive
106; vitest 1024; CHECK 87; door 20; allowlist 29; anon roster 12;
durable baseline unchanged (inference_runs 0 — eval rows never
touched prod).

## 151. SLICE 3 FLIPS APPLIED — drive 106 green — 2026-08-25 — DRAFTED

The founder's flip word ("flip all four including evaluation")
landed against §150's table. Applied (commit 2a3d825, deployed
mandate-ly0wnrlet): generate_sourcing / run_relationship /
run_target_companies → claude-haiku-4-5; generate_evaluation →
claude-sonnet-5 with thinking DISABLED via new CAPABILITY_THINKING
map (production seam behavior — bare Sonnet 5 defaults to adaptive,
the variant the benchmark rejected for truncation) + max_tokens
3500 → 4500 headroom. run_search_health held on sonnet-4-6 as
ruled. Tripwire test REPINNED to the ruled mapping + a test that
generate_evaluation sends thinking-off and Haiku capabilities send
none. vitest 1025.

**Drive 106 GREEN (live, prod).** First door attempted was
sourcing-generation (Optimize → "Generate all") — it HONESTLY
REFUSED with no spend because the job spec is not final
(is_final=false); correct product law, wrong drive door, and a
useful negative proof. The proof ran on the marquee flip instead:
snapshotted cv_structured.evaluation into a sibling key DB-side,
removed the live key, visited the candidate page as the scratch
recruiter — the REAL pending→after() generation path fired and the
row landed: **generate_evaluation / claude-sonnet-5 / 27,792 in /
3,472 out / 33.4s / ok / project attributed** — latency HALVED vs
the 70s 4.6 baseline, and 3,472 out validates the headroom raise
(it would have grazed the old 3,500 cap). Screenshot
router-106-sonnet5-evaluation.png. Teardown by value: evaluation
restored byte-identical from the sibling key (original generated_at
2026-04-30 verified back), 4 events swept (3 member_* + 1
candidate_evaluated), inference_runs/rate_limit swept, scratch user
public-before-auth, localStorage + cookies cleared. Fresh-statement
baseline EXACT: 26/26/77/0/0, boolean_queries 0.

RESIDUE, honest: the three Haiku flips are proven at benchmark
level; their first PROD runs will write their own inference_runs
rows in normal use (sourcing additionally waits on a finalised
spec). parse_cv benchmark still waits on founder CVs. Slice 4
(Part R + providers) is the last gate; escalation pairs now have
schema_failed signal live to build on. Numbers: next migration 120;
next § 152; next drive 107; vitest 1025; CHECK 87 / door 20 /
allowlist 29 / roster 12; durable baseline unchanged.

## 152. §151 CONFIRMED — slice 3 CLOSES — 2026-08-25

The founder's written word ("Confirmed") lands against §151 as
drafted. SLICE 3 IS CLOSED: the eval harness, the fenced overrides,
schema_failed wiring on six seams, the benchmark matrix and its
results (evals/results/2026-08-25.md), the four flips
(sourcing/relationship/target-companies → haiku-4-5; evaluation →
sonnet-5 + CAPABILITY_THINKING disabled + max_tokens 4500),
search-health's hold, the repinned tripwire, and drive 106's live
proof are law as recorded. Residue stands as recorded: three Haiku
flips benchmark-proven (prod rows arrive in normal use; sourcing
needs a finalised spec), parse_cv benchmark waits on founder CVs,
judge debts (max_tokens 600 + fixture digest). The router programme
has ONE gate left: slice 4 — Part R (registry-as-data, keys in env
NEVER the DB, eval-gated activation, admin surface on the Skills
pattern) + cross-provider adapters only if data justifies (Q4 spike
stays deferred until in-family savings are exhausted). Escalation
pairs (Part G) gate after slice 4 per O.5, now with live
schema_failed signal. Numbers at close: next migration 120; next
§ 153; next drive 107; vitest 1025; CHECK 87; door 20; allowlist
29; anon roster 12; durable baseline unchanged (inference_runs 0
durable, gains nothing).

## 153. LLM ROUTER SLICE 4 BUILT — PART R MODEL REGISTRY — drive 107 GREEN — 2026-08-25 — DRAFTED, AWAITS CONFIRMATION

The founder's word ("please execute") landed against the slice 4
gate as drafted (1885da9, 2026-08-25-llm-router-slice4-gate.md); the
ladder ran end to end. Nothing here is law until the founder
confirms THIS entry.

**Migration 120 (model_registry).** Three tables on the 088
caps-as-data shape, natural keys: model_providers (adapter_kind
CHECK admits ONLY 'anthropic' — Q4's deferral made structural;
key_env_var shape-checked ^[A-Z][A-Z0-9_]*$, an env-var NAME that
cannot admit a key), provider_models (status
benchmarking|active|retired; CHECK active ⇒ benchmark_ref NOT
NULL; informational price/caps columns — Part L's read-time map
stays the cost authority), capability_assignments (capability text
PK, no CHECK over the 35 — a typo'd row is inert and the console
shows it; updated_by plain uuid, 118 shape). RLS `is_org_admin()`
FOR ALL on all three — agents (role 'agent') refused by the same
test; anon closed by policy absence; the ruled roster STAYS TWELVE.
Structural activation gate as triggers created AFTER the seed
(migration order is the door): INSERT refuses active-at-birth;
active only FROM benchmarking; an assignment only to an active
model on an active provider; a model cannot leave active while
assigned. Seed: anthropic provider (ANTHROPIC_API_KEY by NAME) +
the three production models active with evidence named
(sonnet-4-6 incumbent §147; sonnet-5 + haiku-4-5 → §150's
results file). capability_assignments seeds ZERO (J.2): a row is an
explicit founder override; absence = the ruled map governs and the
tripwire stays authoritative. Trail: CHECK rebuilt 87 → 89
(model_provider_added, model_assignment_changed), intent door
20 → 22, both admin-gated exactly like the skill family;
record_agent_event untouched at 29.

**Migration 121 (guard revokes).** The post-DDL advisor sweep
found 120's two trigger guards executable by anon/authenticated as
SECURITY DEFINER RPCs (Postgres default EXECUTE to PUBLIC). Full
revoke per the 110 doctrine — a trigger function has no caller.
Guards proven still firing post-revoke.

**Read path.** src/lib/ai/registry.ts: whole-table read (≤35 rows)
through the service-role client, 60s in-process TTL, warn-once +
code-map fallback; stale beats blind (a failed refresh keeps the
last good read); a failed read stamps the window (one attempt per
TTL, never one per call). resolveOverrides() is now async on both
seam paths: assignment row → map. The thinking rule (J.6):
CAPABILITY_THINKING rides only when the resolved model IS the
map's model. Registry NEVER consulted under MANDATE_EVAL=1 —
benchmarks stay reproducible from harness + map alone.

**Admin surface.** NEW capability `models:write`, admin-only
(roles.ts + matrix test + no-access label "Model management");
route-access: the whole /app/settings/models prefix takes it
(unlike the skills list — the registry's RLS is admin-only SELECT,
so a non-admin render would be an empty lie). Page on the Skills
shell: providers / models (status, evidence, activate–retire–
re-benchmark lifecycle; activation prompts for benchmark_ref) /
35-capability assignment table showing map default beside any
override, set/clear. actions.ts on the Skills pattern
(requireActionContext, runAction, recordActivity; the triggers'
own sentences surface in toasts). Settings hub gains an admin-only
Models link. TS mirrors widened: ACTIVITY_EVENT_TYPES 87 → 89,
APP_RECORDABLE_EVENTS 20 → 22, describe cases (names and statuses
only — never key env-var names), group = mandates (skills
precedent).

**Tests.** vitest 1025 → 1044: registry.test.ts (TTL, warn-once,
stale-beats-blind, failure-window) + inference.test.ts slice-4
describe (override wins + thinking dropped on model change;
map-model assignment keeps thinking; absence → map; telemetry
records the override model; failed read never blocks; eval fence
skips registry). Tripwire UNTOUCHED. tsc, eslint, build green.
Commits 84e2a29 (build) + f9d83e7 (121); deployed
mandate-l66e4dsd5.

**Drive 107 — GREEN, live in prod.** (1) Founder-admin at
/app/settings/models: seeded registry + 35 map defaults rendered
(models-107-registry-live.png). (2) Added claude-opus-5 → landed
benchmarking (models-107-opus-benchmarking.png); the UI's
assignment selects don't even offer it. (3) DB door probed live:
assignment of the benchmarking model REFUSED by the trigger with
its own sentence. (4) Activated with evidence prompt; assigned
copilot → claude-opus-5 (models-107-copilot-override-set.png);
trail carried 1× model_provider_added + status + assignment
changes, actor-stamped. (5) After the 60s TTL, Mandy answered ON
OPUS — inference_runs row copilot/claude-opus-5/ok through the
STREAMING seam (models-107-copilot-on-opus.png). (6) Cleared the
override; after TTL the next answer recorded
copilot/claude-sonnet-4-6 — the ruled map back in charge. The
round trip is the whole design proven: override wins, clear
restores, no deploy either way. (7) Refusals: scratch recruiter
(minted via the standing recipe — NEW TRAP: GoTrue chokes on
NULL token columns in hand-minted auth.users rows, "Database error
querying schema"; set the eight token/change columns to '' and
sign-in works) — browser no-access screen naming models:write
(models-107-recruiter-no-access.png), RLS 0/0/0 rows under forged
claims, registry INSERT refused by RLS, model_provider_added
refused "is an admin act" (42501); the Copilot Agent principal
refused identically on model_assignment_changed. (8) Teardown by
value, EXACT first pass: 9 drive trail rows (1 provider-added, 3
assignment-changed, 2 copilot_answered, 3 member_* from the
promote) deleted by id; scratch opus row; inference_runs swept;
rate_limit swept whole; scratch principal public-before-auth;
localStorage + cookies cleared both sessions. Fresh-statement
baseline: 26 users / 25 agents / 26 auth / 77 events / 5 skills /
5 versions / 2 projects / 2 clients / 1 candidate / 1 job_spec /
1 ops_heartbeat / 0 inference_runs / 0 rate_limit / 1 org / 0
invitations / 0 interview_plans / 0 client_interviews — PLUS the
ruled gains: model_providers 1 / provider_models 3 /
capability_assignments 0.

**Advisor residue (pre-existing, not this slice's):** the sweep's
other warnings (36 authenticated-executable definer fns, 6 mutable
search_path, 4 deny-all INFO = by design, leaked-password =
founder-owned standing item) predate 120 and stay with their
standing dispositions.

**Router programme state.** All four slices BUILT; 1–3 confirmed
law, slice 4 awaits the founder's word against THIS entry.
Escalation pairs (Part G, O.5) are now unblocked once §153
confirms. Q4 cross-provider spike stays deferred; adding a second
provider is a migration that widens adapter_kind WITH an adapter
behind it, never before. Numbers: next migration 122; next § 154;
next drive 108; vitest 1044; CHECK 89; door 22; allowlist 29;
anon roster 12; durable baseline gains model_providers 1 /
provider_models 3 / capability_assignments 0.

## 154. §153 CONFIRMED — SLICE 4 CLOSES — THE ROUTER PROGRAMME IS COMPLETE — 2026-08-25

The founder's written word ("confirmed") lands against §153 as
drafted. SLICE 4 IS CLOSED and the LLM ROUTER PROGRAMME IS
COMPLETE: all four slices of the ruled review (8649cdd) are law —
§147 the seam + map + inference_runs, §149 copilot conversation
caching, §152 evals + the ruled flips, and now §153 the Part R
model registry: migrations 120 + 121, the structural activation
gate (benchmarking → active-with-evidence → assignable; the eval
harness's pass is the door), the override-wins/map-governs read
path with its 60s TTL and code-map fallback, `models:write` and
the /app/settings/models console, CHECK 89 / door 22, and drive
107's live round-trip proof. The six J-decisions of gate 1885da9
are ruled as built: two-intent trail semantics with detail.kind;
zero-seed assignments; models:write admin-only over the whole
prefix; adapter_kind admits only 'anthropic' until an adapter
ships; pricing columns informational; the thinking rule.

What gates next, each on its own word: ESCALATION PAIRS (Part G,
per O.5 — parse_cv Economy→Standard, generate_evaluation
Standard→Premium, deterministic signals only, schema_failed live
to build on). Standing router residue unchanged: parse_cv
benchmark waits on founder CVs in evals/fixtures/cvs/; three Haiku
flips' first prod rows arrive in normal use; judge debts
(max_tokens 600 + fixture digest); Q4 cross-provider spike
deferred until in-family savings are exhausted — a second
provider is a migration that widens adapter_kind WITH an adapter
behind it.

Numbers at close: next migration 122; next § 155; next drive 108;
vitest 1044; CHECK 89; door 22; allowlist 29; anon roster 12;
durable baseline holds its registry gains (model_providers 1 /
provider_models 3 / capability_assignments 0).

## 155. CALL LOGGING CHEAP SLICE BUILT — drive 108 GREEN — 2026-08-26 — DRAFTED, AWAITS CONFIRMATION

The founder's word ("lets do it", choosing this slice as next
priority) landed against the gate as drafted (adbb05f,
2026-08-25-call-logging-gate.md), the six J-decisions taken as
recommended. Frame: live telephony (Twilio) stays DEFERRED by the
founder's earlier word; its needs-checklist is recorded in memory.
Nothing here is law until the founder confirms THIS entry.

**Migration 122 (call_audio).** The `call-audio` bucket on the cvs
precedent: private, 50MB, seven audio mimes, seeded ON CONFLICT DO
UPDATE; the org-first-segment storage.objects policy trio verbatim
(read/insert/delete), so uploads run under the SESSION client and
RLS is the enforcement. Four columns on BOTH note tables
(audio_path / consent_confirmed / transcript / transcript_error)
guarded by CHECKs, no triggers: no audio without consent
(consent-as-attestation, J.4 — the legal obligation stays the
founder's; the schema makes the claim recorded, not skippable);
audio only on note_type='call'; no transcript bookkeeping without
audio. All three doors SMOKED LIVE on apply, across both tables.
The trail deliberately unchanged (J.5): CHECK 89 / door 22 /
allowlist 29 / anon roster 12 all hold; the migration adds no
function, no grant, no principal — the 121 lesson had nothing to
bite.

**App.** `serverActions.bodySizeLimit: "50mb"` (J.6) — also
releases the LATENT 1MB ceiling Phase 0 found under the 10MB CV
upload (the defect §128's real-CV testing would have tripped).
Candidate side: consent-gated attachment on the composer AND the
LiveCallNotesModal (whose Whisper TODO this slice retires),
create-then-attach — an upload failure keeps the typed note and
says so; signed-URL playback minted per view. Client side: the
recording rides the existing FormData form on new call notes, same
consent gate; player + transcript block in the row. Deletion
hygiene (caught in build, fixed before the drive): a deleted note
takes its recording with it through the storage API under the
session's own org delete policy — SQL deletes on storage.objects
stay trigger-blocked. The transcribe seam
(src/lib/calls/transcribe.ts): Deep Infra Whisper (J.1,
marketplace discover-top) by env-var NAME (DEEPINFRA_API_KEY),
honestly absent without the key — no affordance rendered, refusal
sentence if reached; failures land in transcript_error (the
generation_error precedent) AND the toast; the transcript is DATA
on the note, feeds no AI loop and no trail (054's Art. 14 note
restated at the seam; J.2: the ASR stays OUT of model_providers).
vitest 1044 → 1054 (audio validation + seam proofs). Commits
71d5124 + 18b7b62; deployed mandate-dxrgzding.

**Drive 108 — GREEN, live in prod.** Pins at start:
candidate_notes 3 / client_notes 0 / call-audio objects 0.
(1) Candidate call note with a 1s probe WAV: consent gate VISIBLE
(file input disabled until attested — calls-108-consent-gate-
disabled.png), note landed with org-first audio_path +
consent_confirmed + duration, signed-URL player rendered
(calls-108-candidate-note-player.png). (2) Transcription's HONEST
ABSENCE proven — no key in Vercel, no Transcribe button, transcript
columns null (the 142 null-result precedent; the key-absent refusal
sentence is unit-pinned). (3) Client call note same path, player
rendered (calls-108-client-note-player.png). (4) The three CHECK
refusals stand as the apply-time smokes (live prod DB, both
tables); bucket mime/size limits are platform-enforced config, the
cvs precedent. (5) Teardown BY THE PRODUCT: both notes deleted
through the UI and the bucket went to ZERO on its own — the
deletion-hygiene path proved itself; counts back at the pins
fresh-statement (3 / 0 / 0), probe WAV removed, sessions signed
out with localStorage cleared. NOTE: candidate_notes' durable 3 are
pre-existing rows, pinned per-drive — still not baseline members.

**Founder-owned residue (surfaced once):** provision Deep Infra
when transcripts should go live (`vercel integration add
deepinfra`, billed; the key lands as DEEPINFRA_API_KEY and the
buttons appear on the next render — no deploy). First LIVE
transcription then wants a one-shot verification that the
provider's endpoint shape holds (the seam is fetch-based and
mock-pinned; drive it once with the key present). Twilio slice
parked with its checklist in memory.

Numbers: next migration 123; next § 156; next drive 109; vitest
1054; CHECK 89 / door 22 / allowlist 29 / roster 12; durable
baseline unchanged (call-audio objects 0 durable; note tables stay
pinned per-drive, not baseline).

## 156. ESCALATION PAIRS BUILT — drive 109 GREEN (null result) — 2026-08-26 — DRAFTED, AWAITS CONFIRMATION

The founder's word ("For section G confirmed the three points")
landed against gate ef832fc. The two ruled hops are live. Nothing
here is law until the founder confirms THIS entry.

**No migration** — `inference_runs.escalated_from` had waited since
118; `buildRunRow` widened from hardcoded null. **model-map.ts**:
ESCALATION_PAIRS tripwire-pinned — parse_cv haiku-4-5→sonnet-4-6
DORMANT behind the from-guard (arms itself when the Haiku flip
lands on the founder's CV benchmark), generate_evaluation
sonnet-5→opus-5 live (G.2 ruled: opus-5 unbenchmarked is
acceptable as a FAILURE-PATH fallback — it fires only after
sonnet-5 already failed the deterministic gate, and its answer
passes the same validation before acceptance). **inference.ts**:
runInference and the hop share ONE call body (callModel) so
telemetry cannot drift; a WeakMap twin (runModelByResponse) records
what actually ran; escalateInference marks the failed run
schema_failed then refuses under MANDATE_EVAL / no pair /
from-mismatch (a founder registry override DISARMS a pair), else
ONE hop of the identical request — no thinking param, escalated_from
recorded. **Both seams**: catch → hop → same extraction → a second
failure marks and rethrows the ORIGINAL error (G.3: one hop, then
090's honesty, byte-identical to pre-slice behavior on every
refusal path). vitest 1054 → 1060 (tripwire + five hop proofs:
fired with identical request and escalated_from; from-guard dormant
parse_cv; override-disarm; no-pair; eval-fence). Commit b66ff57;
deployed mandate-c9iw66802.

**Drive 109 — GREEN, the null result is the pass (142 precedent).**
The fire path cannot be forced in production; it is mock-pinned.
Live: the standing candidate's evaluation REGENERATED through the
wired seam — claude-sonnet-5, escalated_from NULL, ok, 32,177 in /
3,461 out / 31.9s — the happy path unchanged by the wiring.
Teardown exact: evaluation restored BYTE-IDENTICAL via the
sibling-key snapshot (md5-verified before and after), snapshot key
dropped, inference_runs swept to 0, the regenerate's trail event
swept by value (events 77), session signed out with localStorage
cleared. The first REAL fired hop will announce itself in
inference_runs (escalated_from NOT NULL) in normal use — residue,
not re-driven.

**The router thread is now fully built**: programme (§154) +
escalation pairs. Remaining router residue unchanged: parse_cv
benchmark on founder CVs (which also arms its pair), judge debts,
Q4 deferred. Numbers: next migration 123; next § 157; next drive
110; vitest 1060; CHECK 89 / door 22 / allowlist 29 / roster 12;
durable baseline unchanged.


## 157. §155 AND §156 CONFIRMED — CALL LOGGING AND ESCALATION PAIRS CLOSE — 2026-08-26

The founder's written word ("I CONFIRM BOTH") lands against §155
and §156 as drafted — one word, one entry.

**§155 is law.** The call-logging cheap slice closes: migration 122
(call-audio bucket on the cvs precedent, consent-CHECKed audio
columns on both note tables, no trail change), signed-URL playback,
create-then-attach with deletion hygiene through the storage API,
the Deep Infra transcribe seam honestly absent without its key,
bodySizeLimit 50mb (which also released the latent CV ceiling).
Drive 108 green; vitest 1054 at its close. Founder residue stands
as surfaced: provision Deep Infra to light transcripts (then one
live endpoint-shape verification); Twilio parked WITH its
needs-checklist in memory.

**§156 is law.** Escalation pairs close and THE ROUTER THREAD IS
FULLY BUILT — programme (§154) + the two ruled hops:
generate_evaluation sonnet-5→opus-5 live on the deterministic
schema signal, parse_cv haiku-4-5→sonnet-4-6 DORMANT behind the
from-guard until the founder's CV benchmark lands the Haiku flip.
One shared call body, escalated_from recorded, refusal paths
byte-identical to pre-slice. Drive 109 green (null result = the
pass). Router residue unchanged: parse_cv benchmark on founder CVs
arms the dormant pair; the first real fired hop announces itself
in inference_runs; judge debts; Q4 cross-provider spike deferred.

What gates next on its own word: the INVOICING + PRINT programme
(gate 5f2820d), slice by slice.

Numbers at close: next migration 123; next § 158; next drive 110;
vitest 1060; CHECK 89; door 22; allowlist 29; anon roster 12;
durable baseline unchanged.

## 158. INVOICING SLICE 1 BUILT — drive 110 GREEN — 2026-08-26 — DRAFTED, AWAITS CONFIRMATION

The founder's word ("Build slice 1 on THIS word", all six D-decisions
of gate 5f2820d taken as recommended) landed against the committed
gate. The invoice domain, the template studio, the builder and the
print path are live. Nothing here is law until the founder confirms
THIS entry. Slices 3 (print pass) and 2 (send) each wait on their own
word — sequence 1 → 3 → 2 as ruled.

**Migration 123 (applied; six doors smoked live on apply).** The
`invoice-assets` bucket (private, 2MB, PNG/JPEG/WebP — no SVG, a logo
that can carry a script is not a logo; the org-first policy trio
verbatim). Three tables on the house shapes: `invoice_templates`
(admin-write, the org's billing identity in structure jsonb — B.3:
there is nothing to join — plus a `numbering_next` counter taken FOR
UPDATE at issue), `invoices` (draft|issued|void ONE-WAY door, the 037
trigger family + transaction-local flag; bill_to and from_snapshot
frozen at issue; number unique per org, minted at issue, drafts
unnumbered per D.2; totals trigger-maintained on drafts and frozen at
issue; issued/void rows undeletable — a numbered document is a
record), `invoice_lines` (label/amount/currency SNAPSHOTTED from the
fee line — no new money math anywhere; placement_id + fee_line_id ON
DELETE SET NULL provenance; one currency per document, gate §C).
`issue_invoice` SECURITY DEFINER (the counter lives on the
admin-write template; the body re-states org + both capability
halves), `void_invoice` SECURITY INVOKER (RLS does the work, the
function only carries the flag). RLS: 050's split verbatim — SELECT
can_read_fees(), writes can_write_mandates(); template writes
is_org_admin() (D.1: NO new capability). Trail: CHECK 89 → 92, intent
door 22 → 25 — the three invoice intents are fee-writer-gated
(can_read_fees AND can_write_mandates) and land at 'fees' visibility,
the ONE intent family not at 'org', which is the only reason amounts
ride the detail (D.3). Allowlist stays 29; anon roster stays TWELVE
(guards revoked at birth per the 121 lesson; advisor sweep clean
after pinning search_path on the three trigger guards; the
issue_invoice definer WARN is the intended door).

**App.** Template studio at /app/settings/invoice-templates
(org:manage route rule + nav child, Skills-pattern surface;
create-then-attach logo through the session client; delete takes the
logo through the storage API first — the call-audio hygiene). Builder
at /app/placements/invoices (fees:read route rule — behind auth, NOT
the proxy allowlist; nav child under Placements, which stays an exact
match so the two never light together): pick client + template →
draft opens on the client's EARNED, un-invoiced fee lines
(candidate + mandate named per line) → lines land with snapshotted
label/amount, labels editable, free lines, reorder → issue. A line on
a live invoice shows "Billed" in the builder query — void releases it
(B.1, a query rule, not a constraint). The invoice page IS the A4
document (§133 one-renderer, .m-report-doc rebinding shared with the
EI report); drafts watermark themselves unnumbered; openMailDraft
pointer on issued invoices (subject + dates + total + payment
instructions, ceiling-tested). Sample invoices labelled per the
standing law; both dynamic routes handle sample ids (the routes.test
rule). vitest 1060 → 1075; tsc/eslint/build green. Commits c08aba5 +
1cb7b72 + 9a7e2db; deployed mandate-8ie0gucah.

**Two defects found live in drive 110, both fixed in the drive:**

*F-1 (latent, production, pre-existing).* The composite `_in_org` FKs
(111/112) gave placements a SECOND path to candidates, projects and
clients — and PostgREST refuses an ambiguous embed outright. Every
bare embed on placements silently nulled: /app/placements showed the
SAMPLE over a REAL placement, and the builder offered nothing. All
three embed sites now name their FK
(candidates!placements_candidate_id_fkey, …). LESSON, standing: any
table that gains a composite `_in_org` twin breaks every bare embed
pointing at it — name the FK in every new embed.

*F-2 (mine, caught by the teardown).* ON DELETE SET NULL is an
UPDATE, and it fires the frozen row's own immutability guard —
deleting the drive's template was REFUSED by the issued invoice
pointing at it, contradicting the ruled "an issued invoice outlives
its template". Migration 124 (applied): both guards admit exactly ONE
edit shape — a provenance FK going NULL with every other column
byte-identical (invoices: template/client/created_by; lines:
placement/fee_line). Proven live both ways: issued edits and
provenance+payload smuggling still refused; the template then deleted
through the product and the issued document rendered IDENTICALLY from
its own snapshot.

**Drive 110 — GREEN, live in prod.** Pins at start: invoices 0 /
lines 0 / templates 0 / invoice-assets 0 / events 77. No placement
existed, so a scratch placement + retained fee + two EARNED lines
(15k + 30k USD) were minted by the standing recipe (candidate stage
snapshotted first — the placement trigger moves it). (1) Template
"Standard letterhead" with logo, full billing identity, prefix
INV-2026-, studio previews "next INV-2026-0001"
(invoices-110-template-created.png). (2) Draft for RBC Capital
Markets: both earned lines pulled on, source lines flipped to
"Billed" live, bill-to typed, totals US$45,000
(invoices-110-draft-built.png). (3) ISSUED: INV-2026-0001 minted,
issue 2026-08-26 / due 2026-09-25 (30d), snapshot frozen
(invoices-110-issued-document.png); builder collapsed to
print/mail/void — the UI immutability. (4) SQL immutability on the
REAL row: edit and delete both refused (and re-proven after 124).
(5) Print probe under emulated print media: ONLY the document
renders, ink on paper — chrome, rail and builder all gone
(invoices-110-print-probe.png). (6) Non-money-role: forged agent
claims saw ZERO rows across invoices/lines/templates AND the
fees-tier trail; the intent door refused the agent
(insufficient_privilege) and issue_invoice refused the org-less
principal. Trail proven: invoice_created + invoice_issued at 'fees'
visibility, actor-stamped, amounts in detail. (7) The
outlives-its-template proof (invoices-110-outlives-template.png).
Teardown: template deleted BY THE PRODUCT (logo object went with it,
bucket 0 on its own), invoice swept by the ruled flag path, scratch
placement family by value, candidate stage restored to 'found', the
teardown's own placement_deleted event swept by value, rate_limit
swept whole per zero baseline; sessions signed out with BOTH stores
cleared. Every pin fresh-statement: events 77, users 26 / agents 25 /
auth 26, all four invoice surfaces durable ZERO — the baseline GAINS
invoices 0 / invoice_lines 0 / invoice_templates 0 / invoice-assets
objects 0 as members.

**Deliberately not in this slice** (§C of the gate, unchanged):
Stripe/payments parked LAST · credit notes · FX on the document ·
portal visibility · agent involvement · editing issued invoices.
Slice 2's day-one half (mailto pointer) shipped here; REAL send still
gates behind the from-address and client-comms rulings.

Numbers: next migration 125; next § 159; next drive 111; vitest
1075; CHECK 92; door 25; allowlist 29; anon roster 12; durable
baseline gains the four invoice zeros, all else unchanged
(candidate_notes/client_notes stay pinned per-drive at 3/0).

## 159. §158 CONFIRMED — INVOICING SLICE 1 CLOSES; slice 3 and the embed sweep proceed on the same word — 2026-08-26

The founder's written word ("I confirm all on my side") lands against
§158 as drafted. SLICE 1 OF THE INVOICING + PRINT PROGRAMME IS
CLOSED and law: migrations 123 + 124, the invoice domain with its
one-way door, the template studio at org:manage, the builder at
fees:read, the §133 one-renderer print path, the mailto pointer, the
trail at CHECK 92 / door 25 with the invoice intents at 'fees'
visibility, and drive 110's live round trip — INV-2026-0001 issued,
immutability refused in SQL and UI, print probe exact, the agent
fence proven at zero rows, and the document proven to outlive its
template. The two defects found in that drive are law as fixed: the
ambiguous-embed class (F-1, pre-existing production) and the
referential SET NULL vs the frozen door (F-2, migration 124).

The same word carries the programme's ruled sequence forward: SLICE
3 (the print pass) proceeds on the inventory confirmed at D.5, and
the EMBED SWEEP proceeds as the generalisation of F-1 — that defect
was found by accident under one table, and a class found by accident
is not a class that has been looked for. Slice 2 (real send) still
gates separately: it needs three founder rulings that are not
derivable from the code (the from/reply-to identity for client-facing
mail, whether client email joins 099's candidate-scoped cap and log
doctrine, and bounce handling), so its GATE is drafted here and its
BUILD waits on those rulings.

Numbers at close: next migration 125; next § 160; next drive 111;
vitest 1075; CHECK 92; door 25; allowlist 29; anon roster 12;
durable baseline holds its four invoice zeros.

## 160. EMBED SWEEP + GRANTS PASS COMPLETED + SLICE 3 (THE PRINT PASS) — drive 111 GREEN — 2026-08-26 — DRAFTED, AWAITS CONFIRMATION

The founder's word ("resolve everything we need from above list")
carried §159's authorisation into three pieces of work. Nothing here
is law until the founder confirms THIS entry.

**1. The embed sweep — the F-1 class, looked for rather than
stumbled on.** Drive 110 found ONE ambiguous embed by accident. This
enumerated the whole class: 88 table pairs carry more than one FK
path, because 111/112 gave most domain tables a composite `_in_org`
twin beside the plain FK. Sweeping the source against that list found
a second LIVE defect — `src/lib/okrs/progress.ts` read
`placement_fee_lines → placements!inner(project_id)`, and **`!inner`
is a JOIN-TYPE modifier, not an FK hint**. The query was ambiguous,
PostgREST refused it, the error was swallowed into `[]`, and a
mandate-scoped FINANCIAL key result reported ZERO progress however
much had actually been billed. Proven at the protocol level in drive
111: the bare form returns HTTP 300 / PGRST201 naming both paths, the
FK-named form returns 200. New structural guard
(`embed-ambiguity.test.ts`) pins the pair list with its regeneration
SQL, walks the tree, refuses to count `!inner`/`!left` as
disambiguation, and carries a control assertion; mutation-tested
against the real defect (fails on it, passes on the fix).

**2. Migration 125 — the grants pass completed.** The pre-launch
advisor sweep found the anon roster at TWENTY-THREE executable
functions where the ruled law says TWELVE. The ruled twelve are
intact and untouched (six candidate-portal doors, the limiter, the
webhook, the cron, three token verifiers — all definer, all
load-bearing for sessionless routes). The eleven that no ruling asked
for are closed: TEN trigger functions that were anon-executable over
PostgREST (110's doctrine, 121's lesson — a trigger function has no
caller; the machinery invokes it as table owner) and `can_write_okrs`,
a capability predicate 107 created without the revoke every other
predicate has carried since 046. Six functions also gained a pinned
`search_path`. Fresh-statement after: anon-executable = 12 EXACTLY.

**3. Slice 3 — the print pass**, on the D.5 inventory confirmed at
§159. One shared `PrintReportButton` now replaces the route-local
original AND the byte-identical copy the invoice builder had inlined
— the drift had already started. §133 is extended with a print SCOPE,
because four of the six documents are panels on workspaces carrying a
dozen other panels: the button marks the document and CSS removes
everything that is not the document, not inside it, and not one of its
ancestors (`:has()` is what makes the ancestor test expressible).
`Panel` gains an opt-IN `printId` — opt-in, not automatic, because
most panels are working surfaces and a print button on a queue offers
paper for something nobody would print. All six opt in: triangulation,
company intelligence, culture, the evaluation report (BESIDE its
@react-pdf export, not replacing it — two exports, two guarantees),
the client-interview approved set, and the shortlist slate (the slate
only: the pool column is a working surface, height-locked to the
viewport, and meaningless on paper). New print-contract test:
`window.print()` may be called from exactly ONE file, every `scopeId`
must resolve to a real id, and every print target must carry
`m-report-doc`.

vitest 1075 → 1082; tsc / eslint / build green. Commits after §159:
the sweep + 125 + slice 3, then the in-flow scope fix. Deployed
mandate-kmjzp8oie.

**Drive 111 — GREEN, live in prod, and it found two things.**
(1) The scoped print proved exact on the company-intelligence report:
the document and its contents visible, the culture sibling, the page
heading and the rail all `display: none`, ink on paper (white ground,
#14161c text), page height collapsed to the document (3213px body
against a 3147px document). (2) The OKR embed defect and its fix
proven at the PostgREST protocol level, as above. (3) The conditional
affordances proved honest: a project with no reports renders no print
button, and an empty shortlist slate renders none either — the target
and its ink class are present, the button is not.

**Two defects found IN the drive, both fixed in it:**

*F-1 — a stale Vercel build cache served CSS without the new rules.*
The JS from the deploy was live (the print buttons rendered) while the
stylesheet was the previous build's, so the scope silently did nothing
and every sibling stayed visible. `vercel deploy --prod --force` (no
build cache) shipped it. LESSON, standing: **a Vercel deploy can ship
new JS against cached CSS — after any `globals.css` change, verify the
rule reached the served stylesheet, or deploy with `--force`.**

*F-2 — the first scope implementation printed blank pages.* Hiding by
`visibility` kept the hidden boxes in layout, so the document was
followed by several blank sheets; lifting the scope out of flow to fix
that left the page as tall as the workspace behind it. Rewritten to
remove the other boxes from layout entirely, which collapses the page
to the document. The body also gained a white ground — the shell is a
dark terminal and printed as a black sheet wherever the document did
not reach. Both were only visible ON PAPER, which is the argument for
driving a print pass rather than unit-testing it.

**Teardown exact.** The drive only read; its residue was sign-in
buckets, swept whole per the zero baseline. All pins fresh-statement:
events 77, users 26 / agents 25 / auth 26, skills 5, objectives 0,
clients 2, candidates 1 at stage 'found', ops_heartbeats 1,
inference_runs 0, all four invoice surfaces 0, anon-executable 12.

**Slice 2 (send) — GATE DRAFTED, build still waits.**
`2026-08-26-invoice-send-gate.md`. Phase 0 verified: the Resend
transport is live and already used by three senders; `send-policy.ts`
(099) is CANDIDATE-scoped by design; the delivery webhook verifies its
svix signature before the database hears anything and refuses without
`RESEND_WEBHOOK_SECRET`, which is NOT provisioned; and the invoice has
no server-side PDF, because §133 put the renderer in the browser on
purpose. FIVE decisions are the founder's and none is derivable from
the code — the from/reply-to identity and whether it is per-template,
whether client email joins 099's cap doctrine (recommended: log and
honour suppression, but no per-day caps — a client owed three invoices
should receive three), attachment vs link vs recruiter-attaches
(recommended: the third for now, since a server-side renderer
reintroduces exactly the divergence the one-renderer rule prevents),
resend history vs a moving stamp, and whether to ship with the bounce
path honestly dark.

Numbers: next migration 126; next § 161; next drive 112; vitest 1082;
CHECK 92; door 25; allowlist 29; anon roster 12 (now exactly the ruled
twelve); durable baseline unchanged.

## 161. INVOICING SLICE 2 BUILT — SEND — drive 112 GREEN — 2026-08-26 — DRAFTED, AWAITS CONFIRMATION

The founder's word ("I confirm §160 — now build slice 2 send") lands
against the gate drafted inside §160, whose Part D carried a
recommendation for each of the five decisions; those recommendations
are taken as the ruling and are recorded as such below. Nothing here
is law until the founder confirms THIS entry. **THE INVOICING + PRINT
PROGRAMME IS NOW BUILT END TO END** — slice 1 (domain, builder,
print), slice 3 (the print pass), slice 2 (send).

**Migration 126 (applied).** `invoice_deliveries`: one row per send,
to/from/subject SNAPSHOTTED like everything else in this family. RLS
is the fee split with NO user UPDATE and NO user DELETE — a delivery
is a record; the only writer after insert is the webhook's definer,
and the only deletion is the invoice cascade. The delivery resolver
now reaches invoices: `candidate_outreach` is tried first and still
wins, an invoice delivery is looked up only when no outreach row owns
the message id, and suppression behaves identically on both sides
(a bounced client address damages the sending domain exactly as much
as a bounced candidate one). Trail CHECK 92 → 93, intent door 25 → 26;
`invoice_sent` joins the fee-writer gate at 'fees' visibility. The
anon roster stays EXACTLY TWELVE — 126 re-declares an existing member
(`record_email_delivery_event`), it does not add one.

**The five rulings, as built.** D.1 — the from identity lives on the
TEMPLATE, not in env: `RESEND_FROM` is the product writing to its own
users, an invoice is the agency billing its client. `lib/email/send.ts`
gained a per-message `from` override, and `escapeHtml` split into
`lib/email/escape.ts` so the renderer stays client-safe. D.2 — a
SEPARATE ladder (`lib/invoices/send-policy.ts`), not a flag on 099's:
the candidate caps exist because volume is the harm to someone who
never asked to be contacted, and a client owed three invoices should
receive three; suppression DOES cross over. A test walks the entire
ladder and pins that NO branch can refuse for volume. D.3 — the email
carries the invoice, not a second layout: no server-side PDF, because
§133 put the renderer in the browser so an export cannot disagree with
the screen. The email renders the SAME frozen row in a different
medium with no arithmetic at all — pinned by a test that feeds it a
total disagreeing with its own lines and asserts the STORED figure
wins. D.4 — every send is kept. D.5 — the bounce path is wired and
dark: `RESEND_WEBHOOK_SECRET` is still unprovisioned and the route
already refuses without it, so nothing arrives today and nothing needs
a migration when it does.

A refused send still writes a `failed` delivery row: "we tried and it
bounced" is a different fact from "nobody ever sent this". The trail
event is written ONLY on success. vitest 1082 → 1096; tsc / eslint /
build green. Commit 0f64724; deployed mandate-6cmz93wxf (`--force`,
per §160's CSS-cache lesson).

**Drive 112 — GREEN, live in prod, with a REAL email sent.**
(1) HONEST ABSENCE proven first: a template with no billing address
issued D112-0001, and the Send panel rendered with the explanation, NO
send button, and the mailto fallback still offered. (2) The
no-double-billing rule stopped the drive itself — the second invoice
had no line to add because the first had claimed it; voiding
D112-0001 released it, re-proving that path from the product. (3) A
template WITH `billing@getmandate.io` issued D112S-0001 and SENT it
live through Resend to the founder's own inbox: delivery row `sent`
with a provider message id, from/to/subject snapshotted, recipient
resolved from the client's own contact list. (4) `invoice_sent`
landed on the trail at 'fees' visibility, actor-stamped, carrying
number + recipient + total. (5) The AGENT fence held on the new
intent (`insufficient_privilege`) and agents saw ZERO delivery rows.
(6) D.5's resolver exercised directly: it matched the INVOICE
delivery by message id, flipped it to `bounced`, and wrote the
suppression. (7) The suppression refusal then fired in the UI on a
re-send attempt, with its exact sentence — and BEFORE any provider
call, so no second delivery row was written (deliveries stayed 1,
sent events 1).

**Teardown exact.** Invoices swept by the ruled flag path (lines and
deliveries by cascade), templates, the scratch placement family and
contact, the probe suppression, the drive's trail rows, candidate
stage restored to 'found', rate_limit swept whole. All pins
fresh-statement: events 77, users 26 / agents 25 / auth 26, clients 2,
candidates 1 at 'found', skills 5, ops_heartbeats 1, inference_runs 0,
suppressions 0, client_contacts 0, and all FIVE invoice surfaces at
durable ZERO. anon-executable 12.

**Founder-owned residue for send, surfaced once:** the drive sent from
`billing@getmandate.io` because that domain is already verified — if
invoices should come from the agency's own domain, that domain needs
verifying with Resend and the address setting on each template.
`RESEND_WEBHOOK_SECRET` still unprovisioned, so delivery feedback
stays dark until it lands.

Numbers: next migration 127; next § 162; next drive 113; vitest 1096;
CHECK 93; door 26; allowlist 29; anon roster 12; durable baseline
gains invoice_deliveries 0.

## 162. §161 CONFIRMED — SLICE 2 CLOSES — THE INVOICING + PRINT PROGRAMME IS COMPLETE — 2026-08-26

The founder's written word ("I confirm §161") lands against §161 as
drafted. SLICE 2 IS CLOSED and **THE INVOICING + PRINT PROGRAMME IS
COMPLETE**: all three slices of gate 5f2820d are law.

- **§159 — slice 1**: migrations 123 + 124, the invoice domain with its
  one-way door, the template studio at `org:manage`, the builder at
  `fees:read`, the §133 one-renderer print path, the mailto pointer,
  and the trail at `fees` visibility.
- **§160 — slice 3**: the print pass across the six ruled documents,
  one shared print control, and §133 extended with a print scope so a
  panel on a busy workspace prints as itself. Carried with it the embed
  sweep (which found the OKR financial-progress defect) and migration
  125's completion of the grants pass.
- **§162 — slice 2**: migration 126, `invoice_deliveries`, the separate
  client send ladder, the frozen-row email, and the bounce resolver
  wired dark. Drive 112 sent a real invoice through Resend.

The five send decisions of the slice-2 gate are ruled as built: the
from-identity on the template rather than in env; a separate ladder
where the candidate volume caps deliberately do not cross over but
suppression does; the email as a second medium for the frozen row
rather than a second layout engine; every send kept; and the bounce
path wired and honestly dark until its secret lands.

**What this programme deliberately did NOT do, still standing:**
payments and Stripe (parked LAST by standing order, untouched), credit
notes and partial invoicing, FX conversion on the invoice, client-portal
invoice visibility, agent involvement of any kind, and editing an
issued invoice — void and reissue remains the only path.

**Founder-owned residue from the programme, surfaced and not nagged:**
a sending domain of the agency's own needs verifying with Resend if
invoices should not come from `getmandate.io`, and
`RESEND_WEBHOOK_SECRET` is still unprovisioned, so delivery feedback
stays dark by design rather than by accident.

With this closed, every agent-runnable line of the pre-launch checklist
is closed. What remains on it is founder-owned (real-CV testing, the
Turnstile keys, the service-role rotation, leaked-password protection,
the D4 monitor) plus Stripe, which is parked last.

Numbers at close: next migration 127; next § 163; next drive 113;
vitest 1096; CHECK 93; door 26; allowlist 29; anon roster 12; durable
baseline holds its five invoice zeros.

## 163. THE CLIENT PORTAL — SLICE 1 — THE CLIENT INTERVIEW REACHES THE SIGNED-IN DOOR — DRAFTED 2026-08-26

Gate `docs/superpowers/specs/2026-08-26-client-portal-gate.md` (commit
20a01e5), confirmed by the founder's written word the same day: "I
confirm the recommendations" — D1(b), D2(b), D3(c), D4(b), D5, D6(a),
D7(b). This entry covers **slice 1 only**; slice 2 (invoice
visibility) is unbuilt and gates on nothing further.

**The finding the slice corrects.** §144 closed the client-interview
slice with one answer door, the token path. What nobody noticed
through §144 and §145 is that the signed-in door was not merely
unable to answer — it could not SEE the question set at all.
`client-interview-section.tsx` documented three doors rendering the
approved set, read-only on two of them; doors one and two honoured
that, and `/portal/mandates/[id]` passed neither prop while
`portal_get_mandate` never selected from `client_interviews`. It
survived because nothing failed: an absent optional prop renders an
absent section, which looks exactly like a mandate with no approved
set. The product consequence was the inverted one — the ANONYMOUS
token holder could answer questions the named, active,
share-verified, grant-checked client could not.

**D2(b) needed no migration.** The gate asked for a real attribution
FK on the answer row and the build found one already there:
`feedback.submitted_by REFERENCES users(id)`, carrying
`guard_author_in_org('submitted_by')` since 057, which 068 taught to
admit an external principal of one of the org's clients. No new
column and no new foreign key, so `embed-ambiguity.test.ts` and its
AMBIGUOUS_PAIRS list are untouched by this migration — the one
standing obligation that did NOT come due.

**Migration 127, as built.** `feedback.answers_json` (nullable jsonb,
no FK) keeps the question-id → answer map the client actually typed;
D3(c) rules that re-answering REPLACES, and replacement without the
original in front of the author is a footgun — a client returning to
correct one answer would silently lose the other four, because
`composeClientInterviewContent` is lossy by design and re-parsing it
would be guesswork. A PARTIAL unique index on `(project_id,
submitted_by) WHERE feedback_type='client_interview' AND submitted_by
IS NOT NULL` bounds an attributed author to one answer per mandate;
the token door is exempt BY CONSTRUCTION, since it writes
submitted_by NULL and no unique index constrains a null — its answers
still accumulate and 069 D5's anonymity is unchanged.
`portal_get_mandate` gains two keys and nothing else: the APPROVED
set (drafts excluded in the WHERE) and the caller's OWN standing
answer, filtered on `auth.uid()` the way `portal_list_my_reviews`
filters — client_hr sees the mandate's question set, not a
colleague's answers to it. `record_portal_client_interview_answered`
is the session counterpart of 117's token twin: it takes no token,
runs under the CALLER's session so `can_view_portal_mandate()` and
`auth.uid()` mean what they say, and is granted to `authenticated`
rather than revoked from everyone. Two rate-limit buckets, caps as
data, Tier 1 fail-closed because the door triggers a paid interpreter
run.

**Counts held deliberately, and verified after apply:** anon roster
TWELVE (queried, exactly 12); agent allowlist 29; intent doors 26 —
externals go through SECURITY DEFINER RPCs, never the staff ladder;
activity CHECK 93, because a signed-in answer is the same FACT as a
token answer and differs only in attribution, which the trail already
carries in `actor_id`. `describe.test.ts` therefore never came due
either.

**One shared component, three doors.** `interviewAnswerToken` is
replaced by `interviewAnswerDoor` — one prop carrying path, whether
identity is already known, and the author's own previous answers. The
token door passes identityKnown false and keeps its name field and
its one-shot lock; the signed-in door passes true, is never asked for
a name, and never locks itself because the author can come back; the
founder preview passes nothing and stays read-only, which is the one
thing that surface must never stop being.

**New structural guard.** `portal-doors.test.ts` pins what each of
the three doors passes and that only the anonymous one asks for a
name. Mutation-tested three ways (drop clientInterview, drop the
answer door, flip identityKnown) — all three fail it. A type could
not have caught the original defect, because the prop is legitimately
optional for the preview's sake. `vitest.config.ts` gains the
`server-only` stub alias the eval harness has used since the router
slice, so server helpers are unit-testable at all. vitest 1096 →
1105; tsc / eslint / build green. Commit fcef82c; deployed
mandate-64ecod6j1.

**Drive 113 — GREEN, live in prod.** Fixtures: a scratch client, a
mandate shared to it, an APPROVED three-question set, and TWO
externals — Dana Hollis (client_hr) and Marcus Vane (hiring_manager,
deliberately ungranted). (1) The signed-in door RENDERS the set — the
residue closed, with no name field and SUBMIT disabled at zero
answers. (2) Dana answered two questions; the row landed attributed
to her, `answers_json` structured, content composed "From: Dana
Hollis" from her PROFILE, the trail event actor-stamped with
`door: 'portal'`, and the Feedback Interpreter ran. (3) A full page
RELOAD re-prefilled from `portal_get_mandate`, proving the prefill is
the database's and not React's. (4) Dana added the third answer and
UPDATED: still ONE row, the SAME id, now holding all three — the
footgun D3(c) would otherwise have had. (5) The ungranted Marcus got
404 on the direct URL and 403 from a forged console POST, refused
before any write. (6) Granted, his answer landed as a SECOND row —
per-person, not per-mandate — and his body's claim of
`hm_label: 'Dana Hollis'` was ignored: both the row and the composed
text say Marcus Vane. Two named clients now disagree about remote
working, which is exactly the signal D3(c) argued the interpreter
should see. (7) A stale interview id 409s; a body answering nothing
in the set 400s. (8) The fence table, probed at the definer level:
active external in; SUSPENDED external, a platform AGENT, and the
FOUNDER all refused at all three of can_view / get_mandate / answer —
069's "every branch fails closed", now including the two principals
this slice newly exposes a surface to.

**Teardown exact.** Trail rows swept by project, actor, target and
client before the domain rows; then feedback → grants → shares →
interviews → project → users (public before auth) → client, an
ordering the FKs dictated and which cost three refusals to find
(`feedback_submitted_by_fkey` has no SET NULL, so feedback outranks
its author). Probe function dropped. inference_runs and rate_limit
swept whole per their zero baselines. All pins fresh-statement: users
26 / agents 25 / auth 26, events 77, projects 2, clients 2,
candidates 1, feedback 3, client_interviews 0, mandate_shares 1,
mandate_grants 0, inference_runs 0, rate_limit 0, hm_reviews 4,
job_specs 1, skills 5, anon-executable 12.

**A note on the drive's record:** the browser evidence is the
accessibility snapshots, not screenshots — the MCP's relative save
path did not persist PNGs to either repo. The snapshots are the more
precise artefact and are what this entry cites.

Numbers: next migration 128; next § 164; next drive 114; vitest 1105;
CHECK 93; door 26; allowlist 29; anon roster 12; durable baseline
gains nothing — slice 1 adds a column and an index to an existing
table and no new countable surface.

**Slice 2 (invoice visibility) is NOT built.** D4(b)/D5/D6(a) are
ruled and waiting: issued and void only, lines cross, the existing
`PrintReportButton` path, `client_admin` only, no write path of any
kind. It needs migration 128 and its own drive.

DRAFTED — awaiting the founder's word. No completion declared.

## 164. §163 CONFIRMED — CLIENT PORTAL SLICE 1 IS LAW — 2026-08-26

The founder's written word ("I confirm §163") lands against §163 as
drafted. **Slice 1 of the client portal programme is CLOSED.** The
client interview reaches the signed-in door; the §144/§145
`portal_get_mandate` residue, open since 25 August, is closed and
struck from the founder-owned list.

What is law: migration 127; `feedback.answers_json` and the partial
one-answer-per-person index; `portal_get_mandate` carrying the
approved set and the caller's own answer;
`record_portal_client_interview_answered` as the session counterpart
of 117's token entry point; the single `interviewAnswerDoor` prop
across all three doors; and `portal-doors.test.ts` as a standing
structural guard. Drive 113's fence table is law with it: an active
external in, a suspended external / a platform agent / the founder
all refused at every call.

Numbers unchanged at close: next migration 128; next § 165; next
drive 114; vitest 1105; CHECK 93; door 26; allowlist 29; anon roster
12.

Slice 2 (invoice visibility) begins here on the gate's already-ruled
D4(b) / D5 / D6(a).

## 165. THE CLIENT PORTAL — SLICE 2 — INVOICE VISIBILITY — DRAFTED 2026-08-26

Gate `docs/superpowers/specs/2026-08-26-client-portal-gate.md` (commit
20a01e5), on the founder's confirmation of D4(b), D5 and D6(a). This
closes the gap §162 named when the invoicing + print programme
deliberately left it: a client admin can now see what their company
has been billed, and print it.

**Migration 128 — two RPCs and nothing else.** The 069 doctrine
governs: externals hold no base-table policy on `invoices` or
`invoice_lines`, both functions are reachable from a browser console,
and each returns what its page renders rather than the row it was
computed from. `portal_list_invoices` carries no snapshot at all, so
the index cannot leak the billing identity of an invoice the caller
never opens. `portal_get_invoice` strips `from_email`, `reply_to`,
`numbering_prefix` and the default terms out of `from_snapshot`, and
drops `placement_id` / `fee_line_id` from the lines — provenance is
the desk's, and a client has no use for the id of a fee line they
cannot look up.

**D5 as three rules in the WHERE clauses.** Issued and void only: a
draft is the desk thinking aloud and must never cross, and void must
cross because a client who saw an invoice is owed the fact that it
was cancelled. Lines cross: a total with no explanation invites
exactly the email the portal exists to prevent. The document renders
from the frozen snapshot, which every issued invoice already
guaranteed (123) — the portal inherits that rather than restating it.

**D6(a): `client_admin` only**, gated on `is_client_admin()` the way
069's grant ledger already gates itself. The route ALSO refuses by
role before it reads, so a hiring manager who types the URL gets the
same 404 as a page that was never built rather than an empty list
that confirms the surface exists.

**§133 crosses the desk/client boundary.** The portal mounts the SAME
`InvoiceDocument` the agency looks at. A second layout for the client
would be a second thing to disagree with — the exact failure the
print pass existed to end. `InvoiceDocument` gains an opt-in
`printId` (§160's Panel pattern) because the portal shell, unlike the
dashboard's, is NOT `print:hidden`: the document marks itself and the
scoped-print CSS drops the rest of the page.

**A guard hole found and closed in passing.** The scope id is written
as a LITERAL in both places on purpose. `print-report-button.test.ts`
pairs `scopeId="x"` against a declared `printId="x"` by SOURCE TEXT,
so the shared `const PRINT_ID` this page was first written with made
the new document invisible to the very guard that exists to catch a
dangling scope — it passed by not being seen. Mutation-tested after
the change: a typo'd `printId` now fails the suite. **Standing
lesson: a source-text guard only guards source text. A constant that
reads better can walk straight out from under one.**

**No write path of any kind** — not even a "seen" flag, which would
be a write to the invoice domain from outside the desk. Counts
unmoved and verified after apply: anon roster TWELVE, allowlist 29,
doors 26, CHECK 93 — nothing here writes, so nothing here trails.
vitest 1105 unchanged; tsc / eslint / build green. Commit 4ca39ff;
deployed mandate-703sejrc2.

**Drive 114 — GREEN, live in prod.** Fixtures: a scratch client, a
template, and three invoices in the three states that matter —
D114-2026-0001 issued at £42,000 over two lines, D114-2026-0002
issued then VOIDED at £18,500, and a £99,999 draft whose line was
labelled "must never reach the client". (1) The list shows exactly
TWO: the issued and the void. The draft is absent. (2) The issued
document renders in full from its frozen snapshot — letterhead,
bill-to, both lines, total, notes, payment instructions, footer. (3)
The void one renders too, under its own sentence: cancelled on this
date, not payable, kept because you may have received it. (4) **The
print outcome was verified under PRINT MEDIA, not assumed** — §160's
lesson that print bugs only show on paper. With the scope marks
applied, `getComputedStyle` under `emulateMedia({media:'print'})`
reports the portal header, footer, back link and print button all
`display: none` and the document `block` with its content intact: the
paper gets exactly the invoice. (5) The draft by direct URL 404s, and
the response body contains neither its amount nor its line label. (6)
The fence, probed at the definer level: client_admin sees 2 and the
issued document but NOT the draft; a **client_hr of the SAME client**
sees zero and gets NULL — D6(a) proven where it actually bites; a
platform AGENT, the FOUNDER as staff, and a SUSPENDED client_admin
all get zero and NULL on every call. (7) The minimal-crossing rule
checked field by field: exactly SEVEN structure keys reach the client
— billing_name, address_lines, company_number, vat_number,
payment_instructions, header_text, footer_text. `from_email`,
`reply_to`, `numbering_prefix` and the default terms do not.

**Teardown exact.** Trail rows first, then the invoices through the
RULED FLAG PATH — issued and void invoices are records and refuse
deletion, so `mandate.allow_invoice_transition` is the only way a
drive unwinds one (§158's rule, unchanged). Then template, users
(public before auth), client, probe functions, rate_limit swept
whole. All pins fresh-statement: users 26 / agents 25 / auth 26,
events 77, projects 2, clients 2, candidates 1, feedback 3,
client_interviews 0, mandate_shares 1, mandate_grants 0,
inference_runs 0, rate_limit 0, ops_heartbeats 1, anon-executable 12,
zero probe functions left, and ALL FIVE invoice surfaces plus
client_contacts and email_suppressions back at durable ZERO.

Numbers: next migration 129; next § 166; next drive 115; vitest 1105;
CHECK 93; door 26; allowlist 29; anon roster 12; durable baseline
gains nothing.

**With this, both slices of the client portal gate are built.** What
the programme deliberately did NOT do, still standing: slice 3 (the
client-visible trail), payments and Stripe, credit notes and partial
invoicing, FX on the invoice, agent involvement of any kind, and any
write path from the portal to the invoice domain.

DRAFTED — awaiting the founder's word. No completion declared.

## 166. §165 CONFIRMED — SLICE 2 CLOSES — THE CLIENT PORTAL PROGRAMME IS COMPLETE — 2026-08-26

The founder's written word ("I confirm §165") lands against §165 as
drafted. **SLICE 2 IS CLOSED and THE CLIENT PORTAL PROGRAMME IS
COMPLETE**: both slices of gate 20a01e5 are law.

- **§163/§164 — slice 1**: migration 127. The client interview
  reaches the signed-in door. `portal_get_mandate` carries the
  approved set and the caller's own standing answer;
  `record_portal_client_interview_answered` is the session
  counterpart of 117's token entry point; `feedback.answers_json`
  and a partial unique index make D3(c)'s one-answer-per-person an
  edit rather than a silent overwrite; one `interviewAnswerDoor` prop
  now serves all three doors.
- **§165/§166 — slice 2**: migration 128. `portal_list_invoices` and
  `portal_get_invoice` give a client admin the money, read-only:
  issued and void only, lines crossing, the frozen snapshot
  rendering through the SAME `InvoiceDocument` the desk uses, and no
  write path of any kind.

The seven decisions of the gate are ruled as built: the signed-in
door answers rather than merely reading; attribution is a real FK and
not a label (and needed no migration — 057/068 had already built it);
one answer per person which re-answering edits; invoices visible;
issued and void with their lines through the existing print path;
`client_admin` only; and the two slices shipped in that order.

**Both drives are law with them.** Drive 113's fence — an active
external in, a suspended external / a platform agent / the founder
refused at every call. Drive 114's — a client admin sees issued and
void but never the draft, and a `client_hr` of the SAME client sees
nothing at all, which is where D6(a) actually bites. Exactly seven
snapshot keys cross to the client; `from_email`, `reply_to` and the
numbering machinery do not.

**Two standing lessons this programme leaves behind.** First: **a
source-text guard only guards source text.** The shared constant the
portal invoice page was first written with made its print scope
invisible to `print-report-button.test.ts` — it passed by not being
seen. Write the literal, say in a comment that the duplication IS the
check, and mutation-test the guard before trusting it. Second, its
corollary, applied here: `portal-doors.test.ts` was mutation-tested
three ways before it was committed, because a guard nobody has
watched fail is not yet a guard.

**Pre-launch advisor sweep — CLOSED, null result.** Run after both
migrations, as the checklist's first line requires. Security: 56
lints, of which the 51 SECURITY DEFINER warnings ARE the 069 doctrine
rather than findings against it. The advisor's anon-executable set is
**exactly the ruled TWELVE, by name** — an independent confirmation
of a roster the house has counted by hand since 110. All four
functions this session touched are `authenticated`-only; none is anon
reachable. The four `rls_enabled_no_policy` INFOs are the deliberate
deny-all tables. Performance: 124 lints, all pre-existing classes —
the `multiple_permissive_policies` pairs are the 111/112 platform-agent
doctrine, and the `unused_index` INFOs are meaningless at three
feedback rows. The one actionable item, leaked-password protection,
was already founder-owned and is not restated here as new.

**One slip, found and corrected.** Migrations 127 and 128 were first
recorded in `supabase_migrations.schema_migrations` as
`portal_client_interview` and `portal_invoices` — without the numeric
prefix every predecessor carries, so neither row could be lined up
with its repo file. The `name` metadata was corrected in place;
versions untouched. **Standing rule: `apply_migration` takes the
NUMBERED name, or the database's own migration list stops agreeing
with `supabase/migrations/`.**

**What the programme deliberately did NOT do, still standing:** slice
3 (the client-visible trail — real but speculative, and it earns its
own gate once a client has actually used the portal); payments and
Stripe, parked LAST; credit notes and partial invoicing; FX on the
invoice; agent involvement of any kind — externals remain outside
`is_agent()` entirely; any write path from the portal to the invoice
domain, not even a "seen" flag; and any base-table RLS policy for
externals, because the 069 doctrine holds: **RPCs are the read
surface.**

Numbers at close: next migration 129; next § 167; next drive 115;
vitest 1105; CHECK 93; door 26; allowlist 29; anon roster 12; durable
baseline unchanged.

## 167. MARKETING PERFORMANCE — THE CLS CLIFF BELOW 412px — DRAFTED 2026-08-26

Gate `docs/superpowers/specs/2026-08-26-marketing-perf-gate.md` (commit
344e3f3), then a second founder ruling after the first approach was
built, measured, and failed. Both are recorded because the failure is
the more useful half.

**The premise the slice was opened on was stale.** §141 left a residual
"mobile LCP 3.5s — fonts + bundle, a later perf slice candidate". It
does not reproduce on either measurement method. Measuring before
drafting found something else.

**What was actually wrong.** Under APPLIED mobile throttling, cold, the
homepage measured CLS **0.116 at 390px** and **0.120 at 360px**, against
**0.011 at 412px**. The marketing faces arrived at ~2.8s, after first
paint; Fraunces replaced the fallback, the hero headline re-wrapped
from N lines to N−1, and everything below moved up ~59px. One reflow,
worth 0.100 of the 0.116.

**Why it hid for six weeks — two reasons, the second the important
one.** WIDTH: Lighthouse's default mobile emulation is a 412px Moto G,
on the good side of the cliff. SIMULATION: Lighthouse re-run **pinned
to 390px against the still-broken build STILL reported 0.007**, because
Lantern models a slow network over a fast trace — the font never
actually arrives late, so the swap never actually reflows. **Lighthouse
would have missed this at any width.** §141's 0.009 was true and blind
at the same time, and every iPhone from the 12 to the 16 is 390 or 393.

**What did not work, measured rather than assumed.** The first ruling
was D2(a)+(c): replace the hero's font-relative `46ch` measure with a
fixed one and reserve its box. Built, and it came out at **0.118
against a 0.116 baseline — nothing at all.** `.m-hero-trust` was a
passenger in the shift, not its driver; `ch` explained its own height
change and none of the 59px everything else travelled. Reverted, and
the finding put back to the founder rather than widening scope alone.

**As built, on the second ruling.** `display: "optional"` on Fraunces /
Hanken Grotesk / JetBrains: a ~100ms block period, then the fallback is
KEPT for the rest of that page load rather than swapping mid-view. No
swap, no re-wrap, no shift. And `preload: false` on the root layout's
Inter / Space Grotesk / JetBrains — measured on `/`, Hanken covers 256
elements, JetBrains 148 and Fraunces 64, while **Inter and Space
Grotesk cover ZERO**, yet all three were preloaded and downloaded,
competing for the critical path against the faces actually in use. That
was 101 KB of the homepage's 236 KB.

**Drive 115 — GREEN, live in prod.** Deployed mandate-9di90olo1 with
`--force`, and the rules VERIFIED in the served stylesheet before
measuring (§160's standing lesson): chunk `3o0cirz-q5goi.css` carries
the canary and 13 `font-display:optional` declarations; font preload
links in the HTML went 6 → 3.

| width | CLS before | CLS after | LCP after |
|---|---|---|---|
| 360 | 0.1203 | **0.0231** | 1832ms |
| 390 | 0.1157 | **0.0086** | 1828ms |
| 412 | 0.0111 | 0.0081 | 1720ms |
| 1440 | 0.0160 | 0.0117 | 1656ms |

Fonts 236 KB / 6 files → **166 KB / 4**. Lighthouse mobile (the D1(a)
LCP authority) 79 → **82**, LCP 5.1s → 4.5s, TBT 100ms → 30ms, CLS
0.011 → 0.006. Both authorities improved; D6's target (CLS < 0.05 at
360 AND 390, no LCP regression) is met on both.

**The accepted trade, honestly bounded.** `optional` means a slow first
load keeps the fallback face for that load. Checked in three scenarios
at 390px — slow-4G cold, unthrottled cold, and warm cache — and in all
three Fraunces and Hanken loaded and rendered. **The trade did not bite
at Slow-4G**; it would need a worse connection than that, which was not
tested and is not claimed either way.

**No teardown.** This slice touched no data — frontend only. Baseline
re-confirmed unchanged after the drive: users 26, events 77, rate_limit
0, invoices 0, inference_runs 0.

**D5 delivered: `scripts/perf-probe.mjs`.** Pins the WIDTHS
(360/390/412/1440) *and* uses applied throttling — both halves
load-bearing, since width alone would not have caught this. Carries a
`cssOk` canary that fails loudly rather than measuring an unstyled
page, exits non-zero if mobile CLS reaches 0.05, and is deliberately
NOT in CI because it needs the network. Adds `playwright-core` driving
the system Chrome, no bundled browser download.

**A trap that cost real time and is now standing law.** Mid-slice,
`npm run build` reported SUCCESS while emitting a **21-byte CSS chunk
with the entire marketing stylesheet missing** — served page had
`max-width: none` and rendered in Inter. It was stale `.next`
incremental state, not the edit: the identical code built correctly
after `rm -rf .next`. Measurements taken against it read 0.22 and sent
me chasing a nav-layout ghost. **A green build is not evidence the CSS
shipped — `rm -rf .next` first, then grep the served chunk.** This is
the local sibling of the Vercel cached-CSS lesson from §160: same
symptom, two different mechanisms.

Also re-learned: the shell cwd reset to the iCloud clone mid-session
and one build ran there. Absolute-path edits were unaffected. Check
`pwd`.


**The scoped-out routes, checked after the fact.** D4(a) deliberately
limited the change to the homepage hero, leaving nine other `ch`
measures — including `.m-page-hero__lede` (68ch) and
`.m-display--page` (20ch) on the sub-page heroes — untouched, on the
reasoning that only above-the-fold ones can cost CLS. Swept at 390px,
cold, applied throttling, after the deploy: `/pricing`, `/solutions`,
`/platform`, `/executive-intelligence`, `/handbook` and
`/request-access` all measure **CLS 0.0000**, LCP 1.6–2.2s, fonts 166
KB / 4 files (135 KB / 3 on `/request-access`). The remaining `ch`
measures no longer have a post-paint swap to react to, so they cost
nothing. Left as they are — deliberately, and now with evidence rather
than an argument.

Numbers: next migration 129; next § 168; next drive 116; vitest 1105;
CHECK 93; door 26; allowlist 29; anon roster 12; durable baseline
unchanged.

DRAFTED — awaiting the founder's word. No completion declared.

## 168. §167 CONFIRMED — THE MARKETING CLS DEFECT IS CLOSED — 2026-08-26

The founder's written word ("I confirm §167") lands against §167 as
drafted, including the post-deploy sweep appended to it. **The CLS
cliff below 412px is closed and the perf slice is law.**

What is law: `display: "optional"` on the marketing faces;
`preload: false` on the root layout's three, which the marketing
routes never render; CLS 0.116 → 0.0086 at 390px and 0.120 → 0.0231 at
360px, with fonts 236 KB / 6 files → 166 KB / 4 and Lighthouse mobile
79 → 82; the six scoped-out marketing routes measured at CLS 0.0000;
and `scripts/perf-probe.mjs` as a standing harness, with
`playwright-core` as its devDependency.

Three findings carry forward as standing law:

1. **Lighthouse cannot see this class of defect.** Pinned to 390px
   against the broken build it still reported 0.007, because Lantern
   simulates the slow network over a fast trace and the font never
   actually arrives late. Width *and* applied throttling are both
   load-bearing in the probe. A Lighthouse score is not evidence of
   layout stability.
2. **A green build is not evidence the CSS shipped.** `npm run build`
   reported success while emitting a 21-byte CSS chunk with the whole
   marketing stylesheet missing, from stale `.next` state. `rm -rf
   .next` first; then grep the served chunk. The local sibling of
   §160's Vercel cached-CSS lesson.
3. **Measure before drafting, and measure the fix.** The residue this
   slice was opened on (§141's "mobile LCP 3.5s") did not reproduce at
   all, and the first ruled approach was built and measured at 0.118
   against a 0.116 baseline — nothing. Both were caught by measuring
   rather than reasoning, and both changed what got built.

**Every agent-runnable line of the pre-launch checklist is closed
again**, now including the Lighthouse/mobile audit line that §141 left
with a residual. What remains is founder-owned (real-CV testing, the
Turnstile keys, the service-role rotation, leaked-password protection,
the D4 monitor, the Deep Infra and Resend items) plus Stripe, parked
last.

Numbers at close: next migration 129; next § 169; next drive 116;
vitest 1105; CHECK 93; door 26; allowlist 29; anon roster 12; durable
baseline unchanged.

## 169. THE HOMEPAGE SAYS WHAT THE PRODUCT DOES — DRAFTED 2026-08-26

Gate `docs/superpowers/specs/2026-08-26-homepage-truth-gate.md` (commit
bfb2e93), founder-confirmed on all five decisions. Opened by the
founder's own question — whether the site reflects what has been built —
which it did not, in two measurable ways.

**The roster was wrong by NAME, not merely stale.**
`_data/agents.ts` listed SEVENTEEN while `src/lib/agents/session.ts`
signs in TWENTY-FIVE. Five marketed agents were not platform
principals at all (Company Research, Onboarding, Executive Role
Architect, Interview Architect, Candidate Review); twelve live ones had
never been mentioned (Candidate Engagement, Candidate Relationship,
Candidate Research, Candidate Search, Company Intelligence, Culture,
Desk Digest, Evaluation, Executive Intelligence, Interviewer, Outreach
Strategy, Pre-Screen). Because `AGENT_COUNT` derives from that array,
the hero rail, the meta description, the OG card and `/platform`'s
phase map were mutually consistent and all wrong.

**The lesson, which is the reusable half.** `_constants.ts` was written
to end exactly this failure and DID — inside marketing. Deriving every
count from one array closed the drift between marketing surfaces and
left the boundary between marketing and the platform unwatched, so the
same class of error came back one level up. **A single source of truth
only ends drift below it.** Ask what watches the seam above.

**As built.** The roster is the real twenty-five, each entry carrying
the `kind` of the platform agent it describes. Names and one-line
outputs stay marketing's own — a client reads "Pre-Screen", not
`prescreen` — but the SET is no longer marketing's to drift (D1(b)).
`agent-roster.test.ts` joins the two and fails when the platform gains
or loses an agent the marketing file does not account for, with a
`NOT_MARKETED` escape so "we chose not to" is recorded as distinct from
"we forgot". Mutation-tested three ways — drop an agent, advertise a
phantom, describe one twice — and it also asserts the regex still
matches a non-trivial roster, so a shape change in `session.ts` cannot
make the guard silently vacuous. `ADDON_AGENT_COUNT` is derived too:
`/platform` had been saying "Three of the 17" as a typed word above a
list whose own flags disagreed.

**The arc (D3/D4).** One new section — `06 / After the slate` — saying
the three things the homepage had never said: the client reviews the
slate in their own portal, the search interviews the client back to
close the calibration gaps the brief left, and the placement bills
itself. Inserting it renumbered 06–10 to 07–11, from `_constants.ts`
and never retyped, which is what that file is for. The PIPELINE row is
EXTENDED rather than duplicated (…Recalibrate → Client portal →
Placement → Invoice), because the claim is one continuous system and
not a search tool with bolt-ons. The hero lede now says so above the
fold. The `<title>` had claimed "Operating System" for months; the body
has caught up.

**Drive 116 — GREEN, live in prod.** Deployed mandate-qbx5sx5nd with
`--force`. Homepage, `/platform`, the meta description and the OG card
all read 25 and agree; the add-on sentence renders "2 of the 25" from
the data; `06 / After the slate` and the extended pipeline row are
live. Perf probe green at all four widths — CLS 0.0086 at 390, 0.0216
at 360, fonts unchanged at 166 KB / 4 files, `cssOk` yes everywhere —
so §168 is not regressed by the new section. No horizontal overflow at
390 or 1440; eyebrows read 01 → 11 in order.

**No teardown** — frontend only, no data touched.

**One open question for the founder, surfaced not guessed.** The
previous roster marked three agents as Executive Intelligence add-ons;
all three were phantom names. I have marked the two I can justify —
Executive Intelligence and Triangulation — and left Company
Intelligence, Culture and Psychology as core, because I do not know
whether they are add-on-gated in the product. If they are, they need
`addOn: true` and the derived count corrects itself.

vitest 1105 → 1110. Numbers: next migration 129; next § 170; next drive
117; CHECK 93; door 26; allowlist 29; anon roster 12; durable baseline
unchanged.

DRAFTED — awaiting the founder's word. No completion declared.

## 170. §169 CONFIRMED — THE SITE AND THE PRODUCT AGREE AGAIN — 2026-08-26

The founder's written word ("I confirm §169") lands against §169 as
drafted. **The homepage now says what the product does, and a guard
keeps it that way.**

What is law: the marketed roster is the real twenty-five, each entry
joined to its platform `kind`; `agent-roster.test.ts` fails the build
when the platform gains or loses an agent the marketing file does not
account for, with `NOT_MARKETED` recording a deliberate omission as
distinct from a forgotten one; `ADDON_AGENT_COUNT` is derived rather
than typed; section `06 / After the slate` and the extended PIPELINE
row carry the story past the shortlist to the client portal, the
placement and the invoice; and the hero lede says so above the fold.
Drive 116 is law with it — every count on the homepage, `/platform`,
the meta description and the OG card reads 25 and agrees, and the perf
probe stayed green so §168 is intact.

**The standing lesson, and the reason this entry matters more than its
diff.** `_constants.ts` was written to end exactly this class of error
and DID — inside marketing. Deriving every count from one array closed
the drift between marketing surfaces, and left the seam BETWEEN
marketing and the platform unwatched. The same failure returned one
level up, and survived eight agent additions.

> **A single source of truth only ends drift below it. Whenever one is
> introduced, ask what watches the seam above it.**

That question is now answered for this seam by a test. It is not
answered for every seam in the product, and this is the second time in
two days that a guard-shaped hole has been the actual defect (the other
being §165's print scope, invisible to a source-text guard because it
used a constant).

**Founder-owned residue from this slice, surfaced and not to be
nagged:** whether Company Intelligence, Culture and Psychology are
gated behind the Executive Intelligence add-on. Only Executive
Intelligence and Triangulation are marked, so `/platform` currently
tells buyers "2 of the 25". If those three are add-on-only the sentence
understates what the add-on buys, and it is a pricing claim. Marking
them `addOn: true` corrects the derived count with no other change.

**A judgment recorded, not a task.** Asked whether the expansion was
needed, the honest answer is that the CORRECTION was non-negotiable and
the EXPANSION was defensible but not compelling: agent count is an
implementation detail that works only because it is paired with "one
accountable human". The surfaces deliberately left off the homepage
(call logging, OKRs, the model registry, skills) should stay off. The
real gap is not capability but PROOF and FIT — the homepage carries no
case study, customer, outcome number, named buyer, switching story or
guarantee, and `/solutions` names the buyer where the homepage does
not. That cannot be closed with invented evidence while there are no
clients; what can be leaned on is what is genuinely real — the live
simulator and the guardrails section — plus naming the buyer. **A
positioning slice, needing its own gate. Not started.**

Numbers at close: next migration 129; next § 171; next drive 117;
vitest 1110; CHECK 93; door 26; allowlist 29; anon roster 12; durable
baseline unchanged.

## 171. THE EXECUTIVE INTELLIGENCE ADD-ON SET, RULED AND CORRECTED — 2026-08-26

The founder's word closes the one question §169 left open and §170
carried as residue: **Company Intelligence, Culture and Client
Psychology ARE gated behind the Executive Intelligence add-on.**

Marked `addOn: true`. Because §169 made `ADDON_AGENT_COUNT` derived
rather than typed, `/platform` corrected itself from "2 of the 25" to
**"5 of the 25"** with no sentence rewritten — which is the entire
argument for deriving it, demonstrated one section later. Eight add-on
markers now render across the phase grid.

This was a **pricing claim, not cosmetics**: the page had been
understating what the Executive Intelligence add-on buys by three
agents, on the one surface a prospect reads before asking what it
costs. It was found only because §169's rewrite forced the question of
which agents were gated, and the previous answer ("three") turned out
to name three agents that did not exist.

Verified in prod (mandate-kl7v80767, `--force`): `/platform` reads 5 of
25, the homepage reads 25, the badges render. vitest 1110; tsc /
eslint / build green. No data touched, so no teardown.

Numbers: next migration 129; next § 172; next drive 117; vitest 1110;
CHECK 93; door 26; allowlist 29; anon roster 12; durable baseline
unchanged.

DRAFTED — awaiting the founder's word. No completion declared.

## 172. §171 CONFIRMED — THE HOMEPAGE THREAD IS CLOSED — 2026-08-26

The founder's written word ("I confirm §171") lands against §171 as
drafted. **Company Intelligence, Culture and Client Psychology are
Executive Intelligence add-ons, and `/platform` says so: 5 of the 25.**

With this the homepage thread opened by the founder's question — does
the site reflect what has been built — is closed end to end: §169 built
it, §170 made it law, §171 corrected the one claim §169 could not
answer without a ruling, and §172 closes that. The last founder-owned
residue from the thread is struck.

**What the thread leaves behind, beyond its diff:** a guard at the
marketing/platform seam (`agent-roster.test.ts`), two derived counts
that cannot be retyped (`AGENT_COUNT`, `ADDON_AGENT_COUNT`), and the
standing lesson that **a single source of truth only ends drift below
it** — ask what watches the seam above.

**Still open, and deliberately not started:** the positioning slice.
The site is now accurate on capability and empty on proof and fit — no
case study, customer, outcome number, named buyer, switching story or
guarantee — and that cannot honestly be closed while there are no
clients to point at. It needs its own gate and, more than that, it
needs a first client. Recorded as judgment, not as a task.

Numbers at close: next migration 129; next § 173; next drive 117;
vitest 1110; CHECK 93; door 26; allowlist 29; anon roster 12; durable
baseline unchanged.

## 173. TWO-PERSON APPROVAL FOR ADMIN GRANTS — DRAFTED 2026-08-26

Gate `docs/superpowers/specs/2026-08-26-two-person-admin-grants-gate.md`
(4e31a78), founder-confirmed D1(a)–D8. Opened by the founder's own
question — whether an admin can add other admins. They could, through
two doors, unilaterally and with immediate effect.

**D1(a), the threshold.** The rule engages only once an org has TWO OR
MORE active admins. Two-person control is arithmetically impossible
with one person, and every org — this one included, which has exactly
one staff user — starts there. The 1 → 2 transition is unprotected by
arithmetic, not by omission.

**D5, and the proof that matters.** Enforcement is in the database, not
the server action, because an admin holds a session and a browser
console. Proven live with three scratch admins: a direct PostgREST
`update users set role='admin'` is REFUSED by
`guard_user_privilege_changes`, and a direct `staff_invitations` insert
with `role='admin'` is refused by the new `guard_admin_invitations`.
The flow itself: propose → pending with the target unchanged; **the
proposer's own approval refused**; a second admin approves and the role
lands; the trail names both parties.

**TWO DEFECTS I INTRODUCED AND CAUGHT BY CHECKING** — both now recorded
in the migration's own header, because both are reusable:

1. **A new trigger function inherits EXECUTE for PUBLIC**, so
   `guard_admin_invitations` silently took the ruled anon roster from
   TWELVE to THIRTEEN. Caught only because the roster is counted
   immediately after every apply. A trigger function needs no direct
   EXECUTE by anyone.
2. **The four trail events were written at `'members'` visibility,
   which the database does not allow.** The column takes `org | fees |
   admin`; `members` is an APP-LEVEL UI scope in
   `src/lib/activity/types.ts` and I conflated the two. The visibility
   CHECK rejected every write and `write_activity_event`'s exception
   handler SWALLOWED it — the events simply never appeared, with no
   error anywhere. Caught by reading the trail back rather than
   trusting a fire-and-forget write. **A swallowed write is
   indistinguishable from a write that never happened; the only
   defence is to read it back.**

**Also:** `AMBIGUOUS_PAIRS` regenerated — `admin_grant_requests` holds
THREE foreign keys to `users` (target, proposer, decider), so the
members page names the FK explicitly rather than letting PostgREST
refuse the whole query. CHECK 93 → 97 with `describe.test.ts` bumped in
the same commit. Allowlist 29, doors 26, anon roster 12, all verified
after teardown.

**What was verified, and what was NOT.** The database layer and the
whole approval flow were proven live at the definer level, with exact
teardown (users 26 / agents 25 / auth 26, events 77, grant requests 0,
invitations 0, rate_limit 0, anon roster 12, zero probe functions).
**The members-screen UI — the pending-grants panel, the role picker's
"pending" outcome and the invitation refusal — was built, type-checked
and built green, but NOT exercised in a browser.** There is no drive
117 screenshot pass. That is the honest gap in this entry, and it is
the first thing to do before this is called law: with one admin in the
org the panel cannot even render a row without fixtures.

Deployed mandate-j6vwsfavk. vitest 1110; tsc / eslint / build green.

Numbers: next migration 130; next § 174; **drive 117 still owed**;
vitest 1110; CHECK 97; door 26; allowlist 29; anon roster 12.

DRAFTED — awaiting the founder's word. No completion declared.

### 173a. DRIVE 117 — RUN, AND IT EARNED ITS KEEP — 2026-08-26

The drive §173 said was still owed. It found **two defects in the UI
layer, both invisible to tsc, vitest, eslint and the build**, and both
of the exact class the database work had already been careful about.

1. **The role picker lied.** Promoting Rae through the UI produced the
   toast *"Rae Recruiter is now Admin."* — over a request that was
   merely PENDING. The tier had not moved and a colleague still had to
   agree, but the proposer was told the job was done. The action
   already returned the outcome; the picker discarded it. It now reads
   "Proposed — becomes Admin once a second admin approves."

2. **The pending panel rendered nothing** while a request sat in the
   table. The query embedded `users` TWICE with named foreign keys, the
   embed errored, and the error was destructured away — a SILENT EMPTY
   of precisely the 111/112 kind, in code written the same day as a
   comment warning about it. Fixed by deleting the embed rather than
   repairing it: the table has three FKs to `users`, the page already
   loads every member, so labels resolve in JS and the error is now
   logged instead of dropped.

The database was correct throughout both: Rae stayed a recruiter, one
pending request, one trail event. **Only the surface lied** — which is
why a green DB drive is not a drive.

**Drive 117 — GREEN after the fixes**, live in prod
(mandate-5yuarb9j8). As the PROPOSER, Ada sees the pending row with
"Yours — another admin must approve", a Withdraw button and **no
Approve button**. As the SECOND admin, Ben sees Decline and Approve and
**no Withdraw**. Ben approves; the toast says Rae is now an admin, the
panel clears, `users.role` is `admin`, the request is `approved`, and
the trail reads *admin_grant_proposed by Ada Admin → admin_grant_approved
by Ben Admin* — both parties named, which is the entire point.

**Teardown exact:** users 26 / agents 25 / auth 26, events 77, grant
requests 0, invitations 0, rate_limit 0, anon roster 12, zero probe
functions, one admin.

**A method note worth keeping:** the first read of the panel reported
`panelVisible: false` while a Withdraw button existed. That was a
MEASUREMENT artifact — `innerText` reflects CSS `text-transform`, so
the heading arrives uppercased and a case-sensitive match misses it.
Checked case-insensitively before concluding anything.

Numbers unchanged: next migration 130; next § 174; next drive 118;
vitest 1110; CHECK 97; door 26; allowlist 29; anon roster 12.

§173 now stands complete as drafted — still awaiting the founder's word.

## 174. §173 CONFIRMED — TWO-PERSON ADMIN GRANTS ARE LAW — 2026-08-26

The founder's word ("confirmed") lands against §173 as drafted and
driven. **No single administrator can create another administrator.**
A grant is proposed by one admin and approved by a second; the proposer
cannot approve their own request; the trail names both parties.

As built and now law: migration 129, `admin_grant_requests`, activity
CHECK 97 (the four `admin_grant_*` events), the proposer/approver split
in the UI, and drive 117's live proof in production — Ada proposes and
sees only Withdraw, Ben approves and sees only Approve/Decline, the
trail reads *proposed by Ada → approved by Ben*.

**The lesson §173 leaves behind is the one worth keeping:** a green
database drive is not a drive. §173's database layer was proven before
the UI was ever opened, and the UI then produced a toast that said "is
now Admin" over a *pending* request and a panel that rendered nothing
while the row sat in the table. Both were invisible to tsc, vitest,
eslint and build. Drive the surface, or you have not driven it.

Numbers unchanged by this entry: next migration 130; vitest 1110;
CHECK 97; door 26; allowlist 29; anon roster 12.

## 175. FIRST JUDGMENT AUDIT — THE SYSTEM MEETS A REAL DOCUMENT — 2026-08-26

**Nothing was built and nothing was fixed.** This entry records an
audit. Findings live in
`docs/handoffs/2026-08-26-first-judgment-audit.md`.

Every drive to date tested *plumbing* — permissions, refusals, trails,
teardowns — against fixtures written and then deleted by their own
author. §128 exists because that cannot falsify **judgment**. This is
the first look at judgment, against the only real CV in the database:
the founder's own, uploaded 2026-04-30, parsed clean, carried through
evaluation, psychology and a positioning kit with three client-facing
emails.

**A trap closed on the way in.** Agent principals cannot read the `cvs`
bucket — `can_read_org()` admits only
`admin | manager | recruiter | researcher | viewer`, so the CV Parsing
Agent sees bytes at upload time and never again. Correct by design, and
it means no agent can re-read a CV to check its own work. The file came
in via `evals/fixtures/cvs/`, located by exact byte match (582,147) to
the stored object.

**The parser was largely exonerated.** Four of six suspicions raised
before the PDF was read were WRONG, and wrong in the parser's favour —
`"Difecto CIO"` is verbatim in the source document, the three
2010–2012 roles really are listed together under an ADDITIONAL ROLES
heading, `location: null` is honest (the CV has no address, and the
parser correctly declined to infer one from an area code), and the
flexcpo/ESP mismatch is the CV's own. **The withdrawals are recorded
rather than edited out**, because a findings document that hides its
own false positives cannot be trusted about its true ones.

**The decisive question was ruled.** The CV states **no headcount
anywhere**. So the evaluation's "does not provide team size for any
role" is true and the parser dropped nothing — the `do_not_include`
verdict is not built on lost data.

**What survived, and one thing worse than first suspected:**

- **The evaluator contradicts the parse it was handed.** The parser
  captured *"IT infrastructure overhaul including cloud migration"* into
  `transformation_experience`; the evaluator then scored technical 5/10
  on the grounds that the CV *"provides no evidence of hands-on IT
  infrastructure ownership."* The source bullets are unattributed and
  undated, so discounting them is defensible — asserting they do not
  exist is not.
- **Elapsed time is computed against the wrong "now."** The CV reads
  "2017 - Present"; the parse got it right; the output says a
  *"seven-year"* gap where the run date makes it **nine**. Corroborated
  by `years_experience: 15` against sixteen years of roles. It reaches
  client-facing email text.
- **The schema cannot hold education.** `CANDIDATE_PROFILE_SCHEMA` sets
  `additionalProperties: false` and has no education, certifications or
  phone field. An MBA, a BS, PMI–IPMA Level A and a Certified Scrum
  Master are discarded at parse time. `public.candidates` carries a
  `phone` column that no CV parse can ever populate.
- **The role the candidate was scored against is not the role in the
  spec** — see §176 and the seam finding (F-A), which is the same
  standing lesson §172 left behind: *a single source of truth only ends
  drift below it.* `calibration_model.role_title` is written once at
  intake and never revised — not by the Role Spec Agent, not by
  `finalize_job_spec` (verified by definition), not by feedback
  recalibration. Every scoring agent reads it. Sourcing refuses a
  non-final spec; evaluation is gated on nothing.

**The through-line, and the reason §176 exists:** the system converts
*"unattributed / undated / not quantified"* into *"no evidence of"* and
*"significantly below"*. The scoring table gets it right — *"cannot
substantiate"*, *"Evidence for this must-have is absent"* — and the
risks array, the gap headlines and the client-facing pitches then
restate it as settled fact about a named person.

**Credit, recorded deliberately:** `risks[2]` reads *"CV metrics appear
high-level and difficult to verify; credibility risk in due
diligence."* That is the single most obvious real-world problem with
the document, and the system caught it unprompted. That is judgment,
not plumbing, and it is the best evidence yet that the thing works.

**What this audit could NOT test:** ranking and shortlist.
`comparison.competitors` is `[]` and says so itself. One CV cannot test
comparison. The §128 residue is now specifically *8–10 more CVs*, not
"real-CV testing" in general.

## 176. GATE DRAFT — THE EVIDENCE-GRADE SLICE — 2026-08-26

**DRAFTED. Nothing built. Awaiting the founder's word.**

One defect wearing three hats, all from §175: the system asserts things
it does not know about a named person, in documents that go to clients.

- **F-D** — absence restated as fact (`risks[1]`: team scale
  *"significantly below"* requirements, from a CV with no headcount).
- **F-G** — the evaluator denying evidence its own parse recorded.
- **F-C** — elapsed time computed against an internal "now" rather than
  the run date.

All three are the same class: **a claim made without the evidence to
make it.** They belong in one slice.

### The shape

Prompt-only is the wrong instrument — prompts drift and nothing guards
them. The house doctrine is structural, and there is already a law that
is this one's sibling: *illustrative data carries a visible label at the
point of display.* This extends it — **an unevidenced negative claim
carries its evidence grade at the point of display.**

Proposed: every negative-claim object in the schemas
(`risks[]`, `development_areas[]`, evaluation `gaps[]`, psychology
`watch_outs[]`) gains a **required** `evidence_grade`. With
`additionalProperties: false` already set, the model becomes
structurally unable to emit an ungraded negative claim. The run date is
passed into the prompt explicitly and the model is forbidden from
computing elapsed time from internal knowledge.

### Rulings needed before a line is written

- **D.1 — the grades.** Proposed three: `not_stated` (the CV is silent),
  `unattributed` (the CV claims it, undated or tied to no employer),
  `evidenced` (claimed, dated, attributed). Three or more?
- **D.2 — the client-facing rule.** This is the real question and it is
  the founder's alone. Proposed: a claim graded `not_stated` may appear
  in client-facing pitches and emails **only** as what the CV does not
  state — never as a comparative ("below", "short of", "significantly
  under"). Internal surfaces show the grade always.
- **D.3 — the stored row.** The one existing evaluation is the founder's
  own and is now this audit's exhibit. Proposed: **leave it**,
  ungraded, and let old rows render without a grade rather than
  backfilling a judgment no one made.
- **D.4 — scope.** Proposed: parse-stage `risks[]` too, not evaluation
  alone — `risks[1]` was a parse-stage claim.
- **D.5 — the guard.** What fails the build if this regresses? A
  source-text guard cannot lint model output. Proposed: a schema test
  pinning `evidence_grade` as required in each object, plus a render
  test that a `not_stated` claim never reaches a comparative phrase in
  the client-facing templates. Mutation-tested before trusted, per the
  standing lesson.

**Explicitly NOT in this slice**, each its own gate when its turn
comes: **F-A** the unwatched spec/calibration seam (the larger and
more consequential of the two, and the one that decides whether
evaluation may score against a stale role at all), and **F-H** the
education/certifications/phone schema gap.

Numbers: next migration 130; next § 177; next drive 118; vitest 1110;
CHECK 97; door 26; allowlist 29; anon roster 12.

## 177. GATE DRAFT — F-A, THE UNWATCHED ROLE SEAM — 2026-08-26

**DRAFTED. Nothing built. Awaiting the founder's word.** Chosen over
§176 by the founder ("do F-A instead"); §176 stands drafted and unbuilt.

### What the map actually shows — worse than §175 said

There are **two sources of role truth** and the highest-stakes consumer
reads only the one that is never updated.

`grep -rln "job_specs" src/` returns fifteen files. **Neither candidate
evaluation nor CV parse is among them.**
`projects/[id]/candidates/actions.ts:75` selects exactly
`calibration_model, company_context` — the spec is not read, not
consulted, not available. Same in `candidates/network/actions.ts`.

Who reads the **spec**: sourcing (`generate-sourcing.ts:195`, hard
`.eq("is_final", true)`), interview plans, client interviews, and the
spec UI. Who reads the **calibration model**: parse, evaluation,
ranking/role analysis (`actions.ts:198`), shortlist, copilot, the HM and
client portals, mandate-gap computation.

And `calibration_model.role_title` / `inferred_scope` are written
**once**, at intake. Verified exhaustively — the only post-intake
writers are `applyCalibrationSuggestionAction` (`actions.ts:799`) and
`recalibration/recalibrate.ts:101`, and **both write
`dimension_weights` alone**, spreading the rest through unchanged.
`finalize_job_spec` touches `job_specs` only.

So: the Role Spec Agent can write a role that contradicts the
calibration model, a recruiter can mark it final, and every scoring
agent keeps scoring the one-liner's first inference. On the RBC project
it already has — the spec says twice that infrastructure /
production-estate experience does **not** satisfy the requirement, and
the evaluation marked the candidate down for lacking exactly that, then
returned `do_not_include`.

**The precedent already exists in the codebase.** Sourcing refuses:

> "No finalised job spec for this project. Mark a version as final
> before generating sourcing queries."

Sourcing — which produces a search string — fails closed on a missing
final spec. Evaluation — which produces a verdict about a named person
— is gated on nothing.

### The proposed shape: door + remedy, never a silent rewrite

Rejected outright: **re-deriving the calibration silently when a spec
is finalised.** It would make "mark as final" mutate the basis of every
past score without asking, and it would fire an AI call from a click —
against the lesson already written into `spec/actions.ts`, that spend
must never be triggered by a path the user didn't intend.

Proposed instead, mirroring sourcing:

1. **A door.** Evaluation and ranking refuse when a final spec exists
   and the calibration was not derived from it. The refusal names the
   remedy, exactly as sourcing's does.
2. **A remedy.** An explicit *Recalibrate from final spec* action that
   re-derives role identity, records a trail event, and **shows the
   before/after diff** — the surfaces for this already exist
   (`spec-diff-panel`, `recalibration_summary`). The change is never
   silent and never automatic.

### Rulings needed before a line is written

- **A.1 — what counts as stale.** Proposed: identity, not time —
  `calibration_model.derived_from_spec_id` ≠ the current final spec's
  id. Timestamps invite clock skew and say nothing about *which* spec.
- **A.2 — where the stamp lives.** Proposed: **inside the
  `calibration_model` JSONB, not a new column.** A real FK from
  `projects` → `job_specs` would close a cycle against
  `job_specs.project_id → projects` and is precisely the shape that
  breeds PGRST201 ambiguity on bare embeds. It would also force an
  AMBIGUOUS_PAIRS regeneration in `embed-ambiguity.test.ts`. JSONB
  costs referential integrity and buys none of that risk. **This is a
  real trade and the founder should rule it.**
- **A.3 — projects with NO final spec.** This is the RBC project's
  actual state (`is_final: false`). Proposed: **the door does not
  fire** — never finalising is early, not drifted, and blocking it
  would break every mandate before its spec lands. The stricter reading
  — evaluation requires a final spec at all, as sourcing does — is
  defensible and would have prevented the RBC verdict outright. It is
  also a much larger behavioural change. **Founder's call.**
- **A.4 — which consumers get the door.** Proposed: candidate
  evaluation and ranking/role analysis only — the two that produce
  client-facing verdicts. NOT copilot, NOT the portal weight displays,
  NOT mandate-gap computation; those are advisory or read-only and
  blocking them is hostile.
- **A.5 — does the remedy touch `dimension_weights`?** Proposed:
  **NO.** Weights carry accumulated human judgment — health suggestions
  applied, HM feedback interpreted, `recalibration_summary` written.
  Overwriting them would silently discard it. But if the role changed
  materially the old weights may no longer be valid, so: **surface the
  question in the diff, do not answer it for the recruiter.**
- **A.6 — the trail.** Proposed: one new event, `calibration_rederived`,
  visibility `org` → activity **CHECK 97 → 98** and `describe.test.ts`
  updated. No event on refusal (sourcing's refusals record none either).

### Cost, and what it disturbs

Migration 130 only if A.2 goes to a column; **under the proposal there
is no DDL at all** beyond the CHECK bump for A.6. Guards touched:
`describe.test.ts` (CHECK count + recordable list). `embed-ambiguity.test.ts`
is untouched under the JSONB proposal and **must be regenerated** if the
founder rules a column instead. New door → 27 if the refusal is modelled
as an intent door rather than an action-level throw; sourcing's is a
plain throw, so proposed: **plain throw, door stays 26.**

**Drive 118 writes itself:** finalise the RBC spec, watch evaluation
refuse, run the remedy, read the diff (*Head of IT Operations* →
*Global Head of CM Operations, Regulatory, and Supervisory Technology*),
re-evaluate, confirm the verdict changes. That is the seam closing in
production against the exact case that exposed it.

Numbers unchanged until built: next migration 130; next § 178; next
drive 118; vitest 1110; CHECK 97; door 26; allowlist 29; anon roster 12.

## 178. §177 BUILT AND DRIVEN — THE ROLE SEAM HAS A WATCHER — 2026-08-26

**DRAFTED — awaiting the founder's word. No completion declared.**

Founder's rulings: **A.2 JSONB**, **A.3 the door does not fire without a
final spec**, defaults on A.1/A.4/A.5/A.6.

### As built

`spec-drift.ts` holds the predicate and the door.
`calibration_model.derived_from_spec_id` must equal the project's current
final spec; anything else — absent, empty, non-string, a superseded
version — reads stale and refuses. A.3's branch is first and deliberate:
**no final spec means EARLY, not drifted.** Four scoring entry points
pass the door — CV upload, retry-parse, network copy (on the TARGET
project), and role analysis — and each refuses BEFORE anything is
created, so a refusal leaves no placeholder row and no uploaded bytes.

`rederive-role.ts` is the remedy: the CALIBRATION AGENT reads the
finalised spec under its own session (`job_specs_agent_select` already
made that lawful), restates the role, stamps the spec id, and returns a
before/after. It reuses the `derive_calibration` capability rather than
minting one, so the model registry and its tripwire are untouched.
**Not** wired into `finalize_job_spec`, by design.

`door-sites.test.ts` pins the door at every scoring call site BY SOURCE
TEXT. Mutation-tested three ways — and the FIRST VERSION WAS WRONG: it
passed when a call was deleted but its import remained, because
`includes(DOOR)` matched the import line. It now matches the
invocation. What it cannot catch (a rename) is caught by `tsc`, and the
test says so rather than implying cover it does not have.

Migration 130: activity CHECK 97 → 98, no other DDL.

### What the drive found — and §177 was wrong about a number

**Drive 118 ran live in prod as a minted recruiter through the browser.**
Three findings, none of them visible to tsc / vitest / eslint / build:

1. **THE TRAIL WAS EMPTY.** §177 asserted "allowlist stays 29." That was
   a misreading: the 29 is not agent PRINCIPALS, it is the allowlist
   **inside `record_agent_event`** naming which events an agent may
   write. `calibration_rederived` was absent, the function raised, the
   seam caught it with `captureSeamError`, and the re-derivation
   succeeded with **no trail at all**. Migration 131 admits it —
   **allowlist 29 → 30** — with PUBLIC EXECUTE revoked in the same
   breath so the anon roster stayed 12. Found ONLY because the trail was
   read back. The standing lesson earned its place again.

2. **THE RECEIPT COULD NEVER BE SEEN.** The before/after panel was
   unreachable code in production. `{stale && <RoleDriftBanner/>}` turns
   the element into `false` the instant the remedy clears the drift, so
   React unmounts the component and the diff it holds in state goes with
   it. My first fix — dropping `router.refresh()` — did nothing, because
   the ACTION's own `revalidatePath` re-renders the tree anyway. The
   banner is now always mounted and gates itself on
   `!stale && !diff → null`.

3. **A MEASUREMENT ARTIFACT, not a defect.** The refusal toast read as
   missing three times before I clicked and observed inside a SINGLE
   evaluation. Sonner had auto-dismissed it between tool calls. Same
   class as drive 117's `innerText` / `text-transform` artifact: **the
   measurement lied, not the product.** Recorded because I reported it
   as a defect before it was one.

### The drive, in order

A.3 proven first: spec at "Spec draft", **no banner, no button**. Spec
finalised through the UI (which asks for confirmation). Banner appears;
the Build Sourcing CTA correctly withholds itself. **Three upload
attempts refused** with the exact sentence — and candidates stayed 1,
CV objects stayed 1: *the refusal created nothing.* Remedy pressed; the
receipt now renders, and the agent's own `change_summary` names the
§175 defect unprompted:

> "the former implied an infrastructure or IT-run mandate that the
> specification explicitly excludes"

`Head of IT Operations` → `Global Head of CM Operations, Regulatory, and
Supervisory Technology`. Weights **untouched** (10/8/9/7/8, identical to
the snapshot — A.5 proven). Trail: `calibration_rederived`, actor
**Calibration Agent**, visibility `org`, both titles and the spec
version in the detail, **no spec text**. Door then CLEARED: the same CV
refused three times parsed straight through.

### The result that inverts the intuition

Re-scored against the CORRECT role, the candidate scores **lower**, not
higher: **4 / 3 / 3 / 3 / 4** against §175's 7 / 5 / 6 / 6 / 7.

**The mis-scoped role was flattering him.** §175 read the drift as
potentially unfair to the candidate; it was the opposite. "Head of IT
Operations" sat far closer to his CIO/infrastructure background than the
post-trade and regulatory application mandate the spec actually
describes. The false negative was real, but its direction was not what
the audit assumed — worth recording, because it is the kind of thing
only a live re-run can settle.

Worth noting too: the new evaluation's language is markedly more careful
about evidence — *"cannot be scored above 4 because no named programme
… is present"*, *"unverifiable"* — where §175's said *"significantly
below"*. That is §176's defect class improving on its own once the role
is precise. It does **not** close §176; it suggests the two are related.

### Teardown — exact

users 26 / auth 26 / events 77 / candidates 1 / cv objects 1 / scores 1
(the original candidate's, untouched) / spec `is_final` false /
`role_title` restored and the whole `calibration_model` verified
**byte-identical to the pre-drive snapshot** / no stamp / anon roster
12. The uploaded CV was removed through the storage API, as a recruiter
holding `cvs_org_delete`, BEFORE the persona was deleted — SQL against
`storage.objects` would have left the bytes behind.

**A NEW TRAP for the list:** Playwright MCP is rooted at the **iCloud
clone**, not the live repo, so a file to be uploaded must be staged
inside that root. It was removed at teardown; anything left there is
personal data sitting in a stale copy.

Numbers now: next migration **132**; next § **179**; next drive **119**;
vitest **1120**; CHECK **98**; door 26; **allowlist 30**; anon roster 12.
Deployed `mandate-ne3e4ibe4`.

## 179. §178 CONFIRMED — THE ROLE SEAM IS LAW — 2026-08-26

The founder returned the judgment rather than the word: *"if you feel
that making it the law then lets do it."* Taken as delegated authority,
exercised deliberately, and recorded with what it does and does NOT
cover — a delegated confirmation is worth less than a founder's own
unless the limits come with it.

**One check was owed before this could be written, and it was run.**
The always-mounted banner introduced a `!stale && !diff → null` path
that EVERY mandate in the product now renders. Nothing had exercised it
after the fix. Both live mandates were loaded as a recruiter,
post-teardown, non-stale: both render, both show their role, no banner,
no receipt, no error boundary. Had that been wrong, every project page
in the product would have been broken by a change whose entire purpose
was to make one banner behave. Persona torn down; baseline exact again
(users 26 / auth 26 / events 77 / candidates 1 / cv objects 1 / anon
roster 12).

**LAW as of this entry:** a mandate carrying a finalised job spec cannot
be evaluated or ranked against a role identity derived from anything
else. The refusal names its remedy; the remedy is explicit, agent-run,
weight-preserving, and leaves a trail naming both titles.

### What this does NOT cover — stated, not buried

1. **Three of the four doors were not driven live.** Only CV upload was
   refused in production. Retry-parse, network-copy and role-analysis
   rest on a mutation-tested source-text guard plus `tsc`. That is
   genuinely good evidence — it is not the same as having watched them
   refuse. If one of them is wrong, this is where it will be.

2. **Mandates with NO final spec remain unprotected — by ruling, not by
   oversight.** A.3 is the founder's call and the right one: blocking
   evaluation before a spec lands would break the ordinary order of
   work. But it means §175's defect is closed for mandates that finalise
   a spec and OPEN for those that never do. **The RBC project — the very
   case that exposed this — is back to `is_final = false` after teardown
   and is therefore in the unprotected state right now.** Anyone
   evaluating a candidate on it today still scores against "Head of IT
   Operations". That is correct behaviour under A.3 and it is worth
   knowing.

3. **The seam is watched in one direction only.** The door asks whether
   the calibration came from the final spec. Nothing asks whether the
   SPEC still matches the onboarding answers, or whether the weights
   still fit a role that has moved. §178's drive surfaced the second of
   those directly: the remedy deliberately leaves `dimension_weights`
   alone (A.5), so a mandate can now carry a correct role title against
   weights derived for a different job. The receipt says so in words;
   nothing enforces it.

### What §178 leaves behind, beyond its diff

- A door and a remedy at the seam §172 warned about — *a single source
  of truth only ends drift below it* — now with something above it.
- **The corrected number: the "agent allowlist" is the event allowlist
  inside `record_agent_event`, not the agent principal count.** §177
  asserted otherwise and shipped a silent empty trail on the strength of
  it. Now 30.
- Two standing lessons earned again: **read the trail back** (the event
  never landed, and nothing said so), and **`{cond && <Component/>}`
  destroys client state when `cond` flips** (the receipt was unreachable
  code in production; dropping `router.refresh()` did not fix it,
  because the action's own `revalidatePath` re-renders regardless).
- One correction against myself: a toast reported missing three times
  was a MEASUREMENT artifact, not a defect. Sonner auto-dismisses
  between MCP tool calls.

### Still open, each needing its own gate

**§176** — the evidence-grade slice, drafted and unbuilt. §178's re-run
showed the corrected role improves the epistemics on its own
(*"cannot be scored above 4 because no named programme is present"*
against §175's *"significantly below"*), which narrows §176 but does not
close it. **F-H** — the profile schema cannot hold education,
certifications or a phone number; no gate written. And §128's residue is
now specifically **8–10 more CVs**: ranking and shortlist have still
never been tested, and one CV cannot test comparison.

Numbers unchanged by this entry: next migration 132; next § **180**;
next drive 119; vitest 1120; CHECK 98; door 26; allowlist 30; anon
roster 12.

## 180. GATE DRAFT — F-H, THE PROFILE CANNOT HOLD A QUALIFICATION — 2026-08-26

**DRAFTED. Nothing built. Awaiting the founder's word.** Chosen by the
founder ("do F-H next"). §176 stands drafted and unbuilt.

### The map, and it is worse than a missing field

`grep -rn "education" src/` returns **nothing**. Not a stripped field,
not a TODO — the concept does not exist anywhere in the product.
`certifications` likewise. `CANDIDATE_PROFILE_SCHEMA`
(`src/lib/ai/cv-parsing.ts:97`) sets `additionalProperties: false`, so
the model is structurally forbidden from returning either even if it
reads them off the page. Nothing pins that schema — no test asserts its
shape today.

**The sharp edge is where this meets the Job Spec Builder.**
`job-spec-analysis.ts` produces *"5–6 must-have qualifications"* into
Required Experience. So a recruiter can finalise a spec that says "MBA
required" or "CFA charterholder", and the evaluation **cannot verify
it** — not because the CV is silent, but because the parser was
forbidden to look. Under §176's defect class the evaluator then reports
the absence as a fact about the person. §175's subject carries an MBA in
Finance, a BS in Accounting & Audit, PMI–IPMA Level A and a Certified
Scrum Master; all four were discarded at parse time.

**And `public.candidates.phone` is a column no CV parse can ever fill.**
Worth stating precisely, because it decides D.3 below: today a
candidate's phone arrives by exactly two routes — the candidate typing
it into the token portal under their own hand
(`candidate/[token]/actions.ts`), or a copy from another record. **The
emptiness of that column currently MEANS something.** It means nobody
has been given the number.

### Rulings needed before a line is written

- **D.1 — shape.** Proposed: `education` as objects —
  `{ degree, field, institution, year }`, nullable within — because the
  institution is precisely what a hiring manager asks about, and
  §175's CV proves the point ("MBA, Finance — Kharkiv State University
  of Food & Trade Technology"). `certifications` as a plain
  `string[]`, because CVs rarely separate issuer from name cleanly
  ("PMI – IPMA – Level A Certified") and an `issuer` field would invite
  the model to invent one.
- **D.2 — required or optional.** Proposed: **required, empty array when
  absent**, matching every other field in this schema. Optional fields
  let the model skip the question; a required empty array is the
  honest-absence shape the house already uses.
- **D.3 — phone. THE ONE THAT IS NOT MECHANICAL.** Three options:
  **(a)** do not parse it at all; **(b)** parse into `cv_structured`
  only, never into the `candidates.phone` column; **(c)** parse and
  populate the column. **Proposed: (a).** A CV reaches this system by
  recruiter upload as often as by the candidate's own hand, so "they
  sent it, therefore they gave it" does not hold. Filling the column
  from a parse converts a number the candidate *provided* into one the
  system *mined*, destroys the provenance signal the empty column
  carries, and enlarges the Art.14 footprint this product already has a
  notification duty about. If the founder wants the number visible,
  **(b)** is the honest middle. **(c)** should be chosen only
  deliberately.
- **D.4 — does education reach the EVALUATION? Blast radius.** Proposed:
  **yes to the evaluation prompt, no to `trimProfile`.** Yes, because a
  spec can require a qualification and the evaluator must be able to
  check it rather than report it absent. No to `trimProfile`
  (`projects/[id]/actions.ts:231`), which deliberately keeps the ranking
  prompt compact — a degree is a qualification gate, not a comparison
  axis. **Consequence to be stated plainly: this changes scores.** Every
  evaluation to date was made blind to education, so a re-run may move a
  dimension. That is the point, and it should still be a decision rather
  than a surprise.
- **D.5 — backfill.** Proposed: **leave the existing row.** Consistent
  with §176's D.3 and with §175's exhibit standing. New parses gain the
  fields; nothing is rewritten under a judgment nobody made.
- **D.6 — the guard.** Nothing currently pins `CANDIDATE_PROFILE_SCHEMA`
  at all. Proposed: a schema test asserting `education` and
  `certifications` are present AND in `required`, plus
  `additionalProperties: false` still set — mutation-tested before it is
  trusted, per the standing lesson. If D.4 goes yes, a second assertion
  that education reaches the evaluation input and does NOT reach
  `trimProfile`.

### Cost, and what it disturbs

**Under this proposal there is NO migration at all** — the profile lives
in `cv_structured` (jsonb) and needs no DDL; next migration stays 132.
That holds only while D.3 is (a) or (b); ruling (c) touches no schema
either, but changes what the parser writes to a typed column and would
want its own line in the drive. No new door, no new event, no CHECK
change, anon roster untouched.

Render surface is settled and small: the candidate profile tab already
has `ChipCard` for list fields (`certifications` drops straight in) and
`EditableSignalCard`/`ChipCard` neighbours for a modest education block.

**Drive 119 writes itself:** finalise nothing, upload the same CV, and
read back whether the MBA, the BS, the PMI–IPMA Level A and the
Certified Scrum Master all survive the parse — then confirm the phone
column is still empty, which is the D.3 ruling made visible.

Numbers unchanged until built: next migration 132; next § **181**; next
drive 119; vitest 1120; CHECK 98; door 26; allowlist 30; anon roster 12.

## 181. §180 BUILT AND DRIVEN — THE PROFILE HOLDS A QUALIFICATION — 2026-08-26

**DRAFTED — awaiting the founder's word. No completion declared.**

Founder's rulings: **D.3(a) do not parse phone at all**, **D.4 education
reaches the evaluation but NOT ranking**, defaults on D.1/D.2/D.5/D.6.

### As built

`CANDIDATE_PROFILE_SCHEMA` gains `education` (objects — `degree`,
`field`, `institution`, `year`) and `certifications` (plain strings),
both **required**, both empty-array-when-absent. Objects for education
because the **institution** is the part a hiring manager asks about;
strings for certifications because CVs do not separate issuer from name
("PMI – IPMA – Level A Certified") and an `issuer` field would invite
the model to invent one. `year` is nullable and the prompt forbids
inferring it from surrounding dates.

**D.3(a) is enforced twice, deliberately.** The schema has no phone
field — but a schema alone cannot stop a model parking a number inside
`location` or `summary`, so the parsing prompt says it in terms: *the
candidate's phone is theirs to give, not ours to take from a document a
recruiter may have uploaded without them.*

**D.4** required more than adding fields.
`generate-evaluation.ts:98` serialises the profile object whole, so the
new fields arrive by construction — **but arriving is not reading.** The
evaluation prompt is now told to check a named qualification against
them, and told that an empty array means *the CV does not evidence it*,
not that the candidate lacks it. **A CV is not a transcript.** That
sentence is load-bearing: without it this becomes §176's defect wearing
a fourth hat. `trimProfile` stays clean — a degree is a gate against a
stated requirement, not a comparison axis.

`profile-fields.test.ts` pins all four rulings. **Nothing pinned this
schema before**, which is how the gap survived unnoticed. Mutation-tested
four ways — required-list, a smuggled phone field, an education leak
into ranking, deletion of the transcript rule — each caught.

**No migration.** The profile lives in `cv_structured` jsonb. Next
migration stays 132; no door, no event, no CHECK change.

### Drive 119 — live in prod, teardown exact

Same CV, uploaded by a minted recruiter. Every qualification survived:

- **MBA, Finance — Kharkiv State University of Food & Trade Technology**
- **BS, Accounting & Audit —** same institution
- **PMI – IPMA – Level A Certified**, **Certified Scrum Master**

Institution transcribed exactly, ampersand and all. **Both years `null`,
not invented** — the CV states none, and the prompt's prohibition held.
Both panels render on the profile tab.

**D.3(a) proven against the whole 17.6 KB profile, not just the fields.**
The number IS on that CV. Searched the serialised profile for the area
code, the exchange, the line, and the words phone/mobile/telephone:
**all false.** Nothing was smuggled. `candidates.phone` still `null`,
and the profile carries no `phone` key at all.

**Teardown exact:** users 26 / auth 26 / events 77 / candidates 1 / cv
objects 1 / scores 1 / spec `is_final` false / `role_title` unchanged /
anon roster 12. CV object removed through the storage API while the
persona still held `cvs_org_delete`; staged file removed from the
Playwright root.

### Two notes worth keeping

**A backtick inside a template literal broke the build.** The evaluation
prompt is a template literal; writing `` `education` `` inside it
terminated the string. Same family as the git-commit backtick trap
already on the list, in a place nobody had been bitten yet. Caught by
`tsc`, which is exactly what `tsc` is for.

**The `text-transform` artifact recurred**, and was recognised this
time: a case-sensitive check for "Certified Scrum Master" reported it
absent while the chip plainly rendered "CERTIFIED SCRUM MASTER". Third
appearance across drives 117–119. Case-insensitively, or not at all.

### What this does NOT do

`education` now reaches the evaluation prompt, so **scores can move**.
Every evaluation generated before today was made blind to
qualifications; a regenerate may return a different number. That is the
intended consequence of D.4 and it is stated so it is never a surprise.

It also does not close **§176** — it narrows it. The transcript rule
handles evidence-honesty for *this* field; the general defect, where
"unattributed" becomes "no evidence of" across risks, gaps and
client-facing pitches, is still drafted and unbuilt.

Numbers now: next migration 132; next § **182**; next drive **120**;
vitest **1127**; CHECK 98; door 26; allowlist 30; anon roster 12.
Deployed `mandate-oygd7fb7b`.

## 182. GATE DRAFT — CONTESTED VERDICTS + ADVISORY MODE — 2026-08-26

**DRAFTED. Nothing built. Awaiting the founder's word.** Chosen by the
founder ("Lets start with the Recruiter and Founder enhancements") from
the five-item judgment roadmap. §176 and §181 stand drafted; this gate
does not depend on either, and says where it touches them.

One programme, two slices, one premise from drive 118: **the system's
errors are not directionally predictable** — the mis-scoped role
FLATTERED the candidate — so no mental correction factor exists. The
recruiter slice converts unpredictable error into visible disagreement;
the founder slice changes what a verdict IS for a reader who has no
calibration of their own to check it against.

### Slice R — the contested verdict (recruiter enhancement)

Before a negative verdict stands, an independent pass tries to REFUTE
it. Agreement passes silently; disagreement surfaces as a flag the
recruiter resolves. **Never auto-overturned** — the skeptic is a second
opinion, not a second judge.

- **R.1 — when it runs.** Proposed: on `tier_3`/`tier_4` OR
  `do_not_include` only. Those are the verdicts that silently cost a
  placement (the false negative nobody audits, §175's exact case), and
  gating on them keeps the cost to one extra call on the minority of
  evaluations. Positive verdicts get audited by reality — the client
  meets the candidate.
- **R.2 — who runs it.** Proposed: the SAME Evaluator principal, under a
  NEW capability slug `verify_evaluation` (sonnet-5, same tier as the
  judgment it audits — auditing sonnet-5 with a weaker model inverts
  the point). New slug = CAPABILITY_MODEL entry + tripwire test update;
  registry tables untouched (map governs, §154).
- **R.3 — the refuter's charge.** Prompted to build the STRONGEST
  honest case that the verdict is wrong, from the same profile — not to
  re-evaluate. Output: `agrees: boolean`, strongest counter-argument,
  and the specific evidence the original verdict under-weighted.
- **R.4 — storage and trail.** Stored under
  `cv_structured.evaluation.second_opinion` (no migration). ONE new
  event `evaluation_contested`, written only on disagreement, by the
  agent — which means CHECK 98 → 99 **and `record_agent_event`
  allowlist 30 → 31 in the same migration**, per drive 118's lesson:
  the event allowlist is the thing §177 got wrong once already.
- **R.5 — render.** A contested verdict keeps its tier but wears the
  flag and the counter-argument beside it, in the report and on the
  candidate page. An uncontested negative says so too, in one quiet
  line — silence should be distinguishable from "not checked".

### Slice F — advisory mode (founder enhancement)

For the reader with no independent calibration, the verdict stops being
an answer and becomes a set of questions to take into the interview.

- **F.1 — the trigger. NEEDS A RULING.** `is_founder` is the platform
  bit, deliberately not a role — keying UX on it would be wrong.
  Inferring from "org has no active recruiter" is fragile (one
  role-change silently flips every mandate's rendering). Proposed: an
  **explicit org-level toggle** `advisory_mode boolean not null default
  false` on `organizations` — **migration 132** — surfaced in
  /app/settings, `org:manage`-gated. Default OFF so the existing org is
  untouched.
- **F.2 — what changes: the RENDER, never the data.** Same evaluation,
  same stored row. Advisory mode leads with `alignment_test.question`
  and each gap's `role_mismatch` as "TEST AT INTERVIEW" items; tier and
  recommendation demote to a secondary line prefixed "Based only on the
  CV". **Never hidden** — a founder who cannot see `do_not_include` at
  all is being managed, not assisted.
- **F.3 — the skeptic in advisory mode.** Runs identically. It is MORE
  important where no human can supply the disagreement themselves.

### Interactions, stated

§176 (evidence grades) would sharpen the refuter's charge and the
advisory framing, but neither slice reads a field §176 adds — no
dependency, no blocking. §181 stays drafted; its education fields reach
the refuter automatically since the profile travels whole.

### Cost

One sonnet-5 call per negative verdict (R.1 keeps this the minority
case). Migration 132 (one column + CHECK 99 + allowlist 31). Drive 120
writes itself: evaluate the founder CV (§181 showed the corrected role
scores it 4/3/3/3/4 — a negative verdict is guaranteed), watch the
skeptic run, read agreement or contest; flip advisory mode, watch the
same row re-render as questions; flip back; teardown exact.

Numbers unchanged until built: next migration 132; next § **183**; next
drive 120; vitest 1127; CHECK 98; door 26; allowlist 30; anon roster 12.

## 183. §182 BUILT AND DRIVEN — THE VERDICT GETS A SKEPTIC AND A QUIETER VOICE — 2026-08-27

**DRAFTED — awaiting the founder's word. No completion declared.**
Built as confirmed ("confirm §182 as proposed"); all rulings taken as
drafted.

### As built

**Slice R.** `verify-evaluation.ts`: before a `tier_3`/`tier_4`/
`do_not_include` stands, the refuter builds the strongest honest case it
is wrong — same tier as the judgment it audits (`verify_evaluation` →
sonnet-5, thinking disabled; capability map 35 → 36, tripwire updated).
Attached BEFORE persist, so report and audit land as one write.
Fail-soft: absence renders as "not checked", distinguishable from
concurrence. **Skills deliberately not injected** — the org's skills
steer the evaluator, and steering the skeptic with the same instructions
would correlate their errors, which is the failure this seam exists to
break. The guard pins the absent import; mutation-tested (widening the
R.1 trigger and injecting skills both fail).

**Slice F.** `organizations.advisory_mode` — explicit, admin-thrown,
default off. Render-only: the report leads with **Test at Interview**
(the alignment test's question as "Ask first", then each gap's mismatch
as a thing to probe rather than a fact about the person) and the verdict
demotes to a "Based only on the CV" line — chips intact, **never
hidden**. The flag rides the candidate page's existing org read; the
settings card is admin-gated three deep (render, action, RLS —
`organizations_role_update` already existed, so no new policy).

Migration 132: `advisory_mode` + CHECK 98 → 99 + `record_agent_event`
allowlist 30 → 31 **in one migration** — §178's lesson applied rather
than re-learned. Anon roster stayed 12 (the revoke rode the same file).
vitest 1127 → 1132.

### Drive 120 — live in prod, two personas, teardown exact

Fresh upload rather than a force-regenerate, **deliberately: the
baseline candidate's evaluation is §175's exhibit** and regenerating it
would have destroyed the audit's evidence. Verified at teardown:
`generated_at` still 2026-04-30.

The evaluation came back `tier_4 / do_not_include` and the refuter ran —
**and concurred.** The trail read back consistent both ways: `agrees:
true`, zero `evaluation_contested` rows — exactly what R.4 specifies for
concurrence. The concurrence line renders under the full verdict.

**The refuter's output is worth quoting, because it did four things the
gate hoped for and one §176 will have to fix:**

1. It held the evidence line: *"'no named systems/regimes/headcount' is
   an absence-of-evidence problem, not proof of absence."*
2. It concluded honestly that this argues *"for a clarifying screening
   call, not for overturning a do_not_include"* — refutation attempted,
   verdict survives, which is the R.3 contract working as charged.
3. **It read §181's fields:** *"PMI-IPMA Level A and Certified Scrum
   Master certifications indicate formal large-programme governance
   credentials not discussed in the evaluation"* — the education slice
   feeding the skeptic one slice later.
4. Its `underweighted_evidence` named real things (the 2010–2012
   capital-markets density, the quantified outcomes discounted as
   "generic").
5. **The time anchor is still wrong:** it wrote *"eight-year consulting
   gap since 2017"* — the run date makes it nine. Third distinct value
   for the same interval (seven, eight; never nine). §176 carries the
   fix (run date passed into the prompt) and this is more evidence it
   is needed.

Advisory mode: flipped ON as Ada through the settings card (toast, DB
read back `true`), the SAME stored evaluation re-rendered — Test at
Interview leading, "Ask first" carrying the sharpest question, verdict
demoted to "Based only on the CV" with tier and `do_not_include` still
visible, second opinion intact — then OFF, DB read back `false`.

**Teardown exact:** users 26 / auth 26 / events 77 / candidates 1 / cv
objects 1 / advisory_mode false / **active admins 1** (Ada was a second
admin for the drive's duration — minted and removed by SQL, where
`auth.uid()` is NULL and the §173 guard deliberately stands aside) /
exhibit untouched / anon roster 12. Storage via API before the persona
went; staged file removed from the Playwright root.

### Observed, not §182's defect

Two `candidate_evaluated` events landed for one candidate — two page
loads each scheduled a generation while the first was still in flight
(the pending→schedule pattern has no in-flight marker). Pre-existing,
costs one duplicate sonnet-5 call under concurrent loads, surfaced here
because the trail was read back. Noted for a later cost slice; not
fixed under this gate.

### What this does NOT claim

The refuter concurring once is one data point on the concurrence path;
**the CONTESTED path — the flag, the warn panel, the
`evaluation_contested` event — has run only against the database and
unit guards, never live**, because one honest CV cannot make the
refuter disagree on demand. The §128 CVs will exercise it naturally.
Advisory mode is a render truth, proven; whether it changes founder
BEHAVIOUR is not provable from inside the product.

Numbers now: next migration **133**; next § **184**; next drive **121**;
vitest **1132**; CHECK **99**; door 26; **allowlist 31**; anon roster
12; capability map **36**. Deployed `mandate-jhzo1m2vi`.

## 184. §176 BUILT AND DRIVEN — THE SYSTEM STOPS ASSERTING WHAT IT DOES NOT KNOW — 2026-08-27

**DRAFTED — awaiting the founder's word. No completion declared.**
Built under DELEGATED confirmation ("continue with your suggested list
and approach to priorities") — recorded as such, with the rulings
exercised being exactly the D.1–D.5 defaults §176 proposed, D.2
included. If any ruling lands differently on review, this entry is
where to object.

### As built

**The structural half.** Four claim families — profile `risks[]` and
`development_areas[]`, evaluation `gaps[]`, psychology `watch_outs[]` —
carry a REQUIRED `evidence_grade`: `evidenced | unattributed |
not_stated`. One shared item schema (`gradedClaimItemSchema`) so the
four families cannot drift on what a grade is. With
`additionalProperties: false` an ungraded machine claim is impossible
to emit.

**The prompt half — what a schema cannot hold.** D.2: a `not_stated`
claim is NEVER phrased as a comparative, pinned in the evaluation and
positioning prompts — the two that write client-facing language. F-C:
`run_date` injected into parse, evaluation, psychology and refuter,
with "never against your own sense of today's date". Pins assert on the
EXPORTED prompt strings — runtime values — so only deleting a rule can
un-guard it, and that fails the suite.

**Three authors, one reader.** Storage now legitimately holds plain
strings (pre-§176 rows), graded objects (new parses), and strings again
(recruiter edits — a manual edit re-authors the list as human-curated
and machine grades DROP, deliberately: a human's judgment wears no
machine grade, which is D.3's own logic). `normalizeClaims` reads all
three and drops junk rather than rendering `[object Object]`. D.3
honoured: no backfill; §175's exhibit stays as written and was verified
untouched at teardown.

No migration — the shapes live in `cv_structured`/psychology JSONB.
vitest 1132 → 1141. Mutation-tested three ways, each caught.

### Drive 121 — the defect class died on camera

Same CV, fresh upload, live in prod. Set §175's exhibit beside what the
same document produces now:

> **Then (§175):** "Team scale and budget authority **significantly
> below** RBC role requirements" — a flat comparative minted from a CV
> that states no headcount.
>
> **Now:** "**The CV does not state headcount for any role**; without
> managers-of-managers evidence at ~300–500 scale, the candidate cannot
> be credibly positioned…" — `evidence_grade: not_stated`, worded as a
> fact about the document.

All three grades used, each correctly: the consulting arc is
`evidenced` (it IS on the CV), the employer-less page-2 sections are
`unattributed`, the silences are `not_stated`.

**And the time anchor finally held.** Four runs of this seam produced
seven, seven, eight — and now, with run_date in the prompt: *"not
evidenced for the past **nine years**"* in the parse and *"**Nine years**
in external consulting"* in a gap headline. First correct value, in
both seams, same run.

One flag adjudicated rather than waved through: a broad regex found
"below" in the recommendation_rationale — read in full, it compares
**the system's own dimension scores to the tier threshold**, which is
not a D.2 violation (D.2 governs not_stated claims about the person).
Recorded because the check that found it was cruder than the rule it
checks.

Surface: grade tags on the signals ledger, chips on the gaps ("NOT
STATED ON CV" twice), refuter concurred again on a tier_4 /
do_not_include. Teardown exact: users 26 / auth 26 / events 77 /
candidates 1 / cv objects 1 / exhibit `generated_at` unchanged / anon
roster 12.

### What this does NOT close

The grades govern the four ruled families. The evaluation's NARRATIVE
prose (executive summary, verdict narrative) is constrained by prompt
rules but carries no per-sentence grades — a determined wrong sentence
can still appear there, caught only by the refuter and the recruiter.
And the D.2 rule in the positioning prompt has not yet been driven
against a generated pitch — the §128 CV batch will exercise it
naturally.

**With this, all four §175 defects have a shipped answer:** F-A §179
(law) · F-H §181 (parked at the founder's word) · F-D/F-G/F-C this
entry. The judgment roadmap's remaining items: the benchmark harness
(§185, drafted next) and the verdict-vs-outcome ledger.

Numbers now: next migration 133; next § **185**; next drive **122**;
vitest **1141**; CHECK 99; door 26; allowlist 31; anon roster 12.
Deployed `mandate-frouimo4e`.

## 185. GATE DRAFT — THE JUDGMENT BENCHMARK HARNESS — 2026-08-27

**DRAFTED. Nothing built. Awaiting the founder's word.** The next item
on the confirmed roadmap, and the one that unblocks the item that
outranks everything: §128's 8–10 real CVs.

### The premise

Every §-numbered proof so far shares one author: the person who wrote
the fixture also wrote the expectation. The harness breaks that — I
write the RUNNER, the founder writes the VERDICTS, and neither can see
the other's half while working. What it buys: the founder's CV drop
becomes a one-hour exercise instead of an afternoon, and the result is
the first falsifiable test of the system's judgment.

### The shape

`evals/judgment-harness/` (or scripts/ — F.1 below):

1. **Ingest**: walk `evals/fixtures/cvs/*.pdf|docx`, drive each through
   the LIVE seams (parse → evaluate → refuter) against a project the
   founder names, exactly as an upload would — agent sessions, doors,
   trails, the lot. No mocks: the §128 test is of the product, not of a
   test double.
2. **Sheet**: emit `judgment-sheet.md` — per candidate, the system's
   verdict column (fit dimensions, tier, recommendation, top gap with
   its grade, refuter's position) beside an EMPTY founder column
   (agree? / your tier / would present? / notes).
3. **Rank**: after all parses land, one ranking run over the full set;
   the sheet gains the leaderboard beside an empty founder ordering.
4. **Score**: a second command reads the filled sheet back and reports
   agreement — verdict concordance, rank correlation, and every
   disagreement listed verbatim. THAT report is the §128 deliverable.

### Rulings needed

- **H.1 — where it runs.** Proposed: against PRODUCTION, as a
  recruiter-credentialed run with the same teardown discipline as a
  drive, on a founder-named THROWAWAY project (not RBC — its baseline
  candidate is the §175 exhibit). Alternative: a Supabase branch —
  cleaner isolation, but then the harness tests the branch, not the
  product, and the §128 claim weakens.
- **H.2 — cost ceiling.** 10 CVs ≈ 10 parses + 10 evaluations + up to
  10 refuter calls + 1 ranking — roughly 30 sonnet-5-class calls per
  full run. Proposed: a `--limit` flag and a printed cost estimate
  before the run asks for confirmation.
- **H.3 — persistence of the run.** Proposed: candidates STAY in the
  throwaway project until the founder has filled the sheet (the whole
  point is reading them in the product too), then one teardown command
  the harness itself prints. Not auto-teardown — the founder decides
  when the reading is done.
- **H.4 — the founder's half.** The sheet is markdown the founder edits
  by hand. No UI, no forms — the deliverable is a judgment, not a
  feature.

Cost of building: harness + sheet writer + scorer, all agent-runnable;
no migration, no new door, no schema change. Drive 122 = a dry run with
the ONE CV on hand, proving the loop end to end with n=1 before the
founder spends an hour at n=10.

Numbers unchanged until built: next migration 133; next § **186**; next
drive 122; vitest 1141; CHECK 99; door 26; allowlist 31; anon roster 12.

## 186. §185 BUILT AND DRIVEN — THE HARNESS CLOSES THE AUTHORSHIP LOOP — 2026-08-27

**DRAFTED — awaiting the founder's word. No completion declared.**
Built under delegated confirmation ("continue as you believe appropriate
next build"); rulings exercised are H.1–H.4 as drafted.

### As built

`evals/judgment-harness/` + `vitest.harness.config.ts` + `npm run
harness`. Three commands via HARNESS_CMD: **ingest** (walk
`evals/fixtures/cvs/`, drive each CV through the LIVE seams — human
session creates the row and uploads the bytes under RLS, then
`runCvParseAndPersist`, `ensureCandidateEvaluation` with its refuter,
`runRankerScoring` at ≥2 candidates — then write `judgment-sheet.md`
with the system's half filled and every founder field empty),
**score** (parse the filled sheet: verdict concordance, tier
concordance, Spearman rank correlation, every disagreement verbatim —
the disagreements ARE the finding), **teardown** (storage first via the
API under the live session, then the rows; the throwaway project and
the agents' trail events remain — real history of a real run).

Decisions worth naming: the harness holds NO service key — it signs in
as the founder (HARNESS_EMAIL/PASSWORD) and everything it touches, it
touches under RLS. It re-checks §177's door itself, because it sits
below the action layer where the door lives. A separate vitest config
so `npm run eval` can never trigger a harness ingest. `output/` is
gitignored — the sheet carries the founder's verdicts about real
people. Runs under MANDATE_EVAL=1, so the RULED capability map, not a
live registry override; stated in the README rather than discovered.

### Drive 122 — n=1, the loop end to end

Throwaway project minted by SQL (calibration cloned from RBC), drive
recruiter as the human session. In order:

1. **The cost gate held**: without HARNESS_CONFIRM=yes the run printed
   the estimate and created NOTHING — zero candidates, verified.
2. **Ingest, 96 seconds**: parse → evaluation `tier_4 / do_not_include`,
   fit 4/5/4/3/5 — the §176 grades riding along: top gap "No evidenced
   headcount or budget at required scale **[not_stated]**" → refuter ran
   and concurred → ranking correctly skipped at n=1 → sheet written
   with the system's half filled and the founder's empty.
3. **Score**, against drive-fixture answers deliberately filled as a
   DISAGREEMENT: concordance 0/1, the disagreement rendered verbatim
   with the system's verdict, the fixture tier, and the note.
4. **The harness's own teardown** removed its candidate and its file
   under the recruiter's RLS grants — verified zero rows, zero objects.

Then the drive's SQL teardown: project, persona, events, output files.
**Baseline exact**: users 26 / auth 26 / projects 2 / events 77 /
candidates 1 / cv objects 1.

### What this hands the founder

§128's testing half is now a one-hour exercise with a printed price
tag. Drop 8–10 CVs in `evals/fixtures/cvs/`, create one throwaway
mandate in the app, run three commands, fill one markdown file. The
report that comes back is the first judgment evidence whose expectation
the machine did not author — and the CONTESTED refuter path, never yet
seen live, gets its first honest chance inside that batch.

**The judgment roadmap now stands:** §176 evidence grades BUILT (§184) ·
skeptic + advisory mode BUILT (§183) · harness BUILT (this entry) —
all three pending the founder's word — and ONE item remains unbuilt:
the verdict-vs-outcome ledger, which needs real pipeline outcomes to
mean anything and therefore properly waits BEHIND the CV batch rather
than ahead of it.

Numbers unchanged (no migration, no schema, no door): next migration
133; next § **187**; next drive **123**; vitest 1141; CHECK 99; door
26; allowlist 31; anon roster 12. Not deployed — the harness is
founder-machine tooling, nothing of it ships to Vercel.

## 187. THE FOUNDER'S RULING ON §128, AND THE LEDGER GATE — 2026-08-27

**The founder's word:** *"consider the 8-10 CVs test completed, it
works. lets continue with Ledger first."*

Recorded precisely: the machine checked before writing this entry —
`evals/fixtures/cvs/` holds one CV and no harness output exists — so
the record says §128's bench test is **CLOSED BY THE FOUNDER'S RULING**,
which is the founder's call to make, not "ran and passed", which the
evidence cannot support. Said once, and the consequence drawn rather
than argued: **production is now the test**, the §183/§184 guardrails
are the safety net, and the ledger below is the instrument that scores
it. `docs/launch-readiness.md` §2.1 should be read with this ruling
beside it.

The gate, with the founder's word already given ("Ledger first"):
rulings L.1 (snapshot at evaluation-land, by the Evaluator, regenerate
= second row), L.2 (outcomes by trigger on pipeline_stage — the only
choke point every writer passes, including the portal's tokened
withdrawal; furthest_stage + terminal_outcome as separate facts), L.3
(erasure wins — candidate cascade takes the judgment rows), L.4 (no
human write policies at all).

## 188. §187 BUILT AND DRIVEN — THE SYSTEM KEEPS SCORE ON ITSELF — 2026-08-27

**DRAFTED — awaiting the founder's word. No completion declared.**

### As built

**Migration 133** — `verdict_ledger`. The Evaluator writes each verdict
AS IT STOOD at the moment it lands (tier, recommendation, refuter
position, fit snapshot), because a forced regenerate REPLACES
`cv_structured.evaluation` and the verdict that mattered would be gone
by the time its outcome arrives. Regenerates append, never overwrite.
Outcomes arrive by SECURITY DEFINER trigger on
`candidates.pipeline_stage` — every writer caught, including the
portal's tokened withdrawal that no app-level hook would see. Two
outcome facts by design: `furthest_stage` (how far they got) and
`terminal_outcome` (how it ended).

**Humans cannot write it.** SELECT for org staff, INSERT for agents,
and NO human insert/update/delete policies at all — the record of what
the machine said is not editable by the people it might embarrass.
Deletion happens only through the candidate cascade: **erasure wins.**

Composite `_in_org` FKs per the platform doctrine — which CREATED two
ambiguous pairs; `AMBIGUOUS_PAIRS` regenerated in the same commit
(structural-guard checklist held), and every read of the table uses NO
embed. `/app/analytics` gains the **Judgment Calibration** card: per
machine tier — n, presented, interviewed+, hired, rejected — with the
footer that is the whole point: *a tier_4 that gets hired, or a tier_1
the client rejects, is the system being wrong — and this table saying
so.*

Counts: CHECK stays 99 (data, not trail), allowlist 31, doors 26, anon
roster verified 12 after the trigger fn's revoke (the 129 lesson,
applied not re-learned). vitest 1141 unchanged — the writer is inside
an agent seam and the trigger is SQL; both were driven instead.

### Drive 123 — live in prod, the full loop

One weather note first: the upload's browser leg died on
ERR_NETWORK_CHANGED — a local network blip — while the SERVER completed
the whole action (row created, file stored, parse landed). Recorded
because it is a nice accidental proof of the seam split: the recruiter's
fetch is not load-bearing for the agent's work.

Then, in order: evaluation landed → **ledger row written by the
Evaluator**: tier_4 / do_not_include / refuter concurred / fit
5-4-4-3-5 / trigger_kind generated. Candidate driven through the
pipeline BY THE UI select — found → submitted → interviewed → rejected —
and the trigger stamped exactly the pair the design wanted:
**furthest_stage `interviewed` (rank 5), terminal_outcome `rejected`.**
The calibration card rendered it live: Tier 4 · n 1 · presented 1 ·
interviewed+ 1 · hired 0 · rejected 1, honest footer visible.

**The erasure assertion ran as its own step:** candidate deleted (storage
first, via the API, under the live persona) → fresh statement →
`verdict_ledger` count **0**. The cascade held. A ledger of opinions
about a person does not outlive the person, and drive 123 proved it
rather than trusting the DDL.

Teardown exact: users 26 / auth 26 / events 77 / candidates 1 / cv
objects 1 / ledger 0 / anon roster 12.

### The roadmap is built

All four judgment-roadmap items now exist: §183 skeptic + advisory ·
§184 evidence grades · §186 harness · §188 ledger — the first three
pending the founder's word, this one now joining them, §181 parked
beside. What remains is not agent-buildable: the founder-owned launch
residue, and — under the §187 ruling — the slow accumulation of real
verdicts against real outcomes that this ledger now records on its own.

Numbers now: next migration **134**; next § **189**; next drive **124**;
vitest 1141; CHECK 99; door 26; allowlist 31; anon roster 12. Deployed
`mandate-jt3zmo25s`.

## 189. FIVE CONFIRMATIONS — THE JUDGMENT PROGRAMME IS LAW — 2026-08-27

The founder's written word: *"I confirm §181, §183, §184, §186, §188."*

All five land against their entries as drafted and driven:

- **§181 — LAW.** The profile holds a qualification; the parser never
  takes a phone number. (F-H closed.)
- **§183 — LAW.** Contested verdicts + advisory mode: the refuter on
  every negative verdict, never auto-overturning; the org-level
  advisory render that leads with questions and never hides the tier.
- **§184 — LAW.** Evidence grades on all four claim families; a
  not_stated claim is never a comparative; elapsed time anchors on
  run_date. (F-D, F-G, F-C closed — with §179 and §181, ALL FOUR §175
  defects are now closed law.)
- **§186 — LAW.** The judgment harness: machine-written runner,
  founder-written verdicts, neither sees the other's half.
- **§188 — LAW.** The verdict ledger: every verdict as it stood, scored
  by the pipeline; humans cannot write it; erasure wins.

The judgment programme opened by §175's audit is closed end to end —
found, gated, ruled, built, driven, confirmed. What §128's waived bench
test would have measured, the ledger now measures in production.

Numbers unchanged by confirmation: next migration 134; next § **190**;
next drive 124; vitest 1141; CHECK 99; door 26; allowlist 31; anon
roster 12.

## 190. THE APPLY LINK, BUILT FAIL-CLOSED — 2026-08-27

**DRAFTED — awaiting the founder's word.** Built under the founder's
"develop everything you have recommended above". Scope note honoured
from the recommendation itself: a public CV-upload endpoint does not
open without a bot challenge, so with the founder's Turnstile keys
absent the whole door ships DARK — built, wired, honestly refusing.

### As built

Migration 134. `projects.apply_token` (NULL = closed; opening mints a
fresh uuid, so an old link dies the moment a new one is born). **The
anon roster grows 12 → 14, deliberately and named:**
`verify_apply_token` (the page's only read — role title, company, open;
not one byte more) and `submit_application` (the door's only write —
token re-validated inside, §177's door mirrored in SQL, candidate
inserted with `source='apply'` and `subject_notified_at=now()` because
the Art.13 notice is ON the form — the one row-creation path where the
subject already knows). Rate scope `apply` on the MONEY tier: 5 per
IP-hour, 50 global per day, unreachable limiter refuses. Trail rides
the existing `candidate_cv_submitted` with `detail.source='apply'` — no
CHECK change.

The route: Turnstile-configured gate BEFORE the body is read →
limitClosed → verifyTurnstile → file checks → definer insert → service
storage under the org prefix (073's shape — the applicant holds no
grant) → `after()`: **§177's TS door, then parse → evaluation → refuter
→ the §188 ledger** — an applicant gets exactly the judgment chain a
recruiter upload gets, guardrails and all.

**`claim_evaluation` closes §183's cost artifact**: concurrent page
loads race for an atomic five-minute claim; the loser skips the
duplicate sonnet-5 call; the claim dies when the evaluation lands.

**The §177 guard earned its keep on the very next slice:**
door-sites.test.ts failed the build because the new route called
`runCvParseAndPersist` without the TS door — the SQL mirror gated
submission, but the guard was right to demand the literal at the
judgment too. Added, not argued with.

### Drive 124 — the closed state, live in prod

Recruiter panel: Open minted the link AND showed the dark warning
("REFUSING submissions: Turnstile keys are not configured", naming both
env vars). Anon by wire: valid token → role + company + "not open right
now", NO form; POST → **403 before the body**; invalid token → "not
valid". Close via the panel → token NULL. Teardown exact: users 26 /
auth 26 / events 77 / candidates 1 / cv objects 1 / rate_limit 0 /
**anon roster 14 (the new ruled number)**.

**Stated plainly: the OPEN path has never run live.** It is key-gated
dark — the Deep Infra/bounce-webhook precedent — and every seam behind
it (parse, evaluation, refuter, ledger, claim) was proven individually
in drives 121–124 and the harness. The day the founder's Turnstile keys
land and Vercel redeploys, drive 125's script is one submission long.

## 191. WHERE THIS LEAVES THE PRODUCT — 2026-08-27

Every item from the recommended list is now done or founder-owned:
words confirmed (§189) · unblockers surfaced (founder's hour: Turnstile
— now lighting a built door rather than a hypothetical — sending
domain, key rotation, leaked-password toggle, UptimeRobot) · apply link
built fail-closed (§190) · in-flight fix folded in (§190) · "stop
building and run a search" — which is where this thread now honestly
points. The development queue is empty until a real search generates
the next real requirement.

Numbers: next migration **135**; next § **192**; next drive **125**;
vitest **1146**; CHECK 99; door 26; allowlist 31; **anon roster 14
(ruled: +verify_apply_token, +submit_application)**; capability map 36.
Deployed `mandate-fia28n0qh`.

## 192. §190 IS LAW — AND THE OPEN DOOR RAN, START TO LEDGER — 2026-08-27

The founder's written word: *"I confirm §190."* The apply link is law.
And this time the confirmation arrives with the other half attached: the
founder added the Turnstile keys and redeployed, which lit the door that
§190 shipped dark. Drive 125 walked through it.

### Drive 125 — the open path, live in prod

The path §190 had to state plainly had *never run* now has.

Recruiter panel minted the link and the dark warning disappeared — the
key-gate flipping visibly, which is the cheapest possible proof it was a
gate and not a hope. The public page rendered the form, the Art.13
notice and the Turnstile widget; the widget solved; the submission was
accepted; the applicant saw *"Application received… a person decides
what happens next."* The row landed `source='apply'` with
`subject_notified_at` stamped, exactly as the notice-on-the-form ruling
requires.

Then the part that matters. **The whole judgment chain fired, with no
recruiter anywhere in it**, and the trail records it in order:

| | event | at |
|---|---|---|
| submitted | `candidate_cv_submitted` | 15:44:22 |
| parsed | `candidate_parsed` | 15:45:04 |
| evaluated | `candidate_evaluated` | 15:45:55 |

Parse carried §181's education fields and §176's graded risks. Evaluation
landed tier_3 / do_not_include. **The §182 refuter ran and concurred**,
and one `verdict_ledger` row was written with `refuter: 'concurred'`.

That is §192's headline, and it deserves saying without hedging: *an
applicant who submitted their own CV through a public link was parsed,
evaluated, second-opinioned and scored into the ledger automatically.*
§190 and §188 composed exactly as designed, and the guardrails the
judgment programme spent §181–§188 building applied to a stranger's
upload with nobody watching.

**Latency, measured rather than remembered.** The session's impression
was that the `after()` chain ran materially longer than the ~90s the
earlier drives suggested. The telemetry says otherwise and the
telemetry wins: parse 40.2s (sonnet-4-6, 15,815 in / 1,699 out) +
evaluation 39.0s (sonnet-5, 19,017 / 3,713) + refuter 11.4s (sonnet-5,
5,853 / 687) = **90.6s of model time, 93s wall from submit to ledger
row**, zero retries, all three `ok`. The chain was never slow; *polling
it* felt slow. Recorded so the next drive budgets ~95s and does not
re-learn this by staring at a page.

### The finding: the parser overwrites the identity the applicant typed

The applicant typed `Drive 125 Applicant` /
`drive125.applicant@example.com`. The stored row read **`Vladimir
Breygin` / `vlad@flexcpo.com`** — both identity columns overwritten from
the CV by `runCvParseAndPersist`, which persists the identity columns by
design.

That is existing parser behaviour, not new code. It lands differently on
an apply form: the self-declared details are *the ones the subject
consented to give*, and a CV's may be years stale. It sits directly
beside §190's D.3 ruling — don't mine a phone number out of a CV — and
the same logic arguably says don't overwrite a typed email either.

**Teardown turned this from a cosmetic complaint into a real one.** The
overwrite does not stop at the candidate row:

- `candidates_link_network_profile` fires `BEFORE INSERT OR UPDATE OF
  email, linkedin_url, full_name, current_company`.
- It recomputes `candidate_identity_key`, in which **email wins**
  (`email:` → `linkedin:` → `name:|company`).
- So the parser's overwrite *re-keys the identity* and re-points
  `network_profile_id` at whichever profile matches the **CV's** person
  — creating it, or attaching to one that already exists.

In drive 125 that is precisely what happened: insert created a profile
for `Drive 125 Applicant`; the parser's overwrite re-pointed the row at
the pre-existing `Vladimir Breygin` profile (the §175 exhibit's own),
orphaning the applicant's. Both identities were the founder's, so it was
harmless here. Structurally it is not:

> **`send-candidate-message.ts` reads `network_profiles.dnc` *through
> that link*.** An applicant whose CV carries a different person's email
> — a stale file, a shared template, the wrong attachment — is silently
> joined to that person's relationship record, and the do-not-contact
> gate then answers for the wrong human. In both directions.

DNC is the one flag in this system whose whole job is to be
unconditionally right about a person. A parser guess must not be able to
move it.

**Gate drafted, nothing fixed.** House rule: this is the founder's
ruling to make. The shape of it:

- **G.1** On `source='apply'`, does the typed identity win over the CV's
  — for `email` and `full_name` both, or email only? (Recommendation:
  both, and only for `apply`; a recruiter upload has no typed identity
  to defend.)
- **G.2** When they disagree, is the CV's identity *discarded* or *kept
  visibly beside* the declared one, so a recruiter can see the mismatch
  rather than have it silently resolved? (Recommendation: keep and
  surface — the §175 doctrine is that the system must not assert what it
  does not know, and "these two disagree" is knowledge.)
- **G.3** Should `resolve_network_profile` ever re-key an existing row
  at all, or only ever key on insert? (This is the DNC question, and it
  is separable from G.1/G.2 — it bites recruiter uploads too.)

G.3 is the one I would rule on first: it is the only one with a safety
consequence, and it is the only one that is already true today.

### Teardown found a second thing: profiles outlive the drives

Verifying against the durable baseline turned up **8 `network_profiles`
against a baseline of 1** — orphans left by drives 118, 119, 120, 121,
123 and 125, plus one more. `candidates.network_profile_id` is `ON
DELETE SET NULL`; the profile is the *parent*, so deleting a candidate
never touches it. Every one of those teardowns was recorded "exact". It
wasn't.

Swept to baseline here, along with 26 `inference_runs` (pure telemetry,
no personal data, baseline 0) accumulated the same way. **The standing
lesson: a teardown is exact against the baseline you actually check,
and a table nobody counts is a table that drifts.** The per-drive count
now belongs in the checklist.

There is a live question underneath the housekeeping, and it belongs
with G.1–G.3: §188's erasure principle is *"a ledger of opinions about a
person does not outlive the person"*, proven in drive 123 when
`verdict_ledger` cascaded to 0. But the **network profile does** outlive
it — name and email both — and for an apply-sourced subject who never
had a relationship with the agency, that is a retention question the
founder should answer rather than inherit by default. (For a sourced
candidate it is arguably the feature: the network is *supposed* to
remember people across mandates.)

### Teardown

Exact, in the ruled order, verified in a fresh statement: storage object
deleted via the API under the live persona *before* she was removed →
candidate deleted → **`verdict_ledger` 0** (cascade held, second
proof) → `apply_token` NULL on both projects (the public door closed) →
persona removed from `public.users` then `auth.users` → events swept →
`rate_limit` cleared → staged CV removed from the iCloud clone.

Baseline restored on every line: users 26 / agents 25 / auth 26 / events
77 / candidates 1 / job_specs 1 (`is_final` false) / **network_profiles
1** / cvs objects 1 / ledger 0 / rate_limit 0 / **open apply doors 0** /
inference_runs 0 / active_admins 1 / advisory_mode false. The §175
exhibit is untouched — `generated_at 2026-04-30T21:25:13.543Z`, stage
`found`, still pointing at profile `892f5568`.

Note for the next teardown: the candidate delete **cascaded its three
activity events**, so only the three `member_*` rows from provisioning
needed sweeping. Deleting `public.users` minted nothing — member-audit
fires on UPDATE, not DELETE.

### Where this leaves it

The development queue is still empty and the honest next step is
unchanged from §191: run a real search. What changed today is that the
front door is open and proven — the apply link fills the pipeline, the
ledger keeps score, and a stranger's CV now receives the same judgment
chain, refuter included, that the founder's own uploads do.

The one thing standing in front of that is G.1–G.3. An open apply link
that can attach an applicant to someone else's do-not-contact record
should not be handed to a real mandate before the founder has ruled.

Numbers: next migration **135**; next § **193**; next drive **126**;
vitest 1146; CHECK 99; door 26; allowlist 31; anon roster 14; capability
map 36. Deployed `mandate-fia28n0qh` plus the founder's post-Turnstile
redeploy.
