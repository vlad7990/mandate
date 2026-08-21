# NEXT — The Psychology agent becomes a principal (slice eight)

Status: **Phase 0 complete — D1–D8 drafted, awaiting the founder's
written D-confirmation. No build work past this file until then.**

Slice eight of agents-as-principals, closing the candidate-intelligence
cluster per the confirmed §44 verdict. The judgment that writes a
behavioural read of a person — how they decide, what motivates them,
how to manage them — currently runs in the triggering recruiter's
session. Next migration: **081**.

---

## Phase 0 — enumeration from the code (the §5h rule)

### The pipeline

`generatePsychologyAction`
(`src/app/(dashboard)/app/projects/[id]/candidates/[candidateId]/actions.ts:714`)
is the ONLY caller of `runPsychology` (`src/lib/ai/run-psychology.ts:43`).
The flow:

1. **Gate** — `requireActiveUser()` (`candidates:write`) +
   `assertCandidateBelongsToProject`. Stays human.
2. **Reads** (three parallel queries):
   - `candidates` SELECT — identity + `cv_structured` (profile +
     the evaluator's report as input).
   - **`candidate_notes` SELECT — last 10 notes. NOT IN THE POOL.**
     The live policy (`candidate_notes_role_select`, read from
     pg_policies — the 020 file's blanket org policy is superseded)
     requires `can_read_org()`, which excludes agents by 074's own
     design. **This slice is the first pool widening since 076**:
     migration 081 adds `candidate_notes_agent_select` (the 074
     shape — `is_agent()` + org match), SELECT only.
   - `projects` SELECT — `organization_id`. Pool.
3. **Recruiter context** — optional free text from the regenerate
   dialog, prepended to the SYSTEM prompt
   (`wrapWithRecruiterContext`, riding ctx — never the serialised
   input) and persisted to `cv_structured.psychology_context` so the
   panel shows what shaped the read. Human testimony, honestly
   displayed — the shape is already right.
4. **Skills** — `applySkillsToPrompt`, today on a cookie client.
5. **Model call** — `claude-sonnet-4-6`, max 2500 tokens, JSON
   schema. No web search.
6. **Writes — TWO RPC calls**: `psychology` (the profile), then
   `psychology_context` (set, or CLEARED when the recruiter supplied
   none). Both resolve to `candidates_agent_update` (076). The
   two-write order (profile, then context) matches today's action;
   a context-write failure after a landed profile is logged and
   leaves the profile standing — same window as today, stated.

### Trigger surfaces

Exactly one: the Psychology panel's single button ("Analyse" /
"Regenerate", the latter through the RegenerateContextPanel dialog
that collects the optional context). Readers that are NOT triggers:
the profile page and the Copilot (read-only); the network-copy path
strips every psychology key.

### The human-annotation boundary (the §43 flag, drawn)

Three sibling keys are HUMAN writes and STAY in the recruiter's
session, untouched by this slice: `psychology_notes`
(`savePsychologyAnnotationAction`), `psychology_flags`
(`togglePsychologyFlagAction`), `psychology_confidence_overrides`
(`overridePsychologyConfidenceAction`). They are the recruiter's own
annotations ON the agent's read — converting them would put a human's
judgment under an agent's name, the exact inversion this programme
exists to prevent.

### Grant check against the pool

| Surface | Needed | Covered by |
|---|---|---|
| candidates SELECT | identity + profile + evaluation | `candidates_agent_select` (074) |
| candidates UPDATE | psychology + psychology_context via the RPC | `candidates_agent_update` (076) |
| candidate_notes SELECT | last-10 behavioural context | **NEW — `candidate_notes_agent_select` (081)** |
| projects SELECT | org + skills scoping | `projects_agent_select` (074) |
| skills SELECT | Skills Studio injection | `skills_agent_select` (074) |

---

## Decisions for confirmation

### D1 — The eighth principal

Users row, role `agent`, org-bound to Mandate HQ, full name
**"Psychology Agent"**, account `vbreygin+psychology@gmail.com`, §30
recipe. Credentials only as `AGENT_PSYCHOLOGY_EMAIL` /
`AGENT_PSYCHOLOGY_PASSWORD` in Vercel production and `.env.local`.
The eighth independent kill switch.

### D2 — Grants: one widening, read-only, on a human-authored table

`candidate_notes_agent_select` — SELECT only, `is_agent()` + org
match. The first agent grant on a table humans AUTHOR (notes are
recruiter testimony): the agent may read what humans wrote as input,
and may never write, edit, or delete it — pinned in the invariants as
a new negative (INSERT/UPDATE/DELETE each refused with a live note
row present).

### D3 — Migration 081 + invariants, with a novel control run

- `candidate_notes_agent_select` + **`candidate_profiled`** into the
  CHECK (live pg_constraint list + the new value) and the allowlist
  (eight). (Naming follows the two-word house pattern —
  candidate_parsed/evaluated/positioned/researched/triangulated;
  "profiled" is the psychology read. If the founder prefers
  `candidate_psychology_generated`, say so in the confirmation.)
- App vocabulary: types.ts (+ `mandates`) and describe.ts ("Wrote a
  behavioural read of the candidate" / "Rewrote…").
- **`agent_psychology_invariants.sql`** — the eighth principal's
  negative matrix; attribution with trigger named; forgery boundary
  both directions; eight-way kill-switch independence; the
  history-intact COUNT at eight; the TWO-write shape (profile +
  context land; context cleared when absent); the neighbours pin at
  its widest (five agent keys AND the three human annotation keys
  survive); the notes boundary (read yes, write/delete no).
- **Control run (novel per slice): the widening grant's own drift** —
  `candidate_notes_agent_select` re-created FOR ALL instead of FOR
  SELECT (the copy-paste regression from 020's old blanket shape,
  exactly how a permissive-notes policy once looked). The harness
  must abort at the notes-boundary invariant ("the agent wrote a
  candidate note"), with the positives passing; restored and
  verified, rollback residue-free.

### D4 — The trail

One `candidate_profiled` event per LANDED profile, trigger
`generate` / `regenerate`, detail: `replaced_existing` and
`has_recruiter_context` (a BOOLEAN — the context text itself never
enters the trail; it lives visibly in psychology_context where the
panel already shows it).

### D5 — Fail-soft

**"The Psychology Agent could not run — an operator has suspended it
or its credentials are absent. The existing profile stands."** No
pre-clear; the old profile survives until the single key replace
lands, and a refused run leaves psychology_context untouched too. A
real failure keeps today's error contract. No service-role fallback,
ever.

### D6 — The seam shape

`runPsychologyAndPersist` beside `runPsychology` (the proven shape):
the action keeps gate + assertion and passes `recruiterContext`
through; the agent reads candidate + notes + project, runs the
context-wrapped, skill-injected model call (both riding ctx), makes
the two RPC writes, records the event, signs out persisting nothing.
The profile still returns to the panel.

### D7 — The kind boundary

Pool authority identical across kinds plus this slice's named
read-only widening. The psychology read CONSUMES human testimony
(notes, recruiter context) and never authors it; the three annotation
keys stay human; the event carries a boolean about context, never the
text. The evaluator's report is input, untouched.

### D8 — Out of scope

- **This slice closes the candidate-intelligence cluster.** The desk
  digest writer is next in the confirmed queue, on the founder's
  word, with its own Phase 0.
- The company-side generators (company intelligence, HM intelligence)
  remain a later grouping.
- Long-action honesty: single ~2500-token call, likely the fastest
  agent yet; deferred-until-observed stands.

---

## Phases 1–4 — the proven ladder (GATED)

**No build work past Phase 0 until the founder's written
D-confirmation.** Then: migration 081 + invariants (MCP + numbered
file, the FOR-ALL control run verified, green gate); seam + live
account (§30 recipe; durable baseline → 9 users / 24 events);
production drive inside Mandate HQ (harness prefix `08100000`, drive
`0d7`, scratch is_founder operator, FULL-shape seeds per the §44
trap): analyse with a seeded note + recruiter context → suspend →
refused with the D5 sentence, profile byte-identical → restore →
regenerate + second event; probe matrix with the real JWT including
the notes read (answers) and the notes write (refused); teardown to
baseline exactly, keyed on scratch ids only; §45 verdicts drafted for
sign-off. No completion declaration until the founder's written
confirmation; this file is deleted only after it.
