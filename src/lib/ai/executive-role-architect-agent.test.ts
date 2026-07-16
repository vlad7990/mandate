import { describe, expect, test } from "vitest";
import {
  EMPTY_SUCCESS_PROFILE,
  normalizeSuccessProfile,
  type SuccessProfileContent,
} from "./executive-role-architect-agent";

describe("normalizeSuccessProfile", () => {
  test("returns an empty profile for null input", () => {
    // Arrange
    const raw = null;

    // Act
    const result = normalizeSuccessProfile(raw);

    // Assert
    expect(result).toEqual(EMPTY_SUCCESS_PROFILE);
  });

  test("returns an empty profile for non-object input", () => {
    expect(normalizeSuccessProfile("not an object")).toEqual(
      EMPTY_SUCCESS_PROFILE
    );
    expect(normalizeSuccessProfile(42)).toEqual(EMPTY_SUCCESS_PROFILE);
    expect(normalizeSuccessProfile(undefined)).toEqual(EMPTY_SUCCESS_PROFILE);
  });

  test("round-trips a complete, well-formed profile unchanged", () => {
    // Arrange
    const complete: SuccessProfileContent = {
      role_mission: "Own the technology mandate.",
      strategic_mandate: "Scale the platform.",
      critical_business_outcomes: [
        {
          outcome: "Delivery predictability restored",
          timeframe: "Year 1",
          evidence_of_success: "Quarterly commitments met",
        },
      ],
      first_year_priorities: ["Assess the org"],
      required_leadership_capabilities: ["Has built a leadership bench"],
      required_functional_capabilities: ["Has authored a funded strategy"],
      required_operating_experience: ["Has operated at 200+ engineers"],
      required_scale_of_responsibility: "60-250 engineers, $40M budget.",
      required_transformation_experience: "Platform re-architecture delivery.",
      stakeholder_and_board_requirements: "Standing board attendee.",
      potential_derailers: ["Stalls without deep management layers"],
      acceptable_gaps: ["No prior fintech exposure"],
      non_negotiable_gaps: ["Never operated past 50 engineers"],
      recommended_competency_weights: [
        {
          competency_key: "scaling_systems",
          competency_name: "Scaling Through Growth",
          weight: 90,
          rationale: "Core mandate.",
        },
      ],
      recommended_interview_stages: [
        {
          stage: "Deep dive",
          focus: "Scaling evidence",
          format: "Structured interview",
        },
      ],
    };

    // Act
    const result = normalizeSuccessProfile(complete);

    // Assert
    expect(result).toEqual(complete);
  });

  test("fills missing sections with empty values so the editor always renders", () => {
    // Arrange — only one field present
    const partial = { role_mission: "Just a mission." };

    // Act
    const result = normalizeSuccessProfile(partial);

    // Assert
    expect(result.role_mission).toBe("Just a mission.");
    expect(result.strategic_mandate).toBe("");
    expect(result.first_year_priorities).toEqual([]);
    expect(result.recommended_competency_weights).toEqual([]);
    expect(result.recommended_interview_stages).toEqual([]);
  });

  test("clamps competency weights into the 0-100 range and rounds", () => {
    // Arrange
    const raw = {
      recommended_competency_weights: [
        { competency_key: "a", competency_name: "A", weight: 150, rationale: "" },
        { competency_key: "b", competency_name: "B", weight: -5, rationale: "" },
        { competency_key: "c", competency_name: "C", weight: 72.6, rationale: "" },
      ],
    };

    // Act
    const weights = normalizeSuccessProfile(raw).recommended_competency_weights;

    // Assert
    expect(weights.map((w) => w.weight)).toEqual([100, 0, 73]);
  });

  test("coerces malformed weight values to 0 instead of propagating garbage", () => {
    const raw = {
      recommended_competency_weights: [
        { competency_key: "a", competency_name: "A", weight: "high", rationale: "" },
        { competency_key: "b", competency_name: "B", weight: NaN, rationale: "" },
        { competency_key: "c", competency_name: "C", weight: Infinity, rationale: "" },
      ],
    };

    const weights = normalizeSuccessProfile(raw).recommended_competency_weights;

    expect(weights.map((w) => w.weight)).toEqual([0, 0, 0]);
  });

  test("filters non-string entries out of list sections", () => {
    // Arrange
    const raw = {
      potential_derailers: ["real entry", 42, null, { nested: true }, "another"],
    };

    // Act
    const result = normalizeSuccessProfile(raw);

    // Assert
    expect(result.potential_derailers).toEqual(["real entry", "another"]);
  });

  test("drops malformed items from structured arrays and coerces fields to strings", () => {
    // Arrange
    const raw = {
      critical_business_outcomes: [
        { outcome: "Valid", timeframe: "90 days", evidence_of_success: "Shipped" },
        "not an object",
        null,
        { outcome: 42, timeframe: null, evidence_of_success: undefined },
      ],
      recommended_interview_stages: [
        { stage: "Panel", focus: "Governance", format: "Board panel" },
        7,
      ],
    };

    // Act
    const result = normalizeSuccessProfile(raw);

    // Assert
    expect(result.critical_business_outcomes).toEqual([
      { outcome: "Valid", timeframe: "90 days", evidence_of_success: "Shipped" },
      { outcome: "", timeframe: "", evidence_of_success: "" },
    ]);
    expect(result.recommended_interview_stages).toEqual([
      { stage: "Panel", focus: "Governance", format: "Board panel" },
    ]);
  });
});
