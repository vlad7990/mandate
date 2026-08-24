# NEXT — the copilot conversion: the Copilot Agent

Picked by the founder 2026-08-24 after §79 (the queue's last
read-shaped conversion). **Phase 0 complete 2026-08-24. D1–D8
DRAFTED below — the build is GATED on the founder's written
confirmation. Nothing past Phase 0 has been touched.**

## The surface, as found

`/api/copilot` (streaming SSE) runs the whole judgment under the
RECRUITER's cookie session: `loadCopilotProjectContext` authorizes
the caller (active status + org match) AND assembles the snapshot —
the project row with its intelligence blobs, all candidates with
assessments, the score leaderboard, the eight-deep feedback tail
WITH its text, the shortlist state — then the model streams the
answer. Skills are ALREADY injected (this is why the copilot never
appeared on §73's uninjected list) but they ride the recruiter's
cookie session. Nothing is persisted — conversation history is
client-side localStorage BY DESIGN — so there is no principal, no
trail event, and no kill switch on the product's most-available AI
surface. The panel renders SSE `{error}` frames as a "⚠ …"
assistant bubble — a ready-made refusal surface.

**DEFECT FOUND (the §57 silently-dead class, third sighting):** the
shortlist context read selects a `label` column that DOES NOT EXIST
on shortlists — PostgREST has errored on it since the day it
shipped, the code swallows the error as `shortlist: null`, and the
copilot has NEVER seen a shortlist. Every answer to "Is the
shortlist balanced?" was grounded in nothing. The fix rides this
conversion (D8).

Live policies (read from pg_policies): EVERY read the snapshot
makes is already in the agent pool — projects S (074), candidates S,
candidate_scores S, feedback S (074's interpreter grant, the human
testimony precedent from culture), skills S (074), and shortlists S
(**093 — the shortlist slice's SELECT completes the coverage**).
**ZERO NEW GRANTS** — the fifth zero-new-grant conversion.

## D1–D8 — drafted, for the founder to confirm

- **D1 — The EIGHTEENTH principal: the Copilot Agent** (AGENTS.md
  #13). Own credential `AGENT_COPILOT_*` (Vercel production +
  `.env.local`, §30/§6 recipe), own /ops kill switch — EIGHTEEN
  independent switches, and the always-on surface finally has one.
- **D2 — The split: the human door stays at the threshold.** The
  route keeps the caller's cookie-session gate — active member, org
  match, the project readable under THEIR OWN RLS (a viewer who can
  see the project may ask about it; an outsider still gets 403
  before any agent exists). Then the agent signs in per request,
  assembles the snapshot under ITS OWN session (zero new grants),
  streams the judgment, records its event, and signs out when the
  stream closes — persisting nothing, which on this surface is the
  design, not a restriction.
- **D3 — ZERO new grants. Migration 094 is vocabulary only**:
  `copilot_answered` into the CHECK (rebuilt from the live
  pg_constraint list, 58 values today → 59) and the
  record_agent_event allowlist at TWENTY.
- **D4 — The event: one per ANSWERED turn, counts only.**
  `copilot_answered` recorded AFTER the stream completes — a failed
  or aborted stream records nothing, because no judgment landed.
  Detail: agent_kind `copilot`, the page context string
  (project/ranking/candidate/feedback/shortlist/sourcing/metrics/
  default), messages count, snapshot candidate count, focused
  boolean — NEVER the question, NEVER the answer.
  **`agent_copilot_invariants.sql`** — 5 invariants + a NEW control
  shape: the invariants pin the agent's READ COVERAGE (seeded
  feedback tail visible by count, shortlist row visible — the very
  reads whose silent death this surface just exemplified), the
  attribution pins, history at TWENTY by count, the negative matrix
  (clients/organizations/activity_events zero, users self-only,
  agent INSERT/UPDATE on shortlists-beyond-the-pin refused), kill
  switches independent at EIGHTEEN. The control run REGRESSES A
  POOL GRANT ANOTHER SLICE MINTED — `feedback_agent_select` (074)
  rebuilt away in the harness transaction — and must abort on the
  feedback count reading ZERO: the harness guards INHERITED
  coverage, not just its own migration, because a future RLS
  cleanup that drops a pool policy is exactly how this surface's
  context dies silently.
- **D5 — Refusal is the sentence in the stream.** A suspended or
  credential-less Copilot Agent refuses AFTER the human door has
  already answered and BEFORE any model spend; the route sends the
  D5 sentence as the SSE error frame and the panel's existing "⚠"
  bubble renders it verbatim. Nothing is destroyed — this surface
  never persists anything to destroy.
- **D6 — Skills move onto the agent's session** — the same
  injection the route already does, now with the agent's client
  (074's skills_agent_select; the §50/092 doctrine).
- **D7 — Removability.** The route keeps its shape; restoring the
  cookie-session assembly is a one-file revert; the kill switch is
  independent of all seventeen others.
- **D8 — Scoped in, and deferred, recorded.** IN: the dead `label`
  read is repaired to the real columns (candidate_ids, slate_size,
  submitted_at, created_at) — the copilot sees a shortlist for the
  first time. DEFERRED: §73's five uninjected seams (three
  executive generators, candidate search, sourcing search),
  founder-timed; conversation history stays client-side by design
  (no conversations table is minted); and the per-turn event volume
  is flagged honestly — if the founder later finds the trail too
  chatty, a thinning is its own slice; counts stay honest today.

## The phases

- **Phase 0** — this document. ✓ 2026-08-24, read-only (live
  pg_policies read; pool coverage verified complete including 093's
  shortlists SELECT; the dead-column defect found and scoped).
- **Phase 1** — migration 094 (MCP + numbered file): vocabulary
  only; invariants harness with the pool-grant control run; the
  account (§30 recipe, flip as its own statement — THREE member
  events, the §78 count); env pair.
- **Phase 2** — the seam: `signInCopilotAgent`; the route split
  (human gate kept at the threshold, snapshot assembly moved onto
  the agent's session, the label fix, the event after stream
  completion, signOut in the stream's finally); the D5 sentence
  through the SSE error frame.
- **Phase 3** — tests + green gate (tsc / vitest 820 baseline /
  eslint / build); deploy.
- **Phase 4** — drive 0e8 live: a seeded mandate, the panel opened,
  a question answered with the event landing (context/counts
  checked, no text in trail); a shortlist question proving the
  repaired read; suspend → the D5 sentence VERBATIM in the panel
  bubble, no model spend; restore → answered again; a steering
  probe through the panel ("STEERED-0E8:" opening the answer);
  probe matrix (the agent's identity against production rows,
  rolled back); teardown on scratch keys / value-keyed events (the
  agent account and its 3-event creation trail are DURABLE — users
  19, baseline events 55). §80 verdicts drafted; completion
  declaration and this file's deletion ONLY on the founder's
  written confirmation.

## Numbers

Next migration **094**. Durable baseline after Phase 1: **19 users,
55 events, 18 agents**. Next drive prefix **0e8**. Next handoff §
is **80**.
