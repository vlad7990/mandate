# NEXT — The final two personas: Mandate app Admin, Candidate

Five of seven personas are served (§17, §20, §21–§22). This file plans
the remaining two — the platform operator (persona 6, today an
`is_founder` boolean wearing a persona's clothes) and the candidate
(persona 5, today no support at all). Same phased shape as the last
four programmes: Phase 0 decisions → model → surfaces → verification →
verdicts → founder sign-off. Delete this file when both completions are
declared.

**Gate: no build work past Phase 0 until the founder confirms D1–D12.**

---

## Where this starts from (2026-08-19, HEAD `1be57af`)

- Next migration: **072.** 767 tests, tsc/lint/build green.
- **The operator is a boolean, not a persona.** `users.is_founder`
  gates waitlist triage, pending-user approval and the cross-org read
  (002's `founders_can_read_all_users` / `founders_can_update_users`),
  and the privilege guard's founder fast-path returns early past every
  column rule. The allowlist is hardcoded twice — `founders.ts` and the
  002 signup trigger — kept in sync by hand. The founders are
  simultaneously org admins of Mandate HQ, and the two hats share
  `/app/settings` with nothing on screen saying which hat is acting.
- **A candidate is rows, not a person.** `candidates` is per-project
  (org, project, email, phone, CV, links, `pipeline_stage`); the same
  human is N rows deduped only at read time (`identityKey`, Network).
  The subject-notification machinery already exists
  (`candidate_notifications`, `candidates.subject_notified_at`) — the
  product already tells a candidate they are in a pool; it just gives
  them nowhere to go. No principal class exists for them: the 067 XOR
  is deliberately two-way (staff/org, external/client).
- **The proven patterns this can stand on:** the HM token portal
  (credential-less, per-person, per-org scoped links — the door the
  external programme itself started with), SECURITY DEFINER RPCs as the
  read boundary where RLS cannot express the shape (069), invitation +
  delivery-honesty machinery (068, §21), and the §21/§22 verdict that
  multi-relationship identity federation stays deferred until it
  happens to a real person.
- **Standing blocker, founder-owned:** Resend DNS at Namecheap.
  Anything that emails a candidate rides the same delivery-honesty
  fallback (link in the recruiter's hand) until the domain verifies.

## Phase 0 — Decisions for the founder (D1–D12)

### D1 — Order: operator first, candidate second
The operator slice is a naming-and-surfacing of powers that already
exist — no new principal class, no email dependency, and it builds the
administration surface (account lifecycle, erasure handling, cross-org
view) that the candidate programme will lean on. The candidate slice is
the largest new read surface since the portal, touches the deferred
federation question, and emails outsiders — better second, and better
after the operator has a real home to administer it from.

### Mandate app Admin (persona 6)

### D2 — `is_founder` stays the boundary; the persona gets a name, not a new role
No ninth role: a platform operator belongs to neither an org nor a
client, and a `platform_admin` value in `users.role` would force the
067 XOR three-way and every staff enumeration to remember to exclude
it — the exact fail-open shape 067 closed. Instead the capability layer
gets a named platform tier (`platform:operate`) resolved from
`is_founder`, and pages/actions stop asking the boolean directly. The
allowlist stays a code change **by design**: adding an operator is a
deploy, reviewed in git, mirrored in the 002 trigger — an allowlist UI
is how a compromised operator account mints another.

### D3 — The operator gets their own home: `/ops`
Its own route tree with its own chrome, like `/portal` — founder-only
at the proxy, refusing by name. It consolidates what exists (waitlist
triage, pending-user approval, the cross-org user/org roster, external
accounts across clients) plus platform counts, and `/app/settings`
sheds the founder-only sections in return. Today the operator hat and
the Mandate-HQ-admin hat share one screen; the persona thesis is that
every persona has its own home, and the operator is the last one
squatting in someone else's.

### D4 — Operator acts are audited by construction
Every operator mutation (approve, suspend, org-move, waitlist triage,
erasure execution) writes a trail event in the affected org with the
founder as actor. Phase 1 pins the list of acts; the invariants file
asserts one event per act with the operator as actor, the same shape
§21 proved for externals. The founder fast-path in the guard keeps its
power — what changes is that the power leaves a record.

### D5 — What the operator surface deliberately does not do
Impersonation ("view as user") — declined; it is the one power that
would make every attribution in the trail a lie. Cross-org *recruiting*
data browsing (candidates, scores, fees) — not on the surface; the
operator administers accounts and organisations, not searches, and the
load-bearing negative is that `/ops` renders no fee and no candidate
row. Support cases that need data access are founder SQL, deliberate
and logged, not a screen.

### D6 — AI agents as principals: out of this slice, stated
The 2026-08-12 founder statement stands recorded: agents authenticate
as principals under the same role model, not ambient service-role
trust. Nothing today authenticates as an agent, and bolting a
credential model onto the 14 agents is its own programme with its own
decisions (per-agent accounts? per-org grants? key rotation?). It is a
verdict candidate here so the absence carries a name, and a NEXT file
of its own when its turn comes.

### Candidate (persona 5)

### D7 — The candidate door is a token portal first, a login later (maybe)
The HM programme's own history, applied: externals started with
credential-less tokenized links, and the login came when the persona
proved out. A candidate principal class would need everything the
deferred federation verdict deferred (one person, N orgs, one email)
plus a person-level anchor the schema does not have (candidates are
per-project rows). A **per-candidate, per-org token** — the
`hiring_manager_tokens` pattern — needs neither: it scopes to what the
org holds about that person, revocation is a row, and the §21/§22
verdict stands untouched (the same person courted by two orgs holds two
links, which is the honest shape of two relationships). Credentialed
candidate login becomes a verdict candidate, decided by real usage.

### D8 — What a candidate sees: the truth table
Their own identity data as the org holds it (name, contact fields, CV
file, links, source and `sourced_at` — the §14/W7 transparency data),
and the searches of that org they appear in, each as a **role title and
a pipeline stage in plain words**. The load-bearing negatives, pinned
by invariants: never scores, tiers, rankings, HM reviews, recruiter
assessments or notes, other candidates, fees — and **not the client's
name** unless the search's client was already disclosed to them
(mandate confidentiality is the client's, not the candidate's;
default-hidden, recruiter-disclosed is the draft).

### D9 — What a candidate can do
Correct their own contact fields and replace their CV (a SECURITY
DEFINER RPC with column discipline — the org's assessment columns are
not theirs to touch); **withdraw** from a search (pipeline stage moves,
trail event with the candidate as subject, recruiter sees it where they
work); **request erasure** — which files a request the operator and the
owning org see on their surfaces, execution staying founder-hand per
the §14 retention verdict until that verdict is built. No self-service
deletion of rows: the request is the honest primitive.

### D10 — The notice is the door
`candidate_notifications` already tells a candidate they are in a
pool. The token link rides that notice (and is available to the
recruiter to hand over by any channel, delivery honesty as always).
No separate invitation machinery: one notice, one link, one place a
candidate enters from.

### D11 — Multi-org stays two links
No federation, per §21/§22 as confirmed. Each org relationship is its
own token with its own scope; nothing joins them, and nothing needs to
until a real candidate asks.

### D12 — Out of scope, stated
Credentialed candidate login (verdict candidate, per D7); interview
scheduling; candidate–recruiter messaging; candidate-visible feedback
or scores in any form; any client-side view of candidate portal
activity. Each is a verdict or a later slice, not a silent absence.

## Phases — operator slice (A)

- **A1 — Model (072).** `platform:operate` in the capability layer
  resolved from `is_founder`; the pinned list of operator acts each
  writing a trail event (those that do not yet, gain it);
  `operator_invariants.sql` + control run: a non-founder staff admin
  reaches no `/ops` data and no operator RPC (raised), each operator
  act leaves exactly one attributed event, the guard's founder
  fast-path still refuses nothing to the founder (the power is kept,
  the record is new), and the load-bearing negative — no policy grants
  `platform:operate` holders any fee or candidate read they did not
  already hold.
- **A2 — Surfaces.** `/ops` (own chrome, proxy-gated by name):
  waitlist, pending approvals, orgs + users across the platform,
  external accounts, erasure-request queue (empty until B ships, shown
  with labelled sample data per the house rule). `/app/settings` sheds
  the founder-only sections.
- **A3 — Verification.** Production drive under a scratch second
  operator... **no** — the allowlist is a code change by design, so
  the drive uses the real founder account read-only plus a scratch
  non-founder admin proving every refusal; scratch data deleted, counts
  to baseline.
- **A4 — Verdicts** presented for sign-off before any completion
  declaration: allowlist UI (declined per D2), impersonation (declined
  per D5), agents-as-principals (deferred per D6), operator MFA
  (candidate for the auth-hardening batch).

## Phases — candidate slice (B)

- **B1 — Model (073+).** `candidate_portal_tokens` (per candidate row
  set / per org — anchored the way `identityKey` groups rows; the
  migration states the anchor explicitly), read RPCs shaped by D8's
  truth table, write RPCs per D9 (contact/CV, withdraw, erasure
  request), trail vocabulary for the three acts;
  `candidate_portal_invariants.sql` + control run, with D8's negatives
  as the spine (a token reads no score, no review, no fee, no other
  candidate, no undisclosed client name; a spent/revoked token reads
  nothing).
- **B2 — Surfaces.** `/candidate/[token]` route tree (own chrome,
  hard-public like `/invite/[token]`), the recruiter-side "hand over
  the link" affordance beside the existing notice machinery, the
  erasure-request queue lighting up on `/ops` and the org's side.
- **B3 — Verification.** Production drive: scratch org, recruiter,
  project, candidate; notice → token → candidate corrects a field,
  replaces CV, withdraws, files erasure; recruiter and operator each
  see what they should where they work; every negative probed at the
  RPC layer with a real token; teardown to baseline.
- **B4 — Verdicts** for sign-off: credentialed candidate login
  (deferred per D7), scheduling/messaging (declined at this scale),
  candidate-visible feedback (declined), notice cadence and token TTL.

## Who else this waits on

Resend DNS at Namecheap (candidate notices by email fail honest with
the link in the recruiter's hand until the domain verifies — same as
invitations, proven twice). Nothing else external.
