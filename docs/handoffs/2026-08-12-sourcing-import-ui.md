# Continuation — Sourcing Import Flow (routes + UI)

**Date:** 2026-08-12
**Status:** Ready to pick up. Schema and deterministic core are done and
applied; only routes/actions/UI remain.

Paste the body of this file into a fresh session after `/clear`.

---

## Repo

Work in `/Users/vladbreygin/Projects/mandate` — this is the live git repo.
**IGNORE `/Users/vladbreygin/Mandate Recruiting/mandate`**: it is a stale
iCloud clone that still contains plausible-looking old copies of everything.
Bash cwd resets to the stale path between calls, so always prefix
`cd /Users/vladbreygin/Projects/mandate` or use `git -C`.

Supabase project id: `xipyqnltkbtywxqyxupf` (via the claude.ai Supabase MCP).

## What just landed (all committed, all green)

Last 4 commits: `1956e50`, `f17d38d`, `4e21984`, `6468808`.
Migrations **039, 040, 041 are APPLIED to prod**. 166 tests pass; `tsc` and
lint clean.

Spec to follow: `docs/superpowers/specs/2026-08-12-sourcing-runs-design.md`

Schema (041): `sourcing_runs`, `sourcing_run_results`,
`sourcing_run_candidates`, view `sourcing_candidate_attribution`, and
`candidates.{source_kind, source_platform, source_url, sourced_at,
subject_notified_at}`.

Deterministic core already built and unit-tested — **reuse, do not rewrite**:

```
@/lib/sourcing/import.ts  → parseImport(text), dedupeImportRows(rows, existing),
                            firstTouchRun(links), MAX_IMPORT_ROWS = 2000
@/lib/candidate-identity  → identityKey, identityStrength  (single source of
                            truth; mirrored in SQL by migration 040)

RPCs: allocate_and_insert_sourcing_run(p_project_id, p_organization_id,
      p_parent_run_id, p_label, p_content_json, p_created_by,
      p_prompt_version, p_model_version) -> (id, version, root_run_id)
      mark_sourcing_run_executed(p_run_id, p_result_count) -> void
```

## Task: build ONLY the routes/actions/UI

1. **Runs tab** on `projects/[id]/sourcing` — lineage view (v1 → v2 → v3),
   per-run yield, "Import results", "Refine into v(n+1)".
2. **`projects/[id]/sourcing/runs/[runId]/import`** — paste/CSV → column
   mapping → dedupe review table → promote.
3. **Server actions**: create draft run, stage results, promote selected rows,
   mark executed.
4. **Origin chip** on `projects/[id]/candidates` for sourced people.

Promotion must write: a `candidates` row with `source_kind='sourced'` +
`source_platform` + `source_url` + `sourced_at`, a `sourcing_run_candidates`
link, and stamp `run.imported_count`.

## Hard constraints (enforced in the DB — violating these throws)

- Runs are created as `draft` **only**, via the RPC. Direct insert of a
  non-draft row is rejected.
- Promotion to `executed` is RPC-only.
- On an executed run, `content_json` / `parent_run_id` / `root_run_id` /
  `version` / `executed_at` / `result_count` are **frozen**. `analysis_json`,
  `label` and `imported_count` remain writable — that carve-out is deliberate
  (coverage analysis happens after execution).
- Attribution is **first-touch and derived, never stored**. Read the
  `sourcing_candidate_attribution` view; `firstTouchRun()` mirrors its
  ordering exactly.
- A name-only dedupe match is `ambiguous`, **not** `duplicate`. The recruiter
  resolves it — do not auto-merge.
- Candidate erasure already purges staged rows via trigger. Do not duplicate.

## House conventions

- Server components by default; `after()` from `next/server` for background
  work. **Never put an AI call in a render path** (that bug was fixed in
  `6468808`).
- Route boundaries exist now: `(dashboard)/loading.tsx`, `error.tsx`,
  `not-found.tsx`; `Skeleton` + `SkeletonCard` in `@/components/ui/skeleton`.
- 133 design tokens — never hardcode hex. Icons from `@/components/icons`
  (props: `size`, `className`). Mono-label + uppercase tracking idiom for
  section headers; see `plan-generating.tsx` for the reference look.
- Validate any new migration in a **rolled-back transaction** via MCP
  `execute_sql` before `apply_migration`, and assert the **specific** error in
  invariant tests — a catch-all passes on a typo or a missing grant.
- Commit messages: what changed and why it matters; no filler.

## Live issues to know

- **`ANTHROPIC_API_KEY` has no credit balance.** Every AI feature fails in that
  environment. This blocks any end-to-end AI test — keep this task
  AI-independent.
- **Unverified:** whether `web_search` + `output_config.format` can combine in
  one call. `run-sourcing-search.ts` already has a fallback for both outcomes;
  delete the losing branch once credit is restored and it can be tested.
- Nothing writes to the `sourcing_*` tables yet — this task is what fills them.

## Decided; do not relitigate

- **No LinkedIn automation**, including with a recruiter's own credentials: the
  User Agreement binds the account holder, so it makes the *customer* the party
  in breach and their Recruiter seat is what gets restricted. `linkedin_rsc` is
  reserved in the provider enum for the OAuth partner path. LinkedIn is on a
  block list orgs cannot override from settings.
- **Search-aperture analysis only** (titles, companies, industries, geography,
  seniority, exclusions). No demographic gap analysis — Title VII / GDPR Art. 9
  exposure, and it contradicts `ROLE_ARCHITECT_SYSTEM_PROMPT`.
- **No single match-percentage score for a person.** The product deliberately
  reports evidence and coverage instead (see `ASSESSMENT_DISCLAIMER` and the
  risk-review severity framing).
- **Screenshot/OCR import excluded.** Paste and CSV only.

## Backlog after this task

1. Coverage-analysis agent (next spec; `analysis_json` already shaped for it).
2. **Prompt caching** — generations run 90–100s in prod, so it is a latency win
   as well as cost. The per-search shared prefix is *already ordered correctly*
   in `generate-executive-interview-plan.ts:170`; split it into its own content
   block with `cache_control`. Note: system prompts are ~650 tokens and Sonnet
   4.6's minimum cacheable prefix is 1024, so caching the system prompt alone
   silently does nothing — the breakpoint goes after the shared data block.
3. Minimum-N guard on conversion stats (no rates until ≥20 linked candidates
   and ≥3 terminal outcomes) — lands with the metrics UI.
4. Per-page review of the remaining ~30 recruiter routes (shell + the three
   busiest pages are done).
5. Persona/RBAC model — 7 personas, but the app enforces org scoping only: no
   route guards, no role model. See the memory files `mandate-personas` and
   `persona-model-gap-2026-08`.
