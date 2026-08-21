# NEXT — The Candidate Research agent becomes a principal (slice six)

Status: **Phase 0 complete — D1–D8 drafted, awaiting the founder's
written D-confirmation. No build work past this file until then.**

Slice six of agents-as-principals, second of the candidate-intelligence
cluster per the confirmed §40 verdict (research leads because its
report feeds triangulation). The judgment that searches the public web
for a person and writes a dossier about them currently runs in the
triggering recruiter's session. Next migration: **079**.

---

## Phase 0 — enumeration from the code (the §5h rule)

### The pipeline

`researchCandidateAction`
(`src/app/(dashboard)/app/projects/[id]/candidates/[candidateId]/actions.ts:1004`)
is the ONLY caller of `runCandidateResearch`
(`src/lib/ai/run-candidate-research.ts:68`). The flow:

1. **Gate** — `requireActiveUser()` (`candidates:write`) +
   `assertCandidateBelongsToProject`. Stays human.
2. **Reads** (two parallel queries):
   - `candidates` SELECT — identity columns (`full_name`,
     `current_title`, `current_company`, `location`, `linkedin_url`,
     `github_url`, `website_url`) plus `cv_structured`, trimmed to a
     `cv_summary` before prompting.
   - `projects` SELECT — `organization_id` only (org-match check +
     skill scoping).
3. **Skills** — `applySkillsToPrompt` (skills SELECT + a
   `projects.client_id` resolve), today on a cookie client.
4. **Model call** — `claude-sonnet-4-6`, max 8000 tokens, **the
   `web_search_20250305` tool at max 7 uses** — the slice's novelty:
   the first principal whose model call reaches the public web. The
   web tool is Anthropic-side; no credential of ours is involved, the
   agent's DATABASE reach is untouched by it, and `sources` are
   extracted server-side from the actual tool results
   (run-candidate-research.ts:42) — never trusted from the model's
   text. `input` is JSON.stringify'd into the prompt; `ctx` is
   separate (the safe shape, already in place).
5. **Write** — `rpcSetCvField(..., "candidate_intelligence", report)`
   → the same SECURITY INVOKER RPC as 078, resolving to the pool's
   `candidates_agent_update`.
6. **Return + revalidate** — the report renders immediately.

### Trigger surfaces

Exactly one: the Candidate intelligence panel's single button
(`candidate-intelligence-panel.tsx:86` — "Research candidate" when
absent, "Re-research" when present). No auto-generation, no
`after()`, no cron. Readers that are NOT triggers: the profile page,
the Copilot context (read-only), and `runTriangulation` — which
CONSUMES `candidate_intelligence` as input but runs in its own action
under the human session until its own slice (next in the cluster).

### Grant check against the pool

| Surface | Needed | Covered by |
|---|---|---|
| candidates SELECT | identity + cv_structured | `candidates_agent_select` (074) |
| candidates UPDATE | the dossier write via the RPC | `candidates_agent_update` (076) |
| projects SELECT | org + skills' client_id | `projects_agent_select` (074) |
| skills SELECT | Skills Studio injection | `skills_agent_select` (074) |

**Vocabulary-only, confirmed by the code.** Migration 079 adds
`candidate_researched` and nothing else.

---

## Decisions for confirmation

### D1 — The sixth principal

Users row, role `agent`, org-bound to Mandate HQ, full name
**"Candidate Research Agent"**, account
`vbreygin+research@gmail.com`, §30 recipe. Credentials only as
`AGENT_RESEARCH_EMAIL` / `AGENT_RESEARCH_PASSWORD` in Vercel
production and `.env.local`. Its /ops row is the sixth independent
kill switch, proven independent in the invariants and the drive.

### D2 — Grants: vocabulary-only

Zero new RLS policies (table above is the whole reach). The web
search tool adds NO database authority and needs none — stated
explicitly so the boundary is on record: suspension kills the run at
sign-in, before any web search is made, so a suspended research agent
searches nothing.

### D3 — Migration 079 + invariants, with a novel control run

- `candidate_researched` into the `activity_events` CHECK (rebuilt
  from the LIVE pg_constraint list + the new value) and the
  `record_agent_event` allowlist (six).
- App vocabulary: types.ts (+ `mandates` group) and describe.ts
  ("Researched the candidate's public presence" /
  "Re-researched…").
- **`agent_research_invariants.sql`** — the sixth principal's
  negative matrix; attribution with trigger named; forgery boundary
  both directions; six-way kill-switch independence; and one
  invariant new to this slice: **the allowlist's history is intact**
  — every prior agent event type (all five) still admitted by
  `record_agent_event` and present in the CHECK.
- **Control run (novel per slice):** re-create
  `activity_events_type_known` from a STALE list — 077's, missing
  `candidate_positioned` — the realistic drift for this project's
  standing trap (a CHECK rebuilt from an old migration file instead
  of pg_constraint). The harness must abort at the
  history-intact invariant with the positives passing; rollback
  residue-free.

### D4 — The trail

One `candidate_researched` event per LANDED dossier, trigger
`research` / `re_research` (from prior key presence),
`replaced_existing` and `sources_count` in detail. A refused or
failed run records nothing.

### D5 — Fail-soft

The §11 sentence: **"The Candidate Research Agent could not run — an
operator has suspended it or its credentials are absent. The existing
dossier stands."** No pre-clear (the RPC is a single key replace); a
real failure keeps today's error contract. No service-role fallback,
ever.

### D6 — The seam shape

`runCandidateResearchAndPersist` beside `runCandidateResearch`
(078's shape): the action keeps gate + assertion; the agent reads the
candidate + project, runs the web-searching model call with skills on
its own session (client via ctx, never input), writes
`candidate_intelligence` through the RPC, records the event, signs
out persisting nothing. The report still returns to the panel.

### D7 — The kind boundary

Pool authority identical across kinds; the researcher's identity is
its credential + allowlist entry. The dossier write touches ONLY the
`candidate_intelligence` key (neighbours pinned by invariant, the
077/078 shape). The web is reached by the MODEL under Anthropic's
tool, not by the principal — the kill switch severs it by refusing
the run, which the drive proves live.

### D8 — Out of scope

- Triangulation and psychology follow, each with its own Phase 0.
- The digest writer stays behind the cluster.
- Long-action honesty on the research panel: a 7-search run is
  Regenerate-class (likely 60–120s) — the deferred-until-observed
  §39 verdict stands, but the drive should note the observed
  duration; if a drop is seen live, the f54f1e7 stamp-poll pattern
  extends (the dossier carries generated_at).
- Web-search cost ceilings stay under the deferred per-agent budgets
  verdict (§30) — one named exception already on record: the HM
  submit endpoint in the rate-limiting bundle.

---

## Phases 1–4 — the proven ladder (GATED)

**No build work past Phase 0 until the founder's written
D-confirmation.** Then: migration 079 + invariants (MCP + numbered
file, control run verified, green gate); seam + live account (§30
recipe; durable baseline → 7 users / 18 events); production drive
inside Mandate HQ (scratch prefix `07900000`, drive `0d5`, scratch
is_founder operator — the relabeled /ops buttons now read
Suspend/Restore): research → suspend → refused with the D5 sentence,
dossier survives byte-identical → restore → re-research + second
event; note the fictional drive subject will come back
low-identity-confidence from the real web — that IS the mechanics
proven; probe matrix with the real JWT; teardown to baseline exactly,
keyed on scratch ids only; verdicts drafted for sign-off. No
completion declaration until the founder's written confirmation; this
file is deleted only after it.
