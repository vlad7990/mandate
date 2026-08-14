-- Org and parent can no longer disagree.
--
-- Every org-scoped table in this schema carries `organization_id` beside a
-- foreign key to another org-scoped table, and *assumes* the two agree. RLS
-- only ever inspects `organization_id`, so a row naming this org and another
-- org's parent is accepted by every policy in the product:
--
--   insert into candidate_notes (organization_id, candidate_id, ...)
--   values (my_org, some_other_orgs_candidate, ...);   -- accepted before 055
--
-- 054 closed this on the two tables it introduced, with a composite foreign
-- key to `clients (organization_id, id)`, and its header said plainly that
-- the pre-054 tables still carried the assumption. This is the sweep.
--
-- **68 relationships, and no live data violated any of them** — checked pair
-- by pair before the constraints were written, which is why they could be
-- added and validated immediately rather than as NOT VALID.
--
--
-- ## Why this is worth more than tidiness
--
-- On most tables a mismatch is a data-integrity wart: `candidate_notes` with
-- a foreign candidate still only renders to its own org, because the *note*
-- carries the org RLS filters on. It does not leak.
--
-- It stops being a wart wherever a row is used to *reach* another row. 054
-- found the concrete case: the primary-contact trigger writes to sibling
-- rows selected by `client_id`, so a contact row naming your org and another
-- org's client would have demoted that client's primary contact. Every
-- helper that resolves a parent from a child — `is_placement_credited`,
-- `resolve_client`, the fee-terms lookup in `placement-actions.ts` — is the
-- same shape waiting for the same input. Removing the class is cheaper than
-- auditing each one forever.
--
--
-- ## The design: additive, and NO ACTION
--
-- Each relationship gains a *second* foreign key over `(organization_id,
-- parent_id)`, alongside the existing single-column one, which keeps its
-- exact `ON DELETE` semantics.
--
-- **The composite key is `ON DELETE NO ACTION`, and that is the load-bearing
-- decision.** Roughly a third of these parents are `ON DELETE SET NULL`, and
-- a composite `SET NULL` nulls *every* column in the key — including
-- `organization_id`. Deleting a client would have blanked the org on its
-- placements and dropped them out of RLS entirely: rows visible to nobody,
-- in the revenue book. Postgres 17 does support `SET NULL (column_list)` to
-- null one column, but the second key does not need a referential action at
-- all — the original key already performs it, and `NO ACTION` is checked at
-- the *end* of the statement, by which time the original has set the child
-- column to NULL and MATCH SIMPLE skips the composite check entirely.
--
-- That is reasoning about trigger ordering, so it was tested rather than
-- assumed: a rolled-back probe added the constraint to `placements`, deleted
-- a client, and confirmed `client_id` went null while `organization_id`
-- survived unchanged — and that a genuine cross-org update was still
-- refused. `supabase/tests/org_parent_integrity_invariants.sql` keeps both.
--
--
-- ## What is deliberately excluded, and why
--
-- **Everything pointing at `users`** — `created_by`, `actor_id`,
-- `owner_user_id`, `approved_by` and the rest: 41 of the 109 candidate
-- relationships. `users.organization_id` is a *membership*, not a parent
-- scope, and it changes: a new account is created with a null org and gets
-- one when a founder approves it. Constraining `(organization_id, created_by)`
-- would make approving an account, or ever moving somebody between orgs,
-- fail against every row they had authored. The attribution being
-- cross-org is also not a leak — `created_by` is a name on a row, not a key
-- anything is resolved through.
--
-- **`executive_competencies` and `executive_role_templates`** — the seeded
-- catalogues. All 24 competencies and all 8 templates have a NULL
-- `organization_id`, which is what makes them global. A composite key from
-- `executive_search_competencies` would compare a non-null child org against
-- a null parent org and reject **every row in the catalogue**. `search_id`
-- on that table is constrained; `competency_id` is not, and cannot be while
-- global rows are modelled as NULL-org.
--
-- Note the shape this leaves: a parent with a NULL `organization_id` can
-- have no org-scoped children at all, because MATCH SIMPLE only skips the
-- check when the *child's* key column is null. That is correct for the nine
-- tables here whose org is nullable — a project with no organisation is
-- broken, not global — but it is the reason a future global catalogue should
-- be modelled with an explicit flag rather than a null org.
--
--
-- ## Cost
--
-- 68 constraints and 68 covering indexes on tables that currently hold at
-- most 27 rows each. The indexes are `(organization_id, parent_id)` so they
-- also cover the bare `organization_id` foreign key on the same table, which
-- clears several of the advisor's existing unindexed-FK findings rather than
-- adding to them.


-- ---------------------------------------------------------------------------
-- 1. The referenced keys
-- ---------------------------------------------------------------------------
--
-- A composite foreign key needs a unique index on exactly its target
-- columns. `id` is already the primary key of each of these, so
-- `(organization_id, id)` is trivially unique — the index exists to be
-- *named* as the target, not to add a guarantee.
--
-- `clients_org_id_idx` was created by 054 and is here under IF NOT EXISTS so
-- this file remains a complete description of the schema it depends on.

CREATE UNIQUE INDEX IF NOT EXISTS candidates_org_id_idx                 ON public.candidates (organization_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS client_contacts_org_id_idx            ON public.client_contacts (organization_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS clients_org_id_idx                    ON public.clients (organization_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS executive_assessments_org_id_idx      ON public.executive_assessments (organization_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS executive_interview_plans_org_id_idx  ON public.executive_interview_plans (organization_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS executive_risk_reviews_org_id_idx     ON public.executive_risk_reviews (organization_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS executive_searches_org_id_idx         ON public.executive_searches (organization_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS fee_terms_org_id_idx                  ON public.fee_terms (organization_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS feedback_org_id_idx                   ON public.feedback (organization_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS hiring_manager_tokens_org_id_idx      ON public.hiring_manager_tokens (organization_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS placement_fee_lines_org_id_idx        ON public.placement_fee_lines (organization_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS placement_fees_org_id_idx             ON public.placement_fees (organization_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS placements_org_id_idx                 ON public.placements (organization_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS projects_org_id_idx                   ON public.projects (organization_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS role_success_profiles_org_id_idx      ON public.role_success_profiles (organization_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS sourcing_runs_org_id_idx              ON public.sourcing_runs (organization_id, id);


-- ---------------------------------------------------------------------------
-- 2. Core recruiting
-- ---------------------------------------------------------------------------

ALTER TABLE public.candidates ADD CONSTRAINT candidates_project_in_org
  FOREIGN KEY (organization_id, project_id) REFERENCES public.projects (organization_id, id) ON DELETE NO ACTION;
CREATE INDEX IF NOT EXISTS candidates_org_project_idx ON public.candidates (organization_id, project_id);

ALTER TABLE public.projects ADD CONSTRAINT projects_client_in_org
  FOREIGN KEY (organization_id, client_id) REFERENCES public.clients (organization_id, id) ON DELETE NO ACTION;
CREATE INDEX IF NOT EXISTS projects_org_client_idx ON public.projects (organization_id, client_id);

ALTER TABLE public.candidate_notes ADD CONSTRAINT candidate_notes_candidate_in_org
  FOREIGN KEY (organization_id, candidate_id) REFERENCES public.candidates (organization_id, id) ON DELETE NO ACTION;
CREATE INDEX IF NOT EXISTS candidate_notes_org_candidate_idx ON public.candidate_notes (organization_id, candidate_id);

ALTER TABLE public.candidate_notes ADD CONSTRAINT candidate_notes_project_in_org
  FOREIGN KEY (organization_id, project_id) REFERENCES public.projects (organization_id, id) ON DELETE NO ACTION;
CREATE INDEX IF NOT EXISTS candidate_notes_org_project_idx ON public.candidate_notes (organization_id, project_id);

ALTER TABLE public.candidate_scores ADD CONSTRAINT candidate_scores_candidate_in_org
  FOREIGN KEY (organization_id, candidate_id) REFERENCES public.candidates (organization_id, id) ON DELETE NO ACTION;
CREATE INDEX IF NOT EXISTS candidate_scores_org_candidate_idx ON public.candidate_scores (organization_id, candidate_id);

ALTER TABLE public.candidate_scores ADD CONSTRAINT candidate_scores_project_in_org
  FOREIGN KEY (organization_id, project_id) REFERENCES public.projects (organization_id, id) ON DELETE NO ACTION;
CREATE INDEX IF NOT EXISTS candidate_scores_org_project_idx ON public.candidate_scores (organization_id, project_id);

ALTER TABLE public.candidate_notifications ADD CONSTRAINT candidate_notifications_candidate_in_org
  FOREIGN KEY (organization_id, candidate_id) REFERENCES public.candidates (organization_id, id) ON DELETE NO ACTION;
CREATE INDEX IF NOT EXISTS candidate_notifications_org_candidate_idx ON public.candidate_notifications (organization_id, candidate_id);

ALTER TABLE public.candidate_notifications ADD CONSTRAINT candidate_notifications_project_in_org
  FOREIGN KEY (organization_id, project_id) REFERENCES public.projects (organization_id, id) ON DELETE NO ACTION;
CREATE INDEX IF NOT EXISTS candidate_notifications_org_project_idx ON public.candidate_notifications (organization_id, project_id);

ALTER TABLE public.candidate_outreach ADD CONSTRAINT candidate_outreach_candidate_in_org
  FOREIGN KEY (organization_id, candidate_id) REFERENCES public.candidates (organization_id, id) ON DELETE NO ACTION;
CREATE INDEX IF NOT EXISTS candidate_outreach_org_candidate_idx ON public.candidate_outreach (organization_id, candidate_id);

ALTER TABLE public.candidate_outreach ADD CONSTRAINT candidate_outreach_project_in_org
  FOREIGN KEY (organization_id, project_id) REFERENCES public.projects (organization_id, id) ON DELETE NO ACTION;
CREATE INDEX IF NOT EXISTS candidate_outreach_org_project_idx ON public.candidate_outreach (organization_id, project_id);

ALTER TABLE public.boolean_queries ADD CONSTRAINT boolean_queries_project_in_org
  FOREIGN KEY (organization_id, project_id) REFERENCES public.projects (organization_id, id) ON DELETE NO ACTION;
CREATE INDEX IF NOT EXISTS boolean_queries_org_project_idx ON public.boolean_queries (organization_id, project_id);

ALTER TABLE public.job_specs ADD CONSTRAINT job_specs_project_in_org
  FOREIGN KEY (organization_id, project_id) REFERENCES public.projects (organization_id, id) ON DELETE NO ACTION;
CREATE INDEX IF NOT EXISTS job_specs_org_project_idx ON public.job_specs (organization_id, project_id);

ALTER TABLE public.shortlists ADD CONSTRAINT shortlists_project_in_org
  FOREIGN KEY (organization_id, project_id) REFERENCES public.projects (organization_id, id) ON DELETE NO ACTION;
CREATE INDEX IF NOT EXISTS shortlists_org_project_idx ON public.shortlists (organization_id, project_id);

ALTER TABLE public.project_reports ADD CONSTRAINT project_reports_project_in_org
  FOREIGN KEY (organization_id, project_id) REFERENCES public.projects (organization_id, id) ON DELETE NO ACTION;
CREATE INDEX IF NOT EXISTS project_reports_org_project_idx ON public.project_reports (organization_id, project_id);

ALTER TABLE public.feedback ADD CONSTRAINT feedback_candidate_in_org
  FOREIGN KEY (organization_id, candidate_id) REFERENCES public.candidates (organization_id, id) ON DELETE NO ACTION;
CREATE INDEX IF NOT EXISTS feedback_org_candidate_idx ON public.feedback (organization_id, candidate_id);

ALTER TABLE public.feedback ADD CONSTRAINT feedback_project_in_org
  FOREIGN KEY (organization_id, project_id) REFERENCES public.projects (organization_id, id) ON DELETE NO ACTION;
CREATE INDEX IF NOT EXISTS feedback_org_project_idx ON public.feedback (organization_id, project_id);

ALTER TABLE public.calibration_history ADD CONSTRAINT calibration_history_feedback_in_org
  FOREIGN KEY (organization_id, feedback_id) REFERENCES public.feedback (organization_id, id) ON DELETE NO ACTION;
CREATE INDEX IF NOT EXISTS calibration_history_org_feedback_idx ON public.calibration_history (organization_id, feedback_id);

ALTER TABLE public.calibration_history ADD CONSTRAINT calibration_history_project_in_org
  FOREIGN KEY (organization_id, project_id) REFERENCES public.projects (organization_id, id) ON DELETE NO ACTION;
CREATE INDEX IF NOT EXISTS calibration_history_org_project_idx ON public.calibration_history (organization_id, project_id);

ALTER TABLE public.skills ADD CONSTRAINT skills_applies_to_client_in_org
  FOREIGN KEY (organization_id, applies_to_client_id) REFERENCES public.clients (organization_id, id) ON DELETE NO ACTION;
CREATE INDEX IF NOT EXISTS skills_org_applies_to_client_idx ON public.skills (organization_id, applies_to_client_id);

ALTER TABLE public.skills ADD CONSTRAINT skills_applies_to_project_in_org
  FOREIGN KEY (organization_id, applies_to_project_id) REFERENCES public.projects (organization_id, id) ON DELETE NO ACTION;
CREATE INDEX IF NOT EXISTS skills_org_applies_to_project_idx ON public.skills (organization_id, applies_to_project_id);


-- ---------------------------------------------------------------------------
-- 3. The hiring-manager portal
-- ---------------------------------------------------------------------------
--
-- `hiring_manager_tokens.contact_id` was added by 054 and constrained here
-- rather than there, so the whole class lands in one migration. The action
-- also checks that the contact is at the *project's client*, which is a
-- narrower rule than this one and still not expressible as a key.

ALTER TABLE public.hiring_manager_tokens ADD CONSTRAINT hiring_manager_tokens_project_in_org
  FOREIGN KEY (organization_id, project_id) REFERENCES public.projects (organization_id, id) ON DELETE NO ACTION;
CREATE INDEX IF NOT EXISTS hiring_manager_tokens_org_project_idx ON public.hiring_manager_tokens (organization_id, project_id);

ALTER TABLE public.hiring_manager_tokens ADD CONSTRAINT hiring_manager_tokens_contact_in_org
  FOREIGN KEY (organization_id, contact_id) REFERENCES public.client_contacts (organization_id, id) ON DELETE NO ACTION;
CREATE INDEX IF NOT EXISTS hiring_manager_tokens_org_contact_idx ON public.hiring_manager_tokens (organization_id, contact_id);

ALTER TABLE public.hiring_manager_reviews ADD CONSTRAINT hiring_manager_reviews_project_in_org
  FOREIGN KEY (organization_id, project_id) REFERENCES public.projects (organization_id, id) ON DELETE NO ACTION;
CREATE INDEX IF NOT EXISTS hiring_manager_reviews_org_project_idx ON public.hiring_manager_reviews (organization_id, project_id);

ALTER TABLE public.hiring_manager_reviews ADD CONSTRAINT hiring_manager_reviews_token_in_org
  FOREIGN KEY (organization_id, token_id) REFERENCES public.hiring_manager_tokens (organization_id, id) ON DELETE NO ACTION;
CREATE INDEX IF NOT EXISTS hiring_manager_reviews_org_token_idx ON public.hiring_manager_reviews (organization_id, token_id);


-- ---------------------------------------------------------------------------
-- 4. Clients, placements and the money
-- ---------------------------------------------------------------------------
--
-- `client_notes.contact_id` completes what 054 started: that migration
-- constrained `client_id` on both new tables and left the contact pointer,
-- which is the same shape one level down.

ALTER TABLE public.client_notes ADD CONSTRAINT client_notes_contact_in_org
  FOREIGN KEY (organization_id, contact_id) REFERENCES public.client_contacts (organization_id, id) ON DELETE NO ACTION;
CREATE INDEX IF NOT EXISTS client_notes_org_contact_idx ON public.client_notes (organization_id, contact_id);

ALTER TABLE public.fee_terms ADD CONSTRAINT fee_terms_client_in_org
  FOREIGN KEY (organization_id, client_id) REFERENCES public.clients (organization_id, id) ON DELETE NO ACTION;
CREATE INDEX IF NOT EXISTS fee_terms_org_client_idx ON public.fee_terms (organization_id, client_id);

ALTER TABLE public.fee_terms ADD CONSTRAINT fee_terms_project_in_org
  FOREIGN KEY (organization_id, project_id) REFERENCES public.projects (organization_id, id) ON DELETE NO ACTION;
CREATE INDEX IF NOT EXISTS fee_terms_org_project_idx ON public.fee_terms (organization_id, project_id);

ALTER TABLE public.placements ADD CONSTRAINT placements_project_in_org
  FOREIGN KEY (organization_id, project_id) REFERENCES public.projects (organization_id, id) ON DELETE NO ACTION;
CREATE INDEX IF NOT EXISTS placements_org_project_idx ON public.placements (organization_id, project_id);

ALTER TABLE public.placements ADD CONSTRAINT placements_candidate_in_org
  FOREIGN KEY (organization_id, candidate_id) REFERENCES public.candidates (organization_id, id) ON DELETE NO ACTION;
CREATE INDEX IF NOT EXISTS placements_org_candidate_idx ON public.placements (organization_id, candidate_id);

-- The pair the probe was run against: `client_id` is ON DELETE SET NULL, so
-- this is where a composite SET NULL would have blanked `organization_id`.
ALTER TABLE public.placements ADD CONSTRAINT placements_client_in_org
  FOREIGN KEY (organization_id, client_id) REFERENCES public.clients (organization_id, id) ON DELETE NO ACTION;
CREATE INDEX IF NOT EXISTS placements_org_client_idx ON public.placements (organization_id, client_id);

ALTER TABLE public.placements ADD CONSTRAINT placements_signed_off_by_contact_in_org
  FOREIGN KEY (organization_id, signed_off_by_contact_id) REFERENCES public.client_contacts (organization_id, id) ON DELETE NO ACTION;
CREATE INDEX IF NOT EXISTS placements_org_signed_off_by_contact_idx ON public.placements (organization_id, signed_off_by_contact_id);

ALTER TABLE public.placement_fees ADD CONSTRAINT placement_fees_placement_in_org
  FOREIGN KEY (organization_id, placement_id) REFERENCES public.placements (organization_id, id) ON DELETE NO ACTION;
CREATE INDEX IF NOT EXISTS placement_fees_org_placement_idx ON public.placement_fees (organization_id, placement_id);

ALTER TABLE public.placement_fees ADD CONSTRAINT placement_fees_fee_terms_in_org
  FOREIGN KEY (organization_id, fee_terms_id) REFERENCES public.fee_terms (organization_id, id) ON DELETE NO ACTION;
CREATE INDEX IF NOT EXISTS placement_fees_org_fee_terms_idx ON public.placement_fees (organization_id, fee_terms_id);

ALTER TABLE public.placement_fee_lines ADD CONSTRAINT placement_fee_lines_placement_in_org
  FOREIGN KEY (organization_id, placement_id) REFERENCES public.placements (organization_id, id) ON DELETE NO ACTION;
CREATE INDEX IF NOT EXISTS placement_fee_lines_org_placement_idx ON public.placement_fee_lines (organization_id, placement_id);

ALTER TABLE public.placement_fee_lines ADD CONSTRAINT placement_fee_lines_placement_fee_in_org
  FOREIGN KEY (organization_id, placement_fee_id) REFERENCES public.placement_fees (organization_id, id) ON DELETE NO ACTION;
CREATE INDEX IF NOT EXISTS placement_fee_lines_org_placement_fee_idx ON public.placement_fee_lines (organization_id, placement_fee_id);

-- Self-referential: a reversal points at the line it reverses. Same rule.
ALTER TABLE public.placement_fee_lines ADD CONSTRAINT placement_fee_lines_reverses_line_in_org
  FOREIGN KEY (organization_id, reverses_line_id) REFERENCES public.placement_fee_lines (organization_id, id) ON DELETE NO ACTION;
CREATE INDEX IF NOT EXISTS placement_fee_lines_org_reverses_line_idx ON public.placement_fee_lines (organization_id, reverses_line_id);


-- ---------------------------------------------------------------------------
-- 5. The activity trail
-- ---------------------------------------------------------------------------
--
-- Its four subject pointers. `actor_id` and `target_user_id` are excluded
-- with every other `users` reference — see the header.

ALTER TABLE public.activity_events ADD CONSTRAINT activity_events_project_in_org
  FOREIGN KEY (organization_id, project_id) REFERENCES public.projects (organization_id, id) ON DELETE NO ACTION;
CREATE INDEX IF NOT EXISTS activity_events_org_project_idx ON public.activity_events (organization_id, project_id);

ALTER TABLE public.activity_events ADD CONSTRAINT activity_events_candidate_in_org
  FOREIGN KEY (organization_id, candidate_id) REFERENCES public.candidates (organization_id, id) ON DELETE NO ACTION;
CREATE INDEX IF NOT EXISTS activity_events_org_candidate_idx ON public.activity_events (organization_id, candidate_id);

ALTER TABLE public.activity_events ADD CONSTRAINT activity_events_client_in_org
  FOREIGN KEY (organization_id, client_id) REFERENCES public.clients (organization_id, id) ON DELETE NO ACTION;
CREATE INDEX IF NOT EXISTS activity_events_org_client_idx ON public.activity_events (organization_id, client_id);

ALTER TABLE public.activity_events ADD CONSTRAINT activity_events_placement_in_org
  FOREIGN KEY (organization_id, placement_id) REFERENCES public.placements (organization_id, id) ON DELETE NO ACTION;
CREATE INDEX IF NOT EXISTS activity_events_org_placement_idx ON public.activity_events (organization_id, placement_id);


-- ---------------------------------------------------------------------------
-- 6. Sourcing
-- ---------------------------------------------------------------------------

ALTER TABLE public.sourcing_runs ADD CONSTRAINT sourcing_runs_project_in_org
  FOREIGN KEY (organization_id, project_id) REFERENCES public.projects (organization_id, id) ON DELETE NO ACTION;
CREATE INDEX IF NOT EXISTS sourcing_runs_org_project_idx ON public.sourcing_runs (organization_id, project_id);

ALTER TABLE public.sourcing_runs ADD CONSTRAINT sourcing_runs_parent_run_in_org
  FOREIGN KEY (organization_id, parent_run_id) REFERENCES public.sourcing_runs (organization_id, id) ON DELETE NO ACTION;
CREATE INDEX IF NOT EXISTS sourcing_runs_org_parent_run_idx ON public.sourcing_runs (organization_id, parent_run_id);

ALTER TABLE public.sourcing_run_candidates ADD CONSTRAINT sourcing_run_candidates_run_in_org
  FOREIGN KEY (organization_id, run_id) REFERENCES public.sourcing_runs (organization_id, id) ON DELETE NO ACTION;
CREATE INDEX IF NOT EXISTS sourcing_run_candidates_org_run_idx ON public.sourcing_run_candidates (organization_id, run_id);

ALTER TABLE public.sourcing_run_candidates ADD CONSTRAINT sourcing_run_candidates_candidate_in_org
  FOREIGN KEY (organization_id, candidate_id) REFERENCES public.candidates (organization_id, id) ON DELETE NO ACTION;
CREATE INDEX IF NOT EXISTS sourcing_run_candidates_org_candidate_idx ON public.sourcing_run_candidates (organization_id, candidate_id);

ALTER TABLE public.sourcing_run_results ADD CONSTRAINT sourcing_run_results_run_in_org
  FOREIGN KEY (organization_id, run_id) REFERENCES public.sourcing_runs (organization_id, id) ON DELETE NO ACTION;
CREATE INDEX IF NOT EXISTS sourcing_run_results_org_run_idx ON public.sourcing_run_results (organization_id, run_id);

ALTER TABLE public.sourcing_run_results ADD CONSTRAINT sourcing_run_results_matched_candidate_in_org
  FOREIGN KEY (organization_id, matched_candidate_id) REFERENCES public.candidates (organization_id, id) ON DELETE NO ACTION;
CREATE INDEX IF NOT EXISTS sourcing_run_results_org_matched_candidate_idx ON public.sourcing_run_results (organization_id, matched_candidate_id);

ALTER TABLE public.sourcing_run_results ADD CONSTRAINT sourcing_run_results_promoted_candidate_in_org
  FOREIGN KEY (organization_id, promoted_candidate_id) REFERENCES public.candidates (organization_id, id) ON DELETE NO ACTION;
CREATE INDEX IF NOT EXISTS sourcing_run_results_org_promoted_candidate_idx ON public.sourcing_run_results (organization_id, promoted_candidate_id);


-- ---------------------------------------------------------------------------
-- 7. Executive Intelligence
-- ---------------------------------------------------------------------------
--
-- `executive_search_competencies.competency_id` is absent on purpose: the
-- competency catalogue is global (NULL org) and a composite key would reject
-- every row in it. See the header.

ALTER TABLE public.executive_searches ADD CONSTRAINT executive_searches_client_in_org
  FOREIGN KEY (organization_id, client_id) REFERENCES public.clients (organization_id, id) ON DELETE NO ACTION;
CREATE INDEX IF NOT EXISTS executive_searches_org_client_idx ON public.executive_searches (organization_id, client_id);

ALTER TABLE public.executive_search_competencies ADD CONSTRAINT executive_search_competencies_search_in_org
  FOREIGN KEY (organization_id, search_id) REFERENCES public.executive_searches (organization_id, id) ON DELETE NO ACTION;
CREATE INDEX IF NOT EXISTS executive_search_competencies_org_search_idx ON public.executive_search_competencies (organization_id, search_id);

ALTER TABLE public.executive_search_candidates ADD CONSTRAINT executive_search_candidates_search_in_org
  FOREIGN KEY (organization_id, search_id) REFERENCES public.executive_searches (organization_id, id) ON DELETE NO ACTION;
CREATE INDEX IF NOT EXISTS executive_search_candidates_org_search_idx ON public.executive_search_candidates (organization_id, search_id);

ALTER TABLE public.executive_search_candidates ADD CONSTRAINT executive_search_candidates_candidate_in_org
  FOREIGN KEY (organization_id, candidate_id) REFERENCES public.candidates (organization_id, id) ON DELETE NO ACTION;
CREATE INDEX IF NOT EXISTS executive_search_candidates_org_candidate_idx ON public.executive_search_candidates (organization_id, candidate_id);

ALTER TABLE public.role_success_profiles ADD CONSTRAINT role_success_profiles_search_in_org
  FOREIGN KEY (organization_id, search_id) REFERENCES public.executive_searches (organization_id, id) ON DELETE NO ACTION;
CREATE INDEX IF NOT EXISTS role_success_profiles_org_search_idx ON public.role_success_profiles (organization_id, search_id);

ALTER TABLE public.executive_interview_plans ADD CONSTRAINT executive_interview_plans_search_in_org
  FOREIGN KEY (organization_id, search_id) REFERENCES public.executive_searches (organization_id, id) ON DELETE NO ACTION;
CREATE INDEX IF NOT EXISTS executive_interview_plans_org_search_idx ON public.executive_interview_plans (organization_id, search_id);

ALTER TABLE public.executive_interview_plans ADD CONSTRAINT executive_interview_plans_candidate_in_org
  FOREIGN KEY (organization_id, candidate_id) REFERENCES public.candidates (organization_id, id) ON DELETE NO ACTION;
CREATE INDEX IF NOT EXISTS executive_interview_plans_org_candidate_idx ON public.executive_interview_plans (organization_id, candidate_id);

ALTER TABLE public.executive_interview_plans ADD CONSTRAINT executive_interview_plans_source_profile_in_org
  FOREIGN KEY (organization_id, source_profile_id) REFERENCES public.role_success_profiles (organization_id, id) ON DELETE NO ACTION;
CREATE INDEX IF NOT EXISTS executive_interview_plans_org_source_profile_idx ON public.executive_interview_plans (organization_id, source_profile_id);

ALTER TABLE public.executive_assessments ADD CONSTRAINT executive_assessments_search_in_org
  FOREIGN KEY (organization_id, search_id) REFERENCES public.executive_searches (organization_id, id) ON DELETE NO ACTION;
CREATE INDEX IF NOT EXISTS executive_assessments_org_search_idx ON public.executive_assessments (organization_id, search_id);

ALTER TABLE public.executive_assessments ADD CONSTRAINT executive_assessments_candidate_in_org
  FOREIGN KEY (organization_id, candidate_id) REFERENCES public.candidates (organization_id, id) ON DELETE NO ACTION;
CREATE INDEX IF NOT EXISTS executive_assessments_org_candidate_idx ON public.executive_assessments (organization_id, candidate_id);

ALTER TABLE public.executive_assessments ADD CONSTRAINT executive_assessments_source_plan_in_org
  FOREIGN KEY (organization_id, source_plan_id) REFERENCES public.executive_interview_plans (organization_id, id) ON DELETE NO ACTION;
CREATE INDEX IF NOT EXISTS executive_assessments_org_source_plan_idx ON public.executive_assessments (organization_id, source_plan_id);

ALTER TABLE public.executive_risk_reviews ADD CONSTRAINT executive_risk_reviews_search_in_org
  FOREIGN KEY (organization_id, search_id) REFERENCES public.executive_searches (organization_id, id) ON DELETE NO ACTION;
CREATE INDEX IF NOT EXISTS executive_risk_reviews_org_search_idx ON public.executive_risk_reviews (organization_id, search_id);

ALTER TABLE public.executive_risk_reviews ADD CONSTRAINT executive_risk_reviews_candidate_in_org
  FOREIGN KEY (organization_id, candidate_id) REFERENCES public.candidates (organization_id, id) ON DELETE NO ACTION;
CREATE INDEX IF NOT EXISTS executive_risk_reviews_org_candidate_idx ON public.executive_risk_reviews (organization_id, candidate_id);

ALTER TABLE public.executive_risk_reviews ADD CONSTRAINT executive_risk_reviews_source_profile_in_org
  FOREIGN KEY (organization_id, source_profile_id) REFERENCES public.role_success_profiles (organization_id, id) ON DELETE NO ACTION;
CREATE INDEX IF NOT EXISTS executive_risk_reviews_org_source_profile_idx ON public.executive_risk_reviews (organization_id, source_profile_id);

ALTER TABLE public.executive_risk_reviews ADD CONSTRAINT executive_risk_reviews_source_plan_in_org
  FOREIGN KEY (organization_id, source_plan_id) REFERENCES public.executive_interview_plans (organization_id, id) ON DELETE NO ACTION;
CREATE INDEX IF NOT EXISTS executive_risk_reviews_org_source_plan_idx ON public.executive_risk_reviews (organization_id, source_plan_id);

ALTER TABLE public.executive_risk_reviews ADD CONSTRAINT executive_risk_reviews_source_assessment_in_org
  FOREIGN KEY (organization_id, source_assessment_id) REFERENCES public.executive_assessments (organization_id, id) ON DELETE NO ACTION;
CREATE INDEX IF NOT EXISTS executive_risk_reviews_org_source_assessment_idx ON public.executive_risk_reviews (organization_id, source_assessment_id);

ALTER TABLE public.executive_audit_events ADD CONSTRAINT executive_audit_events_search_in_org
  FOREIGN KEY (organization_id, search_id) REFERENCES public.executive_searches (organization_id, id) ON DELETE NO ACTION;
CREATE INDEX IF NOT EXISTS executive_audit_events_org_search_idx ON public.executive_audit_events (organization_id, search_id);

ALTER TABLE public.executive_audit_events ADD CONSTRAINT executive_audit_events_profile_in_org
  FOREIGN KEY (organization_id, profile_id) REFERENCES public.role_success_profiles (organization_id, id) ON DELETE NO ACTION;
CREATE INDEX IF NOT EXISTS executive_audit_events_org_profile_idx ON public.executive_audit_events (organization_id, profile_id);

ALTER TABLE public.executive_audit_events ADD CONSTRAINT executive_audit_events_plan_in_org
  FOREIGN KEY (organization_id, plan_id) REFERENCES public.executive_interview_plans (organization_id, id) ON DELETE NO ACTION;
CREATE INDEX IF NOT EXISTS executive_audit_events_org_plan_idx ON public.executive_audit_events (organization_id, plan_id);

ALTER TABLE public.executive_audit_events ADD CONSTRAINT executive_audit_events_assessment_in_org
  FOREIGN KEY (organization_id, assessment_id) REFERENCES public.executive_assessments (organization_id, id) ON DELETE NO ACTION;
CREATE INDEX IF NOT EXISTS executive_audit_events_org_assessment_idx ON public.executive_audit_events (organization_id, assessment_id);

ALTER TABLE public.executive_audit_events ADD CONSTRAINT executive_audit_events_risk_review_in_org
  FOREIGN KEY (organization_id, risk_review_id) REFERENCES public.executive_risk_reviews (organization_id, id) ON DELETE NO ACTION;
CREATE INDEX IF NOT EXISTS executive_audit_events_org_risk_review_idx ON public.executive_audit_events (organization_id, risk_review_id);
