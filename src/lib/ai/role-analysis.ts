import "server-only";

export const SENIORITY_OPTIONS = [
  "C-Suite",
  "SVP",
  "VP",
  "Director",
  "Head of",
  "Manager",
] as const;
export type Seniority = (typeof SENIORITY_OPTIONS)[number];

export const FUNCTION_OPTIONS = [
  "Technology",
  "Operations",
  "Finance",
  "Risk",
  "Product",
  "Data",
  "Legal",
  "HR",
  "Sales",
  "Marketing",
] as const;
export type RoleFunction = (typeof FUNCTION_OPTIONS)[number];

export const INDUSTRY_OPTIONS = [
  "Financial Services",
  "Investment Banking",
  "Asset Management",
  "Fintech",
  "Insurance",
  "Healthcare",
  "Consulting",
  "Tech",
] as const;
export type Industry = (typeof INDUSTRY_OPTIONS)[number];

export type RoleAnalysis = {
  role_title: string;
  company_name: string;
  inferred_scope: string;
  missing_information: string[];
  role_structure: {
    seniority: Seniority;
    function: RoleFunction;
  };
  industry: Industry;
  business_model: string;
};

import type { DimensionWeights } from "./onboarding-analysis";

export type CalibrationModel = Pick<
  RoleAnalysis,
  "role_title" | "inferred_scope" | "missing_information" | "role_structure"
> & {
  dimension_weights?: DimensionWeights;
  weights_rationale?: string;
};

export type CompanyContext = {
  company_name: RoleAnalysis["company_name"];
  industry: RoleAnalysis["industry"];
  business_model: RoleAnalysis["business_model"];
};

export function splitAnalysis(analysis: RoleAnalysis): {
  calibration_model: CalibrationModel;
  company_context: CompanyContext;
} {
  return {
    calibration_model: {
      role_title: analysis.role_title,
      inferred_scope: analysis.inferred_scope,
      missing_information: analysis.missing_information,
      role_structure: analysis.role_structure,
    },
    company_context: {
      company_name: analysis.company_name,
      industry: analysis.industry,
      business_model: analysis.business_model,
    },
  };
}

export const ROLE_ANALYSIS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "role_title",
    "company_name",
    "inferred_scope",
    "missing_information",
    "role_structure",
    "industry",
    "business_model",
  ],
  properties: {
    role_title: {
      type: "string",
      description:
        "Clean, formal title in title case. e.g. 'VP of Engineering', 'Head of IT Operations'.",
    },
    company_name: {
      type: "string",
      description:
        "Official company name as commonly known. Spell out abbreviations only when ambiguous.",
    },
    inferred_scope: {
      type: "string",
      description:
        "1-2 sentences describing the role's likely scope, geography, and seniority context based on the input.",
    },
    missing_information: {
      type: "array",
      items: { type: "string" },
      description:
        "Critical items not specified in the one-line input that the recruiter will need to clarify before sourcing — e.g. 'compensation range', 'geography', 'team size', 'reporting line'. Be conservative; only flag truly important gaps.",
    },
    role_structure: {
      type: "object",
      additionalProperties: false,
      required: ["seniority", "function"],
      properties: {
        seniority: { type: "string", enum: [...SENIORITY_OPTIONS] },
        function: { type: "string", enum: [...FUNCTION_OPTIONS] },
      },
    },
    industry: { type: "string", enum: [...INDUSTRY_OPTIONS] },
    business_model: {
      type: "string",
      description:
        "2-5 word descriptor of the company's business model. e.g. 'Investment Bank', 'B2B SaaS', 'Public Asset Manager', 'Healthcare Provider'.",
    },
  },
} as const;

export const ROLE_ANALYSIS_SYSTEM_PROMPT = `You are an executive search intelligence analyst. Given a one-line role description, extract structured information about the role and company.

Output strictly conforms to the provided JSON schema.

Be conservative with \`missing_information\` — only flag truly critical gaps (compensation range, geography, team size, reporting line, mandate timeline). If the input is rich, the list may be short.

For \`seniority\` and \`function\`, pick the closest match from the enum. For \`industry\`, pick from the enum; if no value fits cleanly, use 'Tech' as a fallback. For \`business_model\`, give a 2-5 word descriptor.`;
