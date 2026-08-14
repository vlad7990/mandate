# Sample-data inventory — every dashboard route

**Date:** 2026-08-14. Built by enumerating `src/app/(dashboard)/**/page.tsx`
and reading the routes, not from an earlier note.

**It is 46 routes, not 36.** The "other 36 pages" figure in the handoff
predates the Executive Intelligence, placements, activity and clients work.
Nine of the 46 already render sample content.

This is an inventory and a proposal. Nothing here is implemented.

---

## 1. Decisions needed before implementation

Four, and the first is the expensive one.

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

### D2. Does sample data survive the Anthropic credit landing?

Nine routes exist to display agent output. If the API has credit, the
cheaper and far more honest path is **one seeded mandate that the real
agents fill in**, rather than hand-written fixtures that will drift from
what the agents actually produce. Hand-writing them now risks doing the work
twice and shipping a demo that no longer matches the product.

**Recommendation:** hold the Executive Search and Research workstreams until
this is known. It changes the approach, not just the estimate.

### D3. One label mechanism, decided once

`shouldShowSample()` and `sample-banner.tsx` exist. Whether the banner alone
satisfies "labelled at the point of display" — or whether each fabricated
row needs its own marker — should be settled once. Twelve pages will
otherwise each invent an answer.

### D4. Two pages currently ship a developer message to customers

`/app/executive-intelligence/competencies` and `.../templates` both read:

> "The library is empty. The global set is seeded by migration 033 —"

That is not a sample-data gap, it is a **defect**. A customer is being told
to check a migration number. Worth fixing immediately and separately from
this programme.

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

### W1 · Administration & Settings — 8 routes

Lowest risk, no product decisions, no agent output. Good first workstream.

| Route | State | Kind | Size | Depends on | Value |
|---|---|---|---|---|---|
| `/app/settings` | thin | simple | S | — | Med |
| `/app/settings/members` | complete | — | — | — | — |
| `/app/settings/waitlist` | empty-only | simple | S | — | Med |
| `/app/settings/skills` | empty-only | simple | M | — | High |
| `/app/settings/skills/new` | n/a | — | — | — | — |
| `/app/settings/skills/[skillId]` | n/a | — | — | — | — |
| `/app/no-access` | complete | — | — | — | — |
| `/app/activity` | empty-only | relational | M | W2, W3 | High |

**Note:** `/app/activity` is listed here but is genuinely last — the trail is
a *projection* of other entities. Seeded before them it reads as noise;
seeded after them it fills itself.

### W2 · Client Experience — 2 routes

| Route | State | Kind | Size | Depends on | Value |
|---|---|---|---|---|---|
| `/app/clients` | empty-only | simple | S | — | High |
| `/app/clients/[id]` | empty-only | relational | M | clients, contacts, notes, fee terms | High |

The client entity is complete in the schema (§5c), so this is data only. The
detail page carries four panels — contacts, notes, commercial terms,
mandates — and is unconvincing unless all four have content.

### W3 · Mandates & Projects — 11 routes

| Route | State | Kind | Size | Depends on | Value |
|---|---|---|---|---|---|
| `/app/home` | complete | — | — | — | — |
| `/app/projects` | complete | — | — | — | — |
| `/app/projects/[id]` | complete | — | — | — | — |
| `/app/projects/new` | n/a | — | — | — | — |
| `/app/projects/[id]/onboarding` | thin | workflow | M | — | Med |
| `/app/projects/[id]/spec` | empty-only | generated | M | D1, D2 | High |
| `/app/projects/[id]/calibration-history` | empty-only | generated | M | spec | Med |
| `/app/projects/[id]/metrics` | thin | relational | M | candidates, feedback | Med |
| `/app/projects/[id]/reports` | empty-only | generated | L | D1, D2, whole mandate | High |
| `/app/projects/[id]/hiring-manager` | empty-only | relational | M | contacts (W2) | High |
| `/app/projects/[id]/feedback` | empty-only | relational | M | candidates, HM portal | High |

The three "complete" rows are the existing sample workspace. **Everything
else in this workstream hangs off `sample-larkspur`** — the fixture that
already exists — so the work is extending one coherent mandate rather than
inventing eleven.

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
| `/app/executive-intelligence/competencies` | **placeholder** | simple | S | — | High |
| `/app/executive-intelligence/templates` | **placeholder** | simple | S | — | High |

The last two are D4 — the migration-033 message. They are `S` and should not
wait for this workstream.

---

## 4. Recommended order

1. **D4 fix** — the two migration-033 messages. Immediate, S, independent of
   everything. A customer should never read that sentence.
2. **W1 Administration** (minus `/app/activity`) — no decisions, no agent
   output, gets the mechanism exercised on easy pages.
3. **W2 Client Experience** — small, self-contained, and W3 depends on it
   for the hiring-manager and fee surfaces.
4. **W3 Mandates** — the spine. Extends the existing `sample-larkspur`
   fixture rather than inventing anything.
5. **W4 Candidates** — falls out of W3 cheaply once the mandate exists.
6. **W6 Reports & Analytics** — mostly free once 3–5 land.
7. **W5 Research & Sourcing** — hold for D2.
8. **W7 Executive Search** — hold for D1, approach set by D2.
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
