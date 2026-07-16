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

`/executive-intelligence` (module overview) · `/searches` (list) · `/searches/new` (intake) ·
`/searches/[id]` (workspace) · `/searches/[id]/success-profile` (generate → edit → approve) ·
`/templates` · `/competencies`

Sidebar gets an "Exec Intel" primary nav entry.

## Phase 2+ (designed for, not built)

- Executive candidate linkage (join table to existing `candidates`), Interview Plans,
  Active Interviews (explicit-consent transcript ingestion only), Assessments, Risk Reviews,
  Final Reports (PDF via existing `@react-pdf` layer), Executive Advisors, panel synthesis,
  compensation benchmarking, reference checks.
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
