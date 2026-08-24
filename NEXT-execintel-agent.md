# NEXT — the executive-generator cluster: the Executive Intelligence Agent

Picked by the founder 2026-08-24 after §81 (three of §73's five
uninjected seams, one file family, converted as one grouping — the
company-side precedent, §52). **Phase 0 complete 2026-08-24. D1–D8
DRAFTED below — the build is GATED on the founder's written
confirmation. Nothing past Phase 0 has been touched.**

## The surface, as found

Three seams, one shape — the PRE-092 job-spec pattern ×3: each runs
inside `after()` under a read-only COOKIE SSR client, lands on a
versioned placeholder the human allocated (the
`allocate_and_insert_*` RPCs, the `is_generating` latch), and keeps
terminal-state discipline via `markGenerationFailed` /
`generation_error` with an existing error-view + Retry surface. NO
skills injection on any of the three (they are three of §73's five).

- **`generateAndStoreSuccessProfile`** — reads executive_searches +
  the executive_competencies library (the grounding that stops
  hallucinated competency keys), UPDATEs the role_success_profiles
  placeholder, audits `profile_generated` with model + counts.
- **`generateAndStoreInterviewPlan`** — reads executive_searches,
  role_success_profiles, executive_search_competencies, candidates
  (pool ✓), UPDATEs the executive_interview_plans placeholder,
  audits likewise.
- **`runExecutiveCompanyContext`** — the cluster's WEB-REACHING
  judgment (Anthropic web_search, max_uses capped in code — the
  companyintel precedent): merges company_context +
  company_context_status ('generating' → 'ready'/'failed') onto the
  executive_searches row itself.

The subsystem has its OWN append-only ledger —
`executive_audit_events` (INSERT + SELECT policies only), with
`actor_id` passed explicitly; today the generation events wear the
CLICKER's id. Both artifact tables version (`version`,
`profile_new_version` / `plan_new_version` events) and APPROVE
(`status` draft → approved, `approved_by`/`approved_at`) — approval
is the recruiter's editorial act, the is_final analog, twice.

Live policies (pg_policies): **NO agent policies on ANY of the six
executive tables** — the agent genuinely cannot touch the
executive-intelligence subsystem today. The candidates read is the
only one already pooled. This is the LARGEST new-grant conversion
since 074.

## D1–D8 — drafted, for the founder to confirm

- **D1 — The NINETEENTH principal: the Executive Intelligence
  Agent.** ONE identity, THREE judgments (the §50 companyintel
  precedent — one principal, multiple acts, one kill switch
  covering the subsystem). Own credential `AGENT_EXECINTEL_*`
  (Vercel production + `.env.local`, §30 recipe), own /ops switch —
  NINETEEN independent.
- **D2 — The splits stand as built ×3; only the judgments move.**
  The human keeps every allocation (the placeholder RPCs, the
  latch, versioning) and every editorial act (edit, new-version,
  APPROVE); the agent signs in per run inside `after()`, reads what
  it lawfully sees, judges with skills riding ITS session, lands on
  the draft placeholder (or merges the context blob), audits and
  records under its own name, signs out. FAILURE BOOKKEEPING STAYS
  HUMAN (the 090 doctrine ×3): `markGenerationFailed` and the
  context 'failed' transition keep the cookie session — the refused
  case has no agent session to sign with.
- **D3 — The grant cluster. Migration 095**, double-pinned twice
  and impersonation-pinned once:
  - `executive_searches_agent_select` + `_agent_update` (the
    context blob and its status land on the search row; the intake
    fields' survival is pinned by invariants — the 074 projects
    S+U precedent for column discipline).
  - `role_success_profiles_agent_select` + `_agent_update` with
    **`status = 'draft'` in BOTH USING and WITH CHECK** — the agent
    can neither touch an approved (or archived) profile nor move
    one out of draft; approval stays the recruiter's act forever
    (the 092 pin, first table).
  - `executive_interview_plans_agent_select` + `_agent_update`,
    the same double pin (the 092 pin, second table).
  - `executive_competencies_agent_select` +
    `executive_search_competencies_agent_select` (grounding reads —
    the library is what stops hallucinated keys).
  - `executive_audit_events_agent_insert` with **`actor_id` PINNED
    to `auth.uid()` in WITH CHECK** (the 087 impersonation
    precedent): the agent cannot sign a human's name in the
    executive ledger. INSERT only, blind (the audit module never
    RETURNINGs); the request/edit/approve events keep wearing the
    human's id through the existing role policy.
  - NO INSERT on either artifact table (allocation is human), NO
    DELETE anywhere.
- **D4 — Vocabulary: THREE types** — `success_profile_generated`,
  `interview_plan_generated`, `executive_context_researched` — into
  the CHECK (rebuilt from the live list, 59 → 62) and the allowlist
  TWENTY → TWENTY-THREE. Details: trigger, version, model, counts
  (competencies weighted / stages / sources found) — never content.
  The executive ledger's generation events move under the agent's
  id in the same stroke. **`agent_execintel_invariants.sql`** — 6
  invariants + control run: read coverage by count (searches,
  profiles, plans, both competency tables); the three judgments
  land with the human's allocations SURVIVING (version, created_by,
  intake fields under the context merge); THE APPROVED PIN both
  directions on BOTH tables; THE AUDIT ACTOR PIN (a forged
  actor_id refused by name); attribution + history at twenty-three
  by COUNT; negative matrix; kill switches independent at NINETEEN.
  The control run drops the WITH CHECK status conjunct on
  role_success_profiles ("USING already refuses approved rows" —
  092's drift, third sighting) and must abort on an
  agent-APPROVED profile, self-rolling-back.
- **D5 — Refusal is the marked row, honestly worded ×3.** All three
  are fire-and-forget behind polling surfaces; a refused agent
  lands the D5 sentence through the HUMAN half
  (`generation_error` verbatim + Retry on both artifact surfaces;
  `company_context_status='failed'` on the search), placeholders
  keep their empty shapes, nothing destroyed on any path.
- **D6 — Skills reach all three seams** riding the agent's session
  — §73's list shrinks to TWO (candidate search, sourcing search).
- **D7 — Removability.** Each generator keeps its exported shape;
  restoring the cookie client is a per-file revert; the kill switch
  is independent of all eighteen others.
- **D8 — Deferred, recorded.** The assessment-scoring and
  risk-synthesis modules are pure computation over stored content
  (no model calls found in §73's audit) — NOT touched here; if a
  model-calling assessment surface ships later it converts on its
  own slice. Edit, new-version, approve, archive, candidate
  linking, and the search intake stay human forever. The
  ~web-reaching context runs inherit the companyintel long-action
  evidence; nothing new deferred unless the drive says otherwise.

## The phases

- **Phase 0** — this document. ✓ 2026-08-24, read-only (live
  pg_policies read on all six tables — no agent reach exists today;
  status vocabulary and approval columns verified live; audit
  module and allocation RPCs traced).
- **Phase 1** — migration 095 (MCP + numbered file): the grant
  cluster with both status pins + the audit actor pin + vocabulary;
  invariants harness with the status control run; the account (§30
  recipe, flip as its own statement — 3 member events); env pair.
- **Phase 2** — the seam ×3: `signInExecutiveIntelAgent`; the three
  generators under the agent's session with skills lines added;
  failure bookkeeping kept human; audit calls carrying the agent's
  id on generation events; the three trail events threading
  triggers.
- **Phase 3** — tests + green gate (tsc / vitest 820 baseline /
  eslint / build); deploy.
- **Phase 4** — drive 0e9 live: a real executive search through the
  real intake → company context lands (web-reaching, sources
  counted, event under the agent) → success profile generated
  (grounded weights, event + audit under the agent) → a candidate
  linked, interview plan generated (third judgment) → suspend → all
  three surfaces refuse with the D5 sentence VERBATIM (error views
  + failed status), placeholders honest → restore → retries land →
  a steering probe ("STEERED-0E9:") through one seam → the
  recruiter APPROVES the profile through the real dialog → LIVE PIN
  PROBE on production rows (the agent's UPDATE on the approved
  profile lands NOWHERE; its attempt to set status='approved' on a
  draft refused; a forged-actor audit insert refused) → probe
  matrix + text-probe → teardown on scratch keys / value-keyed
  events (the agent account and its 3-event creation trail are
  DURABLE — users 20, baseline events 58). §82 verdicts drafted;
  completion declaration and this file's deletion ONLY on the
  founder's written confirmation.

## Numbers

Next migration **095**. Durable baseline after Phase 1: **20 users,
58 events, 19 agents**. Next drive prefix **0e9**. Next handoff §
is **82**.
