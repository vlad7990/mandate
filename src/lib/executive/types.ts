// Executive Hiring Intelligence — shared domain types.
//
// The module treats every AI artifact as decision support: humans review,
// edit, and approve. These types carry that shape — provenance fields on
// profiles, evidence-oriented content sections, explicit approval state.

export type ExecutiveSearchStatus = "draft" | "active" | "on_hold" | "closed";
export type ServiceTier = "standard" | "premium" | "enterprise";
export type CompanyContextStatus = "none" | "generating" | "ready" | "failed";
export type ProfileStatus = "draft" | "approved" | "archived";
export type CompetencyCategory =
  | "leadership"
  | "functional"
  | "operating"
  | "governance";

export type ExecutiveSearchRow = {
  id: string;
  organization_id: string;
  created_by: string | null;
  template_id: string | null;
  status: ExecutiveSearchStatus;
  service_tier: ServiceTier;
  company_name: string;
  industry: string | null;
  business_model: string | null;
  revenue_range: string | null;
  employee_count: string | null;
  funding_stage: string | null;
  ownership_structure: string | null;
  geographic_footprint: string | null;
  regulatory_environment: string | null;
  role_title: string;
  role_family: string;
  is_new_role: boolean | null;
  reason_for_hire: string | null;
  reporting_line: string | null;
  board_exposure: string | null;
  team_size: string | null;
  budget_scope: string | null;
  business_situation: string | null;
  expected_90_day_outcomes: string | null;
  expected_first_year_outcomes: string | null;
  non_negotiables: string | null;
  preferred_leadership_style: string | null;
  company_context: Record<string, unknown>;
  company_context_status: CompanyContextStatus;
  company_context_error: string | null;
  created_at: string;
  updated_at: string;
};

export type ExecutiveCompetencyRow = {
  id: string;
  organization_id: string | null;
  /**
   * The catalogue tier, explicit since 056 — see the note on
   * `ExecutiveRoleTemplateRow.is_global`. A search records the tier of every
   * competency it attaches, and the pair is a foreign key, so an org can
   * only ever weight a global competency or one of its own.
   */
  is_global: boolean;
  key: string;
  name: string;
  category: CompetencyCategory;
  definition: string;
  positive_indicators: string[];
  negative_indicators: string[];
};

export type ExecutiveRoleTemplateRow = {
  id: string;
  organization_id: string | null;
  /**
   * The catalogue tier, explicit since 056.
   *
   * Global rows are the seeded catalogue every org reads; org-private rows
   * are an admin's own. It is a real column rather than `organization_id IS
   * NULL` because a foreign key has to reference it: a search records the
   * tier of the template it used, and the pair proves the template is either
   * global or the search's own org's — never another tenant's.
   *
   * A CHECK keeps it in step with `organization_id`, so the two can never
   * disagree.
   */
  is_global: boolean;
  key: string;
  title: string;
  summary: string;
  role_family: string;
  intake_defaults: Record<string, unknown>;
  competency_weights: TemplateCompetencyWeight[];
};

export type TemplateCompetencyWeight = {
  competency_key: string;
  weight: number;
  rationale: string;
};

export type SuccessProfileRow = {
  id: string;
  search_id: string;
  organization_id: string;
  version: number;
  content_json: unknown;
  status: ProfileStatus;
  prompt_version: string | null;
  model_version: string | null;
  is_generating: boolean;
  generation_error: string | null;
  created_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ExecutiveAuditEventType =
  | "search_created"
  | "search_updated"
  | "profile_generation_requested"
  | "profile_generated"
  | "profile_generation_failed"
  | "profile_edited"
  | "profile_new_version"
  | "profile_regenerated"
  | "profile_approved"
  | "candidate_linked"
  | "candidate_unlinked"
  | "candidate_stage_changed"
  | "interview_plan_generation_requested"
  | "interview_plan_generated"
  | "interview_plan_generation_failed"
  | "interview_plan_edited"
  | "interview_plan_new_version"
  | "interview_plan_regenerated"
  | "interview_plan_approved"
  | "assessment_created"
  | "assessment_edited"
  | "assessment_new_version"
  | "assessment_approved"
  // 104: org-authored role templates — the module's own ledger carries
  // the authoring acts (search_id NULL; detail = key/title/shadowing,
  // never the defaults' text).
  | "template_created"
  | "template_updated"
  | "template_deleted";

/** Due-diligence funnel position — never a hiring decision. */
export type ExecutiveCandidateStage =
  | "identified"
  | "in_diligence"
  | "advanced"
  | "on_hold"
  | "declined";

export type ExecutiveSearchCandidateRow = {
  id: string;
  search_id: string;
  organization_id: string;
  candidate_id: string;
  stage: ExecutiveCandidateStage;
  added_by: string | null;
  created_at: string;
  updated_at: string;
};

export const EXEC_CANDIDATE_STAGES: ExecutiveCandidateStage[] = [
  "identified",
  "in_diligence",
  "advanced",
  "on_hold",
  "declined",
];

export const EXEC_CANDIDATE_STAGE_LABELS: Record<ExecutiveCandidateStage, string> = {
  identified: "Identified",
  in_diligence: "In Diligence",
  advanced: "Advanced",
  on_hold: "On Hold",
  declined: "Declined",
};

export type InterviewPlanRow = {
  id: string;
  search_id: string;
  candidate_id: string;
  organization_id: string;
  source_profile_id: string | null;
  version: number;
  content_json: unknown;
  status: ProfileStatus;
  prompt_version: string | null;
  model_version: string | null;
  is_generating: boolean;
  generation_error: string | null;
  created_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ExecutiveAuditEventRow = {
  id: string;
  organization_id: string;
  search_id: string | null;
  profile_id: string | null;
  plan_id: string | null;
  assessment_id: string | null;
  actor_id: string | null;
  event_type: ExecutiveAuditEventType;
  detail: Record<string, unknown>;
  created_at: string;
};

// ---------------------------------------------------------------------------
// Assessments (Phase 2c) — human-authored evidence capture, versioned exactly
// like interview plans (draft → approved → archived). No AI provenance columns:
// there is no agent. The evidence rollup + weighted strength are computed
// server-side from the operational competency weights and stamped into
// content_json on every save — never trusted from the client.
// ---------------------------------------------------------------------------

/** Evidence-oriented rating scale. Deliberately NOT a numeric grade or a
 * judgment/psychological label — it records how much evidence was observed. */
export type EvidenceRating = "strong" | "moderate" | "limited" | "none";

export type CompetencyAssessment = {
  competency_key: string;
  rating: EvidenceRating;
  evidence: string;
  /** Which interview-plan stage(s) this evidence draws from (provenance). */
  source_stages: string[];
};

export type EvidenceRollupEntry = {
  competency_key: string;
  label: string;
  weight: number;
  rating: EvidenceRating;
  evidence_score: number;
};

export type AssessmentContent = {
  overall_summary: string;
  competency_assessments: CompetencyAssessment[];
  /** Server-computed on every save. */
  evidence_rollup: EvidenceRollupEntry[];
  /** Server-computed: sum(weight * score) / sum(weight), 0..1. */
  weighted_evidence_strength: number;
};

export type AssessmentRow = {
  id: string;
  search_id: string;
  candidate_id: string;
  organization_id: string;
  source_plan_id: string | null;
  version: number;
  content_json: unknown;
  status: ProfileStatus;
  created_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
};

export const SEARCH_STATUS_LABELS: Record<ExecutiveSearchStatus, string> = {
  draft: "Draft",
  active: "Active",
  on_hold: "On Hold",
  closed: "Closed",
};

export const SERVICE_TIER_LABELS: Record<ServiceTier, string> = {
  standard: "Standard",
  premium: "Premium",
  enterprise: "Enterprise",
};

export const PROFILE_STATUS_LABELS: Record<ProfileStatus, string> = {
  draft: "Draft — awaiting human approval",
  approved: "Approved",
  archived: "Archived",
};

export const COMPETENCY_CATEGORY_LABELS: Record<CompetencyCategory, string> = {
  leadership: "Leadership",
  functional: "Functional",
  operating: "Operating Scale & Stage",
  governance: "Governance & Stakeholders",
};

export const ROLE_FAMILIES = [
  { value: "ceo", label: "CEO" },
  { value: "cto", label: "CTO" },
  { value: "cio", label: "CIO" },
  { value: "cpo", label: "CPO" },
  { value: "cdo", label: "CDO" },
  { value: "chief_ai_officer", label: "Chief AI Officer" },
  { value: "coo", label: "COO" },
  { value: "cfo", label: "CFO" },
  { value: "cro", label: "CRO" },
  { value: "cmo", label: "CMO" },
  { value: "ciso", label: "CISO" },
  { value: "vp_engineering", label: "VP Engineering" },
  { value: "vp_product", label: "VP Product" },
  { value: "vp_sales", label: "VP Sales" },
  { value: "transformation", label: "Head of Transformation" },
  { value: "other", label: "Other Senior Leadership" },
] as const;

/**
 * Shown wherever AI-generated content appears in this module. Centralized so
 * the wording stays consistent and auditable.
 */
export const DECISION_SUPPORT_DISCLAIMER =
  "AI-generated decision support. This content informs human judgment — it is not a hiring decision and must be reviewed and approved by a person.";

/** Evidence-scale labels. Wording is deliberately evidence-oriented. */
export const EVIDENCE_RATING_LABELS: Record<EvidenceRating, string> = {
  strong: "Strong evidence",
  moderate: "Moderate evidence",
  limited: "Limited evidence",
  none: "No evidence observed",
};

export const EVIDENCE_RATINGS: EvidenceRating[] = [
  "strong",
  "moderate",
  "limited",
  "none",
];

/**
 * Assessments are human-authored (no AI agent), so they carry a different
 * disclaimer: the app scores observed evidence against the competency weights,
 * but the record and any decision remain the human's. Never a hire/no-hire.
 */
export const ASSESSMENT_DISCLAIMER =
  "Structured evidence capture for human judgment. The evidence-strength summary weights your observations against the role's competencies — it is not a score of the person, not a hiring decision, and must be reviewed and approved by a person.";
