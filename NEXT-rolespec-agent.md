# NEXT — the role-spec surface conversion: the Role Spec Agent

Picked by the founder 2026-08-24 after §75. **Phase 0 complete
2026-08-24. D1–D8 DRAFTED below — the build is GATED on the founder's
written confirmation. Nothing past Phase 0 has been touched.**

## The surface, as found

`requestRegenerate` (the recruiter's act: the versioned placeholder
via `allocate_and_insert_job_spec`, the `is_generating` latch, the
idempotence backstop) fires `generateAndStoreJobSpec` inside
`after()` under the RECRUITER's cookie session: the model call, the
spec landing on the placeholder row, and the failure bookkeeping
(`markGenerationFailed`, plus the poller's `markGenerationTimedOut`)
all wear the recruiter's name. Skills are already injected — riding
the cookie session. No principal, no trail event, no kill switch.
The parser split ALREADY EXISTS on this surface — the human act
lands first by construction; only the judgment's identity is wrong.

Live job_specs policies (read from pg_policy, not migration files):
role-scoped writes (`can_write_mandates()`), human reads
(`can_read_org()`), and 085's `job_specs_agent_select`. 004's old
org-wide FOR ALL was replaced by the §5i sweep — no standing gap;
the agent genuinely cannot write job_specs today.

## D1–D8 — drafted, for the founder to confirm

- **D1 — The SIXTEENTH principal: the Role Spec Agent** (AGENTS.md
  #4). Own credential `AGENT_ROLESPEC_*` (Vercel production +
  `.env.local`, §30/§6 recipe by operator hand), own /ops kill
  switch riding free. After this, AGENTS.md's own list is fully
  principaled through #5.
- **D2 — The split stands as built; only the judgment moves.** The
  recruiter's action keeps the placeholder INSERT (version
  allocation is the human's act, and `allocate_and_insert_job_spec`
  stays theirs); the agent signs in inside `after()`, reads the
  project and the placeholder it lawfully sees, judges with skills
  riding ITS session (§50 doctrine — today they ride the cookie),
  and lands content + `is_generating: false` + `generation_error:
  null` on the row. FAILURE BOOKKEEPING STAYS HUMAN (the 090 D2
  doctrine): `markGenerationFailed` and the timeout marker keep the
  cookie session — a refused agent (suspended) is marked by the
  human half with the D5 sentence, and the spec error view's
  existing Retry is the honest surface.
- **D3 — ONE new grant, double-pinned. Migration 092**:
  `job_specs_agent_update` — UPDATE for `is_agent()` + org, with
  **`is_final = false` pinned in BOTH USING and WITH CHECK**: the
  agent can neither touch a finalized spec nor finalize one — the
  canonical version can never be authored into existence by an
  agent; finalize stays the recruiter's act. NO INSERT, NO DELETE
  for the agent.
- **D4 — Vocabulary: `job_spec_generated`**, CHECK rebuilt from the
  live pg_constraint list (56 values today), allowlist EIGHTEEN.
  Detail: trigger `initial` | `regenerate` (the action knows), the
  version number, and a sections count — never the spec's text.
  **`agent_rolespec_invariants.sql`**: the judgment lands on the
  placeholder with the human's allocation surviving (version,
  created_by); THE IS_FINAL PIN both directions (the agent's UPDATE
  on a finalized row lands nowhere; an UPDATE setting is_final=true
  refused) — the control run drops the WITH CHECK conjunct and must
  abort on an agent-finalized spec; event attribution pins; history
  at eighteen by COUNT; negative matrix unchanged; kill switches
  independent at SIXTEEN.
- **D5 — Refusal is the marked row, honestly worded.** The run is
  fire-and-forget behind the polling skeleton; a refused or failed
  run lands the D5 sentence in `generation_error` via the HUMAN
  half, the error view renders it verbatim with Retry, and the
  placeholder keeps `content_json = {}` so the recruiter can always
  write the spec by hand. Nothing destroyed on any path.
- **D6 — Skills move onto the agent's session** — same injection,
  lawful under 074's `skills_agent_select`, no longer borrowing the
  recruiter's cookies inside `after()`.
- **D7 — Removability.** The seam keeps its exported shape; deleting
  the principal and restoring the cookie call is a one-file revert;
  the kill switch is independent of all fifteen others.
- **D8 — Deferred, recorded.** The executive-intelligence generators
  (same `is_generating`/`generation_error` family) are NOT
  converted here — their surfaces queue by usage with §73's six.
  The read-shaped shortlist/copilot conversions stay queued. The
  finalize/save/version actions stay human forever — they are
  editorial acts, not judgments.

## The phases

- **Phase 0** — this document. ✓ 2026-08-24, read-only (live
  pg_policy read; no standing gap found — the agent genuinely
  cannot write job_specs today).
- **Phase 1** — migration 092 (MCP + numbered file): the UPDATE
  policy with both is_final pins + vocabulary; invariants harness
  with the is_final control run; the account (§30 recipe, flip as
  its own statement); env pair.
- **Phase 2** — the seam: `signInRoleSpecAgent`;
  `generateAndStoreJobSpec` under the agent's session with the
  skills line moved; failure bookkeeping kept human; the trail
  event; the action threading the trigger.
- **Phase 3** — tests + green gate (tsc / vitest 820 baseline /
  eslint / build); deploy.
- **Phase 4** — drive 0e6 live: Build Job Spec on a calibrated
  scratch mandate → the spec lands with the event under the agent
  (trigger initial, version 1); regenerate → `regenerate`, version
  2; suspend → the D5 sentence in generation_error via the error
  view, Retry present; restore → retry lands; a steering probe
  through the agent's session; probe matrix (job_specs UPDATE on a
  FINALIZED row lands nowhere — the pin live; INSERT refused);
  teardown on scratch keys (the agent account and its 3 member
  events are DURABLE — users 17, baseline events 49). §76 verdicts
  drafted; completion declaration and this file's deletion ONLY on
  the founder's written confirmation.

## Numbers

Next migration **092**. Durable baseline after Phase 1: **17 users,
49 events**. Next drive prefix **0e6**. Next handoff § is **76**.
