import { describe, expect, it } from "vitest";
import {
  approvedCustomDimensions,
  buildManualDimension,
  customDimensionsOf,
  isValidCustomKey,
  mergeProposals,
  normaliseCustomDimensions,
} from "./custom-dimensions";
import {
  CUSTOM_DEFINITION_MAX,
  CUSTOM_DIMENSIONS_MAX,
  CUSTOM_LABEL_MAX,
  type CustomDimension,
  type CustomDimensionProposal,
} from "@/lib/ai/onboarding-analysis";

function dim(over: Partial<CustomDimension> = {}): CustomDimension {
  return {
    key: "fx_options",
    label: "FX options market-making depth",
    definition: "A 10 has run an options book; a 0 has never priced one.",
    rationale: "The mandate is an FX MD with P&L ownership.",
    weight: 7,
    status: "proposed",
    origin: "agent",
    ...over,
  };
}

function proposal(
  over: Partial<CustomDimensionProposal> = {}
): CustomDimensionProposal {
  return {
    key: "fx_options",
    label: "FX options market-making depth",
    definition: "A 10 has run an options book; a 0 has never priced one.",
    rationale: "The mandate is an FX MD with P&L ownership.",
    weight: 7,
    ...over,
  };
}

describe("isValidCustomKey", () => {
  it("accepts a lower_snake_case slug", () => {
    expect(isValidCustomKey("fx_options_market_making")).toBe(true);
  });

  it("rejects the five core names — a custom 'domain' would shadow the column", () => {
    for (const core of [
      "technical",
      "domain",
      "leadership",
      "regulatory",
      "transformation",
    ]) {
      expect(isValidCustomKey(core)).toBe(false);
    }
  });

  it("rejects shapes that can't be a stable key", () => {
    expect(isValidCustomKey("")).toBe(false);
    expect(isValidCustomKey("9lives")).toBe(false);
    expect(isValidCustomKey("Has Capitals")).toBe(false);
    expect(isValidCustomKey("has-hyphens")).toBe(false);
    expect(isValidCustomKey("x")).toBe(false); // under the 2-char floor
    expect(isValidCustomKey(null)).toBe(false);
    expect(isValidCustomKey(42)).toBe(false);
  });
});

describe("normaliseCustomDimensions", () => {
  it("returns empty for everything that isn't an array", () => {
    expect(normaliseCustomDimensions(undefined)).toEqual([]);
    expect(normaliseCustomDimensions(null)).toEqual([]);
    expect(normaliseCustomDimensions({})).toEqual([]);
    expect(normaliseCustomDimensions("nope")).toEqual([]);
  });

  it("drops entries that cannot be scored against", () => {
    const out = normaliseCustomDimensions([
      dim({ key: "ok_one" }),
      dim({ key: "no_label", label: "" }),
      dim({ key: "no_definition", definition: "   " }),
      dim({ key: "domain" }), // core collision
      "garbage",
      null,
    ]);
    expect(out.map((d) => d.key)).toEqual(["ok_one"]);
  });

  it("deduplicates on key, first wins", () => {
    const out = normaliseCustomDimensions([
      dim({ key: "dupe", weight: 3 }),
      dim({ key: "dupe", weight: 9 }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].weight).toBe(3);
  });

  it("enforces the cap", () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      dim({ key: `axis_${i}` })
    );
    expect(normaliseCustomDimensions(many)).toHaveLength(CUSTOM_DIMENSIONS_MAX);
  });

  it("clamps the weight to 0-10 integers", () => {
    expect(normaliseCustomDimensions([dim({ weight: 99 })])[0].weight).toBe(10);
    expect(normaliseCustomDimensions([dim({ weight: -4 })])[0].weight).toBe(0);
    expect(normaliseCustomDimensions([dim({ weight: 6.7 })])[0].weight).toBe(7);
    expect(
      normaliseCustomDimensions([
        dim({ weight: "8" as unknown as number }),
      ])[0].weight
    ).toBe(0);
  });

  it("FAILS CLOSED on an unreadable status — anything but the literal is proposed", () => {
    for (const status of [undefined, null, "", "Approved", "APPROVED", 1, {}]) {
      const out = normaliseCustomDimensions([
        { ...dim(), status: status as never },
      ]);
      expect(out[0].status).toBe("proposed");
    }
    // Only the exact literal approves.
    expect(
      normaliseCustomDimensions([dim({ status: "approved" })])[0].status
    ).toBe("approved");
  });
});

describe("approvedCustomDimensions", () => {
  it("is the only gate: proposed dimensions never score", () => {
    const out = approvedCustomDimensions({
      custom_dimensions: [
        dim({ key: "scores", status: "approved" }),
        dim({ key: "does_not", status: "proposed" }),
      ],
    });
    expect(out.map((d) => d.key)).toEqual(["scores"]);
  });

  it("excludes an approved dimension weighted zero — it would move no number", () => {
    const out = approvedCustomDimensions({
      custom_dimensions: [dim({ status: "approved", weight: 0 })],
    });
    expect(out).toEqual([]);
  });

  it("treats a calibration written before this slice as having none", () => {
    expect(approvedCustomDimensions({})).toEqual([]);
    expect(approvedCustomDimensions(null)).toEqual([]);
    expect(customDimensionsOf(undefined)).toEqual([]);
  });
});

describe("mergeProposals — the approval invariant", () => {
  it("a re-run CANNOT revoke a human approval", () => {
    const existing = [dim({ key: "signed_for", status: "approved" })];
    // The agent comes back proposing something else entirely.
    const out = mergeProposals(existing, [proposal({ key: "brand_new" })]);
    const signed = out.find((d) => d.key === "signed_for");
    expect(signed).toBeDefined();
    expect(signed!.status).toBe("approved");
  });

  it("a re-run CANNOT rewrite an approved dimension's definition or label", () => {
    const existing = [
      dim({ key: "signed_for", status: "approved", label: "As approved" }),
    ];
    const out = mergeProposals(existing, [
      proposal({
        key: "signed_for",
        label: "Quietly re-authored",
        definition: "Something the recruiter never read.",
      }),
    ]);
    expect(out[0].label).toBe("As approved");
    expect(out[0].definition).toBe(dim().definition);
    expect(out[0].status).toBe("approved");
  });

  it("but the agent MAY re-weight an approved dimension — weight is its job", () => {
    const existing = [dim({ key: "signed_for", status: "approved", weight: 3 })];
    const out = mergeProposals(existing, [
      proposal({ key: "signed_for", weight: 9 }),
    ]);
    expect(out[0].weight).toBe(9);
    expect(out[0].status).toBe("approved");
  });

  it("new proposals land PROPOSED, never approved", () => {
    const out = mergeProposals([], [proposal()]);
    expect(out).toHaveLength(1);
    expect(out[0].status).toBe("proposed");
    expect(out[0].origin).toBe("agent");
  });

  it("drops a stale proposal the agent no longer puts forward", () => {
    const existing = [dim({ key: "went_away", status: "proposed" })];
    const out = mergeProposals(existing, [proposal({ key: "fresh" })]);
    expect(out.map((d) => d.key)).toEqual(["fresh"]);
  });

  it("refuses proposals that collide with a core dimension name", () => {
    const out = mergeProposals([], [proposal({ key: "leadership" })]);
    expect(out).toEqual([]);
  });

  it("respects the cap, approved rows taking the slots first", () => {
    const existing = Array.from({ length: CUSTOM_DIMENSIONS_MAX }, (_, i) =>
      dim({ key: `approved_${i}`, status: "approved" })
    );
    const out = mergeProposals(existing, [proposal({ key: "one_too_many" })]);
    expect(out).toHaveLength(CUSTOM_DIMENSIONS_MAX);
    expect(out.every((d) => d.status === "approved")).toBe(true);
  });

  it("an empty proposal list is a valid answer, not a wipe of approvals", () => {
    const existing = [dim({ key: "signed_for", status: "approved" })];
    expect(mergeProposals(existing, [])).toEqual(existing);
  });
});

describe("buildManualDimension", () => {
  it("lands APPROVED — the human is the author, there is nobody left to witness", () => {
    const out = buildManualDimension(
      {
        label: "Lloyd's syndicate underwriting authority",
        definition: "A 10 has held binding authority at a syndicate.",
        weight: 8,
      },
      []
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.dimension.status).toBe("approved");
    expect(out.dimension.origin).toBe("recruiter");
    // Truncated at the 36-char slice. Keys are internal identifiers, so
    // a slug that stops mid-word is fine; what matters is that it is
    // stable, because candidate_scores.custom_scores is keyed by it.
    expect(out.dimension.key).toBe("lloyd_s_syndicate_underwriting_autho");
  });

  it("refuses a definition too thin to score a CV against", () => {
    const out = buildManualDimension(
      { label: "Something", definition: "good", weight: 5 },
      []
    );
    expect(out.ok).toBe(false);
  });

  it("refuses an unnamed dimension", () => {
    const out = buildManualDimension(
      { label: " ", definition: "A long enough definition here.", weight: 5 },
      []
    );
    expect(out.ok).toBe(false);
  });

  it("refuses past the cap", () => {
    const existing = Array.from({ length: CUSTOM_DIMENSIONS_MAX }, (_, i) =>
      dim({ key: `axis_${i}` })
    );
    const out = buildManualDimension(
      { label: "One more", definition: "A long enough definition here.", weight: 5 },
      existing
    );
    expect(out.ok).toBe(false);
  });

  it("uniquifies a key that collides with one already on the mandate", () => {
    const existing = [dim({ key: "market_making" })];
    const out = buildManualDimension(
      {
        label: "Market making",
        definition: "A long enough definition here.",
        weight: 5,
      },
      existing
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.dimension.key).toBe("market_making_2");
  });

  it("uniquifies away from a core name", () => {
    const out = buildManualDimension(
      {
        label: "Leadership",
        definition: "A long enough definition here.",
        weight: 5,
      },
      []
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.dimension.key).toBe("leadership_2");
  });
});

describe("truncation lands on a word boundary", () => {
  // Drive 128 produced "…and no P&L owne" from a hard .slice(0, 400).
  // The definition is the text a CV is scored against, so a cut that
  // eats half a word — or the whole "what a 0 looks like" clause — is a
  // scoring defect, not a cosmetic one.
  const long = (n: number) =>
    Array.from({ length: n }, (_, i) => `word${i}`).join(" ");

  it("leaves a definition that fits completely untouched", () => {
    const definition = "A 10 has run an options book. A 0 has not.";
    const out = normaliseCustomDimensions([dim({ definition })]);
    expect(out[0].definition).toBe(definition);
    expect(out[0].definition).not.toContain("…");
  });

  it("never cuts mid-word", () => {
    const out = normaliseCustomDimensions([dim({ definition: long(200) })]);
    const text = out[0].definition;
    expect(text.endsWith("…")).toBe(true);
    // Every surviving token is a whole one.
    const tokens = text.slice(0, -1).trim().split(/\s+/);
    for (const t of tokens) expect(t).toMatch(/^word\d+$/);
  });

  it("honours the bound including the ellipsis", () => {
    const out = normaliseCustomDimensions([dim({ definition: long(300) })]);
    expect(out[0].definition.length).toBeLessThanOrEqual(
      CUSTOM_DEFINITION_MAX
    );
  });

  it("drops dangling punctuation before the ellipsis", () => {
    const definition = `${long(60)}, and then more text that will not fit ${long(60)}`;
    const out = normaliseCustomDimensions([dim({ definition })]);
    expect(out[0].definition).not.toMatch(/[,;:\s]…$/);
  });

  it("falls back to a hard cut when one token eats the whole budget", () => {
    // No space to back off to — better a hard cut than an empty string.
    const definition = "x".repeat(CUSTOM_DEFINITION_MAX + 50);
    const out = normaliseCustomDimensions([dim({ definition })]);
    expect(out[0].definition.length).toBeLessThanOrEqual(CUSTOM_DEFINITION_MAX);
    expect(out[0].definition.length).toBeGreaterThan(
      CUSTOM_DEFINITION_MAX * 0.9
    );
  });

  it("applies to labels too — a chip reading 'FX options market-maki' is no better", () => {
    const out = normaliseCustomDimensions([dim({ label: long(40) })]);
    expect(out[0].label.endsWith("…")).toBe(true);
    expect(out[0].label.length).toBeLessThanOrEqual(CUSTOM_LABEL_MAX);
  });
});
