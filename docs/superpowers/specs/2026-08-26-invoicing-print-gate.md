# INVOICING + PRINT PASS — PROGRAMME GATE — 2026-08-26 — DRAFT

**Status: Phase-0-verified gate DRAFT. Nothing is built. Build
starts only on the founder's written word against THIS document —
slice by slice, R4 style. The founder's ask (2026-08-26): proper
personas create custom invoice templates (logos, structures),
generate invoices populated by placement data, pick placements from
a list onto an invoice, print or send to the customer from the app;
plus print ability across other sections where it makes sense.
BOUNDARY: this is document generation and delivery — Stripe and
anything payment-shaped stays parked LAST (standing order,
untouched).**

---

## A. Phase 0 — verified facts the design stands on

1. **The line items already exist.** `placement_fee_lines` (050):
   label, sequence, amount, currency (+ base-currency FX columns),
   status pending|earned|cancelled, earned_on, trigger — an
   invoice's body is a SELECTION of these, not new arithmetic. The
   050 doctrine holds: no new money math; the invoice snapshots
   what the fee tables already computed.
2. **`placement_fees` carries the terms**: currency,
   payment_terms_days (due date = issue date + terms), totals,
   FX bookkeeping. `placements` carries client_id / candidate /
   dates.
3. **The org has NO billing identity** — `organizations` is
   name+slug; `clients` have name/domain but no billing address.
   Invoice "from" and "bill to" must be captured, not joined.
4. **The print precedent is ruled and elegant** (§133, the EI
   report): the PAGE is the print layout — `@media print` in
   globals.css, `window.print()` produces the A4 PDF, ONE renderer
   so the exported copy cannot disagree with the screen. Separate
   @react-pdf exports exist (evaluation, comparison, weekly
   report) and stay as they are.
5. **Send precedents, two tiers**: `openMailDraft` (mail-draft.ts,
   1900-char mailto + clipboard — carries a POINTER, cannot carry
   an attachment) and the comms service (099, Resend) — which is
   CANDIDATE-scoped with DNC/caps doctrine; emailing CLIENTS is a
   new audience that needs its own ruling and its own gate.
6. **Personas**: `fees:read` = admin/manager/recruiter — the
   ruled money-visibility trio; `org:manage`/`skills:write` = the
   admin-authoring precedent (Skills Studio). Externals and agents
   touch none of this.
7. **Trail**: activity_events carries a `fees` visibility tier
   (053) — money events exist without leaking amounts to
   org-visible rows. CHECK 89 / door 22 today.
8. **Storage precedent ×2** (cvs, call-audio): private org-scoped
   bucket, session-client upload, signed URLs.

## B. The programme — three slices, each its own word

### Slice 1 — the invoice domain, builder, and print

**Migration 123**, three tables on the house shapes:

- **`invoice_templates`** — org-scoped; name; `logo_path` (new
  private `invoice-assets` bucket, org-first-segment RLS trio,
  image mimes, 2MB); `structure` jsonb: the FROM identity (org
  billing name, address lines, company/VAT numbers, bank/payment
  instructions TEXT), header/footer text, numbering prefix,
  default payment-terms fallback. The template IS where the org's
  billing identity lives (B.3) — founder-editable per template, no
  organizations migration. Authoring is ADMIN territory (the
  Skills/models precedent): route + actions behind a NEW
  `invoices:manage`… or reuse — see D.1.
- **`invoices`** — org-scoped; client_id; template_id (SET NULL —
  an issued invoice outlives its template); `invoice_number`
  (unique per org, template prefix + per-template sequence);
  status `draft | issued | void` with a one-way door (a trigger:
  issued never edits its money fields, void never revives — the
  037 immutability family); issue_date; due_date; currency;
  `bill_to` jsonb SNAPSHOT (client name + address as typed);
  `from_snapshot` jsonb (the template's identity AS OF issue);
  totals as STORED sums of lines; notes.
- **`invoice_lines`** — invoice_id; placement_id + fee_line_id
  (both SET NULL — the document outlives the rows it billed);
  label, amount, currency SNAPSHOTTED from the fee line at add
  time. An invoice is a historical document: fee edits after
  issue must never rewrite it (the actor_label precedent, applied
  to money).

**RLS**: the fee-family predicates verbatim — SELECT
`can_read_fees()`, writes `can_write_mandates()` (050's own
split); template writes admin-gated per D.1. Agents: nothing —
invoicing is human work; no agent allowlist change.

**The builder** (`/app/placements/invoices`, prefix under the
Placements surface, route capability `fees:read`): pick a client →
its placements with EARNED, un-invoiced fee lines listed (the
founder's "choose placements from the list") → lines land on the
draft with snapshotted label/amount → edit labels, add free lines,
reorder → issue (number minted, snapshots frozen, one-way).
A fee line already on an issued invoice shows as billed — a
visibility rule in the builder query, not a schema constraint
(void releases it).

**Print**: the §133 pattern exactly — the invoice page IS the A4
layout (logo via signed URL, template header/footer, lines table,
totals, payment instructions), `@media print` + the
PrintReportButton shape. No second renderer.

**Trail**: three new intents — `invoice_created`,
`invoice_issued`, `invoice_voided` — written at `fees` visibility
(the 053 tier: the org sees nothing; the money trio sees the act;
amounts ride detail ONLY because the rows are fees-tier). CHECK
89 → 92; intent door 22 → 25, gated `can_read_fees() AND
can_write_mandates()` (the fee-writer's act). Agent allowlist
stays 29; anon roster stays 12.

### Slice 2 — send to the customer from the app

Day one (inside slice 1, free): `openMailDraft` on an issued
invoice — subject + pointer body to the recruiter's mail client;
the PDF travels by the print path. REAL in-app send (Resend, the
invoice attached or linked) gates HERE separately because it needs
founder rulings that are not mine to assume: the from/reply-to
address for client-facing mail, whether client emails join the
comms service's cap/log doctrine (099 is candidate-scoped), and
bounce handling. Phase 0 for that slice reads the Resend webhook
plumbing already live.

### Slice 3 — the print pass

The §133 pattern applied where a page is already a document.
Phase-0 inventory: **gets print** — triangulation report,
company-intelligence report, culture report, shortlist view,
client-interview approved set (recruiter-side), candidate
evaluation panel (print complements its @react-pdf export; the
founder's mail-client testing showed PDFs working — print is the
zero-dependency second path). **Does NOT get print** — dashboards,
lists, settings, the registry console (screens, not documents);
the portal/HM token pages (externals get what the org shares,
not a print pass, without a ruling). Each page: `@media print`
rules + the shared PrintReportButton. No schema, no trail.

## C. Deliberately NOT in this programme

Payments, Stripe, payment links, reconciliation (parked LAST,
standing) · credit notes and partial invoicing (a later slice if
real use demands) · multi-currency conversion ON the invoice (it
bills in the fee line's own currency; the FX bookkeeping stays in
the fee tables) · client-portal invoice visibility (externals see
invoices only if a later gate rules it) · agent involvement of any
kind · editing issued invoices (void + reissue is the only path).

## D. Decisions requiring the founder's word

1. **Capability shape**: recommend NO new capability — template
   authoring rides `org:manage` (admin, like Members), invoice
   create/issue rides `mandates:write` + `fees:read` (the 050
   split: the trio that writes placements and sees money). The
   alternative is a named `invoices:write`. Which?
2. **Numbering**: per-template prefix + sequence (INV-2026-0001),
   minted at ISSUE (drafts unnumbered). Confirm?
3. **Trail at fees visibility with amounts in detail** (the rows
   are invisible outside the money trio). Confirm?
4. **Slice 2 deferred** behind its own gate (mailto + print ship
   in slice 1; real send needs the from-address and
   client-comms rulings). Confirm?
5. **The print-pass inventory** as listed in B-slice-3 — name any
   page to add or strike.
6. **Sequence**: slice 1 → 3 → 2 (print pass before send, since
   send's rulings may take founder time). Confirm or reorder?

---

Numbers at drafting (§155 + §156 DRAFTED, await confirmation):
next migration 123 · next § 157 · next drive 110 · vitest 1060 ·
CHECK 89 / door 22 / allowlist 29 / roster 12. D-ladder on the
slice-1 word: migration 123 (three tables + bucket + trail
widening) · template studio · builder · print layout · mailto ·
unit tests · green gate · commit · deploy · drive 110 (template
with logo → invoice from real placement lines → issue → print
probe → refusals: issued-is-immutable, non-money-role sees
nothing → teardown by value) · §157 DRAFTED, no completion
declared · memory updated.
