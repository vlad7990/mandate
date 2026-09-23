import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { calibrationForPrompt } from "./custom-dimensions";
import type { CustomDimension } from "@/lib/ai/onboarding-analysis";

const ROOT = path.resolve(__dirname, "../../..");

function dim(over: Partial<CustomDimension> = {}): CustomDimension {
  return {
    key: "fx_options",
    label: "FX options market-making depth",
    definition: "A 10 has run an options book.",
    rationale: "THE AGENT'S PRIVATE ARGUMENT FOR THIS AXIS",
    weight: 7,
    status: "approved",
    origin: "agent",
    ...over,
  };
}

describe("calibrationForPrompt — what an agent may be told", () => {
  it("drops PROPOSED axes entirely", () => {
    const out = calibrationForPrompt({
      custom_dimensions: [
        dim({ key: "approved_one", status: "approved" }),
        dim({ key: "proposed_one", status: "proposed" }),
      ],
    });
    const keys = (out!.custom_dimensions as Array<{ key: string }>).map(
      (d) => d.key
    );
    expect(keys).toEqual(["approved_one"]);
  });

  it("strips `rationale` even from an approved axis", () => {
    const out = calibrationForPrompt({ custom_dimensions: [dim()] });
    const serialised = JSON.stringify(out);
    expect(serialised).not.toContain("PRIVATE ARGUMENT");
    expect(serialised).not.toContain("rationale");
  });

  it("keeps what the model actually needs to judge against", () => {
    const out = calibrationForPrompt({ custom_dimensions: [dim()] });
    const [axis] = out!.custom_dimensions as Array<Record<string, unknown>>;
    expect(axis.key).toBe("fx_options");
    expect(axis.label).toBe("FX options market-making depth");
    expect(axis.definition).toBe("A 10 has run an options book.");
    expect(axis.weight).toBe(7);
  });

  it("leaves the rest of the calibration untouched", () => {
    const out = calibrationForPrompt({
      role_title: "MD FX",
      dimension_weights: { technical: 7 },
      custom_dimensions: [],
    } as Record<string, unknown>);
    expect(out).toMatchObject({
      role_title: "MD FX",
      dimension_weights: { technical: 7 },
    });
  });

  it("passes null through", () => {
    expect(calibrationForPrompt(null)).toBeNull();
    expect(calibrationForPrompt(undefined)).toBeNull();
  });

  it("normalises a mandate with no custom axes to an empty list", () => {
    expect(
      calibrationForPrompt({} as { custom_dimensions?: unknown })!
        .custom_dimensions
    ).toEqual([]);
  });
});

/**
 * Source-text guard. It only guards source text — see
 * [[source-text-guards]] — so it is paired with the behavioural tests
 * above rather than trusted alone. What it catches is the regression
 * that behaviour cannot: a NEW seam, or an edited old one, serialising
 * `project.calibration_model` straight into a prompt and carrying an
 * unapproved axis plus the agent's rationale into something a client
 * reads.
 */
describe("no client-facing seam serialises the raw calibration model", () => {
  // The copilot is the deliberate exception and says so in its own
  // comment: it answers the RECRUITER, for whom a pending proposal and
  // the argument for it is the point, not a leak.
  const EXEMPT = new Set(["copilot-context.ts"]);

  const SEAMS = [
    "generate-evaluation.ts",
    "generate-comparison.ts",
    "generate-shortlist-report.ts",
    "run-positioning.ts",
  ];

  it("every listed seam narrows before prompting", () => {
    const offenders: string[] = [];
    for (const file of SEAMS) {
      const full = path.join(ROOT, "src/lib/ai", file);
      // Import lines out FIRST. The first draft of this guard checked
      // `src.includes("calibrationForPrompt")` and passed happily with
      // every call site removed, because the import was still there —
      // a guard that proves only that a symbol was once imported.
      // Mutation-testing is what caught it.
      const body = fs
        .readFileSync(full, "utf8")
        .split("\n")
        .filter((line) => !/^\s*(import|\s*calibrationForPrompt,)/.test(line))
        .join("\n");
      if (!body.includes("calibrationForPrompt(")) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the seam list still matches the files on disk", () => {
    // Guards the guard: a renamed seam would otherwise make the check
    // above pass by checking nothing.
    for (const file of [...SEAMS, ...EXEMPT]) {
      expect(fs.existsSync(path.join(ROOT, "src/lib/ai", file))).toBe(true);
    }
  });
});
