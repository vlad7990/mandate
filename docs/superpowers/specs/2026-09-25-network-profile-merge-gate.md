# MERGING TWO PEOPLE IN THE NETWORK — THE GATE — 2026-09-25 — DRAFT

**Awaiting the founder's word. Four rulings. D1 decides whether the merge
is durable at all; D2 is about somebody who asked not to be contacted.**

The ask: **"build the network profile merge."** §202 named this as the
deferred half: *"it does not merge PEOPLE across mandates — that is a
different object with a different blast radius, and it deserves its own
gate."*

---

## Part 1 — Why two profiles for one human exist

`network_profiles` is keyed `(organization_id, identity_key)`, and
`resolve_network_profile` computes that key **from each candidate row's
own fields**. So one human gets two profiles the moment two of their
candidate rows key differently — which is the ordinary case:

- a CV with no contact details → `name:rowan delacroix|meridian ag`
- a later CV, or a sourcing import, carrying an email → `email:rowan@…`

Nothing is wrong with either row. The person is simply split in two, and
today there is no way to say they are one.

**Good news on blast radius: only ONE foreign key points at
`network_profiles`** — `candidates.network_profile_id`, `ON DELETE SET
NULL`. This is a far smaller object than the candidate hub §202 dealt
with. The difficulty is not the fan-out. It is the two facts below.

**A CORRECTION TO MY OWN §202 GATE.** That gate said the DNC gate *and
the candidate portal token* both key on the profile. **The portal token
does not.** `candidate_portal_context` resolves candidates by computing
`candidate_identity_key` on the CANDIDATE ROW and never reads
`network_profiles` at all. So a profile merge leaves every portal token
working exactly as before. Stated here because I put the wrong claim in
writing yesterday's slice.

---

## Part 2 — The two facts that decide the build

### (a) A NAIVE PROFILE MERGE SILENTLY UNDOES ITSELF. Proven live:

```
two profiles for one human:                     true
immediately after merge, old-key profiles:      0      ← looks merged
  ... then ONE ordinary edit to the candidate ...
candidate STILL on survivor:                    false  ← it left
old-key profile RECREATED:                      1
survivor state the candidate now inherits:      cold   ← not 'warm'
```

The "ordinary edit" was **re-typing the same name**. The 098/139 trigger
fires on `UPDATE OF full_name / email / linkedin_url / current_company`,
recomputes the key from the row, finds nothing, and **creates the old
profile again** — dropping the candidate onto a brand-new blank person.

**So "repoint the candidates and delete the loser" is not a merge. It is
a merge that lasts until somebody edits a name.** Worse, it fails
*silently* and in the direction of forgetting: the survivor's
relationship state, its follow-up, and — if it had one — its
do-not-contact flag stop applying to that candidate.

This is the whole of D1.

### (b) DNC IS ALREADY DEFENDED, AND THE MERGE MUST NOT BE A WAY ROUND IT

Writing the `dnc` family directly is refused by a trigger:

```
do-not-contact is set by set_network_dnc(), cleared by
clear_network_dnc(), or set by the candidate portal — never
written directly
```

`guard_network_dnc()` exists precisely so no code path can quietly
suppress or un-suppress a person. A merge is a new code path that
combines two people's suppression state, so **it must satisfy that guard
rather than be excused from it** — the §200 lesson, where a guard with an
unnamed column was a way round itself.

The schema also holds two CHECKs: `dnc` requires a reason and a
timestamp, and `relationship_state = 'do_not_contact'` requires `dnc`.
Any merged row has to land coherent on both.

And the existing doctrine is already explicit, in the relationship
agent's own merge discipline: *"a suppressed profile keeps its state
untouched — the dnc family is not the agent's to move."*

---

## Part 3 — The rulings

### D1 — how the merge is made DURABLE *(load-bearing)*

**Recommended: an alias table.** `network_profile_aliases
(organization_id, identity_key) → profile_id`, consulted by
`resolve_network_profile` BEFORE it find-or-creates. Merging profile A
into B records A's identity key as an alias of B.

Three things follow, and the third is the reason to prefer it:

1. The merge survives any edit — the old key now resolves to B.
2. **A FUTURE CV of the same person under the old key joins B
   automatically**, instead of re-splitting the person a third time.
3. It does not touch candidate data, so a CV that genuinely carries no
   email keeps saying so. The alias records what the RECRUITER asserted,
   next to — not on top of — what the documents say.

*Alternative:* write the survivor's email onto the merged candidate rows
so their keys converge (§202's D4 logic, one level up). Simpler, no new
table — but it puts an email on a record whose CV does not have one, and
it does nothing for the next upload, which splits the person again.

*Alternative:* accept the re-split and re-merge when it happens. That is
today's behaviour with extra steps, and it fails silently.

### D2 — do-not-contact, when the two people disagree

**Recommended: suppression is contagious and never cleared by a merge.**
If EITHER profile is `dnc`, the survivor is `dnc`, carrying that
profile's reason, timestamp and setter. If both are, the EARLIER
suppression wins, because it is the first time the person said it.
Merging can raise suppression and can never lower it.

The merge therefore routes through the ruled path rather than writing the
columns behind `guard_network_dnc`'s back.

*Alternative:* the survivor's DNC state stands, whichever it is. One
click can then un-suppress somebody who asked not to be contacted, and
nothing on the confirm would say so.

### D3 — relationship state, follow-ups and contact history

**Recommended: keep the WARMER state, and the MOST RECENT real contact.**
`cold < contacted < engaged < warm < placed`, with `client_contact` and
`do_not_contact` handled apart. A relationship that reached "warm" is a
thing that actually happened; taking the survivor's "cold" because it
happened to be the row clicked would discard a fact.

For the rest: `last_meaningful_contact_at` takes the later of the two;
the earliest outstanding `follow_up_at` survives with its note (a
follow-up that is dropped is one nobody does); `disposition` keeps the
survivor's, with the other's retained in the merge's trail entry rather
than deep-merged into a shape neither side agreed on.

*Alternative:* the survivor's row stands as-is for everything, and the
recruiter re-enters what mattered.

### D4 — what a merge may span

**Recommended: two profiles in ONE organisation, and nothing wider.** The
key is `(organization_id, identity_key)` and §073's D11 already ruled
that a person courted by two orgs is two relationships. Cross-org merging
is not a feature with a bug; it is a federation change.

Within that: any two profiles the recruiter names — not only pairs some
heuristic proposed — because the recruiter can see what the product
cannot.

*Alternative:* only merge pairs the product itself flags.

---

## Part 4 — As it would be built, under the recommended rulings

**Migration 143**
- `network_profile_aliases`: `(organization_id, identity_key)` unique,
  `profile_id` → `ON DELETE CASCADE`, plus who merged it and when. RLS
  org-scoped like every sibling.
- `resolve_network_profile` gains ONE lookup: alias first, then today's
  find-or-create, unchanged otherwise. **This is the single riskiest edit
  in the slice** — it sits under every candidate insert and update — so
  it is additive, ordered alias-then-existing, and guarded by a test that
  a non-aliased key behaves exactly as before.
- `merge_network_profiles(p_keep, p_discard)`: one `SECURITY DEFINER`
  function, one transaction, `can_write_candidates()`-gated, org-scoped,
  refusing self-merge and cross-org. Repoints candidates, folds the state
  per D2/D3, records the alias, deletes the loser, returns a receipt.
- DNC folded through the ruled path so `guard_network_dnc` still holds.
- Activity CHECK **102 → 103**: `network_profiles_merged`, written inside
  the function's transaction (door stays 27), anchored to the survivor.

**The screen.** The Network page already lists people. It gains a
two-step merge: choose the person to keep, then the person to fold in,
with a side-by-side of state, DNC, follow-up, last contact and how many
candidate records each holds — then a confirm naming exactly what
changes, and that suppression can only increase.

`candidates:write`-gated as a REQUIRED prop, §199's shape.

**Drive 135** proves it live: two profiles for one human; merge; then
**re-type the name on a candidate and watch it stay merged** — the exact
edit that broke it in the probe above. Plus a suppressed loser raising
suppression on an unsuppressed survivor, and the cross-org refusal.

---

## Part 5 — What this does NOT do, named

- **It does not un-merge.** The alias makes the join durable, which also
  makes it harder to undo; if splitting a wrongly-merged person is
  wanted, it is its own slice.
- **It does not clean up orphan profiles** — rows with no candidates
  left, which §202's blank-fill can create. Related, separate, and safe
  to leave.
- **No automatic merging.** Nothing here merges without a human naming
  both people, for §201's reason: a name match is a question.
