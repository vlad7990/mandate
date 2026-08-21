# NEXT — The Boolean Search Agent becomes a principal (slice twelve)

Status: **Phase 0 complete — D1–D8 drafted, awaiting the founder's
written D-confirmation. No build work past this file until then.**

Slice twelve of agents-as-principals — the sourcing-side opener, and
the FIRST NEW-GRANT slice since 082: the judgment that writes the
LinkedIn Boolean, Google X-Ray, and ATS strings touches two tables
the pool has never held. Next migration: **085**.

---

## Phase 0 — enumeration from the code (the §5h rule)

### The pipeline — two acts, one runner file

`generateAllAction(projectId)` and `regenerateOneAction(projectId,
slotKey, feedback)`
(`src/app/(dashboard)/app/projects/[id]/sourcing/actions.ts:101,157`)
are the ONLY callers of `generateAllSourcingQueries` /
`regenerateSingleQuery` (`src/lib/ai/generate-sourcing.ts:34,79`).
The flow:

1. **Gate** — `requireActionContext("candidates:write")` — the
   sourcing surface's gate, not mandates:write.
2. **Reads** — THREE tables: the projects row (calibration_model,
   company_context — in the pool since 074); the FINAL job spec
   (`job_specs` where is_final, via `loadGenerationContext` —
   **NOT in the pool**; the action refuses when no final spec
   exists); and for the regen path the latest `boolean_queries` row
   for the slot (current content + MAX(version) — **NOT in the
   pool**).
3. **Model call** — `claude-sonnet-4-6`, 2048 tokens (all six slots
   in ONE call) / 1024 (single slot), no web search. Skills
   injection PRESENT (needs the established `skillClient` line).
   **A doctrine tension, surfaced**: the regen path's recruiter
   feedback is free text riding INSIDE the model-input object
   (`generate-sourcing.ts:90`) — this predates the ctx/wrapper
   doctrine the psychology and culture slices follow. Observed, not
   silently changed (D8).
4. **Write** — `boolean_queries` INSERT, versioned append: six rows
   at version 1 (generate-all, refused if any rows exist) or one row
   at MAX(version)+1 (regenerate). **No created_by column exists**
   (the action notes this itself at line 142) — the trail event is
   the sole attribution, as with the interpreter's calibration
   writes. The recruiter's own acts on the same table —
   `saveQueryEditAction` (in-place edit of the canonical),
   `restoreQueryVersionAction` (history restore) — are edits of the
   human's artifact and STAY HUMAN.

### The six slots

`SLOTS` (`sourcing-analysis.ts`): linkedin exact / broad / adjacent /
competitor, google_xray exact, ats exact — enum keys, DB-constrained
`query_type` × `search_type`.

### Trigger surfaces

Two: the empty state's build button (`sourcing-empty.tsx:79` — the
page copy calls it "Build Sourcing Queries") and the per-slot
editor's "Regenerate" with its optional "Add Feedback" textarea
(`sourcing-editor.tsx:365-374` — a direct button, NOT the
context-drawer pattern). Readers that are NOT triggers: the sourcing
page renders the canonical rows and version history under the
recruiter's own SELECT; search-health and the runs pipeline consume
the strings downstream.

### The adjacent judgment that does NOT convert

`generateTargetCompaniesAction` (`actions.ts:343` →
`runTargetCompanies`) PERSISTS NOTHING — it returns the
target-companies report to the UI, and the follow-up
`appendCompaniesToBooleanAction` is a DETERMINISTIC recruiter act
(string formatting, no model). A judgment with no landed act has no
trail event and nothing to convert; it queues for the day it
persists (D8) — the same reasoning that keeps the shortlist and
copilot read-shaped surfaces out of the programme for now.

### Grant check — the first new grants since 082

| Surface | Needed | Covered by |
|---|---|---|
| projects row read | calibration + company context | **074 `projects_agent_select`** (verify live) |
| job_specs SELECT | the final spec — the canonical brief | **NEW — `job_specs_agent_select` (085)** |
| boolean_queries SELECT | latest version + content per slot | **NEW — `boolean_queries_agent_select` (085)** |
| boolean_queries INSERT | the versioned append | **NEW — `boolean_queries_agent_insert` (085)** |
| boolean_queries UPDATE/DELETE | never — history is immutable to the agent | none granted; the edit acts stay human |
| skills SELECT | applySkillsToPrompt under the agent | **074** skills S |

---

## Decisions for confirmation

### D1 — The twelfth principal

Users row, role `agent`, org-bound to Mandate HQ, full name
**"Boolean Search Agent"** (the fourteen-agent map's name), account
`vbreygin+boolean@gmail.com`, §30 recipe. Credentials only as
`AGENT_BOOLEAN_EMAIL` / `AGENT_BOOLEAN_PASSWORD` in Vercel
production and `.env.local`. The twelfth independent kill switch.

### D2 — Grants: three new policies, all org-scoped, all is_agent()-gated

`job_specs_agent_select` (the brief is read-only to the agent);
`boolean_queries_agent_select` + `boolean_queries_agent_insert`
(WITH CHECK pinning organization_id to the agent's own org). NO
UPDATE, NO DELETE on boolean_queries — the version history is
immutable to the agent; the recruiter's edit and restore acts keep
their existing human policies untouched.

### D3 — Migration 085 + invariants, with a novel control run

- The three policies above; CHECK rebuild from the LIVE pg_constraint
  list plus **`sourcing_queries_generated`**; allowlist to
  **thirteen**.
- App vocabulary: types.ts (mandates grouping) and describe.ts
  ("Built the sourcing queries" / "Regenerated a sourcing query,
  with recruiter feedback" from the boolean).
- **`agent_boolean_invariants.sql`** — the twelfth principal's file:
  the six-row insert lands org-scoped with versions appending; the
  agent's UPDATE and DELETE against landed queries land on zero rows
  (the version-history pin); the final-spec read answers; **the
  TENANT PIN — the control tripwire**: an INSERT bearing ANOTHER
  org's id is refused by the new grant's WITH CHECK; the event lands
  with the trigger, counts, and has_recruiter_feedback as a boolean
  — the feedback TEXT absent from the trail; history-intact COUNT at
  thirteen; the negative matrix unchanged; forgery both directions;
  twelve-way kill-switch independence; suspended-reads-zero.
- **Control run (novel per slice): the tenant boundary on a
  freshly-minted grant** — REBUILD `boolean_queries_agent_insert`
  with the org conjunct DROPPED from WITH CHECK (the "helpful"
  simplification: "is_agent() already gates it"). The harness must
  abort at the tenant pin (an agent's query landing in another
  tenant's project), positives passing; the policy rebuilt correctly
  and verified, rollback residue-free. Twelve slices in, the first
  control run to regress the ORG boundary — and the first to target
  a grant minted in the same migration.

### D4 — The trail

One **`sourcing_queries_generated`** event per LANDED act, trigger
`generate_all` / `regenerate_one`, detail: `slots_count` (6 / 1),
`slot` (the enum key, regen only), `version` (the landed version),
`job_spec_version`, `has_recruiter_feedback` (boolean — the feedback
TEXT never rides the trail). Counts, enums, booleans — never free
text.

### D5 — Fail-soft

**"The Boolean Search Agent could not run — an operator has
suspended it or its credentials are absent. The existing queries
stand."** The versioned-append design makes it structural: no
pre-clear anywhere, a refused or failed run leaves every landed
version byte-identical, and the newest landed version stays
canonical.

### D6 — The seam shape

`runSourcingGenerateAllAndPersist(projectId)` and
`runSourcingRegenerateAndPersist(projectId, slotKey, feedback)`
beside the runners: the actions keep the gate and hand ids plus the
request-only feedback string; the agent signs in, loads the
generation context under its OWN grants (projects + final spec —
including the no-final-spec refusal and the generate-all
already-exists refusal, each a distinct status the action throws as
today's messages), runs the model call (skillClient = the agent's
session; the prompt shape UNCHANGED this slice — see D8), INSERTs
the version rows, records the event, signs out persisting nothing.
`revalidatePath` stays with the actions.

### D7 — The kind boundary

The first principal writing a versioned-append artifact table. It
holds SELECT on the artifact it versions (unlike the digest's blind
insert — here the current draft IS model input), INSERT to append,
and nothing that can rewrite history — the recruiter's edit/restore
acts remain the human's own policies. No created_by column exists on
boolean_queries; the trail event is the attribution, and the schema
is not widened unbidden. The brief (job_specs) is read-only.

### D8 — Out of scope

- **Target companies** — persists nothing today; converts on the day
  it lands an act. `appendCompaniesToBooleanAction` stays a
  deterministic recruiter act.
- **The feedback-in-input-object observation** — the regen feedback
  rides the model-input JSON today, predating the ctx/wrapper
  doctrine. Moving it to `wrapWithRecruiterContext` is a one-line
  change to prompt semantics; surfaced for the founder, not changed
  unbidden this slice.
- The recruiter's edit and restore acts (saveQueryEdit /
  restoreQueryVersion) stay human.
- The remaining agents (intake, onboarding, role spec, shortlist,
  copilot) queue by usage; metrics stays cron-deferred (§30,
  standing).
- Long-action honesty: 2048 tokens, no web — likely 10–25s; the
  deferred policy stands.

---

## Phases 1–4 — the proven ladder (GATED)

**No build work past Phase 0 until the founder's written
D-confirmation.** Then: migration 085 + invariants (MCP + numbered
file, the dropped-org-conjunct control run verified, green gate);
seam + live account (§30 recipe; durable baseline → 13 users / 36
events after the creation trail); production drive inside Mandate HQ
(harness prefix `08500000`, drive `0db`, scratch is_founder operator
with candidates:write): a scratch project WITH a seeded FINAL job
spec → Build Sourcing Queries → six rows land at version 1 under one
event → suspend → both build and regenerate refuse with the D5
sentence, every version stands → restore → Regenerate one slot WITH
feedback (version 2 lands, the boolean true, the text absent from
the trail); probe matrix with the real JWT — job_specs and
boolean_queries answer (the new lawful reads), the negative matrix
unchanged, the human door 204s writing nothing; teardown to baseline
exactly (scratch spec and query rows key on the scratch project id);
§53 verdicts drafted for sign-off. No completion declaration until
the founder's written confirmation; this file is deleted only after
it.
