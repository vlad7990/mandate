# HOW FAR DOES A LIFT TRAVEL — THE GATE — 2026-09-28 — DRAFT

**Awaiting the founder's word. Five rulings. D1 decides whether a
suppression stays one field or becomes a ledger — every other answer here
falls out of it. D2 is the question as asked.**

The ask: **"gate the lift-travel question."** §207 slice two's drive left it
named: a `not_subject` decline lifts the suppression on the request's own
person, but not on a person slice one carried it to. The drive ended with a
second profile still suppressed on a basis the operator had just declared
false.

Researching it found the question is downstream of a defect nobody has
ruled on: **a person can only hold one suppression at a time, and the
second one destroys the first.**

---

## Part 1 — What it does today

### 1.1 Four ways in, one way out

Suppression is four columns on `network_profiles` — `dnc`, `dnc_reason`,
`dnc_set_at`, `dnc_set_by` — written through `guard_network_dnc`'s door by
exactly four acts:

| act | reason | set_by |
|---|---|---|
| `set_network_dnc` — a recruiter decides | their words | the recruiter |
| the portal's **withdrawal** (098) | "candidate withdrew via their portal" | NULL (the system) |
| the portal's **erasure** (098, §207) | "erasure requested via their portal" | NULL |
| a **carry** — §203's merge, §207's repoint | *the original's, copied* | *the original's* |

And one way out: `clear_network_dnc(profile, reason)` — founder only, a
reason mandatory, one profile, writes `network_dnc_cleared`.

### 1.2 Since §207, suppression TRAVELS — and the copies are not marked

A carry writes the original's reason, timestamp and setter onto the
destination. That was deliberate: a suppression wearing today's date and
nobody's name has lost the two facts that make it answerable. The
consequence is that **a carried suppression is indistinguishable from an
original**, except by the coincidence of an identical `(reason, set_at,
set_by)` triple. Nothing records that B's suppression came from A.

§207's decline already leans on that coincidence: it lifts only when the
reason is the system's own string and no human is named as setter. It works,
and it is a fingerprint, not a fact.

### 1.3 The residue, as the drive left it

`not_subject` lifts the request's person. The person the suppression was
carried to stays suppressed, on a basis the operator has just said was
false, with no way to find them except by matching that triple by hand.

### 1.4 The defect underneath: the second reason destroys the first

Both carries use the same rule — *the earlier suppression is the first time
they said it* — and implement it by **overwriting the whole quadruple**:

```sql
dnc_reason = CASE WHEN v_carried THEN v_dnc_src.dnc_reason ELSE p.dnc_reason END,
dnc_set_at = CASE WHEN v_carried THEN v_dnc_src.dnc_set_at ELSE p.dnc_set_at END,
dnc_set_by = CASE WHEN v_carried THEN v_dnc_src.dnc_set_by ELSE p.dnc_set_by END,
```

So: B asked a recruiter to stop contacting them in March. In April a merge
(or an identity edit) brings in A, suppressed in January by an erasure. A's
January record is earlier, so it wins — and **B's own reason, date and
recruiter are gone**. The product can no longer say why B is suppressed; it
says why *A* was.

Then the erasure is declined as `not_subject`. If a lift travelled today, it
would un-suppress B — somebody who asked for themselves, whose asking was
overwritten an hour earlier by a rule meant to protect them.

That is why lift-travel cannot be decided on its own.

### 1.5 Adjacent, found on the way: the withdrawal path still misses

§207 aimed the erasure's suppression at the **person** it resolved, because
matching `identity_key` silently suppressed nobody when the key had drifted
since the link was issued. The **withdrawal** path in the same file was not
changed and still reads:

```sql
WHERE np.organization_id = v_tok.organization_id
  AND np.identity_key = v_tok.identity_key
  AND NOT np.dnc;
```

A candidate who withdraws through a portal link issued before their email
was corrected is not suppressed, and nothing says so.

### 1.6 What would have to keep working

A dozen files read `dnc` — the send ladder, the Network table's badge, the
relationship card, the merge panel, four agent context builders, the
profile resolver. The folded view does not carry it; it arrives through the
overlay. Any answer that changes the shape of this data has to leave that
column reading exactly as it does now.

---

## Part 2 — The rulings

### D1 — is a suppression one field, or a ledger? *(load-bearing)*

**Recommended: a ledger.** `network_suppressions`: one row per reason per
person — who, when, why, which act, and the row it was carried from.
`network_profiles.dnc` stays exactly where it is as a **derived flag**
maintained by trigger ("any unlifted row"), so all dozen readers are
untouched and the send ladder's question does not change.

Three things fall out at once, rather than being argued separately:

- **Nothing is overwritten.** B's March reason and A's January one are two
  rows. The earlier still governs what the badge shows; neither is lost.
- **Lineage is a fact, not a fingerprint.** A carry writes a row with
  `carried_from`, so "who else holds a copy of this suppression" is a query.
- **A lift is per reason.** Lifting one leaves the person suppressed while
  any other stands, which is the only safe way to make lifting travel.

*Alternative: keep the quadruple, add `dnc_origin_id`.* Cheaper, gives
lineage, and leaves 1.4 exactly as it is — one reason per person, the
second still destroying the first.

*Alternative: fingerprint matching* (lift everything sharing the triple).
No migration. It is a guess dressed as a rule, and the failure mode is
un-suppressing somebody the guess got wrong.

### D2 — does a lift travel, and how far? *(the question as asked)*

**Recommended: only along recorded lineage, only from the origin, and never
silently.** Lifting an origin offers to lift the rows carried from it; the
founder is shown *"this also lifts N other people"* with their names before
confirming, and each lift is recorded on its own person with its own
`network_dnc_cleared`. Lifting a **copy** lifts only that copy — it does
not reach back to the original, because the original is somebody else's
answer.

*Alternative: it never travels* (today). Defensible — over-suppression is
the safe failure — but it leaves people uncontactable on a basis already
declared false, findable only by hand, and the product cannot tell the
recruiter why.

*Alternative: it travels automatically.* The one operation in the product
that can un-suppress several people at once, performed without anybody
seeing who. Whatever the rule, it must not be that.

### D3 — what the reader sees when a person has two reasons

**Recommended: suppressed while any unlifted reason stands; the badge shows
the EARLIEST (the first time they said it); the relationship card lists
them all with their sources.** A person suppressed twice is a person who
said no twice, and a card that shows one of them is the §175 class again.

*Alternative:* show only the governing reason. Smaller, and it hides that a
lift will leave the person suppressed — which looks like a bug at exactly
the wrong moment.

### D4 — the backfill, and what can never be recovered

**Recommended: one row per currently-suppressed profile, carrying its
existing quadruple, `source` inferred from the four known reason strings,
`carried_from` NULL.** Lineage before this slice is unknowable — the
overwrites already happened — so **pre-existing suppressions never
travel**, and the ledger says so rather than guessing.

Production holds **0 suppressed people** right now, so the backfill is
empty and nothing has to be inferred at all. Same cheap moment §207 had, and
the same reason to take it now.

### D5 — the withdrawal miss (1.5): here, or its own slice?

**Recommended: here.** It is one statement, the same shape as the fix §207
already made to its sibling, in a file this slice is opening anyway. Leaving
a known silent miss in place to keep a slice tidy is how it becomes
permanent.

*Alternative:* its own gate. It would be a gate with one ruling in it.

---

## Part 3 — As it would be built, under the recommended rulings

**Migration 154.**

- `network_suppressions` (id, organization_id, profile_id, reason, source,
  set_at, set_by, carried_from → self, lifted_at, lifted_by, lift_reason).
  RLS on the org, writes only through the definer functions — the same
  posture `network_profiles`' dnc columns have now.
- `network_profiles.dnc` and the quadruple become **derived**: a trigger on
  `network_suppressions` recomputes the flag and stamps the governing
  (earliest unlifted) row's reason/when/who onto the profile. `guard_network_dnc`
  stays exactly as it is — it is what keeps anybody from writing the derived
  columns by hand.
- The four setters insert a row instead of updating columns;
  `carry_network_suppression` and `merge_network_profiles` insert rows with
  `carried_from` set; `clear_network_dnc` lifts one row, and gains a
  companion that lifts an origin **and its descendants**, returning who was
  affected so the caller can show it before it happens.
- §207's decline calls that companion for `not_subject`, and its fingerprint
  heuristic is deleted — the reason it existed is gone.
- The withdrawal path aims at the resolved person (D5).

**Guards, mutation-tested:** the flag is derived and never writable
directly; two suppressions on one person keep two rows and two reasons; the
earliest governs; a lift of one leaves the other standing; a lift travels to
descendants and not to ancestors; a lift never touches a row with a
different origin; the backfill leaves `carried_from` NULL so old
suppressions cannot travel.

**Drive 141, live:** suppress B by hand; file an erasure against A; merge
them and show BOTH reasons on the card with the earliest governing; decline
`not_subject` and watch the confirmation name who else it reaches; lift, and
prove B is **still suppressed** for their own March reason while A's is
gone. Then the withdrawal path against a drifted key. Teardown exact.

---

## Part 4 — What this does NOT do, named

- **It does not loosen contagion.** Suppression still spreads on a merge and
  a repoint and is still never lowered by them. This slice is about the one
  act that lowers.
- **It does not change who may lift** — founder only, reason mandatory.
- **It does not revisit the erasure request rows** (§207 is law), and it
  adds no new app-recordable intent: a travelled lift is an existing
  `network_dnc_cleared` per person.
- **It does not recover lineage that was already overwritten**, and it does
  not pretend to (D4).
- **It does not add an un-merge**, which remains the inherited gap under all
  of this.
