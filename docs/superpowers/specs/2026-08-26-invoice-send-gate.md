# INVOICE SEND — SLICE 2 GATE — 2026-08-26 — DRAFT

**Status: Phase-0-verified gate DRAFT. Nothing is built. This slice was
deferred at D.4 of the programme gate (5f2820d) because it needs
rulings that are not derivable from the code, and it still does. The
build starts only on the founder's written word against Part D below —
and Part D cannot be answered by me, which is the whole reason this is
a separate slice.**

Slice 1 shipped the *free* half of sending on day one, as ruled:
`openMailDraft` puts a pointer email in the recruiter's own mail
client and the PDF travels by the print path. That works today and
nothing here removes it. This slice is about the app sending the
invoice **itself**, from an address the agency owns, with delivery
recorded.

---

## A. Phase 0 — verified facts this design stands on

1. **The transport already exists and is already used.** `RESEND_API_KEY`
   and `RESEND_FROM` are live in production; `src/lib/comms/resend-provider.ts`
   wraps Resend behind a `CommsProvider` type, and the weekly report,
   the desk digest and the waitlist notifier all send through it.
   Nothing new needs provisioning to send an email.
2. **The doctrine around sending is CANDIDATE-scoped.** `send-policy.ts`
   (099) evaluates a `SendActor` against DNC state and per-day caps and
   returns a typed refusal. It is written about candidates: the caps
   protect people who did not ask to be contacted. A client who has
   just been invoiced is a different relationship, and applying the
   candidate doctrine to them by default would be an assumption, not a
   design. **This is decision D.2.**
3. **Delivery events already have a home.** `/api/webhooks/resend`
   verifies Resend's svix signature *before* the database hears
   anything, then calls the `record_email_delivery_event` definer RPC
   (one of the ruled twelve anon grants). It refuses outright when
   `RESEND_WEBHOOK_SECRET` is absent — and that variable is **not set
   in production today** (verified 2026-08-26). So bounce handling has
   plumbing but no key, and the key is founder-owned.
4. **The invoice is already a frozen, printable document** (§158):
   `invoices` carries `from_snapshot`, `bill_to`, its lines and its
   number, and the page IS the A4 layout. What it does not have is a
   stored PDF — printing happens in the browser, so there is no file on
   the server to attach. **This is decision D.3.**
5. **Clients have contacts, and they have emails.** `client_contacts`
   is org-scoped with the composite `_in_org` twin, so a recipient can
   be picked from the client's own contact list rather than typed —
   and typed-by-hand must still be possible, because the person who
   pays an invoice is often not the person who ran the search.
6. **The trail is ready for one more intent.** CHECK is 92 and the
   intent door 25 after 123; the invoice intents already ride at
   `fees` visibility. An `invoice_sent` event is a fourth member of
   that family and needs no new visibility tier.

## B. What the slice would build, once ruled

- **Migration 126**: `invoice_sent_at` / `invoice_sent_to` on
  `invoices` (a snapshot of the address it went to, the 050 frozen-copy
  rule again), or a small `invoice_deliveries` table if D.4 rules that
  resends are kept rather than overwritten. The one-way door widens by
  exactly one transition: `issued → issued+sent`. Void still voids.
- **The send action**: `fees:read` + `mandates:write`, the same pair
  that issues. It renders the invoice to a PDF **server-side** or
  attaches a link (D.3), calls the provider, records
  `invoice_sent` on the trail at `fees` visibility, and stamps the row.
- **The refusal surface**: an invoice that is a draft cannot send; an
  invoice with no bill-to address cannot send; a client on whatever
  suppression rule D.2 lands on cannot send — each with the honest
  sentence the product uses everywhere else.
- **Delivery feedback**: if D.5 says yes, the webhook's existing
  events are joined to the invoice so the recruiter can see
  *delivered* / *bounced* rather than *sent and hoped*.

## C. Deliberately NOT in this slice

Payment links and Stripe (parked LAST, standing) · dunning, reminders
or overdue chasing (a scheduler, and this project has one cron — it
would need its own gate) · client-portal invoice visibility · sending
anything other than an invoice to a client · storing client email
threads.

## D. Decisions requiring the founder's word — none of these are mine

1. **The from/reply-to identity.** `RESEND_FROM` today is the
   product's own address, used for digests and waitlist mail *to
   staff*. An invoice is the agency billing its client and must come
   from the agency — a different domain, verified in Resend, with SPF
   and DKIM. Which address, and is it per-org (a column on the invoice
   template, which already carries the billing identity) or one
   founder-level address for now?
2. **Does client email join 099's cap and log doctrine?** My
   recommendation is a NARROW yes: log every send, and honour an
   explicit client-level suppression, but do NOT apply the
   candidate per-day caps — a client who is owed three invoices should
   receive three invoices. Confirm, or rule otherwise.
3. **Attachment or link?** The print path is browser-side, so there is
   no PDF on the server today. Either (a) add a server-side renderer
   for the invoice — a SECOND renderer, which §133 exists to avoid, and
   which could disagree with the printed copy; or (b) send the email
   with the totals in the body and the recruiter attaches the printed
   PDF; or (c) a tokenised read-only invoice link, which is a new
   public route and therefore a new proxy-allowlist entry and its own
   RLS question. I recommend (b) for this slice and (c) as its own
   later gate, because (a) reintroduces exactly the divergence the
   one-renderer rule was written to prevent.
4. **Resend or overwrite on re-send?** Does an invoice sent twice keep
   two delivery rows (an audit trail of what the client actually
   received) or one stamp that moves? I recommend keeping both.
5. **Bounce handling.** `RESEND_WEBHOOK_SECRET` is not provisioned.
   Does this slice wait for it, ship without delivery feedback, or
   ship with the feedback path dark and honestly absent (the Deep
   Infra pattern from §155)? I recommend the third.

---

Numbers at drafting: next migration 126 · next § 161 · next drive 112 ·
vitest 1082 · CHECK 92 / door 25 / allowlist 29 / anon roster 12.
Founder-owned prerequisites that this slice cannot invent: a verified
sending domain for D.1, and `RESEND_WEBHOOK_SECRET` for D.5.
