# NEXT — the shortlist conversion: the Shortlist Agent

Picked by the founder 2026-08-24 after §77 (§58's standing queue,
read-shaped). **Phase 0 complete 2026-08-24. D1–D8 DRAFTED below —
the build is GATED on the founder's written confirmation. Nothing
past Phase 0 has been touched.**

## The surface, as found

`generateReportAction` (shortlist/actions.ts) runs the whole
judgment under the RECRUITER's cookie session behind the
`clients:share` gate: it assembles the model input (the shortlist
row's slate + narrative, the project's calibration/company context,
the slate candidates' profiles, their candidate_scores ranks), calls
`generateShortlistReport` SYNCHRONOUSLY (~5–10s, the button shows a
pending state — no fire-and-forget, no placeholder row, no
`is_generating` latch on this surface), and merges `report_content`
onto the shortlists row. No principal, no trail event, and NO SKILLS
— this is the second of §73's six uninjected seams. The slate
composition (add/remove/move/slate-size), the narrative, and Submit
are already the recruiter's separate editorial acts; the builder
auto-saves a dirty narrative before Generate, so the human's input
is persisted before the model is asked to think. Regenerate is
offered even after submission today (the button gates only on
empty-slate/pending). `report_content` renders on the shortlist page
only — the HM portal never reads it.

Live shortlists policies (read from pg_policies, not migration
files): role-scoped only — writes under `can_share_clients()`, reads
under `can_read_org()`. **NO agent policies exist on shortlists**;
the agent genuinely cannot read or write the table today. The rest
of the judgment's reads are ALREADY in the pool:
`candidates_agent_select` and `candidate_scores_agent_select` are
live org-wide, projects S+U and skills S are 074's. The trail
vocabulary today: CHECK at 57 values (`shortlist_published` present
— the human's submit event, untouched; `shortlist_report_generated`
absent), record_agent_event allowlist at EIGHTEEN.

## D1–D8 — drafted, for the founder to confirm

- **D1 — The SEVENTEENTH principal: the Shortlist Agent** (AGENTS.md
  #11). Own credential `AGENT_SHORTLIST_*` (Vercel production +
  `.env.local`, §30/§6 recipe by operator hand), own /ops kill
  switch riding free — SEVENTEEN independent switches after.
- **D2 — The split: composition stays human, the judgment moves.**
  The recruiter keeps everything editorial: `ensureShortlist`'s
  allocation (created_by = the human), the slate acts, the
  narrative, Submit, and the `clients:share` gate in the action (the
  §57 weekly-report precedent — the capability check stays the
  human's door). The agent signs in per run inside the action, reads
  the shortlist row, project, candidates, and scores IT lawfully
  sees (the companyintel shape — the split is only for unlawful
  reads, and D3 makes this read lawful), judges with skills riding
  ITS session, merge-writes ONLY `report_content` + `updated_at`
  through the pinned door, records the event, and signs out
  persisting nothing.
- **D3 — TWO new policies, one door pinned. Migration 093**:
  - `shortlists_agent_select` — SELECT for `is_agent()` + org: the
    slate row IS the model input, and per the 082 doctrine an
    UPDATE without SELECT is INERT.
  - `shortlists_agent_update` — UPDATE for `is_agent()` + org with
    **`submitted_at IS NULL` pinned in BOTH USING and WITH CHECK**
    (the 092 is_final precedent, on the submission state): the
    agent can neither touch a SUBMITTED slate nor submit one —
    submission stays the recruiter's editorial act forever. NO
    INSERT (the row's allocation is the human's act), NO DELETE.
  - **Behavioral consequence, drafted as design**: Regenerate on a
    submitted shortlist — possible today under the recruiter's
    session — will REFUSE under the pin with the honest sentence.
    The submitted report is the record (the version-ledger
    doctrine's sibling: what was sent never silently changes).
    Confirm or strike.
- **D4 — Vocabulary: `shortlist_report_generated`**, CHECK rebuilt
  from the live pg_constraint list (57 values today → 58), allowlist
  EIGHTEEN → NINETEEN. Detail: agent_kind `shortlist`, trigger
  `initial` | `regenerate` (report_content empty vs not — the seam
  knows), the slate count, a scenarios count — never candidate names
  or the report's text. **`agent_shortlist_invariants.sql`** — 5
  invariants + control run: the judgment lands with the human's
  composition surviving (candidate_ids, narrative, slate_size,
  created_by unchanged by the agent's merge); attribution pins
  (event under the agent's name and label); history intact at
  NINETEEN by COUNT; THE SUBMITTED PIN both directions (the agent's
  UPDATE on a submitted row lands NOWHERE; an UPDATE setting
  submitted_at refused) plus agent INSERT refused and the negative
  matrix; kill switches independent at SEVENTEEN. The control run
  drops the WITH CHECK conjunct ("USING already refuses submitted
  rows" — 092's exact drift) and must abort on an agent-SUBMITTED
  slate, self-rolling-back.
- **D5 — Refusal is the foreground sentence, nothing destroyed.**
  The surface is synchronous — a refused (suspended) or failed run
  surfaces `agentErrorMessage` with SUBJECT "The shortlist" through
  `runAction`'s ActionResult, and the existing toast renders it
  verbatim. The prior `report_content` stands untouched, the slate
  and narrative are already saved, and the recruiter can still copy
  or submit what exists. NO row-marking bookkeeping — shortlists has
  no `generation_error`/`is_generating` columns and needs none; the
  090 doctrine (failure bookkeeping is human) is satisfied by the
  returned sentence itself.
- **D6 — Skills reach the seam** — `applySkillsToPrompt` on
  `SHORTLIST_REPORT_SYSTEM_PROMPT` riding the agent's session
  (projectId + org + agent client, the 092 shape). Closes the
  SECOND of §73's six uninjected seams; the list shrinks to FIVE
  (three executive generators, candidate search, sourcing search).
- **D7 — Removability.** `generateShortlistReport` keeps its
  exported shape; deleting the principal and restoring the cookie
  call is a one-file revert plus the action's call site; the kill
  switch is independent of all sixteen others.
- **D8 — Deferred, recorded.** The copilot conversion (read-shaped)
  stays queued behind this slice. §73's remaining five seams queue
  by usage, founder-timed. Submit, slate composition, narrative, and
  the HM-portal surface stay human/unchanged forever — editorial
  acts and human doors, not judgments. The synchronous ~5–10s run
  is inside the proven long-action range; nothing new to defer.

## The phases

- **Phase 0** — this document. ✓ 2026-08-24, read-only (live
  pg_policies read; no standing gap found — no agent policy touches
  shortlists today; candidates/candidate_scores agent SELECTs
  confirmed live).
- **Phase 1** — migration 093 (MCP + numbered file): the two
  policies with the double pin + vocabulary; invariants harness with
  the WITH CHECK control run; the account (§30 recipe, flip as its
  own statement, teardown residue keyed by VALUE); env pair.
- **Phase 2** — the seam: `signInShortlistAgent`;
  `generateShortlistReport` gains the agent-session persist path
  (read → judge with the skills line → pinned merge → trail event),
  the action keeping `clients:share`, `ensureShortlist`, the
  empty-slate refusal, and threading the trigger.
- **Phase 3** — tests + green gate (tsc / vitest 820 baseline /
  eslint / build); deploy.
- **Phase 4** — drive 0e7 live: a ranked scratch slate → Generate →
  the report lands with the event under the agent (trigger
  `initial`, counts only); Regenerate → `regenerate`; suspend → the
  D5 sentence VERBATIM in the foreground toast, prior report
  standing; restore → rerun lands; a steering probe ("STEERED-0E7:"
  in the executive summary) through the agent's session; the
  recruiter SUBMITS through the real dialog → the LIVE PIN PROBE on
  production rows (the agent's UPDATE on the submitted slate lands
  NOWHERE; its attempt to stamp submitted_at on a fresh draft
  refused) — both faces; probe matrix (agent INSERT on shortlists
  refused; text-probe of the trail finds neither names nor report
  text); teardown on scratch keys (the agent account and its
  creation trail are DURABLE — users 18, baseline events 52). §78
  verdicts drafted; completion declaration and this file's deletion
  ONLY on the founder's written confirmation.

## Numbers

Next migration **093**. Durable baseline after Phase 1: **18 users,
52 events, 17 agents** (the §74→§76 delta, +1 user +3 events).
Next drive prefix **0e7**. Next handoff § is **78**.
