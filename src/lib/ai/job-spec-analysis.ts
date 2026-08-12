// Shared types, schema, prompt, and helpers for the Job Spec Builder.
// Client-safe (no `server-only`) — the editor imports SECTION_DEFS, types,
// and the markdown serializer; the server-only module imports the schema
// and system prompt for the Anthropic call.

export type SectionType = "paragraphs" | "list";

export type JobSpecSections = {
  role_overview: string;
  key_responsibilities: string[];
  required_experience: string[];
  leadership_culture_fit: string[];
  success_metrics: string[];
};

export type SectionKey = keyof JobSpecSections;

export type SectionDef = {
  key: SectionKey;
  label: string;
  short: string;
  type: SectionType;
  blurb: string;
  /** For list-type sections, target/minimum/maximum item counts. */
  minItems?: number;
  maxItems?: number;
};

export const SECTION_DEFS: SectionDef[] = [
  {
    key: "role_overview",
    label: "Role Overview",
    short: "OVERVIEW",
    type: "paragraphs",
    blurb: "2–3 paragraphs describing the role, its strategic context, and its scope.",
  },
  {
    key: "key_responsibilities",
    label: "Key Responsibilities",
    short: "RESPONSIBILITIES",
    type: "list",
    blurb: "6–8 concrete responsibilities the operator owns end-to-end.",
    minItems: 6,
    maxItems: 8,
  },
  {
    key: "required_experience",
    label: "Required Experience",
    short: "EXPERIENCE",
    type: "list",
    blurb: "5–6 must-have qualifications drawn directly from the recruiter's onboarding answers.",
    minItems: 5,
    maxItems: 6,
  },
  {
    key: "leadership_culture_fit",
    label: "Leadership & Culture Fit",
    short: "LEADERSHIP",
    type: "list",
    blurb: "3–4 traits and ways-of-working signals the panel will probe for.",
    minItems: 3,
    maxItems: 4,
  },
  {
    key: "success_metrics",
    label: "What Success Looks Like",
    short: "SUCCESS",
    type: "list",
    blurb: "3–4 measurable outcomes that define a successful first 12–18 months.",
    minItems: 3,
    maxItems: 4,
  },
];

export const EMPTY_JOB_SPEC: JobSpecSections = {
  role_overview: "",
  key_responsibilities: [],
  required_experience: [],
  leadership_culture_fit: [],
  success_metrics: [],
};

export const JOB_SPEC_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "role_overview",
    "key_responsibilities",
    "required_experience",
    "leadership_culture_fit",
    "success_metrics",
  ],
  properties: {
    role_overview: {
      type: "string",
      description:
        "2–3 paragraphs separated by blank lines. Establish the role's strategic mandate, scope, reporting context, and the business problem it exists to solve. No bullets, no markdown headings, plain prose.",
    },
    key_responsibilities: {
      type: "array",
      items: { type: "string" },
      description:
        "6–8 concrete responsibilities the operator owns end-to-end. Each item is a single sentence starting with an active verb (Lead, Own, Drive, Build, Modernise…). No nested bullets.",
    },
    required_experience: {
      type: "array",
      items: { type: "string" },
      description:
        "5–6 must-have qualifications. These should be directly drawn from the recruiter's onboarding 'must_haves' answers, refined into hiring-manager-grade prose. No nice-to-haves.",
    },
    leadership_culture_fit: {
      type: "array",
      items: { type: "string" },
      description:
        "3–4 traits / ways-of-working signals. Use the stakeholder focus areas and dimension weights to inform what behaviours matter most.",
    },
    success_metrics: {
      type: "array",
      items: { type: "string" },
      description:
        "3–4 measurable outcomes that define success in the first 12–18 months. Quantify wherever possible; otherwise state the observable signal of success.",
    },
  },
} as const;

export const JOB_SPEC_SYSTEM_PROMPT = `You are an executive-search senior partner drafting a hiring-manager-grade job specification.

Inputs you will receive as JSON:
  role_context      — title, inferred scope, role structure, any flagged missing information
  company_context   — company name, industry, business model
  onboarding        — role_origin, must_haves, anti_patterns, stakeholders, named priority_signals
  dimension_weights — five 0–10 weights (technical, domain, leadership, regulatory, transformation) plus a rationale

Produce a five-section spec that strictly conforms to the provided JSON schema.

Style rules:
- Write for a hiring manager, not a copywriter. Direct, substantive, no marketing fluff.
- Reflect the dimension weights in tone and emphasis: a regulatory-heavy weighting must shape Required Experience and Success Metrics; a transformation-heavy weighting must shape Role Overview and Responsibilities.
- Required Experience MUST anchor on the recruiter's must_haves. Do not invent qualifications that contradict an anti_pattern.
- Use the stakeholders' focus areas to shape Leadership & Culture Fit.
- Reference the company by name in Role Overview at least once. Match the language register to the industry (financial services / banking → formal; tech scale-up → operator-direct).
- No markdown headings inside string values. No bullets inside list items. No HTML.

Section bounds (enforced by the recruiter post-generation, but try to land within):
- role_overview: 2–3 paragraphs separated by blank lines
- key_responsibilities: 6–8 items
- required_experience: 5–6 items
- leadership_culture_fit: 3–4 items
- success_metrics: 3–4 items

Return one JSON object — no preamble, no markdown.`;

/**
 * Render a structured job spec as a markdown document. Used to populate the
 * legacy `content text` column on every write so downstream consumers
 * (export, full-text search, PDF) get a stable rendering.
 */
export function sectionsToMarkdown(sections: JobSpecSections): string {
  const lines: string[] = [];

  if (sections.role_overview?.trim()) {
    lines.push("# Role Overview", "", sections.role_overview.trim(), "");
  }

  const blocks: Array<{ heading: string; key: SectionKey }> = [
    { heading: "# Key Responsibilities", key: "key_responsibilities" },
    { heading: "# Required Experience", key: "required_experience" },
    { heading: "# Leadership & Culture Fit", key: "leadership_culture_fit" },
    { heading: "# What Success Looks Like", key: "success_metrics" },
  ];

  for (const { heading, key } of blocks) {
    const list = sections[key];
    if (Array.isArray(list) && list.some((item) => item.trim())) {
      lines.push(heading, "");
      for (const item of list) {
        if (item.trim()) lines.push(`- ${item.trim()}`);
      }
      lines.push("");
    }
  }

  return lines.join("\n").trim() || "_Spec is being generated…_";
}

/**
 * Coerce an unknown JSONB blob from the database into a fully-shaped
 * JobSpecSections. Missing fields fall back to empty values. Defensive
 * because content_json defaults to '{}'::jsonb on placeholder rows.
 */
export function normalizeSections(raw: unknown): JobSpecSections {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const asString = (v: unknown): string => (typeof v === "string" ? v : "");
  const asStringArray = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];

  return {
    role_overview: asString(obj.role_overview),
    key_responsibilities: asStringArray(obj.key_responsibilities),
    required_experience: asStringArray(obj.required_experience),
    leadership_culture_fit: asStringArray(obj.leadership_culture_fit),
    success_metrics: asStringArray(obj.success_metrics),
  };
}

/**
 * Section-level diff used by the editor's "diff vs final" panel.
 * Returns one entry per section with whether it differs from the baseline
 * and the signed word-count delta (current minus baseline).
 */
export type SectionDiff = {
  key: SectionKey;
  changed: boolean;
  wordDelta: number;
};

function wordCount(s: string): number {
  return s.trim() ? s.trim().split(/\s+/).length : 0;
}

function sectionWords(sections: JobSpecSections, key: SectionKey): number {
  const v = sections[key];
  if (typeof v === "string") return wordCount(v);
  return v.reduce((sum, item) => sum + wordCount(item), 0);
}

function sectionsEqual(
  current: JobSpecSections,
  baseline: JobSpecSections,
  key: SectionKey
): boolean {
  const a = current[key];
  const b = baseline[key];
  if (typeof a === "string" && typeof b === "string") return a.trim() === b.trim();
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, i) => item.trim() === b[i].trim());
  }
  return false;
}

export function diffSections(
  current: JobSpecSections,
  baseline: JobSpecSections | null
): SectionDiff[] {
  return SECTION_DEFS.map(({ key }) => {
    if (!baseline) {
      return { key, changed: false, wordDelta: 0 };
    }
    const changed = !sectionsEqual(current, baseline, key);
    const wordDelta = sectionWords(current, key) - sectionWords(baseline, key);
    return { key, changed, wordDelta };
  });
}
