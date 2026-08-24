# NEXT — the closing slice: the Candidate Search Agent

Picked by the founder 2026-08-24 after §83 (§73's LAST TWO
uninjected seams — candidate search and sourcing search — likely one
slice/one principal if the audit supports it; this empties §73's
list). **Phase 0 complete 2026-08-24. D1–D8 DRAFTED below — the
build is GATED on the founder's written confirmation. Nothing past
Phase 0 has been touched.**

## The surface, as found

The audit found ONE live seam and ONE latent runner — not two live
seams. The one-slice/one-principal shape survives, but the sourcing
half converts at the seam, not on a surface (D8).

- **`runCandidateSearch`** (`src/lib/ai/run-candidate-search.ts`) —
  the LIVE seam. Called from ONE place: the AI candidate search
  page (`/app/candidates/search`), an RSC rendered per GET with the
  query in the URL. Under the recruiter's COOKIE session the page
  reads the whole-org pool (candidates + projects +
  candidate_scores), applies the structural filters, compacts the
  survivors into model input, and calls the model (pure judgment:
  structured output, no tools, sonnet-4-6). It persists NOTHING —
  no event, no trail, no kill switch, no skills. Read-shaped: the
  copilot's nearest sibling (§80), page-render instead of stream.
  Failure is already honest (`agentErrorMessage` into an
  ErrorState; the raw-provider-JSON leak was fixed before the rail
  linked the page).
- **`runSourcingSearch`** (`src/lib/ai/run-sourcing-search.ts`) —
  NOT a live seam. Built at `767735f` ("find candidates not yet in
  the pool"), web-reaching (Anthropic web_search, max_uses 8,
  pause_turn continuation loop), with the compliance boundary IN
  THE TOOL PARAMETERS: org-configured `allowed_domains`, LinkedIn
  on a hard blocklist (`source-policy.ts` — the ToS analysis is in
  the module header). **No caller anywhere.** No
  `source_connectors` table exists (the type lives only in
  source-policy.ts), no settings surface, no wiring into the
  sourcing-runs flow — which shipped as MANUAL import by design
  (the 2026-08-12 design doc: "No AI call happens anywhere in this
  file"). The runner itself persists nothing; it returns a result
  the absent caller would store.

Live policies (pg_policies, read 2026-08-24): the role-wide agent
pool ALREADY covers every read the live seam needs —
`candidates_agent_select`, `candidate_scores_agent_select`,
`projects_agent_select`, `skills_agent_select`, all org-scoped.
**Zero new grants required — the SIXTH zero-new-grant conversion**
(the 094 copilot precedent). `sourcing_runs` /
`sourcing_run_results` carry NO agent policies (human-only), which
is consistent and needs no change: the latent runner writes no
rows. Allowlist verified live at TWENTY-THREE, CHECK at 62.
Baseline verified live: 20 users / 19 agents / 58 events / 2
projects / 2 clients / 5 skills / 1 job_spec / 0 sourcing rows /
the founder's session only.

## D1–D8 — drafted, for the founder to confirm

- **D1 — The TWENTIETH principal: the Candidate Search Agent.**
  ONE identity, TWO judgments (the §50 companyintel precedent):
  searching INSIDE the pool (live now) and searching OUTSIDE it
  (the latent sourcing runner — both are candidate search; one
  haystack is the org's own, the other the configured open web).
  Kind `candidate_search`, own credential `AGENT_SEARCH_*` (Vercel
  production + `.env.local`, §30 recipe), own /ops switch — TWENTY
  independent.
- **D2 — The split.** The human door stays the page's threshold:
  the cookie session proves the recruiter may look at their pool
  BEFORE any agent exists, and the DISPLAY reads (the rendered
  rows, the filter dropdowns) stay the recruiter's own view. The
  judgment moves: per queried render, the seam signs the agent in,
  re-reads the pool under ITS session (the copilot precedent —
  the agent judges only what it lawfully sees, never
  cookie-fetched rows handed sideways), applies the same
  structural filters, judges with skills riding its session,
  records the trail event, and signs out in a finally. GET
  semantics make fail-soft trivial: the query and filters live in
  the URL; there is nothing to destroy.
- **D3 — Zero new grants. Migration 096 is VOCABULARY ONLY** (the
  094 shape): the pool covers all four reads and the agent writes
  nothing but its trail. No INSERT, no UPDATE, no DELETE anywhere
  new.
- **D4 — Vocabulary: TWO types** — `candidate_search_answered`
  (recorded live from this slice) and `sourcing_search_executed`
  (minted AHEAD of its channel — the slice-fourteen `scheduled`
  precedent: when the connector surface ships, the principal and
  its vocabulary are already waiting). CHECK rebuilt from the live
  list 62 → 64, allowlist TWENTY-THREE → TWENTY-FIVE. Details:
  COUNTS ONLY — pool size, filtered size, matches returned,
  filters-applied booleans; for the sourcing type search_rounds
  and domain COUNT — never the query text, never a name, never a
  domain list. **`agent_search_invariants.sql`** — invariants +
  control run: read coverage by count on harness ids; the answer
  event under the agent's name with counts and no text; the
  negative matrix (no candidate/project/score row born or mutated
  by the agent — its diff against the pool tables is zero);
  attribution at twenty-five by COUNT; kill switches independent
  at TWENTY. The control run TRIMS `candidate_search_answered`
  from the allowlist (091's drift class — "the type is new") and
  must abort at INVARIANT-FAIL, self-rolling-back.
- **D5 — Refusal is the honest page, worded verbatim.** A
  suspended or credential-less agent lands the D5 sentence through
  the existing ErrorState: "The Candidate Search Agent could not
  run — an operator has suspended it or its credentials are
  absent. Your query and filters are safe in this page's address;
  search again when it is restored." The form, the filters, and
  the sample keep rendering; nothing is destroyed on any path. The
  sourcing runner refuses AT SIGN-IN, before any billed search is
  spent (the web-reaching precedent, §52/§82).
- **D6 — Skills reach BOTH runners** riding the agent's session:
  the page passes its project filter as projectId when set (a
  project-scoped search reads that project's role skills), else
  null (org-wide skills only); the sourcing runner takes the
  projectId its future caller will have. **§73's list EMPTIES.**
- **D7 — Removability.** The page keeps its shape (one seam call
  swapped); restoring the direct model call is a per-file revert;
  the kill switch is independent of all nineteen others.
- **D8 — The sourcing half converts AT THE SEAM, and the record
  says so.** The audit finding stands in §84 as found: sourcing
  search is latent code, not a live seam — there is no surface to
  drive. RECOMMENDED (drafted as the plan): in this slice,
  `runSourcingSearch`'s contract changes to REQUIRE the agent's
  session (sign-in inside the seam, no session no search) and to
  inject skills — so the judgment cannot ever ship headless: when
  the connector surface lands, it is born signed, behind the same
  kill switch, its vocabulary already in the ledger. Proven by
  vitest (refusal without credentials, refusal when suspended,
  skills in the prompt, the compliance blocklist surviving), NOT
  by a live drive — and §84 records that the live drive covers the
  pool judgment only. ALTERNATIVE for the founder: declare the
  sourcing entry VACANT (no caller = no seam), close §73's list by
  correction, and leave the runner untouched until its product
  surface is built. The recommendation is the former: the runner
  already encodes the compliance boundary worth protecting, and
  one principal owning both judgments is the shape the founder
  named.

## The phases

- **Phase 0** — this document. ✓ 2026-08-24, read-only (live
  pg_policies on all seven tables; allowlist + CHECK verified
  live; both runners and the single caller traced; the
  no-caller/no-connector-table finding for sourcing; baseline
  census verified exact).
- **Phase 1** — migration 096 (MCP + numbered file): vocabulary
  only (two types, CHECK 62 → 64, allowlist 25); invariants
  harness with the allowlist-trim control run; the account (§30
  recipe, flip as its own statement — 3 member events, keyed by
  NAME); env pair `AGENT_SEARCH_*`.
- **Phase 2** — the seam: `signInCandidateSearchAgent`; the page's
  judgment path under the agent's session (agent-side pool read,
  skills, the event with counts, sign-out in finally; display
  reads stay cookie); `runSourcingSearch` seam-bound per D8 with
  skills injection; the D5 sentence into the ErrorState path.
- **Phase 3** — tests + green gate (tsc / vitest 820 baseline /
  eslint / build); deploy from the live repo (`vercel --prod
  --yes`).
- **Phase 4** — drive 0ea live: scratch world (operator, mandate,
  a small scored pool) → a real query on the real page lands
  parsed criteria + ranked matches, ONE `candidate_search_answered`
  event under the agent's name, counts only → text-probe of the
  trail (no query text, no candidate name) → suspend from /ops →
  the search refuses with the D5 sentence VERBATIM, form and
  filters intact → restore → steering probe (a skill NAMING a
  schema field — `parsed_criteria.intent` beginning
  "STEERED-0EA:" — the §82 guidance) → rerun lands steered →
  teardown on scratch ids and value-keyed events to the NEW
  durable baseline (the agent's creation trail is durable). §84
  verdicts drafted; completion declaration and this file's
  deletion ONLY on the founder's written confirmation.

## Numbers

Next migration **096**. Durable baseline after Phase 1: **21
users, 61 events, 20 agents**. Next drive prefix **0ea**. Next
handoff § is **84**.
