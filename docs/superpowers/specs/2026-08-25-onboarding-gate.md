# The pre-launch checklist, slice six — ONBOARDING: THE DOCS AND THE FRONT DOOR — Phase 0 + THE D-GATE — 2026-08-25 — DRAFT

**Status: DRAFT. Nothing here is confirmed. Build waits on the
founder's written word against THIS document. The founder opened
the slice 2026-08-25 with two asks in one breath: the onboarding
documentation, and "we should add access request" — Phase 0 read
the second as the missing MIDDLE of the access-request journey, and
the code confirms the gap in its own comments.**

Scope: how a prospect becomes a working organisation — the written
guide for every step, and the machinery for the one step that today
exists only as hand-work.

---

## Part 1 — What Phase 0 found, in code

### The access request journey has a working front, a working back, and a hole in the middle

- **Front (works):** /request-access → the waitlist row (limiter
  live, proven 0f9; Turnstile the founder-pending second lock) →
  founder review at /ops/waitlist with notes.
- **The hole (admitted in code):** `approveWaitlistRequestAction`
  flips `status = 'approved'` and STOPS. Its own comment: "the
  actual user creation flow is left to … the founder forwards the
  invite link … manually", written before §135 existed.
- **No organisation can be born in the product at all.** No code
  path inserts into `organizations` — the one live org was made by
  hand in SQL. RLS has no INSERT policy on the table for any
  session role.
- **Back (§135, works):** staff invitations + /join — an admin
  invites, the joiner lands active. Built one slice ago; the front
  door simply cannot reach it yet.

### The documentation shelf is empty

docs/ is entirely internal — handoffs, gate specs, design briefs.
There is NO user-facing onboarding documentation: nothing a
prospect, a new admin, or a new recruiter can read. The checklist
line "Write onboarding documentation" starts from zero.

---

## Part 2 — THE D-GATE (drafted, awaiting the founder's word)

### D1 — The access-request completion: approval provisions

Migration 114 + /ops/waitlist. Approving a request becomes a
PROVISIONING act with an explicit choice (the §135 D4 principle —
no silent defaults):

- **New organisation:** the founder names it (name + slug) →
  `organizations` row (a new `organizations_founder_insert` RLS
  policy — the founder console's first legal INSERT there) → a
  staff invitation for the requester at role ADMIN of that org →
  the /join link surfaced for the founder to send.
- **Existing organisation:** pick org + staff role → invitation →
  link.

The waitlist row records the issued invitation
(`waitlist.staff_invitation_id`, nullable FK) so the queue shows
which approvals have been handed their door. Nothing is emailed by
the product; the founder sends the link — the standing hand-over
contract, and the Resend channel can carry it later as its own
slice.

**Recommend: as stated. Migration 114 claims: the FK column + the
founder INSERT policy on organizations.**

### D2 — The onboarding documentation: a public handbook route

A public `/handbook` on the marketing surface (terminal language),
markdown-authored in `docs/handbook/` and rendered as one route
with sections — the repo stays the source of truth, the product
serves it. Contents, in journey order: requesting access · what
approval looks like (the /join link, the invite-is-approval
contract) · first sign-in and the desk · the mandate loop (intake →
onboarding wizard → calibration → CV upload → evaluation →
shortlist → comparison → weekly report) · sharing with a hiring
manager (the token contract) · the candidate portal and erasure ·
member management for admins (§135) · what the agents do and what
they never do (decision support, never a recommendation — the
no-verdict doctrine in the user's language). Public because a
prospect should read it BEFORE requesting access.

**Recommend: as stated. No screenshots in v1 — prose ships now,
images date instantly.**

### D3 — Docs law

The handbook describes the product AS BUILT — no roadmap, no
feature promised before it ships, and the no-verdict sentence
appears wherever an agent's output is described. Sample-data
labelling doctrine referenced where the demo content is explained.

**Recommend: as stated.**

### D4 — The ladder on confirmation

Migration 114 (FK + founder INSERT policy) · /ops/waitlist approval
dialog (new-org / existing-org / role) · the handbook route +
content · green gate (tsc / vitest 939+ / eslint / build) · commit
· deploy · **drive 100**: a request submitted through the real
/request-access form → founder-side approval into a NEW scratch
organisation → the requester joins via the real link as its ADMIN →
that admin invites a recruiter (§135's loop, now reached from the
street) → teardown by value including the waitlist row and the org
· § DRAFTED, no completion declared.

## Part 3 — Named rulings

- **R1 — the founder remains the only door-opener for new
  organisations.** Access request is Mandate's pipeline; nothing
  self-serves an org into existence.
- **R2 — approval issues an INVITATION, never an account.** The
  invite-is-approval doctrine extends to the front door: nobody's
  account exists until they set their own password at /join.
- **R3 — the handbook never promises.** As-built only; the
  no-verdict doctrine speaks in every agent description.

Numbers at drafting: next migration 114 (claimed by D1), next
§ 137, next drive 100 (claimed by D4); vitest 939; activity CHECK
80; intent door 14; agent allowlist 29; anon grant roster TWELVE;
durable baseline 25/24/74/5/5/1/1/2/2/1/1 + tasks 0 + objectives 0
+ key_results 0.
