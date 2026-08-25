# THE INTERVIEWER programme — CLIENT INTERVIEW slice — Phase 0 + THE SLICE GATE — 2026-08-25 — DRAFT

**Status: DRAFT. Nothing here is confirmed. Build waits on the
founder's written word against THIS document (the standing law; the
§125 precedent). This gate authorises ONE slice: the client
interview (the programme gate's D4, direction recorded §125). The
candidate prep pack (D3) stays recorded and deliberately skipped;
the Interview Simulator (D5) is ruled LAST, gates separately, and is
NOT opened by anything in this document.**

Direction being gated, from the programme gate's D4: the Interviewer
composes a structured question set for the CLIENT from what the
mandate already knows and — more to the point — what it provably
lacks (the calibration gaps, the missing-info residue from intake).
Delivery over the HM portal token path; answers land as feedback
events and feed the existing Feedback Interpreter, not a new
interpretation pipeline.

---

## Part 1 — What Phase 0 found, in code (all live reads 2026-08-25)

### The gaps the questions come from are already computed and rendered

`analyzeRole` (src/lib/ai/role-analysis.ts) writes
`calibration_model.missing_information: string[]` onto the project —
deliberately conservative ("only flag truly critical gaps:
compensation range, geography, team size, reporting line, mandate
timeline"). The desk already reads it: the **"Information required"
rail** on /app/projects/[id] (project-view.tsx, `vm.missingInformation`
from `calibration.missing_information`). Beside it,
`calibration_model.dimension_weights` carries the five scoring
dimensions (`DIMENSION_KEYS`, onboarding-analysis.ts) — slice one
already computes coverage against them server-side. "What the
mandate provably lacks" is therefore a SERVER-computable list, not
an agent's opinion: the missing-info residue verbatim, plus any
dimension whose calibration confidence is weak. Nothing new needs
inventing to know what to ask.

### The delivery channel is live, labelled, expiring, revocable

The HM portal token path is exactly the contract the direction
names: `hiring_manager_tokens` (023; 054 added nullable
`contact_id`), minted by `generateHmTokenAction`
(hiring-manager/actions.ts — 30-day default expiry, label derived
from the CRM contact when one is named so form and record cannot
disagree), revoked forever by `revokeHmTokenAction`. The sessionless
page (src/app/hm/[token]/page.tsx) verifies via the SECURITY DEFINER
`verify_hm_token` RPC, records the visit through the debounced
definer `record_hm_portal_opened` (063), then renders `PortalContent`
with service-role reads scoped to the token's project. The same
`PortalContent` serves the founder's signed-in preview and the
/portal external door — one component, three audiences.

### The answer landing is live, agent-interpreted, and fails soft

`persistHmSubmission` (src/lib/hm-portal/submit.ts) is the shared
pipeline behind both submission doors: it writes the structured
`hiring_manager_reviews` row (stamped with the body's label or the
token's issuance label — the §128 F-4 fallback) and mirrors rated
candidates into `feedback`. `runHmFeedbackPipeline` then runs in
after() AS the Feedback Interpreter principal — skills injection
under the agent's own session, recalibration when flagged,
`feedback_interpreted` on the trail with the review named in detail
— and if the agent is suspended or credential-less the
interpretation is SKIPPED with the review intact. The rate limit
fails CLOSED on this door (088: `hm_submit_token` + `hm_submit_ip`),
because a submission triggers a paid interpreter run.

### The seam: feedback is candidate-shaped today, but not by law

Client-interview answers are MANDATE-level, not per-candidate. Live
read: `feedback.candidate_id` is NULLABLE, and `interpretFeedback`
already accepts `candidate: null` — a mandate-level feedback row is
lawful end to end. Two vocabulary facts, though: the DB CHECK (025)
admits exactly `recruiter_note | hiring_manager | interview_outcome
| hm_portal`, and the client-safe TS union `FEEDBACK_TYPES`
(feedback-analysis.ts) lists only the first three — `hm_portal`
rides through as a cast. A new answer kind must widen the CHECK (a
migration) and decide its TS standing.

### The composer exists; its reads exist; the copyable shape exists

The Interviewer is the twenty-fifth principal (live: 25 agent rows,
Interviewer present; `signInInterviewer()` in
src/lib/agents/session.ts:438, env pair `AGENT_INTERVIEWER_*` in
prod only — .env.local is founder-fenced). Its reads on projects,
job_specs, candidates, skills are the 111 `is_agent()` policies —
`calibration_model` (weights AND missing_information) is already on
its lawful shelf; slice one's pipeline reads it today. Migration 116
is the copyable table shape (versioning, draft→approved→archived,
dedicated transition flag, atomic allocation RPC, agent pair
double-pinned to drafts, §129 `{count:"exact"}` in the pipeline),
and supabase/tests/agent_interviewer_invariants.sql is the harness
precedent (forged agents anchored CROSS-ORG, trail counts read as
OWNER, rolled back).

### What does not exist

No table holds a client question set. Nothing on the portal renders
one. No event type names one. The intent door is 17, the activity
CHECK 83, the agent allowlist 29 (ruled — reuse with
`detail.agent_kind` before minting), the anon grant roster TWELVE
(ruled §136 — no thirteenth). `client_contacts` is 0 live — the
label fallback carries until the CRM fills.

---

## Part 2 — THE SLICE GATE (drafted, awaiting the founder's word)

### D1 — The artifact: `client_interviews`, keyed by the MANDATE

A new table on 116's pattern, keyed `(project_id, version)` — no
candidate axis; this is the mandate interviewing its own client.
`content_json` holds the question set: per question the text, why it
is asked, and PROVENANCE — which missing-info item or weak dimension
it addresses. Columns/guards copied from 116: status
draft→approved→archived, `is_generating` / `generation_error`,
prompt/model versions, org RLS, the agent pair double-pinned to
`status='draft'` on both faces, immutability trigger
`guard_client_interviews` on a DEDICATED flag
`mandate.allow_client_interview_transition` (never sharing 116's or
037's), RPC pair `allocate_and_insert_client_interview` (the lock is
the PROJECT row FOR UPDATE — there is no candidate to lock) and
`approve_client_interview` (approve + archive the previous → at most
one approved set per project, partial unique index).

**Recommend: as stated. The 037/116 pattern copied a third time,
never shared; EI and slice one untouched.**

### D2 — Provenance is server-enforced: the agent proposes, the app reports

The gap list (missing_information verbatim + weak dimensions) is
computed SERVER-side and passed INTO the prompt; on return, every
question's cited gap is checked against that list — questions citing
gaps the mandate does not have are STRIPPED, and gap coverage
(which gaps got questions, which got none) is computed
authoritatively by the app, exactly slice one's
`computeDimensionCoverage` doctrine. The Interviewer can phrase; it
cannot invent what the mandate lacks. R1 lives in the prompt AND the
strip: no verdicts, no protected characteristics, questions about
the ROLE and the SEARCH, never about named candidates' worth.

**Recommend: as stated.**

### D3 — Delivery: approval gates the portal; nothing is ever auto-sent

Drafts render ONLY on the desk (labelled; sample content per the
standing memory rules). A human approves via
`approve_client_interview` — and only an APPROVED set renders on the
HM portal, as a new section of `PortalContent` beside the slate
review, so it reaches all three audiences (token door, founder
preview, /portal) from one component. The LINK moves exactly as it
does today — a human copies/sends it; no new outbound path, no
email, nothing rides comms in this slice, so caps and DNC are not
even reachable from this code. R2 is satisfied structurally:
approval is the human gate, and the send never left human hands.

**Recommend: as stated — portal rendering follows approval;
outbound-by-email (if ever) is a later slice through the comms
programme's approved-send precedent (0ed/0ee).**

### D4 — Answers: one new token door, landing as ONE feedback event

A new route `/hm/[token]/api/interview-answers` mirroring the
existing submit door: uuid-shape check, rate limit FAILS CLOSED
before verification (two new 088 buckets as data:
`client_interview_token` + `client_interview_ip` — a paid
interpreter run hangs off this door too), `verify_hm_token`, parse,
persist. The submission lands as ONE mandate-level `feedback` row —
`candidate_id NULL`, content composing the questions and the
client's answers with the HM label (the issuance-label fallback kept,
§128 F-4) — under a NEW `feedback_type = 'client_interview'`:
the CHECK widens 4 → 5 (a migration), the desk's feedback page can
say "the client answered the mandate's questions" rather than
disguising it as a slate review. Then the EXISTING pipeline runs
unchanged: after() → Feedback Interpreter under its own session →
interpretation, recalibration when flagged, `feedback_interpreted`
on the trail. No new interpretation machinery — the direction's own
line. The approved set is immutable (D1), so answers live in
feedback ONLY; the desk panel joins them to the set by id in
`detail`/content, never by editing the approved row.

**Recommend: as stated, including the new feedback_type — a new
VALUE is not a new PIPELINE. Alternative (reuse 'hm_portal') is
cheaper by one CHECK migration but permanently blinds the desk to
which door the words came through; not recommended.**

### D5 — The trail: door 17 → 20, CHECK 83 → 87, allowlist STAYS 29

- Three new human intents through the door (mandate-writer acts,
  exactly 116's block): `client_interview_generation_requested`,
  `client_interview_generation_failed` (090: failure bookkeeping is
  HUMAN — the requester's read-only client marks it, never the
  agent), `client_interview_approved`.
- One sessionless event: `client_interview_answered`, written by a
  new SECURITY DEFINER function on 063's `record_hm_portal_opened`
  shape, EXECUTE to service_role ONLY — the route holds the
  service-role client, so the anon roster stays at its ruled TWELVE.
  Recorded at the door, so the client's act is history even when the
  interpreter is suspended and interpretation is honestly skipped.
- The Interviewer's own act REUSES `interview_plan_generated` with
  `detail.agent_kind='interviewer'` + `detail.plan_scope='client_interview'`
  — the allowlist stays at its ruled TWENTY-NINE; no new agent type
  is minted.

**Recommend: as stated.**

### D6 — The pipeline and the desk

`generate-client-interview.ts` on slice one's exact shape:
`signInInterviewer()` (suspension answered in-run; no service-role
fallback), gap list computed before the call, `{count:"exact"}` +
zero-row refusal on every agent write (§129 — the law travels),
skills injection via `applySkillsToPrompt`, failure marked by the
requester per 090. Desk UI: a **"Client interview"** panel on
/app/projects/[id] beside the "Information required" rail it feeds
from — compose (disabled with the honest sentence when there is no
calibration yet, slice one's precedent), draft view labelled
illustrative until real, approve button, answered state once
feedback lands. Portal UI: the approved set + answer form as a
`PortalContent` section. Terminal visual language throughout; sample
content on every new surface, labelled.

**Recommend: as stated.**

### D7 — The ladder on confirmation (this slice only, mirroring §143)

Phase-0-verified **migration 117** (file + MCP apply:
`client_interviews` + guard + RPC pair + agent pins + feedback CHECK
4 → 5 + activity CHECK 83 → 87 + door 17 → 20 + the definer answer
function) · pipeline + routes + desk panel + portal section with
labelled sample content · invariant harness
`agent_client_interview_invariants.sql` green and ROLLED BACK (the
116 negatives re-proven: immutability, RPC-only approval, flag
containment, project-lock refusal of a foreign project, agent pins
incl. suspended-reads-zero, the door refusing a viewer's forged
intent, the answer function refusing anon) · green gate (tsc /
vitest 976+new / eslint / build) · commit · deploy (`vercel --prod
--yes` — git push does not deploy) · **drive 103** with scratch
principals, teardown by value (traps standing: member-audit swept by
NAME; public.users before auth.users; fresh-statement counts;
sign_in_ip buckets from browser sign-ins; the browser autofills the
real founder's credentials — always overwrite; clearCookies to sign
out; dialogs via page.on handler with effects verified in DB) ·
**§144 DRAFTED, no completion declared** · memory updated
(next-build-priority-deferred.md + MEMORY.md line).

---

## Part 3 — Named rulings, restated for this slice

- **R1 — no verdicts.** Questions interrogate the MANDATE's gaps —
  compensation, geography, team, reporting line, timeline,
  dimension emphasis — never a candidate's worth, never protected
  characteristics. Enforced in prompt AND by the server-side strip
  (D2).
- **R2 — nothing outbound without a human.** Approval gates portal
  rendering; the link is sent by human hand exactly as today; no
  email path exists in this slice at all.
- **R3 — agents hold no goals.** The Interviewer composes when a
  mandate-writer asks; kill switch answers in-run; suspension reads
  zero rows.
- **R4 — one slice per gate.** This document authorises the client
  interview ONLY. The candidate prep pack stays recorded-and-skipped;
  the SIMULATOR (programme D5) is ruled LAST and remains closed —
  nothing here touches or prepares it.

Numbers at drafting (live-verified 2026-08-25 where DB-side): next
migration 117, next § 144, next drive 103; vitest 976; activity
CHECK 83; intent door 17; agent allowlist 29 (ruled); anon grant
roster 12 (ruled); durable baseline 26 users / 25 agents (Interviewer
present, live) / 77 events / 5 skills / 5 skill_versions / 1
network_profile / 1 org_comms_policy / 2 projects / 2 clients / 1
candidate / 1 job_spec / 0 tasks / 0 objectives / ops_heartbeats 1 /
interview_plans 0 (live) / auth 26 / orgs 1 / staff_invitations 0 /
rate_limit 0; portal extras live: hiring_manager_tokens 3,
hiring_manager_reviews 4, feedback 3, client_contacts 0;
feedback.candidate_id NULLABLE (live); feedback_type CHECK = 4
values (025, live-consistent).
