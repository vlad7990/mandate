# NEXT — The Search Health Agent becomes a principal (slice fourteen)

Status: **Phases 1–4 EXECUTED (2026-08-21, D1–D8 confirmed as
drafted). Migration 087 + invariants applied and control-run
verified; seam live (`ea5e65b` + `7c072fd`); the drive, probe
matrix, and first-pass teardown are recorded in §57 of the main
handoff, with verdicts DRAFTED. Awaiting the founder's written §57
confirmation — no completion declaration until then; this file is
deleted only after it.**

Slice fourteen of agents-as-principals — the LAST of the
fourteen-agent map: Metrics / Search Health, deferred since §30 as
"cron-shaped." Phase 0's finding: the agent exists today as TWO
on-demand judgments that persist and can convert NOW; the SCHEDULED
sweep is a documented socket that stays channel-blocked (D8). Next
migration: **087**.

---

## Phase 0 — enumeration from the code (the §5h rule)

### Judgment one — health suggestions

`generateHealthSuggestionsAction(projectId)`
(`src/app/(dashboard)/app/projects/[id]/actions.ts:533`) is the ONLY
caller of `runSearchHealth` (`src/lib/ai/run-search-health.ts:48`).

1. **Gate** — mandates:write; plus the HEALTH GATE: refuses when the
   computed health is healthy ("suggestions are only generated when
   stalled or at-risk").
2. **Reads** — ALL in the pool post-085: the projects row;
   `computeProjectHealth` (candidates, feedback, candidate_scores);
   `computePipelineMetrics` (candidates); the canonical
   boolean_queries per slot (085's grant); the feedback tail (074).
   One mechanical note: both metrics helpers hardwire the cookie
   client (`health.ts:45`, `pipeline.ts:30`) — they need an optional
   client parameter to run under the agent's session (the skillClient
   pattern, applied to metrics).
3. **Model call** — `claude-sonnet-4-6`, skills injection PRESENT
   (needs the skillClient line).
4. **Write** — projects.health_suggestions merge-UPDATE (074's pool).
   `dismissHealthSuggestionAction` — the recruiter's overlay act on
   the same blob — STAYS HUMAN.

**Zero new grants for this judgment.**

### Judgment two — the weekly report

`generateWeeklyReportAction(projectId)`
(`src/app/(dashboard)/app/projects/[id]/reports/actions.ts:35`) is
the ONLY caller of `runWeeklyReport`.

1. **Gate** — `clients:share` — a CLIENT-FACING artifact's gate, not
   candidates:write.
2. **Reads** — all in the pool: projects, candidates,
   candidate_scores, the week's feedback. The week's assembly
   (Monday-of, sourced/moves/rank-moves derivation) is deterministic
   code over those reads.
3. **Model call** — skills injection present (skillClient needed).
4. **Write** — `project_reports` INSERT — **NOT in the pool**; and
   the table carries an ATTRIBUTION COLUMN: `generated_by` (the
   action stamps auth.userId today). The action returns the new id
   via INSERT..RETURNING — which under a no-SELECT grant is refused
   (the 082 discovery). The seam MINTS THE ID ITSELF and inserts
   blind: the RETURNING doctrine applied constructively.

### The cron socket — enumerated, not built

`/api/cron/maintenance` (vercel.json, daily, CRON_SECRET-gated,
fails closed) documents in its own comments where "Agent 14's weekly
sweep" plugs in — and why it deliberately doesn't exist yet:
stalled-search detection has NO CHANNEL to push to until Resend is
provisioned (founder item), and a scheduled job whose output nobody
receives "would be motion, not automation." Phase 0 honours that
reasoning: the scheduled sweep is D8, and D4 RESERVES the trigger
value `scheduled` so that when the founder provisions the channel,
the cron route signs in THIS SAME principal and the sweep lands with
no new migration — the cron becomes just another trigger named in
the trail.

### Grant check

| Surface | Needed | Covered by |
|---|---|---|
| projects, candidates, candidate_scores, feedback, boolean_queries reads | both judgments' inputs | **pool (074/085)** — verify live |
| projects UPDATE | health_suggestions merge | **074 `projects_agent_update`** |
| project_reports INSERT | the weekly report's landing | **NEW — `project_reports_agent_insert` (087)**, generated_by PINNED to auth.uid() |
| project_reports SELECT/UPDATE/DELETE | never — blind insert, id minted in the seam; the recruiter reads and exports | none granted |
| skills SELECT | both prompts | **074** skills S |

---

## Decisions for confirmation

### D1 — The fourteenth principal

Users row, role `agent`, org-bound to Mandate HQ, full name
**"Search Health Agent"** (the map's name, the product's diction),
account `vbreygin+metrics@gmail.com`, §30 recipe. Credentials only as
`AGENT_METRICS_EMAIL` / `AGENT_METRICS_PASSWORD` in Vercel production
and `.env.local`. The fourteenth independent kill switch. One
principal, two judgments — health and the weekly report — the
company-intelligence precedent.

### D2 — Grants: one new policy

`project_reports_agent_insert` — INSERT only, is_agent() + org +
**generated_by pinned to auth.uid()**: the report can NEVER wear a
human's name (the digest's created_by pin, on the client-facing
artifact table). No SELECT — the seam mints the row's id itself and
inserts BLIND (082's RETURNING doctrine applied constructively); no
UPDATE, no DELETE — landed reports are the recruiter's records.

### D3 — Migration 087 + invariants, with a novel control run

- The policy above; CHECK rebuild from the LIVE pg_constraint list
  plus **`health_suggested`** and **`weekly_report_generated`**;
  allowlist to **sixteen**.
- App vocabulary: types.ts (mandates grouping) and describe.ts
  ("Suggested search-health fixes — N suggestions"; "Wrote the
  weekly report").
- **`agent_metrics_invariants.sql`** — the fourteenth principal's
  file: the health merge-write lands with siblings surviving; the
  report's BLIND insert lands with generated_by = the agent and the
  minted id honoured; **THE IMPERSONATION PIN — the control
  tripwire**: an INSERT bearing a HUMAN's generated_by is refused by
  the new grant's WITH CHECK; the agent's UPDATE and DELETE against
  landed reports land on zero rows; INSERT..RETURNING refused (the
  082 shape, reproven on this table); history-intact COUNT at
  sixteen; the negative matrix unchanged; forgery both directions;
  fourteen-way kill-switch independence; suspended-reads-zero.
- **Control run (novel per slice): the impersonation drift** —
  REBUILD `project_reports_agent_insert` with the generated_by
  conjunct DROPPED ("we trust the app to stamp it"). The harness
  must abort at the impersonation pin — an agent's report landing
  under a RECRUITER's name, the exact inverse of 086's null-actor
  drift: thirteen slices bookended by the two faces of attribution
  fraud, anonymity and impersonation. Policy rebuilt and verified,
  rollback residue-free.

### D4 — The trail

Two kinds, one per judgment:
- **`health_suggested`** — trigger `on_demand` (with `scheduled`
  RESERVED for the future sweep), detail: `health_status`
  (stalled/at_risk enum), `suggestions_count`.
- **`weekly_report_generated`** — trigger `on_demand` (`scheduled`
  reserved), detail: `week_starting` (ISO date), `candidates_count`,
  `feedback_count`.
Counts, enums, dates — never names or free text.

### D5 — Fail-soft

**"The Search Health Agent could not run — an operator has suspended
it or its credentials are absent. The existing suggestions stand."**
and, on the reports surface, the same sentence ending **"The
previous reports stand."** Nothing pre-cleared anywhere: the health
blob survives a refused run byte-identical, and the report table
only ever gains rows.

### D6 — The seam shape

`runHealthSuggestionsAndPersist(projectId)` and
`runWeeklyReportAndPersist(projectId)` beside the runners: the
actions keep their gates (mandates:write; clients:share) and hand
ids; the agent signs in, computes health and pipeline UNDER ITS OWN
SESSION (the metrics helpers gain an optional client parameter),
applies the health gate itself (a `healthy` status the action throws
as today's message), reads the inputs, runs the model call
(skillClient), lands its act — the merge-UPDATE, or the blind INSERT
with a seam-minted id and generated_by = itself — records the event,
signs out, and returns what the UI needs (the suggestions blob; the
minted report id). `revalidatePath` stays with the actions.

### D7 — The kind boundary

The last on-demand principal. Its report lands on a client-facing
table under an attribution column PINNED to its own identity — the
report can never claim a recruiter wrote it, and (the control run's
point) a recruiter's name can never be forged onto it. It reads only
what the pool already held; the one new door is INSERT-only and
blind. When the scheduled sweep arrives it will be THIS principal
signing in from the CRON_SECRET-gated route — same credential, same
kill switch, a `scheduled` trigger in the same vocabulary.

### D8 — Out of scope

- **The scheduled sweep** — channel-blocked by design (no Resend, no
  recipient; the cron route's own comments refuse motion without
  automation). It lands in `/api/cron/maintenance` on the founder's
  word once the channel exists, with NO new migration: the trigger
  vocabulary, the principal, and the kill switch are all ready.
- `dismissHealthSuggestionAction` stays the recruiter's overlay act.
- The onboarding and role-spec surfaces and the shortlist/copilot
  read-shaped surfaces queue by usage (outside the fourteen-map's
  remaining scope).
- Long-action honesty: both runs are seconds-scale; deferred stands.

---

## Phases 1–4 — the proven ladder (GATED)

**No build work past Phase 0 until the founder's written
D-confirmation.** Then: migration 087 + invariants (MCP + numbered
file, the dropped-generated_by control run verified, green gate);
seam + live account (§30 recipe; durable baseline → 15 users / 42
events after the creation trail); production drive inside Mandate HQ
(harness prefix `08700000`, drive `0dd`, scratch is_founder
operator): a scratch project shaped STALLED (aged candidates, stale
feedback) → generate suggestions → the merge lands under the agent
with the health gate honest → weekly report → the row lands with
generated_by = the agent and the minted id → suspend → both surfaces
refuse with the D5 sentences, blob and reports stand → restore →
regenerate; probe matrix with the real JWT — project_reports SELECT
refused, INSERT..RETURNING refused, forged generated_by refused, the
negative matrix unchanged; teardown to baseline exactly; §57
verdicts drafted for sign-off. No completion declaration until the
founder's written confirmation; this file is deleted only after it.
