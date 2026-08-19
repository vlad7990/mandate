# NEXT — Account Lifecycle slice: password recovery + resend invitation

The two smallest gaps the External Identity programme (§21–§22) left
open, closed as one slice: an account that can be recovered, and an
invitation that can be re-sent. Same phased shape: Phase 0 decisions →
model → surfaces → verification → verdicts → founder sign-off. Delete
this file when the completion is declared.

**Gate: no build work past Phase 0 until the founder confirms D1–D5.**

---

## Where this starts from (2026-08-19, HEAD `cbba3fb`)

- "Forgot Security Key?" on /auth/signin is a tooltip, not a flow — no
  principal, staff or external, can recover a lost password. The gap
  predates the external programme but externals made it urgent: they
  are strangers who cannot walk over to the founder's desk.
- `/auth/callback` already exchanges auth codes (§14/§18); the password
  policy (12 chars, 4 classes) is enforced app-side and by GoTrue; the
  suspended sign-in gate is independent of how the password was set.
- Invitations (068) are single-token, 14-day, revocable; the only
  answer to "the link expired" or "the email never came" is revoke +
  re-invite, which works but mints a new token and takes two steps.
  Invitation email delivery itself is still blocked on the founder's
  Resend DNS step; recovery email rides Supabase's built-in sender,
  which §18 proved delivers.
- Next migration: **070.** 767 tests green. Baseline counts as at §21
  teardown.

## Phase 0 — Decisions for the founder (D1–D5)

### D1 — One recovery flow for every principal
`/auth/recover` (request) and `/auth/reset` (set new password), built
on GoTrue's own recovery flow (`resetPasswordForEmail` → email link →
`/auth/callback` code exchange → authenticated reset). Staff land back
on /app, externals bounce to /portal by the existing layout rule — no
persona branching in the flow itself. Suspended accounts may complete a
reset and are still refused at sign-in, which is correct: the password
and the standing are different facts.

### D2 — No account enumeration
The request screen always answers "if that address has an account, a
recovery email is on its way" — whether or not it does. The signin
page's "Forgot Security Key?" tooltip becomes a real link.

### D3 — Recovery email rides the built-in sender for now
Same sender §18 proved for confirmations; a handful per hour is fine at
current scale, and the D6 SMTP switch (still DNS-blocked) upgrades it
later without touching this flow. The reset page enforces the same
12/4 policy as signup and redemption.

### D4 — Resend = same token, fresh clock
`resend_external_invitation` (070, SECURITY DEFINER): staff at
clients:share of the owning org, or the client_admin of the client;
refuses accepted and revoked invitations (a revoked invitation was
withdrawn on purpose — re-invite is the honest path); resets
`expires_at` to now + 14 days and returns what the mailer needs. The
token itself does not rotate — it was only ever in the invitee's inbox
and the inviter's hand. A `external_invitation_resent` trail event
joins the vocabulary (trigger-written, table CHECK only). Resend
buttons land beside Revoke on both panels, with the same delivery
honesty: staff get the link on email failure, a client_admin is told
to ask the search team.

### D5 — Out of scope, stays on the gap list
Signed-in self-service (change my own name/password from a settings
page, staff or portal) is adjacent but not this slice; it arrives with
a portal account page later. Rate limiting on /auth/recover is noted
for the pre-launch rate-limiting pass rather than built ad hoc here.

## Phase 1 — Model

- **070** — `external_invitation_resent` joins the activity CHECK;
  `resend_external_invitation(p_invitation_id)` RPC (authz as D4,
  expiry refresh, resent event written with the caller as actor);
  invariants file `account_lifecycle_invariants.sql` + control run:
  resend authz truth table (staff yes, client_admin own-client yes,
  client_hr/hm/viewer/foreign staff no), accepted and revoked refuse,
  expiry actually moves, event lands in the owning org.
- No schema change for recovery — it is GoTrue's flow plus two pages.

## Phase 2 — Surfaces

- `/auth/recover` page + action (`resetPasswordForEmail` with
  redirect through /auth/callback to /auth/reset), D2 messaging.
- `/auth/reset` page + action (policy-checked `updateUser`), refuses
  when no recovery session is present, lands staff on /app and
  externals on /portal via the existing bounce.
- Signin page: the tooltip becomes a link.
- Resend buttons + toasts on the staff Client Portal panel and the
  portal People view, calling the 070 RPC then the existing
  `src/lib/email` invitation mailer.

## Phase 3 — Verification (production, scratch data)

Recovery: scratch staff + scratch external; request recovery for both;
the built-in sender's delivery was proven §18 for the confirmation
class — the link for the drive is generated via the admin API
(`generateLink type: recovery`), which exercises the identical
code-exchange path the emailed link takes; reset with a
policy-violating password refused, with a compliant one accepted;
sign-in with the new password; suspended account still refused at the
gate; enumeration probe (unknown email gets the same screen). Real
inbox delivery of the recovery email is founder-confirmable at leisure
— it is the §18-proven sender, not new machinery.
Resend: expired-clock invitation resent by staff (expiry moves, event
written), resent by client_admin, refused for client_hr and for the
accepted/revoked states; redemption works after resend. Delivery
honesty toast until DNS lands. Teardown to baseline counts.

## Phase 4 — Verdict candidates

Self-service account pages (deferred to a portal-settings slice);
recovery-link TTL tuning (GoTrue default stands until it bothers
someone); rate limiting on /auth/recover (joins the pre-launch
rate-limiting item); SMS/second-factor recovery (declined at this
scale).
