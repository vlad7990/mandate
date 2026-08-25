# The OKR programme, slice four — THE EXTERNALS — Phase 0 + THE D-GATE — 2026-08-25 — DRAFT

**Status: DRAFT. Nothing here is confirmed. The slice proceeds only
on the founder's written word against THIS document. This is the
programme's LAST gate: on its confirmation — with admins never
touched, per the brief — the programme closes and the pre-launch
checklist takes the slot (the standing order).**

---

## Part 1 — What Phase 0 found

### Who the externals are

`hiring_manager`, `client_hr`, `client_admin` — principals of a
CLIENT company (067's XOR: `client_id` set, `organization_id` NULL),
holding `portal:read` and nothing else. They live on /portal and
read through five SECURITY DEFINER RPCs (069: `portal_context`,
`portal_list_mandates`, `portal_get_mandate`,
`portal_list_my_reviews`, `portal_list_grants`) — never the org's
tables. The HM is mandate-scoped by grants; HR and the client admin
are client-scoped by shares.

### The boundary already holds, verified live

A forged-JWT probe (2026-08-25, rolled back): an external
hiring_manager principal reads **ZERO** rows from `objectives` and
`objective_key_results` — structurally, twice over: the org-match
predicate (`organization_id = current_user_org_id()`) is never true
for a NULL org, and `can_read_org()` is false for every external
role. The same probe: creation refused; the intent door leaves
nothing on the trail. No portal RPC mentions objectives. There is
nothing to close — the door was never built.

### What "the same for each persona" collides with here

An org's OKRs are its internal performance book. Shown to a client,
a missed target is leverage against the agency and an outperforming
one is an invitation to renegotiate fees. Unlike every staff
persona, the external's interest and the org's are not aligned by
employment — this is the one persona where MORE visibility is a
commercial risk, not a feature.

---

## Part 2 — THE D-GATE (drafted, awaiting the founder's word)

### D1 — Externals never author, own, or attest — the ruling made doctrine

Structural today; this ruling makes it permanent doctrine alongside
"agents hold no goals": **clients hold no org goals.** No capability,
no owner admission, no attestation — in any future slice, of any
future programme.

**Recommend: confirm as doctrine.**

### D2 — Externals see nothing of the programme — and "commitments" are deferred OUT of it

The real question, answered plainly: no objective, key result,
progress number or outcome is ever rendered to an external — not on
the portal, not in an export, not in an event. The alternative that
was considered and is NOT recommended now: client-visible delivery
commitments (a deliberate per-objective publishing act — a shared
flag, a new portal RPC on the mandate_shares model, mandate-scoped,
no money ever). That is a real product idea and a COMMERCIAL
decision, not persona parity; if ever wanted it gets its own gate
("the commitments gate") after the pre-launch checklist, designed as
publishing, never as default visibility.

**Recommend: nothing rendered, commitments deferred out of the
programme. RULING REQUESTED — this is the founder's commercial line.**

### D3 — The slice is a harness invariant, not a build

No migration, no capability change, no portal change, no drive — a
drive would screenshot the absence of a page that was never built.
The deliverable is the Phase 0 probe made PERMANENT: okr_invariants
gains invariant **(14) THE EXTERNAL BOUNDARY** — an external
hiring_manager principal in the harness org's client reads zero
objectives and zero key results, is refused creation, and leaves
nothing at the door; asserted BY NAME like every other refused face.
Run live, rolled back.

**Recommend: as stated.**

### D4 — The ladder on confirmation, and the programme's close

Harness invariant (14) added and run live · § 120 DRAFTED recording
the slice AND the programme's completion claim: five slices —
Recruiter/Manager (§114), Researcher (§116), Viewer (§118),
Externals (§120), **Admins NEVER (the brief's own word — no gate
needed, the exclusion is the ruling)** · on the founder's
confirmation of § 120: NEXT-okr-programme.md is DELETED per doctrine,
the programme closes, and THE PRE-LAUNCH CHECKLIST takes the slot
(CLAUDE.md standing order).

## Part 3 — Named rulings

- **R1 — the money boundary ends where it began:** untouched by
  every slice of the programme; the externals never came near it.
- **R2 — no verdicts, and now no audiences:** OKRs measure the org's
  own searches, desks and delivery, for the org's own eyes.
- **R3 — the roster is complete:** staff measured (recruiter,
  manager, researcher), the viewer reads, the externals see nothing,
  the admins are support, the agents hold no goals.

Numbers at drafting: next migration 109 (unused), next § 120, next
drive 0f9 (unused); vitest 929; activity CHECK 80; intent door 14;
durable baseline 25/24/74/5/5/1/1/2/2/1/1 + tasks 0 + objectives 0 +
key_results 0.
