/**
 * The intake fields a template may prefill — exactly the names the
 * executive intake form posts. A key outside this list never lands in
 * intake_defaults, so a template cannot smuggle fields the form would
 * not render. Shared by the form (renders one input each) and the
 * server action (accepts only these).
 */
export const TEMPLATE_DEFAULT_FIELDS = [
  { name: "role_title", label: "Role Title", long: false },
  { name: "industry", label: "Industry", long: false },
  { name: "business_model", label: "Business Model", long: false },
  { name: "revenue_range", label: "Revenue Range", long: false },
  { name: "employee_count", label: "Employee Count", long: false },
  { name: "funding_stage", label: "Funding Stage", long: false },
  { name: "ownership_structure", label: "Ownership Structure", long: false },
  { name: "geographic_footprint", label: "Geographic Footprint", long: false },
  { name: "regulatory_environment", label: "Regulatory Environment", long: true },
  { name: "reporting_line", label: "Reporting Line", long: false },
  { name: "board_exposure", label: "Board Exposure", long: false },
  { name: "team_size", label: "Team Size", long: false },
  { name: "budget_scope", label: "Budget / P&L Scope", long: false },
  { name: "reason_for_hire", label: "Reason for Hire", long: true },
  { name: "business_situation", label: "Business Situation", long: true },
  { name: "expected_90_day_outcomes", label: "Expected 90-Day Outcomes", long: true },
  { name: "expected_first_year_outcomes", label: "Expected First-Year Outcomes", long: true },
  { name: "non_negotiables", label: "Non-Negotiables", long: true },
  { name: "preferred_leadership_style", label: "Preferred Leadership Style", long: true },
] as const;

export type TemplateDefaultField = (typeof TEMPLATE_DEFAULT_FIELDS)[number]["name"];

/** The families the seeds use, plus the schema's default. */
export const ROLE_FAMILIES = [
  "cto",
  "cio",
  "cpo",
  "coo",
  "vp_engineering",
  "chief_ai_officer",
  "transformation",
  "other",
] as const;
