# The OKR/KPI programme — Phase 0 map + THE D-GATE — 2026-08-25 — DRAFT

**Status: DRAFT. Nothing here is confirmed. Build waits on the founder's
written word against THIS document (§112's process precedent: a
pre-draft "confirmed" does not attach). NEXT-okr-programme.md stands
untouched until then.**

Scope per the founder's brief (§113): a component letting RECRUITERS
and MANAGERS set OKRs and KPIs — financial, quantitative, qualitative —
to measure performance and delivery, tied to the Kanban pipeline data
with metric tracking; financial metrics joining the PLACEMENTS page;
the rest enhancing ANALYTICS; the whole enabling STRATEGY creation;
then per-persona rollout EXCEPT Admins. This gate covers **slice one:
the Recruiter/Manager slice**. Every later persona gets its own gate.

---

## Part 1 — What Phase 0 found (verified live 2026-08-25)

### The persona roster (roles.ts, verified against live capability functions)

| Role | Capabilities (verbatim from `src/lib/auth/roles.ts` GRANTS) |
|---|---|
| admin | org:read, candidates:write, mandates:write, clients:share, **fees:read**, desk:manage, skills:write, org:manage |
| manager | same minus skills:write, org:manage |
| recruiter | org:read, candidates:write, mandates:write, clients:share, **fees:read** |
| researcher | org:read, candidates:write |
| viewer | org:read |
| hiring_manager / client_hr | portal:read only (client-side of the 067 XOR; read via SECURITY DEFINER RPCs, never org tables) |
| client_admin | portal:read, client:manage-people |
| agent | **EMPTY** — reach is named RLS policies, never capabilities |

Live functions confirmed: `can_read_fees()` = admin/manager/recruiter;
`can_manage_desk()` = admin/manager (coalesced); `can_read_org()` = the
five staff roles; `is_placement_credited(p)` = auth.uid() ∈
{owner_user_id, sourced_by_user_id}.

### The metrics machinery

- `computeProjectHealth` (`src/lib/metrics/health.ts:43`) — status
  healthy/stalled/at_risk from four alerts (no_activity_7d,
  low_pipeline<5, no_feedback_14d, poor_quality avg<5 over ≥3 scores).
- `computePipelineMetrics` (`src/lib/metrics/pipeline.ts:28`) — funnel
  over the 12-stage vocabulary, `submissionToHire`, `weeklyVelocity`,
  source breakdown. **Snapshot-approximate by its own admission**
  (pipeline.ts:67-73: "until a stage-history table exists").
- `computePortfolioMetrics` (`src/lib/metrics/portfolio.ts:44`) — org
  rollup + attentionList; feeds /app/home, /app/projects, /app/analytics.
- The desk rollup (`src/lib/desk/rollup.ts:63`) — per-member led
  mandates, candidate counts, placements (owner_user_id), lastSeen,
  open/overdue tasks. ONE loader shared by desk page and digest agent.
- **The stage-event stream**: `candidate_stage_changed` rows
  (migration 104) carry {from, to} + candidate + project + actor +
  timestamp — a complete transition log the Kanban board writes on
  every real move (`updatePipelineStage`,
  `app/projects/[id]/candidates/actions.ts:218`) and **nothing yet
  aggregates**. This is the honest tie to "the Kanban board's pipeline
  data" the brief asks for: per-stage transition counts, real (not
  snapshot-approximate) conversion, time-in-stage — all derivable from
  rows already on disk.

### The money boundary (live pg_policies)

- `placements` rows: org-wide SELECT (`can_read_org()`); the EVENT is
  public in-org, the MONEY is not (050's table split, restated in 053).
- `placement_fees` / `fee_terms` SELECT: `can_read_fees() OR
  is_placement_credited(placement_id)`. Writes ride `can_write_mandates()`.
- The tiered-visibility precedent exists twice: `activity_events`
  visibility CASE org/fees/admin (053) and `client_notes`
  org/commercial CASE (054) — a fees-tier ROW inside an org-readable
  table is an established, tested shape.
- Placements page (`app/placements/page.tsx:78`) already computes
  `seesFees = can(role, "fees:read")` and renders money per-column.

### The new-domain precedent (106, the task domain)

The checklist a new domain follows: org-anchored table + nullable real
FK for sub-scope; status CHECK with biconditional stamp/sign CHECKs;
`guard_author_in_org` on every user column; a domain guard trigger on
the 064 model with COALESCED predicates; RLS org-SELECT /
capability-gated INSERT with created_by pin / UPDATE with signature
pin; **no DELETE for anyone**; vocabulary rider rebuilding the
activity CHECK from the LIVE pg_constraint list; intent-door widening
with per-event authority + grant re-declaration; a rolled-back
forged-JWT invariant harness with a control run; TS mirrors updated.

### Live numbers at drafting

Activity CHECK **78** (pg_constraint literal count); intent door **12**
(record_activity_event live definition); agent door 29 types (101);
durable baseline verified exact: 25 users / 24 agents / 74 events /
5 skills / 5 skill_versions / 1 network_profile / 1 org_comms_policy /
2 projects / 2 clients / 1 candidate / 1 job_spec / 0 tasks /
0 placements. Next migration **107**, next § **114**, next drive **0f6**.

**Phase 0 finding to rule on (F1):** the TS mirror
`ACTIVITY_EVENT_TYPES` (`src/lib/activity/types.ts`) holds 46 entries
against the live CHECK's 78 — 106 added its own two but did not
reconcile the accumulated agent-event drift. See D8.

---

## Part 2 — THE D-GATE (drafted, awaiting the founder's word)

### D1 — Domain shape: `objectives` + `objective_key_results`

Two tables, migration 107. An OKR is one **objective** (the qualitative
ambition sentence) holding one-to-many **key results** (the measurable
commitments). KPIs are key results tracked against a metric — one
vocabulary, not two domains.

- `objectives`: organization_id NOT NULL; **owner_user_id** (whose
  objective this is — recruiter or manager, the persona the brief names);
  scope via **nullable project_id** (a mandate-scoped objective) — org/desk
  scope when NULL, the 106/R2 shape; title; detail; **period_start /
  period_end (dates, NOT NULL)** — an OKR without a period is a wish;
  status CHECK `('draft','active','closed','abandoned')` with
  biconditional closed⇔stamped⇔signed CHECKs (closed_at, closed_by);
  created_by NOT NULL.
- `objective_key_results`: objective_id FK CASCADE; organization_id
  denormalised for RLS; **kind CHECK ('financial','quantitative',
  'qualitative')**; label; metric_source (D3's vocabulary, NULL for
  qualitative); target_value / current_value numeric; unit;
  direction CHECK ('at_least','at_most'); for qualitative — attested_at /
  attested_by with the biconditional pin (D5).

**Recommend: two tables as above.**

### D2 — Who writes: a new `okrs:write` capability, granted to recruiter, manager, admin

The brief names Recruiters AND Managers as the setters. No existing
capability fits: `mandates:write` would hand OKR authoring to nothing
extra (same roles) but MEANS the wrong thing; `desk:manage` would
exclude recruiters. Mint **`okrs:write`** in roles.ts + a
`can_write_okrs()` SQL predicate (the 064 pattern: one function, not a
hundred IN-lists), granted to **recruiter, manager, admin**.

The Admin question the brief raises (**"except the Admin(s), whose role
is technical support only"**) is read as: admins are excluded from the
PERSONA ROLLOUT — no admin-persona OKR surface is ever built, no OKR is
ever ABOUT an admin's performance — but the admin KEEPS the repair
power (`okrs:write`) because technical support that cannot fix a
mis-entered target is not support. The alternative reading (admins hold
no okrs:write at all) is buildable but leaves a typo'd OKR fixable only
by its owner or a manager.

**Recommend: okrs:write to recruiter/manager/admin; admins excluded
from rollout surfaces and from being measured, not from repair. RULING
REQUESTED — this is the founder's sentence to interpret.**

Ownership rules (the 064/106 trigger shape, all predicates coalesced):
a recruiter authors objectives they OWN; a manager (desk) authors for
anyone lead-capable and may reassign ownership; the author never
changes; owner must be an ACTIVE admin/manager/recruiter — and per the
rollout doctrine an OKR is never OWNED by an admin either (D2's
exclusion made structural: the guard refuses admin owners; RULING
REQUESTED as part of D2 — strict form (refuse) recommended so the
"admins are not measured" doctrine is a trigger, not a habit).

### D3 — Quantitative metric vocabulary: a CHECK'd slug list computed from existing machinery

`metric_source` is a CHECK'd enumeration, each slug mapping to a
deterministic computation in a new `src/lib/okrs/progress.ts` (server
code, the computePortfolioMetrics idiom — no agent, no free text):

| slug | source |
|---|---|
| `candidates_added` | candidates.created_at in period (scope-filtered) |
| `stage_moves` | candidate_stage_changed events in period — **the Kanban tie** |
| `submissions` | stage events with to='submitted' |
| `interviews` | stage events with to='interviewed' |
| `offers` | stage events with to='offer' |
| `hires` | stage events with to='hired' |
| `placements_started` | placements.status='started', start_date in period |
| `feedback_captured` | feedback rows in period |
| `weekly_velocity` | the pipeline.ts computation, period-bounded |

Stage-derived slugs read the **event stream**, not the snapshot —
progress counts real transitions (pipeline.ts's own "until a
stage-history table exists" caveat answered with the history that
already exists). Financial slugs are D4's, separate. Nothing in this
list scores a person; every slug aggregates the search or the desk.

**Recommend: this nine-slug list, extensible only by migration.**

### D4 — Financial key results: fees-tier rows; `fees:read` does not move

Financial KRs (`kind='financial'`) target money:
`fees_earned` (sum of placement_fee_lines.base_amount with
status='earned', earned_on in period — the earned/payable split 050
already draws) and `fees_billed_forecast` (pending lines due in
period). Boundary, on the 053/054 tiered-row precedent:

- The `objectives` row is org-readable (everyone may know an objective
  exists — the 050 doctrine: the event is public, the money is not).
- `objective_key_results` SELECT carries a visibility CASE: rows with
  `kind='financial'` require `can_read_fees() OR` (for a
  mandate-scoped objective) the credited exception via the placement
  path; other kinds ride org-read.
- INSERT/UPDATE of a financial KR additionally requires
  `can_read_fees()` (the 054 write-side lesson: nobody authors a row
  they cannot then read).
- Surfaces: the financial strip on PLACEMENTS renders under the
  existing `seesFees` and nowhere else; Analytics renders financial
  KRs only as "on track / behind" WITHOUT amounts for non-fees
  readers — no, simpler and safer: **Analytics does not render
  financial KRs at all; they live on Placements only.** No new role
  gains `can_read_fees()`; the function is untouched.

**Recommend: as stated, with financial KRs on Placements only.**

### D5 — Qualitative key results: human-attested milestones, never verdicts

What "qualitative" can honestly be here (the no-verdict doctrine):
**a named process milestone a human attests to** — "calibration signed
off with the HM", "shortlist trade-offs presented", "feedback captured
on every submitted candidate", "kickoff within 3 days of intake".
Free-text label, attested_at/attested_by with the 106 biconditional
pin (nobody signs another's attestation; the attester must be the
owner or the desk). NO machine judgment, NO score, and structurally:
**`objective_key_results` carries no candidate_id column at all** — a
key result cannot name a person as its subject. OKRs measure searches,
desks and delivery; candidates are never the numerator.

**Recommend: attested-milestone qualitative KRs; the no-candidate-column
rule is structural (R2).**

### D6 — Surfaces: a new /app/objectives component; Analytics enhanced; Placements gains the financial strip

- **/app/objectives** (nav group workspace, label in the terminal
  visual language): the management component — list by period, New
  Objective / key-result editor behind `okrs:write`, progress bars
  computed server-side, owner and scope chips, close/abandon with the
  106-style confirm. Route rule `okrs:read`? No — viewing rides
  **org:read** (the Analytics/tasks precedent: work asked for is
  visible work), writing rides `okrs:write` per-control, like the
  Kanban board's per-card gate. ROUTE_RULES therefore gains no entry
  (org:read default), and the write actions assert the capability.
- **Analytics** gains an "OBJECTIVES" section: active-period
  quantitative/qualitative KR progress, on-track/behind/at-risk chips
  (thresholds: on_track ≥ pro-rata expectation, behind < pro-rata,
  at_risk < 50% of pro-rata — displayed, never a control-flow gate).
- **Placements** gains the financial-OKR strip under `seesFees` (D4).
- The strategy layer the brief names ("the whole enables STRATEGY
  creation") is **out of this slice** — it gets its own gate once
  OKRs exist to strategise over.

**Recommend: as stated.**

### D7 — Agents hold no goals

No agent RLS on either table, no agent-recordable OKR events, no agent
door widening, no OKR input to any skill/agent in this slice. Progress
is deterministic server code. (Whether the Desk Digest may later
MENTION OKR progress is a future gate's question.)

**Recommend: zero agent involvement; the 29-type agent door is untouched.**

### D8 — Events + the vocabulary rider

Two new activity events, org visibility, via the intent door:
`objective_created` (detail: title, scope, period — never amounts) and
`objective_closed` (detail: title, outcome ∈ met/missed/abandoned —
never amounts). CHECK rebuilt from the LIVE 78-list → **80**; intent
door 12 → **14**, both events gated on `can_write_okrs()`; grants
re-declared; describe.ts sentences added. KR edits/attestations are
NOT events in slice one (the trail records intent, not bookkeeping —
the 106 "task_completed rides the actor stamp" logic).

**Rider on finding F1:** while the vocabulary is open, reconcile the
TS mirror `ACTIVITY_EVENT_TYPES` from 46 to the full live list + 2 —
a describe-sentence sweep, no schema change. **Recommend: yes, in this
slice. RULING REQUESTED (it widens the diff beyond the domain).**

### D9 — Rollout slicing after this gate

One persona per gate, in order of proposal: (1) THIS SLICE
Recruiter/Manager; (2) Researcher (own-scoped delivery OKRs — no fees,
no clients:share); (3) Viewer (read-only presence on Analytics —
possibly nothing to build); (4) the externals — what an OKR even means
for a hiring_manager/client persona is a REAL question (client-visible
delivery commitments? SLA-style?) deferred to its own gate with its
own D-list; (5) Admins NEVER (the brief's word). Agents excluded by
doctrine at every step.

**Recommend: this order, each behind its own drafted gate.**

---

## Part 3 — Named rulings (the ones that bind)

- **R1 — the money boundary does not move.** `can_read_fees()` is not
  edited; no role gains or loses it; financial KRs are fees-tier rows
  readable exactly where placement_fees are readable; Placements-only
  rendering; Analytics never shows amounts.
- **R2 — no verdicts, structurally.** `objective_key_results` has no
  candidate_id column; no metric slug takes a person as subject; OKRs
  measure searches, desks and delivery. Agents hold no goals (D7).
- **R3 — no DELETE for anyone.** `abandoned` is the walk-away;
  closed⇔stamped⇔signed biconditional CHECKs; the record survives its
  author (the 106 precedent verbatim).
- **R4 — admins are support, not subjects.** No admin-persona surface,
  no admin-owned objective (guard-refused); admin keeps repair power
  via okrs:write — unless the founder rules the strict reading (D2).

## Part 4 — The build ladder on confirmation

Migration **107** (tables, triggers on the 064 model, RLS, vocabulary
rider 78→80, intent door 12→14) · `okr_invariants.sql` harness
(forged-JWT, rolled back, control run; negatives BY NAME: viewer
refused as author, researcher refused, agent refused, financial KR
invisible to researcher/viewer, cross-signing refused, §42 exact
counts) · `src/lib/okrs/` + /app/objectives + Analytics section +
Placements strip · green gate (tsc / vitest 904+new / eslint / build)
· commit · `vercel --prod --yes` · **drive 0f6** (scratch manager +
scratch recruiter, never the founder's session; teardown by VALUE to
the durable baseline; name-only candidate seeds sweep their minted
network_profiles; a 1-candidate mandate reads AT RISK — expected) ·
§ 114 DRAFTED, no completion declared; NEXT-okr-programme.md edited
only on the founder's written confirmation.
