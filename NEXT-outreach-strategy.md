# NEXT — the Engage arc, slice one: the Outreach Strategy Agent (#21)

Picked by the founder 2026-08-24 (§89): the approved Scout spec's
implementation order 21 → 24 → 22 → 23, slice one first — migration
097, the TWENTY-FIRST principal. **Phase 0 complete 2026-08-24.
D1–D8 DRAFTED below — the build is GATED on the founder's written
confirmation. Nothing past Phase 0 has been touched.**

Spec: `docs/superpowers/specs/2026-08-24-mandate-scout-engagement-design.md`
(§8 is this principal; defaults confirmed: org autonomy cap default
L1, deploy ceiling ≤L2 until counsel, every strategy human-approved
forever, noreply sender for slice one).

## The surface, as found

- **The outreach panel** (`src/app/(dashboard)/app/projects/[id]/
  candidates/[candidateId]/outreach-panel.tsx`) is a LOG, not a
  composer: channel/direction selects, subject/body inputs, one
  submit through `logOutreachAction` → the `log_candidate_outreach`
  RPC (the 043/044 pair: message row + Art.14 stamp are one
  statement; a checkbox cannot discharge the duty; the panel's
  banner reads `notificationState` live). Candidate email today is
  mailto-draft + manual log — `lib/email/send.ts` has never carried
  a candidate message. The strategy renders HERE as the draft
  source; the human still sends via their own mail client at ≤L1.
- **`compose.ts`** (`src/lib/outreach/compose.ts`) — the three-block
  compose stands unmodified: recruiter text + system-controlled
  versioned notice (art14-v1, required exactly when
  `notificationState` says due/overdue) + footer;
  `noticeIdempotencyKey` deterministic per (candidate, version).
  #21's draft_body is RECRUITER-BLOCK text only — the notice is
  never the agent's to write, so the existing guarantee covers agent
  drafts with zero changes. Regression tests exist
  (`compose.test.ts`) and are extended, not rewritten.
- **Live policies (pg_policies, read 2026-08-24):**
  `candidates_agent_select`, `projects_agent_select`,
  `skills_agent_select` already cover the evidence reads
  (cv_structured incl. evaluation/research; calibration_model +
  company_context; skills for the session). **`candidate_outreach`
  has NO agent face** — role-only (S `can_read_org`, I/U/D
  `can_share_clients`). #21 reading contact history is therefore
  ONE new read grant, not zero. `organizations` has no agent S and
  needs none (the org name enters at send time under the human's
  session). None of the four Engage tables exist yet.
- **A pin conflict in the spec, resolved in D3:** the agent's
  UPDATE double-pin (`status='draft'` BOTH faces, the 092 family)
  means the agent can never write `superseded`. So "redraft" is a
  HUMAN-FIRST act: the recruiter's session supersedes the old
  draft, then the seam signs the agent in to insert the new
  version. The pin stays clean; the human stays the only status
  mover.
- **Baseline verified live:** 21 users / 20 agents / 62 events / 2
  projects / 2 clients / 5 skills / 1 job_spec / **0
  candidate_outreach rows** / 1 candidate; CHECK at 64 values,
  allowlist TWENTY-FIVE; founder's session only.

## D1–D8 — drafted, for the founder to confirm

- **D1 — The TWENTY-FIRST principal: the Outreach Strategy Agent.**
  ONE judgment (§8): decide how this person should be approached,
  and draft it. Kind `outreach_strategy`, own credential
  `AGENT_OUTREACH_STRATEGY_*` (Vercel production + `.env.local`,
  the §30 recipe with the flip as its own statement — +3 durable
  member events, baseline 62 → 65), own /ops switch — TWENTY-ONE
  independent. The ENGAGE chapter appears on /app/agents with this
  principal, "stays human" line: *approving, editing, declining and
  sending are the recruiter's acts forever.*
- **D2 — The seam and the split.** The human door is the candidate
  page plus an explicit "Draft strategy" act in the outreach panel
  (server action, cookie session proves the recruiter may act on
  this candidate). The judgment moves: the seam
  (`src/lib/ai/run-outreach-strategy.ts`) signs the agent in,
  re-reads project + candidate + outreach history + org_comms_policy
  + skills under ITS session (never cookie-fetched rows handed
  sideways), judges (sonnet-4-6, structured output, no tools),
  INSERTs the `outreach_strategies` row status='draft' under its own
  name, records the trail event, signs out in a finally.
  Approve/decline/edit is a role UPDATE under the recruiter's
  session, `approved_by = auth.uid()`, `approved_at` stamped.
  Redraft = human supersede, then agent insert (Phase-0 finding).
- **D3 — Migration 097: TWO new tables + ONE new read grant.**
  - `outreach_strategies` per spec §8 (content jsonb: angle,
    career_hook, may_disclose[], must_not_disclose[], channel,
    cadence, talking_points[], likely_questions[], draft_subject,
    draft_body; status CHECK draft|approved|declined|superseded
    default 'draft'; version int; mission_id uuid NULL from day one
    — the column waits for Scout, nothing reads it yet). RLS: org
    role S (`can_read_org`); human U gated **`can_share_clients`**
    (the SAME predicate that gates the contact log — the act that
    authorizes contact is pinned like the contact record, not like
    candidate editing); agent S + I + U with the double pin: INSERT
    WITH CHECK status='draft' AND approved_by IS NULL; UPDATE
    USING/WITH CHECK both status='draft' (092 family — approval,
    decline and supersede are forever outside the agent's reach).
    Table CHECK: (status IN ('approved','declined')) =
    (approved_by IS NOT NULL AND approved_at IS NOT NULL). Partial
    unique index: ONE live draft per (candidate_id, project_id)
    WHERE status='draft'.
  - `org_comms_policy` per spec §5.2 (organization_id pk,
    allowed_channels default '{email}', caps NULL until 099 makes
    them enforceable, client_identity_disclosure default
    'after_approval', compensation_discussion default 'human_only',
    auto_approve_strategies default false — and NOTHING reads
    auto_approve in this slice; no auto-approval exists at any
    level by default, spec §16). RLS: org role S; U `is_org_admin`
    only; agent S (`is_agent`, org-scoped — #21 now, #22 later per
    spec §11). Seeded for every existing organization; the app
    treats an absent row as the defaults (deterministic fallback,
    no silent write).
  - `candidate_outreach_agent_select` — is_agent() + org-scoped
    SELECT, the history read. NO agent write on candidate_outreach
    in this slice (sends stay human; the comms-service RPC is 099's).
- **D4 — Vocabulary: ONE type** — `outreach_strategy_drafted`.
  CHECK rebuilt from the LIVE pg_constraint list 64 → 65, allowlist
  TWENTY-FIVE → TWENTY-SIX. Detail: COUNTS ONLY — version, channel,
  talking_points count, evidence-keys-present count, policy-clamped
  boolean — never a name, never draft text, never a disclosure list.
  **`agent_outreach_strategy_invariants.sql`** — invariants +
  control run on harness ids: read coverage by count; the draft born
  under the agent's name, org-scoped, status='draft',
  approved_by NULL; the negative matrix (the agent cannot flip
  status anywhere, cannot set approved_by, cannot UPDATE an
  approved/declined/superseded row, cannot touch candidate_outreach
  / candidates / projects rows — zero diff; the human approve path
  works under a role session and refuses under the agent's);
  org_comms_policy U refused for non-admin and for the agent; the
  disclosure clamp proven (a draft naming the client under
  'after_nda'/'never' policy is refused at the seam's validator
  before persist); attribution at twenty-six by COUNT; kill
  switches independent at TWENTY-ONE. The control run TRIMS
  `outreach_strategy_drafted` from the allowlist and must abort at
  INVARIANT-FAIL, self-rolling-back. Teardown on scratch ids and
  the known-zero outreach baseline — never time windows.
- **D5 — Refusal is honest, worded verbatim.** Suspended or
  credential-less, the panel's Draft-strategy act lands: "The
  Outreach Strategy Agent could not run — an operator has suspended
  it or its credentials are absent. Nothing was drafted; the
  contact log and history are untouched. Try again when it is
  restored." Sign-in precedes the Anthropic call — no billed
  judgment behind a refusal. Failure bookkeeping stays HUMAN (090):
  a refused agent signs nothing.
- **D6 — Skills and the disclosure clamp ride the session.** Skills
  injection with projectId = the mandate (project-scoped skills
  reach the draft). The disclosure discipline is DETERMINISTIC at
  the seam: after the model returns, a pure validator
  (`src/lib/outreach/strategy-policy.ts`, vitest-covered) clamps
  may_disclose/must_not_disclose and the draft text against
  org_comms_policy — client name stripped/refused under
  'after_nda'/'never', compensation content refused under
  'human_only' — BEFORE the insert. The comms service re-checks
  independently in 099 (the two-layer 095 precedent); this slice
  builds layer one.
- **D7 — Removability.** The panel keeps its shape (one section
  added); the seam is a per-file revert; dropping the two tables
  and the one grant restores 096's exact surface; the kill switch
  is independent of all twenty others.
- **D8 — Scope: Scout stays out of 097 (RECOMMENDED, for the
  founder to confirm).** The spec permits `scout_missions` /
  `scout_actions` landing with 097 in Assist/Discover form (§15.5).
  Recommended: DEFER them. At level ≤1 the approvals surface IS a
  query on outreach_strategies status='draft' — no mission row adds
  capability until an orchestrator exists, and the mission ledger's
  RPC (`record_scout_action`) deserves its own harness rather than
  riding this one. `mission_id` columns land nullable now so no
  Engage table needs revisiting. Also per the confirmed defaults:
  the noreply sender identity binds the comms service (099) — slice
  one sends from the recruiter's own mailbox via mailto, which is
  already honest about who is sending.

## The ladder (after written confirmation, in order)

1. Migration 097 (MCP + numbered file), invariants harness +
   control run against the live database.
2. Principal provisioning (§30 recipe, credential to Vercel prod +
   `.env.local`), /ops switch verified.
3. The seam + validator + panel section; vitest contracts
   (validator branches, compose regression untouched).
4. Green gate: tsc / vitest / eslint / next build.
5. Live drive (0eb screenshots): draft under policy, approve,
   decline, redraft-supersede, suspended-refusal D5 verbatim,
   /app/agents ENGAGE chapter.
6. `vercel --prod --yes` from the live repo; §90 verdicts DRAFTED —
   no completion declaration and no deletion of this file until the
   founder's written confirmation.
