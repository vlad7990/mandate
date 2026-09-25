# MERGING TWO RECORDS OF ONE PERSON — THE GATE — 2026-09-25 — CONFIRMED

**THE FOUNDER'S WORD, 2026-09-25. All four recommendations taken.**

- **D1 — the survivor's row wins on every collision, and the receipt
  names every single thing that was dropped.**
- **D2 — every note from both records is kept**, author- and
  time-stamped; same for feedback, outreach history and the trail.
- **D3 — a placement on the discarded record REFUSES the merge**, naming
  it; nothing is changed.
- **D4 — blank fields on the survivor are filled from the discarded
  record; a value already present is never overwritten.**

The ask: **"build the merge tool."**

§201 shipped the flag and named the gap in the same breath: *"no MERGE
tool — a flagged pair is surfaced, never resolved, and if the founder
wants merge it is its own slice with its own rulings about whose notes
win."* This is that slice.

---

## Part 1 — What exists, including one thing that should not

**§201's flag is live.** A name|company-only match leaves both candidate
rows standing and writes `identity_review_of` / `identity_review_label` /
`identity_review_at` on the newer one. The candidate record renders a
notice naming the other row and linking to it.

**FOUND WHILE SCOPING THIS, AND IT IS MINE: that notice ends with "If
they are the same person, delete the record you do not want" — and THERE
IS NO DELETE-CANDIDATE ACTION ANYWHERE IN THE PRODUCT.** I swept every
`.delete()` call in `src`; the only one touching `candidates` is §201's
own duplicate discard, which is not reachable by a recruiter. So the
sentence I shipped this morning instructs the reader to do something the
product cannot do — **§199's doctrine exactly**, the same defect that
slice existed to close, committed one screen over.

That is the real reason this slice is worth building now rather than
later: the flag currently ends in a dead end. **The wording moves in this
commit whatever else is ruled.**

**The pool already knows these two rows are one person.** Both carry the
same `network_profile_id` — the 098/139 trigger folded them on the
name|company key. What does not exist is any way to make the two
CANDIDATE rows into one.

---

## Part 2 — The five facts that decide the build

**(a) A candidate row is the hub of eighteen tables.** Notes, scores,
engagement, prescreen, outreach, outreach strategies, notifications,
interview plans (two families), executive assessments, risk reviews,
executive search links, sourcing run links and results, placements,
feedback, the verdict ledger, and the activity trail all hang off
`candidate_id`. A merge is not a row edit; it is a reparenting.

**(b) NINETEEN UNIQUE INDEXES KEY ON `candidate_id`, and almost all say
"one X per candidate per mandate."** `unique_candidate_score_per_project`,
`engagement_states_lane_unique`, `prescreens_one_live_lane`,
`outreach_strategies_one_live_draft`,
`unique_approved_project_plan_per_candidate`,
`placements_one_per_candidate_per_mandate`, and a dozen more.

**So "move every child row to the survivor" is not a design — it is an
error.** Where both records carry the same one-per-candidate row, the
reparent violates the constraint and the whole merge fails. Every one of
those tables needs a ruled answer, which is D1.

**(c) A CANDIDATE WITH FEEDBACK CANNOT BE DELETED AT ALL. Proven live, in
a transaction that aborted:**

```
A  notes + the composite _in_org FK : DELETED OK
B  feedback                          : BLOCKED ->
   update or delete on table "candidates" violates foreign key
   constraint "feedback_candidate_id_fkey" on table "feedback"
```

`feedback_candidate_id_fkey` is declared with **no `ON DELETE` clause**,
so it defaults to `NO ACTION` while every sibling table cascades. The
merge must reparent `feedback` BEFORE it deletes anything, or it will
fail on exactly the records a recruiter has worked hardest on.

**This is a latent blocker in §201's discard too**, one door back: a
duplicate that already carried feedback could not have been discarded.
It degrades honestly rather than silently — the discard's delete-failed
branch falls through to the flag and says both records are here — but it
is named here rather than left to be discovered.

**(d) The composite `_in_org` FKs do not block the delete.** Every child
carries a second `(organization_id, candidate_id)` FK from the 111/112
platform-agents doctrine, and those are declared without `ON DELETE` as
well. Probe A proves the row-level CASCADE wins and the child is gone
before the composite is checked. Worth knowing precisely, because the
§158 F-1 lesson has made this FK pair expensive to guess about twice.

**(e) A half-finished merge is unrecoverable.** Reparenting eighteen
tables with eighteen round trips from a server action means a network
blip leaves notes on one record, scores on another and a survivor that
owns neither. **The merge therefore belongs in ONE `SECURITY DEFINER`
function, in one transaction** — the shape `issue_invoice` and
`approve_admin_grant` already use — not in application code.

---

## Part 3 — The three kinds of child row

Every one of the eighteen tables is exactly one of these:

| kind | what happens | tables |
|---|---|---|
| **MOVE** | reparent to the survivor; both records' rows survive | notes, feedback, outreach, notifications, sourcing links/results, verdict ledger, activity trail |
| **COLLIDE** | one-per-candidate; if BOTH have one, only one can live | scores, engagement, prescreen, outreach strategies, interview plans (×2), exec assessments, risk reviews, exec search links |
| **REFUSE** | too consequential to resolve silently | placements (money, sign-off, invoices) |

MOVE is unambiguous and non-lossy. COLLIDE is D1. REFUSE is D3.

---

## Part 4 — The rulings

### D1 — what happens when both records carry the same one-per-candidate row

**Recommended: the survivor's row stands, the discarded record's is
dropped, and the receipt names every single thing that was dropped.**
The survivor is the record the recruiter chose to keep; its score, its
stage, its engagement lane are the ones they have been working with.
Silently keeping the *other* record's score would hand them a
Frankenstein record that matches neither thing they looked at.

The receipt is the load-bearing half: "kept this record's score (72);
discarded the other's (68)" is a fact the recruiter can act on. A merge
that quietly drops a score is §175's defect class wearing a button.

*Alternatives:* refuse the merge whenever any collision exists (safe, and
it would refuse nearly every real pair, since a scored mandate collides
on `candidate_scores` immediately); or keep whichever row is newer per
table (a record assembled from two different people's halves, which no
one chose and no one can predict).

### D2 — whose notes win *(the founder's own question from §201)*

**Recommended: every note from BOTH records moves to the survivor and is
kept.** Notes are author-stamped (`created_by`) and time-stamped, carry
no unique constraint, and are the one thing in this system that is purely
human testimony. Two recruiters' calls with the same person are two real
events; dropping either is destroying work that was done.

The same rule carries the rest of the MOVE family — feedback, outreach
history, the trail — for the same reason: it is a record of something
that actually happened.

*Alternative:* keep the survivor's notes only. Simpler receipt, and it
silently deletes a colleague's call log.

### D3 — a PLACEMENT on the record being discarded

A placement is money: it carries fees, fee lines, sign-off, and possibly
an issued invoice that is a frozen legal document (§158/§162).

**Recommended: REFUSE the merge, and say exactly why.** "The record you
are discarding carries a placement — make it the one you keep, or remove
the placement first." The recruiter has a real choice and nothing is
destroyed by the product's own initiative. Moving a placement between
candidate rows would relabel who was placed, under an invoice that has
already left the building.

*Alternative:* move the placement to the survivor. Fewer refusals, and
the first time it is wrong it is wrong about an invoice.

### D4 — what the surviving record inherits from the discarded one

The common real pair is a record with no contact details and a record
with an email. **Recommended: fill only the survivor's BLANK identity and
contact fields from the discarded record — email, LinkedIn, phone,
location, company — and never overwrite a value that is already there.**
The merge is the recruiter stating these are one person, so carrying a
detail one record has and the other lacks is completing a record, not
inventing one.

Note the consequence, which is a feature: filling `email` fires the
098/139 trigger and re-keys the person from `name:…` to `email:…`, so the
survivor lands on the correctly-keyed person in the pool.

*Alternative:* the survivor stands exactly as it is, and the recruiter
retypes anything they wanted. Nothing is asserted; the email that was
sitting right there is thrown away.

---

## Part 5 — As it would be built, under the recommended rulings

**Assumed, not asked** (they follow from §201 and the shape above; say the
word if either is wrong):

- **Scope is two candidate rows in the SAME mandate** — which is the only
  pair §201 can flag, and the only pair where "duplicate" means anything
  (`project_id` is a column on the row; the same person in two mandates
  is two records by design, per §200 and §201's D4).
- **Choosing the survivor is choosing which CV survives.** There is no
  multi-CV model, and §073's D9 already refused moving `cv_url` without a
  re-parse because it desyncs the stored profile from the stored
  document. The discarded record's file is deleted with it, and the
  receipt says so — §201's D2 wording, one slice on.

**Migration 142**
- `merge_candidates(p_keep uuid, p_discard uuid)` — `SECURITY DEFINER`,
  one transaction, org-scoped, gated on `can_write_candidates()`, and it
  re-checks that both rows are in the caller's org AND the same mandate
  rather than trusting the caller.
- Refuses on D3's placement, on a self-merge, and on a cross-mandate or
  cross-org pair. Returns a structured receipt: what moved, what was
  dropped, what was filled.
- Activity CHECK **101 → 102** and the app-recordable door **27 → 28**:
  `candidates_merged`, gated on `can_write_candidates()`, anchored to the
  SURVIVOR (§201's cascade lesson — an event naming the discarded row is
  deleted by the act it records).
- **`feedback_candidate_id_fkey` is left exactly as it is.** The merge
  reparents feedback before deleting, so it never meets the block, and
  changing a constraint to make deletion easier is the wrong direction
  for the one table that records what a human concluded.

**The screen.** The §201 notice gains the affordance it currently only
describes: **Merge these records**, opening a side-by-side of what each
record carries — stage, score, notes count, CV filename, contact fields,
placement — with the survivor chosen explicitly. No default: the product
does not guess which of two people's records matters more. Then a confirm
naming exactly what will be dropped, and a receipt afterwards.

`CapabilityGate` on `candidates:write`, the §199 pattern: the decision is
read once in the page and passed as a REQUIRED prop, so a reader sees the
flag and no button rather than a button that fails.

**Guards, mutation-tested:** the collision policy per table; feedback
reparented BEFORE the delete (the case that would otherwise fail); the
placement refusal; cross-mandate and cross-org refusals; blank-fill never
overwriting; the event anchored to the survivor; and the banner no longer
telling anyone to delete anything.

**Drive 134** proves it in production: a flagged pair with notes on BOTH
records, a score on both, feedback on the discarded one (the case that
cannot delete), and a separate pair where the discarded record carries a
placement and the merge is refused. Teardown exact.

---

## Part 6 — What this does NOT do, named

- **It does not merge PEOPLE across mandates.** `network_profiles` folds
  candidates into one person and can itself hold two profiles for one
  human (a name-keyed one and an email-keyed one). That is a different
  object with a different blast radius — the do-not-contact gate and the
  candidate portal token both key on it — and it deserves its own gate.
- **No undo.** The merge is a delete; the trail records that it happened
  and what was dropped, but nothing reconstitutes the discarded record.
  Said plainly in the confirm, because a confirm that hides it is worse
  than no confirm.
- **No automatic merging, ever.** Nothing here merges without a human
  choosing the survivor. §201 ruled that a name|company match is a
  question, and answering it automatically was refused there for the same
  reason it is refused here.
- **It does not fix the apply door** (§201's D6) or sweep duplicates
  already in the pool.
