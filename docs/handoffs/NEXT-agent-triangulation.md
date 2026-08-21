# NEXT — The Triangulation agent becomes a principal (slice seven)

Status: **Phase 0 complete — D1–D8 drafted, awaiting the founder's
written D-confirmation. No build work past this file until then.**

Slice seven of agents-as-principals, third of the candidate-intelligence
cluster per the confirmed §42 verdict. The judgment that synthesises
three intelligence reports into a decision-grade fit verdict — what the
firm concludes when it lines the company, the hiring manager, and the
person up against each other — currently runs in the triggering
recruiter's session. Next migration: **080**.

---

## Phase 0 — enumeration from the code (the §5h rule)

### The pipeline

`generateTriangulationAction`
(`src/app/(dashboard)/app/projects/[id]/candidates/[candidateId]/actions.ts:1050`)
is the ONLY caller of `runTriangulation`
(`src/lib/ai/run-triangulation.ts:37`). The flow:

1. **Gate** — `requireActiveUser()` (`candidates:write`) +
   `assertCandidateBelongsToProject`. Stays human.
2. **Reads** (two parallel queries):
   - `candidates` SELECT — identity + `cv_structured`, from which
     `candidate_intelligence` (the researcher's dossier) is taken.
   - `projects` SELECT — `organization_id, company_name,
     calibration_model, company_context`. **The §41 question is
     answered by the code: the company report
     (`company_context.intelligence_report`) and the HM report
     (`company_context.hm_intelligence`) live ON the projects row**,
     already inside `projects_agent_select` (074). No pool widening.
3. **The readiness gate** — all three base reports must exist; the
   refusal names the missing ones ("Triangulation needs all three
   base reports first. Missing: …"). Mirrored client-side (the panel
   disables the button and lists what's missing).
4. **Skills** — `applySkillsToPrompt`, today on a cookie client.
5. **Model call** — `claude-sonnet-4-6`, max 4500 tokens, **no web
   search** — pure synthesis over the three reports, whose noisy
   `sources` arrays are stripped before prompting
   (run-triangulation.ts:90). `input`/`ctx` split already safe.
6. **Write** — `rpcSetCvField(..., "triangulation_report", report)` —
   the 021 SECURITY INVOKER RPC, resolving to
   `candidates_agent_update` (076).

### Trigger surfaces

Exactly one: the Triangulation panel's single button
(`triangulation-panel.tsx` — "Generate report" / "Regenerate"),
disabled until all three base reports exist. Readers that are NOT
triggers: the profile page and the Copilot context (read-only).

### Grant check against the pool

| Surface | Needed | Covered by |
|---|---|---|
| candidates SELECT | identity + dossier | `candidates_agent_select` (074) |
| candidates UPDATE | the report write via the RPC | `candidates_agent_update` (076) |
| projects SELECT | company + HM reports, calibration, org | `projects_agent_select` (074) |
| skills SELECT | Skills Studio injection | `skills_agent_select` (074) |

**Vocabulary-only, confirmed by the code.** Migration 080 adds
`candidate_triangulated` and nothing else.

---

## Decisions for confirmation

### D1 — The seventh principal

Users row, role `agent`, org-bound to Mandate HQ, full name
**"Triangulation Agent"**, account `vbreygin+triangulation@gmail.com`,
§30 recipe. Credentials only as `AGENT_TRIANGULATION_EMAIL` /
`AGENT_TRIANGULATION_PASSWORD` in Vercel production and `.env.local`.
Its /ops row is the seventh independent kill switch.

### D2 — Grants: vocabulary-only

Zero new RLS policies (the table above is the whole reach). No web
search, no storage, no new tables — the narrowest slice yet.

### D3 — Migration 080 + invariants, with a novel control run

- `candidate_triangulated` into the CHECK (rebuilt from the LIVE
  pg_constraint list + the new value) and the allowlist (seven).
- App vocabulary: types.ts (+ `mandates`) and describe.ts
  ("Triangulated the candidate against the role" / "Re-triangulated…").
- **`agent_triangulation_invariants.sql`** — the seventh principal's
  negative matrix; attribution with trigger named; forgery boundary
  both directions; seven-way kill-switch independence; the
  history-intact COUNT at seven (standing doctrine per §42 — the
  count, not the exception, is the tripwire); neighbours-intact on
  the write (now four sibling keys: parser fields, evaluation,
  positioning_kit, candidate_intelligence).
- **Control run (novel per slice): regress `is_agent()` itself** —
  re-created WITHOUT its status='active' condition, the realistic
  "simplification" drift that would quietly disarm every kill switch
  at the predicate layer. The harness must abort at the
  suspended-agent-reads-zero invariant (the suspended triangulator
  reading rows), with the positives passing; restored and verified,
  rollback residue-free. Seven slices in, the programme's central
  safety mechanism gets its own regression proof.

### D4 — The trail

One `candidate_triangulated` event per LANDED report, trigger
`generate` / `regenerate` (from prior key presence),
`replaced_existing` in detail. A refused or failed run records
nothing.

### D5 — Fail-soft, two refusals with different owners

- Agent refusal (suspension / absent credentials): **"The
  Triangulation Agent could not run — an operator has suspended it or
  its credentials are absent. The existing report stands."** No
  pre-clear; the old report survives until the single key replace
  lands. No service-role fallback, ever.
- The readiness refusal ("…needs all three base reports first.
  Missing: …") is a HUMAN-facing precondition, not an agent act: the
  seam returns a typed `missing_inputs` result carrying the names,
  and the action throws today's exact sentence — the message the
  recruiter already knows, unchanged.

### D6 — The seam shape

`runTriangulationAndPersist` beside `runTriangulation` (the 078/079
shape): the action keeps gate + assertion; the agent reads candidate
and project, evaluates readiness, runs the skill-injected synthesis
(client via ctx), writes `triangulation_report` through the RPC,
records the event, signs out persisting nothing. The report still
returns to the panel.

### D7 — The kind boundary

Pool authority identical across kinds; the triangulator's identity is
its credential + allowlist entry. It CONSUMES three other judgments —
the researcher's dossier and the two company-side reports — read-only,
and rewrites none of them: the write touches ONLY
`triangulation_report`, pinned by the neighbours-intact invariant.
(The company/HM reports are project-level artifacts written by
human-session actions today; converting THEIR writers is company-side
cluster work, out of this slice.)

### D8 — Out of scope

- Psychology follows as slice eight, closing the cluster; the digest
  writer waits behind it.
- The company-intelligence and HM-intelligence generators (they write
  `company_context` keys on projects, in human sessions) are NOT this
  cluster's candidates — they belong to a company-research grouping
  the founder orders when the cluster closes.
- Long-action honesty on the panel: synthesis is single-call
  (~30–60s expected); deferred-until-observed stands.

---

## Phases 1–4 — the proven ladder (GATED)

**No build work past Phase 0 until the founder's written
D-confirmation.** Then: migration 080 + invariants (MCP + numbered
file, the is_agent() control run verified with a diffed restore,
green gate); seam + live account (§30 recipe; durable baseline →
8 users / 21 events); production drive inside Mandate HQ (harness
prefix `08000000`, drive `0d6`, scratch is_founder operator): seed
the three base reports on a scratch world → generate → Suspend →
refused with the D5 sentence, report survives byte-identical →
Restore → regenerate + second event; probe matrix with the real JWT;
teardown to baseline exactly, keyed on scratch ids only; §43 verdicts
drafted for sign-off. No completion declaration until the founder's
written confirmation; this file is deleted only after it.
