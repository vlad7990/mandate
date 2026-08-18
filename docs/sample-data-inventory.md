# Sample-data inventory — every dashboard route

**Date:** 2026-08-14, built by enumerating `src/app/(dashboard)/**/page.tsx`.
**Completed 2026-08-18.**

**It is 46 routes, not 36.** The "other 36 pages" figure in the handoff
predates the Executive Intelligence, placements, activity and clients work.

**All 46 are done.** This began as an inventory and a proposal; it is now
the record of what was built and why. Each workstream section carries the
decisions taken inside it and the defects building it exposed — several of
which were not sample-data problems at all. §6 collects what is worth
carrying forward.

---

## 1. Decisions needed before implementation

Four. **All four are now answered**; D1 was the expensive one and turned
out not to be a decision.

### D1. ~~What may a fabricated agent say about a fabricated person?~~ — ANSWERED 2026-08-18

**It was two screens, not twelve, and both were already inside precedent
the product had written down.** The question was real; the surface was
not. This document classified pages by what they look like, and the
classification was wrong in the most expensive direction.

What the code actually says, checked file by file:

- **No page under `/app/executive-intelligence` renders agent output
  directly.** Every one reads a stored row. Exactly three action files
  invoke an agent: `searches/new` (company context), `success-profile`,
  and `interview-plan`.
- **The assessment is not agent-generated.** `assessment/actions.ts`
  imports `buildAssessmentSkeleton`, `applyRollup` and
  `normalizeAssessment` from `executive-assessment.ts`, which contains no
  model call at all. `types.ts` says so above `AssessmentRow` — *"No AI
  provenance columns: there is no agent"* — `ASSESSMENT_DISCLAIMER` exists
  as a separate string because the record is a human's, and `report.ts`
  prints *"Assessment authored by a human · no AI"* into every report's
  provenance. **The one screen in the module carrying an evaluative
  judgement of a person is the one screen with no AI in it.** The
  `generated` classification below was read off the layout.

So the surface was the success profile and the interview plan:

- The **success profile describes the role, never a candidate.**
  `SuccessProfileContent` has fifteen fields and not one names, scores or
  characterises a person; the agent's own header states the constraint.
  `potential_derailers` is the field that looks like the exception and is
  a property of the job.
- The **interview plan** is the only place an agent says anything shaped
  by a specific person — and its system prompt already draws the line:
  *"Weak-answer indicators and red flags describe ANSWER CONTENT and
  observable reasoning, not the person's character"*, questions gather
  evidence about "a demonstrable capability or experience — never about
  who the person is", and candidate-specific questions derive only from
  supplied data, never invented.

Which is the W3/W6 precedent restated — **a score never travels without
the fact that produced it** — so no new founder decision was needed, the
same way `/comparison` turned out not to need one. The reasoning is
written into the header of `src/lib/sample/executive.ts` and
`sample-ei-interview-plan.tsx`, and `executive.test.ts` asserts the
assessment carries no verdict phrasing.

**What this cost, and the lesson worth keeping:** W7 sat blocked through
six workstreams on a question that a twenty-minute read of three action
files would have dissolved. The survey classified by screenshot. Do the
grep before recording a blocker.

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
| `/app/activity` | complete | — | — | — | — |

**Note:** `/app/activity` was listed here but was genuinely last — the trail
is a *projection* of other entities. Seeded before them it reads as noise;
seeded after them it fills itself. **Done 2026-08-18**, after everything it
projects.

**It stores rows, not prose.** 053 keeps the facts in `detail` and derives
the sentence in `describe.ts`, so a phrase can improve without rewriting
history. The fixture honours that split exactly: `src/lib/sample/activity.ts`
builds `ActivityEventRow` objects and the page runs them through
`describeActivity` and the same renderer as real rows. The sample therefore
cannot word an event differently from the product, and cannot invent an
event type — `event_type` is `ActivityEventType`, so a made-up one fails the
build.

Three things it demonstrates that no other screen can: the fallthrough
recorded as a status change **plus** a reversal rather than a deletion
(§5a's third commercial decision, shown rather than described, with the
reversal quoting the same figure `/app/placements` shows clawed back); one
row with a null actor, so a reader meets "System" once rather than
wondering at it later; and visibility that is real — `fees` rows are hidden
from a reader without `fees:read` and `admin` rows without `org:manage`,
mirroring RLS rather than approximating it. A control run that flipped one
fee row to `org` failed the test.

Two silences carried on purpose: `report_exported` and `hm_portal_opened`
are in the vocabulary, are never written by the product, and are absent
here. A sample showing an event the product cannot produce would teach a
feature that does not exist.

The sample is shown **only unfiltered** — a reader who has typed a search
or picked a group is asking a question about their own data, and answering
it with invented rows would be a lie rather than an illustration.

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

### W3 · Mandates & Projects — 12 routes — DONE 2026-08-17

*(Twelve, not eleven: `/shortlist` was missing from this table entirely and
was added 2026-08-18 when W7 built it. See the note at the end of W5.)*

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
| `/app/projects/[id]/shortlist` | complete | — | — | — | — |

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

### W4 · Candidate Management — 5 routes — DONE 2026-08-17

| Route | State | Kind | Size | Depends on | Value |
|---|---|---|---|---|---|
| `/app/candidates` | complete | — | — | — | — |
| `/app/projects/[id]/candidates/[candidateId]` | complete | — | — | — | — |
| `/app/projects/[id]/candidates` | complete | — | — | — | — |
| `/app/projects/[id]/candidates/new` | complete | — | — | — | — |
| `/app/candidates/network` | complete | — | — | — | — |

The Network worry in the original survey — that it needs candidates across
more than one mandate — was already solved: `SAMPLE_NETWORK` has existed
since the first sample commit and folds three people across six appearances
in five mandates. The page simply never rendered it.

The mandate candidate list gained four more Larkspur candidates, because
three produced two pipeline groups and the screen's whole idea is the
pipeline. It now shows seven across four stages and **says so** — "07 shown
of 18 in the pool" — rather than quietly presenting seven as the pool. All
three KPI tiles read from the mandate row so they share one scope; an earlier
version put "In the pool 18" beside a tier-1 count of the rows on screen.

### The bounce class, closed — 2026-08-17

W3 found eleven routes under `/app/projects/[id]` that took a sample id
straight to Postgres, got `22P02` back rather than `PGRST116`, and fell into
the `redirect("/")` arm meant for "that record is not yours". **Nine more had
the identical shape**: `candidates/new`, `ranking/compare`,
`sourcing/runs/[runId]/import`, four executive-search routes, and the skill
detail. Twenty routes, one defect, invisible to every test that existed
because they all render correctly for a real uuid.

All twenty now handle it — with a sample screen where one exists, and with
`SampleNotBuilt` where it does not, which says the gap is the sample's rather
than moving the reader somewhere they did not ask to go. Being unreachable by
clicking was never a fix: a typed URL, a bookmark and a shared link all still
arrive, and the sample exists for people exploring without a map.

`src/lib/sample/routes.test.ts` walks the route tree rather than naming the
twenty, so a dynamic page added next month is covered the day it exists —
the same shape as assertion (1) in `suspended_account_invariants.sql`. Its
exemption list is empty and needs a written reason to grow. A control run
that deleted one branch failed naming that route; the first version of the
test matched the leftover `isSampleId` *import* and passed, which is why it
now requires the call.

### W5 · Research & Sourcing — 3 routes — DONE 2026-08-17

| Route | State | Kind | Size | Depends on | Value |
|---|---|---|---|---|---|
| `/app/projects/[id]/sourcing` | complete | — | — | — | — |
| `/app/projects/[id]/sourcing/runs/[runId]/import` | complete | — | — | — | — |
| `/app/candidates/search` | complete | — | — | — | — |

**`/sourcing`** gets the six boolean slots with their version history, the
target-company thesis and the run log. The strings are real syntax — the kind
a researcher would paste into LinkedIn Recruiter — because the claim of the
feature is that it saves them an hour, and a toy string demonstrates the
opposite. Its **archetype tab needed nothing**: `ArchetypePanel` renders
static reference content identical for every mandate, so it already read
correctly. Saying so is the right outcome, as it was for `/app/settings`.

**`/app/candidates/search`** gets a worked example above the live form: the
query, what the agent parsed out of it, three ranked matches each with its
reasoning, and a count of what fell below the noise floor. The survey
wondered whether its empty state was already the right answer; it is a good
empty state, but it describes the feature rather than showing it, and this is
the product's most distinctive screen.

The example is **not** wired to what the reader types. A real query against
an empty pool still falls through to the product's own "no matches" state —
verified. Answering an arbitrary question with a canned result is the one
dishonesty this screen cannot afford, since its whole claim is that the agent
reasons about what you asked.

**`/sourcing/runs/[runId]/import` keeps the honest not-built state**, and
that is the deliverable rather than a gap. It is a mid-workflow step whose
entire content is a staging table waiting for a promote — a write the sample
cannot perform — so a read-only copy would be rows with the one control that
gives them meaning removed. Same reasoning as `/candidates/new`.

**~~Still outside every workstream:~~ `/app/projects/[id]/shortlist`** —
done 2026-08-18, and now in W3's table where it always belonged.

It appeared in no table in this document. A gap in the original survey,
found when the module rail needed a complete list, and it survived six
workstreams because nothing enumerated the routes — only the list. The
guard is now the other direction too:
`mandate-modules.test.ts` walks
`src/app/(dashboard)/app/projects/[id]/*/page.tsx` and fails on any module
directory that appears in neither `SAMPLE_MODULES` nor
`SAMPLE_MODULES_PENDING`. Same shape as `routes.test.ts`. A control run
that removed the shortlist entry failed naming it.

**It is a record, not a builder**, and that is the whole design. The real
screen is `ShortlistBuilder` — pool, slate, compose, generate, submit —
and almost every control on it is a write. Disabling them would be the
worst option available, because on this screen the controls *are* the
screen. `SAMPLE_MANDATES` puts Larkspur at **WITH CLIENT**, so the slate
has already gone, and a submitted shortlist is read-only in the real
product too. Nothing there is a sample limitation dressed as a design.

The two names are `SAMPLE_COMPARISON.primarySlate`, so this screen and
`/comparison` cannot name different people; ranks and scores come from
`sampleRanking()`. The backups are named rather than hidden — who was held
back is half of what a submission record is for.

`SAMPLE_MODULES_PENDING` is now **empty**, and the rail's "Not in the
sample" cell renders only when it is not: a cell asserting a gap that no
longer exists is worse than no cell.

### W6 · Reports & Analytics — 5 routes — DONE 2026-08-17

| Route | State | Kind | Size | Depends on | Value |
|---|---|---|---|---|---|
| `/app/analytics` | complete | — | — | — | — |
| `/app/placements` | complete | — | — | — | — |
| `/app/projects/[id]/ranking` | complete | — | — | — | — |
| `/app/projects/[id]/ranking/compare` | complete | — | — | — | — |
| `/app/projects/[id]/comparison` | complete | — | — | — | — |

**`/comparison` was not blocked on D1, and never had been.** The survey
classified it `generated`; it calls no agent at all. The master table, the
tier bands, the reality statement and the final partner take are all computed
in TypeScript from scores and weights (`comparison-export.ts` —
`buildRealityStatement`, `buildPartnerTake`). The only agent in this
workstream is the trade-off analysis on `/ranking/compare`, and the product's
own prompt already draws the line it works inside: comparative, anchored on
the role weights, "stronger" and "weaker" *relative to the others in the
set*. So W6 needed no new judgement about what an agent may say — it applies
the precedent `sample-candidate-detail.tsx` set to five dimensions and six
people. **D1 remains open, and W7 remains the only thing held for it.**

`/app/analytics` did need a fixture after all. The survey said it "needs no
fixtures of its own if W3/W4 land", which was true of a *seeded* workspace
and not of this one: the sample is a render-time fixture, so the analytics
page still queried an empty database and drew four zeroes. It now derives
every figure from `SAMPLE_MANDATES`.

### The sample was teaching a vocabulary the product does not have

Found while writing the leaderboard. The scoring engine has exactly five
dimensions — `DIMENSION_KEYS`: technical, domain, leadership, regulatory,
transformation — and a calibration model is one weight per key. There is
nowhere in the schema for a custom dimension name.

The sample had five invented prose ones — "Regulated-environment scale",
"Platform modernisation", "Executive stakeholder handling", "Team build &
retention", "Delivery pace" — in `sample-candidate-detail.tsx` since the
first sample commit, and W3 carried them into the calibration history and the
feedback screen. They read better than the real five and they taught a
prospect a vocabulary they would never see again after signing up.

All of it is now on the product's five, with the specificity moved into the
evidence line where it belongs. `mandate-modules.test.ts` asserts the
calibration versions and the feedback weight changes use exactly
`DIMENSION_KEYS` and nothing else.

### What the fixtures pin

Scores are derived, not typed. A candidate's `fit` is already on the mandate
list, the candidate list and the client slate; the leaderboard computes the
weighted mean of five dimension scores and `reports-analytics.test.ts`
asserts it rounds back to that same `fit` for all six candidates. The tier on
the leaderboard must equal the tier on the candidate row, the ranking may not
put a worse tier above a better one, the slates may only name ranked
candidates, and the three scores quoted in the partner take must match the
leaderboard.

One number was caught in a screenshot rather than by a test — the reality
statement said "two at Tier 2" beside a table showing three. There is a test
for it now.

### W7 · Executive Search Workflow — 11 routes — DONE 2026-08-18

| Route | State | Kind | Size | Depends on | Value |
|---|---|---|---|---|---|
| `/app/executive-intelligence` | complete | — | — | — | — |
| `/app/executive-intelligence/searches` | complete | — | — | — | — |
| `/app/executive-intelligence/searches/new` | n/a | — | — | — | — |
| `/app/executive-intelligence/searches/[id]` | complete | — | — | — | — |
| `.../searches/[id]/success-profile` | complete | — | — | — | — |
| `.../searches/[id]/candidates` | complete | — | — | — | — |
| `.../candidates/[candidateId]/assessment` | complete | — | — | — | — |
| `.../candidates/[candidateId]/interview-plan` | complete | — | — | — | — |
| `.../candidates/[candidateId]/report` | complete | — | — | — | — |
| `/app/executive-intelligence/competencies` | complete | — | — | — | — |
| `/app/executive-intelligence/templates` | complete | — | — | — | — |

Competencies and templates were done by D4. They needed no sample data at
all: both render a seeded global catalogue for every account, and the
apparent gap was copy on a branch that never runs.

Everything hangs off one search — `sample-search-northvale`, the Chief
Operating Officer engagement the workspace and report components already
pointed at — the way W3's seven module screens hang off `sample-larkspur`.
`src/lib/sample/executive.ts` is the single source; `executive.test.ts`
pins it.

**Three searches, not one.** A list screen with a single row demonstrates
a detail page. The other two sit at earlier states, and the middle one is
load-bearing beyond its own screen: the home page's priority card reads
"Success profile draft ready for approval" and used to name Northvale,
whose profile the workspace showed as **approved at v3**. Two screens, one
artifact, two answers. It names Thornbury now, and a test pins that
exactly one sample search is ever in that state.

#### The sample was teaching a vocabulary the product does not have — again

W6 found this with five invented scoring dimensions. It was happening here
too, and worse, because this module ships the real vocabulary as a
clickable screen.

`sample-ei-workspace.tsx` and `sample-ei-report.tsx` both hard-coded six
competency names — "Partner-level influence", "Talent architecture",
"Capital & cost discipline" — and **not one of them is in
`executive_competencies`**, the 24-row seeded catalogue that
`/app/executive-intelligence/competencies` renders one click away. A
prospect reading the sample learned six terms they would never find again.

All six are now real keys with the catalogue's own labels
(`scaling_systems`, `regulatory_compliance`, `cross_functional_influence`,
`financial_stewardship`, `talent_magnetism`, `technology_strategy`).
`executive.test.ts` parses `033_executive_intelligence_seed.sql` and fails
on any key or label the migration does not contain, so this cannot recur
by hand-editing a component.

#### The report is compiled, not written

`sample-ei-report.tsx` used to hand-write its coverage table, its
thin-evidence paragraph and its provenance block — somebody had
transcribed `buildThinParagraphs`' output into a string literal. It now
runs the fixture through **`compileExecutiveReport`, the same pure
function the real report uses**. Three things the transcription had
already got wrong and this cannot:

- It cited evidence as coming from *"stages 1, 3"*. The compiler filters
  `source_stages` against the approved plan's stage **names** and drops
  the rest, so those citations would have rendered as nothing.
- It omitted `weightedStrengthPercent`, which the real report shows beside
  the coverage figure. The two answer different questions — how much of
  the weight is covered (100%) versus how strong that evidence is (83%) —
  and showing only the first flatters the document.
- Its six competencies were the invented names above.

#### What the fixtures pin

Nothing countable is typed twice. The chain's badges are derived from the
candidate array, so the header can no longer say "4 candidates in
diligence" above a chain saying "2 in diligence" — which is what it said.
`competency_coverage` is computed from stage assignments, so a plan cannot
claim coverage its own stages do not deliver. The assessment's
`evidence_rollup` and `weighted_evidence_strength` come from
`computeEvidenceRollup` and `computeWeightedEvidenceStrength` rather than
being typed, because the product stamps them server-side and never trusts
a client copy.

**The audit trail's link events drift-tested immediately.** Typed once,
they put Rachel Sowande's link on day 30 while her own row said day 23 —
found by reading the rendered page, not by a test, which is now the third
time in this programme. `linkedDaysAgo` is the only place a link date
lives, and there is a test.

#### Two placements were billing searches that were still running

Not a W7 gap, found by building on top of them, and both had teeth:

- `SAMPLE_PLACEMENTS` recorded **Daniel Okonjo as started in the COO seat
  at Northvale** — the search this whole workstream is built on, with his
  assessment as the worked example.
- It recorded **Priya Anand as started as CTO at Larkspur** — the mandate
  W3–W6 rests on, and the person W7's new shortlist screen submits as a
  *candidate* for that seat.

The revenue screen was billing searches the portfolio and shortlist
screens were still pitching. Both re-attributed to searches the client has
actually closed, with no amount changed, so `SAMPLE_REVENUE` still adds
up. Two tests: a `STARTED` placement may not share a role and company with
an open mandate, and must name a mandate its client lists as closed.
`STARTED` only is the whole precision — Cindermere's `FELL THROUGH` and
`ACCEPTED` rows against a live search are correct, because a fallthrough
is exactly what reopens one.

---

## 4. Recommended order

1. ~~**D4 fix** — the two migration-033 messages.~~ Done 2026-08-14.
2. ~~**W1 Administration** (minus `/app/activity`).~~ Done 2026-08-14 —
   one page of work, not three.
3. ~~**W2 Client Experience**~~ — done 2026-08-17. Two routes, seven
   clients, and D3 answered on the way.
4. ~~**W3 Mandates**~~ — done 2026-08-17. Seven module screens, a rail, and
   the fix for eleven sub-routes that redirected to `/app/home`.
5. ~~**W4 Candidates**~~ — done 2026-08-17, together with the sweep that
   closed the sample-id bounce on all twenty affected routes.
6. ~~**W6 Reports & Analytics**~~ — done 2026-08-17. `/comparison` turned out
   not to need D1 at all, and the sample's invented scoring dimensions were
   replaced with the product's five.
7. ~~**W5 Research & Sourcing**~~ — done 2026-08-17. Two screens built, and
   the import wizard left on its honest state for a written reason.
8. ~~**W7 Executive Search**~~ — done 2026-08-18. D1 dissolved on contact
   with the code: two screens, not eleven, both inside existing precedent.
   The workstream also closed `/app/projects/[id]/shortlist`, the route
   that was in no table here.
9. ~~`/app/activity` last, as a projection of everything above.~~ — done
   2026-08-18, and it was the right order: every row in it refers to
   something another sample screen already shows.

~~**Do not start at W7**~~ — the advice was sound and the reason for it
was not. W7 was worth leaving until last because it is the largest
surface, but not because D1 made it dangerous: **no page in the module
renders agent output directly, and the one screen carrying an evaluative
judgement of a person has no agent behind it at all.** The blocker was a
classification error, and it cost six workstreams of deferral. See D1.

---

## 6. All 46 routes are done

Nothing in this document is outstanding. What the programme leaves behind,
in rough order of how much it will save the next person:

- **`src/lib/sample/`** — six fixture files, all re-exported from
  `index.ts`, whose header carries the D3 labelling rule.
- **Five structural tests**, each of which walks something rather than
  listing it, because every gap this programme found was a thing nobody
  had written down: `routes.test.ts` (every dynamic route handles a sample
  id), `mandate-modules.test.ts` (every module route is accounted for, in
  both directions), `executive.test.ts` (every competency key is really
  seeded), `call-sites.test.ts` (every action call is unwrapped), and
  `suspended_account_invariants.sql` (every RLS-enabled table).
- **The recurring defect, named once**: two screens describing the same
  thing and disagreeing. It was found in W3 (spec version and dimension
  count), W6 (tier counts, invented dimension names), and four more times
  in W7 — the profile version, the diligence stage counts, the link dates,
  and two placements billing live searches. Assume any number typed twice
  is already wrong; derive it or test it.
- **Reading the rendered page catches what tests do not.** Three of those
  seven were found by looking at a screenshot, including two in this
  session. Budget for it.

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
