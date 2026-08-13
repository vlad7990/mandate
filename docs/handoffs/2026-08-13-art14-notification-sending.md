# Continuation — Art. 14 notification sending via Resend

**Date:** 2026-08-13
**Status:** Schema + composition DONE (`ef60bc1`). Send path NOT written — blocked
on the Resend credential, which needs a browser step the CLI cannot drive.

**Done:** migration 044 applied (candidate_notifications, record_notification_sent /
record_notification_failed, stamping stripped out of log_candidate_outreach);
8 SQL invariants in `supabase/tests/candidate_notification_invariants.sql`;
`src/lib/outreach/compose.ts` + 11 tests.

**Remaining:** resolve the credential, then the server send action (compose →
Resend → record_notification_sent / _failed), the compose UI, and the
send-path tests listed below. The action queue needs no change.

Work in `/Users/vladbreygin/Projects/mandate`. Supabase project `xipyqnltkbtywxqyxupf`.

---

## Where this got to

Resend was provisioned through the Vercel Marketplace (`messaging` → `resend/resend-email`,
resource **`resend-email-violet-dog`**, domain `getmandate.io`, region `us-east-1`).
Marketplace terms accepted by the founder.

**It did not connect to the project.** The CLI failed with:

```
Failed to connect: This project already has an existing environment variable
with name RESEND_API_KEY in one of the chosen environments (400)
```

Because `RESEND_API_KEY` + `RESEND_FROM` already exist (Production, ~103 days old)
and are already used by `src/lib/waitlist/notify.ts` for waitlist notifications.

So there are now TWO Resend credential paths, which is exactly what the
founder's principle 7 says to avoid. **Resolve this before writing send code.**

### The decision

- **(a) Adopt the managed resource as the single key.** Delete the manual
  `RESEND_API_KEY`/`RESEND_FROM`, re-run
  `vercel integration add resend/resend-email -m domain=getmandate.io -m region=us-east-1`,
  then `vercel env pull --yes`, and repoint `waitlist/notify.ts` at it.
  Cleanest end state. **Risk: waitlist emails stop until the managed key works
  and `getmandate.io` is verified in the new Resend account.**
- **(b) Keep the manual key, remove the provisioned resource.** Zero production
  risk, but not marketplace-managed and it contradicts the stated preference.
- **(c) Connect the managed resource under `--prefix MANDATE_` so both coexist.**
  Unblocks candidate outreach without touching waitlist. Two credential paths,
  justified only as a migration step, not an end state.

**Unverified either way: whether `getmandate.io` is DNS-verified as a sending
domain in the Resend account behind the newly provisioned resource.** A new
Resend domain requires DKIM/SPF records before it will send. Check the resource
dashboard and report exactly which DNS records are outstanding — do not ship
production outreach from a test sender.

---

## Design (agreed with the founder, do not relitigate)

`subject_notified_at` must represent a **completed notification event**, never
recruiter attestation. Today `log_candidate_outreach()` stamps it when the
recruiter ticks `includes_privacy_notice` — that is the attestation model and it
must be dismantled.

### Migration 044 (not yet written)

1. **`candidate_notifications`** — the evidence record. Columns:
   `id, candidate_id -> candidates ON DELETE CASCADE, project_id,
   organization_id, channel ('email'), recipient, template_key,
   template_version, notice_version, provider ('resend'), provider_message_id,
   status ('sent'|'failed'), error, sent_at, created_by, created_at,
   idempotency_key text NOT NULL`.
   - `UNIQUE (idempotency_key)` — a retried request cannot send twice.
   - `CREATE UNIQUE INDEX ... ON candidate_notifications (candidate_id) WHERE status = 'sent'`
     — at most ONE successful statutory notice per candidate, enforced by the
     database rather than by application care.
   - RLS org-scoped, matching every other table.

2. **Strip the stamping power from `log_candidate_outreach()`.** It keeps
   recording contact; it must no longer touch `subject_notified_at`. The
   `guard_subject_notified` trigger from migration 043 already blocks direct
   updates, so after this change the ONLY path is the new RPC.

3. **`record_notification_sent(...)`** — SECURITY INVOKER. Inserts the evidence
   row and stamps `subject_notified_at` in one transaction, under the existing
   `mandate.allow_notification_stamp` flag. Stamps the EARLIEST successful
   notice only. Called by the server *after* Resend returns success.

4. **`record_notification_failed(...)`** — writes a `failed` evidence row and
   stamps nothing.

Follow house discipline: invariant SQL asserting the SPECIFIC error per case,
run rolled back via MCP `execute_sql`, then `apply_migration`.

### Composition — the notice is structural, not typed

`src/lib/outreach/compose.ts`, pure and client-safe:

```
composeOutreach({ recruiterBody, candidate, org, noticeRequired })
  -> { subject, text, html, blocks: [recruiter, notice?, footer] }
```

The recruiter edits ONLY `recruiterBody`. The notice block is assembled from a
versioned template constant and cannot be reached by recruiter input — that is
what makes "notice was included" a guarantee rather than a claim. Version the
notice text (`NOTICE_VERSION`) and record it on the evidence row, so a future
wording change stays attributable.

`noticeRequired` comes from the EXISTING classifier —
`notificationState(candidate, now).status` is `due` or `overdue`. Do not
re-derive it, and do not apply it to applicants.

### Send path

Server action → compose → send via Resend (server-side only, key from env) →
on success call `record_notification_sent`, on failure
`record_notification_failed`. Fails closed: any error leaves
`subject_notified_at` NULL and the item in the action queue.

Idempotency key: deterministic per (candidate_id, notice_version), so a
double-click or a server retry collides on the unique index instead of sending
a second statutory notice. A deliberate later re-send of ordinary outreach is a
different act and must not reuse that key.

### Action queue

No change needed. `src/lib/home/action-queue.ts` already keys off
`subject_notified_at` via `notificationState`, so once stamping is tied to a
successful send, "sent → leaves queue / failed → stays" falls out for free.
Add a test that asserts it.

### Tests required (founder's list, verbatim intent)

sourced candidate → notice block present; non-sourced → no forced block;
successful send → recorded; failed send → `subject_notified_at` still null;
duplicate/retry → no second statutory notice; recruiter cannot remove the
compliance block; overdue action leaves the queue only after success;
due-but-not-overdue behaves; applicant never enters the workflow; cross-org
access impossible. Use Resend's test addresses for delivery simulation — never
real candidate emails in tests.

---

## Out of scope (explicit)

Marketing automation, campaign management, sequencing, AI-generated outreach,
CRM. This task is the statutory notice path only.

## Needs counsel, not code

- Whether a notice delivered by phone or LinkedIn can ever satisfy Art. 14 in
  this product. The new model records only successful *email* sends, so a
  recruiter who notifies someone by phone currently has no way to record it.
  That is a deliberate tightening — confirm it is the intended policy.
- Whether `getmandate.io` root or a subdomain (`mail.` / `send.`) should carry
  transactional sending. A subdomain isolates reputation from the root domain's
  mail; the root was provisioned because the founder named it.
