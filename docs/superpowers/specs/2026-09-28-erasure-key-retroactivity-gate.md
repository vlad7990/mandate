# WHEN SOMEBODY ASKS TO BE FORGOTTEN, WHAT IS IT ATTACHED TO — THE GATE — 2026-09-28 — DRAFT

**Awaiting the founder's word. Five rulings. D1 decides what a suppression is
attached to; D3 decides whether this slice also closes the DO-NOT-CONTACT
hole the probe below found, or leaves it for a gate of its own.**

The ask: **"gate the erasure key retroactivity question."** §204 D4 named it
and deliberately did not touch it: *the erasure gate still keys on
`identity_key`, so an erasure filed against one of a merged person's keys
does not cover the other.* Researching it found the hole is wider than the
merge, and that the same hole runs through the door §204 called safe.

---

## Part 1 — What it does today

### 1.1 There is exactly one gate, and it is the outbound message

`candidate_erasure_requests` (073) is two things in one row: a queue item the
operator works, and a live refusal in the send ladder. The refusal is the
only enforcement anywhere in the product — `erasureOpen` appears in
`send-policy.ts` and nowhere else:

```ts
// send-candidate-message.ts, the suppression facts
supabase.from("candidate_erasure_requests")
  .select("id")
  .eq("identity_key", identityKey(candidate))   // ← computed from the row, NOW
  .is("resolved_at", null)
```

Two details of that query matter later. It tests `resolved_at IS NULL`, so
**declining** a request lifts the gate exactly as resolving it does. And it
recomputes `identityKey` from the candidate row's *current* fields.

### 1.2 The request is filed under a key that was frozen earlier

A request can only be created by `candidate_portal_request_erasure(token)`,
which copies `candidate_portal_tokens.identity_key` — a key computed by
`issue_candidate_portal_token` from the candidate row **at issue time** and
frozen on the token ever since.

So the two ends of the gate already disagree by construction: the request
holds the key the person had when the link was issued; the refusal computes
the key the row has when somebody presses send.

### 1.3 Three ways a record stops computing the key it was suppressed under

1. **A merge (§203).** Two records of one human key differently — that is
   why they were two people. An erasure filed through one covers the one.
   This is the §204 D4 sentence.
2. **An ordinary identity edit.** A recruiter adds or corrects an email, and
   the row's key moves from `name:…` to `email:…`. No merge, no second
   record, one person: the gate simply stops matching.
3. **A record that arrives later.** A second CV of the same human under a
   different key is a new row the request never described.

### 1.4 The probe — and the door §204 called safe has the same hole

§204 moved *do-not-contact* off the computed key onto the person
(`network_profiles.dnc`, reached through `candidates.network_profile_id`),
which is why the send ladder reads DNC from the profile and is correct
across a merge. **Measured today** on a scratch row (since removed):

| step | `network_profile_id` | profile key | `dnc` |
|---|---|---|---|
| row created, person suppressed | `fc9835a3…` | `name:gate probe person\|probe co` | **true** |
| recruiter adds an email | `9201646e…` | `email:gate.probe@example.test` | **false** |

The `candidates_link_network_profile` trigger (098/139) re-resolves the
person on every edit of `email`, `linkedin_url`, `full_name` or
`current_company`. With no alias for the new key, `resolve_network_profile`
**mints a new person**, the row is repointed to it, and the suppression is
left behind on a profile that now has no rows. Adding somebody's email
un-suppresses them.

That is the same defect as the erasure one, wearing the other door's
clothes, and it means "put the erasure on the person" is not by itself an
answer: on an ordinary edit, the person moves too.

### 1.5 What is NOT wrong, so the slice does not go looking there

- **The subject cannot do this to themselves.** 073 already refuses
  self-service edits to the field a token's key stands on, and never accepts
  an email at all through the portal.
- **Cross-org is not a hole.** A request is scoped to one organisation, and
  §073 D11 ruled that the same human in another org is a different
  relationship.
- **Execution stays founder SQL.** Closing a request is the operator's hand
  (RLS: founder-only UPDATE); the erasure itself is carried out under the
  retention verdict. This slice changes what the request *binds*, never what
  deletes data.

### 1.6 This is the cheap moment, and that is measurable

Production holds **0 erasure requests and 0 portal tokens**. Whatever is
ruled here, the backfill is empty — there is no historical row to reinterpret
and no live request to get wrong. The first real one will arrive under
whatever this gate decides.

---

## Part 2 — The rulings

### D1 — what a suppression is attached to *(load-bearing)*

**Recommended: all three of the person, the key and the records — the union,
not a choice between them.** A request keeps its `identity_key` (what the
subject was called when they asked, and the only thing a request has before
a person exists), gains a `network_profile_id` resolved at file time, and
gains a frozen snapshot of the candidate rows it covered. The gate then
refuses when **any** arm matches.

Each arm covers exactly what the others cannot:

| arm | catches |
|---|---|
| key | records that arrive **later** under the same key |
| person (through aliases) | the **merged sibling** record, and future records resolved to that person |
| covered records | rows whose key **and** person have both drifted since (1.3 case 2) |

The snapshot has §158's precedent: a frozen row is a receipt, and it must
outlive what it points at — which is why the profile FK is `ON DELETE SET
NULL`. When the erasure is finally carried out, the person is deleted and
the request must remain as proof it happened.

*Alternative: person only.* Cleaner, matches DNC, and still voided by an
ordinary edit until D3 is fixed — and silently, which is the failure mode
this gate exists to end.

*Alternative: widen the key lookup only* (match any key any of the person's
records computes). No migration, and it answers the merge case, but it is
computed at read time from rows that have already moved on, so it cannot
answer for a record that changed after the request.

### D2 — retroactivity across a merge *(the question as asked)*

**Recommended: an open request binds the survivor, always, and a merge can
never lower it.** This is not a new rule — it is §203 D2's own sentence,
already law for DNC in migration 143: *"suppression is contagious, and a
merge can never lower it."* Erasure is the stronger form of the same ask and
gets the same treatment.

In both directions, because a merge discards a person:
`merge_network_profiles` repoints open requests onto the survivor, **and**
the gate resolves a request's profile through `network_profile_aliases`, so
a request filed against a person who was later merged away still answers.
Belt and braces is deliberate here: the alias is what makes an old *key*
resolve, and there is no reason the two mechanisms should disagree.

*Alternative: forward only* — an erasure binds only what the org held when
it was filed. Cheap, and indefensible: the person asked before the recruiter
tidied the database, and the tidying is what voided the ask.

### D3 — does suppression survive an ordinary identity edit *(load-bearing)*

The probe's hole, which is DNC's as much as erasure's. Three ways out:

**Recommended: suppression rides the repoint, and is never lowered.** When
the trigger moves a row to a different person, the suppression the row was
under travels with it: DNC is carried to the new person (through
`set_network_dnc`'s own guarded door, the way the merge does it), and an
open erasure covers the new person too. The old person keeps theirs. The
rule is monotone — suppression only ever spreads — and over-suppressing is
the safe failure when the alternative is emailing somebody who asked you not
to.

*Alternative: stop the repoint.* An identity edit keeps the row's person and
mints an alias for the new key, so nothing moves between people except by a
human merge. This is doctrinally purer — §204 says only a merge moves
`network_profile_id` — and it is the better end state, but it changes what
the Network page shows, needs an answer for the row whose name was simply
wrong, and inherits the un-merge gap. **Its own gate, and a bigger one.**

*Alternative: erasure only.* Take D1's record snapshot, fix the erasure
gate, leave DNC lost on identity edits. Honest only if it is chosen out
loud, which is why it is written here rather than left as the default.

### D4 — which doors an open request closes

**Recommended: sending stays the hard gate, and the network copy joins it.**
Copying somebody's CV onto another mandate (§200's "add to this mandate",
and the suggester's add) *makes more of the data they asked you to delete*.
That refusal belongs in the same ladder as the duplicate refusal already
there. Everything else stays readable: the operator has to find the data to
erase it, and a product-wide freeze would block the very work the request
asks for.

*Alternative: sending only* (status quo). The person's data quietly spreads
to a second mandate while their request sits in the queue.

*Alternative: freeze the person everywhere.* Blocks the operator.

### D5 — what a decline lifts

Today `resolved_at IS NULL` is the whole test, so **declining a request
returns the person to contactable** with no other trace than a note in
/ops.

**Recommended: a decline lifts the erasure gate and suppresses the person.**
The only human who files an erasure is one who does not want to hear from
you; if the operator's answer is "we cannot erase this" (a client record, a
statutory retention), the contact answer is still no. So a decline sets DNC
with the request as its reason, and the send ladder refuses under the
DNC branch instead — a different refusal, not a lifted one.

*Alternative: keep today's behaviour.* A decline is a green light, and
nobody watching the send ladder would know the person ever asked.

---

## Part 3 — As it would be built, under the recommended rulings

**Migration 151.** No new table.

- `candidate_erasure_requests` gains `network_profile_id uuid REFERENCES
  network_profiles(id) ON DELETE SET NULL` and `covered_candidate_ids
  uuid[] NOT NULL DEFAULT '{}'` — the receipt outlives both.
- The open-request uniqueness moves from `(organization_id, identity_key)`
  to one open request per **person**, falling back to the key when there is
  none: a partial unique on `(organization_id,
  coalesce(network_profile_id::text, identity_key))`.
- `candidate_portal_request_erasure` resolves the person from the token's
  key (profile, else alias) and snapshots the candidate rows that key
  currently reaches.
- `merge_network_profiles` repoints open requests onto the survivor,
  reporting the count in its existing receipt jsonb.
- **The riskiest edit in the slice, named the way 143 named its own:**
  `candidates_link_network_profile` runs on every candidate insert and every
  identity edit. D3's carry is strictly additive — it fires only when a
  repoint actually changes the person, and it may only raise.

**The seam.** `send-candidate-message.ts` replaces the one-armed lookup with
a single `candidate_suppression_for(candidate_id)` read — person through
aliases, key, covered records — so the three arms live in one place that
both doors call. The network copy door calls the same one (D4).

**Guards, mutation-tested:** each arm refuses on its own (deleting any one
arm lets a send through and fails the suite); a merge carries an open
request and never drops one; an identity edit carries DNC and never lowers
it; a decline leaves the person refused under the DNC branch; the covered
snapshot is frozen at file time and not recomputed; the request survives the
deletion of the person it erased.

**Drive 139, live in production:** file an erasure through a real portal
token; prove the send refuses; then, one at a time, (a) merge that person
into another and prove the refusal survives from the *other* record, (b)
edit the identity and prove the refusal survives, (c) try the network copy
and get the new refusal, (d) decline the request in /ops and prove the
person is refused under DNC rather than contactable. Then teardown exact.

---

## Part 4 — What this does NOT do, named

- **It does not execute erasure.** Closing a request stays the operator's
  hand and founder SQL under the retention verdict.
- **It does not stop a row splitting a person on an identity edit** — that
  is D3's rejected alternative and wants its own gate. This slice makes the
  split harmless to suppression, not impossible.
- **It does not add an un-merge**, and does not clean up the orphan profiles
  an identity edit leaves behind (both inherited gaps, §204).
- **It does not reach across organisations** (§073 D11).
- **It does not change the Art. 14 notice**, the portal's own refusals, or
  what a candidate may edit about themselves.
