# Mandate Scout — Autonomous Candidate Search & Outreach: design spec

Status: **APPROVED by the founder 2026-08-24 (written, §89) — with the
spec's defaults confirmed: org autonomy cap default Level 1, deploy-time
ceiling ≤2 until §12 counsel clears, human approval of every outreach
strategy at every level, noreply sender identity for slice one, counsel
questions raised when #22 nears. Implementation order 21 → 24 → 22 → 23.
Nothing is built yet; each slice runs the proven ladder with its own
D1–D8 confirmation.**
Date: 2026-08-24. Grounded in the repository at `b852a94` (twenty
principals live, §85; terminal re-skin §86–87; agent registry §88).

Mission (confirmed): *produce a configured target number of
recruiter-ready candidates for a mandate through permitted discovery,
research, evaluation, outreach, engagement and pre-screen work, while
respecting autonomy levels, policy, and human gates.*

---

## 0. The standing doctrine this spec preserves

1. **Agents never call agents.** Application orchestration invokes
   bounded principals; deterministic services execute.
2. **Each principal has its own identity, credential, kill switch,
   and RLS reach** — the twenty precedents (§30–§85) are the ladder
   every new principal climbs: migration + invariants harness with a
   control run, seam, green gate, live drive, verdicts.
3. **Editorial and consequential acts stay human**, pinned in the
   database (the is_final / submitted_at / status='draft' /
   actor-pin family), not in prompts.
4. **Failure bookkeeping stays human** (090): a refused agent has no
   session to sign with.
5. **The trail records counts and state, never content.**
6. **No LinkedIn automation** — `source-policy.ts` is the compliance
   boundary and is not relitigated here.

Scout is NOT a principal. Scout is a product-level mission
controller: workflow state + application orchestration + a customer
surface. No new master identity exists anywhere in this design.

---

## 1. What actually exists (the inspection)

The proposal that prompted this spec assumed several artifacts that
do not exist ("Evidence Ledger", a general "Success Profile",
abstract "Art.14 state"). The real substrate is stronger than
assumed, just differently shaped:

**Reused unchanged (already built and proven):**

- **`candidate_outreach` (043)** — the contact record. Channel
  (email/linkedin/phone/referral/other), **direction
  outbound|inbound** (replies already live in this table),
  subject/body, `includes_privacy_notice`, `occurred_at`,
  `created_by`. The Art.14 duty is discharged only by the RPC, only
  as a side effect of a logged outbound that carried the notice —
  never by a checkbox.
- **The Art.14 layer** — `lib/candidates/notification.ts` (pure
  30-day clock: not_required / notified / due / overdue, scoped to
  `source_kind = 'sourced'`) and `lib/outreach/compose.ts` (the
  three-block compose: recruiter text + system-controlled versioned
  notice + footer; the recruiter cannot edit the notice out).
- **`lib/email/send.ts`** — "the one door to Resend": honest
  `EmailResult`, replyTo support, not-configured vs refused vs
  network distinguished. Today it serves invitations, waitlist, and
  the digest sweep — candidate email has never gone through it
  (candidate outreach is mailto-draft + manual log today).
- **The discovery chain** — sourcing runs (draft → executed →
  promoted, transactional RPCs, import provenance), the Boolean
  Search Agent, the Candidate Search Agent's two judgments (pool
  ranking live; sourcing search seam-bound behind
  `runSourcingSearchAsAgent`, refusing without the principal).
- **The evaluation chain** — CV parse / evaluation / research /
  positioning / psychology artifacts as keys of
  `candidates.cv_structured`, written through the atomic
  `update_cv_structured_field` RPC; `candidate_scores` + tiers.
- **The Talent Network** — `lib/network/network-aggregator.ts`
  collapses project-scoped candidate rows into people via
  `identityKey` (email > linkedin_url > name|company). A "person"
  is currently **computed, not stored** — this matters for #24.
- **Privacy machinery** — candidate portal tokens,
  `candidate_erasure_requests` (073), `candidate_withdrew` /
  `candidate_erasure_requested` events, the /ops erasure queue.
- **Governance rails** — `record_agent_event` (25-type allowlist),
  per-principal kill switches, `/app/agents` registry with live
  status, rate limiting as data (088), the scheduled channel
  (`/api/cron/maintenance` under CRON_SECRET), Skills injection
  riding every principal's session.
- **The recruiter approval surface pattern** — outreach panel,
  confirm dialogs, the HM share flow.

**Missing (genuinely new architecture, itemized in §3–§9):**
durable person-level relationship state; enforceable DNC;
provider-tracked candidate sends; inbound anything; autonomy
policy; mission/workflow state; the four Engage artifacts.

---

## 2. Taxonomy (adopted)

UNDERSTAND (Intake, Company Intelligence, Culture, Calibration,
Role Spec) · DISCOVER (Boolean Search, Candidate Search, Candidate
Research) · EVALUATE (CV Parsing, Evaluation, Ranking,
Triangulation, Psychology, Executive Intelligence) · **ENGAGE
(#21 Outreach Strategy, #24 Candidate Relationship, #22 Candidate
Engagement, #23 Pre-Screen — this spec)** · DELIVER (Positioning,
Shortlist, Search Health, Desk Digest) · ASSIST (Feedback
Interpreter, Copilot).

The Agents page regroups to this taxonomy now (documentation-level,
sanctioned); the ENGAGE chapter appears only when its first
principal ships.

---

## 3. Autonomy levels (enforced, not displayed)

Per mission, an integer 0–4, clamped by an organization cap:

| Level | Name | What runs without a human |
|---|---|---|
| 0 | Assist | Nothing. Every step is a recommendation. |
| 1 | Discover | Sourcing runs, research, evaluation. Outreach requires human approval per candidate. |
| 2 | Outreach | + policy-approved **initial** outbound via the comms service. Replies go to humans. |
| 3 | Engage | + follow-ups and policy-permitted replies by #22. Pre-screen requires human initiation. |
| 4 | Full Search | + #23 pre-screen conversations; humans receive recruiter-ready state. |

**Enforcement points (application/data, never UI):**

- `organizations.max_autonomy_level int NOT NULL DEFAULT 1` — the
  org cap, set by org admins; founder can cap platform-wide.
- `scout_missions.autonomy_level` CHECK 0–4; the orchestrator
  refuses to schedule an action above the mission level; **the
  Candidate Communication Service re-checks independently** (defense
  in depth, the 095 two-layer precedent): an agent-actor send with
  mission level < 2 is refused at the service; an agent reply with
  level < 3 refused; a pre-screen turn with level < 4 refused.
- Invariants harness proves each refusal at the service seam.

Level 4 DOES NOT SHIP until the counsel questions in §12 are
answered — it exists in the schema so policy is architecture from
day one, with a hard application gate (`SCOUT_MAX_SHIPPED_LEVEL`,
a deploy-time constant) capping what any org can select.

---

## 4. Scout mission and state architecture

### 4.1 `scout_missions` (new table)

```
id, organization_id, project_id (one ACTIVE mission per project —
partial unique index on status IN ('active','paused','blocked')),
objective_target int CHECK (1..50),      -- recruiter-ready count
autonomy_level int CHECK (0..4),
status text CHECK (draft|active|paused|blocked|achieved|
                   exhausted|cancelled),
status_reason text,                       -- honest, human-readable
created_by uuid → users (human),
started_at, paused_at, completed_at, updated_at
```

**Funnel counts are DERIVED, never stored.** Discovered = sourcing
results + promoted candidates; researched/evaluated = presence of
the cv_structured keys; contact-eligible = evaluation present AND
no DNC AND channel available; contacted / responded =
`candidate_outreach` by direction; interested / pre-screened = §8–§9
artifacts; recruiter-ready = pre-screen complete with interest ≥
stated. A stored counter is a lie waiting to drift (the §42 family);
a view (`scout_mission_funnel`) computes it.

### 4.2 `scout_actions` (new table — the mission ledger)

```
id, mission_id, organization_id,
action text            -- 'sourcing_run','research','evaluate',
                       -- 'strategy','send','follow_up','prescreen',
                       -- 'health_review','recalibrate'
subject_candidate_id uuid null,
status text CHECK (proposed|awaiting_human|approved|running|
                   done|refused|failed),
idempotency_key text UNIQUE,   -- mission+action+subject+round
detail jsonb,                  -- counts and reasons, never content
decided_by uuid null,          -- the human, when a gate was crossed
created_at, updated_at
```

This is simultaneously: the idempotency guard (an action re-invoked
with the same key is a no-op), the human-gates queue (`status =
'awaiting_human'` IS the "Scout needs you" surface), the audit
trail, and the retry record (failed actions re-propose with a new
round suffix; terminal failure sets mission `blocked` with
`status_reason` — failure bookkeeping stays human-visible, and no
agent writes this table: the ORCHESTRATOR does, server-side, under
the acting human's session or the service role of the cron channel…
**no — per doctrine there is no service-role writing product tables:
scout_actions is written by the application under the cookie session
for human-initiated acts and under the SCHEDULED channel's route for
autonomous ticks, with RLS INSERT policies naming both.** The
scheduled path reuses the CRON_SECRET + Search-Health-principal
precedent: the tick that advances missions runs under a principal
session where a principal acts, and the orchestrator's own
bookkeeping rows are written through a SECURITY DEFINER RPC
(`record_scout_action`) with the same allowlist discipline as
`record_agent_event`.)
```

### 4.3 The mission state machine

```
draft ──activate──▶ active ◀──resume── paused
                     │  │ │
        pause ───────┘  │ └───────── block (unmet gate / failures)
                        │
   objective met ───────▶ achieved
   market exhausted ────▶ exhausted
   human cancel ────────▶ cancelled          (terminal states final)
```

- **Completion:** derived recruiter-ready count ≥ objective_target.
- **Market exhaustion:** all sourcing strategies executed, Search
  Health reports no viable aperture expansion, zero contact-eligible
  candidates remain un-actioned. Declared by the orchestrator with
  the Search Health artifact as evidence, `status_reason` naming it.
- **Pause/cancel:** human acts on the mission card. Pausing stops
  scheduling new actions; in-flight sends complete (a half-sent
  email cannot be unsent — honesty over tidiness). Cancel is
  terminal; relationship data (#24) SURVIVES the mission.
- **Kill behavior:** every principal's /ops switch works unchanged;
  a suspended principal fails its action, the orchestrator marks it
  `failed` with the D5 reason, and the mission goes `blocked` rather
  than silently thinning.

### 4.4 The orchestrator

A deterministic module (`src/lib/scout/orchestrator.ts`) with one
entry: `advanceMission(missionId)`, invoked from (a) human acts on
the mission surface, (b) the scheduled tick (cron channel), (c)
artifact-landing hooks (e.g. an inbound reply). It:

1. reads mission + derived funnel + open actions;
2. computes the ONE next permitted action per candidate-lane from
   the state table (below), autonomy level, and policy;
3. records it in `scout_actions` (proposed / awaiting_human /
   running per level);
4. invokes the bounded principal or deterministic service;
5. validates and persists the artifact (the principal's own seam
   already does this — the orchestrator never writes artifacts);
6. re-derives state.

No agent is invoked by another agent, ever. The next-action table:

| Candidate lane state | Next action | Gate at level |
|---|---|---|
| discovered, unresearched | research (#7) | auto ≥1 |
| researched, unevaluated | evaluate (#3) | auto ≥1 |
| evaluated, no strategy | outreach strategy (#21) | auto ≥1 (composing is never contact) |
| strategy drafted | approve strategy | HUMAN at ≤1; auto-approve policy possible ≥2 only if org enables it — default HUMAN at every level |
| approved, not contacted | send (comms service) | auto ≥2, else HUMAN |
| contacted, no reply, cadence due | follow-up (#22) | auto ≥3, else HUMAN |
| replied | classify + respond (#22) | auto ≥3 within policy, else HUMAN |
| interested, unknowns open | pre-screen (#23) | auto ≥4, else HUMAN |
| pre-screen complete | recruiter review | HUMAN always |

The under-yield loop reuses existing principals exactly as the
proposal hoped: Scout under target → orchestrator invokes **Search
Health** (aperture diagnosis) → **Boolean Search** (new strategy) →
human strategy gate where required → sourcing run. Client feedback →
**Feedback Interpreter** → calibration shift → orchestrator
re-evaluates un-contacted lanes. All existing seams, unmodified.

---

## 5. The Candidate Communication Service (deterministic, new)

`src/lib/comms/` — the ONLY path by which any candidate message
leaves Mandate. Not an agent. Not coupled to Resend.

```
sendCandidateMessage({
  candidateId, projectId, missionId?, channel,
  subject, recruiterBody | strategyDraftId,
  actor: { kind: 'human', userId } | { kind: 'agent', principal },
  idempotencyKey
}) → { sent, outreachId, providerRef } | { refused, reason }
```

**The policy ladder, in order, all server-side:**

1. **Identity & scope** — candidate, project, org resolve and agree.
2. **Channel policy** — channel ∈ org's allowed set
   (`org_comms_policy`, §5.2). `linkedin` is loggable (a human did
   it) but NEVER sendable — the send service has no LinkedIn
   provider by design and never will (source-policy doctrine).
3. **DNC / suppression** — refuse if the person's relationship
   record (§7) is `do_not_contact`, if an open erasure request
   exists, if the candidate withdrew, or if the address is on the
   bounce-suppression list.
4. **Privacy (Art.14)** — for `source_kind='sourced'` and status
   due/overdue, the body MUST be built through `compose.ts` (the
   service composes; callers pass recruiter/strategy text only) so
   the first outbound always carries the versioned notice; the
   existing RPC stamps discharge. Never re-derived, never optional.
5. **Autonomy** — agent actor requires mission level ≥2 (initial)
   or ≥3 (reply/follow-up); human actors pass. Checked HERE even
   though the orchestrator already checked (two independent layers).
6. **Limits** — per-candidate cadence cap and per-org daily caps as
   DATA (the 088 pattern: caps in a table, refusals honest).
7. **Idempotency** — the key is recorded before the provider call;
   a duplicate invocation returns the original result.
8. **Provider adapter** — `Provider = { send(msg): ProviderResult }`.
   `resendProvider` wraps the existing `lib/email/send.ts` with a
   threading reply-to (`reply+<thread_key>@getmandate.io`) and
   passes the provider message id back. Gmail / Microsoft 365 (send
   as the recruiter, OAuth) and ATS/CRM connectors are FUTURE
   adapters behind this interface — named, not built; nothing in
   the service may assume Resend beyond the adapter file.
9. **The record** — one `candidate_outreach` row (direction
   outbound, includes_privacy_notice truthful, plus new nullable
   columns §5.1), the Art.14 stamp via the existing RPC, one
   activity event with counts.

### 5.1 `candidate_outreach` extensions (nullable — manual logs stay valid)

```
mission_id uuid null,
thread_key text null,            -- ours; stable per (candidate, mission)
provider text null,              -- 'resend' | future
provider_message_id text null,
delivery_status text null CHECK (queued|sent|delivered|bounced|
                                 complained|failed),
sent_by_principal boolean not null default false
```

A bounce/complaint webhook updates delivery_status and inserts into
the suppression list. The recruiter's manual mailto flow keeps
working untouched — it simply never fills the provider columns.

### 5.2 `org_comms_policy` (new, one row per org)

```
organization_id pk, allowed_channels text[] default '{email}',
daily_send_cap int, per_candidate_weekly_cap int,
client_identity_disclosure text CHECK (never|after_approval|
                                       after_nda|open) default
                                       'after_approval',
compensation_discussion text CHECK (human_only|range_allowed)
                              default 'human_only',
auto_approve_strategies boolean default false
```

---

## 6. Inbound candidate communication (designed, NOT implemented)

The future path, each stage named with its real gap:

```
provider webhook (Resend inbound / Gmail watch / M365 subscription)
  → signature verification (per-provider secret; reject unsigned)
  → raw persistence: `inbound_messages` (new; org-resolvable by
    receiving address, raw payload, provider refs, received_at) —
    persist FIRST, classify later; a parse bug must never lose mail
  → identity resolution: thread_key from the reply+ address →
    (candidate, mission); fallback from-address vs candidates.email
    then network identityKey; ambiguity = human queue, NEVER a guess
  → mandate association (the thread's project)
  → deterministic privacy screens FIRST (no model): unsubscribe /
    "remove me" / erasure phrasing → DNC set on the relationship
    record + erasure workflow + STOP; attachment/bounce handling
  → classification (#22's judgment, level-gated): interested /
    timing / question / decline / escalation-class
  → policy decision (orchestrator): respond (≥3, within policy) or
    `awaiting_human` with the classified reason
  → the reply lands as candidate_outreach direction='inbound'
    (the table was built for this in 043)
```

**Infrastructure gaps, honestly:** no receiving domain/MX or inbound
route exists; no webhook endpoints; no signature verification; no
`inbound_messages` table; no thread_key; no suppression list; no
ambiguity queue. This is the single largest infrastructure item in
the arc and it belongs to slice #22, not before.

---

## 7. #24 Candidate Relationship Agent — durable institutional memory

**The gap:** the Talent Network computes people at read time;
nothing durable survives about a relationship. The design makes the
person REAL without duplicating the candidate system:

### 7.1 `network_profiles` (new)

```
id, organization_id,
identity_key text,               -- THE EXISTING identityKey, verbatim
UNIQUE (organization_id, identity_key),
display_name, primary_email, linkedin_url,
relationship_state text CHECK (cold|contacted|engaged|warm|
                               placed|client_contact|
                               do_not_contact) default 'cold',
dnc boolean not null default false,
dnc_reason text, dnc_set_at, dnc_set_by uuid,   -- human or system
                                                 -- (erasure flow)
disposition jsonb,     -- timing, motivation, location constraints,
                       -- comp context, notice period — STRUCTURED,
                       -- sourced from pre-screens and human notes
follow_up_at date, follow_up_note text,
last_meaningful_contact_at timestamptz,
created_at, updated_at
```

`candidates.network_profile_id uuid null` links each project-scoped
row to its person; a deterministic resolver
(`lib/network/profile-resolver.ts`) finds-or-creates by identity
key at promotion/import/creation time and backfills existing rows in
the migration. The network page keeps aggregating candidates — it
gains the durable overlay instead of being replaced.

**DNC is data here, enforced in the comms service (§5 step 3).**
The erasure workflow sets dnc systemically; a recruiter can set it
by hand; NOTHING un-sets it except a founder-level act with a
recorded reason.

### 7.2 The principal

The twenty-fifth-style ladder, one judgment: **maintain the
relationship record from evidence.** After engagement/pre-screen
events, it reads the thread + artifacts and merge-writes ONLY
`disposition`, `relationship_state` (never into or out of
`do_not_contact` — that transition is human/system-pinned in RLS:
UPDATE WITH CHECK forbids the agent touching dnc columns, the
column-discipline invariant family), `follow_up_at`,
`last_meaningful_contact_at`. Trail event
`relationship_updated` with counts. Referrals, prior mandates,
past opportunities are DERIVED from existing rows (appearances,
outreach, shortlists) — not duplicated into the profile.

---

## 8. #21 Outreach Strategy Agent

One judgment: **decide how this person should be approached, and
draft it.** Zero new infrastructure — the first slice of the arc.

- **Reads (all existing):** project (calibration_model,
  company_context), candidate (cv_structured evidence incl.
  evaluation/research), candidate_outreach history,
  network_profiles (once #24 lands; nullable input before),
  org_comms_policy (disclosure lines), skills (its session).
- **Writes:** `outreach_strategies` (new):

```
id, candidate_id, project_id, organization_id, mission_id null,
content jsonb {angle, career_hook, may_disclose[], must_not_disclose[],
               channel, cadence, talking_points[], likely_questions[],
               draft_subject, draft_body},
status text CHECK (draft|approved|declined|superseded) default 'draft',
version int, created_by uuid (the principal),
approved_by uuid null, approved_at timestamptz null
```

- **Pins (the proven family):** agent INSERT + SELECT; agent UPDATE
  double-pinned `status='draft'` both faces — approval/decline is
  the recruiter's act forever; `approved_by` writable only by the
  human policy. The disclosure lists are constrained by
  org_comms_policy at compose time AND re-checked by the comms
  service (a draft cannot smuggle the client's name past a
  `after_nda` policy — the service strips/refuses).
- **UI:** the strategy renders in the existing outreach panel as
  the draft source; approve/edit/decline; on approve at level ≤1 the
  human sends (today's flow, notice auto-composed); at ≥2 the
  orchestrator queues the send.
- Trail: `outreach_strategy_drafted`, counts only.

## 9. #22 Candidate Engagement Agent and #23 Pre-Screen Agent

**#22 — one judgment: manage the conversation within policy until
an escalation condition or a terminal disposition.** Reads the
thread (candidate_outreach by thread_key), the approved strategy,
the relationship record, policy; classifies inbound (§6), drafts
replies/follow-ups THROUGH the comms service (level-gated), writes
`engagement_states` (new: per candidate+mission — state CHECK
awaiting_reply|replied|responding|timing_follow_up|declined|
interested|escalated|closed, escalation_reason, next_follow_up_at).
It NEVER: discloses beyond policy (service-enforced), negotiates,
discusses compensation beyond org policy, continues past DNC
(service refuses before it can), or marks its own escalations
resolved (human act).

**#23 — one judgment: resolve the named unknowns, capture evidence
and interest.** Input: the evidence-coverage gap computed from
cv_structured + calibration dimensions (what is Strong / Partial /
Unknown — computed by a pure function, not a new artifact).
Conversation rides the SAME comms service and thread. Writes
`prescreens` (new):

```
id, candidate_id, project_id, mission_id, organization_id,
status CHECK (proposed|invited|in_progress|complete|abandoned|
              escalated),
transcript jsonb,                      -- the turns, verbatim
professional_evidence jsonb,           -- per dimension:
                                       -- {value, status: validated|
                                       --  partial|unknown, source}
interest_profile jsonb,                -- interest, motivation,
                                       -- timing, location, comp
                                       -- context, notice, constraints,
                                       -- questions[]
completed_at
```

**Two tracks never mix; there is NO verdict field.** No PASS/FAIL,
no score, no percentage — the harness carries an invariant that the
artifact contains no key matching /score|pass|verdict|qualified/i.
Recruiter-ready is a DERIVED state (pre-screen complete AND interest
∈ {strong, open} AND no escalation open), surfaced as evidence +
unknowns, never as a grade. Consequential judgment stays with the
human who opens it. #23 always discloses it is an AI assistant
acting for the named search firm — non-negotiable, in the template,
system-controlled like the Art.14 notice.

---

## 10. Escalation conditions

**Hard application gates** (deterministic, before/instead of any
agent turn; the conversation stops and a human queue item exists):
deletion/objection/unsubscribe (→ privacy workflow + DNC); a request
for a human; identity ambiguity; provider failure/bounce;
negotiation or compensation discussion beyond `range_allowed`;
requests for confidential client information beyond disclosure
policy; discrimination/legal allegation phrasing (deterministic
lexicon first, classifier second — either trips it); send caps hit.

**Agent-recommended escalations** (#22 classifies, human decides
the handling): finalist-level/VIP sensitivity, conflict-of-interest
signals, nuanced timing/counter-offer situations, "policy
uncertainty" (the agent's own low confidence — an honest I-don't-
know lane, never a guess).

Every escalation is a `scout_actions` row `awaiting_human` with a
reason — the "Scout needs you" surface is a query, not a mailbox.

---

## 11. RLS summary (per the proven families)

| Table | Role policies | Agent policies | Pins |
|---|---|---|---|
| scout_missions | org S; create/update can_write_candidates | none (no principal touches missions) | status transitions app-side; terminal states final |
| scout_actions | org S | none; RPC-mediated writes | decided_by = auth.uid() on gate crossings (087 family) |
| outreach_strategies | org S; human U for approve/decline | #21 S+I+U | U double-pinned status='draft' both faces (092 family) |
| network_profiles | org S; human U | #24 S+U | #24 UPDATE column-pinned: never dnc*, never relationship_state→/from do_not_contact |
| engagement_states | org S | #22 S+I+U | escalated rows: agent U refused (pin on status) |
| prescreens | org S | #23 S+I+U | U pinned status IN (invited,in_progress); complete is terminal to the agent after completed_at |
| candidate_outreach (ext) | unchanged | sends INSERT via comms-service RPC only, actor recorded | inbound_cannot_carry_notice stands; sent_by_principal truthful via RPC |
| inbound_messages | org S (read) | #22 S | INSERT only by webhook route (service key scoped to that route's RPC) |
| org_comms_policy | org S; admin U | S for #21/#22 (read policy) | none |

No existing policy is weakened; every new principal's harness
carries the read-coverage, attribution, negative-matrix,
kill-switch-independence, and control-run invariants of the
twenty precedents, plus the pin proofs named above.

---

## 12. Legal / compliance questions requiring counsel BEFORE level ≥3 ships

1. AI-conducted candidate conversations: disclosure obligations
   (EU AI Act transparency; state bot-disclosure laws) — the design
   pre-commits to always-disclose, counsel confirms wording.
2. NYC LL144 (AEDT) and analogues: does evidence-collection
   pre-screen "substantially assist" the decision? Audit/bias-audit
   obligations if so. May constrain #23 rollout by geography.
3. GDPR Art. 22 automated decision-making: confirm the
   no-verdict/derived-state design keeps humans as the decision
   locus; document it.
4. Outreach law by channel/geography (PECR, CAN-SPAM analogues for
   individual professional outreach; unsubscribe mechanics).
5. Transcript retention and candidate access (portal exposure of
   pre-screen transcripts; erasure scope).
6. Recording the recruiter-of-record: whose name signs outreach
   sent by an agent at level ≥2 (sender identity honesty).

---

## 13. UI surfaces (design level)

- **Mission card** on the mandate page: objective, autonomy level,
  derived funnel, blockers ("Scout needs you" = awaiting_human
  actions), pause/cancel. Terminal idiom, RAG states.
- **Approvals queue**: strategies awaiting approval, escalations,
  ambiguous inbound — one surface, org-wide.
- **Thread view** in the outreach panel: the existing log becomes a
  conversation (direction + delivery status + who/what sent it —
  principal sends labeled honestly).
- **Relationship card** on the network person view: state,
  disposition, follow-up, DNC (with its reason), history derived.
- **Pre-screen review**: transcript + the two tracks + unknowns
  resolved/remaining; the recruiter-ready state and its evidence.
- **Agents page**: the four new principals appear with their
  "stays human" lines as they ship.

## 14. Observability & tests

- `scout_actions` is the primary observability artifact (every
  decision, gate, refusal, retry with reasons); activity events
  carry counts; Sentry seams via `captureSeamError` throughout;
  mission funnel view drives both UI and metrics.
- Each slice ships: SQL invariants harness + control run (the
  named pins above), vitest contracts for the comms-service policy
  ladder (every refusal branch), orchestrator state-table tests
  (pure function: state × level → action|gate), compose/Art.14
  regression (existing tests extended), and a live drive per the
  Phase-4 pattern — #22's drive requires a controlled inbound
  fixture (a test mailbox), identified as drive infrastructure.

## 15. Migration sequencing & implementation order

The confirmed order **21 → 24 → 22 → 23**, one slice each, each
gated on its own D1–D8 confirmation:

1. **097 — #21 Outreach Strategy**: `outreach_strategies` +
   `org_comms_policy` + vocabulary. Rationale: zero external
   infrastructure; composes from artifacts that all exist; its
   human-send path IS today's outreach panel (level ≤1 works the
   day it ships).
2. **098 — #24 Candidate Relationship**: `network_profiles` +
   resolver + backfill + candidates.network_profile_id +
   vocabulary. Rationale: #22's policy ladder needs durable DNC and
   relationship state BEFORE any autonomous send; also improves
   #21's inputs immediately.
3. **099–100 — comms service + #22 Engagement**: outreach
   extensions, suppression, inbound_messages, webhook routes,
   engagement_states, caps, vocabulary. The infrastructure slice —
   largest, riskiest, and deliberately third so both its policy
   inputs (#24) and its content inputs (#21) exist. Level 2 ships
   before level 3 (outbound-only first; inbound behind its own
   gate).
4. **101 — #23 Pre-Screen**: prescreens + vocabulary. Last because
   it rides #22's channel and carries the §12 counsel dependencies.
5. **Scout surface + orchestrator** grow incrementally from slice 1
   (missions/actions tables can land with 097 in Assist/Discover
   form — Scout at level 0–1 is real and useful before any
   autonomous send exists).

## 16. Non-goals (explicit)

No LinkedIn automation, ever, under any autonomy level. No
agent-to-agent invocation. No auto-approval of strategies at any
level by default. No autonomous submission, negotiation, offer, or
placement acts. No single candidate score anywhere in the Engage
artifacts. No second person-database (network_profiles anchors, it
does not duplicate). No provider marketplace — one adapter (Resend)
until a real customer channel demands the second. No Ranking
rewrite. No renaming of Candidate Search. No weakening of any
existing pin.

---

*End of spec. Implementation is gated on the founder's written
approval of the decisions listed in the accompanying report (G).*
