# NEXT — the Engage arc, slice two: the Candidate Relationship Agent (#24)

Opened on the founder's word 2026-08-25 (§91 confirmed slice one;
the §89 order stands: 097 #21 → **098 #24** → 099–100 #22 → 101 #23).
Spec §7 is this principal. **D1–D8 CONFIRMED in writing 2026-08-25;
the ladder ran the same night: 098 applied + harness + column-pin
control run, principal provisioned (`a99848b0-…`), resolver trigger /
RPC-only DNC / seam / clamp / card / #21 refusal built, green gate
(tsc / vitest 843 / eslint / build), 0ec live drive on production
(deploy `mandate-nn7lcjttx` = `7ddef02`), teardown to the new durable
baseline (23 users / 22 agents / 68 events / 1 profile). One Phase-0
live-read correction, stronger than drafted: the SQL identity rule
already existed as `candidate_identity_key()` (073) — reused, and
count_network_people refactored onto it. §92 verdicts are DRAFTED in
the handoff — this file is NOT deleted and no completion is declared
until the founder's written confirmation of §92. Founder-hand:
append AGENT_RELATIONSHIP_* (and 097's AGENT_OUTREACH_STRATEGY_*)
to `.env.local`.**

Why this slice is second (spec §15): #22's policy ladder needs
durable DNC and relationship state BEFORE any autonomous send
exists, and #21's inputs improve immediately (the spec names
network_profiles as its nullable input).

## The surface, as found

- **A person is COMPUTED, not stored.** `lib/network/network-aggregator.ts`
  folds project-scoped candidate rows into people at read time via
  `identityKey` (`lib/candidate-identity.ts` — email > linkedin >
  name|company, the SINGLE home with a change-together warning), under
  a 2000-row window (`CANDIDATE_ROW_CAP`) with an honest `truncated`
  flag. Migration 040's own comment anticipates this slice: "removing
  the bound properly means grouping by identity in Postgres — a
  stored key column." `count_network_people()` (040) is the ONE SQL
  transcription of the rule.
- **Candidate birth paths are MANY** — manual add + CV upload
  (`projects/[id]/candidates/actions.ts`, four insert/update sites),
  network add-to-search copy (`candidates/network/actions.ts`),
  sourcing promotion (`promote_sourcing_results` — a SECURITY DEFINER
  RPC, born in SQL), executive-intelligence candidate creation, and
  the candidate PORTAL's self-update RPCs (which can change email —
  i.e. change identity). An app-layer resolver called from each site
  would miss the RPC and portal paths; the data layer catches all of
  them (D3's trigger decision).
- **Erasure and withdrawal live in RPCs**:
  `candidate_portal_withdraw` / `candidate_portal_request_erasure`
  (073; the events + /ops queue exist; closing a request is
  founder-only by 073's UPDATE policy). These are where DNC becomes
  SYSTEMIC in this slice. Live: 0 erasure rows.
- **The guard-trigger family exists** (`guard_subject_notified` 043,
  the 034/038/039 executive guards) — the proven mechanism for a
  COLUMN pin RLS alone cannot express (WITH CHECK sees only the new
  row; forbidding a *change* needs OLD vs NEW).
- **Live policies (pg_policies, read 2026-08-25):** candidates carries
  the generic agent S (+U); candidate_outreach agent S landed in 097;
  outreach_strategies agent S landed in 097; `network_profiles` does
  not exist; `candidates.network_profile_id` does not exist;
  candidate_erasure_requests is role S + founder-only U, no agent
  face (and needs none — the agent never reads the erasure queue; it
  sees only the profile's dnc flag).
- **No person-detail surface exists** — the network table is flat
  rows + add-to-search; the spec's "relationship card on the network
  person view" needs a place to live (D8).
- **Baseline verified live:** 22 users / 21 agents / 65 events / 2
  projects / 2 clients / 5 skills / 1 job_spec / 1 candidate / 1
  org_comms_policy / 0 outreach / 0 strategies / 0 erasure requests.
  CHECK at 65, allowlist TWENTY-SIX.

## D1–D8 — drafted, for the founder to confirm

- **D1 — The TWENTY-SECOND principal: the Candidate Relationship
  Agent.** ONE judgment (spec §7.2): maintain the relationship record
  from evidence. Kind `relationship`, account
  `vbreygin+relationship@gmail.com`, credential `AGENT_RELATIONSHIP_*`
  (Vercel production + `.env.local`, §30 recipe, +3 durable member
  events — baseline 65 → 68), own /ops switch — TWENTY-TWO
  independent. The ENGAGE chapter gains its second entry; "stays
  human" line: *it can never set or clear do-not-contact, and never
  moves a relationship into or out of that state — DNC is the
  human's and the erasure system's alone.*
- **D2 — The seam and the split.** The human door is an explicit
  "Update relationship" act on the network person's relationship
  card. The judgment: the seam (`src/lib/ai/run-relationship.ts`)
  signs #24 in, reads the person's appearances + contact history +
  strategies + evidence under ITS session, and MERGE-WRITES ONLY
  `disposition`, `relationship_state` (guard-pinned away from
  do_not_contact both directions), `follow_up_at`,
  `last_meaningful_contact_at` on the profile row; records
  `relationship_updated` with COUNTS (appearances, contacts,
  evidence keys — never a name, never disposition text); signs out
  in a finally. Referrals/prior-mandate history stay DERIVED from
  existing rows — never duplicated into the profile (spec §7.2).
- **D3 — Migration 098: the person becomes REAL at the data layer.**
  - `network_profiles` per spec §7.1 (identity_key verbatim from the
    existing rule; UNIQUE (organization_id, identity_key);
    relationship_state CHECK cold|contacted|engaged|warm|placed|
    client_contact|do_not_contact default 'cold'; dnc boolean default
    false + dnc_reason/dnc_set_at/dnc_set_by; disposition jsonb;
    follow_up_at/follow_up_note; last_meaningful_contact_at).
    Consistency CHECK: dnc = true requires dnc_reason AND dnc_set_at
    (a suppression without a reason is not a record); relationship_
    state = 'do_not_contact' requires dnc = true (one truth, not two).
  - `candidates.network_profile_id uuid null` + FK + index.
  - **The resolver lives in SQL, fired by trigger** (the Phase-0
    finding): `network_identity_key(full_name, email, linkedin_url,
    current_company)` — ONE SQL transcription, and
    `count_network_people()` is REFACTORED onto it in the same
    migration (two transcriptions would drift); a SECURITY DEFINER
    `resolve_network_profile()` find-or-creates by (org, key); an
    AFTER INSERT OR UPDATE OF email/linkedin_url/full_name/
    current_company trigger on candidates links (and RE-links on
    identity edits) `network_profile_id`. Every birth path — manual,
    import, promotion RPC, portal self-update — is covered with zero
    app-layer wiring. The spec's `lib/network/profile-resolver.ts`
    ships as the TS read-side helper (profile-for-person lookups),
    not as the enforcement point.
  - **Backfill** in-migration: profiles find-or-created for all
    existing candidate rows (1 durable candidate → 1 profile).
  - **The DNC guard trigger** (043 family): when `is_agent()`, refuse
    any change to dnc/dnc_reason/dnc_set_at/dnc_set_by and any
    relationship_state transition INTO or OUT OF 'do_not_contact'.
  - **Systemic DNC**: `candidate_portal_withdraw` and
    `candidate_portal_request_erasure` gain the profile dnc-set
    (reason 'candidate withdrew' / 'erasure requested', dnc_set_by
    NULL = the system, timestamped) — the workflow, not a checkbox.
  - **`clear_network_dnc(profile_id, reason)`** — the ONLY un-set
    (spec §7.1): SECURITY DEFINER, `is_current_user_founder()`
    pinned, reason MANDATORY, records the human event.
  - RLS: org role S (`can_read_org`); human U (`can_write_candidates`
    — relationship editing is candidate-editorial; the human may set
    dnc by hand THROUGH the same U, the guard only binds agents);
    agent S + U (the guard trigger is the column pin). NO role
    INSERT (profiles are born by the resolver), NO agent INSERT, NO
    DELETE (relationship data SURVIVES — spec §4.3).
- **D4 — Vocabulary: THREE types.** `relationship_updated` (the
  agent's, allowlist TWENTY-SIX → TWENTY-SEVEN) plus two HUMAN types
  `network_dnc_set` / `network_dnc_cleared` (recorded by the portal
  RPCs / clear RPC / the by-hand action — never by an agent; the
  allowlist does NOT grow for these). CHECK rebuilt from the LIVE
  list 65 → 68. **`agent_relationship_invariants.sql`** — invariants
  + control run on harness ids: resolver determinism (same identity
  fields → same profile, distinct → distinct, UNIQUE enforced,
  identity-edit RE-links); backfill correctness by count; the agent's
  merge-write lands ONLY the four fields; THE DNC PIN all faces (the
  agent cannot set dnc, cannot clear dnc, cannot enter or leave
  do_not_contact — while the HUMAN's by-hand dnc-set with reason
  lands, the recruiter's relationship edit lands, and the founder's
  clear lands with its reason while an admin's clear refuses);
  dnc-without-reason refused by CHECK; the erasure RPC sets dnc
  systemically; the trail: relationship_updated counts-only under
  the agent's name, dnc events under the human's, text-probe clean;
  history intact at TWENTY-SEVEN by COUNT; negative matrix; kill
  switches independent at TWENTY-TWO. **Control run:** the guard
  trigger rebuilt with the agent-dnc clause dropped ("RLS already
  scopes the update") — the agent CLEARS a dnc flag and the harness
  aborts at INVARIANT-FAIL, drift + harness one transaction,
  self-rolling-back — the first control to regress a COLUMN pin.
- **D5 — Refusal, worded verbatim:** "The Candidate Relationship
  Agent could not run — an operator has suspended it or its
  credentials are absent. The relationship record is untouched. Try
  again when it is restored." Foreground toast on the card's act;
  sign-in precedes any model spend.
- **D6 — Skills ride the session; #21 learns about people.** Skills
  injection with projectId NULL (a person is cross-project — org-wide
  skills only, the digest precedent). #21's seam gains the profile
  read (nullable input per spec §8) and **refuses to draft a strategy
  for a DNC person** — free, honest, before any model spend; the
  panel says why. The full send-time enforcement stays 099's.
- **D7 — Removability.** Dropping the table, the column, the two
  triggers, the three functions and the vocabulary restores 097's
  exact surface; the network aggregator keeps computing (the overlay
  is additive); the kill switch is independent of all twenty-one
  others.
- **D8 — Scope decisions (RECOMMENDED, for the founder to confirm):**
  (a) the person surface is an EXPANDABLE ROW on the existing network
  table (terminal idiom) carrying the relationship card — state,
  disposition, follow-up, DNC with its reason, Update-relationship
  act, by-hand DNC set — no new route this slice; (b) the resolver
  is the data-layer trigger above, not per-call-site app wiring;
  (c) identity-edit drift re-links the candidate row and any
  relationship rows already written STAY on the old profile
  (relationship data survives; merging profiles is a founder-hand
  act deferred until it is real); (d) the network aggregator itself
  keeps its computed fold this slice — the stored key exists after
  098, and moving the page onto it is its own later cleanup.

## The ladder (after written confirmation, in order)

1. Migration 098 (MCP + numbered file), invariants harness + control
   run against the live database.
2. Principal provisioning (§30 recipe, credential to Vercel prod;
   `.env.local` stays founder-hand), /ops switch verified.
3. Resolver trigger + guard + RPC extensions; seam + card + #21's
   DNC refusal; vitest contracts.
4. Green gate: tsc / vitest / eslint / next build.
5. Live drive (0ec): backfilled profile visible, relationship update
   under the agent (counts in trail), by-hand DNC with reason,
   agent-refused-by-DNC on #21's draft act, suspended D5 verbatim,
   founder-only clear, steering probe naming a disposition field,
   /app/agents second ENGAGE entry. Teardown on scratch ids; the
   suspend/restore residue keyed by VALUE; browser session handled
   by deleting ITS OWN session row only (§90's wound, not repeated).
6. `vercel --prod --yes` from the live repo; §92 verdicts DRAFTED —
   no completion declaration and no deletion of this file until the
   founder's written confirmation.
