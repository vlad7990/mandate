# The OKR programme, slice two — THE RESEARCHER — Phase 0 + THE D-GATE — 2026-08-25 — DRAFT

**Status: DRAFT. Nothing here is confirmed. Build waits on the
founder's written word against THIS document (the §112/§114
precedent). Slice one (§114) is confirmed and untouched by this
gate.**

Scope per D9 of the confirmed slice-one gate: the researcher persona
gains own-scoped delivery OKRs — no fees, no clients:share. One
persona, one gate.

---

## Part 1 — What Phase 0 found

### The researcher today

- Capabilities: `org:read`, `candidates:write` — nothing else. No
  `okrs:write`, no `fees:read`, no `mandates:write`.
- On the OKR domain as built (107): reads objectives and their
  non-financial key results; the guard refuses a researcher as an
  OWNER; no authoring, no attesting.
- Elsewhere: an assignable task-domain member (106 R1); refused as a
  mandate lead (064); creditable on placements as `owner_user_id` or
  `sourced_by_user_id`, which is the whole reason the fee-read rule
  has its per-placement exception (050).

### Two verified facts that shape the gate

1. **`candidates` carries no actor attribution** (live read: only
   `source`, a channel string). "Candidates THIS researcher added"
   cannot be computed honestly today — it would need a new column or
   an event-actor join, both new machinery.
2. **`placements.sourced_by_user_id` exists and means researchers**
   (050's own commentary). "Placements THIS person sourced" is
   computable from data already on disk.

### The divergence 054 predicted arrives

Granting the researcher `okrs:write` creates the first role holding
an OKR-authoring power without `fees:read`. The 107 policies already
handle the write side (a financial key result INSERT requires
`can_read_fees()` — the researcher is refused). The new case is the
DESK adding a financial key result to a researcher-OWNED objective:
legal under the policies, but the owner would then be measured by a
number RLS never shows them. D3 rules on it.

---

## Part 2 — THE D-GATE (drafted, awaiting the founder's word)

### D1 — The researcher becomes a subject and an author

Migration 108 re-emits, with the set widened to include
`researcher`:

- `can_write_okrs()` → `('admin','manager','recruiter','researcher')`
- `guard_objective_owner_changes()` owner test →
  `('manager','recruiter','researcher')`

and roles.ts grants `okrs:write` to the researcher. Everything else
about the guard stands: admins still refused as owners (R4 of slice
one), viewers/agents/externals refused, only the desk hands an
objective to someone else, the author never changes. The desk's
owner picker on /app/objectives widens to researchers.

**Recommend: as stated.**

### D2 — What the researcher can author

Their own objectives (owner = self at creation — the existing INSERT
guard already enforces self-unless-desk), quantitative and
qualitative key results on objectives they own, attestation of their
own milestones. All of this is the EXISTING owner-or-desk RLS doing
its job once D1 admits them; no policy edits.

**Recommend: no new policy surface — D1 alone unlocks it.**

### D3 — Financial key results on researcher-owned objectives: REFUSED

The divergence case. Option (a): allow the desk to add financial KRs
to a researcher's objective — the owner is then measured by money
they cannot read, a lie-in-waiting on their own card. Option (b):
refuse, in the database. A BEFORE INSERT/UPDATE trigger on
`objective_key_results` (the 064 model, coalesced predicates)
refuses `kind = 'financial'` when the parent objective's owner does
not hold the fees tier by role (owner's role NOT IN
('admin','manager','recruiter') — admins can't own at all, so in
practice: manager/recruiter owners carry money, researcher owners
never do). Sentence: *"a financial key result needs an owner who can
read it — researchers hold no fees tier."*

**Recommend: (b), the trigger. R1 restated: the researcher slice
does not move `can_read_fees()` by a single role.**

### D4 — The vocabulary gains `placements_sourced` — the one owner-attributed metric

The researcher's headline delivery number: placements they
personally sourced. `metric_source = 'placements_sourced'` =
placements with `sourced_by_user_id = the objective's OWNER`,
`status = 'started'`, `start_date` in the period (project-scoped
when the objective is). Computed in `computeObjectiveProgress` from
`placements.sourced_by_user_id` — data already on disk, no new
columns, COUNT only, never amounts. Available to every legal owner
(a recruiter's sourced placements are just as real).

This is the slice's one REAL question: it is the first metric
attributed to a PERSON rather than a scope. It stays inside the
no-verdict doctrine — it measures a staff member's delivery, which
is what the founder's brief asked OKRs to measure, and never a
candidate as a subject. The alternative is deferring it, leaving
researcher OKRs able to say only what their searches did, not what
they delivered.

**Recommend: include it. CHECK widened to ten quantitative slugs;
`computeObjectiveProgress` takes the owner id. RULING REQUESTED —
this is the founder's line to draw.**

### D5 — Surfaces and events: nothing new

No new routes, no nav change, no event types, no door widening —
`objective_created`/`objective_closed` ride `can_write_okrs()`, so
the researcher passes automatically once D1 lands. The create form
on /app/objectives simply renders for researchers (it keys on
`okrs:write`). The Placements strip stays invisible to them
(`seesFees`), Analytics unchanged. `ROLE_SUMMARIES.researcher` gains
a clause naming their objectives. The invariant harness's
door-refusal face moves from the researcher to the VIEWER.

**Recommend: as stated.**

### D6 — The ladder on confirmation

Migration **108** (two function re-emissions + the D3 trigger + the
CHECK widened for `placements_sourced`) · okr_invariants.sql updated
(researcher self-creates and self-attests where they were refused;
VIEWER becomes every refused face; the D3 refusal pinned BY NAME —
a financial KR on a researcher-owned objective refused, on a
recruiter-owned one landing; §42 exact counts) · roles.test.ts
matrix + order updates · progress computation + form option ·
green gate (tsc / vitest 929+new / eslint / build) · commit ·
`vercel --prod --yes` · **drive 0f7** (scratch researcher + scratch
manager; the 0f6 teardown lessons stand: sweep the six member-audit
events by name, public.users before auth.users) · § 116 DRAFTED, no
completion declared; NEXT-okr-programme.md edited only on written
confirmation.

## Part 3 — Named rulings

- **R1 — the money boundary does not move, again.** No researcher
  gains `can_read_fees()`; researcher-owned objectives carry no
  financial key results at all (D3's trigger).
- **R2 — no verdicts.** `placements_sourced` measures delivery,
  never a candidate; no per-person CANDIDATE metric exists or can be
  minted (no actor column — verified live).
- **R3 — one persona per gate.** Viewer, externals and admins are
  untouched; agents hold no goals.

Numbers at drafting: next migration 108, next § 116, next drive 0f7;
vitest 929; activity CHECK 80; intent door 14; durable baseline
25/24/74/5/5/1/1/2/2/1/1 + tasks 0 + objectives 0 + key_results 0.
