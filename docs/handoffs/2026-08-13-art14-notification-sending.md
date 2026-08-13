# Continuation — Art. 14 notification sending, and what else is open

**Date:** 2026-08-13
**Status:** Schema + composition DONE and deployed. Send path NOT written —
blocked on Resend credentials, and on sending-domain verification whose state is
UNKNOWN (see section 1; it has never been successfully checked).

Work in `/Users/vladbreygin/Projects/mandate`. Supabase project `xipyqnltkbtywxqyxupf`.
Bash cwd resets to a stale iCloud clone between calls — always `cd` first or use `git -C`.

`main` is clean, in sync with origin, and deployed to production
(`getmandate.io`). Last commits: `a8170ac`, `ef60bc1`, `3347574`, `8f72bea`.
320 tests, tsc / lint / build green.

---

## 1. THE BLOCKER — read this before touching Resend

Two Resend credential paths exist and **neither can send**:

| Path | State |
|---|---|
| `RESEND_API_KEY` + `RESEND_FROM` (manual, ~103 days old, Production) | Marked Sensitive, so its value cannot be read via `vercel env pull`. Validity UNVERIFIED. Used by `src/lib/waitlist/notify.ts`, which has never run against a real submission. |
| Marketplace resource `resend-email-violet-dog` (provisioned today, `getmandate.io`, `us-east-1`) | Provisioned but NEVER CONNECTED — `RESEND_API_KEY` name collision, then `--prefix MANDATE_` hit "Additional setup required. Opening browser…" |

**The Resend account state is UNVERIFIED — we have never successfully queried it.**
`RESEND_API_KEY` is marked Sensitive in Vercel, so `vercel env pull` writes the
literal placeholder `[SENSITIVE]` rather than the value. Both API calls made on
2026-08-13 authenticated with that placeholder and returned
`{"statusCode":400,"message":"API key is invalid"}`.

An earlier version of this handoff claimed "NO DOMAINS configured in this Resend
account". **That was wrong** — a parser read the error object's missing `data`
field as an empty list. Nothing is known about that account's domains. Do not
carry that claim forward; re-check with a real key.

What IS known: `waitlist/notify.ts` sends `from: RESEND_FROM`, currently
`Mandate <hello@getmandate.io>`, and throws on a non-OK response. If
`getmandate.io` is unverified there, every send would have thrown — but see
section 4: nothing has ever triggered it.

`getmandate.io` still needs DKIM/SPF verification before outreach can send.
That is a founder action either way.

### What the founder must do before code can proceed

1. Finish the Vercel-side connect for `resend-email-violet-dog` (browser step the
   CLI cannot drive) so a managed key lands as `MANDATE_RESEND_API_KEY`. This is
   option (c) — both keys coexist, waitlist untouched.
2. Add the DKIM/SPF records Resend supplies. Recommend `mail.getmandate.io`
   rather than the root, to keep transactional reputation separate. The root was
   provisioned only because the founder named it; changing it means re-provisioning.
3. Do NOT ship production outreach from a test sender.

---

## 2. What is already built (do not rebuild)

**Migration 044, applied.** `candidate_notifications` (recipient, template_key,
template_version, notice_version, provider_message_id, status, error, sent_at,
created_by, idempotency_key) + `record_notification_sent` /
`record_notification_failed`, and `log_candidate_outreach` stripped of its
stamping power.

Guarantees now enforced by the database, not by application care:

- `subject_notified_at` is reachable ONLY via `record_notification_sent` (the
  043 guard trigger blocks everything else).
- Partial unique index `(candidate_id) WHERE status='sent'` → at most ONE
  successful statutory notice per person.
- Unique `idempotency_key` → double-clicks, resubmits and provider retries
  collide instead of mailing someone twice.
- Failure records evidence and stamps nothing, so the obligation stays in the
  action queue.

Invariants: `supabase/tests/candidate_notification_invariants.sql` (8 cases,
verified rolled back against prod, then applied).

**`src/lib/outreach/compose.ts`** (+ 11 tests). Builds
`recruiter body + [notice] + footer`. The recruiter edits only their own block,
so no edit can remove the notice — it is never in a field they can reach.
`NOTICE_VERSION = "art14-v1"`. `noticeIdempotencyKey(candidateId)` is
deterministic per candidate + notice version. Whether a notice is owed comes
from `notificationState()` and is never re-derived, so applicants cannot be
pulled into the sourced-person workflow.

---

## 3. Remaining work on this task

1. Resolve the credential + domain (section 1). Everything below waits on it.
2. **Server send action** — `src/app/(dashboard)/app/projects/[id]/candidates/[candidateId]/`:
   compose → send via Resend server-side → on success
   `record_notification_sent(...)`, on failure `record_notification_failed(...)`.
   Read the key from env, preferring `MANDATE_RESEND_API_KEY` and falling back
   to `RESEND_API_KEY`. Never client-side, never hard-coded.
3. **Compose UI** in the Outreach tab: editable recruiter block, a read-only
   system block showing the notice that will be attached, then Send. Founder's
   wording direction: calm and operational, not "performing a legal procedure".
4. **Send-path tests** (the pure halves are already covered): successful send →
   recorded; failed send → `subject_notified_at` still null; retry → no second
   statutory notice; overdue action leaves the queue only after success;
   cross-org access impossible. Use Resend's test addresses — never a real
   candidate address in tests.

The cross-mandate action queue needs NO change: `src/lib/home/action-queue.ts`
already keys off `subject_notified_at`, so sent-leaves / failed-stays falls out.

### Out of scope, explicitly
Marketing automation, campaign management, sequencing, AI-generated outreach, CRM.

---

## 4. Also open, unrelated to Resend

- **`ANTHROPIC_API_KEY` has no credit.** Blocks: the coverage-analysis agent's
  first real run (built, deployed, never executed); comparison layer 4
  (trade-off narration — the evidence grid is a clean input for it); layer 5
  (market/industry analysis, which also needs an outside data source, since
  `buildMarketInsight` is pool-internal only); and deleting the losing branch in
  `run-sourcing-search.ts`, which still carries both sides of an untested
  assumption about combining `web_search` with `output_config.format`.
- **The waitlist has never been exercised.** `public.waitlist` holds ZERO rows —
  no request has ever been submitted, so `notifyFoundersOfWaitlistRequest` has
  never run against a real payload. There is no evidence of a delivery defect
  because there has been no delivery to attempt. The send path there remains
  untested rather than broken.
- **Verification debt.** Never seen with real data: the evidence grid populated,
  the HM portal grid, and — most importantly — **no comparison PDF has ever been
  generated and looked at.** `@react-pdf/renderer` layout can differ from what
  the JSX suggests, especially a table with a variable column count.
- **Password rotation.** The founder's Mandate password was pasted into two
  sessions and is shared with their Resend login. Both should be rotated.
- Deferred infra, founder's own order: Sentry → rate limiting → Resend → Stripe.

## 5. Needs counsel, not code

- The model now accepts **only successful email sends** as notification. A
  recruiter who notifies someone by phone or LinkedIn has no way to record it.
  Deliberate tightening — confirm it is the intended policy.
- Root domain vs `mail.` / `send.` subdomain for transactional sending.
- The notice wording in `compose.ts` is deliberately non-jurisdictional (names
  the rights to object and to erasure, nothing more). Wants a lawyer's eye
  before it reaches a real candidate.
