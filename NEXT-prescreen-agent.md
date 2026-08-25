# NEXT — the Engage arc, slice five: the Pre-Screen Agent (#23),
# the twenty-fourth principal (migration 101)

Opened on the founder's word 2026-08-25 (§97 confirmed the 099–100
pair; the §89 order stands: 097 #21 ✓ → 098 #24 ✓ → 099–100 comms +
#22 ✓ → **101 #23**). Spec §9 (#23), §11 (prescreens RLS row), §12
(the counsel gate), §13 ("Pre-screen review" surface). **D1–D8
below are DRAFTED — the build is GATED on written confirmation.**

## The surface, as found

- **The coverage-gap inputs already exist, whole.** The calibration
  model carries FIVE dimension keys (technical, domain, leadership,
  regulatory, transformation — `DIMENSION_KEYS`, onboarding-analysis)
  with weights; every parsed candidate carries `cv_structured`. The
  spec's "evidence-coverage gap… computed by a pure function, not a
  new artifact" is a lib function over these two — no new judgment,
  no model call, vitest-provable.
- **The conversation channel is the 099 service, and it is HUMAN.**
  sendCandidateMessage is live (Art. 14 composed, ladder walked,
  atomic completion); the #22 D8b precedent — the agent proposes,
  the human sends — is proven end to end on production. #23's
  invitation and questions ride the SAME door.
- **Inbound is still designed-NOT-built (spec §6).** Candidate
  answers arrive today as hand-logged `inbound` rows on
  candidate_outreach — the same lawful input #22 judges. The
  thread_key routing is minted and waiting; nothing in this slice
  builds MX, webhooks, or classification.
- **The no-verdict doctrine has a home already**: the coverage
  agent's closed-enum precedent (belt-and-braces: schema forbids,
  input starves, normalizer drops) is the exact shape for keeping
  scores out of a pre-screen artifact.
- **The counsel gate (§12) names AI-CONDUCTED conversations and
  level ≥3 autonomy.** At the shipped ceiling nothing converses:
  humans send, humans conduct, the agent computes gaps, drafts
  questions, and STRUCTURES what came back. The §12 questions stay
  open and continue to gate level ≥3 — this slice must not touch
  them.
- Baseline: 24 users / 23 agents / 71 events / 1 profile / 1
  policy; allowlist TWENTY-EIGHT, CHECK 69; next migration 101,
  next § 98, next drive 0ef.

## D1–D8 — drafted, for the founder to confirm

- **D1 — one migration (101), one principal.** #23 (the
  TWENTY-FOURTH principal, kind `prescreen`,
  vbreygin+prescreen@gmail.com, `AGENT_PRESCREEN_*`, own switch —
  TWENTY-FOUR independent, §30 recipe). `prescreens` table +
  vocabulary `prescreen_updated` (counts only; allowlist
  TWENTY-NINE, CHECK 70 — rebuilt from the LIVE pg_constraint).
- **D2 — the counsel boundary, drawn in scope.** At the shipped
  ceiling #23 has one judgment in three deterministic-shaped acts:
  (1) COMPUTE the evidence-coverage gap — pure function over
  cv_structured × the five calibration dimensions, each dimension
  Strong / Partial / Unknown with its source, no model call;
  (2) DRAFT the pre-screen invitation + one question per unknown —
  a proposal on the artifact, sent ONLY by the human through
  sendCandidateMessage (the #22 D8b loop, reused verbatim);
  (3) CAPTURE — as replies are logged, structure
  professional_evidence and interest_profile from the thread, and
  copy the turns verbatim into `transcript`. Humans conduct the
  conversation; the agent structures it. NOTHING counsel-gated
  ships: no AI-conducted turn, no autonomous send, no level ≥3.
  §12's six questions stay OPEN and gate level ≥3 as specced.
- **D3 — `prescreens` per spec §9, two named additions.** Columns
  as specced: org/project/candidate, mission_id (nullable, unread —
  waits for Scout), status CHECK
  (proposed|invited|in_progress|complete|abandoned|escalated),
  transcript jsonb, professional_evidence jsonb (per dimension
  {value, status validated|partial|unknown, source}),
  interest_profile jsonb, completed_at. NAMED DEVIATIONS (the D8b
  family): (a) `question_set` jsonb — the proposed invitation
  (subject, body, questions[]) the human approves and sends, or it
  dies unsent; (b) `escalation_reason` with 100's BIDIRECTIONAL
  coherence CHECK ((status='escalated') = (reason IS NOT NULL)) —
  an escalated pre-screen without a reason is not a record. ONE
  live pre-screen per candidate+project lane: partial UNIQUE where
  status <> 'abandoned'. Status/stamp coherence:
  (status='complete') = (completed_at IS NOT NULL).
- **D4 — THE NO-VERDICT PIN, three layers.** No verdict, score,
  pass, or percentage field exists; the pure clamp strips any key
  matching /score|pass|verdict|qualif/i from the model's evidence
  and interest output BEFORE persistence; the harness probes the
  landed jsonb for the same pattern and aborts on a hit (the §42
  shape: the count, not the promise, is the tripwire).
  Recruiter-ready is DERIVED — a pure function (complete AND
  interest ∈ {strong, open} AND no open escalation), surfaced as
  evidence + unknowns on the review panel, never as a grade.
- **D5 — RLS per spec §11.** org S (can_read_org); human U
  (can_write_candidates — mark invited on send, abandon, resolve
  escalations); #23 S+I+U: INSERT pinned status='proposed'; UPDATE
  double-pinned BOTH faces — USING status IN
  ('proposed','invited','in_progress') (complete is TERMINAL to the
  agent after completed_at; abandoned and escalated rows are the
  human's), WITH CHECK status <> 'abandoned' (abandonment is a
  human act, and a raise carries its reason via the table CHECK).
  NO DELETE for anyone. CONTROL RUN: the USING status conjunct
  dropped ("the seam refuses terminal rows anyway") → the agent
  REOPENS a completed pre-screen and rewrites its evidence → abort.
- **D6 — disclosure and the one validator.** The invitation body is
  composed with a SYSTEM-CONTROLLED disclosure block — the
  pre-screen questions are prepared by an AI assistant acting for
  the named search firm — non-negotiable, in the template, like the
  Art. 14 notice (§12.1 pre-commits to always-disclose; counsel
  confirms wording before level ≥3). The drafted invitation and
  questions are clamped through applyCommsPolicy (the FOURTH reuse
  of the one validator: 097 draft-time, 100 proposal-time, 099
  send-time, 101 question-time). Skills ride the agent's session,
  project-scoped (a pre-screen IS a mandate's act).
- **D7 — removability.** Additive: dropping 101's table, principal
  and vocabulary restores 100's surface exactly; no existing policy
  is touched; the send path gains no new door.
- **D8 — scope decisions (RECOMMENDED, for the founder to confirm):**
  (a) no new send machinery — the invitation rides
  sendCandidateMessage under the HUMAN's name with the
  prescreen-scoped idempotency key;
  (b) transcript capture reads the THREAD (candidate_outreach for
  the lane, direction + stamps, verbatim) — hand-logged inbound is
  the lawful input until the inbound gate opens;
  (c) the "Pre-screen review" panel (spec §13) lands on the
  candidate page: coverage chips (Strong/Partial/Unknown with
  sources), the two tracks side by side, unknowns
  resolved/remaining, the derived recruiter-ready line, transcript;
  (d) mission_id stays nullable and unread until Scout;
  (e) the D5 sentence, verbatim: "The Pre-Screen Agent could not
  run — an operator has suspended it or its credentials are absent.
  The pre-screen record is untouched. Try again when it is
  restored.";
  (f) §12 items 1–3 are recorded as OPEN COUNSEL ITEMS in the
  §-record with this slice's mitigations named (human-conducted,
  no-verdict, derived-state) — if the founder wants counsel's
  wording on the disclosure line BEFORE the invitation template
  ships externally, that is a founder call at confirmation time.

## The ladder (after written confirmation, in order)

1. Migration 101 (MCP + numbered file) → invariants harness +
   terminal-row control run.
2. §30 provisioning (+3 member events, baseline 71→74; smoke-test
   then revoke; `.env.local` founder-hand).
3. The pure coverage function + clamp (vitest) → seam
   (run-prescreen.ts, project-scoped skills, D5 verbatim) →
   invitation-send action riding sendCandidateMessage →
   pre-screen review panel → registry (ENGAGE fourth entry, footer
   "twenty-three") → green gate (tsc / vitest / eslint / build).
4. Drive 0ef → deploy → §98 verdicts DRAFTED.
5. NO completion declaration and NO deletion of this file until the
   founder's written confirmation of §98.
