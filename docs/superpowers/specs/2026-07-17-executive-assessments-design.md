# Executive Intelligence — Assessments (Phase 2c) — Design

**Date:** 2026-07-17
**Status:** Design (recommended defaults chosen autonomously; open to revision at review gate)
**Depends on:** Phase 1 (success profiles), Phase 2a (candidate linkage, mig 036), Phase 2b (interview plans, mig 037)

## Purpose

Capture **structured evidence** from interviews that actually happened, per competency,
and score it against the operational competency weights — producing an evidence-strength
summary for a linked candidate. This is decision support: the app computes the weighted
rollup; the human records evidence and judges. Never a hire/no-hire verdict.

## Key decisions (recommended defaults)

1. **Human scorecard, no new AI agent.** Evidence is human-observed. The app pre-structures
   the assessment from the approved interview plan and the operational competency weights;
   the recruiter enters observed evidence + a rating per competency. An AI "synthesize my
   notes" step is explicitly deferred to a later increment (schema leaves room but adds no
   AI columns now — YAGNI).
2. **4-level evidence scale per competency:** `strong | moderate | limited | none`
   (wording: "Strong / Moderate / Limited / No evidence observed"). Evidence-oriented, no
   judgment or psychological labels. Plus a free-text `evidence` field per competency.
3. **One assessment document per candidate**, versioned draft→approved→archived, full body
   in `content_json` — mirrors interview plans exactly (keeps the proven versioning/
   immutability machinery and editor consistent).
4. **Gate: requires an APPROVED interview plan** for the candidate. That guarantees an
   approved success profile, populated `executive_search_competencies`, and linkage. The
   plan supplies the stage structure and "evidence to listen for" guidance; the weights
   supply the scoring basis.

## Schema (migration 038 — `executive_assessments`)

Mirror `executive_interview_plans` (mig 037), minus the AI-generation columns.

```
executive_assessments (
  id, search_id -> executive_searches ON DELETE CASCADE,
  candidate_id -> candidates ON DELETE CASCADE,
  organization_id -> organizations ON DELETE CASCADE,
  source_plan_id -> executive_interview_plans ON DELETE SET NULL,   -- provenance
  version int NOT NULL,
  content_json jsonb NOT NULL DEFAULT '{}',
  status text CHECK IN ('draft','approved','archived') DEFAULT 'draft',
  created_by -> users, approved_by -> users, approved_at, created_at, updated_at
)
```

Indexes (mirror 037): unique `(search_id, candidate_id, version)`; partial-unique approved
per `(search_id, candidate_id)`; version-desc, org, candidate, source_plan, created_by,
approved_by. RLS: `org_assessments_only` via `public.current_user_org_id()`.

No `is_generating` / `generation_error` / partial-unique-generating index (no AI placeholder).

### content_json shape

```jsonc
{
  "overall_summary": "evidence synthesis — not a verdict",
  "competency_assessments": [
    {
      "competency_key": "engineering_excellence",
      "rating": "strong|moderate|limited|none",
      "evidence": "observed evidence, free text",
      "source_stages": ["Technical Leadership Deep-Dive"]   // optional provenance
    }
  ],
  "evidence_rollup": [   // SERVER-COMPUTED on save; never trusted from client
    { "competency_key": "...", "label": "...", "weight": 95, "rating": "strong", "evidence_score": 1.0 }
  ],
  "weighted_evidence_strength": 0.82   // SERVER-COMPUTED: sum(weight*score)/sum(weight)
}
```

Rating→score map: `strong=1.0, moderate=0.66, limited=0.33, none=0.0`. The rollup and
`weighted_evidence_strength` are computed by the app from `executive_search_competencies`
(operational weights) — the client cannot forge them. Labeled "evidence strength", never
"fit score" or a recommendation.

## RPCs (mirror 037)

- `allocate_and_insert_assessment(p_search_id, p_candidate_id, p_organization_id,
  p_source_plan_id, p_content_json, p_created_by)` → `(id, version, was_existing)`.
  Locks the `executive_search_candidates` link row (enforces linkage + serializes); allocates
  `MAX(version)+1`. No is_generating idempotency branch (human create). `was_existing` retained
  for signature symmetry, always false.
- `approve_assessment(p_assessment_id, p_search_id, p_candidate_id)` → void. `approved_by`
  from `auth.uid()`; archive-then-promote under `mandate.allow_assessment_transition`.

## Immutability guard

`guard_executive_assessments()` + `BEFORE INSERT OR UPDATE` trigger, dedicated flag
`mandate.allow_assessment_transition`. Approved/archived rows immutable; promotion to
approved is RPC-only. Identical to `guard_executive_interview_plans`.

## Audit

Add nullable `assessment_id uuid -> executive_assessments ON DELETE SET NULL` to
`executive_audit_events` (symmetric with `plan_id`). New event types:
`assessment_created`, `assessment_edited`, `assessment_new_version`, `assessment_approved`.
(No `_generation_*` — no AI.)

## App layer

- `src/lib/executive/assessment-scoring.ts` — pure functions: `RATING_SCORES`,
  `computeEvidenceRollup(weights, competencyAssessments)`,
  `computeWeightedEvidenceStrength(rollup)`. Unit-tested.
- `src/lib/ai/executive-assessment.ts` — NOT an agent; a normalize/skeleton module:
  `EMPTY_ASSESSMENT`, `normalizeAssessment(content)` (dedupe competency keys, drop keys not in
  operational weights, clamp ratings), `buildAssessmentSkeleton(weights, approvedPlan)`
  (pre-structure competency rows + source_stages + guidance). Unit-tested.
  (Named without `-agent` to signal no model call.)
- Types in `src/lib/executive/types.ts`: `AssessmentRow`, `AssessmentContent`,
  `CompetencyAssessment`, `EvidenceRating`.
- Audit: extend `ExecutiveAuditEventType` + `ExecutiveAuditEventInput` with `assessmentId` and
  the 4 event types.

## Routes / UI

`/executive-intelligence/searches/[id]/candidates/[candidateId]/assessment`
- `page.tsx` — state routing: gate (no approved plan) → empty (no assessment yet) → editor.
  No `maxDuration` (no AI). Timestamps via `formatTimestampUtc`.
- `assessment-gate.tsx` — shown when no approved interview plan exists (links to plan).
- `assessment-empty.tsx` — "Start assessment" → `createAssessment` (builds skeleton from plan+weights).
- `assessment-editor.tsx` — per-competency rating selector + evidence textarea, overall summary,
  live server-computed evidence-strength panel (like the plan's coverage panel), Save Draft /
  Approve / Snapshot New Version. Read-only when approved. Decision-support disclaimer.
- `actions.ts` — `createAssessment`, `saveAssessmentDraft` (status='draft' guard, recompute rollup
  server-side), `approveAssessment`, `snapshotNewAssessmentVersion`. All write audit events.
- Entry point: an "Assessment" link on the linked-candidate row (candidates page), next to
  "Interview Plan"; enabled only when an approved plan exists.
- Module landing page: enable the Assessments area.

## Compliance

Same guardrails: decision-support label on the editor; approval = explicit human action with
approver+timestamp+audit; approved immutable; evidence-oriented wording only; no protected
characteristics, no psychological labels, no hire/no-hire. The rollup is an "evidence strength
summary", explicitly not a recommendation.

## Tests

- `assessment-scoring.test.ts` — rating map, rollup weighting, empty/partial coverage, unknown-key drop.
- `executive-assessment.test.ts` — normalize (dedupe, drop non-operational keys, clamp), skeleton build.
- `supabase/tests/executive_assessment_invariants.sql` — approved immutable; promote-only-via-RPC;
  one-approved-per-candidate; approver = auth.uid(); RLS org scoping; allocate requires linkage.
  Run in a rolled-back transaction.

## Out of scope (YAGNI)

Multi-interviewer panel aggregation (future "panel synthesis"), AI note synthesis, PDF export
(future Final Reports), cross-candidate comparison.
