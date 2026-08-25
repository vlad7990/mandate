# The OKR programme, slice three — THE VIEWER — Phase 0 + THE D-GATE — 2026-08-25 — DRAFT

**Status: DRAFT. Nothing here is confirmed. The slice proceeds only
on the founder's written word against THIS document (the §112/§114/
§116 precedent). Slices one and two (§114, §116) are confirmed and
untouched.**

Scope per D9: the viewer persona. This is the programme's degenerate
case, and the gate says so rather than inventing work: a viewer is
read-only across the org by definition ("writes nothing anywhere" —
roles.ts), holds no delivery machinery (no candidates:write, no
mandates, no placements credit), and exists to be handed to a
stakeholder who watches.

---

## Part 1 — What Phase 0 found

### What the viewer already has, verified

- **The read surface is complete.** /app/objectives renders for every
  active role; for the viewer the subhead says "read-only" and every
  authoring affordance (create form, KR composer, Attest, Close met/
  missed, Abandon) is behind `okrs:write`, which the viewer does not
  hold. Analytics' OBJECTIVES section shows them quantitative and
  qualitative progress. Placements shows them the "Fees restricted"
  panel and no financial strip.
- **Every negative is already pinned BY NAME in the harness**
  (okr_invariants.sql, thirteen invariants, live): the viewer refused
  as an owner (4), refused creation (5), refused at the intent door
  (12), reading ZERO financial rows while reading the quantitative
  one (8).
- **The role's own definition decides the subject question.** A
  viewer measured by delivery metrics would read zero forever —
  every target a standing accusation against someone the role bars
  from delivering. Measuring them would not be an OKR; it would be a
  trap.

### What "the same for each persona" can honestly mean here

Visibility. The stakeholder the viewer role exists for is exactly
who the founder's brief wants strategy to be legible to — and they
already see the objectives, the owners, the progress and the
outcomes, minus the money. That is the persona's whole OKR
experience, and it is live today.

---

## Part 2 — THE D-GATE (drafted, awaiting the founder's word)

### D1 — The viewer is a reader of the programme: never an author, never a subject

No `okrs:write`, no owner admission, no schema change, no migration.
The alternative (viewer as a desk-set subject) is rejected for the
reason in Part 1 — a target on a role that cannot deliver is an
accusation, not an objective.

**Recommend: confirm as the ruling. This is the slice's substance.**

### D2 — The slice is VERIFICATION-ONLY

Nothing to build. The slice's deliverable is proof, not code:

- **Drive 0f8**, a scratch viewer in production: the board renders
  read-only (subhead line, zero buttons, zero forms), Analytics
  shows progress without money, Placements shows the restriction
  panel and no strip, and a direct URL probe of the create path
  changes nothing (the actions assert `okrs:write` server-side and
  RLS is the boundary beneath them).
- One harness addition worth its line: the viewer's POSITIVE — they
  can read an objective's row and its non-financial key results —
  is currently asserted only via KR counts in (8); extend (8) to pin
  the objectives read too, so the persona's purpose (visibility) is
  a named invariant, not a side effect.

**Recommend: as stated — no migration 109, vitest unchanged or +0,
one harness line, one drive.**

### D3 — The ladder on confirmation

Harness edit (the (8) extension) run live · drive **0f8** (scratch
viewer; the 0f6/0f7 teardown lessons: sweep the member-audit rows by
name, public.users before auth.users) · § 118 DRAFTED, no completion
declared; NEXT-okr-programme.md edited only on written confirmation.
No deploy is needed unless the harness edit finds something.

## Part 3 — Named rulings

- **R1 — the money boundary holds by construction.** Nothing in this
  slice touches it; the drive re-proves it at the surface.
- **R2 — no verdicts, trivially.** No metric, no subject, no target
  attaches to a viewer.
- **R3 — one persona per gate.** After the viewer: the EXTERNALS —
  the real open question (what an OKR means for an HM/client
  persona: client-visible delivery commitments? SLA-shaped? portal
  rendering through SECURITY DEFINER RPCs?) — then the programme
  closes with admins never touched.

Numbers at drafting: next migration 109 (unused by this gate), next
§ 118, next drive 0f8; vitest 929; activity CHECK 80; intent door
14; durable baseline 25/24/74/5/5/1/1/2/2/1/1 + tasks 0 +
objectives 0 + key_results 0.
