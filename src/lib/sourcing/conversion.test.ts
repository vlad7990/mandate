import { describe, expect, test } from "vitest";
import type { PipelineStage } from "@/lib/ai/cv-parsing";
import {
  canShowRate,
  computeLineageConversion,
  formatRate,
  isTerminal,
  MIN_LINKED_CANDIDATES,
  MIN_TERMINAL_OUTCOMES,
  suppressionLabel,
} from "./conversion";

/** n candidates at a stage. */
function at(stage: PipelineStage | null, n: number) {
  return Array.from({ length: n }, () => ({ pipeline_stage: stage }));
}

describe("terminal stages", () => {
  test("hired and rejected end a journey", () => {
    expect(isTerminal("hired")).toBe(true);
    expect(isTerminal("rejected")).toBe(true);
  });

  test("offer is NOT terminal", () => {
    // An offer can still be declined. Counting it as a win inflates any
    // strategy that reaches offer and fails to close — the exact distinction
    // a sourcing lead needs to be able to see.
    expect(isTerminal("offer")).toBe(false);
    expect(isTerminal("finalist")).toBe(false);
    expect(isTerminal("interviewed")).toBe(false);
    expect(isTerminal("found")).toBe(false);
  });
});

describe("the guard", () => {
  test("withholds a rate on a tiny sample even when it looks spectacular", () => {
    // 2 hires, 0 rejections. A naive read is "100% conversion, best strategy
    // we have". This is the number the guard exists to refuse.
    const c = computeLineageConversion({ candidates: at("hired", 2) });
    expect(c.hired).toBe(2);
    expect(c.hire_rate).toBeNull();
    expect(c.suppressed).toBe("too_few_linked");
  });

  test("withholds when there are plenty of candidates but almost no outcomes", () => {
    const c = computeLineageConversion({
      candidates: [...at("interviewed", 39), ...at("hired", 1)],
    });
    expect(c.linked).toBe(40);
    expect(c.terminal).toBe(1);
    expect(c.hire_rate).toBeNull();
    expect(c.suppressed).toBe("too_few_terminal");
  });

  test("requires BOTH conditions, not either", () => {
    expect(canShowRate(MIN_LINKED_CANDIDATES, MIN_TERMINAL_OUTCOMES - 1)).toBe(false);
    expect(canShowRate(MIN_LINKED_CANDIDATES - 1, MIN_TERMINAL_OUTCOMES)).toBe(false);
    expect(canShowRate(MIN_LINKED_CANDIDATES, MIN_TERMINAL_OUTCOMES)).toBe(true);
  });

  test("releases the rate exactly at the threshold, not before", () => {
    const justUnder = computeLineageConversion({
      candidates: [...at("hired", 2), ...at("interviewed", 17)],
    });
    expect(justUnder.linked).toBe(19);
    expect(justUnder.hire_rate).toBeNull();

    const justOver = computeLineageConversion({
      candidates: [...at("hired", 2), ...at("rejected", 1), ...at("interviewed", 17)],
    });
    expect(justOver.linked).toBe(20);
    expect(justOver.terminal).toBe(3);
    expect(justOver.hire_rate).toBeCloseTo(2 / 3);
    expect(justOver.suppressed).toBeNull();
  });

  test("an empty lineage is suppressed, not a division by zero", () => {
    const c = computeLineageConversion({ candidates: [] });
    expect(c).toMatchObject({
      linked: 0,
      terminal: 0,
      hired: 0,
      in_flight: 0,
      hire_rate: null,
      suppressed: "too_few_linked",
    });
    expect(Number.isNaN(c.hire_rate as unknown as number)).toBe(false);
  });
});

describe("the rate itself", () => {
  test("divides by finished candidates, not by everyone linked", () => {
    // 5 hired, 5 rejected, 30 still moving. Hires per FINISHED candidate is
    // 50%. Dividing by all 40 would report 12.5% and punish the lineage for
    // having a lot of people still in flight.
    const c = computeLineageConversion({
      candidates: [...at("hired", 5), ...at("rejected", 5), ...at("interviewed", 30)],
    });
    expect(c.in_flight).toBe(30);
    expect(c.hire_rate).toBeCloseTo(0.5);
  });

  test("a candidate with no stage recorded counts as linked but not finished", () => {
    const c = computeLineageConversion({
      candidates: [...at(null, 20), ...at("hired", 3)],
    });
    expect(c.linked).toBe(23);
    expect(c.terminal).toBe(3);
    expect(c.in_flight).toBe(20);
  });

  test("formats as a whole percentage", () => {
    expect(formatRate(0.5)).toBe("50%");
    expect(formatRate(2 / 3)).toBe("67%");
    expect(formatRate(0)).toBe("0%");
    expect(formatRate(1)).toBe("100%");
  });
});

describe("suppression label", () => {
  test("names the binding constraint and the distance to it", () => {
    // "Not enough data" is unactionable. Needing candidates and needing
    // outcomes are different waits, and the recruiter can act on which.
    const fewLinked = computeLineageConversion({ candidates: at("hired", 2) });
    expect(suppressionLabel(fewLinked)).toBe(
      "Too early to compare — 18 more candidates needed"
    );

    const fewOutcomes = computeLineageConversion({
      candidates: [...at("hired", 1), ...at("interviewed", 24)],
    });
    expect(suppressionLabel(fewOutcomes)).toBe(
      "Too early to compare — 2 more outcomes needed"
    );
  });

  test("singularises when exactly one short", () => {
    const c = computeLineageConversion({
      candidates: [...at("hired", 1), ...at("rejected", 1), ...at("interviewed", 30)],
    });
    expect(suppressionLabel(c)).toBe("Too early to compare — 1 more outcome needed");
  });

  test("says nothing once a rate is shown", () => {
    const c = computeLineageConversion({
      candidates: [...at("hired", 3), ...at("rejected", 3), ...at("interviewed", 20)],
    });
    expect(c.hire_rate).not.toBeNull();
    expect(suppressionLabel(c)).toBeNull();
  });
});

describe("the scenario the guard was written for", () => {
  test("two strategies, one lucky, neither comparable", () => {
    // Strategy B looks 3x better. Both are noise, and the product must refuse
    // to rank them rather than render the comparison in smaller type.
    const a = computeLineageConversion({
      candidates: [...at("hired", 1), ...at("rejected", 2), ...at("interviewed", 5)],
    });
    const b = computeLineageConversion({
      candidates: [...at("hired", 3), ...at("rejected", 2), ...at("interviewed", 4)],
    });

    expect(a.hire_rate).toBeNull();
    expect(b.hire_rate).toBeNull();
    expect(a.suppressed).toBe("too_few_linked");
    expect(b.suppressed).toBe("too_few_linked");

    // The counts remain visible — withholding the ratio is not hiding the data.
    expect(a.hired).toBe(1);
    expect(b.hired).toBe(3);
  });
});
