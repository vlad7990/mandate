# NEXT — The Culture Agent becomes a principal (slice eleven)

Status: **Phase 0 complete — D1–D8 drafted, awaiting the founder's
written D-confirmation. No build work past this file until then.**

Slice eleven of agents-as-principals, the second of the company-side
grouping — the sibling §49 named: the judgment that derives the
culture profile from company context, onboarding, and the feedback
tail currently runs in the triggering recruiter's session. The
product already names it: the panel copy reads "The Culture Agent
reads company context…". Next migration: **084**.

---

## Phase 0 — enumeration from the code (the §5h rule)

### The pipeline

`generateCompanyCultureAction(projectId, recruiterContext?)`
(`src/app/(dashboard)/app/projects/[id]/actions.ts:358`) is the ONLY
caller of `runCompanyCulture` (`src/lib/ai/run-company-culture.ts:30`).
The flow:

1. **Gate** — `requireActionContext("mandates:write")` via the file's
   `requireActiveUser` — the same gate as slice ten.
2. **Reads** — TWO tables, both already in the agent pool: the
   projects row (`company_context, onboarding_responses,
   organization_id`) under 074's `projects_agent_select`, and the
   FEEDBACK TAIL (`feedback_type, content, interpreted, created_at`,
   newest 20, project-scoped) under 074's `feedback_agent_select` —
   the grant the interpreter has held since slice one. Human
   testimony read under an EXISTING grant; nothing new to mint.
3. **Model call** — `claude-sonnet-4-6`, max_tokens 2000, no web
   search. Skills injection PRESENT (`applySkillsToPrompt` — needs
   the slice-ten `skillClient` line to ride the agent's session).
   The recruiter's free-text context rides `ctx.recruiterContext`
   into `wrapWithRecruiterContext` — the model-input trap honoured
   today; the seam preserves it.
4. **Write** — the same direct merge-UPDATE on
   `projects.company_context` (no RPC): `culture_profile` set, and
   `culture_context` written VERBATIM when the recruiter gave
   context or DELETED from the blob when they gave none — the
   delete-when-empty honesty (stale context must not appear to have
   shaped a fresh read). Covered by 074's `projects_agent_update`.

### Trigger surfaces

Exactly one panel (`culture-intelligence-panel.tsx`): "Analyse
culture fit" / "Regenerate" (pending "Analysing"); Regenerate opens
the context panel ("Add context for the AI (optional)", a textarea)
and the toast distinguishes "Profile regenerated with your context".
Readers that are NOT triggers: the project page and the candidate
page render `culture_profile` under the recruiter's own SELECT;
`copilot-context.ts` includes it; `overlays.ts` maps the sibling
annotation keys.

### The load-bearing design facts

**The interpreter's shape again.** Both reads are lawfully the
agent's own — the second ZERO-NEW-GRANT slice. The one human-handed
input is the recruiter's context STRING, which exists only in the
request (like the parser's bytes): the action hands it to the seam
in memory; the agent carries it into the prompt wrapper, persists it
verbatim on the column, and records only a boolean in the trail —
the psychology slice's honesty pattern (§45), reproven here.

**The annotation siblings stay human.**
`saveCultureAnnotationAction` (`actions.ts:462`) and
`toggleCultureFlagAction` (`actions.ts:529`) write `culture_notes` /
`culture_flags` as sibling keys under the RECRUITER's session — they
are recruiter overlay acts, not judgments, and do not move. The
agent's merge-write must leave them (and `intelligence_report`,
`hm_intelligence`) byte-identical — pinned by the invariants.

### Grant check

| Surface | Needed | Covered by |
|---|---|---|
| projects row read | context + onboarding | **074 `projects_agent_select`** (verify live via pg_policies) |
| feedback tail read | newest 20, project-scoped | **074 `feedback_agent_select`** (verify live) |
| projects UPDATE | culture_profile + culture_context merge | **074 `projects_agent_update`** (verify live) |
| skills SELECT | applySkillsToPrompt under the agent | **074** skills S |

The second zero-new-grant slice — 084 carries only the vocabulary.

---

## Decisions for confirmation

### D1 — The eleventh principal

Users row, role `agent`, org-bound to Mandate HQ, full name
**"Culture Agent"** (the name the product already uses), account
`vbreygin+culture@gmail.com`, §30 recipe. Credentials only as
`AGENT_CULTURE_EMAIL` / `AGENT_CULTURE_PASSWORD` in Vercel
production and `.env.local`. The eleventh independent kill switch.

### D2 — Grants: none new

074's projects S+U, feedback S, and skills S cover the whole
judgment. Phase 1 verifies via pg_policies, not migration files. No
policy created, widened, or touched.

### D3 — Migration 084 + invariants, with a novel control run

- CHECK rebuild from the LIVE pg_constraint list plus
  **`culture_profiled`**; allowlist to **twelve**.
- App vocabulary: types.ts (mandates grouping) and describe.ts
  ("Derived the culture profile" / "Re-derived the culture profile",
  "+ with recruiter context" from the boolean — the psychology
  describe shape).
- **`agent_culture_invariants.sql`** — the eleventh principal's
  file: the merge-write lands with ALL sibling keys surviving
  (intelligence_report, hm_intelligence, culture_notes,
  culture_flags); the delete-when-empty pin (a context-less
  regenerate REMOVES culture_context — stale context must not
  outlive the read it shaped); the event lands with
  has_recruiter_context as a boolean and the context TEXT absent
  from the trail; history-intact COUNT at twelve; the negative
  matrix unchanged; forgery both directions; eleven-way kill-switch
  independence; suspended-reads-zero.
- **Control run (novel per slice): the roster boundary itself** —
  ADD a `users_agent_select` policy (the "helpful" future migration:
  "agents need to see their org colleagues to label people in
  reports"). The programme's most-repeated refusal — agents read NO
  people beyond themselves — has never been the control target. The
  harness must abort at the roster invariant (the agent reads N
  users rows, expected 1 self), positives passing; the policy
  dropped and verified gone, rollback residue-free. Eleven slices
  in, the first control run that regresses the PEOPLE boundary.

### D4 — The trail

One **`culture_profiled`** event per LANDED profile, trigger
`analyse` / `regenerate` (from whether culture_profile already
existed on the row), detail: `trigger`, `has_recruiter_context`
(boolean — the TEXT lives visibly in culture_context, never in the
trail), `feedback_count` (how many feedback rows fed the read),
`replaced_existing`. Counts and booleans, never names or free text.

### D5 — Fail-soft

**"The Culture Agent could not run — an operator has suspended it or
its credentials are absent. The existing profile stands."** A refused
or failed run leaves culture_profile, culture_context, and every
sibling byte-identical — no pre-clear anywhere; the
delete-when-empty act happens only in the same merge that lands a
fresh profile. No service-role fallback, ever.

### D6 — The seam shape

`runCompanyCultureAndPersist(projectId, recruiterContext)` beside the
runner: the action keeps the gate and hands the id plus the
recruiter's context string (the request-only human input); the agent
signs in, reads the projects row and the feedback tail under its own
grants, builds the input exactly as the action does today, runs the
model call (skillClient = the agent's session;
wrapWithRecruiterContext unchanged), merges `culture_profile` and
writes-or-deletes `culture_context` per today's semantics, records
the event, signs out persisting nothing. `revalidatePath` stays with
the action.

### D7 — The kind boundary

The Culture Agent reads human testimony (the feedback tail) under
the pool grant the interpreter has held since slice one — reading is
not authoring, and the human door still refuses it. No web reach. The
recruiter's stated context is carried honestly: verbatim on the
column the recruiter can see, a boolean in the trail. The pool's
grants are shared; the identity is the credential plus the
`culture_profiled` allowlist entry, as always.

### D8 — Out of scope

- The annotation overlays (culture_notes / culture_flags) stay
  recruiter acts under the recruiter's session — not judgments, not
  moved.
- The remaining agents (intake, onboarding, role spec, boolean
  search, shortlist, copilot) queue by usage; metrics stays
  cron-deferred (§30, standing).
- Long-action honesty: 2000 tokens, no web — likely 10–20s; the
  deferred policy stands.

---

## Phases 1–4 — the proven ladder (GATED)

**No build work past Phase 0 until the founder's written
D-confirmation.** Then: migration 084 + invariants (MCP + numbered
file, the added-roster-policy control run verified, green gate);
seam + live account (§30 recipe; durable baseline → 12 users / 33
events after the creation trail); production drive inside Mandate HQ
(harness prefix `08400000`, drive `0da`, scratch is_founder operator
with mandates:write): analyse from a scratch project with seeded
feedback → suspend → refused with the D5 sentence, the profile and
its siblings stand → restore → regenerate WITH recruiter context
(the boolean lands true, the text lands on culture_context, never in
the trail) and a context-less regenerate (culture_context deleted —
the delete-when-empty honesty live); probe matrix with the real JWT
— the negative matrix unchanged, feedback readable (the pool's
lawful read), the human door 204s writing nothing; teardown to
baseline exactly; §51 verdicts drafted for sign-off. No completion
declaration until the founder's written confirmation; this file is
deleted only after it.
