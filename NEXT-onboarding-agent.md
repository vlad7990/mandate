# NEXT — the onboarding surface conversion: the Calibration Agent

Picked by the founder 2026-08-24 after §72. **Phase 0 complete
2026-08-24 (its audit also produced the §73 correction). D1–D8
DRAFTED below — the build is GATED on the founder's written
confirmation. Nothing past Phase 0 has been touched.**

## The surface, as found

`submitOnboarding` (mandates:write, runAction contract, bounds
validated) calls `deriveAndStoreCalibration` FOREGROUND under the
recruiter's cookie session: one model call (~10–20s) that derives
`dimension_weights` + `weights_rationale` from the onboarding
answers, merge-writes them into `calibration_model`, stores
`onboarding_responses` in the SAME update, and records a
calibration_history snapshot with `changed_by` = the recruiter. No
principal, no trail event, no kill switch, NO SKILLS INJECTION (the
§73 correction's first entry). The judgment that sets the scoring
model every candidate in the search is measured by runs on ambient
human identity — the exact shape the fourteen conversions removed
elsewhere.

## D1–D8 — drafted, for the founder to confirm

- **D1 — The principal is the CALIBRATION AGENT** (AGENTS.md #5:
  "Trigger: onboarding data; Output: scoring model with dimension
  weights" — this seam verbatim). The FIFTEENTH principal:
  `vbreygin+calibration@gmail.com`, §30/§6 recipe by operator hand,
  `AGENT_CALIBRATION_*` in Vercel production and `.env.local`, its
  own /ops kill switch riding free. Recalibration STAYS the
  interpreter's act (§30) — two principals lawfully write the same
  blob at different moments, each signing its own judgment.
- **D2 — The split: answers are the human's, weights are the
  agent's.** The action stores `onboarding_responses` under the
  RECRUITER's session FIRST (their answers are their act, persisted
  before the agent is asked to think — D5 fail-soft, the §55
  inverted-split precedent). The agent then reads the row it
  lawfully sees, judges, and merge-writes ONLY `dimension_weights` +
  `weights_rationale`; the calibration_history snapshot's
  `changed_by` becomes the AGENT (the §30 interpreter precedent for
  derived weights).
- **D3 — Zero new grants.** 074's role-wide pool already covers
  everything: projects SELECT+UPDATE (read the context, land the
  merge), calibration_history INSERT, skills SELECT. The negative
  matrix is inherited whole.
- **D4 — Migration 091, vocabulary only.** `calibration_derived`
  into the events CHECK (live pg_constraint list) and the
  `record_agent_event` allowlist (seventeen). Detail: trigger
  `initial` | `rerun` (weights already present → rerun), plus COUNTS
  only (must-haves, anti-patterns, stakeholders, priority signals) —
  the answers' text never rides the trail.
  **`agent_calibration_invariants.sql`**: the judgment lands with
  the human's `onboarding_responses` and every sibling calibration
  key surviving; the snapshot's `changed_by` is the agent; history
  intact at seventeen by COUNT; the negative matrix unchanged; kill
  switches independent at fifteen; a control run regressing one
  conjunct, drift + harness in ONE transaction, abort
  self-rolling-back.
- **D5 — Refusal is foreground and honest.** The submit is a click
  with a reader: a suspended agent throws its authored sentence into
  the existing toast — "The Calibration Agent could not run — an
  operator has suspended it or its credentials are absent. Your
  answers are saved; re-run calibration when it is restored." The
  responses SURVIVE (stored before the judgment), the wizard's
  existing "Re-run calibration" path is the retry, and nothing is
  destroyed on any path.
- **D6 — Skills injection joins the seam** (`applySkillsToPrompt` on
  `CALIBRATION_SYSTEM_PROMPT`, the agent's session as client),
  closing the first of §73's seven. The remaining six stay recorded
  and founder-timed.
- **D7 — Removability.** The seam takes the house
  `run…AndPersist` shape with a typed result; deleting the principal
  and restoring the cookie call is a one-file revert; the kill
  switch is independent of all fourteen others.
- **D8 — Deferred sockets, recorded.** The role-spec surface
  conversion is the nearest sibling (same file family, near-
  mechanical after this); §73's remaining six uninjected seams; the
  wizard's foreground wait stands under f54f1e7 (~10–20s, shorter
  than the proven 24–95s range).

## The phases

- **Phase 0** — this document (+ the §73 correction). ✓ 2026-08-24.
- **Phase 1** — migration 091 (MCP project `xipyqnltkbtywxqyxupf`
  AND the numbered file) + invariants harness with control run; the
  account by §30 recipe (flip as its OWN statement — §65's trap);
  env pair in Vercel prod (server-only, sensitive default fine) and
  `.env.local`.
- **Phase 2** — the seam: `runCalibrationDerivationAndPersist` under
  `signInCalibrationAgent`; the action's split (responses first,
  judgment second); the D5 sentence; skills line; trail event.
- **Phase 3** — tests + green gate (tsc / vitest 820 baseline /
  eslint / build); deploy.
- **Phase 4** — drive 0e5 live: submit real onboarding → weights
  land under the agent (snapshot changed_by = agent, event trigger
  `initial`, counts in detail); re-run → `rerun`; suspend → the
  refusal sentence in the toast with the answers SAVED and the row's
  weights untouched; a steering-probe skill proving injection; light
  probe matrix (pool reads answer, negatives zero, sign-out
  revokes); teardown on scratch keys (the agent account and its 3
  member events are DURABLE — users 16, baseline events 46). §74
  verdicts drafted; completion declaration and this file's deletion
  ONLY on the founder's written confirmation.

## Numbers

Next migration **091**. Durable baseline after Phase 1: **16 users,
46 events** (the fifteenth creation trail). Next drive prefix
**0e5**. Next handoff § is **74** (73 is the correction).
