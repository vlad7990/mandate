# NEXT — the Engage arc, slices three and four: the Candidate
# Communication Service (099) and the Engagement Agent #22 (100)

Opened on the founder's word 2026-08-25 (§93 confirmed slice two; the
§89 order stands: 097 #21 ✓ → 098 #24 ✓ → **099–100 comms + #22** →
101 #23). Spec §5 (the service), §9 (#22), §6 (inbound — designed,
gated). **D1–D8 CONFIRMED in writing 2026-08-25. STAGE ONE (099)
built and driven the same night: the migration + atomicity control
run, the service with its 13-branch vitest ladder, Send via Mandate
live — MANDATE'S FIRST CANDIDATE EMAIL sent with the whole record
(provider ref + notification + Art. 14 stamp, the 044 promise kept);
the webhook 307 defect found by curl and fixed (deploys
`mandate-70j9nkm3c`, then `9abc6e8`); teardown exact. §94 verdicts
are DRAFTED — STAGE TWO (100, #22) does NOT start and this file is
not deleted until the founder confirms §94. Founder-hand: wire the
Resend dashboard webhook + RESEND_WEBHOOK_SECRET; both Engage
`.env.local` pairs.**

## The surface, as found — the infrastructure slice is smaller than
## it looked

- **The channel is OPEN.** `lib/email/send.ts` is the one door to
  Resend: honest `EmailResult` (not-configured / refused / network
  distinguished), replyTo support, the provider message id returned,
  `Mandate <noreply@getmandate.io>` — the §89-confirmed slice-one
  sender identity, already the default. The §63 sweep proved the
  channel live; the two-accounts key trap is resolved and the key
  rotated (2026-08-24).
- **THE ART. 14 SEND PATH WAS NEVER WRITTEN — and 099 closes it.**
  Migration 044 built `candidate_notifications` (recipient, template
  + notice versions, provider_message_id, status sent|failed with
  honesty CHECKs) AND the RPCs `record_notification_sent` /
  `record_notification_failed` (idempotency-keyed) AND the
  `guard_subject_notified` GUC trigger — then the 2026-08-13 handoff
  blocked on Resend credentials and the send path was never built.
  The outreach panel has promised "recorded only when Mandate sends
  the notice itself and the provider confirms" since 044. The
  service's step 4 is exactly this machinery, found waiting.
- **compose.ts** stands unmodified (three-block, art14-v1,
  `noticeIdempotencyKey` deterministic per candidate+version).
- **097/098 built the policy substrate ahead of the service:**
  org_comms_policy (allowed_channels excludes linkedin BY CONSTRAINT,
  disclosure, comp, caps columns), the durable person with
  enforceable DNC (RPC-only, founder-only clear, systemic on
  withdrawal/erasure), #21's drafts as the content source. The
  service is LAYER TWO of the 095-precedent two-layer check — layer
  one (the drafting clamp) shipped in 097.
- **088's caps-as-data pattern** exists (`check_rate_limit`, policy
  table, honest refusals) — but candidate-send caps derive better
  from THE RECORD: counting provider-carrying `candidate_outreach`
  rows in-window against org_comms_policy is a counter that cannot
  drift (the §42 family: a stored counter is a lie waiting to
  happen). No new counter table.
- **No mission system exists** (Scout deferred out of 097, D8) —
  so the service's autonomy step refuses EVERY agent actor by
  construction: policy as architecture, no gate to misconfigure.
- **Reply routing cannot be honest yet**: the spec's
  `reply+<thread_key>@getmandate.io` threading assumes an inbound
  route; getmandate.io has NO inbound MX. A reply-to that bounces
  candidate replies is worse than none. (D8f.)
- **Baseline verified live:** 23 users / 22 agents / 68 events / 1
  network_profile / 1 org_comms_policy / 0 outreach rows / 0
  strategies / CHECK at 68, allowlist TWENTY-SEVEN.

## D1–D8 — drafted, for the founder to confirm

- **D1 — TWO migrations, TWO stages, ONE new principal.** 099 is
  DETERMINISTIC INFRASTRUCTURE ONLY — the service is not an agent
  (spec §0/§5), makes no model call, and mints NO principal and NO
  agent vocabulary: the first pure-infrastructure slice since the
  programme began. #22 (the TWENTY-THIRD principal) arrives in 100,
  riding the service 099 proved. Each stage runs its own harness +
  control + drive; 100 does not start until 099's drive lands.
- **D2 — 099: the Candidate Communication Service**
  (`src/lib/comms/send-candidate-message.ts` + provider adapter
  `resend-provider.ts` over send.ts). `sendCandidateMessage({
  candidateId, projectId, channel, subject, recruiterBody, actor,
  idempotencyKey })` walks the spec-§5 ladder IN ORDER, every branch
  a named refusal: (1) identity/scope resolve and agree; (2) channel
  ∈ org's allowed set — 'email' is the only sendable channel in this
  slice, linkedin unsendable by 097's constraint; (3) DNC /
  suppression — profile.dnc, an open erasure request, a withdrawn
  candidate row, or the address on `email_suppressions`; (4) Art. 14
  — for sourced-due/overdue the body is built through compose.ts
  (the SERVICE composes; callers pass recruiter text only), the
  discharge stamped through 044's RPCs on provider confirm — never
  re-derived, never optional; (5) autonomy — actor kind 'agent'
  REFUSED verbatim (no mission system exists; agent sends arrive
  with Scout); (6) caps — org daily and per-candidate weekly derived
  from the record vs org_comms_policy (NULL caps = uncapped, the
  097 defaults); (7) idempotency — the key recorded on the outreach
  row BEFORE the provider call, a duplicate invocation returning the
  original result; (8) the adapter sends; (9) THE RECORD — one new
  SECURITY DEFINER RPC `record_candidate_send` writes the
  candidate_outreach row (provider columns + thread_key +
  sent_by_principal false + includes_privacy_notice truthful), the
  candidate_notifications row, and the Art. 14 stamp as ONE
  statement family (the 043 two-writes-that-must-not-come-apart
  doctrine, extended to three).
- **D3 — Migration 099**: `candidate_outreach` extensions per spec
  §5.1, ALL nullable — manual logs stay valid, the mailto flow keeps
  working untouched (mission_id, thread_key, provider,
  provider_message_id, delivery_status CHECK queued|sent|delivered|
  bounced|complained|failed, sent_by_principal boolean default
  false, idempotency_key UNIQUE where present); `email_suppressions`
  (org-scoped, lowercased address UNIQUE per org, reason
  bounce|complaint|manual, role S + founder/ops-hand INSERT, NO
  agent face); the delivery webhook route
  (`/api/webhooks/resend`, svix signature verified, updates
  delivery_status by provider_message_id and inserts suppressions on
  bounce/complaint — ships verified-but-dormant until the founder
  wires the Resend dashboard, D8c); `record_candidate_send` RPC.
  NO vocabulary change in 099 — the send is a HUMAN act and the
  outreach row is its record.
- **D4 — 100: #22, the Candidate Engagement Agent** (the
  twenty-third principal, kind `engagement`, `AGENT_ENGAGEMENT_*`,
  own switch — TWENTY-THREE independent). One judgment (spec §9):
  manage the conversation within policy — at the shipped autonomy
  ceiling that means MAINTAIN the engagement lane and DRAFT the next
  move for the human. `engagement_states` (per candidate+project
  lane; state CHECK awaiting_reply|replied|responding|
  timing_follow_up|declined|interested|escalated|closed;
  escalation_reason; next_follow_up_at; **plus `draft` jsonb — the
  proposed follow-up message, a column the spec does not name
  (D8b): the human approves it and sends through the service**).
  RLS per spec §11: org S; human U; #22 S+I+U with the ESCALATED
  PIN — agent UPDATE refused on an escalated row BOTH faces (it can
  raise an escalation, never touch one; resolution is the human's
  act). Vocabulary: `engagement_updated` (counts only; allowlist
  TWENTY-EIGHT, CHECK 69). The thread view lands in the outreach
  panel (direction + delivery status + sent-by labeled honestly);
  the follow-up proposal renders beside it. D5 sentence: "The
  Candidate Engagement Agent could not run — an operator has
  suspended it or its credentials are absent. The conversation
  record is untouched. Try again when it is restored."
- **D5 — Refusals are the service's product.** Every ladder branch
  returns a named, honest sentence (suppressed-with-reason, cap-hit
  with the cap named, channel-not-allowed, agent-actor-refused,
  provider-refused passing send.ts's honesty through). vitest
  contracts cover EVERY branch with an injected provider; the
  invariants harnesses carry: 099 — the RPC's three-writes atomicity,
  idempotency collision returning the original, suppression
  insert/read pins, extension columns untouchable by agents
  (candidate_outreach still has NO agent write), CONTROL RUN =
  `record_candidate_send` rebuilt with the notification+stamp half
  dropped ("the outreach row already says the notice went") — a
  notice-carrying send that stamps nothing must abort the harness;
  100 — #22's pins with CONTROL RUN = the escalated-row conjunct
  dropped → the agent resolves its own escalation → abort.
- **D6 — Skills and the two-layer completion.** #22's judgment rides
  its session with project-scoped skills (a lane IS a mandate). The
  service re-checks disclosure/compensation policy on the OUTGOING
  BODY deterministically (the same strategy-policy.ts validator,
  reused — a draft edited by hand after approval cannot smuggle the
  client's name past the send either). 095's two-layer precedent
  completes: draft-time clamp (097) + send-time clamp (099).
- **D7 — Removability.** The service is additive: mailto + manual
  log remain untouched and remain the fallback; dropping the
  extensions, the suppressions table, the RPC and the route restores
  098's surface; 100's principal and table drop independently of
  099.
- **D8 — Scope decisions (RECOMMENDED, for the founder to confirm):**
  (a) 099 ships FIRST and is complete alone — human "Send via
  Mandate" live end-to-end on approved strategies, the Art. 14
  discharge finally provider-confirmed (the 044 promise kept);
  (b) the follow-up draft lives on `engagement_states.draft` — a
  named deviation from the spec's column list;
  (c) the delivery webhook ships in 099 with signature verification,
  the founder wires the Resend dashboard endpoint (founder-hand,
  like the DNS);
  (d) send caps derive from the record — no counter table;
  (e) agent-actor sends refused by construction until Scout lands
  missions (Level 2 exists in architecture, nothing can select it);
  (f) **replyTo is the SENDING RECRUITER's real address in 099** —
  the spec's `reply+<thread_key>@` threading needs an inbound route
  that does not exist, and a bouncing reply-to is dishonest;
  thread_key is still minted on every send so the routing is ready
  the day the inbound gate opens; INBOUND STAYS DESIGNED-NOT-BUILT
  (spec §6) behind its own future gate — no MX, no webhook-mailbox,
  no classification judgment in this pair.

## The ladder (after written confirmation, in order)

1. **Stage one (099):** migration (MCP + numbered file) → invariants
   harness + atomicity control run → the service + adapter + policy
   reuse + "Send via Mandate" on the approved-strategy panel →
   vitest ladder contracts → green gate → live drive 0ed (a real
   provider send to a founder-controlled test address: notice
   composed + discharge stamped + provider ref on the row; every
   refusal branch driven; suppressed person refused with the reason)
   → deploy → §94 verdicts drafted.
2. **Stage two (100):** #22 provisioning + migration + harness +
   escalated-pin control → seam + thread view + proposal card →
   green gate → drive 0ee → deploy → §95 verdicts drafted.
3. NO completion declaration and NO deletion of this file until the
   founder's written confirmation of each stage's verdicts.
