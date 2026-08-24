# NEXT — the stuck-mandate retry surface

The §55/§56 standing gap, first of the product-development queue.
**Phase 0 complete 2026-08-24. D1–D8 DRAFTED below — the build is
GATED on the founder's written confirmation. Nothing past Phase 0 has
been touched.**

## The gap, as recorded

§55 (confirmed §56): a failed or refused intake leaves a mandate at
"Analyzing…" forever — true before the intake slice and true after
it. The retry surface or an honest failed-state title is product
work, founder-timed. Today the recruiter's only recovery is to open a
new mandate and retype the brief.

## Phase 0 — what reconnaissance found (read-only)

1. **The placeholder is a literal.** The create action inserts
   `title: "Analyzing…"`, `company_name: "Analyzing…"` optimistically
   (`app/projects/new/actions.ts:62`). Readiness is DERIVED:
   `isAnalysisReady` = `calibration_model.role_title` present
   (`app/projects/[id]/page.tsx:116`). There is no status column and
   no failure marker anywhere on the row.
2. **The seam already names its failures.** `IntakeRunResult` is
   `ready | unavailable | agent_unavailable | failed`
   (`lib/ai/analyze-role.ts:53–65`). Every non-ready path returns
   early leaving the row untouched — brief intact, placeholders
   standing. The only record is a server log line (plus Sentry for
   genuine faults since §60; D5 refusals correctly never captured).
3. **The poller gives up silently.** `ProjectPoller` refreshes every
   1.5s for 60s, then clears its own interval and does NOTHING
   (`app/projects/[id]/project-poller.tsx:20–27`). The recruiter is
   left with a pulsing title skeleton that will never resolve, on a
   page that claims the Intake tile is "active".
4. **The list lies too.** The Mandates list renders `title` verbatim
   — a stuck mandate reads "Analyzing…" in the roster forever.
5. **The house has already solved this defect class.** Job specs
   (and both executive generators) carry the full arc:
   `is_generating` + `generation_error` columns; the seam writes
   terminal failure under the recruiter's cookie session via
   `markGenerationFailed`, sanitised by `agentErrorMessage` +
   `safeFailureMessage` (`lib/ai/agent-errors.ts` — provider payloads
   can never be stored or rendered); the polling skeleton fires
   `markGenerationTimedOut` after its window, guarded
   `.eq("is_generating", true)` so a landed run is never clobbered
   (`spec/actions.ts:230`); the error view renders the sentence
   verbatim with a Retry CTA; retry idempotence rides a DB latch. The
   intake flow predates this pattern and has only its first half.
6. **The trail needs NO migration.** `record_agent_event` (086/087)
   already carries `intake_analyzed` in the CHECK and passes
   `p_detail` through unconstrained — a `trigger: "retry"` value
   beside the existing `"create"` is vocabulary, not schema. The
   seam currently hardcodes `trigger: "create"`
   (`lib/ai/analyze-role.ts:143`).
7. **Rate limiting is not implicated.** 088's eleven scopes are all
   anonymous doors; signed-in AI actions are gated by role and
   capability, not scopes. A retry action adds no scope — consistent
   with every other authenticated AI action.
8. **Skills adjacency, noted not bundled.** The job-spec seam already
   injects recruiter-authored skills (`applySkillsToPrompt`); the
   intake seam's skills gap is its own queue item and stays out of
   this slice.

## The shape proposed

The job-spec failure arc, applied to the mandate row: one nullable
column, three honest writers, one recruiter-gated retry door, and the
poller taught to mark instead of abandon.

## D1–D8 — drafted, for the founder to confirm

- **D1 — Detection is a column, not an inference.** Migration **090**
  adds `projects.intake_error text` (NULL = no terminal failure). No
  `is_generating` twin — the placeholder title already IS the
  in-flight marker, and readiness stays derived from
  `calibration_model`. NO new policies, NO new grants: every write
  below rides existing UPDATE policies (the recruiter's own; the
  agent's 074 UPDATE is not extended — see D2). The seam's success
  UPDATE also sets `intake_error: null`, so a slow run landing after
  a timeout marker clears the stale sentence (the job-spec success
  path's shape).
- **D2 — Failure bookkeeping is the HUMAN's, all three writers.** The
  agent's writes stay exactly as they are (judgment only: title,
  company, calibration, context). The markers are written in
  `analyzeAndStoreRole`'s human half under the recruiter's cookie
  session, keyed off the run status — `failed` and
  `agent_unavailable` each store their authored sentence (the
  `agent_unavailable` path HAS no agent session to sign with, which
  is the tell that marking is human bookkeeping — the
  `markGenerationFailed` precedent). The third writer is
  `markIntakeTimedOut`, a new action the poller fires at its window's
  end, guarded "still not ready AND `intake_error` IS NULL" so a
  landed or already-marked run is never clobbered. All three pass
  through `safeFailureMessage` — provider payloads never reach the
  row.
- **D3 — The retry is the recruiter's act, through the same door as
  creation.** `retryIntakeAnalysisAction(projectId)` in
  `app/projects/[id]/actions.ts` under `runAction` +
  `requireActionContext("mandates:write")`. It refuses when analysis
  is already ready (authored sentence). The latch: it clears
  `intake_error` with an `.eq`-guard UPDATE — retry is offered ONLY
  from the marked-failed state, so a double-click or concurrent tab
  finds the latch already cleared and does NOT fire a second paid
  call (the job-spec `wasExisting` shape, no new index needed). Then
  `after(analyzeAndStoreRole(projectId, oneLineInput, "retry"))` —
  the same fire-and-forget seam, trigger threaded through.
- **D4 — The trail names the retry.** A successful retry records
  `intake_analyzed` with `trigger: "retry"` — detail vocabulary only,
  no migration, allowlist count unchanged. The brief's text still
  never rides the trail; `intake_error` stores only authored or
  `safeFailureMessage`-filtered sentences — never the brief, never a
  provider body.
- **D5 — Nothing is destroyed, and refusals are not faults.** The
  brief and placeholders survive every path, as today. A refused
  retry (agent suspended from /ops) now surfaces its D5 sentence in a
  TOAST — the retry click is a foreground act with a reader present,
  unlike the fire-and-forget create — and the marker keeps the page
  honest after the toast is gone. Sentry doctrine unchanged: refusals
  never become events; the existing `captureSeamError` sites already
  cover the faults.
- **D6 — The honest surfaces.** Project page: when `!ready &&
  intake_error`, the pulsing skeleton is replaced by an honest failed
  block — the brief shown, the stored sentence verbatim, a Retry
  button for `mandates:write` roles (readers without the capability
  see the sentence without the button). `ProjectPoller` gains the
  job-spec timeout arc — mark, then refresh — instead of silently
  abandoning (window stays 60s; live intake runs land in ~20s).
  Mandates list: the SELECT gains `intake_error` and a marked row
  swaps its "Analyzing…" title for an honest "Analysis failed — open
  to retry" line; no other list change.
- **D7 — Removability and the kill switch.** No new principal, no new
  credential, no new switch: the retry rides the Intake Agent's
  existing kill switch — a suspended agent refuses the retry with its
  own sentence, visibly this time. The column is additive and
  droppable; with the surfaces removed the product degrades exactly
  to today's behaviour.
- **D8 — Deferred sockets, recorded not built.** The skills-injection
  one-liner (`applySkillsToPrompt` in the intake seam) stays its own
  queue item. No scheduled sweep of stuck mandates — the poller plus
  marker close the loop without cron. No backfill: the durable
  baseline carries no stuck mandate.

## The phases

- **Phase 0** — this document. ✓ 2026-08-24, read-only.
- **Phase 1** — migration 090 (column + comment, no policies — MCP
  project `xipyqnltkbtywxqyxupf` AND the numbered file); seam
  threading (trigger param; human-half markers; success clears the
  marker); `retryIntakeAnalysisAction` + latch;
  `markIntakeTimedOut`.
- **Phase 2** — surfaces: the failed block in `project-view`, the
  poller's timeout arc, the list's honest line, the refusal toast.
- **Phase 3** — tests: latch idempotence (second clear is a no-op,
  no second `after()`), marker sanitisation through
  `safeFailureMessage`, timeout guard never clobbers a landed run,
  `isAnalysisReady` interplay. Green gate before every commit: tsc /
  vitest (812 baseline) / eslint / next build.
- **Phase 4** — driven live on production, §57-style: open a mandate
  with the agent suspended → the marker lands and the page turns
  honest at the window; retry while suspended → the D5 sentence in a
  toast; restore → retry → analysis lands, client born under the
  recruiter, the trail's `trigger: "retry"` on the event; teardown on
  scratch keys (next drive prefix: 0e0). Verdicts drafted, completion
  declaration and this file's deletion ONLY on the founder's written
  confirmation.

## Numbers

Next migration **090**. Next handoff § is **65**. Drive prefixes used
through 0df. Deploys are `vercel --prod --yes` from the live repo —
git push does not auto-deploy.
