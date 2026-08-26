# GATE — THE CLIENT PORTAL — 2026-08-26

**Status: DRAFT. Awaiting the founder's written word. Nothing is built.**

Programme frame: ledger
`docs/handoffs/2026-08-13-roles-clients-placements-advisor-action-errors.md`,
last entry §162. Next migration 127; next § 163; next drive 113;
vitest 1096; CHECK 93; door 26; allowlist 29; anon roster TWELVE.

---

## 1. What this programme is

`/portal` is the signed-in client surface — the one place a real client
logs into and looks at their own search. It is the least-built surface
in the product and the first one a first client touches.

Two named residues point at it:

- **§144/§145** closed the client-interview slice but left a ruling
  open: `portal_get_mandate` and the signed-in door. The client
  interview is answerable through the token link and invisible to the
  logged-in client.
- **§162** named *client-portal invoice visibility* as something the
  invoicing programme deliberately did not do.

This gate proposes to close both, and asks what else the portal owes a
client.

## 2. What exists today — verified, not remembered

Four routes, 1,438 lines: `portal/page.tsx` (the shared-search list),
`portal/mandates/[id]/page.tsx` (one mandate), `portal/people/` (the
client admin's grant ledger), `portal/settings/`.

The read surface is **migration 069**: externals hold *no base-table
policy on any domain table*. Six SECURITY DEFINER RPCs are their entire
world — `portal_context`, `portal_list_mandates`, `portal_get_mandate`,
`portal_list_my_reviews`, `portal_list_grants`,
`portal_slate_candidate_ids`. Each returns only what its page renders,
because a signed-in external holds the anon key and can call every one
of them from a browser console. Anything this programme adds inherits
that discipline: **a new portal read is a new RPC, never a policy.**

Access is `can_view_portal_mandate` (069 §2): share ∧ (client_hr ∨
client_admin ∨ per-user grant). Every branch fails closed; suspended
and pending externals resolve to NULL and fail the share test.

### 2.1 The finding — door three is broken as documented

`client-interview-section.tsx` (lines 9–13) states the question set is
rendered by three doors, read-only on two of them:

> The answer form is live solely on the token door (`/hm/[token]`): the
> founder preview and the signed-in `/portal` door see the same
> questions read-only, because the slice's one answer door is the token
> path.

Doors one and two honour it — `hiring-manager/page.tsx:209` and
`hm/[token]/page.tsx` both pass `clientInterview`. Door three does
not: `portal/mandates/[id]/page.tsx:166` renders `PortalContent`
without `clientInterview` or `interviewAnswerToken`, and
`portal_get_mandate` never selects from `client_interviews` at all.

So the signed-in client sees **nothing** — not the read-only set the
comment promises. The shared `buildPortalClientInterview` helper says
"shared by all three doors"; two use it. This is the §144 residue
stated precisely, and slice 1 corrects it.

The product consequence is the odd one: **the anonymous token holder
can answer; the authenticated, named, attributable client cannot.**

---

## 3. Proposed slices

**Slice 1 — the client interview reaches the signed-in door.**
`portal_get_mandate` carries the approved set; the section renders;
D1–D3 decide whether it can be answered there and how the answer is
attributed.

**Slice 2 — invoice visibility.** New portal RPCs in the 069 shape so a
client can see what they have been billed, and print the frozen row
through the existing §133/§160 print path. D4–D6.

**Slice 3 (optional) — the client's own trail.** "What has happened on
my search" — a read-only, visibility-filtered activity feed. Named here
so it can be pulled in or ruled out, not assumed. D7.

---

## 4. DECISIONS — the founder's word is needed on each

### D1 — Does the signed-in door answer the client interview, or only read it?

The token door exists because a client interview can be sent to someone
who has no account. A signed-in client is the *stronger* principal —
they are named, active, share-verified, and grant-checked — yet today
they are the weaker one.

- **(a) Read-only.** Honour the existing comment: render the set, no
  form, and point at the emailed link. One answer door stays the law.
  Cheapest, and it keeps exactly one path into the Feedback Interpreter.
- **(b) A second answer door, session-authenticated.** *(recommended)*
  The signed-in client answers in place. A new SECURITY DEFINER
  entry point mirroring `record_client_interview_answered`, gated on
  `can_view_portal_mandate` rather than a token, EXECUTE granted to
  `authenticated` only — the anon roster stays at TWELVE. Reuses
  `persistClientInterviewAnswers` and the existing interpreter
  unchanged.

I recommend (b). The asymmetry in (a) is hard to defend to a client who
is looking at the questions while logged in, and (b) buys real
attribution the token path can never have. But (b) opens D2 and D3.

### D2 — If (b): how is a signed-in answer attributed?

The token path is **label-only by design** (069 D5) — answers land as
one mandate-level `feedback` row carrying an `hm_label` text. `feedback`
has no submitter column.

- **(a) Label only.** Stamp the row's `hm_label` with the signed-in
  user's name. No migration, no new FK. But the attribution is a
  *string* — it cannot be trusted, joined, or revoked.
- **(b) A real FK.** *(recommended)* Add
  `feedback.submitted_by_user_id uuid REFERENCES users(id) ON DELETE
  SET NULL`, nullable so the token path stays honestly anonymous, and
  put `guard_author_in_org` on it — the exact pattern 069 used for
  `hiring_manager_reviews.submitted_by_user_id`, extended in 068 to
  admit an external of one of the org's clients. Fourth use, no new
  machinery.

I recommend (b): "who said this" is a fact the desk will want when two
people at the client disagree, and a text label cannot answer it.

⚠️ **(b) adds a foreign key**, which means `embed-ambiguity.test.ts`
must have its `AMBIGUOUS_PAIRS` list regenerated using the SQL in its
own header. Standing lesson, not optional.

### D3 — If (b): may every colleague answer, and does every answer recalibrate?

This is the decision I am least comfortable making for you.

The token door is one link, typically one person, once. A signed-in
door is *N colleagues*, each of whom can answer the same approved set —
and each submission rides the Feedback Interpreter, which **recalibrated
the mandate live in drive 103**. Three hiring managers answering the
same questions differently could thrash the calibration model.

- **(a) Anyone who can view it may answer it, every answer
  interprets.** The access predicate is already the ruling; don't
  invent a second one. Simplest, and highest thrash risk.
- **(b) Anyone may answer; answers accumulate but only the FIRST per
  mandate triggers interpretation**, later ones land as feedback the
  desk reads. Honest, but "your answer was recorded and ignored" is a
  hard sentence to write.
- **(c) One answer per person, all interpret; the desk sees who
  answered what.** *(recommended)* Mirrors `portal_list_my_reviews` —
  own rows only, re-answering replaces your own. Thrash is bounded by
  headcount, not by clicks, and disagreement between two named clients
  is *signal* the interpreter should see, not noise.
- **(d) client_admin / client_hr only** — the mandate is interviewing
  the *company*, so the company's account holders answer and a
  hiring_manager reads.

I recommend (c). If you'd rather be conservative on day one, (d)
composes with it.

### D4 — Do invoices appear in the client portal at all?

- **(a) No.** Invoices are a desk artifact delivered by email (§162's
  slice 2, live through Resend). The portal stays about the search.
  Zero new surface, zero new leak.
- **(b) Yes, read-only.** *(recommended)* A client can see what they
  have been billed without asking. This is table stakes for a paid
  service, and it is the natural home for the frozen row the invoicing
  programme already renders.

I recommend (b) — but note this is the decision with real money
sensitivity behind it, and (a) is a perfectly respectable answer that
costs this programme nothing.

### D5 — If (b): what crosses, exactly?

- **Statuses.** Recommended: **issued and void only.** A draft is the
  desk thinking aloud and must never be visible. Void must be visible
  — a client who saw an invoice should see that it was cancelled.
- **Lines.** An invoice line names its placement. Recommended: **lines
  cross.** The client hired the person; an invoice with a total and no
  explanation invites the email you were trying to avoid. But a line
  can reference a placement the *viewer* never saw, which is D6's
  problem, not the line's.
- **Print.** Reuse `PrintReportButton` and the §133 print scope —
  `window.print()` stays callable from exactly ONE file
  (`print-report-button.test.ts`). No second renderer, no server-side
  PDF, consistent with §162 D.3.
- **Not crossing:** the template studio, numbering, fee visibility on
  *other* clients, delivery rows and bounce state (`invoice_deliveries`
  is desk machinery), and anything writable. **The client portal gets no
  write path to the invoice domain at all.**

### D6 — If (b): which external roles see invoices?

`portal_list_grants` already gates on `is_client_admin()`, so the
precedent exists.

- **(a) `client_admin` only.** *(recommended)* Money is an account-holder
  concern. A hiring manager seeing the agency's fee for the person they
  just hired is a real-world awkwardness with no upside.
- **(b) `client_admin` + `client_hr`.** HR often owns the budget.
- **(c) Everyone who can see the mandate.** Not recommended.

I recommend (a), with (b) as the easy widening if you tell me HR pays
the bills in practice.

### D7 — Scope and slice order

- **(a) Slice 1 only.** Close the §144 residue, stop. Smallest, and
  the portal stays a search surface.
- **(b) Slices 1 then 2.** *(recommended)* Two gates' worth of residue
  closed in one programme, each shipping and driving separately.
- **(c) Slices 1, 2, 3.** Adds the client-visible trail — more surface,
  more visibility rulings, and slice 3 has no standing residue behind
  it.

I recommend (b). Slice 3 is real but speculative; I'd rather it earn
its own gate once a client has actually used the portal.

---

## 5. What this programme deliberately will NOT do

Stripe and payments (parked LAST by standing order). Any agent
involvement in the portal — the allowlist stays at TWENTY-NINE and
externals remain outside `is_agent()` entirely. Any write path from the
portal to the invoice domain. Any change to the token door, which keeps
its label-only anonymity. Any base-table RLS policy for externals — the
069 doctrine holds: **RPCs are the read surface.** Editing an issued
invoice; void-and-reissue remains the only path. Client-visible
candidate data beyond the slate `portal_get_mandate` already computes.

## 6. Structural obligations if this is built

- `embed-ambiguity.test.ts` — regenerate `AMBIGUOUS_PAIRS` if D2 lands
  on (b), using the SQL in its own header. Any new FK.
- `describe.test.ts` — the CHECK count and app-recordable list. **My
  intent is to reuse `client_interview_answered` for the signed-in
  answer** (it is the same fact, differing only in attribution), so
  CHECK stays 93 and this guard stays untouched. Say if you want a
  distinct event type instead.
- `print-report-button.test.ts` — one file calls `window.print()`.
  Slice 2 reuses the shared control.
- Door stays **26**: externals go through SECURITY DEFINER RPCs, never
  the staff intent ladder. Allowlist stays **29**. Anon roster stays
  **TWELVE** — every new function is `authenticated`-granted and
  EXECUTE-revoked from `anon`, per 069 and 117.
- Every new RPC returns only what its page renders, and is assumed
  reachable from a browser console.

## 7. Green gate and drive

Per house pattern: tsc / vitest / eslint / build → commit → `vercel
deploy --prod --yes` (`--force` if `globals.css` moves, per §160) →
**drive 113** live in prod with exact teardown → §163 DRAFTED, no
completion declared, awaiting the founder's word.

Drive 113 must prove, live: the signed-in client sees the approved set
(and a mandate with no approved set says so honestly); the answer path
per D1–D3 including its refusals; the RPC returns NULL for a mandate
that is shared-but-not-granted; a suspended external gets nothing; the
agent fence holds; and — if slice 2 — a draft invoice is invisible while
an issued one prints exactly. Teardown exact, all baseline counts
restored fresh-statement.

---

## 8. What I need from you

A written word on **D1, D2, D3, D4, D5, D6, D7**. My recommendations,
in one line: **D1(b) answer in place · D2(b) real FK · D3(c) one answer
per person, all interpret · D4(b) yes, read-only · D5 issued+void,
lines cross, existing print path · D6(a) client_admin only · D7(b)
slices 1 then 2.**

"Confirm the recommendations" is sufficient if you agree with all of
them; name the exceptions if you don't.
