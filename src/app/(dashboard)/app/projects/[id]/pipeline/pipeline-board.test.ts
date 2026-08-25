import { describe, expect, it } from "vitest";
import { PIPELINE_STAGES } from "@/lib/ai/cv-parsing";
import { STAGE_ACCENTS } from "./stage-accents";

describe("pipeline board", () => {
  it("styles every pipeline stage the schema allows, and no others", () => {
    // The columns are PIPELINE_STAGES; the accents are a parallel record.
    // A stage added to the CHECK constraint without a column accent would
    // otherwise render as an undefined class at runtime, which nothing
    // reports.
    expect(Object.keys(STAGE_ACCENTS).sort()).toEqual(
      [...PIPELINE_STAGES].sort()
    );
  });
});
