# NEXT — Portal Settings slice: self-service name + password

The §23 verdict come due: any signed-in principal — staff or external —
can correct their own name and change their own password without asking
anyone. Same phased shape: Phase 0 decisions → model → surfaces →
verification → verdicts → founder sign-off. Delete this file when the
completion is declared.

**Gate: no build work past Phase 0 until the founder confirms D1–D5.**

**STATUS 2026-08-19: D1–D5 CONFIRMED by the founder as drafted.** The
gate is open; execution starts at Phase 1 (migration 071).

---

## Where this starts from (2026-08-19, HEAD `ae768ee`)

- Nobody can edit their own `full_name`: staff writes to `users` are
  admin-only (046) and external writes are staff-or-client_admin (067);
  there is no self-update policy at all. A typo'd name — set at signup
  or by whoever typed the invitation — is permanent without founder SQL.
- Password *recovery* exists (§23) but a signed-in password *change*
  does not: the only way to rotate a password you still know is to
  pretend you lost it.
- /app/settings is the org roster and waitlist; it shows the caller's
  profile but edits none of it. /portal has no settings surface.
- Next migration: **071.** 767 tests green.

## Phase 0 — Decisions for the founder (D1–D5)

### D1 — Both sides, each in its own home
Externals get `/portal/settings` (identity card: name, email, role,
company, operated-by — plus the two edits). Staff get an **Account**
section at the top of `/app/settings` — their profile is already shown
there; this makes it editable rather than minting a new route.

### D2 — Self-service means `full_name`, and nothing else
A new self-update RLS policy (071) puts the caller's own row in reach,
and the 046/067 privilege guard learns the column rule RLS cannot
state: on a self-update by a non-admin, only `full_name` may change.
Email is identity (it stays founder/re-invite territory), role and
status stay with the people who hold those powers today. An org admin
editing their own row through the existing admin policy keeps their
current powers (the last-admin rules already guard the edge). Trail
labels are snapshots by design — historical events keep the old name;
new events pick up the new one. No new event type: a name correction is
cosmetic, not activity.

### D3 — Password change requires the current password
The signed-in change form asks for the current password and re-verifies
it server-side before `updateUser` — a walk-up attacker at an open
laptop must not be able to lock the owner out. Same 12/4 floor as the
other three doors. Other sessions stay alive (global sign-out is a
verdict candidate, not this slice).

### D4 — The guard grows one branch, ordered first
`guard_user_privilege_changes` gets a self-update branch *above* the
external-administration branch — today a hiring manager updating their
own row would be refused as "not a client admin", which is the wrong
sentence for the right refusal. Self + non-admin ⇒ only full_name;
everything after (founder-only columns, external column discipline,
last-admin rules) stays exactly as it is.

### D5 — Out of scope, stated
Email change; avatar/photo; notification preferences; global session
revocation on password change; deactivating one's own account. Each is
a verdict candidate or a later slice, not a silent absence.

## Phase 1 — Model

- **071** — `users_update_self` policy (`id = auth.uid()`, active or
  not — a pending user fixing their name before approval is fine);
  guard branch per D4. `self_service_invariants.sql` + control run:
  staff non-admin renames self (accepted) and cannot touch own role /
  status / email (raised); external HM renames self (accepted — the
  §067-guard sentence no longer misfires) and cannot self-activate from
  suspended; admin self-edit keeps working; the last-admin rule still
  holds on self-demotion.
- Password change is GoTrue (`updateUser`) — no schema.

## Phase 2 — Surfaces

- `src/lib/account/actions` (or per-page actions): `renameSelfAction`
  (RLS + guard do the enforcing; the action writes and revalidates) and
  `changePasswordAction` (current-password re-verify via a scoped
  sign-in check, then updateUser; both personas share it).
- `/portal/settings`: identity card + name form + password form; nav
  entry "Account" in the portal header (all external roles).
- `/app/settings`: Account section (name + password) above the org
  content, visible to every staff role including viewer.

## Phase 3 — Verification (production, scratch data)

Staff non-admin: rename self (roster shows it), change password with a
wrong current password (refused), with the right one (accepted; old
password refused at sign-in, new works). External HM: same pair on
/portal/settings; suspended external's session cannot reach the form
(layout gate). Console probe: self-UPDATE of role/status/email via
PostgREST raises from the guard. Teardown to baseline.

## Phase 4 — Verdict candidates

Global session revocation on password change; email change; avatar;
notification preferences; self-deactivation.
