# BULK CV INTAKE + REUSING THE POOL ACROSS MANDATES — THE GATE — 2026-09-25 — DRAFT

**Awaiting the founder's word. Four rulings, one of them load-bearing.**

The ask, in the founder's words:

1. Pick a mandate from a dropdown.
2. Upload many CVs at once, then **Upload and Parse**.
3. For any mandate, an agent reads the CVs already in the database and
   suggests the ones aligned to this search; the user picks; the picked
   ones are added — *"this way we can reuse existing CVs across multiple
   Mandates where aligned."*

---

## Part 1 — What already exists, so this is not reinvented

**The reuse engine is already built and already a principal.** The
**Candidate Search Agent** (`run_candidate_search`,
`src/lib/ai/run-candidate-search.ts`) signs in as itself, loads the org's
whole candidate pool, applies structural filters, sends a compact line
per candidate — title, company, archetype, stage, which mandate they sit
in, overall score, tier, dominant CV signals, headline — and returns up
to 25 ranked matches with a 0–100 score and a rationale that must cite a
concrete signal. It already carries the org's Skills, and it already
writes one trail event per answered search with a `trigger` field.

**So part 3 needs no new agent, no new capability slug, and no new
allowlist entry.** It needs the query to come from the *mandate's
calibration* instead of a typed sentence, the people already in that
mandate excluded from the haystack, and an "add these" action on the
results. `trigger: "mandate"` instead of `"query"` on the existing event.

**Part 2 is a loop around an existing action.** `uploadAndParseCv`
(`projects/[id]/candidates/actions.ts:46`) takes one file and one
`projectId`, validates type (PDF/DOCX) and size (10 MB), runs §177's
spec-drift door **before** anything is created, inserts the row with
`cv_processing = true`, uploads to the `cvs` bucket, parses, and fills
the profile. Server actions already accept 50 MB bodies.

**Part 1 — the mandate dropdown — is new, and small.**

## Part 2 — The three facts that decide the build

**(a) A candidate row belongs to ONE mandate.** `candidates.project_id`
is a column on the row itself. "Adding an existing person to this
mandate" is therefore **a new candidate row**, not a link — and the
thing that makes it the same *person* is `network_profile_id` (§193/§194),
which already exists and already keys people across mandates.

**(b) A parse is mandate-aware.** `uploadAndParseCv` hands the project's
`calibration_model` to the parser so the same call produces a
fit-vs-role analysis. That means, for a person being reused: **the
profile travels, the verdict must not.** A judgment made against another
role is §175's and §177's defect class exactly — the RBC re-scoring
proved a mis-scoped role can flatter a candidate by three points a
dimension. Copying mandate A's evaluation into mandate B would be the
same error with a copy button on it.

**(c) There is no per-user ownership and no reporting line.**
`candidates` has no `created_by` / `owner_id` / `uploaded_by`;
`public.users` has no `manager_id` / `reports_to`. Visibility is
`organization_id`, full stop, and the Candidate Search Agent's own RLS
session is what scopes the pool today. **"A recruiter sees their own CVs,
a manager sees theirs plus their recruiters'" cannot be built on what
exists** — it needs an ownership column on `candidates`, backfilled for
every existing row, AND a team/reporting model on `users`, AND every
read path in the product taught about both. That is its own programme,
and it changes what the product *is*: a shared desk pool becomes private
books. Ruling D1.

## Part 3 — What gets built, if the word is given

**Slice 1 — Bulk intake.** A new route `/app/candidates/intake`
(nav: child of Candidates, beside Pool search). A mandate dropdown
listing the org's mandates, each showing whether it is calibrated —
uploading into an uncalibrated mandate parses against nothing, and §197
just finished making that state honest elsewhere. A multi-file picker
(`multiple`, PDF/DOCX), a per-file row, one **Upload and Parse** button,
and a per-file result: parsed / failed with its own sentence / skipped.
Files are processed **one at a time**, because each is a billed AI call
and a half-finished batch must be legible rather than atomic — the
recruiter's uploaded files are their own act (091 D2/D5, the same split
onboarding uses). §177's door is checked **once, before the first file**,
so a refusal costs nothing and leaves nothing.

**Slice 2 — Suggest from the pool.** On the mandate page, beside the
existing Find Candidates panel: **"Suggest from our pool"**. It runs the
Candidate Search Agent with the mandate's calibration as the query,
excluding anyone already in this mandate. Results render as the agent's
ranked list — name, where they currently sit, match score, the
rationale sentence — each with a checkbox. **Nothing is added until the
human ticks and confirms** (§196's doctrine: the agent authors, the
human approves; proposed scores nothing).

**Slice 3 — Add, honestly.** Ticked people are inserted into this
mandate as new candidate rows carrying: the parsed profile
(`cv_structured`), the CV pointer, name/title/company/contact, and the
**same `network_profile_id`** so the Network screen keeps one person.
What does **not** travel: the other mandate's fit analysis, scores,
tier, recruiter assessment, pipeline stage (they start at the first
stage here). `source_kind` records that this came from the pool, and the
trail names the mandate they came from.

## Part 4 — THE GATE

### D1 — Who can the agent see? **(the load-bearing one)**

*Recommendation: the organisation's pool, as today — and do NOT build
per-user books in this slice.* The founder asked for per-user / per-
manager scoping; §2(c) is why that is a programme rather than a flag.
Beyond cost, it is a product question: on a shared desk, a CV that one
recruiter parsed is the firm's asset, and hiding it is how the same
person gets parsed three times. If private books are genuinely wanted,
they should be gated on their own and built once — ownership column,
backfill, reporting line, and every read path — not approximated here.

*The alternative, if you want it now:* a smaller version — record
`uploaded_by` on new candidate rows (cheap, additive, no backfill
question answered) and show it, without changing visibility. That buys
the audit answer "who brought this person in" without splitting the pool.

### D2 — Where bulk intake lives

*Recommendation: a new `/app/candidates/intake` page with the mandate
dropdown,* exactly as described. The mandate page's upload stays for the
one-CV case. A dropdown on a dedicated page is the right shape for "I
have thirty CVs and need to say where they go"; putting a mandate picker
on a mandate page would be strange.

### D3 — What crosses when a person is reused

*Recommendation: the profile crosses, the judgment does not.* Per §2(b).
The alternative — copying the prior evaluation so the new mandate starts
"already scored" — is faster and wrong, and the product has already been
burned by exactly this.

### D4 — Whether adding re-scores immediately

*Recommendation: yes, automatically, one evaluation per added person, and
say so on the button.* The alternative is an unscored row sitting in the
leaderboard as a blank, which reads as a defect. The cost is real and
should be stated in the UI before the click ("Add 6 people · 6
evaluations will run"), and the batch is capped.

## Part 5 — Bounds and guards

- **Batch cap: 20 files per upload.** Each is a billed `parse_cv` call;
  twenty is a real recruiter's inbox and a bounded bill. Stated in the UI,
  not discovered on submit.
- **Pool bound, named:** the Candidate Search Agent sends one line per
  candidate for the WHOLE org pool. That is fine at hundreds and will not
  be at thousands. The structural filters shrink the haystack first; when
  the pool outgrows the prompt this needs retrieval, and the gate says so
  now rather than pretending otherwise.
- Guard: the reuse insert is a pure function over (source row, target
  mandate) returning the row to insert — unit-tested that the fit
  analysis, score, tier, assessment and stage are absent from its output,
  and that `network_profile_id` is preserved. Mutation-tested.
- Guard: bulk upload's per-file outcome is a pure reducer — tested that
  one failure does not mark the batch failed and does not stop the rest.

## Part 6 — What this is NOT

Not a change to how a single CV is uploaded today. Not a new agent
principal. Not LinkedIn import, not email ingestion, not a resume
parser for bulk ZIPs. Not private per-user pools (D1). Not a change to
scoring itself — the Evaluation and Ranking agents are untouched; they
simply run on more rows.

---

Numbers if this passes: **no migration** on the recommended path (D1's
smaller alternative would add one column); next § 200; vitest +~12;
CHECK 99; door 26; allowlist 31 (the `candidate_search_answered` event is
already a member); anon roster 14.
