import { describe, expect, it } from "vitest";
import {
  buildCandidateProfileSchema,
  CANDIDATE_PROFILE_SCHEMA,
} from "./cv-parsing";

type Schema = {
  required: string[];
  additionalProperties: boolean;
  properties: Record<string, Record<string, unknown>>;
};

const DIMS = [
  {
    key: "fx_options",
    label: "FX options market-making depth",
    definition: "A 10 has run an options book.",
  },
  {
    key: "emerging_markets",
    label: "EM currency coverage",
    definition: "A 10 has priced illiquid EM crosses.",
  },
];

describe("buildCandidateProfileSchema", () => {
  it("returns the UNCHANGED constant when the mandate has no custom dimensions", () => {
    // Identity, not deep equality: mandates that don't use this feature
    // must not pay a rebuild, and the model must never be told the
    // concept exists.
    expect(buildCandidateProfileSchema([])).toBe(CANDIDATE_PROFILE_SCHEMA);
    expect(buildCandidateProfileSchema()).toBe(CANDIDATE_PROFILE_SCHEMA);
  });

  it("adds custom_fit_dimensions carrying EXACTLY the supplied keys", () => {
    const schema = buildCandidateProfileSchema(DIMS) as unknown as Schema;
    const custom = schema.properties.custom_fit_dimensions as {
      required: string[];
      additionalProperties: boolean;
      properties: Record<string, { type: string; description: string }>;
    };
    expect(custom.required).toEqual(["fx_options", "emerging_markets"]);
    expect(Object.keys(custom.properties)).toEqual([
      "fx_options",
      "emerging_markets",
    ]);
  });

  it("keeps the closed world — the model cannot invent an axis", () => {
    const schema = buildCandidateProfileSchema(DIMS) as unknown as Schema;
    expect(schema.additionalProperties).toBe(false);
    const custom = schema.properties.custom_fit_dimensions as {
      additionalProperties: boolean;
    };
    expect(custom.additionalProperties).toBe(false);
  });

  it("requires the field, so a candidate can't be silently skipped on an approved axis", () => {
    const schema = buildCandidateProfileSchema(DIMS) as unknown as Schema;
    expect(schema.required).toContain("custom_fit_dimensions");
  });

  it("carries each dimension's definition to the model — that is what gets scored", () => {
    const schema = buildCandidateProfileSchema(DIMS) as unknown as Schema;
    const custom = schema.properties.custom_fit_dimensions as {
      properties: Record<string, { type: string; description: string }>;
    };
    expect(custom.properties.fx_options.type).toBe("integer");
    expect(custom.properties.fx_options.description).toContain(
      "A 10 has run an options book."
    );
    expect(custom.properties.fx_options.description).toContain(
      "FX options market-making depth"
    );
  });

  it("leaves the core five untouched", () => {
    const schema = buildCandidateProfileSchema(DIMS) as unknown as Schema;
    const fit = schema.properties.fit_dimensions as { required: string[] };
    expect(fit.required).toEqual([
      "technical",
      "domain",
      "leadership",
      "regulatory",
      "transformation",
    ]);
    const base = CANDIDATE_PROFILE_SCHEMA as unknown as Schema;
    for (const key of base.required) {
      expect(schema.required).toContain(key);
    }
  });

  it("does not mutate the shared constant", () => {
    const before = JSON.stringify(CANDIDATE_PROFILE_SCHEMA);
    buildCandidateProfileSchema(DIMS);
    expect(JSON.stringify(CANDIDATE_PROFILE_SCHEMA)).toBe(before);
  });
});
