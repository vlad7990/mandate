# NEXT — The ranker becomes a principal

Slice two of the agents-as-principals programme, per the §31-confirmed
conversion order: the Ranking Agent — the highest-volume writer wearing
a human face. Every scoring run today executes inside the triggering
recruiter's session: right reach, wrong attribution, and one of the
runs may not execute at all (see the finding under D6). Same phased
ladder as slice one: Phase 0 decisions → model → seam → verification →
verdicts → founder sign-off. Delete this file when the completion is
declared.

**Gate: no build work past Phase 0 until the founder confirms D1–D8.**

---

## Where this starts from (2026-08-20, HEAD `42e8f25`)

- Next migration: **075.** 790 tests, tsc/lint/build green. The
  interpreter slice complete (§30–§31): role `agent` exists, the 074
  grant pool names projects R/W, feedback R/W, candidates R,
  candidate_scores R/W, calibration_history INSERT, skills R; the
  session seam, D5 fail-soft, `record_agent_event`, and /ops agent
  labels are proven machinery.
- **The ranker's work, enumerated from code (the §5h rule) — five call
  sites of `computeAndStoreScores`:**
  1. `ranking/page.tsx:120` — initial auto-score on the first ranking
     page visit (synchronous, in the viewer's session, read-repair).
  2. `ranking/actions.ts:26` — the "Refresh scores" CTA (synchronous,
     the recruiter's deliberate act).
  3. `candidates/network/actions.ts:198` — re-score inside the
     network-copy `after()` callback (background, post re-parse).
  4. `calibration-history/actions.ts:78` — re-score after a calibration
     restore (synchronous, the recruiter's act).
  5. `recalibrate.ts:117` — already converted: runs under the
     INTERPRETER's session since slice one, as part of its act.
- Scoring itself is deterministic math (weightedOverall over parsed
  fit_dimensions) — no model call. The conversion is about
  ATTRIBUTION and about background runs holding a lawful session, not
  about AI judgment; AGENTS.md's Ranking Agent is this engine.

## Phase 0 — Decisions for the founder (D1–D8)

### D1 — The ranker is a second principal, not a second role
A second users row: role `agent`, org-carried, `full_name` "Ranking
Agent", its own credential pair (`AGENT_RANKER_EMAIL` /
`AGENT_RANKER_PASSWORD`, §30 recipe) and therefore its OWN kill switch
on /ops — the operator can suspend ranking without killing feedback
interpretation. Attribution carries `agent_kind: 'ranker'` on every
event. Rejected: reusing the interpreter's account — one kill switch
for two unrelated judgments, and account-level attribution collapses.

### D2 — Authority is the role's, and the slice adds no table grants
Per slice one's confirmed D1, authority is identical across kinds: the
ranker holds the 074 grant pool as-is, and everything scoring touches
(projects SELECT, candidates SELECT, candidate_scores
SELECT/INSERT/UPDATE) is already named there. Stated plainly rather
than hidden: the ranker COULD write `feedback.interpreted` — the pool
is role-wide by design, per-kind authority tiers stay out of scope
(slice one's D9), and the day an agent needs a grant the others must
not hold is the day that decision reopens. What grows in 075 is only
the trail: a `candidates_ranked` event type and its admission to
`record_agent_event`'s allowlist.

### D3 — Every scoring WRITE converts; the human act stays human
All four remaining call sites run under the ranker's session — the
scoring run is the agent's act whoever triggered it, which is the
founder's 2026-08-12 statement applied. The human's own act (the page
visit, the CTA click, the copy, the restore) stays in the human's
session and is named as the trigger in the event detail. Cost
accepted: one password-grant round trip per scoring run on the three
synchronous paths — ranking is not a hot path, and a session per run
is the price of a trail that tells the truth. Rejected: converting
only the background site — it would leave three of four writers
wearing faces and make the conversion order's point a technicality.

### D4 — Attribution: one event per run, and the interpreter keeps its own
`candidates_ranked` at 'org' visibility, one per scoring run: detail
carries `agent_kind: 'ranker'`, the trigger vocabulary already stored
in `rank_change_reason` (scoring_run / weights_edit / new_candidate /
feedback / recalibration), the project, and the moved-row count.
Boundary stated: recalibration-triggered re-scoring (call site 5)
STAYS under the interpreter's session and writes NO ranker event — it
is part of the interpreter's act, already named in its
`feedback_interpreted` detail; two events for one act would be noise
wearing rigor's clothes.

### D5 — Fail-soft, page-shaped
No service-role fallback, ever (slice one's rule). A suspended or
credential-less ranker: the human act always lands (the copy, the
restore, the page render); the scoring run is SKIPPED with the reason
logged. Two surfaces speak: the "Refresh scores" CTA — the one place a
human explicitly asks for a run — surfaces the refusal through the §11
action-error contract with the agent named; the ranking page renders
the scores it has (rank_changed_at already dates them) and logs the
skipped repair. Nothing invents staleness banners beyond what the
data already shows.

### D6 — The `after()` finding: verify, then fix through the seam
Call site 3 runs inside `after()` and passes NO client, so
`computeAndStoreScores` builds an SSR client where `cookies()` may be
unavailable — the exact shape of the skills defect §30 closed. Phase 2
verifies whether the network-copy re-score has EVER worked in
production; either way it takes the ranker's session and works
lawfully afterward. If it was broken, that is the programme's second
latent defect closed and gets said honestly in the handoff.

### D7 — The ranker's face is /ops, automatically
The Agents table (§30) lists it with suspend/restore the moment the
row exists; labels stay honest ("Ranking Agent"). Nothing else in the
product shows it; it navigates nowhere (the empty grant + D7 of slice
one carry over unchanged).

### D8 — Out of scope, stated
The CV parser (slice three, per the confirmed order); per-kind
authority tiers; per-agent budgets (confirmed deferred, §31);
automated provisioning (waits for the second customer org, §31);
backfilling trail events for historical scoring runs (history is not
rewritten); the `hm_portal_opened`-style token-context events.

## Phase 1 — Model (075)

- **075** — `candidates_ranked` joins the activity_events vocabulary
  and `record_agent_event`'s allowlist. Nothing else: no new role, no
  new policy, no guard change — slice one built the shape.
- **`agent_ranker_invariants.sql`** + control run: the ranker principal
  scores and events under its own name; the negatives re-pinned for a
  SECOND agent (two agents, two orgs of reach — still one org each);
  a suspended ranker skips while the interpreter still works (the
  independent-kill-switch invariant, the reason D1 chose two
  accounts); `record_agent_event` refuses `candidates_ranked` from a
  non-agent and refuses a third, unknown event type. Control run:
  simulate the allowlist regression — `candidates_ranked` accepted for
  the RECRUITER — and the forgery negative must trip.

## Phase 2 — The seam

- `signInRankingAgent()` beside `signInFeedbackInterpreter()` in
  `src/lib/agents/session.ts` (shared `signInAgent` core exists).
- The four call sites take the ranker session; the D5 fail-soft wraps
  each; the D6 verification lands its answer in the handoff.
- The live ranker account by operator hand (§30 recipe), credential
  pair in Vercel production + `.env.local`.

## Phase 3 — Verification (production, scratch data)

Scratch mandate + candidates INSIDE Mandate HQ (the org-bound lesson
of §30). Drive: ranking page first visit scores under the ranker with
the event landed → Refresh CTA re-scores → suspend the RANKER from
/ops → Refresh refuses with the sentence, the copy/restore acts still
land, and an HM submission still interprets (the interpreter
unaffected — the D1 proof) → restore → re-score works. Probe matrix
with the ranker's real JWT (the 074 matrix re-run for the second
principal). Teardown to the then-current baseline exactly (users
baseline becomes 3).

## Phase 4 — Verdict candidates

The CV parser's opening (its Phase 0 needs the candidates UPDATE and
storage-read enumeration — the first slice to ADD grants); whether the
ranking page should show "scores as of <time>" once runs are
agent-gated; whether `agent_kind` belongs in /ops labels (two agents
now share a table row shape).

## Who else this waits on

Nothing external. The ranker's env secret is minted at build time by
the operator; no email, no DNS, no third party.
