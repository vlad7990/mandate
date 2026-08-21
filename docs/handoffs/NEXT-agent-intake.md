# NEXT — The Intake Agent becomes a principal (slice thirteen)

Status: **Phase 0 complete — D1–D8 drafted, awaiting the founder's
written D-confirmation. No build work past this file until then.**

Slice thirteen of agents-as-principals — the fourteen-agent map's
FIRST agent, converted thirteenth: the judgment that turns a one-line
role input into a structured mandate. Next migration: **086**.

---

## Phase 0 — enumeration from the code (the §5h rule)

### The pipeline

`createProjectAction(formData)`
(`src/app/(dashboard)/app/projects/new/actions.ts:11`) is the ONLY
caller of `analyzeAndStoreRole`
(`src/lib/ai/analyze-role.ts:37`). The flow:

1. **Gate** — mandates:write, checked by hand (`can(parseRole(...))`,
   line 50) with redirect-style errors, not `requireActionContext` —
   this surface reports every failure onto the form.
2. **The human's act comes FIRST**: the recruiter's session INSERTs
   the projects row optimistically ("Analyzing…" placeholders, the
   one-line brief stored on `one_line_input`) and the browser lands
   on the project page instantly. Opening the mandate is and stays
   the RECRUITER's act.
3. **The judgment is FIRE-AND-FORGET**: `after()` runs
   `analyzeAndStoreRole` post-response — the programme's first
   conversion with NO interactive surface. A failure today logs and
   leaves the mandate stuck at "Analyzing…" (the project view
   acknowledges the state; there is NO retry surface — D8).
4. **Model call** — `claude-sonnet-4-6`, 1024 tokens. The one-line
   brief IS the entire user message (no JSON wrapper — the input is
   the judgment's subject, nothing rides alongside it). **NO skills
   injection** — the second model call in the product without
   `applySkillsToPrompt` (the digest's gap, second sighting;
   surfaced, not fixed unbidden).
5. **Writes, in two kinds**:
   - THE JUDGMENT: projects UPDATE — title, company_name,
     calibration_model, company_context (the mandate's frozen copy).
     Covered by 074's projects S+U.
   - THE CLIENT BOOKKEEPING: `resolveClientId` → the `resolve_client`
     RPC (SECURITY INVOKER, RLS-guarded find-or-create on CLIENTS)
     sets projects.client_id, and `promoteCompanyContextToClient`
     SELECTs + UPDATEs the clients row. **The clients registry is
     refused to agents by seven-plus invariant files** — these acts
     CANNOT move. Both are best-effort by design (a mandate that
     fails to link "is a mandate with an unresolved client, not a
     failed mandate" — resolve-client.ts:19).

### The load-bearing design fact — the parser split, INVERTED

The digest's split handed human-lawful reads TO the agent's seam in
memory. Here the direction reverses: the agent judges and persists
ITS OWN act (the projects update — lawful under the pool), then
hands the analysis BACK, and the client bookkeeping the judgment
enables stays in the recruiter's `after()` context — the
`resolve_client` RPC and the promotion run under the recruiter's
RLS, exactly as today. The clients registry never meets an agent
session; the negative matrix is untouched.

### Trigger surfaces

Exactly one: the /app/projects/new form (one textarea, ≤500 chars,
submit). Readers that are NOT triggers: the project page polls the
title out of "Analyzing…"; the spec and downstream agents consume
calibration_model and company_context.

### Grant check

| Surface | Needed | Covered by |
|---|---|---|
| projects row read | organization_id (for the event's org scope) | **074 `projects_agent_select`** (verify live) |
| projects UPDATE | the judgment's landing | **074 `projects_agent_update`** (verify live) |
| clients (RPC find-or-create, SELECT, UPDATE) | never — stays the recruiter's act | none granted; refused as always |
| skills SELECT | not wired today (the gap, surfaced) | — |

**The third zero-new-grant slice** — 086 carries only the vocabulary.

---

## Decisions for confirmation

### D1 — The thirteenth principal

Users row, role `agent`, org-bound to Mandate HQ, full name
**"Intake Agent"** (the fourteen-agent map's name), account
`vbreygin+intake@gmail.com`, §30 recipe. Credentials only as
`AGENT_INTAKE_EMAIL` / `AGENT_INTAKE_PASSWORD` in Vercel production
and `.env.local`. The thirteenth independent kill switch.

### D2 — Grants: none new

074's projects S+U cover the judgment. The clients registry stays
human — the `resolve_client` RPC, the client_id write, and the
context promotion remain in the recruiter's after() context.

### D3 — Migration 086 + invariants, with a novel control run

- CHECK rebuild from the LIVE pg_constraint list plus
  **`intake_analyzed`**; allowlist to **fourteen**.
- App vocabulary: types.ts (mandates grouping) and describe.ts
  ("Analyzed the mandate brief" — with the input length when
  present).
- **`agent_intake_invariants.sql`** — the thirteenth principal's
  file: the judgment's UPDATE lands (title/company/calibration/
  context) with `one_line_input` and `created_by` SURVIVING
  untouched (the human's fields); the event lands with actor_id =
  the agent and actor_label = "Intake Agent" — THE SIGNATURE PIN,
  this slice's control tripwire; clients remain refused (SELECT
  zero, and the `resolve_client` RPC returns nothing to an agent —
  SECURITY INVOKER means RLS answers); history-intact COUNT at
  fourteen; the negative matrix unchanged; forgery both directions;
  thirteen-way kill-switch independence; suspended-reads-zero.
- **Control run (novel per slice): the signature dissolved** —
  REWRITE `record_agent_event` to INSERT into activity_events
  directly with a NULL actor (the "helpful" simplification: "skip
  the wrapper, one less call") — an agent's act landing wearing the
  system's blank face, indistinguishable from a migration or a job.
  The harness must abort at the signature pin (actor_id null where
  the agent's id was lawful), positives passing; the function
  restored from the live definition and verified, rollback
  residue-free. Thirteen slices in, the first control run to regress
  the ATTRIBUTION itself.

### D4 — The trail

One **`intake_analyzed`** event per LANDED analysis, trigger
`create` (the only path), detail: `input_chars` (the brief's length
— never its text), `company_identified` (boolean — whether the model
named a company). Client resolution is NOT in the agent's detail —
it is the recruiter's subsequent act and the trail must not claim it
for the agent.

### D5 — Fail-soft

**"The Intake Agent could not run — an operator has suspended it or
its credentials are absent. The mandate keeps its one-line brief."**
Logged server-side — the run is fire-and-forget and has NO toast
surface (the first D5 with nowhere to speak; surfaced in D8). The
guarantee is structural regardless: the placeholders and
one_line_input are the human's landed act; a refused run touches
nothing, and the client bookkeeping simply doesn't happen (null
client is the designed degraded state).

### D6 — The seam shape

`runIntakeAnalysisAndPersist(projectId, oneLine)` beside the runner:
the action keeps the gate, the optimistic INSERT, and the after()
orchestration; inside after(), the seam signs in the agent, runs the
model call on the one-line brief, UPDATEs the projects row under its
own name (title, company_name, calibration_model, company_context,
updated_at — never client_id, never created_by), records the event,
signs out, and RETURNS the parsed analysis. The recruiter's after()
context then does what it does today with the hand-back: resolves
the client through the RPC under the recruiter's RLS, writes
projects.client_id, and promotes the context — the split inverted.
The cookie-based read-only client trick shrinks to the human's half
(the agent needs no cookies at all).

### D7 — The kind boundary

The Intake Agent touches ONE row of one table — the mandate being
born — plus the trail door. It never meets the clients registry: the
find-or-create, the link, and the promotion are the recruiter's acts
on the recruiter's records, enabled by the judgment but not owned by
it. The one-line brief rides as the model's entire input (it IS the
subject) and its TEXT never enters the trail — a count and a boolean
do.

### D8 — Out of scope

- **The stuck-mandate gap, surfaced**: a failed or refused intake
  leaves "Analyzing…" forever — true today, true after this slice.
  A retry surface (or an honest failed-state title) is product work,
  founder-timed.
- **The skills gap, second sighting**: intake never sees
  recruiter-authored skills; one seam line whenever the founder
  wants intake steerable.
- The remaining agents (onboarding, role spec — plus shortlist and
  copilot read-shaped surfaces) queue by usage; metrics stays
  cron-deferred (§30, standing).
- Long-action honesty: 1024 tokens, fire-and-forget — the recruiter
  never waits on it; nothing to defer.

---

## Phases 1–4 — the proven ladder (GATED)

**No build work past Phase 0 until the founder's written
D-confirmation.** Then: migration 086 + invariants (MCP + numbered
file, the null-actor control run verified against the live function
definition, green gate); seam + live account (§30 recipe; durable
baseline → 14 users / 39 events after the creation trail);
production drive inside Mandate HQ (harness prefix `08600000`, drive
`0dc`, scratch is_founder operator with mandates:write): open a
mandate from the REAL /app/projects/new form → watch the title
resolve out of "Analyzing…", the event landing under the Intake
Agent, the client row landing under the OPERATOR (the split live) →
suspend → open a second mandate → it stays honestly at "Analyzing…"
with its brief intact, NO analysis, NO event, the D5 sentence in the
server log → restore → a third mandate analyzes; probe matrix with
the real JWT — clients refused, resolve_client answers the agent
with nothing; teardown to baseline exactly (scratch mandates,
their client rows, and the operator swept on scratch keys); §55
verdicts drafted for sign-off. No completion declaration until the
founder's written confirmation; this file is deleted only after it.
