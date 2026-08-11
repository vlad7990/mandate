# Executive Hiring Intelligence — Module Plan

Premium module for structured executive due diligence: has this candidate demonstrated
the experience, judgment, leadership capability, operating scale, and stage fit required
to succeed in *this* executive role — not "did they interview well."

All AI output in this module is **decision support**. Humans review, edit, and approve
every artifact. Nothing is auto-decided.

## Phase 1 (implemented) — Foundation

### Key architecture decisions

| Decision | Rationale |
|---|---|
| **Reuse `public.organizations`** | Already exists with FKs from `users`/`projects`. No new table. |
| **Defer `executive_candidates`** | Phase 1 has no candidate flows. Existing `candidates` are project-scoped; Phase 2 links them via a join table (`executive_search_candidates` → `public.candidates`) rather than a parallel model. |
| **Mirror the `job_specs` versioning machinery** | `role_success_profiles` copies the proven pattern: atomic version allocation via RPC, `is_generating` placeholder + client polling, `generation_error` terminal state, partial unique indexes as DB-level backstops. |
| **Approval = supersede, never overwrite** | At most one `approved` profile per search (partial unique index). Approving a new version archives the previous one via a single-statement RPC. Approved rows are never edited in place — edits require a new draft version. |
| **Competency library: global + org rows** | `organization_id IS NULL` = seeded global library (read-only to tenants); org-scoped rows for customization. Same for role templates. |
| **Append-only audit** | `executive_audit_events` has INSERT+SELECT policies only — no UPDATE/DELETE — so the trail is immutable at the RLS layer. |
| **AI provenance on every profile row** | `prompt_version`, `model_version`, `created_by`, `created_at`, `version`, `status` stored per row, exactly as the spec requires. |

### Schema (migrations 032, 033)

- `executive_role_templates` — seeded intake presets + default competency weights (8 templates)
- `executive_competencies` — competency library with category, definition, observable positive/negative indicators (evidence-based, no psychological labels)
- `executive_searches` — full intake: company context (9 fields), role definition (8 fields), mandate & outcomes (5 fields), service tier; plus Company Context Agent output (`company_context` JSONB + status/error)
- `role_success_profiles` — versioned AI/human-edited success profiles (see above)
- `executive_search_competencies` — per-search competency selections + weights (source: template | ai | manual)
- `executive_audit_events` — append-only audit (search_created, profile_generated, profile_edited, profile_approved, profile_regenerated, …)

RPCs: `allocate_and_insert_success_profile` (atomic versioning, idempotent generation),
`approve_success_profile` (single-statement approve + archive-previous).
RLS: org-scoping via existing `public.current_user_org_id()` on every table.

### AI agents (extends the 14-agent stack)

15. **Company Context Agent** — `src/lib/ai/executive-company-context-agent.ts` + `run-executive-company-context.ts`.
    Web-search-grounded company operating context: stage norms, regulatory posture, operating
    complexity, leadership landscape. Stored on `executive_searches.company_context`.
16. **Executive Role Architect Agent** — `src/lib/ai/executive-role-architect-agent.ts` +
    `generate-executive-success-profile.ts` (orchestrator). Intake + company context +
    competency library → structured Executive Success Profile (15 sections: mission, mandate,
    outcomes, capabilities, scale, derailers, gaps, competency weights, interview stages).

Both agents carry explicit safety constraints in their system prompts: no protected-characteristic
inference, no psychological/mental-health labels, no deception claims, evidence-based statements only.

### Routes

`/app/executive-intelligence` (module overview) · `/searches` (list) · `/searches/new` (intake) ·
`/searches/[id]` (workspace) · `/searches/[id]/success-profile` (generate → edit → approve) ·
`/templates` · `/competencies`

Sidebar gets an "Exec Intel" primary nav entry.

## Phase 2 — in progress

- **Candidate linkage (built).** `executive_search_candidates` (migration 036)
  joins existing `public.candidates` rows to executive searches — no parallel
  candidate model, per the Phase 1 decision. Each link carries a due-diligence
  `stage` (identified → in_diligence → advanced / on_hold / declined) that is
  workflow state, never a hiring decision. UI:
  `/app/executive-intelligence/searches/[id]/app/candidates` (linked list + org-pool
  picker with search); a candidates card on the search workspace. Link,
  unlink, and stage changes all write audit events
  (`candidate_linked` / `candidate_unlinked` / `candidate_stage_changed`).

- **Interview Plans (built — migration 037).** Per-candidate interview plans
  (`executive_interview_plans`), keyed by (search_id, candidate_id), versioned
  and hardened exactly like `role_success_profiles`: draft→approved→archived,
  DB immutability trigger (`guard_executive_interview_plans` + the dedicated
  `mandate.allow_plan_transition` flag), RPC-only approval stamped from
  `auth.uid()`, atomic version allocation (`allocate_and_insert_interview_plan`,
  which locks the `executive_search_candidates` link row so generation also
  requires linkage), one-approved-per-candidate-plan invariant. The plan lives
  in `content_json` (stages with nested questions) rather than normalized
  stages/questions tables — the plan is authored/approved as one document, and
  versioning JSON keeps the proven machinery intact.

  Agent 17 (**Interview Architect**, `executive-interview-architect-agent.ts` +
  `generate-executive-interview-plan.ts`) turns the APPROVED success profile,
  the operational competency weights (`executive_search_competencies`), and
  candidate context into concrete stages: objective, recommended interviewer
  ROLE, duration, assigned competencies, core/follow-up/candidate-specific
  questions, evidence to listen for, weak-answer indicators, red flags.
  Defensive post-processing: cross-stage question de-duplication, dropping of
  hallucinated competency keys, and **server-computed competency coverage**
  (covered vs uncovered) against the operational weights — the agent proposes
  assignments, the app reports coverage truthfully. Prompt forbids hire/no-hire
  verdicts, protected-characteristic inference, psychological labels, and
  deception-detection cues.

  Gating: generation requires an approved success profile (UI shows a gate
  state otherwise) AND a linked candidate (enforced by the allocate RPC's link
  lock). Route:
  `/app/executive-intelligence/searches/[id]/app/candidates/[candidateId]/interview-plan`
  (empty → generating → error → editor with coverage panel + approval). Entry
  point from the linked-candidate row on the candidates page. Audit events:
  `interview_plan_generation_requested` / `_generated` / `_generation_failed` /
  `_edited` / `_new_version` / `_regenerated` / `_approved`.

- **Assessments (built — migration 038).** Per-candidate evidence capture
  (`executive_assessments`), keyed by (search_id, candidate_id), versioned and
  hardened exactly like interview plans: draft→approved→archived, DB immutability
  trigger (`guard_executive_assessments` + the dedicated
  `mandate.allow_assessment_transition` flag), RPC-only approval stamped from
  `auth.uid()` (`approve_assessment`), atomic version allocation
  (`allocate_and_insert_assessment`, which locks the
  `executive_search_candidates` link row so creation also requires linkage),
  one-approved-per-candidate invariant. The scorecard lives in `content_json`.

  **Human scorecard only — there is NO AI synthesis agent.** The recruiter
  records evidence themselves; the app never infers ratings. On creation the
  assessment is pre-structured from the approved interview plan and the
  operational competency weights (`executive_search_competencies`): one row per
  competency, in weight order, with `source_stages` pre-filled from the plan's
  stage→competency assignments. Each competency takes a **4-level evidence
  rating** — Strong / Moderate / Limited / No evidence observed — plus a
  free-text evidence field.

  The app computes a **weighted evidence strength** server-side on every save
  (`sum(weight × ratingScore) / sum(weight)`, ratings mapped strong=1.0 /
  moderate=0.66 / limited=0.33 / none=0), re-stamped into `content_json` and
  never trusted from the client. It is surfaced and labeled as **evidence
  coverage/strength — how much of the role's weighted competencies have
  supporting evidence recorded — explicitly NOT a score of the candidate's
  quality and NOT a hiring recommendation.** No hire/no-hire, no
  protected-characteristic inference, no psychological labels.

  Gating: creation requires an **approved interview plan** for the candidate (UI
  shows a gate state otherwise), which itself guarantees an approved success
  profile, populated competency weights, and linkage. Route:
  `/app/executive-intelligence/searches/[id]/app/candidates/[candidateId]/assessment`
  (gate → empty → editor with the evidence-strength panel + approval; read-only
  once approved). Entry point from the linked-candidate row on the candidates
  page, alongside Interview Plan. Scoring/normalize logic in
  `src/lib/executive/assessment-scoring.ts` and `src/lib/ai/executive-assessment.ts`
  (not an agent — no model call), unit-tested; DB invariants in
  `supabase/tests/executive_assessment_invariants.sql`. Audit events:
  `assessment_created` / `assessment_edited` / `assessment_new_version` /
  `assessment_approved`.

## Phase 2+ (designed for, not built)

- Active Interviews (explicit-consent transcript ingestion only), Risk Reviews,
  Final Reports (PDF via existing `@react-pdf` layer), Executive Advisors, panel
  synthesis, compensation benchmarking, reference checks.
- The searches workspace and audit schema already reserve space for these: audit events take a
  `detail` JSONB, profiles carry `content_json` sections the report layer can consume, and the
  module nav surfaces the future areas as planned-but-disabled.

## Hardening (migration 034)

- **Approved/archived profiles are immutable at the database layer.** A BEFORE
  INSERT OR UPDATE trigger (`guard_role_success_profiles`) rejects any direct
  modification of approved/archived rows and any direct promotion to
  `approved` — for every role, including service_role. The only sanctioned
  path is `approve_success_profile()`, which sets a transaction-local flag
  (`mandate.allow_profile_transition`) around its own statements.
- **Approver identity cannot be forged.** `approve_success_profile(profile, search)`
  derives `approved_by` from `auth.uid()`; it no longer accepts an approver
  parameter. Inside the RPC, archive-then-promote ordering respects the
  per-row enforcement of the one-approved-per-search partial unique index
  while both statements stay atomic in the RPC's transaction.
- **Audit rows cannot be forged for another actor.** The
  `executive_audit_events` INSERT policy requires `actor_id = auth.uid()`
  (still append-only: no UPDATE/DELETE policies exist).
- **Invariant tests:** `supabase/tests/executive_intelligence_invariants.sql`
  exercises all of the above against a live database inside a rolled-back
  transaction (7 checks). Unit tests for profile normalization live in
  `src/lib/ai/executive-role-architect-agent.test.ts` (`npm test`).

## Competency weights — source of truth

`executive_search_competencies` is the **operational** source of truth that
downstream features (interview plans, assessments) must read. Profile
`content_json` keeps the **per-version recommendation history**. The sync
rule: when a Success Profile is **approved** (the human sign-off), its
`recommended_competency_weights` are upserted into
`executive_search_competencies` with `source='ai'`, overwriting earlier
template/ai rows for the same competencies; manually added competencies not
mentioned in the approved profile are preserved. Generation alone does NOT
touch the table — un-reviewed AI output never becomes operational truth.

## Compliance guardrails (Phase 1)

- Every AI panel is labeled as decision support requiring human judgment.
- Approval is an explicit human action, recorded with approver + timestamp + audit event.
- Approved profiles are immutable; changes create new versions.
- Prompts forbid protected-characteristic inference, deception detection, and unsupported
  psychological claims; profile content is evidence/requirement-oriented by schema design.
- No audio/video/facial/voice analysis anywhere in the module.
