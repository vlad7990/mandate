# THE FOLD MOVES INTO POSTGRES — THE GATE — 2026-09-25 — DRAFT

**Awaiting the founder's word. Four rulings. D1 decides how much of this
page's behaviour becomes URL state; D3 decides whether searching by skill
keeps working.**

The ask: **"gate the postgres fold and drop the 2000-row cap."** §204 named
this as the next slice and said it was unblocked for the first time: the
fold now runs on a stored, indexed column, which is exactly the thing the
cap's own comment blamed for the cap's existence.

---

## Part 1 — What the cap costs, measured on production

Three probes, each in an aborting transaction (measurements come back,
everything rolls back — the §202 shape). Baseline re-counted after all
three and intact: candidates 4, profiles 4, events 123, badge 4.

### (a) THE PAGE SHIPS 41.5 MB TO RENDER 25 ROWS

With the window full (2,100 candidate rows, each carrying a real
`cv_structured` — the live average is **14.9 KB**, max 21.6 KB):

```
bytes the page ships TODAY (2000 rows):  42,497 KB  (of which cv_structured: 42,217 KB)
bytes ONE folded page of 25 needs:           13 KB
```

**99.3% of that payload is `cv_structured`**, selected for every row in the
window so the fold can read THREE fields — `domain`, `years_experience`,
`tech_exposure` — from each person's canonical row only. Everything else in
those blobs (evaluation, positioning kits, psychology, full work history) is
transferred and discarded. The ratio between what is shipped and what is
needed is about **3,200×**.

### (b) THE CAP RE-BREAKS EXACTLY WHAT §204 JUST FIXED

```
candidate rows in the pool:            2100
people the page can see (window 2000): 2000
people who actually exist:             2100   <- badge says this
```

§204 spent a slice making the badge and the page answer the same question.
Above the cap **they diverge again**, silently, because the badge counts the
whole pool in SQL and the page counts a window.

### (c) AND A PERSON WHO IS ON THE PAGE GETS A FALSE RECORD

This is the one that decides the slice. A person with a recent record and an
older one, with the window filled in between:

```
person is on the page:                 t
mandates the page can see for them:    1   <- "Considered for 1 project"
mandates they are actually on:         2
```

The cap does not merely shorten the list. **It makes a visible person's row
say something untrue about them** — one appearance instead of two, a worse
best tier, an older "last active", and a `Returning` badge that does not
appear for somebody who is returning. The banner says older records are not
counted, which is true and is not the same as legible: nothing on that row
says *this row is short*. §175's class, at the top of the page.

---

## Part 2 — What Postgres does instead, measured

Same 2,100-row pool, the fold expressed as a GROUP BY on
`network_profile_id` with the appearances gathered per page:

```
timings ms — page 1: 65 | page 81 (OFFSET 2000): 4 | server-side search: 617
```

Three things follow.

1. **Paging deep is free.** OFFSET 2000 cost 4 ms, so the existing list
   contract (`rangeFor`, an OFFSET) is enough; keyset paging would be
   ceremony. Page 1's 65 ms is the appearances gather on first touch.
2. **The rollups are trivial** — the whole-pool analytics aggregate measured
   3 ms in the first probe.
3. **The searchbox is the expensive part: 617 ms** for one ILIKE across
   name/title/company plus `cv_structured ->> 'domain'`, with no index.
   That is per keystroke. `pg_trgm` is **available and not installed**.

---

## Part 3 — The rulings

### D1 — how much of the page becomes URL state *(load-bearing)*

Today the Network page hands the client every person and the client does
all of it: search, five filters (archetype, best tier, domain, stage across
any appearance, years bucket), four sorts with a direction, and 25-per-page
pagination.

**Recommended: the page joins the contract the rest of the product already
uses.** `parseListParams` + `rangeFor` + `splitOverfetch`, filters and sort
and query in the URL, one `network_people(...)` function doing fold →
filter → sort → page in SQL. The candidates and mandate lists work exactly
this way; this page is the last unbounded read in the product, and the
reason it was the outlier — that identity was computed per row — stopped
being true in §204.

What that costs, said plainly: **the instant client-side filtering goes
away.** Each filter change and each (debounced) keystroke becomes a
request. In exchange the page stops lying above 2,000 rows, stops shipping
41 MB, and becomes shareable and bookmarkable like every other list.

*Alternative, and a real one — fold in SQL but return EVERY person, keeping
the client's filtering exactly as it is.* One row per person instead of one
per candidate record, with no `cv_structured` blobs: about 500 bytes a
person, so 2,100 people ≈ 1.1 MB instead of 41.5 MB — a 40× cut, no new URL
contract, no UX change, and (b) and (c) above both fixed because nothing is
windowed. It is a much smaller slice. It also leaves the cost proportional
to the number of PEOPLE rather than the number of records: at 50,000 people
the page is back in trouble, and this gate would have deferred rather than
decided.

### D2 — what the KPI tiles and the filter dropdowns describe

The header reads "005 executives in network · 1 returning · 1 shortlisted
before", and four tiles plus two charts (by archetype, by domain, top by
average, most versatile) are computed in Node from the same array the table
filters. Under D1's recommendation that array is ONE PAGE.

**Recommended: they describe the whole pool, from their own rollup**, in the
same shape as `candidate_stage_counts` (migration 045) — and they respect
the active filters, so "5 executives" means "5 executives matching what you
asked for", not "5 on this page". Same for the **domain dropdown**, whose
options are currently derived from the loaded people: it needs its own
distinct-values query or it will only ever offer the domains on page one.

This is a correctness gain, not only a performance one: today those tiles
describe the window, which is why (b) is possible.

*Alternative:* compute them from the page. Cheap, and the headline number of
the page would then be a description of 25 rows wearing the word "network".

### D3 — what the searchbox searches, server-side

Today it searches name, title, company, domain **and skills**
(`tech_exposure`, an array inside `cv_structured`).

**Recommended: keep all five, and install `pg_trgm` to pay for it.** GIN
trigram indexes on `full_name`, `current_title`, `current_company` and on
the two JSON expressions (`cv_structured ->> 'domain'`, and
`cv_structured -> 'tech_exposure'` as text) — because 617 ms per keystroke
is not a search box, and the honest version of "drop the cap" cannot
introduce a new unbounded scan while removing an old one.

*Alternative:* narrow the search to the three plain columns and say so in
the placeholder. Cheaper, no new extension — and it silently removes the
only way to find "the people who have run SAP migrations", which is a large
part of why a recruiter opens this page.

### D4 — where the function sits, and what goes away

**Recommended, following the documented reasoning in 040 and 045:
`SECURITY INVOKER`, `STABLE`, `SET search_path`, granted to `authenticated`
and `service_role` only.** The org scope stays RLS's job — a `DEFINER`
function here would leak one org's network into another's count, which is
what 045's comment already warns about. No new table, no new policy, anon
roster untouched, and the app-recordable door untouched (this slice writes
nothing).

Deleted in the same change, because leaving them is how a page ends up
describing itself wrongly: `CANDIDATE_ROW_CAP`, the `truncated` flag and its
banner. §204's `people_pending` (rows with no person yet) becomes a count
from the same function rather than a side effect of a loop in Node.

*Alternative:* keep the cap as a safety valve at a much higher number. It
would never fire, and an invariant that never fires is an invariant nobody
maintains.

---

## Part 4 — As it would be built, under the recommended rulings

**Migration 145**
- `pg_trgm`, plus the five trigram indexes (D3).
- `network_people(p_q text, p_archetype text, p_tier text, p_domain text,
  p_stage text, p_years text, p_sort text, p_dir text, p_limit int,
  p_offset int)` — one `SECURITY INVOKER` set-returning function: fold on
  `network_profile_id`, filter, sort, page, returning one row per person
  with the canonical row's facts, the aggregates (best/avg score, best
  tier, last active, appearance count, returning, shortlisted-before) and
  its appearances as JSON.
- `network_people_rollup(<same filters>)` — the tiles, the archetype and
  domain histograms, the returning and shortlisted counts, the
  person-less-row count, and the total for the pager (D2).
- `network_domains()` — distinct domains for the dropdown.

**The page** reads `searchParams` through `parseListParams`, renders the
table as a server component over one page of people, and keeps the
relationship overlay joined on `profile_id` (§204) — but fetched for the
page's people rather than the whole org.

**`network-aggregator.ts`** keeps `foldRowsIntoPeople` as the SHAPE
authority and the fixtures' target, with the SQL becoming its second
implementation — and a guard that the two agree on the same fixture, in the
spirit of the `identityKey` ⇄ `candidate_identity_key` pairing (which is
documented, mutation-tested, and has caught drift twice).

**Guards, mutation-tested:** the fold's aggregates match `foldRowsIntoPeople`
on a shared fixture; every filter narrows and none of them silently returns
the unfiltered set; the rollup counts the POOL and not the page; the
function is not `SECURITY DEFINER`; no `anon` grant; the cap and the
`truncated` banner are gone from the source.

**Drive 137** proves it live at scale the same way this gate was measured —
a probe-sized pool, in a transaction that rolls back, plus a real page load:
page 1, a deep page, each filter, the search, and the tiles describing the
whole pool rather than the page. The measurement that matters is the one
from Part 1(c): a person on 2 mandates reads "2 projects" no matter which
page they are on.

---

## Part 5 — What this does NOT do, named

- **It does not touch what a person IS** — §204's fold rule, §203's merge
  and the alias table are unchanged. This is the same question asked in a
  different place.
- **It does not index for the agents' pool read.** `run-candidate-search`
  still reads candidate rows wholesale under its own session; that is a
  different unbounded read with a different owner, and it should be gated
  separately rather than half-fixed here.
- **It does not add a saved-view or a per-user default filter**, tempting as
  the URL state makes it.
- **It does not change the merge panel's own query** (§203/§204), which
  reads profiles and counts records and is bounded by people, not records.
- **It does not touch the erasure gate** (§204 D4, still open) or add an
  un-merge.
