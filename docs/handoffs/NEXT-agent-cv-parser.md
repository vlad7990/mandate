# NEXT — The CV parser becomes a principal

Slice three of the agents-as-principals programme, per the §34-confirmed
order: the CV Parsing Agent — the judgment that reads a person's CV,
writes their structured profile AND their identity columns (name,
email, title), and today does it all inside the uploading recruiter's
session. Same ladder: Phase 0 decisions → model → seam → verification →
verdicts → founder sign-off. Delete this file when the completion is
declared.

**Gate: no build work past Phase 0 until the founder confirms D1–D9.**

**STATUS 2026-08-20: D1–D9 CONFIRMED by the founder as drafted.** The
gate is open; execution starts at Phase 1 (migration 076).

---

## Where this starts from (2026-08-20, HEAD `6f0a06e`)

- Next migration: **076.** 790 tests, tsc/lint/build green. Slices one
  and two complete (§30–§34): the role, the grant pool (projects R/W,
  feedback R/W, candidates R, candidate_scores R/W,
  calibration_history INSERT, skills R), the session seam, the trail
  door, per-agent kill switches — all proven machinery.
- **The parser's work, enumerated from code (the §5h rule) — two call
  sites of `parseCv` (src/lib/ai/parse-cv.ts):**
  1. `projects/[id]/candidates/actions.ts` — `uploadAndParseCv`: the
     recruiter picks a file; the action inserts the placeholder
     candidate row (cv_processing=true), uploads the bytes to
     `{org}/{project}/{candidate}/cv.{ext}`, calls `parseCv`
     (Anthropic + Skills Studio injection), then UPDATEs the candidate
     with cv_url, the typed identity columns, cv_structured, and
     clears cv_processing — or writes cv_parse_error on failure.
  2. `candidates/network/actions.ts` — `replicateCvAndReparse` inside
     the network-copy `after()`: downloads the source CV, uploads the
     copy to the new path, calls `parseCv` against the target
     project's calibration, UPDATEs the new candidate row. Runs on
     whatever the recruiter's cookies resolve to in that context — the
     ranker slice's D6 family, third occurrence.
- **A §33 guess corrected by the code:** the verdict anticipated "a
  storage read under the org folder". The code says otherwise — BOTH
  call sites hold the file bytes in memory at parse time (the upload
  action from the form, the replicate from its own download). The
  parse seam takes bytes as an argument; the agent needs NO storage
  policy, and the additive surface shrinks to exactly one grant.

## Phase 0 — Decisions for the founder (D1–D9)

### D1 — The parser is a third principal
A third users row: role `agent`, org-carried, `full_name` "CV Parsing
Agent", its own credential pair (`AGENT_CVPARSER_EMAIL` /
`AGENT_CVPARSER_PASSWORD`, §30 recipe) and its own /ops kill switch —
suspend parsing without touching interpretation or ranking, the
independence slice two proved live.

### D2 — The seam splits at judgment: the file is the human's, the reading is the agent's
The recruiter's acts stay the recruiter's: choosing the file, the
placeholder candidate INSERT, the storage upload (and, on the network
path, the storage copy) — all already lawful under candidates:write,
all already attributed correctly. What converts is the JUDGMENT: the
model call and the persistence of what it concluded — cv_structured,
fit_dimensions, and the identity columns the parser overwrites
(full_name, email, linkedin_url, current_title, current_company,
archetype). Those writes run under the parser's session, because the
day a profile says something wrong about a person, the trail must say
an agent concluded it, not that a recruiter typed it.

### D3 — One additive grant: candidates UPDATE — and the pool widens for all agents, stated
Migration 076 adds `candidates_agent_update` (org-scoped, is_agent(),
the 074 policy shape). Per slice one's confirmed D1, authority is
role-wide: the interpreter and ranker also gain candidates UPDATE the
same moment. Stated plainly rather than hidden — this is the first
slice that widens the pool, the widening is one write surface on a
table every agent already reads, and per-kind tiers remain the
decision that reopens only when an agent needs a grant the others
MUST NOT hold. No storage policy is added (the D2 bytes argument);
`record_agent_event`'s allowlist grows `candidate_parsed`.

### D4 — Attribution: one event per parse, identity writes included
`candidate_parsed` at 'org' visibility, one per landed parse: detail
carries `agent_kind: 'cv_parser'`, the trigger (`upload` /
`network_copy`), the candidate, and whether identity columns changed.
The failure path is honest the other way: a FAILED parse writes
cv_parse_error and no event — a log line, not history (§30's rule).

### D5 — Fail-soft: the file always lands; the profile says why it is empty
A refused parser (suspended, credential-less) never eats the upload:
the candidate row and the stored file stand, cv_processing clears, and
cv_parse_error carries the agent-named sentence ("The CV Parsing Agent
could not run — an operator has suspended it or its credentials are
absent. The file is stored; retry when the agent is restored."). The
candidate page's existing parse-failure affordance shows it. No
service-role fallback, ever.

### D6 — The parser parses; the ranker ranks
The parse ends at the profile. Scoring stays where slice two put it:
the network path's follow-up re-score is already the ranker's act with
its own event; the upload path scores, as today, on the first
ranking-page visit. One kind, one judgment, one trail name — no agent
does another agent's job inside its own session.

### D7 — The anonymous door stays shut
Candidate-portal CV submissions remain review-first (§29/§31 confirmed
twice): the parser converts RECRUITER-TRIGGERED parses only, and
nothing about this slice lets an anonymous token holder trigger a paid
parse. The pre-launch rate-limiting item is unchanged.

### D8 — Parse, never delete — pinned mechanically
The parser writes profiles; it deletes nothing and touches storage
never. The invariants pin both negatives by effect: an agent session's
candidates DELETE lands on zero rows, and its storage.objects reach is
zero, seeded rows present. The control run simulates the enumeration
regression on the WRITE side — `agent` slipped into
`can_write_candidates()` — and the delete negative must trip (that
predicate gates candidates_role_delete, which is exactly the reach an
agent must never inherit by accident).

### D9 — Out of scope, stated
The remaining eleven agents (candidate review / evaluation is the
natural slice four, but its order is a Phase 4 verdict); fixing the
network-copy storage steps' after()-cookie dependence (the COPY is the
human's act — converting it is not this slice's job; recorded as a
known caveat, third occurrence); parse retries beyond the existing
affordance; model/version stamping in the event detail (a Phase 4
verdict candidate); any portal-triggered parsing.

## Phase 1 — Model (076)

- **076** — `candidates_agent_update` policy; `candidate_parsed` in
  the activity vocabulary and the `record_agent_event` allowlist.
- **`agent_cv_parser_invariants.sql`** + control run: the parser's
  UPDATE lands (profile + identity columns, verified privileged) and
  events under its own name with the trigger named; the third
  principal's negative matrix (the 074/075 re-run); candidates DELETE
  lands on zero rows and storage reach is zero (D8, seeded); the
  allowlist still refuses non-agents and unknown types; kill-switch
  independence re-pinned for three agents. Control run: `agent`
  slipped into `can_write_candidates()` — the delete negative must
  trip.

## Phase 2 — The seam

- `signInCvParser()` in `src/lib/agents/session.ts` (shared core).
- `runCvParse` seam (bytes + context in, profile persisted under the
  parser's session, event recorded, signOut; D5 fail-soft returning
  the reason for cv_parse_error). Both call sites convert; the
  placeholder insert, storage upload, and storage copy stay in the
  human's session per D2.
- The live account by operator hand (§30 recipe), credentials in
  Vercel production + `.env.local`.

## Phase 3 — Verification (production, scratch data)

Scratch mandate inside Mandate HQ. Drive: upload a real PDF through
the browser (Playwright file roots point at the iCloud clone — copy
the fixture into its .playwright-mcp/ first, the standing trap) → the
parse lands attributed to the CV Parsing Agent with the event in the
trail and the identity columns filled by the model → suspend the
parser from /ops → a second upload lands its file and its honest
cv_parse_error sentence, no profile, no event — and a ranker refresh
still works (three-way kill-switch independence) → restore → retry
parses. Probe matrix with the parser's real JWT (the third re-run,
now including the candidates UPDATE positive and DELETE negative).
Teardown to baseline exactly (users baseline becomes 4).

## Phase 4 — Verdict candidates

Slice four's identity (candidate review / evaluation agent vs. the
digest writer); whether `candidate_parsed` detail should stamp model
id and prompt version for audit depth; whether the parse-failure
affordance should offer one-click retry once the failure can name a
suspended agent; the /ops Suspend/Restore relabel (standing).

## Who else this waits on

Nothing external. The parser's env secret is minted at build time by
the operator; no email, no DNS, no third party.
