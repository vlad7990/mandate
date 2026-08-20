# NEXT — The evaluator becomes a principal

Slice four of the agents-as-principals programme, per the §36-confirmed
order: the Candidate Review / Evaluation agent — the judgment that
writes what the firm believes about a candidate against a role, today
inside whoever's session happens to trigger it. Same ladder: Phase 0
decisions → model → seam → verification → verdicts → founder sign-off.
Delete this file when the completion is declared.

**Gate: no build work past Phase 0 until the founder confirms D1–D8.**

---

## Where this starts from (2026-08-20, HEAD `4f10c6d`)

- Next migration: **077.** 790 tests, tsc/lint/build green. Slices
  one–three complete (§30–§36); the §36-accepted Retry-parse button is
  BUILT (`4f10c6d`, retryParseAction + the banner button) and takes its
  live verification in this slice's Phase 3.
- **The evaluator's work, enumerated from code (the §5h rule) —
  `ensureCandidateEvaluation` (src/lib/ai/generate-evaluation.ts) and
  its two call sites:**
  1. `candidates/[candidateId]/page.tsx:236` — a cache MISS on the
     profile page schedules generation in `after()`, with a client
     built during render and threaded through (the after()-cookie
     caveat, FOURTH occurrence) — so the run wears the page
     visitor's face, and a VIEWER's visit cannot persist the
     evaluation at all (the UPDATE needs candidates:write; the code's
     own comment says "the next visit will retry persistence", which
     for a viewer is forever).
  2. `regenerateEvaluationAction` — the Regenerate button: clears the
     cached evaluation via the `update_cv_structured_field` RPC, then
     re-invokes the gate under the recruiter's session.
  - What the pipeline touches: candidates SELECT (subject +
    competitors) and UPDATE (the spread-preserving cv_structured
    write), projects SELECT (calibration + company context),
    candidate_scores SELECT (subject + slate context), skills SELECT
    (injection). **Every one already in the pool** — like the ranker,
    this slice adds NO table grants; 077 grows only the trail.

## Phase 0 — Decisions for the founder (D1–D8)

### D1 — The evaluator is a fourth principal
A fourth users row: role `agent`, org-carried, `full_name`
"Evaluation Agent", its own credential pair (`AGENT_EVALUATOR_EMAIL` /
`AGENT_EVALUATOR_PASSWORD`, §30 recipe), its own /ops kill switch —
suspend evaluation without touching parsing, ranking, or
interpretation.

### D2 — Zero new grants, stated
The 074/076 pool covers every read and the one write. Migration 077
adds `candidate_evaluated` to the vocabulary and the
`record_agent_event` allowlist, and nothing else.

### D3 — Both call sites convert; the render-built client dies
The seam signs in per run, so the page's threaded client and its
after()-cookie caveat are deleted rather than worked around — the
fourth occurrence of that caveat becomes the first one REMOVED. Two
honesty dividends ride along: any visitor's cache-miss (viewer
included) now generates AND persists lawfully, and the run stops
wearing the visitor's face.

### D4 — One event per landed evaluation
`candidate_evaluated` at 'org' visibility: detail carries
`agent_kind: 'evaluator'`, the trigger (`profile_view` /
`regenerate`), and the candidate. Cache READS never event
(readCandidateEvaluation is untouched); a failed generation is a log
line, not history (the §30 rule, third application).

### D5 — A refused evaluator never destroys an existing evaluation
The regenerate flow today clears the cache FIRST, then generates — a
refused agent after the clear would eat the old evaluation and replace
it with nothing. The conversion reorders: the agent signs in and
generates BEFORE anything is cleared; the swap happens as the agent's
single spread-preserving write (the pre-clear's stale-revive-race
purpose is re-examined in Phase 2 — if a clear must survive, it moves
after a successful sign-in). Page-visit misses degrade to the existing
pending panel; the Regenerate button surfaces the refusal sentence
through the action contract with the agent named.

### D6 — The evaluator writes one key, and the discipline is the seam's, stated
The evaluation lands under `cv_structured.evaluation` via the
spread-preserving update; the evaluator never touches identity columns
(the parser's judgment) or scores (the ranker's). RLS cannot restrict
jsonb keys — the same column-discipline limitation every users rule
has stated since 046 — and a key-level guard trigger would be ceremony
out of proportion to one seam. Pinned where it can be: the invariants
assert the evaluation write PRESERVES the parser's fields, and the
kind boundary is stated here as seam discipline the founder may
verdict into a trigger later.

### D7 — The Retry-parse button verifies in this slice's drive
Already built (`4f10c6d`); Phase 3 drives it: suspended parser → retry
refuses with the sentence → restored → retry parses from the STORED
file without re-upload.

### D8 — Out of scope, stated
The remaining ten agents (positioning, candidate research,
triangulation, psychology, sourcing, digests — each visible in the
codebase, each its own slice); `update_cv_structured_field` stays a
human intent door; evaluation freshness policy (when a stale
evaluation should auto-regenerate) waits for a real recruiter to ask.

## Phase 1 — Model (077)

- **077** — `candidate_evaluated` joins the vocabulary and the
  allowlist. Nothing else.
- **`agent_evaluator_invariants.sql`** + control run: the evaluator's
  spread-preserving write lands (evaluation key present, parser fields
  INTACT — the D6 pin) and events under its own name with the trigger
  named; the fourth principal's negative matrix; the allowlist at
  four; four-way kill-switch independence. **Control run:** simulate
  `candidate_evaluated` slipping into `record_activity_event`'s HUMAN
  allowlist — a recruiter forging the evaluator's conclusion through
  the human intent door — and the forgery negative must trip.

## Phase 2 — The seam

- `signInEvaluator()` in `src/lib/agents/session.ts` (shared core).
- `runEvaluation` seam wrapping ensureCandidateEvaluation's
  generate+persist under the agent (D5's generate-before-clear
  reorder); both call sites convert; the page's render-built client
  threading deleted.
- The live account by operator hand (§30 recipe), credentials in
  Vercel production + `.env.local`.

## Phase 3 — Verification (production, scratch data)

Scratch mandate + parsed candidate inside Mandate HQ. Drive: profile
visit on a cache miss → the evaluation lands attributed to the
Evaluation Agent with the event in the trail → Regenerate re-evaluates
→ suspend the EVALUATOR from /ops → a profile visit renders the
pending panel honestly, Regenerate refuses with the sentence AND the
existing evaluation survives (the D5 proof) → restore → Regenerate
lands. Plus the D7 act: suspend the PARSER, retry-parse refuses;
restore, the button parses from the stored file. Probe matrix with the
evaluator's real JWT. Teardown to baseline exactly (users baseline
becomes 5).

## Phase 4 — Verdict candidates

Slice five's identity (positioning / candidate research /
triangulation / psychology — the candidate-intelligence cluster — vs.
the desk digest writer); whether evaluation staleness (calibration
changed since generation) deserves a visible "evaluated against older
weights" note; the /ops Suspend/Restore relabel (fourth surfacing).

## Who else this waits on

Nothing external. The evaluator's env secret is minted at build time
by the operator; no email, no DNS, no third party.
