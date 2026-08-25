import { describe, expect, it } from "vitest";
import {
  computeEvidenceCoverage,
  unresolvedDimensions,
} from "./evidence-coverage";

describe("computeEvidenceCoverage", () => {
  it("returns all five dimensions unknown for an empty CV", () => {
    const coverage = computeEvidenceCoverage(null);
    expect(coverage).toHaveLength(5);
    expect(coverage.every((c) => c.status === "unknown")).toBe(true);
    expect(unresolvedDimensions(coverage)).toHaveLength(5);
  });

  it("reads the raw evidence fields per dimension", () => {
    const coverage = computeEvidenceCoverage({
      roles: [{ title: "VP Engineering", summary: "Led the SOX compliance programme" }],
      domain: "Reinsurance",
      scale: "Org of 60 engineers",
      tech_exposure: ["Kubernetes", "Terraform", "Postgres", "Kafka"],
      transformation_experience: ["Post-merger platform consolidation"],
    });
    const byDim = Object.fromEntries(coverage.map((c) => [c.dimension, c]));
    expect(byDim.technical.status).toBe("strong");
    expect(byDim.technical.source).toBe("tech_exposure");
    expect(byDim.domain.status).toBe("strong");
    expect(byDim.leadership.status).toBe("strong");
    expect(byDim.leadership.evidence).toBe("VP Engineering");
    expect(byDim.regulatory.status).toBe("partial");
    expect(byDim.regulatory.source).toBe("roles");
    expect(byDim.transformation.status).toBe("strong");
    expect(unresolvedDimensions(coverage)).toEqual(["regulatory"]);
  });

  it("grades thin evidence as partial, never strong", () => {
    const coverage = computeEvidenceCoverage({
      tech_exposure: ["Excel"],
      scale: "team of 4",
      archetype: "Transformer",
    });
    const byDim = Object.fromEntries(coverage.map((c) => [c.dimension, c]));
    expect(byDim.technical.status).toBe("partial");
    expect(byDim.leadership.status).toBe("partial");
    expect(byDim.leadership.source).toBe("scale");
    expect(byDim.transformation.status).toBe("partial");
    expect(byDim.transformation.source).toBe("archetype");
    expect(byDim.domain.status).toBe("unknown");
  });

  it("never reads the score-shaped fit_dimensions", () => {
    const coverage = computeEvidenceCoverage({
      fit_dimensions: {
        technical: 10,
        domain: 10,
        leadership: 10,
        regulatory: 10,
        transformation: 10,
      },
    });
    expect(coverage.every((c) => c.status === "unknown")).toBe(true);
  });
});
