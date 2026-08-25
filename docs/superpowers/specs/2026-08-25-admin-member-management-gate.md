# The pre-launch checklist, slice five — ADMIN MEMBER MANAGEMENT — Phase 0 + THE D-GATE — 2026-08-25 — DRAFT

**Status: DRAFT. Nothing here is confirmed. Build waits on the
founder's written word against THIS document. The founder surfaced
the question ("can admins set up and maintain accounts?") on
2026-08-25 and ordered the gate drafted the same day.**

Scope: what an ORG ADMIN can do to their own organisation's staff
roster — create, activate, edit, suspend — without the founder's
hand. Made urgent by §129's ruling: the first client gets their own
organisation, and today that organisation cannot onboard a single
recruiter by itself.

---

## Part 1 — What Phase 0 found, in code

### What admins have

`/app/settings/members` lists every org member (name, email, role,
status) and carries the role picker. `setMemberRoleAction` is
deliberately THE one writer of `users.role` in the product:
admin/founder-gated (RLS `users_update_org_admin_or_founder` behind
it), staff roles only — external roles refused by name ("assigned
by invitation, not from the members screen") — founder targets
refused ("Founder accounts are managed by Mandate"), cross-org
refused, and the update reads its own row back with `.select()` so
a silent RLS denial cannot masquerade as success (the §128 F-1
lesson, already applied here before F-1 was found). Member-audit
trail events fire from triggers on every change.

### What admins lack

1. **Creation.** No invite-a-colleague affordance exists anywhere.
   The only door is open signup → `status: pending` → the /ops
   queue — and `approveUserAction` sits behind `requireFounder()`.
2. **The single-tenant assumption, again.** When the founder
   approves an org-less pending user, the action assigns them to
   THE FOUNDER'S org, hardcoded. A client org's recruiter who signs
   up would be filed into Mandate HQ. Same defect class as F-1.
3. **Status.** Suspend/restore/reject (`UserStatusActions`) live in
   /ops, founder-only. The members screen shows status and cannot
   touch it.

### The machinery already on the shelf

The EXTERNAL invitation family is the working precedent: an
`invitations` row with token + email_key + expiry + revocation +
single-use acceptance, definer RPCs
(issue/verify/revoke/resend/list), the anon `verify_invitation`
grant (§123's ruled set), and the `/invite/[token]` consumption
route. But `invitations.client_id` is NOT NULL — the table is
STRUCTURALLY external (a client-side principal's door), and
widening it would re-open confirmed machinery.

---

## Part 2 — THE D-GATE (drafted, awaiting the founder's word)

### D1 — Staff invitations: a new table on the proven pattern

Migration 113: `staff_invitations` — the invitation shape copied,
not shared (the 037-pattern law: confirmed machinery is never
re-opened): organization_id, email + email_key, full_name, role
(STAFF vocabulary only — admin/manager/recruiter/researcher/viewer;
CHECK excludes 'agent' and every external role), token, invited_by
(+label snapshot), expires_at, revoked_at, accepted_at,
accepted_user_id. Issue/revoke/resend/list as definer RPCs gated
`is_org_admin()` OR founder; verify as the anon token door (the
twelfth load-bearing anon grant, named at birth in the migration's
comments so no future sweep "fixes" it). RLS: org-scoped
admin-gated writes, org-read for the roster screen.

**Recommend: as stated — new table, RPC family copied from the
external flow.**

### D2 — Consumption: the invite IS the approval

`/join/[token]` (staff twin of `/invite/[token]`): the invited
person sets a password (or signs in if the email already holds an
account), and a definer consumption RPC stamps the users row —
organization_id and role FROM THE INVITATION, status ACTIVE —
single-use, expiry enforced, email must match the invitation's.
Staff invited this way NEVER pass the /ops pending queue: the
admin's issuance was the approval. The open-signup path is
untouched and still lands pending, founder-owned.

**Recommend: as stated.**

### D3 — Admins gain suspend/restore for their own org

The members screen grows the status verbs next to the role picker,
writing `users.status` under the same action discipline as the role
writer (refusals in words, `.select()` read-back): never the
founder, never THEMSELVES (no self-lockout; the last-active-admin
case is refused by name so an org cannot admin itself to zero),
never an agent principal — the agent kill switch stays /ops, the
operator's console, per the agents-hold-no-goals separation. A
suspended member's session dies at the predicate layer within one
request, which the persona programme already guarantees.

**Recommend: as stated.**

### D4 — The /ops queue stops assuming the founder's org

`approveUserAction` loses the silent default: approving an org-less
pending user requires an EXPLICIT org choice in the /ops UI. The
founder console keeps every power it has; it just stops filing
strangers into HQ by omission.

**Recommend: as stated.**

### D5 — The ladder on confirmation

Migration 113 (table + CHECK + RLS + RPCs + the named anon grant) ·
member_invariants.sql harness (the refusals BY NAME: agent role
refused in the CHECK, external role refused, expired/revoked/reused
token refused, email mismatch refused, cross-org issue refused,
self-suspension refused, last-active-admin suspension refused,
founder untouchable; the positives: invite→join lands active with
the invited role in the invited org; suspend flips within the org)
· members screen + /join route in the terminal language with
sample-labelled demo content · roles.test.ts additions · green gate
(tsc / vitest 933+new / eslint / build) · commit · deploy · drive
0ff (scratch org: scratch ADMIN invites a scratch recruiter
end-to-end through the real email-less token link, suspends and
restores them, teardown by value — the member-audit and
public-before-auth traps stand) · § DRAFTED, no completion
declared.

## Part 3 — Named rulings

- **R1 — the invite is the approval.** Admin-invited staff enter
  active. The pending queue remains the founder's and serves only
  the open door.
- **R2 — agents are never members here.** Not invitable, not
  role-assignable, not suspendable from the members screen; /ops
  keeps the kill switch. The two consoles never merge.
- **R3 — the two invitation families never merge.** Staff
  invitations and external invitations stay separate tables,
  separate RPCs, separate consumption routes; a future "unify them"
  sweep is refused by this ruling.
- **R4 — nobody locks themselves out.** No self-suspension, no
  suspension of the last active admin, founder untouchable from the
  members screen.
- **R5 — sequencing: RULING REQUESTED.** This slice must land
  BEFORE the first client's organisation is provisioned — their
  admin must be able to onboard recruiters on day one. Recommend:
  build it as the next slice, in parallel with (not blocking) the
  founder's real-CV/HM testing sessions. The founder may instead
  hold it until after the testing half closes.

Numbers at drafting: next migration 113 (claimed by D1 on
confirmation), next § 134, next drive 0ff (claimed by D5); vitest
933; activity CHECK 80; intent door 14; agent allowlist 29; durable
baseline 25/24/74/5/5/1/1/2/2/1/1 + tasks 0 + objectives 0 +
key_results 0.
