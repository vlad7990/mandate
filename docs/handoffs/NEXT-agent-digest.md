# NEXT — The Desk Digest writer becomes a principal (slice nine)

Status: **Phase 0 complete — D1–D8 drafted, awaiting the founder's
written D-confirmation. No build work past this file until then.**

Slice nine of agents-as-principals, the first conversion OUTSIDE the
candidate-intelligence cluster (§46). The judgment that writes the
Monday-morning read across every recruiter's desk currently runs in
the triggering manager's session. Next migration: **082**.

---

## Phase 0 — enumeration from the code (the §5h rule)

### The pipeline

`generateDeskDigestAction` (`src/app/(dashboard)/app/desk/actions.ts:80`)
is the ONLY caller of `generateDeskDigest`
(`src/lib/ai/desk-digest-agent.ts:98`). The flow:

1. **Gate** — `assertCapability("desk:manage")` — the MANAGER
   capability, the first agent surface not gated on candidates:write.
2. **Reads** — `loadDeskRollup` (`src/lib/desk/rollup.ts`) sweeps
   FIVE tables: **users (the org roster)**, projects, candidates,
   **placements**, and **activity_events**. Three of these are reads
   the agent pool REFUSES by design, and seven slices of invariant
   files pin those refusals (the roster beyond self and
   activity_events by name, in every negative matrix since 074).
3. **Model call** — `claude-sonnet-4-6`, 2048 tokens, JSON schema.
   **No skills injection** — the digest is the one model call in the
   product that never passes through `applySkillsToPrompt`
   (observation, surfaced as a verdict below, not fixed unbidden).
4. **Write** — `desk_digests` INSERT: a REAL TABLE, append-only by
   design (066: no UPDATE/DELETE policy for anyone — "a digest that
   could be rewritten after the Monday meeting is not a record"),
   `created_by` guarded in-org by trigger. Policies require
   `can_manage_desk()` — the agent has no reach today.

### Trigger surfaces

Exactly one: the desk panel's single button
(`digest-panel.tsx:56` — "Generate digest" / "Regenerate"). Readers
that are NOT triggers: the desk page renders the newest digest row
under the manager's own SELECT.

### The load-bearing design fact

**The rollup reads cannot move to the agent.** Granting an agent the
org roster, placements, and activity_events would demolish the
negative matrix seven invariant files pin — the programme's most
repeated proof is that agents read NO people beyond themselves and NO
trail. The house already has the answer, proven in slice three: **the
parser's split** (§35 D2 — the recruiter keeps the file choice and
storage acts, the agent thinks and persists). Generalised here: the
MANAGER's session performs the rollup it lawfully holds under
desk:manage and hands the assembled data to the seam in memory; the
agent runs the model call, INSERTs the digest under its own name, and
records the event. The reads are the manager's question; the
judgment and its persistence are the agent's act.

### Grant check

| Surface | Needed | Covered by |
|---|---|---|
| rollup reads | roster, projects, candidates, placements, events | **STAY HUMAN** (desk:manage — the parser split) |
| desk_digests INSERT | the digest lands under the agent's name | **NEW — `desk_digests_agent_insert` (082)** |
| desk_digests SELECT | not needed — the panel reads under the manager | none granted |

One INSERT-only grant on an append-only table — the mirror of 081's
SELECT-only grant on a human-authored one.

---

## Decisions for confirmation

### D1 — The ninth principal

Users row, role `agent`, org-bound to Mandate HQ, full name **"Desk
Digest Agent"**, account `vbreygin+digest@gmail.com`, §30 recipe.
Credentials only as `AGENT_DIGEST_EMAIL` / `AGENT_DIGEST_PASSWORD` in
Vercel production and `.env.local`. The ninth independent kill
switch.

### D2 — Grants: INSERT-only on the append-only record table

`desk_digests_agent_insert` — INSERT only, `is_agent()` + org match
(+ created_by stamped as the agent, the 066 trigger already guards
in-org). No SELECT, no UPDATE, no DELETE — the agent writes the
record and cannot read the archive or revise history. The rollup
reads stay under the manager's session per the parser split; the
seam takes the assembled rollup as an in-memory input, exactly as the
parser takes bytes.

### D3 — Migration 082 + invariants, with a novel control run

- `desk_digests_agent_insert` + **`desk_digest_generated`** into the
  CHECK (live pg_constraint list + the new value) and the allowlist
  (nine). First non-candidate-prefixed agent event; detail carries
  the trigger and `members_count` / `unassigned_count` (the digest's
  scope, no names).
- App vocabulary: types.ts (+ a `mandates` grouping — the desk is a
  mandates surface) and describe.ts ("Wrote the desk digest" /
  "Rewrote…").
- **`agent_digest_invariants.sql`** — the ninth principal's negative
  matrix (unchanged: roster-beyond-self and activity_events still
  refused — the rollup lives with the manager); the INSERT landing
  with created_by = the agent; history COUNT at nine; forgery
  boundary both directions; nine-way kill-switch independence; and
  **the append-only pin**: the agent's UPDATE and DELETE against a
  landed digest land on zero rows (no policy grants them to anyone).
- **Control run (novel per slice): the record table's immutability**
  — ADD a `desk_digests_agent_update` policy (the "helpful" future
  migration letting the agent revise its digest). The harness must
  abort at the append-only pin ("the agent rewrote a landed digest"),
  with the positives passing; the policy dropped and verified gone,
  rollback residue-free. Nine slices in, the first control run that
  regresses by ADDING a policy rather than mutating one.

### D4 — The trail

One `desk_digest_generated` event per LANDED digest, trigger
`generate` / `regenerate` (from whether any digest row already
exists for the org — the manager passes this, the seam records it),
detail: `members_count`, `unassigned_count`, `replaced_existing`
(meaning "superseded the previous newest", never "overwrote" — the
table is append-only).

### D5 — Fail-soft

**"The Desk Digest Agent could not run — an operator has suspended it
or its credentials are absent. The previous digest stands."** The
table being append-only makes D5 structural: there is nothing to
pre-clear and nothing a failed run can destroy; the newest landed row
stays canonical. No service-role fallback, ever.

### D6 — The seam shape

`runDeskDigestAndPersist(rollupInput, opts)` beside
`generateDeskDigest`: the action keeps the gate and BUILDS the rollup
under the manager (its lawful reads), then hands the assembled
`DeskDigestInput` to the seam; the agent signs in, runs the model
call, INSERTs the digest row (`created_by` = the agent), records the
event, signs out persisting nothing. The input is already a plain
serialisable object — no client ever rides it.

### D7 — The kind boundary

The digest writer holds the narrowest reach of any principal: ONE
INSERT and the trail door. It sees nothing — the rollup is handed to
it, pre-assembled, by the manager whose question it answers. Its
event names counts, never people. The candidate pool's grants are
not extended to it and its grant extends to no candidate agent — the
allowlist entry and the credential are, as always, the identity.

### D8 — Out of scope

- The remaining unconverted agents (intake, company research,
  onboarding, role spec, calibration, boolean search, shortlist,
  copilot) queue by usage on the founder's word; the metrics agent's
  cron-shaped arrival still waits for its own slice (§30, standing).
- **Skills-injection gap on the digest — surfaced as a verdict**: the
  digest is the one model call that never sees recruiter-authored
  skills. Wiring `applySkillsToPrompt` through the agent's session is
  one line in the seam if the founder wants managerial tone
  steerable; not built unbidden.
- Long-action honesty: 2048 tokens, likely 15–30s; deferred stands.

---

## Phases 1–4 — the proven ladder (GATED)

**No build work past Phase 0 until the founder's written
D-confirmation.** Then: migration 082 + invariants (MCP + numbered
file, the added-policy control run verified, green gate); seam + live
account (§30 recipe; durable baseline → 10 users / 27 events;
desk_digests' durable count snapshotted before the drive); production
drive inside Mandate HQ (harness prefix `08200000`, drive `0d8`,
scratch is_founder operator with desk:manage): generate from the real
desk → suspend → refused with the D5 sentence, the previous digest
stands → restore → regenerate + second event; probe matrix with the
real JWT including desk_digests SELECT refused, UPDATE/DELETE landing
on zero rows, and the negative matrix unchanged; teardown to baseline
exactly — NOTING that drive-generated digest rows are scratch and
append-only rows delete by id; §47 verdicts drafted for sign-off. No
completion declaration until the founder's written confirmation; this
file is deleted only after it.
