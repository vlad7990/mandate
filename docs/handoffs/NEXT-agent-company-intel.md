# NEXT — The Company Intelligence generator becomes a principal (slice ten)

Status: **Phase 0 complete — D1–D8 drafted, awaiting the founder's
written D-confirmation. No build work past this file until then.**

Slice ten of agents-as-principals, the first of the COMPANY-SIDE
grouping (§48). The judgment that researches a company in real time
and writes the Company Intelligence Report currently runs in the
triggering recruiter's session — and so does its pair, the Hiring
Manager dossier. Next migration: **083**.

---

## Phase 0 — enumeration from the code (the §5h rule)

### The pipeline — Company Intelligence

`researchCompanyAction(projectId)`
(`src/app/(dashboard)/app/projects/[id]/actions.ts:920`) is the ONLY
caller of `runCompanyIntelligence`
(`src/lib/ai/run-company-intelligence.ts:71`). The flow:

1. **Gate** — `requireActionContext("mandates:write")` (via the
   file's `requireActiveUser`, line 47) — the mandate-workspace
   capability, not candidates:write.
2. **Reads** — ONE table: the projects row (`company_name,
   calibration_model, company_context, onboarding_responses,
   organization_id`) plus an org-match check. **Every read is already
   in the agent pool** — 074's `projects_agent_select` (org-scoped,
   is_agent()-gated) covers the whole row.
3. **Model call** — `claude-sonnet-4-6`, max_tokens 8000, and the
   **Anthropic `web_search` server tool, max_uses 7** — the FIRST
   agent surface whose judgment reaches the public web. Skills
   injection PRESENT (`applySkillsToPrompt` with
   projectId/organizationId — no digest-style gap; the pool's skills
   SELECT covers it). Sources are extracted SERVER-SIDE from the
   response's `web_search_tool_result` blocks, never model-generated
   (`run-company-intelligence.ts:44`).
4. **Write** — DIRECT `.update()` on projects (no RPC —
   `actions.ts:978`; the file itself records at line ~456 that
   company_context "doesn't yet have an atomic single-key RPC"): a
   read-modify-write merge of the JSONB blob, setting
   `company_context.intelligence_report` + `updated_at`. Covered by
   074's `projects_agent_update`. Doctrine check (082): the UPDATE's
   WHERE reads rows under SELECT policies — the pool holds projects
   SELECT, so the write is NOT inert for an agent.

### The pipeline — Hiring Manager dossier (the pair)

`researchHiringManagerAction(projectId, hmNameOverride?)`
(`actions.ts:1005`) is the ONLY caller of `runHiringManagerResearch`
(`src/lib/ai/run-hiring-manager-research.ts:64`). Identical in every
structural respect: same gate, same single projects-row read (the HM
identity comes from `onboarding_responses.stakeholders` — first
stakeholder, or a name override the UI never currently passes), same
model + web_search max 7 + skills injection + server-side sources,
same direct merge-UPDATE writing `company_context.hm_intelligence`.

### Trigger surfaces

Exactly two, one per judgment: `company-intelligence-panel.tsx:108`
("Research company" / "Re-research", pending "Researching", with
ProgressTracker) and `hm-intelligence-panel.tsx` (same labels,
"Research HM"). Readers that are NOT triggers: the project page
renders both reports under the recruiter's own SELECT;
`run-triangulation.ts:190` consumes `intelligence_report` and
`hm_intelligence` as triangulation input (the handover to an existing
principal happens in the human session that assembles triangulation's
input — unchanged); `copilot-context.ts:223` includes both keys.

### The load-bearing design fact

**This is the interpreter's shape, not the parser split.** Unlike the
digest (whose rollup reads the pool refuses by design), every read
this judgment makes is lawfully the agent's own — one projects row
under 074's SELECT. The agent can read for itself: sign in, read the
project row, run the web_search call, merge and UPDATE under its own
name, record, sign out. No manager-assembled handover is needed and
no invariant file is disturbed.

**One slice, not two.** The code's verdict on the pairing: same
caller file, same gate, same single-row read, same write column, same
model pattern, same grant surface, panels side by side, both feeding
triangulation — and in the fourteen-agent map this is one agent
(Company Research). One principal holding BOTH judgments, each
landing its own event kind.

### Grant check

| Surface | Needed | Covered by |
|---|---|---|
| projects row read | context, onboarding, calibration | **074 `projects_agent_select`** (verify live via pg_policies in Phase 1) |
| projects UPDATE | the merge write on company_context | **074 `projects_agent_update`** (verify live) |
| skills SELECT | applySkillsToPrompt under the agent | **074** skills S |
| web_search | Anthropic server tool | no DB surface — API-side, no grant exists or is needed |

**The first zero-new-grant slice.** Migration 083 carries only the
vocabulary: the CHECK rebuild and the allowlist. The pool's
projects_agent_update is SHARED with the interpreter — per house
doctrine the policy is a pool grant; the identity is the credential
plus the allowlist entry.

---

## Decisions for confirmation

### D1 — The tenth principal

Users row, role `agent`, org-bound to Mandate HQ, full name
**"Company Intelligence Agent"**, account
`vbreygin+companyintel@gmail.com`, §30 recipe. Credentials only as
`AGENT_COMPANYINTEL_EMAIL` / `AGENT_COMPANYINTEL_PASSWORD` in Vercel
production and `.env.local`. The tenth independent kill switch. One
identity holds both judgments (company report and HM dossier) — the
code's one-slice verdict above.

### D2 — Grants: none new

The pool already holds everything this judgment lawfully touches
(074: projects S+U, skills S). Phase 1 verifies via pg_policies (the
ground-truth trap), not the migration file. The write path is a
direct UPDATE merge — no RPC exists or is added. No policy is
created, widened, or touched.

### D3 — Migration 083 + invariants, with a novel control run

- CHECK rebuild from the LIVE pg_constraint list plus TWO new values:
  **`company_researched`** and **`hm_researched`**; allowlist to
  **eleven**. (The §48 brief estimated ten — the code found two
  distinct landed acts on two report keys under one principal; if
  the founder prefers one kind per slice, the named alternative is a
  single `company_researched` with a `subject` boolean in detail,
  allowlist at ten. Drafted as two.)
- App vocabulary: types.ts (mandates grouping, alongside
  desk-digest's) and describe.ts ("Researched the company" /
  "Re-researched the company"; "Researched the hiring manager" /
  "Re-researched the hiring manager").
- **`agent_companyintel_invariants.sql`** — the tenth principal's
  file: negative matrix UNCHANGED (roster-beyond-self,
  activity_events, clients, placements, organizations, fees still
  refused); both event kinds land as the agent; the merge-write lands
  with sibling keys (culture_profile, annotations) SURVIVING intact;
  history-intact COUNT at eleven; forgery boundary both directions;
  ten-way kill-switch independence; suspended-reads-zero.
- **Control run (novel per slice): the vocabulary boundary
  dissolved** — DROP the activity_events CHECK constraint entirely
  (the "helpful" future rationalisation: "the app allowlist already
  guards event types; the constraint is redundant"). Under 053's
  never-raise door a forged nonsense type then lands SILENTLY as
  success — the harness must abort at the vocabulary invariant (a
  nonsense event type as the agent must REFUSE to land), positives
  passing; the CHECK rebuilt from the live list and verified,
  rollback residue-free. Ten slices in, the first control run where
  the boundary is REMOVED rather than widened, moved, or mis-rebuilt.

### D4 — The trail

One event per LANDED report, trigger `research` / `re_research`
(from whether the report key already exists — read in the same
projects row the seam already holds):

- `company_researched` detail: `trigger`, `sources_count`,
  `leadership_count`, `recent_context_count`.
- `hm_researched` detail: `trigger`, `sources_count`,
  `stakeholder_override` (boolean — whether a name override was
  passed). Counts and booleans only — the HM's name never rides the
  trail (it stays in the report the recruiter's own SELECT renders).

### D5 — Fail-soft

**"The Company Intelligence Agent could not run — an operator has
suspended it or its credentials are absent. The existing report
stands."** Both actions, one sentence. The merge-write shape makes
the guarantee concrete: a refused or failed run leaves the prior
report and every sibling key byte-identical. No service-role
fallback, ever.

### D6 — The seam shape

`runCompanyIntelligenceAndPersist(projectId, opts)` and
`runHiringManagerResearchAndPersist(projectId, hmNameOverride, opts)`
beside the existing runners: each action keeps its gate and hands
only ids; the agent signs in, reads the project row under its OWN
SELECT (the interpreter shape — the reads are lawfully the pool's),
builds the model input, runs the web_search call, merges and UPDATEs
`company_context` under its own name, records the event, signs out
persisting nothing. `revalidatePath` stays with the action. Inputs
are already plain serialisable objects; ctx carries ids only —
verified in both runners.

### D7 — The kind boundary

The first principal whose judgment touches the public web —
web_search is an Anthropic server tool with no database surface; its
reach is capped in code (max_uses 7) and its yield is recorded as
`sources_count` in the trail and server-extracted URLs in the report.
The principal shares the pool's projects UPDATE with the interpreter;
identity remains the credential plus the allowlist entries, as
always. Skills injection runs under the agent's session — recruiter
skills steer this judgment today and continue to (no digest-style
gap). The candidate pool's grants are not extended to it; it reads no
person the roster protects (the HM's name arrives from the project
row it lawfully reads, and leaves only in the report body).

### D8 — Out of scope

- **The culture generator, observed as a sibling**
  (`generateCompanyCultureAction`, `actions.ts:359` →
  `run-company-culture.ts`): the third company_context writer
  (culture_profile), same gate, same merge-UPDATE, no web_search,
  recruiter free text riding ctx correctly. Structurally
  near-mechanical to convert on this slice's shape — queued by usage
  on the founder's word, NOT bundled here unbidden.
- The HM override selector UI: the action accepts `hmNameOverride`;
  no panel passes it. Product gap, not this slice's.
- The remaining agents (intake, onboarding, role spec, boolean
  search, shortlist, copilot) queue by usage; metrics stays
  cron-deferred (§30, standing).
- Long-action honesty: web_search runs (5–7 searches + 8000 tokens)
  are plausibly the product's longest calls. Both panels already
  carry ProgressTracker. The deferred policy stands — extend the
  f54f1e7 treatment only if a drop is observed live.

---

## Phases 1–4 — the proven ladder (GATED)

**No build work past Phase 0 until the founder's written
D-confirmation.** Then: migration 083 + invariants (MCP + numbered
file, the dropped-CHECK control run verified with the rebuild from
the LIVE pg_constraint list, green gate — tsc/vitest/eslint/build);
seam + live account (§30 recipe; durable baseline → 11 users / 27+3
events after the creation trail; both report keys' durable state
snapshotted before the drive); production drive inside Mandate HQ
(harness prefix `08300000`, drive `0d9`, scratch is_founder operator
with mandates:write): research company from a scratch project →
suspend → both buttons refuse with the D5 sentence, prior reports and
sibling keys stand → restore → re-research + HM research land with
second/third events; probe matrix with the real JWT — the negative
matrix unchanged, forged human attribution refused, the human door
204s writing nothing; teardown to baseline exactly (scratch project
rows key on scratch ids; drive events swept both passes); §49
verdicts drafted for sign-off. No completion declaration until the
founder's written confirmation; this file is deleted only after it.
