import { describe, expect, it } from "vitest";
import {
  billedInPeriod,
  dueDate,
  expandFeeLines,
  feeBasisAmount,
  formatMoney,
  guaranteeState,
  pipelineValue,
  quarterOf,
  recentQuarters,
  resolveTerms,
  roundMoney,
  totalFee,
} from "./compute";
import {
  DEFAULT_RETAINER_PLAN,
  parseInstalmentPlan,
  type FeeLineRow,
  type FeeTermsRow,
} from "./types";

/** A fee-terms row with the columns these tests care about. */
function terms(overrides: Partial<FeeTermsRow> = {}): FeeTermsRow {
  return {
    id: "terms-1",
    organization_id: "org-1",
    client_id: "client-1",
    project_id: null,
    fee_model: "contingent",
    fee_percentage: 25,
    fixed_fee_amount: null,
    currency: "USD",
    fee_basis: "total_first_year_cash",
    guarantee_days: 90,
    payment_terms_days: 30,
    instalment_plan: [],
    notes: null,
    created_by: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function line(overrides: Partial<FeeLineRow> = {}): FeeLineRow {
  return {
    id: "line-1",
    organization_id: "org-1",
    placement_id: "placement-1",
    placement_fee_id: "fee-1",
    kind: "instalment",
    label: "Placement fee",
    sequence: 1,
    trigger: "start_date",
    amount: 1000,
    currency: "USD",
    base_currency: "USD",
    fx_rate: 1,
    base_amount: 1000,
    status: "earned",
    earned_on: "2026-02-15",
    due_on: "2026-03-17",
    reason: null,
    reverses_line_id: null,
    created_by: null,
    created_at: "2026-02-15T00:00:00Z",
    updated_at: "2026-02-15T00:00:00Z",
    ...overrides,
  };
}

describe("roundMoney", () => {
  it("rounds to cents", () => {
    expect(roundMoney(1234.567)).toBe(1234.57);
    expect(roundMoney(1234.564)).toBe(1234.56);
  });

  /**
   * The reason this is not `Math.round`. Reversals are negative in this
   * schema, and `Math.round` breaks ties towards positive infinity — so a
   * -0.005 clawback and the +0.005 it reverses would not cancel.
   */
  it("rounds halves away from zero, symmetrically", () => {
    expect(roundMoney(0.005)).toBe(0.01);
    expect(roundMoney(-0.005)).toBe(-0.01);
    expect(roundMoney(0.005) + roundMoney(-0.005)).toBe(0);
  });

  it("survives the classic float case", () => {
    expect(roundMoney(1.005)).toBe(1.01);
  });
});

describe("feeBasisAmount", () => {
  const pkg = { base_salary: 200_000, guaranteed_bonus: 50_000, other_cash: 10_000 };

  it("uses base alone when the basis is base salary", () => {
    expect(feeBasisAmount(pkg, "base_salary")).toBe(200_000);
  });

  it("sums the cash components for total first-year cash", () => {
    expect(feeBasisAmount(pkg, "total_first_year_cash")).toBe(260_000);
  });

  it("treats missing components as zero rather than as unknown", () => {
    expect(
      feeBasisAmount(
        { base_salary: 200_000, guaranteed_bonus: null, other_cash: null },
        "total_first_year_cash"
      )
    ).toBe(200_000);
  });
});

describe("resolveTerms", () => {
  const client = terms({ id: "client-terms", fee_percentage: 25 });
  const mandate = terms({
    id: "mandate-terms",
    client_id: null,
    project_id: "project-1",
    fee_percentage: 30,
  });

  it("prefers the mandate override over the client agreement", () => {
    const resolved = resolveTerms(client, mandate);
    expect(resolved?.fee_percentage).toBe(30);
    expect(resolved?.source).toBe("mandate");
    expect(resolved?.fee_terms_id).toBe("mandate-terms");
  });

  it("falls back to the client agreement", () => {
    const resolved = resolveTerms(client, null);
    expect(resolved?.fee_percentage).toBe(25);
    expect(resolved?.source).toBe("client");
  });

  /** Not an error — see the note on the function. */
  it("returns null when there is no agreement anywhere", () => {
    expect(resolveTerms(null, null)).toBeNull();
  });
});

describe("totalFee", () => {
  const pkg = { base_salary: 200_000, guaranteed_bonus: 50_000, other_cash: null };

  it("multiplies percentage by the basis", () => {
    expect(
      totalFee(
        {
          fee_model: "contingent",
          fee_percentage: 25,
          fixed_fee_amount: null,
          fee_basis: "total_first_year_cash",
        },
        pkg
      )
    ).toBe(62_500);
  });

  it("ignores the package entirely for a fixed fee", () => {
    expect(
      totalFee(
        {
          fee_model: "fixed",
          fee_percentage: null,
          fixed_fee_amount: 40_000,
          fee_basis: "total_first_year_cash",
        },
        { base_salary: null, guaranteed_bonus: null, other_cash: null }
      )
    ).toBe(40_000);
  });

  /**
   * A fee of zero and a fee that cannot be computed are different things,
   * and only one of them belongs in the ledger.
   */
  it("returns null rather than zero when the inputs are missing", () => {
    const noPercentage = totalFee(
      {
        fee_model: "contingent",
        fee_percentage: null,
        fixed_fee_amount: null,
        fee_basis: "base_salary",
      },
      pkg
    );
    const noSalary = totalFee(
      {
        fee_model: "contingent",
        fee_percentage: 25,
        fixed_fee_amount: null,
        fee_basis: "base_salary",
      },
      { base_salary: null, guaranteed_bonus: null, other_cash: null }
    );

    expect(noPercentage).toBeNull();
    expect(noSalary).toBeNull();
  });
});

describe("expandFeeLines", () => {
  it("makes one line for a contingent fee, earned on the start date", () => {
    const lines = expandFeeLines({ fee_model: "contingent", instalment_plan: [] }, 62_500);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ amount: 62_500, trigger: "start_date", sequence: 1 });
  });

  it("expands a retainer into its plan", () => {
    const lines = expandFeeLines(
      { fee_model: "retained", instalment_plan: DEFAULT_RETAINER_PLAN },
      100_000
    );
    expect(lines.map((l) => l.amount)).toEqual([33_333, 33_333, 33_334]);
    expect(lines.map((l) => l.trigger)).toEqual(["engagement", "shortlist", "start_date"]);
    expect(lines.map((l) => l.label)).toEqual(["Engagement", "Shortlist", "Completion"]);
  });

  /**
   * The stated percentages are what bill. 33.333% of 90,000 is 29,999.70
   * and not 30,000 — the remainder rule closes the rounding gap on the
   * last line, it does not silently even the instalments out.
   */
  it("bills the percentages as written rather than evening them up", () => {
    const lines = expandFeeLines(
      { fee_model: "retained", instalment_plan: DEFAULT_RETAINER_PLAN },
      90_000
    );
    expect(lines.map((l) => l.amount)).toEqual([29_999.7, 29_999.7, 30_000.6]);
    expect(roundMoney(lines.reduce((acc, l) => acc + l.amount, 0))).toBe(90_000);
  });

  /**
   * The reason the last instalment is computed as a remainder rather than
   * as its own percentage. Three thirds of 100,000 at 33.333 / 33.333 /
   * 33.334 come to 99,999.90 if each is rounded independently.
   */
  it("gives the rounding remainder to the last instalment so the plan sums exactly", () => {
    const total = 100_000;
    const lines = expandFeeLines(
      { fee_model: "retained", instalment_plan: DEFAULT_RETAINER_PLAN },
      total
    );
    const sum = lines.reduce((acc, l) => acc + l.amount, 0);
    expect(roundMoney(sum)).toBe(total);
    expect(lines[2].amount).not.toBe(lines[0].amount);
  });

  it("sums exactly on an awkward total too", () => {
    const total = 83_333.33;
    const lines = expandFeeLines(
      { fee_model: "retained", instalment_plan: DEFAULT_RETAINER_PLAN },
      total
    );
    expect(roundMoney(lines.reduce((acc, l) => acc + l.amount, 0))).toBe(total);
  });

  /** A retainer with no plan is a contingent fee wearing a different name. */
  it("falls back to a single line when a retainer has no plan", () => {
    const lines = expandFeeLines({ fee_model: "retained", instalment_plan: [] }, 50_000);
    expect(lines).toHaveLength(1);
    expect(lines[0].amount).toBe(50_000);
  });
});

describe("guaranteeState", () => {
  it("is running inside the window and cleared on or after the end date", () => {
    const started = { status: "started" as const, guarantee_ends_on: "2026-06-01" };
    expect(guaranteeState(started, "2026-05-31")).toBe("running");
    expect(guaranteeState(started, "2026-06-01")).toBe("cleared");
    expect(guaranteeState(started, "2026-07-01")).toBe("cleared");
  });

  it("is broken once the placement fell through, whatever the dates say", () => {
    expect(
      guaranteeState({ status: "fell_through", guarantee_ends_on: "2026-06-01" }, "2026-05-01")
    ).toBe("broken");
  });

  it("is none before the candidate has started", () => {
    expect(guaranteeState({ status: "accepted", guarantee_ends_on: null }, "2026-05-01")).toBe(
      "none"
    );
    expect(guaranteeState({ status: "offered", guarantee_ends_on: null }, "2026-05-01")).toBe(
      "none"
    );
  });
});

describe("dueDate", () => {
  it("adds the payment terms", () => {
    expect(dueDate("2026-03-28", 30)).toBe("2026-04-27");
  });

  it("crosses a month and a leap day without drifting", () => {
    expect(dueDate("2028-02-28", 1)).toBe("2028-02-29");
    expect(dueDate("2026-12-31", 30)).toBe("2027-01-30");
  });
});

describe("quarterOf", () => {
  it("brackets each quarter half-open", () => {
    expect(quarterOf("2026-02-15")).toEqual({
      from: "2026-01-01",
      to: "2026-04-01",
      label: "Q1 2026",
    });
    expect(quarterOf("2026-12-31")).toEqual({
      from: "2026-10-01",
      to: "2027-01-01",
      label: "Q4 2026",
    });
  });

  /**
   * The boundary that matters: no date belongs to two quarters, which is
   * what stops four quarters summing to more than the year.
   */
  it("puts a boundary date in exactly one quarter", () => {
    const q1 = quarterOf("2026-03-31");
    const q2 = quarterOf("2026-04-01");
    expect(q1.label).toBe("Q1 2026");
    expect(q2.label).toBe("Q2 2026");
    expect(q1.to).toBe(q2.from);
  });
});

describe("recentQuarters", () => {
  it("returns n quarters oldest first, ending with the current one", () => {
    expect(recentQuarters("2026-08-13", 4).map((q) => q.label)).toEqual([
      "Q4 2025",
      "Q1 2026",
      "Q2 2026",
      "Q3 2026",
    ]);
  });

  it("walks back across a year boundary", () => {
    expect(recentQuarters("2026-01-15", 2).map((q) => q.label)).toEqual(["Q4 2025", "Q1 2026"]);
  });
});

describe("billedInPeriod — the acceptance test", () => {
  const q1 = quarterOf("2026-02-15");

  it("sums earned lines inside the period", () => {
    const total = billedInPeriod(
      [
        line({ id: "a", base_amount: 30_000, earned_on: "2026-01-10" }),
        line({ id: "b", base_amount: 25_000, earned_on: "2026-03-31" }),
      ],
      q1
    );
    expect(total).toBe(55_000);
  });

  it("excludes pending and cancelled lines", () => {
    const total = billedInPeriod(
      [
        line({ id: "a", base_amount: 30_000, earned_on: "2026-01-10" }),
        line({ id: "b", base_amount: 25_000, earned_on: null, status: "pending" }),
        line({ id: "c", base_amount: 25_000, earned_on: "2026-02-01", status: "cancelled" }),
      ],
      q1
    );
    expect(total).toBe(30_000);
  });

  it("excludes lines from neighbouring quarters", () => {
    const total = billedInPeriod(
      [
        line({ id: "a", base_amount: 10_000, earned_on: "2025-12-31" }),
        line({ id: "b", base_amount: 20_000, earned_on: "2026-02-01" }),
        line({ id: "c", base_amount: 40_000, earned_on: "2026-04-01" }),
      ],
      q1
    );
    expect(total).toBe(20_000);
  });

  /**
   * The whole point of booking a clawback as a negative line rather than
   * editing the original: Q1 still reports what Q1 billed, and the
   * reversal lands in the quarter it happened.
   */
  it("subtracts a reversal from the quarter it happened in, not the one it was booked in", () => {
    const lines = [
      line({ id: "fee", base_amount: 60_000, earned_on: "2026-02-01" }),
      line({
        id: "clawback",
        kind: "reversal",
        base_amount: -60_000,
        amount: -60_000,
        earned_on: "2026-05-20",
        reverses_line_id: "fee",
        reason: "Left inside guarantee",
      }),
    ];

    expect(billedInPeriod(lines, quarterOf("2026-02-15"))).toBe(60_000);
    expect(billedInPeriod(lines, quarterOf("2026-05-20"))).toBe(-60_000);
  });

  it("sums a multi-currency book in base currency at the booked rates", () => {
    const lines = [
      line({ id: "usd", currency: "USD", base_amount: 50_000, earned_on: "2026-01-15" }),
      line({
        id: "gbp",
        currency: "GBP",
        base_currency: "USD",
        amount: 40_000,
        fx_rate: 1.25,
        base_amount: 50_000,
        earned_on: "2026-02-15",
      }),
    ];
    expect(billedInPeriod(lines, q1)).toBe(100_000);
  });
});

describe("pipelineValue", () => {
  it("counts only what is not yet earned", () => {
    expect(
      pipelineValue([
        line({ id: "a", base_amount: 30_000, status: "earned" }),
        line({ id: "b", base_amount: 20_000, status: "pending", earned_on: null }),
        line({ id: "c", base_amount: 10_000, status: "cancelled", earned_on: null }),
      ])
    ).toBe(20_000);
  });
});

describe("formatMoney", () => {
  it("formats a known currency", () => {
    expect(formatMoney(62_500, "USD")).toContain("62,500");
  });

  /** An unrecognised ISO code should print the number, not take out a page. */
  it("degrades rather than throwing on an unknown code", () => {
    expect(formatMoney(1000, "XYZ")).toContain("1,000");
  });
});

describe("parseInstalmentPlan", () => {
  it("accepts the default retainer split", () => {
    expect(parseInstalmentPlan(DEFAULT_RETAINER_PLAN)).toHaveLength(3);
  });

  it("rejects a plan that does not sum to 100", () => {
    expect(
      parseInstalmentPlan([{ label: "Half", trigger: "engagement", percent_of_fee: 50 }])
    ).toEqual([]);
  });

  it("rejects malformed entries rather than dropping them silently", () => {
    expect(
      parseInstalmentPlan([
        { label: "", trigger: "engagement", percent_of_fee: 100 },
      ])
    ).toEqual([]);
    expect(
      parseInstalmentPlan([{ label: "X", trigger: "nope", percent_of_fee: 100 }])
    ).toEqual([]);
    expect(parseInstalmentPlan({ not: "an array" })).toEqual([]);
    expect(parseInstalmentPlan(null)).toEqual([]);
  });

  it("treats an empty plan as valid — it is the contingent case", () => {
    expect(parseInstalmentPlan([])).toEqual([]);
  });
});
