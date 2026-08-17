# Sample-data inventory — every dashboard route

**Date:** 2026-08-14. Built by enumerating `src/app/(dashboard)/**/page.tsx`
and reading the routes, not from an earlier note.

**It is 46 routes, not 36.** The "other 36 pages" figure in the handoff
predates the Executive Intelligence, placements, activity and clients work.
Nine of the 46 already render sample content.

This is an inventory and a proposal. Nothing here is implemented.

---

## 1. Decisions needed before implementation

Four, and the first is the expensive one. D4 is already done.

### D1. What may a fabricated agent say about a fabricated person?

Twelve of these routes display **AI judgement** — assessments, risk reviews,
interview plans, positioning, comparative reports, tier rankings. Sample data
for those is not "write some rows"; it is authoring an evaluative opinion
about an invented executive and rendering it in the product's own voice.

Two existing rules collide here:

- `CLAUDE.md`, non-negotiable: AI output is **decision support**, never a
  hire/no-hire verdict, never psychological or mental-health labels, never
  inference of protected characteristics.
- Illustrative data must carry a **visible label at the point of display**.

A sample risk review that says nothing is useless as a demo; one that says
something is a fabricated negative judgement about a person-shaped thing,
rendered in the same components that will later render a real one. The
existing `sample-ei-report.tsx` already makes a call here — **that call
should be reviewed and then applied deliberately to the other eleven**,
rather than re-decided per page.

**Needs the founder.** Everything in the Executive Search workstream is
blocked on it.

### D2. ~~Does sample data survive the Anthropic credit landing?~~ — ANSWERED 2026-08-14

**Credit is on the account and the agents run.** Verified end to end: the
candidate search parsed a natural-language query into intent, must-haves and
nice-to-haves, scored the pool, and returned a ranked match with its
reasoning. First real agent run in the product.

This changes the *approach* for the nine agent-output routes, not just the
estimate. The recommendation is now firm: **seed one coherent mandate and let
the real agents fill it**, rather than hand-writing fixtures that will drift
from what the agents actually produce. Hand-written agent output would also
be the hardest kind to keep honest under D1.

It also moves the whole loop — intake → research → spec → calibration →
sourcing → evaluation — from "never run" to "runnable", which is worth doing
once for its own sake before more sample-data work. Expect it to surface
defects; every screen opened for the first time in the last four sessions
has.

### D3. ~~One label mechanism, decided once~~ — ANSWERED 2026-08-17

**Page level, two markers, no per-row marker.** A screen in sample mode
carries `SampleBanner` as the first element in its content region and
`// sample data` in its own subtitle. Nothing else.

The rejected alternative was a `SAMPLE` chip on every fabricated row. It
survives a cropped screenshot, which the banner does not — but it costs a
column on tables already tight at 360px, repeats the same word up to twenty
times a screen, and would be re-invented by each remaining route. One
mechanism that five screens already ship beats a second one argued per page.

The rule it satisfies: the banner *is* at the point of display. It is the
first thing in the content region, so a screen reader meets it before the
invented figures, and it cannot be dismissed without dismissing the sample.

Written into the header of `src/lib/sample/index.ts`, which is where the
next eleven pages will look. **Do not invent a third mechanism** — if a
screen seems to need one, the question is whether it should show a sample.

### D4. ~~Two pages ship a developer message to customers~~ — FIXED 2026-08-14

`/app/executive-intelligence/competencies` and `.../templates` both told the
reader "the global set is seeded by migration 033 — check that it has been
applied". Not a sample-data gap; a defect, and fixed separately from this
programme.

It was wrong twice over. The catalogue **is** seeded — 24 global
competencies and 8 global templates, all with `organization_id IS NULL` —
and 056's policy admits those to every active account, so a brand-new
organisation with no data of its own still sees the full library. Verified
by impersonation. The empty branch therefore cannot mean "your organisation
has not set this up", and in a provisioned project it does not render at
all.

**Which is why the copy survived: the branch is unreachable, so nobody ever
saw it.** Worth remembering when reading the rest of this inventory — an
`empty-only` classification below means the empty state is what a *real*
account lands on, and those are a different matter entirely.

Both pages also rendered `error.message` — a raw PostgREST string — to the
customer. Same class as the AI-error leak fixed earlier; the detail now goes
to the server log and the reader gets a sentence.

---

## 2. Legend

**State** — `complete` (has sample or needs none) · `empty-only` (renders a
bare empty state) · `placeholder` (developer or stub text) · `thin` (real
shape, unconvincing content) · `n/a` (form, error or redirect page).

**Kind** — `simple` (a few rows) · `workflow` (needs a coherent mandate
around it) · `generated` (needs agent output — see D1/D2) · `relational`
(needs other entities to exist first).

**Size** — S <1h · M 1–4h · L >4h.

---

## 3. Workstreams

### W1 · Administration & Settings — 8 routes — DONE 2026-08-14

Lowest risk, no product decisions, no agent output. It turned out to be one
page of work, not three, and the survey's own caveat about `thin` being a
judgement call is why:

- **`/app/settings` needs nothing.** It renders real account data — org name,
  slug, created date, founders, role — and is complete for any real account.
  It only looked thin against the founder's near-empty org.
- **`/app/settings/waitlist` should not get sample data.** It is founder-only
  and Mandate-internal; no customer ever sees it, so fabricated rows would
  have no demo value. Inventing people "requesting access" is also the wrong
  kind of fabrication. Its empty state ("No requests in this state.") is
  adequate.
- **`/app/settings/skills` was the one worth doing**, and is done.

| Route | State | Kind | Size | Depends on | Value |
|---|---|---|---|---|---|
| `/app/settings` | complete | — | — | — | — |
| `/app/settings/members` | complete | — | — | — | — |
| `/app/settings/waitlist` | complete | — | — | — | — |
| `/app/settings/skills` | complete | — | — | — | — |
| `/app/settings/skills/new` | n/a | — | — | — | — |
| `/app/settings/skills/[skillId]` | n/a | — | — | — | — |
| `/app/no-access` | complete | — | — | — | — |
| `/app/activity` | empty-only | relational | M | W2, W3 | High |

**Note:** `/app/activity` is listed here but is genuinely last — the trail is
a *projection* of other entities. Seeded before them it reads as noise;
seeded after them it fills itself. Still outstanding.

**What the skills page got**, since it is the pattern for the rest: three
worked examples, one per type, because the type is the lesson. A skill is the
most abstract object in the product and the empty state could only describe
one. The rows are read-only — no toggle, no delete — because they are not
that org's rows and a control that cannot work is worse than the empty state
it replaced. The create CTA stays, being the one action that does apply. None
of the three is a hire/no-hire rule; skills steer how an agent reads
evidence, and a sample implying otherwise would teach the wrong thing on the
one screen whose job is teaching.

### W2 · Client Experience — 2 routes — DONE 2026-08-17

| Route | State | Kind | Size | Depends on | Value |
|---|---|---|---|---|---|
| `/app/clients` | complete | — | — | — | — |
| `/app/clients/[id]` | complete | — | — | — | — |

The client entity is complete in the schema (§5c), so this was data only.
The detail page carries four panels — contacts, notes, commercial terms,
mandates — and all four have content, which was the founder's call: a page
with two of four empty is not a demo of the entity.

**What it got, and the three rules that shaped it.**

Seven clients — the same seven companies as `SAMPLE_MANDATES`, so a prospect
clicking Mandates → Clients lands on the same firms rather than a second
invented world.

1. **Mandate counts are derived, not typed.** The real list counts every
   `projects` row for the client with no status filter; `SAMPLE_MANDATES`
   holds only searches in flight. So a client states its *closed* searches
   and the count is live + closed — which is also what stops the column
   being seven identical `01`s. `clients.test.ts` asserts both directions:
   no mandate without a client, no client naming a mandate that is gone.
2. **`fees:read` still gates the money.** Commercial terms and `commercial`
   notes are hidden from a researcher or a viewer here exactly as RLS hides
   them on a real client, and the count says "02 notes", never
   "03 // 1 restricted" (§5c). A sample that showed everyone the rate card
   would teach the opposite of what the product does — worse than teaching
   nothing, on the one screen whose job is teaching.
3. **A note is about the deal, never about the person.** §5c records why:
   legitimate interest covers a name, title and number collected inside a
   commercial relationship, and stops covering the moment a note carries an
   assessment of the individual. Every note is process, logistics or terms.
   The constraint is written into `data.ts` beside the fixture.

Read-only throughout — no add, edit, archive or delete — the same call the
skills studio made in `5107767`: these are not the reader's rows, and a
control that refuses is worse than the empty state it replaced.

Three partial states are carried on purpose and pinned by a test, because a
demo in which every record is complete teaches that the product arrives
full: one client not yet researched, one with no agreement on file, and one
retained plan whose thirds sum to 100% rather than 99.999 (§5a).

**Also fixed here:** `/app/clients` rendered `error.message` — a raw
PostgREST string — into the page body. Same class as D4, and a real leak
rather than a redacted one, because a page body is server-rendered.

### W3 · Mandates & Projects — 11 routes — DONE 2026-08-17

| Route | State | Kind | Size | Depends on | Value |
|---|---|---|---|---|---|
| `/app/home` | complete | — | — | — | — |
| `/app/projects` | complete | — | — | — | — |
| `/app/projects/[id]` | complete | — | — | — | — |
| `/app/projects/new` | n/a | — | — | — | — |
| `/app/projects/[id]/onboarding` | complete | — | — | — | — |
| `/app/projects/[id]/spec` | complete | — | — | — | — |
| `/app/projects/[id]/calibration-history` | complete | — | — | — | — |
| `/app/projects/[id]/metrics` | complete | — | — | — | — |
| `/app/projects/[id]/reports` | complete | — | — | — | — |
| `/app/projects/[id]/hiring-manager` | complete | — | — | — | — |
| `/app/projects/[id]/feedback` | complete | — | — | — | — |

Everything hangs off `sample-larkspur`, so this was extending one coherent
mandate rather than inventing seven.

**The survey missed the thing that mattered.** It classified these routes by
what they render when empty; none of them was reachable from the sample at
all. Every sub-route of `/app/projects/sample-larkspur` — these seven plus
`/sourcing`, `/ranking`, `/shortlist` and `/comparison` — passed
`sample-larkspur` to a Postgres query, failed on a malformed uuid, and fell
through to `redirect("/")`. **Eleven routes silently returning a prospect to
the dashboard**, and the sample mandate page linked to none of them, so the
sample workspace was one screen deep and nobody had noticed.

So W3 is a module rail plus seven screens plus an honest state for the four
that belong to W5/W6 — named rather than omitted, because a rail that leaves
them out still leaves a typed URL and a bookmark doing the old thing.

**D1 did not block any of it, and the reason is worth keeping.** Only two of
these screens carry agent judgement about a person — the hiring-manager slate
and the weekly report — and both do it in the shape
`sample-candidate-detail.tsx` already set: **a score never travels without
the fact that produced it**. The remaining agent output is about the *search*
(a boolean string, a stale slate, a re-score) or about *patterns across
decisions*, which is what the feedback screen's bias block is. That block is
written as arithmetic — the stated reason against the record, both halves
shown — so it is a pattern a reader can check and disagree with. What W7 is
still held for is long-form narrative risk assessment, which is a different
thing.

**One defect found by building it.** The mandate page said the spec was at v4
and the calibration model had nine dimensions approved on day 4; `/spec` said
FINAL_V01 and `/calibration-history` said five dimensions recalibrated on day
22 from client feedback. Two screens describing the same search, disagreeing
on every number they shared — because the mandate page had typed its own
copy. It now derives them from the fixture, and
`src/lib/sample/mandate-modules.test.ts` pins the fixture's internal
consistency: the funnel head equals the mandate's own candidate count, the
funnel never widens, every calibration version sums to 100, the feedback
screen's "applied as v03" matches the weights on the calibration screen, and
the report only names candidates who are on the slate.

### W4 · Candidate Management — 5 routes

| Route | State | Kind | Size | Depends on | Value |
|---|---|---|---|---|---|
| `/app/candidates` | complete | — | — | — | — |
| `/app/projects/[id]/candidates/[candidateId]` | complete | — | — | — | — |
| `/app/projects/[id]/candidates` | empty-only | relational | M | W3 | High |
| `/app/projects/[id]/candidates/new` | n/a | — | — | — | — |
| `/app/candidates/network` | empty-only | relational | M | candidates across mandates | Med |

`/app/candidates/network` needs candidates in **more than one** mandate to
show anything meaningful — it is a cross-mandate dedupe view. That makes it
dependent on the sample workspace having a second mandate, which it
currently does not.

### W5 · Research & Sourcing — 3 routes

| Route | State | Kind | Size | Depends on | Value |
|---|---|---|---|---|---|
| `/app/projects/[id]/sourcing` | empty-only | generated | M | final spec, D2 | High |
| `/app/projects/[id]/sourcing/runs/[runId]/import` | empty-only | workflow | M | sourcing run | Med |
| `/app/candidates/search` | empty-only | generated | M | D2 | Med |

All three are agent-output surfaces. `/app/candidates/search` cannot show a
sample result at all without either fabricated agent output or a live API —
its empty state is currently a *good* one (it suggests example queries), so
this may be the right answer already.

### W6 · Reports & Analytics — 4 routes

| Route | State | Kind | Size | Depends on | Value |
|---|---|---|---|---|---|
| `/app/analytics` | thin | relational | L | W3, W4, placements | High |
| `/app/placements` | complete | — | — | — | — |
| `/app/projects/[id]/ranking` | empty-only | generated | M | candidates + scores | High |
| `/app/projects/[id]/ranking/compare` | empty-only | generated | M | ranking | Med |
| `/app/projects/[id]/comparison` | empty-only | generated | L | D1, candidates | Med |

`/app/analytics` is 342 lines of portfolio aggregation and is the page most
improved by everything else being seeded — it needs no fixtures of its own
if W3/W4 land.

### W7 · Executive Search Workflow — 11 routes

**Entirely blocked on D1, and its approach depends on D2.**

| Route | State | Kind | Size | Depends on | Value |
|---|---|---|---|---|---|
| `/app/executive-intelligence` | thin | relational | M | searches | Med |
| `/app/executive-intelligence/searches` | empty-only | relational | M | — | High |
| `/app/executive-intelligence/searches/new` | n/a | — | — | — | — |
| `/app/executive-intelligence/searches/[id]` | complete | — | — | — | — |
| `.../searches/[id]/success-profile` | empty-only | generated | L | D1 | High |
| `.../searches/[id]/candidates` | empty-only | relational | M | search | High |
| `.../candidates/[candidateId]/assessment` | empty-only | generated | L | D1 | High |
| `.../candidates/[candidateId]/interview-plan` | empty-only | generated | L | D1, profile | High |
| `.../candidates/[candidateId]/report` | complete | — | — | — | — |
| `/app/executive-intelligence/competencies` | complete | — | — | — | — |
| `/app/executive-intelligence/templates` | complete | — | — | — | — |

The last two are done — see D4. They needed no sample data at all: both
render a seeded global catalogue for every account, and the apparent gap was
copy on a branch that never runs.

---

## 4. Recommended order

1. ~~**D4 fix** — the two migration-033 messages.~~ Done 2026-08-14.
2. ~~**W1 Administration** (minus `/app/activity`).~~ Done 2026-08-14 —
   one page of work, not three.
3. ~~**W2 Client Experience**~~ — done 2026-08-17. Two routes, seven
   clients, and D3 answered on the way.
4. ~~**W3 Mandates**~~ — done 2026-08-17. Seven module screens, a rail, and
   the fix for eleven sub-routes that redirected to `/app/home`.
5. **W4 Candidates** — falls out of W3 cheaply once the mandate exists.
6. **W6 Reports & Analytics** — mostly free once 3–5 land.
7. **W5 Research & Sourcing** — unblocked by D2; approach is now "seed a mandate, let the agents run".
8. **W7 Executive Search** — still held for **D1**. D2 is answered and sets the approach.
9. `/app/activity` last, as a projection of everything above.

**Do not start at W7** despite it being the largest and most impressive
surface. It is the one where a wrong answer to D1 is both expensive and
reputationally dangerous.

---

## 5. Honest caveats

- **Classification came from reading route structure, imports and empty-state
  strings.** Nine routes were driven in a browser this session; the rest were
  read, not run. Expect the sizes to be wrong by a factor of two in places.
- **`thin` is a judgement call.** A page like `/app/settings` renders real
  data for a real account and only looks sparse on the founder's near-empty
  org. It may need nothing.
- **Sizes assume the fixture approach already in `src/lib/sample/data.ts`.**
  If D2 resolves toward seeding a real mandate and letting the agents run,
  W5 and W7 change shape entirely and most of their `L`s disappear.
