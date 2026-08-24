import { describe, expect, it } from "vitest";
import { overrideFor } from "./hm-override";

const TWO = [
  { name: "Marta Ellingsen" },
  { name: "Priya Raghunathan" },
];

describe("overrideFor — the D3 rule", () => {
  it("returns undefined for the default (first) stakeholder", () => {
    // The trail's stakeholder_override:false face — the default run
    // must not wear the override flag just because a selector exists.
    expect(overrideFor("Marta Ellingsen", TWO)).toBeUndefined();
  });

  it("matches the default the way the seam matches — trimmed, case-insensitive", () => {
    expect(overrideFor("  marta ellingsen  ", TWO)).toBeUndefined();
  });

  it("returns the name when the selection differs from the default", () => {
    expect(overrideFor("Priya Raghunathan", TWO)).toBe("Priya Raghunathan");
  });

  it("returns undefined when there is nothing to choose from", () => {
    expect(overrideFor("Anyone", [])).toBeUndefined();
    expect(overrideFor(null, TWO)).toBeUndefined();
    expect(overrideFor("", TWO)).toBeUndefined();
  });

  it("passes an off-list selection through — refusing it is the server's job", () => {
    // The seam answers with its authored "not found" sentence; the
    // client must not silently swallow a stale selection.
    expect(overrideFor("Renamed Person", TWO)).toBe("Renamed Person");
  });
});
