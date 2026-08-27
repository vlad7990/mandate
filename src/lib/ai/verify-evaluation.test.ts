import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  isNegativeVerdict,
  SECOND_OPINION_SCHEMA,
  VERIFY_EVALUATION_SYSTEM_PROMPT,
} from "./verify-evaluation";

/**
 * §182 slice R — the refuter's contract.
 *
 * R.1 is a cost AND coverage ruling at once: the refuter runs on exactly
 * the verdicts that silently cost a placement and that nobody audits.
 * The truth table below is that ruling written down — if someone widens
 * or narrows the trigger, this fails and the change has to argue its
 * case in a gate.
 */

function verdict(tier: string, recommendation: string) {
  return {
    final_verdict: { tier, narrative: "" },
    recommendation,
  } as Parameters<typeof isNegativeVerdict>[0];
}

describe("the refuter's trigger (§182 R.1)", () => {
  it("runs on tier_3, tier_4, and do_not_include", () => {
    expect(isNegativeVerdict(verdict("tier_3", "secondary"))).toBe(true);
    expect(isNegativeVerdict(verdict("tier_4", "secondary"))).toBe(true);
    expect(isNegativeVerdict(verdict("tier_1", "do_not_include"))).toBe(true);
  });

  it("does NOT run on positive verdicts — reality audits those", () => {
    expect(isNegativeVerdict(verdict("tier_1", "primary"))).toBe(false);
    expect(isNegativeVerdict(verdict("tier_2", "secondary"))).toBe(false);
  });
});

describe("the refuter's independence (§182 R.2/R.3)", () => {
  it("never receives the org's skills", () => {
    // The one structural difference from every other judgment seam. The
    // org's skills steer the evaluator; steering the skeptic with the
    // same instructions would correlate their errors — precisely the
    // failure this seam exists to break. Source-text, because the
    // import IS the seam.
    const source = fs.readFileSync(
      path.join(__dirname, "verify-evaluation.ts"),
      "utf8"
    );
    expect(source).not.toContain("skill-injector");
    expect(source).not.toContain("applySkillsToPrompt");
  });

  it("is charged to refute, not to re-evaluate", () => {
    expect(VERIFY_EVALUATION_SYSTEM_PROMPT).toMatch(/try to REFUTE/);
    expect(VERIFY_EVALUATION_SYSTEM_PROMPT).toMatch(
      /not re-evaluating the candidate/
    );
    // The §176-adjacent rule, present here too: the strongest ground is
    // the verdict confusing "not evidenced" with "lacks".
    expect(VERIFY_EVALUATION_SYSTEM_PROMPT).toMatch(
      /"the CV does not evidence X" from "the candidate lacks X"/
    );
  });

  it("requires all three output fields", () => {
    expect(SECOND_OPINION_SCHEMA.required).toEqual([
      "agrees",
      "counter_argument",
      "underweighted_evidence",
    ]);
    expect(SECOND_OPINION_SCHEMA.additionalProperties).toBe(false);
  });
});
