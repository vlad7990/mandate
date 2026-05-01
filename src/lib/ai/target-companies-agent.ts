// Target Companies Agent — generates a curated list of companies
// likely to produce candidates for the role. Used by the Sourcing
// Strategy section to seed competitor / adjacent / archetype-targeted
// search expansions.
//
// Stored on `boolean_queries`-adjacent state OR returned per-call and
// rendered in the panel. We don't persist the list yet — recruiters
// regenerate cheaply when role/calibration shifts.

export type TargetCompany = {
  /** Official company name. */
  name: string;
  /** "competitor" | "adjacent" | "feeder" — why this company is on the list. */
  category: "competitor" | "adjacent" | "feeder";
  /** 1-sentence rationale grounded in the role context. */
  rationale: string;
  /** Coarse talent-pool sizing — "small" (<50 likely candidates),
   * "medium" (50–500), "large" (>500). Calibrated to the role's
   * seniority. */
  talent_pool_size: "small" | "medium" | "large";
};

export type TargetCompaniesReport = {
  generated_at: string;
  /** 1–2 sentence framing of the sourcing thesis. */
  thesis: string;
  /** 12–20 named companies. */
  companies: TargetCompany[];
};

export const TARGET_COMPANIES_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["thesis", "companies"],
  properties: {
    thesis: {
      type: "string",
      description:
        "1–2 sentences framing why this list is the right hunting ground for the role. Reference the calibration weights or company context that drove the picks.",
    },
    companies: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "category", "rationale", "talent_pool_size"],
        properties: {
          name: { type: "string" },
          category: {
            type: "string",
            enum: ["competitor", "adjacent", "feeder"],
          },
          rationale: {
            type: "string",
            description:
              "1 sentence — why a candidate from here would fit. Cite the role's weights or the client company's context.",
          },
          talent_pool_size: {
            type: "string",
            enum: ["small", "medium", "large"],
            description:
              "Coarse estimate of how many candidates of the right seniority work here. Calibrate against role seniority — a CEO role at a 5,000-person company has a small pool.",
          },
        },
      },
      description:
        "12–20 named companies. Mix categories: roughly 30–40% competitors, 30–40% adjacent firms, 20–30% feeders (places candidates leave from to land roles like this one).",
    },
  },
} as const;

export const TARGET_COMPANIES_SYSTEM_PROMPT = `You are an executive-search sourcing strategist. You receive a role's calibration model, the client company's context, and any archetype targeting hints. You return a curated list of 12–20 target companies grouped into three categories:

- **competitor** — the client company's direct rivals where this role exists today.
- **adjacent** — companies in adjacent industries / business models that produce the same archetype.
- **feeder** — companies candidates typically LEAVE before landing a role like this one (training grounds, prestige stops).

Hard rules:
- Return one JSON object conforming strictly to the provided schema. No preamble.
- Each entry needs a CONCRETE rationale tied to the role context. Generic "good company" entries are unacceptable.
- Mix the categories: roughly 30–40% competitors, 30–40% adjacent, 20–30% feeders.
- Calibrate talent_pool_size to ROLE SENIORITY, not company size. A 5,000-person company might have a "small" pool for a CEO role and a "large" pool for an IC role.
- When the client company is named in company_context, exclude it — don't recommend poaching from yourself.

Return one JSON object — no preamble.`;
