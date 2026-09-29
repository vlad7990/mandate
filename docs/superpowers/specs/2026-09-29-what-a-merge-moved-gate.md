# WHAT A MERGE MOVED — THE GATE — 2026-09-29 — DRAFT

**Awaiting the founder's word. Four rulings. D1 is load-bearing: it decides
whether a request owns the row it wrote, and D2/D3 are only arguable once it
is answered. D4 is a live defect found on the way that has to be fixed
somewhere, and the only question is whether it is fixed here.**

The ask, as the session left it: *"a `not_subject` decline lifts the
request's own person and its carried copies — but §207/§208 never ruled what
happens to a suppression a MERGE moved rather than carried."*

Researching it found the question has a sharper edge than it was asked with,
and a second defect sitting next to it that is not about lifting at all.

---

## Part 1 — What it does today

### 1.1 §208 records lineage for COPIES, and nothing for MOVES

`network_suppressions.carried_from` answers "which row is this a copy of".
It is written by a carry — §203's merge of a person into another, §207's
repoint on an identity edit — and it is what lets a lift travel exactly as
far as the suppression did.

A **merge** does something different. It does not copy the discarded
person's rows onto the survivor; it **moves** them (155):

```sql
UPDATE public.network_suppressions
   SET profile_id = p_keep
 WHERE profile_id = p_discard AND organization_id = v_org;
```

That is right — after a merge the two people ARE one person, so their reasons
are all now that person's reasons, and nothing was copied. But the row keeps
`carried_from` exactly as it was, and **nothing anywhere records that the row
used to be filed against a different profile**. Drive 142 did this live: the
January erasure filed against "Alpha" ended up on "Bravo", indistinguishable
from a reason Bravo had always held, while a copy elsewhere still pointed at
it as its origin.

So the ledger can say *"this is a copy of that"* and cannot say *"this was
filed against somebody who is now this person"*.

### 1.2 The erasure request never learns which row it wrote

`record_network_suppression` **returns the new row's id**. The erasure path
throws it away, using it only as a truthiness test (155):

```sql
IF v_profile IS NOT NULL AND public.record_network_suppression(
     v_profile, 'erasure requested via their portal', 'erasure') IS NOT NULL THEN
```

`candidate_erasure_requests` has fourteen columns and none of them is a
suppression id. The link between a request and the row it caused exists for
the length of one statement and is then gone.

### 1.3 So the decline re-finds the row by fingerprint — a narrower one

`closeErasureRequestAction` (`src/app/ops/erasure-actions.ts`), on a
`not_subject` decline:

```ts
.eq("profile_id", updated.network_profile_id)
.eq("source", "erasure")
.is("lifted_at", null)
.order("set_at", { ascending: true })
.limit(1)
```

§208 replaced §207's fingerprint (match the reason text, require no human
setter) with this. Its own comment says it lifts "by LINEAGE, not by
fingerprint". **It does not.** It lifts *the earliest unlifted erasure row on
this profile*, which is the same row as the one this request wrote only while
a profile never holds two.

§1.1's move is exactly what makes a profile hold two. Two people who each
asked to be forgotten, merged, are one person with two erasure rows — and
declining the second one as `not_subject` lifts the **first**: a suppression
nobody declined, standing on a basis nobody disputed, belonging to the other
request. Worse, per §208 D2 that lift **travels**: everything carried from
the wrongly-chosen row is un-suppressed too, and the founder is shown those
names under a sentence about the request they are actually declining.

The safe half is real and worth naming: the person themselves stays
suppressed, because the row that *should* have been lifted is still standing.
The unsafe half reaches other people.

### 1.4 The live defect next door: that merge cannot happen at all

`candidate_erasure_requests_open_idx` is UNIQUE on
`(organization_id, COALESCE(network_profile_id::text, identity_key))`
`WHERE status = 'open'` — one open request per person. The merge repoints
unconditionally:

```sql
UPDATE public.candidate_erasure_requests r
   SET network_profile_id = p_keep
 WHERE r.network_profile_id = p_discard AND r.organization_id = v_org;
```

Two open requests, one profile, is precisely what that index forbids.
**Proven live against production, in a transaction that rolled itself back:**

```
REPOINT REFUSED by candidate_erasure_requests_open_idx:
duplicate key value violates unique constraint "candidate_erasure_requests_open_idx"
```

So: **two people who have each asked to be forgotten cannot be merged.** The
merge aborts whole, and what the operator sees is a raw Postgres duplicate-key
message on a screen about combining two people. Nothing in the product
mentions erasure; nothing suggests what to do.

The same file already assumes the opposite. Immediately below the repoint it
counts open requests on the survivor into the merge's receipt:

```sql
SELECT count(*) INTO v_erasures ... WHERE r.network_profile_id = p_keep AND r.status = 'open';
```

A count written as though several were possible, guarded by an index that
allows one. One of those two is wrong, and this gate has to say which.

### 1.5 What would have to keep working

The §200 copy door and the send ladder both read `candidate_erasure_open()`,
which ORs four arms and fails CLOSED. 153's widening of `covered_candidate_ids`
on a merge is load-bearing for the copy door. `network_profiles.dnc` stays
derived, and `guard_network_dnc` stays the only door. No answer here may make
an erasure gate answer "open" less often than it does today.

---

## Part 2 — The rulings

### D1 — does a request own the row it wrote? *(load-bearing)*

**Recommended: yes — `candidate_erasure_requests.suppression_id`**, a FK to
`network_suppressions(id)`, `ON DELETE SET NULL`, written at file time from
the return value that is currently discarded. The decline lifts **that row**,
or lifts nothing and says so.

Everything in §1.3 stops being arguable: a moved row is still the row this
request wrote, so a merge changes nothing about which suppression a decline
answers. It also makes the existing comment true.

*Alternative: keep re-finding it, but tie-break better* — earliest row whose
`set_at` is nearest the request's `created_at`, say. Cheaper, no migration,
and still a guess; the failure mode is un-suppressing people on a basis
nobody declined, which is the one failure §207 and §208 both exist to stop.

*Alternative: refuse to lift when the profile holds more than one erasure row*
and make the founder pick. Safe, honest, and it leaves the product unable to
answer a question it has the data to answer.

### D2 — should the ledger record a move, not just a copy?

**Recommended: yes, minimally — `moved_from_profile uuid` stamped by the
merge** (the discarded profile's id, no FK, since that row is about to be
deleted), plus `moved_at`. It is two columns and one `SET` clause in a
statement the merge already runs.

It does not change any lift: a move is not a copy and still must not make a
lift travel. It buys the trail the ability to say *"this reason came onto
this person when Alpha was merged into them on 28 September"*, which is the
question the relationship card cannot answer today and which §208 D3 answers
for every other fact on that row.

*Alternative: record nothing.* Defensible — after a merge the reasons ARE the
survivor's — but it means the ledger permanently cannot distinguish "they
said no twice" from "two people who turned out to be one person each said no
once". D3 puts both sentences on the same card.

### D3 — what the relationship card says about a moved reason

**Recommended: if D2 is taken, the source line gains "— came across when
<name> was merged in"**, on that row only. If D2 is not taken, the card says
nothing new, because it would have nothing true to say.

*Alternative:* a separate "history" disclosure. More screen for a fact that
belongs on the row it is about.

### D4 — the merge that cannot happen (§1.4): here, or its own slice?

**Recommended: here, and the fix is that the two requests become one.** The
merge closes the discarded person's open request as `resolved` with a
system-recorded note naming the merge, leaves the survivor's open request
standing, and the ledger rows both move as they do now (so the person stays
suppressed on both reasons regardless). The receipt already has a slot to say
so. `v_erasures` then honestly counts at most one.

The alternative shape — relax the index to allow several open requests per
person — is bigger than it looks: `candidate_erasure_open()` and the ops
queue both read as though a person has *an* open request, and D1's
`suppression_id` is what would make several of them tractable at all.

*Alternative: its own slice.* It is a live defect reachable by two supported
acts, and it is in the same statement D1 and D2 both edit. Leaving a known
abort in place to keep a slice tidy is how it becomes permanent — §208 D5
made this same call about the withdrawal path, and that reasoning has not
changed.

*Founder's call either way:* whether closing somebody's erasure request as a
side effect of a merge is acceptable at all, or whether the merge should
REFUSE with a sentence naming the two requests and let a human close one
first. The second is more conservative and costs the operator a step; it is
the only option here that never resolves a person's request without a person
deciding to.

---

## Part 3 — As it would be built, under the recommended rulings

**Migration 157.**

- `candidate_erasure_requests.suppression_id uuid REFERENCES
  network_suppressions(id) ON DELETE SET NULL`, plus an index.
  `candidate_portal_request_erasure` stops discarding the return value.
- Backfill: for each OPEN request whose profile holds exactly ONE unlifted
  erasure row, bind it. Where the profile holds none or several, leave NULL —
  which is unknowable, not a guess, the same call §208 D4 made.
- `network_suppressions.moved_from_profile uuid` + `moved_at timestamptz`,
  set by the merge's existing `UPDATE ... SET profile_id = p_keep`.
- The merge closes the discarded person's open erasure request before the
  repoint, so the repoint cannot collide; the receipt names it.
- `closeErasureRequestAction` lifts `request.suppression_id` and, when it is
  NULL, lifts NOTHING and says plainly that the row this request set could
  not be identified — the honest absence, not a fallback guess.

**Guards, mutation-tested:** the filing binds the row it wrote; the decline
lifts by `suppression_id` and never by `(profile, source)`; a NULL binding
lifts nothing and says so; a merge of two people each holding an open request
SUCCEEDS and leaves exactly one open; a moved row keeps `carried_from`
untouched (a move is not a copy); the backfill binds only the unambiguous
case.

**Drive 143, live:** two people each file an erasure; merge them and watch
the merge SUCCEED where today it aborts on the index; the survivor holds two
erasure rows and one open request; decline the open one `not_subject` and
prove it lifts ITS OWN row — the other stands, the person stays suppressed,
and nobody carried-from the other row is touched. Then the card showing the
moved reason as moved. Teardown exact.

---

## Part 4 — What this does NOT do, named

- **It does not make a lift travel further.** A move is still not a copy;
  `carried_from` remains the only thing a lift follows.
- **It does not change who may lift** — founder only, reason mandatory.
- **It does not add an un-merge**, which remains the inherited gap under all
  of this, and which D2's `moved_from_profile` would be the first fact an
  un-merge needed.
- **It does not revisit §207's four-arm gate or its fail-closed posture.**
- **It does not recover which request wrote a suppression before this slice**
  where a profile holds several (D1's backfill says so rather than guessing).

---

## Part 5 — As ruled, and as driven

**Ruled 2026-09-29.** D1, D2, D3 as recommended. **D4: RELAX THE INDEX** —
the founder's call, against this gate's own recommendation. Several open
erasure requests may stand against one person; the index keys on the
IDENTITY instead. That makes D1's `suppression_id` load-bearing rather than
merely correct: with two open requests on one person, "which row is this
request's?" must be stored, not inferred.

**Built** as migration 157 (applied as `a_request_owns_the_row_it_wrote`),
commit a0a421b, prod `mandate-gc3nwhl6b`. One departure from Part 3: D2's
stamp is a **BEFORE UPDATE OF profile_id trigger** rather than a line in
`merge_network_profiles`, for the reason §208 made the derivation a trigger —
the record of a move must not be something a future writer can forget.
`merge_network_profiles` is therefore untouched by this slice; it stopped
colliding because the index changed.

**A GUARD WAS HOLDING THE DEFECT IN PLACE.** `erasure-binding.test.ts`
asserted the decline READS `network_suppressions` and filters on
`source='erasure'` — it required the very search §1.3 shows is a fingerprint.
Rewritten to require the binding and forbid the search, and mutation-tested
in its new direction.

**Drive 143, live in production, teardown exact:**

  S1  Two people each file an erasure through `candidate_portal_request_erasure`
      — the function the portal calls. Both requests BOUND to their own
      ledger row; both people suppressed.
  S2  **The merge succeeded**, through the product's own merge panel, where
      before 157 it aborted on `candidate_erasure_requests_open_idx`. The
      survivor holds TWO unlifted erasure rows and TWO open requests, each
      request still owning its own row. The moved row carries
      `moved_from_label`; its `carried_from` is still NULL — a move is not a
      copy.
  S3  /ops showed **"SAME PERSON AS 1 OTHER"** on both rows, so two requests
      that are one human do not read as two strangers.
  S4  Declining the SECOND request `not_subject` lifted **its own** (moved)
      row. The first request's row STANDS, its request still open, and the
      person is **still suppressed**. Under §208 this decline would have
      taken the earliest erasure row on the profile — the FIRST request's —
      lifting a suppression nobody had declined and travelling to every copy
      of it.
  S5  A third person, suppressed by a recruiter, merged in: the card renders
      **"CAME ACROSS WHEN DRIVE143 REX MOVED WAS MERGED IN · 2026-09-29"** on
      that reason and on no other.

Teardown exact against all twelve counts: candidates 4, network_profiles 4,
network_suppressions 0, suppressed 0, aliases 0, folded 4, portal_tokens 0,
erasure_requests 0, activity_events 134, orphan profiles 0, users 27,
projects 4.

**§209 is closed.**

**Residue, found on the drive, NOT a defect of this slice:** the Network
fold titles a row from its most recent candidate record, so the merged
person's card was headed "Drive143 Rex Moved" while the profile's
`display_name` — and the merge receipt — said Nell Park. Pre-existing; worth
its own look.
