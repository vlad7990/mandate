# Search Intelligence — Sourcing Runs & Result Import — Design

**Date:** 2026-08-12
**Status:** Design — ready to turn into an implementation plan
**Depends on:** `boolean_queries` (mig 001, 013), `candidates`, `PIPELINE_STAGES`
(`src/lib/ai/cv-parsing.ts`), sourcing agent (`src/lib/ai/sourcing-analysis.ts`)

## Purpose

Close the loop between a search strategy and what it actually produced.

Today Mandate generates Boolean/X-Ray/ATS queries and then loses the thread: the
recruiter runs them somewhere else, and nothing records what came back, whether
the strategy was any good, or which searches eventually produced hires. The
queries are versioned; the *strategies* are not, and neither is their yield.

A **sourcing run** makes an AI-guided search strategy a first-class object:
the brief it came from, the reasoning that produced it, the queries it bundles,
where it was run, what came back, and — through the pipeline — what it hired.

## Key decisions

1. **A run is a versioned strategy, and lineage BRANCHES rather than
   supersedes.** This is the one place the existing versioned-artifact pattern
   (profiles → plans → assessments → risk reviews) must be adapted rather than
   copied. Those artifacts are linear: approving v2 archives v1, because only
   one can be current. A search strategy is the opposite — v1 stays valid
   precisely because its yield is the baseline v2 is measured against. So:
   `parent_run_id` for lineage, `root_run_id` to group a family, **no**
   archive-on-promote, **no** one-current-per-project index.

2. **Executed runs are immutable.** Once results are imported, the strategy
   snapshot freezes. This is the same rule as approved artifacts and for the
   same reason: the record must describe what actually happened. Without it a
   recruiter edits the Boolean after importing and the attribution silently
   becomes a lie.

3. **Queries are SNAPSHOTTED into the run, not referenced.** `boolean_queries`
   rows are versioned and a new version can be written at any time. Storing
   `query_id` would let a later edit rewrite the history of a completed run.
   The run stores the query text as it stood when executed.

4. **Imports stage before they become candidates.** Pasted and CSV data is
   messy, frequently duplicates people already in the pool, and — for anyone
   sourced rather than applied — creates a personal-data record with obligations
   attached. A human confirms before a `candidates` row exists.

5. **Attribution is first-touch by default.** A person surfaced by three runs
   would otherwise credit a single hire to all three and inflate every
   strategy's conversion. All appearances are recorded; the *attributed* run is
   the earliest executed one.

6. **Provider-agnostic.** `source_platform` records where a result came from
   (LinkedIn Recruiter, Sales Navigator, ATS, X-Ray, GitHub, …). Import doesn't
   care, and a future provider gateway becomes another platform value rather
   than a schema change.

## What this deliberately is not

Not a scraper and not an integration. Mandate generates the strategy and ingests
what the **recruiter** exports from a tool they already have a seat for. The
policy boundary from `src/lib/sourcing/source-policy.ts` is unchanged: it governs
what *we* fetch automatically, which remains nothing on the block list. A
recruiter exporting their own search results is a different act from us
collecting them, and `source_platform` keeps that auditable.

Screenshot/OCR import is **excluded**. It is automated extraction of a platform's
UI by another route, and it carries the ToS exposure the rest of this design
avoids. Paste and CSV only.

## Data model (migration 041)

### `sourcing_runs`

```
sourcing_runs (
  id, project_id -> projects ON DELETE CASCADE,
  organization_id -> organizations ON DELETE CASCADE,
  -- Lineage. root_run_id = id for a v1; children carry the ancestor's root
  -- so a whole family is one indexed read.
  parent_run_id uuid -> sourcing_runs ON DELETE SET NULL,
  root_run_id   uuid NOT NULL,
  version int NOT NULL,                       -- 1, 2, 3 … within a lineage
  label text,                                 -- "Conservative", "Adjacent industries"
  status text CHECK IN ('draft','executed','archived') DEFAULT 'draft',
  content_json jsonb NOT NULL DEFAULT '{}',   -- brief + reasoning + query snapshot
  analysis_json jsonb NOT NULL DEFAULT '{}',  -- coverage findings + refinements
  -- Result counters, stamped at import. Denormalized on purpose: the metrics
  -- page reads them per run and must not scan the results table.
  result_count int NOT NULL DEFAULT 0,
  imported_count int NOT NULL DEFAULT 0,
  executed_at timestamptz, executed_by -> users,
  prompt_version text, model_version text,
  created_by -> users, created_at, updated_at
)
```

Indexes: unique `(root_run_id, version)`; `(project_id, created_at DESC)`;
`organization_id`; `parent_run_id`; `root_run_id`. RLS `org_sourcing_runs_only`
via `public.current_user_org_id()`.

#### `content_json` shape

```jsonc
{
  "brief": {
    "role_title": "Global Head of Regulatory Technology",
    "must_haves": ["15+ years capital markets", "post-trade"],
    "geographies": ["New York", "Toronto"],
    "target_companies": ["JPMorgan", "Goldman Sachs"]
  },
  // Why this strategy — the agent's own account, shown to the recruiter and
  // carried forward so a v3 can see what v2 was trying to fix.
  "strategy_rationale": "Tier-1 banks only, exact titles. Narrow by design — this is the baseline.",
  "queries": [                       // SNAPSHOT, not a reference
    {
      "slot": "linkedin_exact",      // SlotKey from sourcing-analysis.ts
      "query_type": "linkedin",
      "search_type": "exact",
      "content": "(\"Managing Director\" OR \"Global Head\") AND …",
      "platform": "linkedin_recruiter"
    }
  ]
}
```

#### `analysis_json` shape

```jsonc
{
  "coverage_findings": [
    {
      "dimension": "companies",      // titles | companies | industries | geography | seniority | exclusions
      "finding": "All eight target companies are bulge-bracket banks; buy-side, exchanges and regulators are absent.",
      "suggested_change": "Add asset managers and market infrastructure operators."
    }
  ],
  "suggested_next_version": {
    "label": "Adjacent institutions",
    "changes": ["Add buy-side and exchange operators", "Relax title to include 'Head of'"]
  }
}
```

**`dimension` is a closed enum, and demographic categories are not in it.**
Search-aperture analysis widens the funnel structurally — titles, companies,
industries, geography, seniority bands, over-tight exclusions. It never analyses
or targets protected characteristics. That is a legal exposure in both major
markets (Title VII in the US; Art. 9 special-category processing under GDPR) and
it contradicts the guardrail already shipped in
`ROLE_ARCHITECT_SYSTEM_PROMPT`. Enforcing it as an enum rather than a prompt
instruction means the agent cannot express the disallowed shape at all — the
same technique the risk-synthesis agent uses for severity.

### `sourcing_run_results`

Staged import rows. Not candidates yet.

```
sourcing_run_results (
  id, run_id -> sourcing_runs ON DELETE CASCADE,
  organization_id -> organizations ON DELETE CASCADE,
  full_name text NOT NULL,
  current_title text, current_company text, location text,
  profile_url text, email text,
  -- Provenance, per row. Which platform this line came off, and the raw
  -- import line for audit.
  source_platform text NOT NULL,
  raw jsonb NOT NULL DEFAULT '{}',
  -- Dedupe verdict computed at import against the existing pool, using the
  -- SAME identity rule as network-aggregator.identityKey / mig 040.
  match_status text CHECK IN ('new','duplicate','ambiguous') DEFAULT 'new',
  matched_candidate_id -> candidates ON DELETE SET NULL,
  -- Promotion state. A row becomes a candidate only on explicit human action.
  promoted_candidate_id -> candidates ON DELETE SET NULL,
  promoted_at timestamptz, promoted_by -> users,
  created_at
)
```

Indexes: `(run_id, match_status)`; `organization_id`; `matched_candidate_id`;
`promoted_candidate_id`. RLS org-scoped.

### `sourcing_run_candidates`

Attribution. Every appearance, so multi-touch is visible; first-touch is derived.

```
sourcing_run_candidates (
  run_id -> sourcing_runs ON DELETE CASCADE,
  candidate_id -> candidates ON DELETE CASCADE,
  organization_id -> organizations ON DELETE CASCADE,
  created_at,
  PRIMARY KEY (run_id, candidate_id)
)
```

The attributed run for a candidate is the executed run with the earliest
`executed_at` among its links. Computed in a view rather than stored, so
back-filling an earlier run later corrects the attribution instead of leaving a
stale winner.

### Candidate provenance columns

```
ALTER TABLE candidates
  ADD COLUMN source_kind text,          -- 'applied' | 'sourced' | 'referred' | 'imported'
  ADD COLUMN source_platform text,      -- where a sourced person was found
  ADD COLUMN source_url text,
  -- GDPR Art. 14: when personal data is obtained other than from the person,
  -- they generally must be told. Tracking it here makes the obligation
  -- visible and actionable rather than implicit.
  ADD COLUMN sourced_at timestamptz,
  ADD COLUMN subject_notified_at timestamptz;
```

`source_kind = 'sourced'` is the flag that a person is in the system without
having approached us. Everything downstream — retention, notification, erasure
— keys off it. This is the piece missing from every version of this design so
far, including mine, and it is far cheaper to add now than to retrofit onto a
populated candidate table.

## RPCs

- `allocate_and_insert_sourcing_run(p_project_id, p_organization_id,
  p_parent_run_id, p_label, p_content_json, p_created_by, p_prompt_version,
  p_model_version)` → `(id, version, root_run_id)`.
  Locks the parent row (or the project for a v1), derives `root_run_id` from the
  parent, allocates `version` as `MAX(version)+1` within the lineage. Mirrors
  `allocate_and_insert_interview_plan`'s concurrency discipline.

- `mark_sourcing_run_executed(p_run_id, p_result_count)` → void.
  Sets `status='executed'`, `executed_at=now()`, `executed_by=auth.uid()`,
  stamps `result_count`. This is the transition the immutability guard keys on,
  so it is RPC-only under `mandate.allow_sourcing_run_transition`.

## Immutability guard

`guard_sourcing_runs()` + `BEFORE INSERT OR UPDATE`, dedicated flag
`mandate.allow_sourcing_run_transition`. Rules:

- Insert must be `draft` unless the flag is set.
- On an `executed` or `archived` row, `content_json`, `parent_run_id`,
  `root_run_id`, `version`, and `executed_at` are frozen.
- `analysis_json`, `label`, `imported_count`, and `status→archived` remain
  writable on an executed run — analysis happens *after* execution by
  definition, and archiving is a retirement, not an edit.

That last carve-out is the difference from the approved-artifact guards, which
freeze the whole row. Getting it wrong in either direction is a real bug: freeze
too much and coverage analysis can never be written; freeze too little and the
executed strategy is editable.

## Import flow

```
Recruiter runs the query in their own tool
        ↓
Paste rows  |  Upload CSV                    (no screenshots — see above)
        ↓
Parse + column mapping (name, title, company, location, profile URL)
        ↓
Dedupe against the pool  →  new | duplicate | ambiguous
        ↓
Review table — recruiter confirms per row
        ↓
Promote  →  candidates row (source_kind='sourced', platform, url, sourced_at)
        →  sourcing_run_candidates link
        →  run.imported_count stamped, run marked executed
```

Design notes:

- **Dedupe reuses `identityKey`** (email → linkedin → name+company), the same
  rule as the network badge and migration 040. Three implementations of person
  identity would drift; there must be exactly one.
- **`ambiguous` is a real verdict, not a failure.** Same name, different
  company is the common case and the recruiter is the one who can resolve it.
- **Nothing is promoted implicitly.** A run can be executed with zero
  promotions — that is a legitimate and informative outcome ("this strategy
  yielded nothing usable") and the analysis should say so.
- **CSV parsing is server-side** with a row cap, so a pasted 50k-row file
  cannot wedge the browser or the action.

## Learning signal — and its guard

Per-strategy conversion reads: run → linked candidates → `pipeline_stage`
through the existing funnel (`found … shortlisted … interviewed … offer …
hired`). Both ends already exist; the link table is the only missing piece.

**Do not surface conversion rates below a minimum sample.** Two hires across
four strategies is noise, and presenting it as "Strategy B converts 3× better"
is a confident wrong answer that will shape real sourcing decisions. Below the
threshold the UI shows counts only, labelled as too early to compare —
consistent with the house rule that non-real or provisional figures carry a
visible label at the point of display. Suggested threshold: no rate shown until
a lineage has ≥20 linked candidates and ≥3 terminal outcomes; revisit with data.

## Routes / UI

| Route | Change |
|---|---|
| `projects/[id]/sourcing` | Existing Boolean editor gains **strategy variants** and a "Save as run" action creating a `draft` |
| `projects/[id]/sourcing` → **Runs** tab (new) | Lineage view (v1 → v2 → v3), per-run yield, "Import results", "Refine into v(n+1)" |
| `projects/[id]/sourcing/runs/[runId]/import` (new) | Paste/CSV → mapping → dedupe review → promote |
| `projects/[id]/candidates` | Origin chip on sourced candidates; filter by run |
| `projects/[id]/candidates/new` | Gains a "from sourcing run" path |
| `projects/[id]/metrics` | Per-lineage funnel, behind the minimum-N guard |
| `analytics` | Cross-project strategy shapes, same guard |
| `projects/[id]/ranking` · `/comparison` · `/shortlist` | **No change** — already answer "which 20?", which is the payoff |
| Copilot | Run context added so "why is this search under-yielding?" is answerable |

## Compliance

- `source_kind='sourced'` + `sourced_at` + `subject_notified_at` make the
  Art. 14 notification obligation trackable. The notification workflow itself is
  a follow-up, but the fields must land with the data or they cannot be
  back-filled.
- Erasure must cascade: deleting a candidate leaves staged
  `sourcing_run_results` rows holding the same personal data. Deletion has to
  clear staged rows for that person too — call this out in the test plan, it is
  easy to miss.
- Coverage analysis is aperture-only, enforced by the `dimension` enum.
- Import records the platform, so an audit can answer where any sourced person
  came from.

## Tests

- `sourcing-import.test.ts` — CSV/paste parsing, column mapping, row cap;
  dedupe verdicts (`new`/`duplicate`/`ambiguous`) against `identityKey`
  including the email-case, trailing-slash, and same-name-different-company
  cases already pinned in `source-policy.test.ts`.
- `sourcing-attribution.test.ts` — first-touch selection with multi-run
  candidates; a later-executed run does not steal attribution; back-filling an
  earlier run corrects it.
- `supabase/tests/sourcing_run_invariants.sql` — executed runs reject
  `content_json` edits; `analysis_json` still writable when executed; promote
  to executed is RPC-only; lineage version allocation is atomic under
  concurrency; RLS org scoping. Rolled-back transaction, then validated against
  prod rolled-back.

## Verification plan

1. `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`.
2. Apply 041 to prod; run the invariant SQL rolled back.
3. UI smoke: generate strategy → save run v1 → import a 20-row CSV with two
   deliberate duplicates and one ambiguous → promote → confirm links,
   `source_kind`, counters → refine into v2 → confirm lineage and that v1 stays
   readable and comparable → advance one candidate to `hired` → confirm
   attribution lands on v1, not v2.

## Out of scope (YAGNI)

Coverage-analysis **agent** (next spec — `analysis_json` is shaped for it);
provider gateway; cross-organization strategy library (raises data-sharing
questions worth their own decision); notification/erasure workflow UI;
screenshot import; automatic re-running of searches.
