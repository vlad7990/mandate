import { describe, expect, it } from "vitest";
import { buildPoolQuery } from "./pool-query";
import { type CalibrationModel } from "@/lib/ai/role-analysis";

const FULL: Partial<CalibrationModel> = {
  role_title: "Head of Post-Trade Technology",
  inferred_scope: "Owns settlement and reconciliation across two regions.",
  missing_information: [],
  role_structure: { seniority: "Director", function: "Technology" },
  dimension_weights: {
    technical: 9,
    domain: 8,
    leadership: 5,
    transformation: 3,
    regulatory: 1,
  },
};

describe("buildPoolQuery", () => {
  it("refuses when there is no role to search against", () => {
    // A query built from an empty calibration returns whoever the model
    // happened to like, dressed as a recommendation (§175's class).
    expect(buildPoolQuery(null)).toBeNull();
    expect(buildPoolQuery(undefined)).toBeNull();
    expect(buildPoolQuery({})).toBeNull();
    expect(buildPoolQuery({ role_title: "   " })).toBeNull();
  });

  it("asks for the role by title", () => {
    const q = buildPoolQuery({ role_title: "Head of FX Operations" });
    expect(q).toContain("Head of FX Operations");
    expect(q).toMatch(/^Find people in the pool/);
  });

  it("carries level, function and scope when the mandate knows them", () => {
    const q = buildPoolQuery(FULL)!;
    expect(q).toContain("Director");
    expect(q).toContain("Technology");
    expect(q).toContain("settlement and reconciliation");
  });

  it("names only the three heaviest dimensions, heaviest first", () => {
    const q = buildPoolQuery(FULL)!;
    expect(q).toContain("Weighted most heavily on: technical, domain, leadership.");
    // The tail of the weighting is noise for a retrieval question.
    expect(q).not.toContain("regulatory");
  });

  it("includes an approved custom dimension and never a proposed one", () => {
    // §196: a proposed dimension scores nothing, so it must not steer
    // retrieval either — the same rule parse-cv applies to its prompt.
    const q = buildPoolQuery({
      ...FULL,
      custom_dimensions: [
        {
          key: "fx_options_market_making",
          label: "FX options market making",
          definition: "…",
          rationale: "…",
          weight: 8,
          status: "approved",
          origin: "agent",
        },
        {
          key: "prime_brokerage",
          label: "Prime brokerage",
          definition: "…",
          rationale: "…",
          weight: 7,
          status: "proposed",
          origin: "agent",
        },
      ],
    })!;
    expect(q).toContain("FX options market making");
    expect(q).not.toContain("Prime brokerage");
  });

  it("says so when the mandate is still missing intake answers", () => {
    const q = buildPoolQuery({
      ...FULL,
      missing_information: ["What does the desk actually trade?"],
    })!;
    expect(q).toContain("incomplete");
    // …and never the question's own text: the query is sent to a model
    // that would try to answer it.
    expect(q).not.toContain("What does the desk actually trade?");
  });

  it("stays one paragraph — it is a query, not a rubric", () => {
    expect(buildPoolQuery(FULL)).not.toContain("\n");
  });
});
