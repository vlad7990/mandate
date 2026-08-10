# Executive Intelligence — Risk Reviews (Phase 2d) — Design

**Date:** 2026-08-10
**Status:** Design — recommendations approved by user; ready to turn into an implementation plan
**Depends on:** Phase 1 (success profiles), Phase 2a (candidate linkage, mig 036), Phase 2b
(interview plans, mig 037), Phase 2c (assessments, mig 038)

## Purpose

For a linked candidate with an **approved Assessment**, synthesize a structured **risk
register**: where does the recorded evidence fail to address the role's non-negotiables,
derailers, required capabilities, and high-weight competencies? Output is **decision support
only** — it surfaces areas needing further diligence, never a hire/no-hire verdict, never a
score of the person.

## Key decisions (approved)

1. **Hybrid — deterministic risk signals + AI narrative.** A Risk Review is analysis over
   already-structured data, which splits cleanly:
   - **The app computes the risk *signals* deterministically** (source of truth, no AI): joins
     the approved assessment's per-competency ratings against the approved success profile's
     `non_negotiable_gaps`, `potential_derailers`, required-capability sections, and the
     operational competency weights.
   - **A new AI agent (18, "Risk Synthesis Agent") drafts the narrative** from those signals +
     the evidence text: readable risk items with a description, the evidence they rest on, and
     *suggested further diligence*. The human reviews, edits, and approves.
   Same shape as interview plans (server-computed facts + AI narrative; the app reports
   truthfully, the agent only words it). Not human-only (the deterministic signals already do
   the load-bearing work and AI narration saves real effort); not AI-only (ungrounded risk
   claims are exactly what the module must avoid).
2. **Severity scale (deterministic, app-assigned — not by the AI):** `critical` / `elevated` /
   `watch` / `low`, evidence-oriented. A `severity_summary` shows **counts by level only** —
   labeled *diligence exposure / unaddressed-risk areas*, never a single person-score.
3. **Gate: requires an approved Assessment** for the candidate (which chains back through
   approved interview plan → approved success profile → linkage).

## Severity model (deterministic)

Signals are derived and severity assigned by the app before the agent runs. Rating→evidence
comes from the approved assessment's `competency_assessments` (strong/moderate/limited/none)
and its server-computed `evidence_rollup`/weights.

| Signal category | Condition | Severity |
|---|---|---|
| `non_negotiable` | a `non_negotiable_gaps` item maps to a competency (or is unmatched) with **none/limited** evidence | **critical** |
| `derailer` | a `potential_derailers` item's mapped competency has **none/limited** evidence, or weak evidence text corroborates the derailer | **elevated** |
| `capability_gap` | a required leadership/functional/operating capability lacks **strong** evidence | **elevated** (none) / **watch** (limited) |
| `uncovered_competency` | a high-weight competency (top tier by weight) has **no** evidence recorded | **watch** |
| `low` | anything surfaced but well-evidenced / low weight | **low** |

Mapping profile prose (derailers, non-negotiables, capabilities) to competency keys is
best-effort: exact/keyword match where possible, otherwise the signal is carried as
"unmatched" and still surfaced (never silently dropped). The agent may reword and group, but
**cannot invent signals or change severities** — post-processing drops any risk item whose
`id` does not match an app-computed signal id, and overwrites each item's `severity` and
`category` with the app-computed values.

## Data model (migration 039 — `executive_risk_reviews`)

Mirror `executive_interview_plans` (mig 037) — AI-assisted, so it keeps the generation columns.

```
executive_risk_reviews (
  id, search_id -> executive_searches ON DELETE CASCADE,
  candidate_id -> candidates ON DELETE CASCADE,
  organization_id -> organizations ON DELETE CASCADE,
  source_assessment_id -> executive_assessments ON DELETE SET NULL,  -- provenance (primary input)
  source_profile_id    -> role_success_profiles ON DELETE SET NULL,   -- provenance
  source_plan_id       -> executive_interview_plans ON DELETE SET NULL,-- provenance
  version int NOT NULL,
  content_json jsonb NOT NULL DEFAULT '{}',
  status text CHECK IN ('draft','approved','archived') DEFAULT 'draft',
  prompt_version text, model_version text,
  is_generating boolean NOT NULL DEFAULT false, generation_error text,
  created_by -> users, approved_by -> users, approved_at, created_at, updated_at
)
```

Indexes (mirror 037): unique `(search_id, candidate_id, version)`; partial-unique generating
per `(search_id, candidate_id)`; partial-unique approved per `(search_id, candidate_id)`;
version-desc, org, candidate, source_assessment, created_by, approved_by. RLS:
`org_risk_reviews_only` via `public.current_user_org_id()`.

### content_json shape

```jsonc
{
  "overview": "narrative synthesis — areas needing further diligence, not a verdict",
  "risk_items": [
    {
      "id": "sig-3",                       // must equal an app-computed signal id
      "title": "No evidence for a non-negotiable: shipped safety-critical embedded systems",
      "category": "non_negotiable",        // non_negotiable | derailer | capability_gap | uncovered_competency
      "severity": "critical",              // app-assigned; AI cannot change
      "source_competency_key": "engineering_excellence",  // nullable when unmatched
      "evidence_basis": "Assessment recorded 'Limited evidence' with note: …",
      "suggested_diligence": "Backchannel reference on the two certified platforms; ..."
    }
  ],
  "risk_signals": [ /* app-computed, echoed for provenance; never trusted from client */ ],
  "severity_summary": { "critical": 1, "elevated": 2, "watch": 3, "low": 0 }  // SERVER-COMPUTED
}
```

`risk_signals` and `severity_summary` are computed server-side and re-stamped on every save;
never trusted from the client. The summary is labeled **unaddressed-risk areas / diligence
exposure**, explicitly NOT a candidate score and NOT a recommendation.

## AI agent (18 — Risk Synthesis Agent)

- `src/lib/ai/executive-risk-synthesis-agent.ts` — types/schema/system prompt/normalize, same
  conventions as `executive-interview-architect-agent.ts`.
- `src/lib/ai/generate-executive-risk-review.ts` — orchestrator with the interview-plan
  terminal-state discipline (`is_generating` placeholder, `generation_error`, unconditional
  final write). Inputs: the approved assessment content, the approved profile
  (`non_negotiable_gaps`/`potential_derailers`/required capabilities), operational weights, and
  the **app-computed signals**. Output: narrative wording only, keyed to the signals.
- System prompt hard constraints: no hire/no-hire, no protected-characteristic inference, no
  psychological/mental-health labels, no deception detection; evidence-grounded statements only;
  reword/group signals but never invent or re-severitize them.
- Model `claude-sonnet-4-6`; reuse the timeout lessons (client `TIMEOUT_MS = 180_000`, route
  `export const maxDuration = 300`).

## Deterministic core (no AI)

- `src/lib/executive/risk-signals.ts` — pure functions: `computeRiskSignals(profile, assessment,
  weights)` → signals with category + severity; `computeSeveritySummary(signals)`. Unit-tested.
- `src/lib/executive/risk-review.ts` (or fold into the agent module) — `normalizeRiskReview`
  (coerce untrusted content, drop risk items whose `id` is not an app signal, clamp severities to
  the app value) + `applyRiskComputation` (re-stamp `risk_signals` + `severity_summary`).

## RPCs (mirror 037)

- `allocate_and_insert_risk_review(...)` → `(id, version, was_existing)`. Locks the
  `executive_search_candidates` link row AND requires an approved assessment exists for
  (search, candidate); idempotent generating branch like the plan RPC.
- `approve_risk_review(p_risk_review_id, p_search_id, p_candidate_id)` → void. `approved_by`
  from `auth.uid()`; archive-then-promote under `mandate.allow_risk_review_transition`.

## Immutability guard

`guard_executive_risk_reviews()` + `BEFORE INSERT OR UPDATE` trigger, dedicated flag
`mandate.allow_risk_review_transition`. Approved/archived rows immutable; promotion to approved
is RPC-only. Identical to the plan/assessment guards.

## Audit

Add nullable `risk_review_id uuid -> executive_risk_reviews ON DELETE SET NULL` to
`executive_audit_events`. New event types: `risk_review_generation_requested`,
`risk_review_generated`, `risk_review_generation_failed`, `risk_review_edited`,
`risk_review_new_version`, `risk_review_regenerated`, `risk_review_approved`.

## Routes / UI

`/executive-intelligence/searches/[id]/candidates/[candidateId]/risk-review`
- `page.tsx` — state routing gate → empty → generating → error → editor (mirrors the
  interview-plan page, since it's AI-assisted). `export const maxDuration = 300`. Timestamps via
  `formatTimestampUtc`.
- `risk-review-gate.tsx` — shown when no approved assessment exists (links to the assessment).
- `risk-review-empty.tsx` — "Generate Risk Review" → `requestRiskReviewGeneration`.
- `risk-review-generating.tsx` — polling skeleton, `TIMEOUT_MS = 180_000` unstick marker.
- `risk-review-error.tsx` — failure + retry.
- `risk-review-editor.tsx` — risk items grouped by severity (critical→low), each editable
  (title/evidence_basis/suggested_diligence), the severity_summary panel labeled as
  diligence-exposure (not candidate quality), Save Draft / Approve / Snapshot New Version /
  Regenerate (AI). Read-only when approved. Decision-support disclaimer.
- `actions.ts` — `requestRiskReviewGeneration`, `saveRiskReviewDraft` (recompute signals +
  summary server-side), `approveRiskReview`, `createRiskReviewNewVersion`, `markRiskReviewTimedOut`.
- Entry point: a "Risk Review" link on the linked-candidate row (candidates page), next to
  Assessment; module-map tile enabled.

## Compliance

Same guardrails: decision-support disclaimer on the editor; approval = explicit human action
with approver+timestamp+audit; approved immutable; evidence-grounded wording only; severity and
summary framed as diligence exposure, never candidate quality or a recommendation. Prompt
forbids hire/no-hire, protected-characteristic inference, psychological labels, and deception
detection.

## Tests

- `risk-signals.test.ts` — non-negotiable→none/limited ⇒ critical; derailer mapping; capability
  gap severities; uncovered high-weight competency ⇒ watch; unmatched-but-surfaced; summary counts.
- `executive-risk-synthesis-agent.test.ts` — normalize: drop risk items with unknown signal id,
  clamp severity to the app value, coerce fields.
- `supabase/tests/executive_risk_review_invariants.sql` — approved immutable; promote-only-via-RPC;
  one-approved-per-candidate; approver = auth.uid(); RLS org scoping; allocate requires linkage AND
  an approved assessment. Run in a rolled-back transaction, then validated against prod rolled-back.

## Verification plan

1. `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`.
2. Apply migration 039 to prod; run the invariant SQL against prod in a rolled-back transaction.
3. Commit + push (message: `feat: EI Phase 2d — add hybrid risk reviews`); confirm Vercel deploy.
4. Production UI smoke on getmandate.io: synthetic search → approve profile → link candidate →
   approve interview plan → approve assessment (record some none/limited ratings so signals fire)
   → generate risk review → verify risk items/severities render and match the deterministic
   signals → edit → approve → verify read-only/immutable/new-version-only → verify audit events →
   clean up all synthetic data.

## Out of scope (YAGNI)

Cross-candidate risk comparison, mitigation tracking/workflow, PDF export (future Final Reports),
reference-check integration, any automated adjudication.
