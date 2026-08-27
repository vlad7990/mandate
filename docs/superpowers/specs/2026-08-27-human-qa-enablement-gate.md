# HUMAN QA ENABLEMENT — THE GATE — 2026-08-27 — DRAFT

**Awaiting the founder's word.** Three rulings are already given and are
recorded here as settled; five remain open below.

Settled 2026-08-27:

- **QA runs in production, in a dedicated QA organisation.** Not a
  separate project — the point is to test the real thing: Turnstile,
  Resend, storage prefixes, cron, and the 93s `after()` chain.
- **G.3 — key on insert only; never re-key.** The relationship link is
  set once, and a parser guess can never move it.
- **Two or more testers, including a non-founder.** Triangulation needs
  divergent human opinions; the HM portal's whole point is someone who
  has never seen it.

---

## Part 1 — What QA needs, in code

### The good news: the QA org needs no build

Migration 114 already made approval a **provisioning act**. Approving a
waitlist request creates *a new organisation (or a seat in an existing
one)* plus a staff invitation, issued from the founder's own session
under `organizations_founder_insert` — this table's first and only legal
INSERT policy. R2 of that gate stands: **approval issues an invitation,
never an account.** The requester's account exists only when they set
their own password at `/join`.

So standing up the QA org is the onboarding path used exactly as
designed — and provisioning it *is itself the first QA test*, walked by
a real stranger rather than a hand-minted persona. No migration, no
policy, no new machinery for any of it.

Hand-minting personas is a drive technique and stays out of QA. Human
testers arrive through the real door, with their own passwords.

### The constraint worth knowing before planning: sample data is for looking

All 46 dashboard routes ship sample data behind `SampleBanner`. But
`isSampleId` routes `sample-` ids to fixtures and **never to Supabase**,
deliberately — *"a live account must never mix invented rows with real
ones."* A tester sees every screen populated and can act on none of it.

Two consequences that shape the QA plan:

1. **The accumulated-state screens are empty until a mandate is actually
   run.** Metrics, search health, calibration cards, OKRs, invoice
   history all need a walked mandate behind them. This is QA work, not
   seed work — but it must be *sequenced first*, or four later passes
   report "blank screen" against a working product.
2. **Triangulation cannot be tested by one person.** It is fed by
   recruiter feedback plus HM reviews. Two testers with genuinely
   different opinions, or it stays unproven.

### The five loops (from §128's Phase 0 map, reused)

The surface map already exists and becomes the charter's skeleton: the
search loop · the HM portal · the Triangulation Report · PDF exports at
four sites · email drafts. That mapping was written for the bench test
the founder waived; the map outlived the test.

### One unmeasured trap, inherited

Phase 0 found email drafts are `mailto:` URLs and mail clients refuse or
clip around **~2000 chars**. A long evaluation body may open blank. It
has never been measured. A human will find this on day one and file it
as "email is broken" — measure the real draft lengths against the
ceiling *before* a tester ever clicks one.

---

## Part 2 — THE GATE (five rulings, awaiting the word)

### D1 — G.1 and G.2: the honesty half of the identity finding

G.3 closes the **safety** half — the DNC gate can no longer be answered
for the wrong human. It does not close the **honesty** half: the
candidate row still displays the identity the CV asserted rather than
the one the applicant typed and consented to give.

- **G.1 — does the typed identity win on `source='apply'`?**
  *Recommendation: yes, for `email` and `full_name` both, and only for
  `apply`.* A recruiter upload has no declared identity to defend; an
  apply row does, and the Art.13 notice was given against those exact
  details.
- **G.2 — when the two disagree, is the CV's identity discarded, or kept
  visibly beside the declared one?** *Recommendation: kept and
  surfaced.* §175's doctrine is that the system must not assert what it
  does not know, and *"these two disagree"* is knowledge — silently
  resolving it is the same defect class in a new costume.

### D2 — G.3's sub-case: may an UPDATE fill a NULL link?

"Never re-key" is unambiguous when a link exists. It is silent on the
row that inserts with **no** link — `resolve_network_profile` returns
NULL when `full_name` is blank, and today a later parse would fill it.

*Recommendation: allow fill-if-null, refuse all re-keying.* Filling a
NULL cannot misroute anything: there is no existing link whose DNC could
be inherited, and no declared identity being overridden. The apply door
always supplies a typed name, so an apply row is keyed at insert and
never reaches this path at all — the case is a recruiter upload with a
blank name, where the CV is genuinely the only identity there is.

If the founder prefers the harder line — insert-only, full stop — the
cost is that a blank-name upload keeps a NULL relationship link forever
and must be linked by hand.

### D3 — How does teardown assert, now that a second org never dies?

**This is the one with the widest blast radius.** Every durable baseline
assertion written to date is a *global* count (`select count(*) from
public.users`). A QA org that grows freely and is never torn down breaks
every one of them on the first tester login.

*Recommendation: scope the baseline to the house org.* Future teardowns
assert `where organization_id = <house org>` on org-scoped tables, and
the QA org is explicitly **uncounted and unasserted**. Globals survive
only for genuinely global tables.

Two riders, learned the expensive way in §192:

- The new assertion must **count `network_profiles` and
  `inference_runs`**, which drifted through six drives precisely because
  nobody counted them.
- The house-org baseline must be **re-captured and written down as law**
  the moment the QA org exists, or the next drive asserts against a
  number that silently stopped meaning anything.

### D4 — Does the QA org get the ILLUSTRATIVE treatment?

Standing law: *non-real data always carries a visible label at the point
of display.* QA data is, strictly, not real.

*Recommendation: exempt the QA org, and carry the label in the org name
instead.* That law exists to stop **users and clients** being misled by
invented figures. The QA org's only members are testers who know exactly
what they are looking at, and banner-ing every screen would change the
thing under test — a tester cannot report "this screen reads wrong" if
the screen is wearing a notice no real user will ever see.

This is a deliberate, narrow exemption to a standing law and should be
ruled explicitly rather than assumed. The sample-mode banner is
untouched either way: it is a different mechanism for a different
condition, and §D3-2026-08-17 already said *do not invent a third one.*

### D5 — What happens when a tester finds something?

*Recommendation: reuse §128's D3 verbatim — findings land as a punch
list, not as fixes.* A tester filing into a queue, triaged after the
pass, each fix its own numbered entry with its own green gate. Fixing
mid-pass invalidates everything tested before it and destroys the run's
meaning.

Open sub-question the founder should answer: **does QA use the apply
link?** *Recommendation: yes, but only after G.3 ships.* It is the front
door and the least-driven surface in the product.

---

## Part 3 — What gets built, if the gate passes

Small. One migration, one guard, one document.

1. **Migration 135 — G.3.** Recreate `candidates_link_network_profile`
   as `BEFORE INSERT` (plus the D2 fill-if-null branch if ruled).
   **Trap that applies: a replaced function inherits PUBLIC EXECUTE and
   silently joins the anon roster — revoke, then COUNT the roster (14,
   the ruled number).** No FK is added, so `embed-ambiguity.test.ts`
   needs no `AMBIGUOUS_PAIRS` regeneration; `describe.test.ts` (CHECK
   99) and `door-sites.test.ts` are untouched.
2. **A guard test for insert-only keying**, asserted on behaviour and
   **mutation-tested before it is trusted** — a source-text guard only
   guards source text.
3. **G.1/G.2 in the parser persist path**, if ruled.
4. **The QA charter** — the five loops as an ordered tester script, the
   known-dark list, the defect template, role-by-role passes across the
   five staff roles (`admin`, `manager`, `recruiter`, `researcher`,
   `viewer`) and the three external ones (`hiring_manager`, `client_hr`,
   `client_admin`).
5. **The mailto ceiling, measured** and recorded in the charter as
   either a known-dark line or a punch-list entry.

### The known-dark list the charter must carry

Testers file every one of these unless told. Sending domain unverified ·
bounce feedback dark (`RESEND_WEBHOOK_SECRET`) · transcripts dark
(`DEEPINFRA_API_KEY`) · Twilio parked · Stripe parked.

### Founder hour, in sequence

**`leaked-password protection` must be toggled BEFORE testers set
passwords** — it is the one founder-owned item with a real ordering
constraint, and it is a Supabase toggle. Then the sending domain (or
email tests produce false failures) and the service-role key rotation
before more people hold access. UptimeRobot is not blocking.

---

## Part 4 — What this slice is NOT

Not a seed script — testers create real rows, which is the point. Not a
new environment. Not a feature. Not a fix for anything a tester finds:
under D5 those land as a punch list with their own gates.

---

Numbers if this passes: migration **135**; next § **193**; next drive
**126**; vitest 1146 + the new guard; CHECK 99 unchanged; door 26;
allowlist 31; **anon roster stays 14 — verify after 135**; capability
map 36.
