# THE INTERVIEWER programme — Phase 0 + THE PROGRAMME GATE — 2026-08-25 — DRAFT

**Status: DRAFT. Nothing here is confirmed. Build waits on the
founder's written word against THIS document (the §112/§114/§123
precedent). The pre-launch checklist (§122) is the ACTIVE programme;
this gate additionally asks the founder to rule on sequencing (R5)
before any slice builds.**

Scope, from the founder's brief (2026-08-25): an Interviewer agent
that (a) prepares founders and recruiters for interviews with
candidates, (b) creates a checklist/process to be sent to the
candidate, (c) creates an interview for the CLIENT to gather more
information, (d) composes all of it from information already
gathered from the point of mandate/role creation — and (e) opens the
door to an Interview Simulator.

---

## Part 1 — What Phase 0 found, in code

### A third of the brief already exists — inside Executive Intelligence

Agent 17, the **Interview Architect**
(`src/lib/ai/executive-interview-architect-agent.ts` +
`generate-executive-interview-plan.ts`, migration 037), already does
(a) and (d) — for EI searches only. It turns an APPROVED Role
Success Profile + operational competency weights + candidate context
into per-candidate plans: stages with objectives, a recommended
interviewer per stage, core / follow-up / candidate-specific
questions, evidence to listen for, weak-answer indicators, red
flags. Competency coverage is computed SERVER-SIDE against the
weight list — the agent proposes, the app reports truthfully. Plans
are versioned, draft→approved→archived, immutable once approved (DB
trigger `guard_executive_interview_plans`), and an approved plan
gates Assessments. The no-verdict doctrine is written into its
header: decision support, never hire/no-hire, never protected
characteristics, human-approved before it is treated as ready.

### The confinement is structural, not incidental

`executive_interview_plans` is keyed `(search_id, candidate_id)`
with `search_id REFERENCES executive_searches` (037, live read).
Mainstream mandates — projects with job_specs and calibration —
have NO interview plans and cannot borrow EI's table without
re-opening confirmed machinery.

### The Interviewer is not a principal

The durable registry holds TWENTY-FOUR agents (live read of
`public.users where role='agent'`) — Intake through Engagement; no
Interviewer, and no Onboarding Agent either: the 14-agent charter's
"Onboarding Agent" (dynamic client questionnaire) was absorbed into
intake/calibration and never minted. Mode (c) — interviewing the
client mid-search — has NO existing agent, module, or surface. The
agents-as-principals frame is proven and waiting
(`src/lib/agents/session.ts`): one users row per agent, one env
credential pair, sign-in per run, no service-role fallback by
design, suspension checked in-session (the /ops kill switch answers
within one run).

### The delivery channels exist; the guardrails exist

- Candidate-facing: the candidate portal token path (073, the six
  `candidate_portal_*` anon functions — load-bearing, §124) already
  carries content to candidates without a session.
- Client-facing: the HM portal token path (`verify_hm_token`) does
  the same for hiring managers.
- Outbound sends ride the comms programme: `org_comms_policy`, caps
  as data, DNC refusals, and the Engagement precedent that NOTHING
  is sent without a human pressing an approved-send button (drive
  0ed/0ee, §95–§100).

### The simulator that exists is not this simulator

`src/app/(marketing)/_components/live-simulator.tsx` is the landing
page demo (rate-limited, on the pre-launch checklist for
verification). There is no product simulator. But an approved
interview plan — questions + evidence-to-listen-for + red flags —
is precisely a simulator's script, which is why the simulator is a
LATER slice, not a foundation.

---

## Part 2 — THE PROGRAMME GATE (drafted, awaiting the founder's word)

One slice per gate (the OKR programme's R3, kept). THIS document
gates the programme frame and SLICE ONE in full; slices two–four get
their own Phase 0 + D-gate each, drafted only after the prior slice
is confirmed.

### D1 — The Interviewer becomes the TWENTY-FIFTH principal

A users row (role 'agent', `vbreygin+interviewer@gmail.com` per the
house naming), its own env pair (`AGENT_INTERVIEWER_EMAIL/PASSWORD`)
minted by operator hand, its own /ops kill switch, a
`signInInterviewer()` in session.ts. RLS per the standing doctrine:
scoped SELECT on what it composes FROM (role spec, calibration,
candidate context — read is required, this is not a write-only
principal), INSERT limited to its own draft artifacts. The trap from
memory stands: RETURNING/WHERE read via SELECT policies — the
policies must admit reads of its OWN inserts or the pipeline inserts
blind.

**Recommend: as stated. Registry 24 → 25; durable baseline users
25 → 26.**

### D2 — Slice one: interview prep for the desk, on EVERY mandate

The heart of brief item (a) + (d): generalise agent 17's SHAPE —
not its table — to mainstream mandates. Two options were weighed:
(option a) rekey/extend `executive_interview_plans` to serve both
domains — re-opens 037's confirmed, immutability-hardened machinery
and tangles two lifecycles; (option b) a new `interview_plans`
table keyed `(project_id, candidate_id)`, built on the 037 pattern
(versioning, atomic allocation, draft→approved→archived, DB
immutability trigger, dedicated guard) with the mainstream sources:
job_spec + calibration weights + candidate profile/review in place
of the EI success profile. EI's agent 17 is UNTOUCHED.

**Recommend: (b). Confirmed machinery is never re-opened; the
pattern is copied, the table is not shared.**

### D3 — Slice two (own gate later): the candidate prep pack

Brief item (b). The Interviewer drafts a candidate-facing
checklist/process (logistics, format, who they will meet, how to
prepare — never the questions themselves verbatim, never coaching
to defeat the assessment); a HUMAN approves; delivery rides the
candidate portal token path and the comms policy (caps, DNC,
approved-send). Anything shown before approval carries the
illustrative-data label.

**Direction recorded now; the slice gates separately.**

### D4 — Slice three (own gate later): the client interview

Brief item (c) — wholly new. The Interviewer composes a structured
question set for the CLIENT from what the mandate already knows and
— more to the point — what it provably lacks (the calibration gaps,
the missing-info residue from intake). Delivery over the HM portal
token path; answers land as feedback events and feed the existing
Feedback Interpreter, not a new interpretation pipeline.

**Direction recorded now; the slice gates separately.**

### D5 — Slice four (own gate later, LAST): the Interview Simulator

Built ON approved plans — the plan's questions, evidence and red
flags are the script; the simulator rehearses the INTERVIEWER
(founder/recruiter practising delivery), it never simulates or
scores a real candidate, and it never becomes a candidate-facing
assessment. The marketing live-simulator is untouched and unrelated.

**Direction recorded now; the slice gates separately.**

### D6 — The ladder on confirmation (slice one only)

Phase-0-verified migration (next number at build time; table +
guards + RLS + intent-door types for
`interview_plan_generation_requested/_generated/_generation_failed`
and approval events, activity CHECK widened accordingly) · registry
row + env pair + kill switch (operator recipe in the handoff; the
provisioning trap stands — member-audit events swept by NAME,
public.users before auth.users) · pipeline + terminal-language UI on
the mandate's candidate page with sample content (both standing
memory rules) · invariant harness for the new table (the 037
negatives re-proven mainstream: immutability after approval, version
atomicity, org confinement, the agent writes only its own drafts) ·
green gate (tsc / vitest 929+new / eslint / build) · commit · deploy
(app code moves this time) · a lettered drive with scratch
principals, torn down by value · a § DRAFTED, no completion
declared.

## Part 3 — Named rulings

- **R1 — no verdicts, restated for a new agent.** Plans and packs
  are decision support; no hire/no-hire, no protected inference, no
  candidate scoring by the simulator. Agent 17's header doctrine
  becomes programme law.
- **R2 — nothing outbound without a human.** Candidate packs and
  client question sets are drafts until a person approves; sends
  ride the comms policy (caps, DNC) without exception.
- **R3 — agents hold no goals (§121 stands).** The Interviewer is a
  tool with a kill switch, never an OKR subject, never an owner,
  never an assignee.
- **R4 — one slice per gate.** This document builds nothing past
  slice one; D3/D4/D5 are recorded direction, not authorisation.
- **R5 — sequencing: RULING REQUESTED.** Recommend the pre-launch
  checklist completes first (RLS review pass onward, §124's tail);
  the Interviewer programme opens after. The founder may instead
  interleave slice one earlier — this is the founder's line to draw,
  and the gate holds until it is drawn.

Numbers at drafting: next migration 111, next § 125, next drive 0fa;
vitest 929; activity CHECK 80; intent door 14; agent allowlist 29;
durable baseline 25/24/74/5/5/1/1/2/2/1/1 + tasks 0 + objectives 0 +
key_results 0; registry 24 agents, Interviewer absent (verified
live).
