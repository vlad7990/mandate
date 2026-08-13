import { describe, expect, it } from "vitest";
import { canReadPlacementFees, isCreditedOn } from "./access";
import type { Role } from "@/lib/auth/roles";

const OWNER = "user-owner";
const SOURCER = "user-sourcer";
const STRANGER = "user-stranger";

const placement = { owner_user_id: OWNER, sourced_by_user_id: SOURCER };

describe("isCreditedOn", () => {
  it("credits the owner and the sourcer", () => {
    expect(isCreditedOn(placement, OWNER)).toBe(true);
    expect(isCreditedOn(placement, SOURCER)).toBe(true);
  });

  it("credits nobody else", () => {
    expect(isCreditedOn(placement, STRANGER)).toBe(false);
  });

  /**
   * A placement whose owner has been deleted has `owner_user_id` null. If
   * null matched a null caller, every orphaned placement would open to
   * every unauthenticated request.
   */
  it("does not match null against null", () => {
    expect(isCreditedOn({ owner_user_id: null, sourced_by_user_id: null }, null)).toBe(false);
    expect(isCreditedOn({ owner_user_id: null, sourced_by_user_id: null }, OWNER)).toBe(false);
    expect(isCreditedOn(placement, null)).toBe(false);
  });
});

describe("canReadPlacementFees", () => {
  it("lets the fee-holding roles read any placement", () => {
    for (const role of ["admin", "recruiter"] as Role[]) {
      expect(canReadPlacementFees(role, STRANGER, placement)).toBe(true);
    }
  });

  it("refuses the roles without the capability on a placement they are not on", () => {
    for (const role of ["researcher", "viewer"] as Role[]) {
      expect(canReadPlacementFees(role, STRANGER, placement)).toBe(false);
    }
  });

  /** The exception the capability model cannot express. */
  it("lets a researcher see the fee on a placement they sourced", () => {
    expect(canReadPlacementFees("researcher", SOURCER, placement)).toBe(true);
  });

  it("still refuses them every other placement", () => {
    const other = { owner_user_id: "someone", sourced_by_user_id: "else" };
    expect(canReadPlacementFees("researcher", SOURCER, other)).toBe(false);
  });

  /** A suspended or pending account has no role at all — see `getAccess`. */
  it("refuses a null role unless credited", () => {
    expect(canReadPlacementFees(null, STRANGER, placement)).toBe(false);
    expect(canReadPlacementFees(null, OWNER, placement)).toBe(true);
  });
});
