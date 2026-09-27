# THE AGENT'S POOL READ HAS A CEILING — THE GATE — 2026-09-27 — DRAFT

**Awaiting the founder's word. Four rulings. D1 decides whether the Candidate
Search Agent stops working above a pool size or judges a stated subset; D4
decides whose CV it never sees.**

The ask: **"gate the agents' unbounded pool read."** §205 named it as the one
unbounded read left after the Network page was fixed, and said it deserved its
own gate because it has a different owner: the agent, under its own session.

---

## Part 1 — What it does today

`runCandidateSearchAsAgent` (096, extended by §200) signs the Candidate Search
Agent in and reads **every candidate row the agent can see**:

```ts
.from("candidates").select("id, project_id, full_name, current_title, …, cv_structured, …")
```

No `LIMIT`, no `range`, no filter pushed down. Every filter — mandate,
archetype, stage, tier, §200's owner scope, §204's already-on-this-mandate
exclusion — is then applied **in Node**, and what survives is turned into one
JSON object per candidate and sent to the model (`claude-sonnet-4-6`).

Two costs grow with the pool, and the second one is a wall rather than a bill.

### (a) THE WIRE, measured on this org's four real CVs

`cv_structured` averages **14,875 bytes** per row and is selected for every
row — to use six fields from it (domain, scale, six tech entries, three
transformation entries, the summary's first sentence). Arithmetic from that
measured average: a 2,000-candidate pool ships **~30 MB** into the function on
every search. This is the same defect the Network page had before §205, in the
one place §205 deliberately did not touch.

### (b) THE MODEL'S INPUT, measured the same way

The payload the model receives averages **1,476 characters per candidate**
(≈370 tokens): 777 chars of signals, a 185-char headline, the rest identity and
pipeline fields plus JSON formatting. So:

| pool | model input, approx |
|---|---|
| 100 candidates | 37k tokens |
| **540 candidates** | **200k tokens — a 200k context window is full** |
| 2,000 candidates | ~740k tokens |

**Somewhere around five hundred candidates the search stops answering at all**,
and every search below that costs input tokens in proportion to the whole pool
rather than to the question. §200's "Suggest from our pool" calls this on every
mandate, which is exactly the path a growing client exercises most.

**Nobody has hit it yet** — this org has four candidates — and the trail
already records `pool` and `filtered` counts, so the day it happens will be
legible after the fact. That is not the same as handled.

### What is NOT in scope, and why

`copilot-context.ts` also selects `cv_structured` per candidate, but scoped
`.eq("project_id", …)` — bounded by one mandate, tens of rows. The sourcing
importer and the evaluation runners read one candidate at a time. The
unbounded-by-construction read is this one.

---

## Part 2 — The rulings

### D1 — what bounds the model's input *(load-bearing)*

**Recommended: narrow in SQL, then judge at most `N` candidates and say so.**
The filters the code already has move into the query; what survives is ordered
deterministically and cut to a ruled `N` (200 is my recommendation — ~74k
tokens, comfortably inside the window with the skills prompt and room for the
answer); the page then states that it judged 200 of 1,340 and invites a
narrower filter.

*Alternative: page the model.* Judge in batches of 200 and merge the matches.
No ceiling, but the spend per search grows with the pool — a 2,000-candidate
trawl becomes ten model calls, and the recruiter cannot see why one search cost
ten times another.

*Alternative: refuse above the ceiling.* Honest and cheap: "1,340 candidates is
more than the agent can judge — filter first." It also makes the product worse
exactly as a client's pool becomes valuable, and turns a gradual cost into a
cliff the recruiter meets without warning.

### D2 — what the query returns

**Recommended: push every filter down, and stop selecting `cv_structured`.**
Mandate, archetype, stage and §200's owner scope are `eq`/`in` clauses; the
tier filter resolves through `candidate_scores` the way the candidates list
already does it; §204's person-exclusion stays in Node (it needs `personKey`)
but applies to a far smaller set. The six fields the payload actually uses are
selected as JSON paths (`cv_structured->>'domain'` and friends), which turns
14.9 KB a row into roughly 1 KB.

*Alternative:* keep reading whole rows and keep filtering in Node. It is the
status quo, and it means the agent's own session pulls the client's entire CV
library into a function to answer one question.

### D3 — what the recruiter is told, and what the trail records

**Recommended: the count is never silently short.** When the cut fires, the
results say *"judged the 200 most recent of 1,340 in scope — narrow the filters
to change what was read"*, and the existing `candidate_search_answered` event
gains a `judged` alongside `pool` and `filtered`. §175's doctrine: a list that
was cut and does not say so reads as a complete answer, and this one is an
answer a recruiter acts on.

*Alternative:* cut quietly and let the trail carry it. The trail is not on the
screen where the decision happens.

### D4 — which `N` survive the cut

This decides whose CV the model never sees, so it is a ruling and not an
implementation detail.

**Recommended: most recently updated first.** A cross-mandate trawl has no
ranking that means anything yet — `overall_score` and `tier` are calibrated
against the mandate a candidate was scored for, so ordering by score would
promote people judged for an unrelated role and bury everyone unscored, which
is every newly parsed CV. Recency is the one non-arbitrary order, it matches
what the pool page defaults to, and it is explainable in the sentence D3 asks
for.

*Alternative:* order by best score, unscored last. It reads as "the best
candidates first" and is really "the ones somebody already evaluated for
something else first" — the §175 class, as a ranking.

*Alternative:* random sample. Defensible statistically, indefensible to a
recruiter who runs the same search twice and gets different people.

---

## Part 3 — As it would be built, under the recommended rulings

**No migration.** This is a read path in `run-candidate-search.ts`; nothing
about the schema changes, no new grant, no new event type (one new key in an
existing event's detail), so the anon roster and the app-recordable door are
untouched.

- `runCandidateSearchAsAgent` builds one narrowed query (D2), orders by
  `updated_at desc`, and asks for `N + 1` rows so it can tell "cut" from
  "complete" without a second count — the `splitOverfetch` idea the lists use.
- `CandidateSearchRun` gains the two numbers the page needs to say the D3
  sentence (`judged`, `inScope`), and `pool-suggestions` and the Pool search
  page render it.
- `POOL_JUDGE_CAP = 200` sits next to the payload builder with the measurement
  in its comment, so the next person to change it sees 370 tokens per candidate
  rather than guessing.

**Guards, mutation-tested:** the query carries every filter (a filter that
stays in Node fails the suite); `cv_structured` is not in the select list; the
cap reaches `.limit()` rather than being applied after the read; the D3 sentence
appears whenever `judged < inScope` and never when they are equal; the event
carries all three counts.

**Drive 138** proves it live in production: a pool larger than the cap
(scratch rows, swept after), one search showing the D3 sentence with real
numbers, the same search under a filter that brings the pool below the cap
showing no such sentence, and the trail event carrying `pool`, `filtered` and
`judged`. Plus the measurement that matters: the model input for the capped
search, from `inference_runs`, against the 370-tokens-per-candidate figure this
gate was written on.

---

## Part 4 — What this does NOT do, named

- **It does not make the agent smarter about relevance.** A structural cut is
  not a ranking; the model still judges what it is handed. Embedding-based
  prefiltering is a different slice with its own cost and its own gate.
- **It does not touch the copilot's mandate-scoped read** or the evaluation
  runners.
- **It does not add a second model call per search** — that is D1's rejected
  alternative, and if the founder takes it instead, the spend story changes and
  the trail needs to say how many calls a search made.
- It does not revisit `run_candidate_search`'s model choice (§152's flips are
  benchmark-proven law).
