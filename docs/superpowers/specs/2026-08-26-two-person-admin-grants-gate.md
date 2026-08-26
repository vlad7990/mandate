# GATE — TWO-PERSON APPROVAL FOR ADMIN GRANTS — 2026-08-26

**Status: DRAFT. Awaiting the founder's written word. Nothing is built.**

Ledger last entry §172. Next migration 129; next § 173; next drive 117;
vitest 1110; CHECK 93; door 26; allowlist 29; anon roster 12.

---

## 1. What is true today

`admin` is self-propagating, by design and in two places:

- **Promote an existing member** — `setMemberRoleAction`, gated on
  `org:manage`, applies immediately. The picker offers all five staff
  roles including `admin`.
- **Invite someone new as admin** — `issueStaffInvitationAction`, same
  gate, refuses only `agent` and the three external roles.

Three limits already exist and this gate does not disturb them: an
admin cannot touch a founder (`target.is_founder` refusal); an admin
cannot set `is_founder` on themselves (the RLS policy is
column-scoped, and the code says that is why); and
`guard_user_privilege_changes` refuses any change that would leave the
org without an active admin (migration 046).

What does not exist is any **second pair of eyes**. One admin can mint
another unilaterally, and the new admin has the full tier immediately.

## 2. The constraint that shapes the whole design

**This organisation currently has exactly ONE staff user** — the
founder, `admin` and `is_founder`. Every other row in `users` is an
agent.

So a naive rule ("granting admin requires approval by a second admin")
is a **deadlock on day one**: there is no second admin to approve the
creation of a second admin, and there never could be. The same is true
of every new customer org at the moment it is provisioned.

Two-person control is arithmetically impossible with one person. D1 is
how we handle that, and it is the decision the rest depends on.

## 3. What this actually defends against — stated honestly

It stops **one compromised or malicious admin from silently minting
more admins**, which is the classic privilege-escalation move that
makes an intrusion permanent and hard to unwind.

It does **not** make an admin safe. A single admin retains, alone and
immediately: `fees:read`, `models:write`, `skills:write`,
`desk:manage`, `mandates:write`, `candidates:write`, `clients:share`,
and the power to **suspend** other members. If the threat model is "an
admin account is taken over", this closes one door in a room with
several. Worth building; not worth over-trusting.

---

## 4. DECISIONS

### D1 — How do we escape the bootstrap deadlock?

- **(a) Threshold rule.** *(recommended)* Approval is required only
  when the org already has **two or more** active admins. With one
  admin, that admin may grant alone — there is nobody to collude with,
  and no second pair of eyes exists to ask. The 1 → 2 transition is
  therefore unprotected, which is inherent rather than a gap we chose.
- **(b) Founder approves for small orgs.** The platform operator
  (`is_founder`) approves when the org has fewer than two admins. Real
  two-person control from the first grant, at the cost of putting
  Mandate in the middle of a customer's internal staffing decision, and
  of a support burden on you personally.
- **(c) First grant free, all later ones approved.** Similar to (a) but
  counts grants rather than current admins, so it behaves oddly after a
  demotion.

I recommend (a). If you want (b), say so — it is defensible for a
high-trust product, but it means every customer's second admin waits on
you.

### D2 — Which acts require two people?

- **(a) Both grant paths only** — promoting to admin, and inviting a
  new person as admin. *(recommended)*
- **(b) Grants and removals** — also require approval to demote or
  suspend an admin.
- **(c) Grants, removals, and `is_founder`** — moot; no one can set
  that flag through the app at all.

I recommend (a), and against (b) for a specific reason: requiring two
people to REMOVE an admin means a compromised admin **cannot be
revoked quickly** by the one honest admin awake at 3am. The lockout
floor already prevents removing the last one. Slow the door in, not the
door out.

### D3 — Who may approve?

Recommended: **any active admin who is not the proposer.** A founder
who also holds `admin` counts; `is_founder` alone does not, since it is
the platform tier and not a member of the customer's org.

Explicitly: the proposer's own approval never counts, and a pending
request does not block other org work.

### D4 — Where does the pending state live?

- **(a) A new `admin_grant_requests` table** *(recommended)*: proposer,
  target (a user id for a promotion, an email for an invitation), kind,
  status, decided_by, decided_at, expires_at. The grant itself is
  applied by a SECURITY DEFINER function on approval.
- **(b) Extend `staff_invitations`** with an approval column. Covers
  invitations only; a promotion is not an invitation, and forcing one
  shape onto both would repeat the "same-thing-twice" smell the house
  has been avoiding.

### D5 — Enforcement point

**The database must refuse it, not just the server action.** Otherwise
a hand-rolled PostgREST call from an admin's own console bypasses the
whole feature — the same reasoning that produced the column-scoped RLS
policy protecting `is_founder`.

Recommended: `guard_user_privilege_changes` gains a rule refusing any
transition **into** `role = 'admin'` unless a transition flag is set,
and only the approval function sets it — the `mandate.allow_*`
pattern already used by invoices (123) and client interviews (117).

### D6 — Expiry and withdrawal

Recommended: pending requests **expire after 7 days** and the proposer
may withdraw one at any time. Expiry is shown as an expired row, not a
silent deletion — the house rule that an absence should say why it is
absent.

### D7 — The trail

Four new event types: `admin_grant_proposed`, `admin_grant_approved`,
`admin_grant_rejected`, `admin_grant_expired`, at **`members`
visibility** — the tier `member_role_changed` and
`member_status_changed` already use.

⚠️ This moves two pinned numbers: **activity CHECK 93 → 97**, and
`describe.test.ts` pins both the CHECK count and the app-recordable
list, so both must be bumped deliberately in the same migration.

### D8 — What happens to admins who already exist?

Recommended: **nothing.** No retroactive re-approval, no re-attestation.
The rule applies to grants made after it ships. Anything else would
lock out a working org to prove a point.

---

## 5. What this will NOT do

Touch `is_founder` or `platform:operate`; require approval to remove an
admin (D2); apply to the client-side `client_admin` role, which is a
different tier with its own `client:manage-people` capability and its
own scale; add email notification of pending requests (worth doing
later, but it needs the Resend sending-domain decision first, which is
founder-owned and open); or involve agents in any way — the allowlist
stays at 29 and the anon roster at 12.

## 6. Green gate and drive

tsc / vitest / eslint / build → commit → `vercel deploy --prod --yes`
→ **drive 117**, which must prove live: a solo admin grants alone under
D1(a); with two admins a grant becomes a pending request and the target
does NOT gain the tier; a second admin approves and the tier lands; the
proposer's own approval is refused; a direct PostgREST role update to
`admin` is refused by the trigger (the D5 proof — this is the one that
matters most); withdrawal and expiry both behave; an agent is refused
throughout; and the last-admin floor still holds. Exact teardown, all
pins fresh-statement.

## 7. What I need from you

A word on **D1–D8**. My recommendations: **D1(a) threshold at two
admins · D2(a) grants only, not removals · D3 any active admin but the
proposer · D4(a) a new table · D5 enforce in the trigger · D6 7-day
expiry, withdrawable · D7 four events at `members`, CHECK 93 → 97 ·
D8 no retroactive re-approval.**

The two I would most expect you to have a view on are **D1** (whether
Mandate stands in the middle of a customer's second-admin decision) and
**D2** (whether removing an admin should also take two people — I argue
firmly it should not).
