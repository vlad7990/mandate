# THE NETWORK TABLE FOLDS BY THE PERSON, NOT THE KEY — THE GATE — 2026-09-25 — DRAFT

**Awaiting the founder's word. Four rulings. D1 decides how much of the
page's read path is rebuilt; D4 decides whether a suppressed person can
still be shown as an ordinary contact.**

The ask: **"gate the network table fold by network_profile_id."** §203
named this as its own first NOT DONE, and said to gate it before
touching it, because this is the Network page's core read path — the
sidebar badge and §200's reuse trawl read the same identity rule.

---

## Part 1 — What the page does today, and why §203 left it wrong

`loadNetworkOverview` fetches candidate rows and buckets them **in
TypeScript, by `identityKey(row)`** — a key recomputed from each row's
own `email / linkedin_url / full_name|current_company`
(network-aggregator.ts:169–176). One bucket renders as one person.

That was the only identity available when the page was built. It is not
any more. `candidates.network_profile_id` has existed since 098, is
maintained by a trigger on every birth path, is indexed
(`candidates_network_profile_idx`), and — since §203 — **is the column a
merge actually changes.** The aggregator's own comment already named
this slice: *"Removing the bound properly means grouping by identity in
Postgres — a stored key column and an aggregate function."* The stored
column arrived; the page never moved onto it.

So the product now holds **two answers to "are these the same person?"**:

| | answers | moves when a merge happens |
|---|---|---|
| `identity_key`, recomputed per row | who is this *incoming* thing | **no** |
| `network_profile_id`, stored | who is this *existing row* | **yes** |

§203 shipped the merge against the second and left every render on the
first. The panel says so plainly, which is honest — and is not the same
as correct.

---

## Part 2 — The three facts that decide the build

**All three PROVEN LIVE against production, in one aborting transaction
(the §202 shape: everything rolls back, the measurements come back in
the error).** The probe inserted one human as two records — one with an
email, one without — suppressed the survivor, then reproduced exactly
what `merge_network_profiles` does (repoint the candidates, record the
alias, delete the loser) and measured the page's own reads:

```
two profiles for one human:            t  (email:probe.person@example.test | name:probe person|probe ag)
survivor is suppressed:                t
second record now points at survivor:  t
old key still computed by that row:    t
overlay rows found for that key:       0   <- page shows: RELATIONSHIP (neutral)
sidebar badge, before -> after merge:  4 -> 6
these 2 rows: distinct identity keys 2 / distinct profiles 1
```

Baseline re-counted afterwards and intact: candidates 4, profiles 4,
aliases 0, events 123, badge 4.

### (a) A MERGED PERSON STILL SHOWS AS TWO, AND ONE OF THEM IS BLANK

The overlay is a map **keyed on `identity_key`**
(profile-resolver.ts:43), joined to each folded row by that row's
recomputed key. After a merge the loser's profile is **deleted** — its
key lives on in `network_profile_aliases`, which nothing on this page
reads. So the second row finds no profile at all.

### (b) AND THE BLANK ONE IS THE DANGEROUS HALF: IT READS "RELATIONSHIP"

network-table.tsx:527–535 renders `profile?.dnc ? "DNC" : (…
relationship_state ?? "relationship")`. **A missing profile and an
ordinary unsuppressed contact render identically.** So after merging a
suppressed person, the Network page shows one row marked DNC and a
second row, the same human, wearing the neutral chip.

**Stated precisely, because the difference matters: this is a DISPLAY
divergence, not an open door.** The send gate reads suppression through
`candidate.network_profile_id` (send-candidate-message.ts) — the FK the
merge repoints — so an actual send against that record is still refused.
The failure is that **the screen asserts a relationship state it has not
established**, which is §175's class exactly, on the one fact with
consequences outside this application.

### (c) THE SPLIT ALSO DEFEATS §200's "ALREADY ON THIS MANDATE"

Last probe line: two rows, **2 distinct identity keys, 1 distinct
profile**. Both the reuse trawl (pool-suggestions/actions.ts:126 →
run-candidate-search.ts:207) and the copy-to-search refusal
(network/actions.ts:125) exclude on the key. A merged person already
sitting on a mandate under one key is therefore **suggested again** under
the other, and the copy that follows is permitted — minting the second
row that §201 and §202 exist to prevent.

And the badge simply never moves: `count_network_people()` (098) is
`COUNT(DISTINCT candidate_identity_key(...))`, so **merging two people
changes it by nothing.** 4 → 6 above is the two probe rows counted as two
people, after they were merged into one.

---

## Part 3 — The rulings

### D1 — where the fold happens *(load-bearing)*

**Recommended: in TypeScript, on `network_profile_id`, keeping today's
window.** `loadNetworkOverview` buckets on the stored column instead of
the recomputed key; the overlay map is keyed on `profile.id` instead of
`identity_key`, which **deletes the second identity rule from the render
path rather than re-pointing it**; `CANDIDATE_ROW_CAP` and its honest
truncation banner stay exactly as they are.

The cap is a *pool-size* problem, not an identity problem, and this is
the riskiest read path on the page. Changing what a row MEANS and how
the page is paged in one slice means a regression in either has the
other to hide behind.

*Alternative (the bigger prize, and a real one): group in Postgres.* The
stored column is exactly the thing whose absence the cap comment blames,
so a set-returning function grouping by `network_profile_id` could page
properly and drop the 2000-row window for good. It is also a new
migration, a new read contract and pagination in the UI — a slice of its
own, which this one makes possible and should name.

### D2 — rows that have no person yet

`network_profile_id` is **NULL by design** while a CV is still being
read and the only identity signal is a name (§196/139: *"we have not
read the document yet… that is not an identity, it is a filename"*).
Folding on the column has to say what happens to those rows — and note
that today, folding on the key, **the Network page still shows them as
people named after their file**, which is the very thing 139 stopped one
layer down.

**Recommended: they are not people yet, so they are not rows — and the
page SAYS how many it is holding back**, in the same place the
truncation banner already speaks. Silently dropping them would make a
just-uploaded CV vanish from a page whose count the recruiter trusts;
worse, a parse that never finishes would be invisible forever.

*Alternative:* keep showing them, folded by key as today. That is 139's
defect, preserved on the one screen whose entire subject is people.

### D3 — whose facts a folded row shows

Two candidate records for one person can disagree about title, company,
even name. Today the most recently updated row wins and supplies every
field; the profile supplies only relationship state.

**Recommended: keep it that way.** The fold changes WHICH rows sit
together, not whose account of the person is authoritative. §203's D1
already ruled this shape — *the alias records what the recruiter
asserted, beside, not on top of, what the documents say* — and
`display_name` on the profile is itself derived. The person's name on
the row therefore still comes from their most recent record, not from
the survivor profile.

*Alternative:* let `network_profiles.display_name` title the row. One
click at merge time would then rename the person everywhere on this
page, with no document behind it.

### D4 — which other consumers of the key move in this slice

There is a line that decides this cleanly: **`identityKey` answers "who
is this incoming thing?", `network_profile_id` answers "who is this
existing row?"** Only the second kind can move, because before a row
exists there is no profile to read.

**Recommended: move the three reads that are about existing rows, and
nothing else.**

· **The sidebar badge — NOT OPTIONAL.** `count_network_people()` becomes
  `COUNT(DISTINCT network_profile_id)`. If the page folds by person and
  the badge counts keys, they disagree by exactly one every time somebody
  merges, and the badge runs on every authenticated route. The existing
  comment already warns the two must change together.
· **§200's "already on this mandate"** (trawl exclusion + copy-to-search
  refusal) move to the profile id, falling back to the key when the id is
  NULL. These are the only places where being wrong mints a duplicate
  row.
· **UNMOVED, and it must be: dedupe-before-insert** — §201's
  `classifyAgainstMandate`, the sourcing importer, `cv_sha256`. There is
  no profile until the row exists. Moving these would be incoherent, not
  merely premature.

*Open question inside this ruling, flagged rather than assumed:* the
send gate's **erasure** check keys on `identity_key`
(send-candidate-message.ts:159), so an erasure request filed against one
of a merged person's keys does not cover the other. The alias table now
makes the fix one read. **Recommendation: NOT in this slice** — it is a
legal gate, it predates the merge, and "which requests cover whom" wants
its own ruling about retroactivity rather than a line smuggled into a
rendering change. Named here so it is a decision and not an oversight.

---

## Part 4 — As it would be built, under the recommended rulings

**No migration for the page; one for the badge.** Migration 144 redefines
`count_network_people()` as `COUNT(DISTINCT c.network_profile_id)` over
RLS-scoped candidates. No new table, no new grant, no policy change; the
anon roster and the app-recordable door are untouched.

**`network-aggregator.ts`** buckets on `network_profile_id`, drops its
`identityKey` import, and returns `profile_id` on `NetworkPerson`
alongside the canonical row id. Rows with a NULL profile are counted and
returned as `people_pending` rather than folded.

**`profile-resolver.ts`** keys its map on `id`. The page passes
`profiles[person.profile_id]`, and **the overlay stops joining on a
recomputed string anywhere in the render path.**

**The page** gains one honest line next to the truncation banner when
`people_pending > 0`, and the merge panel's per-person count — already
read off `network_profile_id` since §203 — now comes from the same fold
as the table, so the two cannot disagree again.

**§200's two membership checks** move to profile ids with a key
fallback.

**Guards, mutation-tested per §202's lesson** (anchor on the construct,
strip comments, assert the rows rather than the vocabulary): a fold
guard that a merged pair yields ONE person and one that the badge and
the page agree on the same fixture; a guard that the pending rows are
excluded from both; a structural guard that `identityKey` has no
consumer left in the render path.

**Drive 136** proves it live on the pair §203 can already make: merge two
profiles, then load the Network page and see **one row, marked DNC, with
the merged record count** — the screen that today shows two. Then the
trawl on a mandate the merged person already sits on, which today
suggests them again.

---

## Part 5 — What this does NOT do, named

- **It does not remove the 2000-row window.** D1's alternative is the
  slice that could; this one makes it possible by putting a groupable
  stored column under the fold.
- **It does not un-merge, and it does not clean up orphan profiles** —
  §203's residue, unchanged. An orphan still appears in the merge panel
  holding zero records.
- **It does not change what a merge does**, only what the screens read.
- **It does not touch the erasure gate** (D4), and it does not touch any
  dedupe-before-insert path.
