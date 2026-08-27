import { describe, expect, it } from "vitest";
import { computeSpecDrift, SPEC_DRIFT_REFUSAL } from "./spec-drift";
import type { CalibrationModel } from "@/lib/ai/role-analysis";

const SPEC_A = "11111111-1111-1111-1111-111111111111";
const SPEC_B = "22222222-2222-2222-2222-222222222222";

function calibration(
  overrides: Partial<CalibrationModel> = {}
): Partial<CalibrationModel> {
  return {
    role_title: "Head of IT Operations",
    inferred_scope: "Overseeing IT operations.",
    ...overrides,
  };
}

describe("computeSpecDrift", () => {
  // Ruling A.3. This is the branch that keeps early mandates working:
  // a recruiter parses CVs long before a spec is finalised, and the
  // door must not punish them for it.
  it("never fires when no spec is final, however the calibration is stamped", () => {
    for (const stamp of [undefined, null, SPEC_A]) {
      const drift = computeSpecDrift({
        finalSpecId: null,
        finalSpecVersion: null,
        calibration: calibration({ derived_from_spec_id: stamp }),
      });
      expect(drift.stale).toBe(false);
      expect(drift.finalSpecId).toBeNull();
    }
  });

  it("fires when a spec is final and the calibration predates it", () => {
    const drift = computeSpecDrift({
      finalSpecId: SPEC_A,
      finalSpecVersion: 3,
      calibration: calibration(),
    });
    expect(drift.stale).toBe(true);
    expect(drift.derivedFromSpecId).toBeNull();
    expect(drift.finalSpecVersion).toBe(3);
  });

  it("clears once the calibration is stamped with the final spec's id", () => {
    const drift = computeSpecDrift({
      finalSpecId: SPEC_A,
      finalSpecVersion: 3,
      calibration: calibration({ derived_from_spec_id: SPEC_A }),
    });
    expect(drift.stale).toBe(false);
  });

  // A new version is a new row, so finalising a different version must
  // re-open the door even though the calibration carries a real id.
  it("re-fires when a DIFFERENT version is promoted to final", () => {
    const drift = computeSpecDrift({
      finalSpecId: SPEC_B,
      finalSpecVersion: 4,
      calibration: calibration({ derived_from_spec_id: SPEC_A }),
    });
    expect(drift.stale).toBe(true);
    expect(drift.derivedFromSpecId).toBe(SPEC_A);
  });

  // Ruling A.2 buys back the referential integrity a real FK would have
  // given: a dangling or malformed stamp reads as stale and refuses,
  // rather than passing the door on a value that means nothing.
  it("fails CLOSED on a missing, empty or non-string stamp", () => {
    for (const stamp of [undefined, null, "", 42, {}, []]) {
      const drift = computeSpecDrift({
        finalSpecId: SPEC_A,
        finalSpecVersion: 1,
        calibration: calibration({
          derived_from_spec_id: stamp as never,
        }),
      });
      expect(drift.stale).toBe(true);
    }
  });

  it("fails closed on a null calibration entirely", () => {
    expect(
      computeSpecDrift({
        finalSpecId: SPEC_A,
        finalSpecVersion: 1,
        calibration: null,
      }).stale
    ).toBe(true);
  });

  // The refusal must name the remedy, or the recruiter is stuck holding
  // a door with no handle — the shape sourcing's no_final_spec set.
  it("names both the problem and the remedy", () => {
    expect(SPEC_DRIFT_REFUSAL).toMatch(/final job spec/i);
    expect(SPEC_DRIFT_REFUSAL).toMatch(/recalibrate/i);
  });
});
