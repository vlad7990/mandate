# CV DEDUPE — THE SAME PERSON PARSED TWICE — THE GATE — 2026-09-25 — CONFIRMED

**THE FOUNDER'S WORD, 2026-09-25. Every recommendation taken as written.**

- **D1 — layered.** Hash before the parse, identity after.
- **D2 — discard the new row** on a strong in-mandate match, and say
  plainly that the uploaded file was not kept.
- **D3 — both rows stand, flagged, no default** on a name-only match.
- **D4 — cross-mandate is a fact, never a refusal** (carried as stated).
- **D5 — no DOCX email probe.**
- **D6 — the apply door stays out**, recorded not forgotten.
- **The fourth `identityKey` copy is deleted** in this commit.

The ask: *"add dedupe so the same person isn't parsed twice."*

§200 shipped bulk intake and named this as the thing it did not do: twenty
CVs of the same person in one batch make twenty candidates and twenty
billed parses. The tab guide says so out loud today
(`docs/tab-guides/candidates-intake.md:38`), which means closing this
changes a published promise and the guide moves in the same commit.

---

## Part 1 — What already exists, so this is not reinvented

**Person identity is already one rule, written four times.**
`src/lib/candidate-identity.ts` holds `identityKey()` — precedence
**email → linkedin → name|company** — and `identityStrength()`, which
exists precisely so a caller can tell a strong match from a weak one. It
is transcribed into SQL twice (migration 040's `count_network_people`,
migration 073's `candidate_identity_key`), and the module's own header
warns: change one, change both, same commit.

**FOUND EN ROUTE: there is a fourth copy.**
`src/app/(dashboard)/app/candidates/network/actions.ts:345` declares a
private `identityKey` with the same three branches, character for
character, instead of importing the shared one. It is not wrong today —
it is the drift the module was extracted to prevent, sitting in the file
that performs the product's *only existing* duplicate refusal. **Deleting
it and importing the shared function belongs in this commit**, because
this work adds a fifth consumer and the whole point is that every screen
answers "is this the same human" identically. No behaviour change, and a
guard pins it.

**The pool already folds candidates into people, for free.**
`candidates.network_profile_id` is filled by a BEFORE trigger
(`candidates_link_network_profile`, 098, amended by 139) on insert and on
update of `full_name` / `email` / `linkedin_url` / `current_company`.
§139's rule holds the line at the top: *while `cv_processing` is true and
a name is the only signal, mint nothing* — a filename is not an identity.
So the sequence today is already:

1. row inserted, `full_name` = filename, `cv_processing` = true →
   **`network_profile_id` deliberately NULL**;
2. the parser UPDATEs with the real name and email → the same trigger
   fires → the person is resolved and the link filled, first time, once.

**This is the single most important fact in this gate: by the time a
parse returns, the database has already decided who this is.** A
post-parse duplicate check is not new machinery and costs no new
inference — it is one indexed read of something the product already
computed.

**The three-verdict model already exists too.**
`dedupeImportRows` (`src/lib/sourcing/import.ts:296`) classifies every
imported row as `new` | `duplicate` | `ambiguous`, where **a name-only
match is deliberately `ambiguous` and gets no default**, because the same
name at a large employer is a real collision. That is §175's class stated
as a data type, and this build should reuse the vocabulary rather than
invent a second one.

**And one refusal already exists.** `addPersonToProjectAction` refuses to
copy a person into a mandate that already holds them, by identity key.
Note what it does *not* distinguish: a name-only collision is refused
there as flatly as an email match. That is the opposite of the importer's
ruling, in the same codebase.

---

## Part 2 — The four facts that decide the build

**(a) A candidate row belongs to ONE mandate.** `candidates.project_id`
is a column on the row. Two rows for one person in two mandates is not a
defect — it is what §200's reuse path *deliberately creates*. So
**"duplicate" can only mean "twice in the same mandate."** Across
mandates the same person is a fact worth reporting and never a refusal.

**(b) Pre-parse, the product knows two things: the file's bytes, and its
filename.** `uploadAndParseCv` takes `projectId` and `cv` and nothing
else. Neither upload form collects a name, an email or a LinkedIn URL —
not the single-file one, not the bulk one. There is no manual field to
match on, and §139 already ruled that the filename is not an identity.

**(c) PDFs are never read locally.** `parseCv` sends a PDF to Anthropic
as a base64 `document` block. Only **DOCX** is text-extracted on our side
(mammoth). So a "cheap pre-parse email probe" is free for DOCX, needs a
new PDF dependency for the format that is 90% of real CVs, and would
therefore behave differently depending on what the recruiter dragged in.
See D5 — I recommend against it, and the reason is not the dependency.

**(d) Document identity is not person identity, and the difference is
the whole design.** Two byte-identical files are *certainly* the same
document, and a document names one person — that is not a heuristic, and
it is the only certainty available before the money is spent. Everything
richer than that requires having read the file.

---

## Part 3 — THE FORK: the ordering problem, stated plainly

Identity is known only **after** the parse. So:

> **A pre-parse check can only match on the bytes. A post-parse check has
> already spent the money.**

There is no third position that gets both, and any design claiming
otherwise is asserting identity it has not established — §175's defect
class, which is exactly why the importer has `ambiguous`.

What each tier can actually do:

| tier | when | cost | catches | certainty |
|---|---|---|---|---|
| **1 — file hash** (SHA-256 of bytes) | before upload | free | the same *document* uploaded again, in-batch or already in the mandate | **certain** |
| **2 — filename** | before upload | free | nothing trustworthy | §139 already ruled this out |
| **3 — DOCX text probe** | before parse | free for DOCX only | an email in the text | **not the subject's email** — referees, footers, previous employers |
| **4 — identity key** | after parse | parse already billed | the same *person*, any file, any format, any version | strong (email/linkedin) or **ambiguous** (name only) |

**Tier 1 is where the founder's money actually is.** The stated failure —
twenty CVs of one person in one batch — is overwhelmingly twenty copies
of one *file*: a folder dragged twice, an export containing the same
attachment under two names. Tier 1 catches every one of those for zero
inference, and it catches them **in-batch**, before the first byte is
uploaded, without a database round trip.

**Tier 4 is the honest net.** It catches the case Tier 1 cannot — the
same person's CV v2, or their DOCX and their PDF — and it catches it with
machinery that already exists. What it cannot do is un-spend the parse.

**My recommendation is both, layered, and nothing else** (D1). Tier 1
refuses cheaply and certainly; Tier 4 tells the truth about what got
through. Tier 3 is declined on honesty grounds, not cost.

### The limit of Tier 1, stated rather than discovered

No CV uploaded before migration 141 has a hash. Backfilling would mean
re-reading every stored file, and a backfill is not worth a job to
schedule: **the first upload of a person after this ships is the one that
records the hash, and the second is the one that gets caught.** Tier 4
covers the pre-141 pool from day one, because it reads identity, not
bytes. The screen should not imply otherwise.

---

## Part 4 — The rulings

### D1 — the shape *(load-bearing)*

**Layered: hash before, identity after.** Tier 1 refuses byte-identical
re-uploads inside the target mandate for free; Tier 4 classifies whatever
survives once the parse returns.

*Alternatives:* post-parse only (simpler, one code path, pays for every
duplicate); pre-parse only (never spends a wasted penny, misses every
same-person-different-file case and would ship a dedupe feature that
misses most duplicates).

### D2 — what a STRONG in-mandate match does *(post-parse, email or linkedin)*

The row exists, the bytes are stored, the parse is paid for, and the
database says this is the same person already in this mandate.

**Recommended: discard the new row, keep the existing one, and say both
halves out loud.** The existing row carries the recruiter's work — stage,
notes, scores, interview history. The new row carries nothing but a fresh
parse. So the new candidate row and its uploaded object are deleted, and
the sentence names the row it duplicated **and states that the file just
uploaded was not kept.**

The newer file *is* lost, and that is the cost of this ruling. The
alternative shape — keep the new file against the old row — is refused on
precedent: migration 073's D9 already ruled that moving `cv_url` without
re-parsing desyncs the stored profile from the stored document, and a
re-parse here is a second billed call to reach the same profile.

*Alternative:* keep both rows, flag the new one, let the recruiter merge.
Loses nothing, and grows exactly the clutter the ask is about.

### D3 — what a NAME-ONLY match does

**Recommended: both rows stand, the new one flagged for a human, no
default action.** "Same name, same employer" is a heuristic that collides
for common names at large employers. The importer already rules this way,
and §175's defect class is precisely a probability asserted as a fact.
The recruiter is told what matched and what did not.

*Alternative:* treat it as a duplicate and discard. Faster, and wrong
about two real people roughly as often as common names occur.

### D4 — the same person in ANOTHER mandate

**Recommended: a fact on the result line, never a refusal.** §200 built
the cross-mandate path on purpose. Nothing is saved by refusing anyway —
the reuse path re-parses against the target's calibration, so the second
parse is the cost of scoring against a different role, not waste.

This applies to Tier 1 as well: a byte-identical file already parsed
under a *different* mandate is reported, not blocked.

### D5 — the DOCX-only email probe

**Recommended: no.** Not because of the PDF dependency, but because an
email scraped from a CV's text is frequently not the subject's — a
referee's, a former employer's, a recruiter's own footer on a reformatted
CV. Keying a person on it and refusing their upload would be the system
asserting what it does not know, on the cheapest possible evidence. And
shipping it for DOCX only would make the feature's behaviour depend on
the file format, which no recruiter would be able to predict.

### D6 — the apply door (134)

**Recommended: named and left out of this slice.** An applicant applying
twice is their own act with their own §193 declared identity and its own
consent story; refusing a person's second application silently is a
different decision from refusing a recruiter's second upload. Out of
scope here, recorded so it is not mistaken for an oversight.

---

## Part 5 — As it would be built, under the recommended rulings

**Migration 141**
- `candidates.cv_sha256 text` — the hash of the stored document. Null for
  every pre-141 row, permanently and by design.
- Partial index on `(organization_id, cv_sha256) WHERE cv_sha256 IS NOT
  NULL` — the read is org-scoped, never global (the baseline discipline
  §195 set).
- Activity CHECK **100 → 101**: one new type for the duplicate outcome,
  the payload distinguishing *discarded* from *flagged*, so a row that
  was created and destroyed is trailable rather than merely absent.
- No change to `candidate_identity_key` or to 040 — **the hash is
  document identity and is deliberately outside the person-identity
  rule**, so the twin-transcription warning is not triggered.
- Somewhere for D3's flag to live: a nullable `identity_review` column
  carrying the ambiguous verdict and the row it resembles, so the screen
  can show it and it survives a reload.

**`src/lib/candidates/dedupe.ts`** — pure, no I/O, the way `import.ts`
is pure: hash comparison, and a classifier that returns the importer's
own `new | duplicate | ambiguous` verdict from `identityKey` +
`identityStrength`. Both call sites of `uploadAndParseCv` inherit it
because the gate lives in the action, not in either form.

**In the action:** the hash is computed from the bytes already in memory
(`file.arrayBuffer()` is already read), checked before the placeholder
row is inserted — so a refusal leaves no row and no stored object,
matching §177's door, which sits in the same function for the same
reason.

**In the batch:** the intake form hashes each file as it is added and
marks in-batch repeats `skipped` before the run starts, next to the
existing over-10-MB and empty-file skips — the same affordance, no new
vocabulary on screen.

**Guards, mutation-tested:** in-batch hash skip; in-mandate hash refusal
leaving no row; cross-mandate hash reported not refused; strong post-parse
match discarding; name-only match flagging and *not* discarding; the
fourth `identityKey` copy staying deleted.

**The tab guide moves in the same commit.**
`candidates-intake.md:38` currently promises the opposite of this, and a
guide that describes last week's product is worse than no guide.

**Drive 133** proves it live, in production: the same file twice in one
batch; the same person as two different files; a name-only collision
between two genuinely different people standing as two rows; and a
cross-mandate repeat going through unrefused. Teardown exact.

---

## Part 5b — ONE WIDENING, decided in the build and surfaced here

Writing the guard exposed a case the ruled design misses and recruiters
hit constantly: **a CV with no contact details, then a later CV of the
same person with an email on it.** Their keys are `name:jane doe|acme`
and `email:jane@acme.com`, which are not equal, so a strict key
comparison sees two strangers and neither D2 nor D3 ever fires.

So `classifyAgainstMandate` has a second pass: when the keys do not
match, it compares name|company, and flags the pair if — and only if —
nothing **contradicts** it. Two different email addresses on the two rows
is positive evidence of two different people and outranks a shared name;
same for two different LinkedIn profiles.

**The weak pass can only ever return `ambiguous`.** It never returns
`duplicate`, so it can never cause a deletion — the evidence it works
from is exactly the evidence D3 ruled a human must weigh. Widening the
FLAG is safe; widening the DISCARD would be §175's defect with a delete
button on it. Pinned behaviourally, and mutation-tested by making the
weak pass return `duplicate` (caught).

---

## Part 6 — What this does NOT do, named

- **No merge tool.** Flagging an ambiguous pair is not resolving it;
  there is no screen here for folding two rows into one, and D3
  deliberately leaves both standing. If the founder wants merge, it is a
  separate slice with its own rulings about whose notes win.
- **No retroactive sweep** of duplicates already in the pool. This gate
  is about the door, not the room.
- **Nothing for the apply door** (D6).
- **The pre-141 blind spot in Tier 1**, stated in Part 3 rather than
  discovered by a recruiter.
