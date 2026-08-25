import { describe, expect, it } from "vitest";
import { memberStatusRefusal } from "./status-rules";

const base = { id: "t1", is_founder: false, role: "recruiter", status: "active" };

describe("memberStatusRefusal", () => {
  it("refuses founder targets in both directions", () => {
    for (const nextStatus of ["active", "suspended"] as const) {
      expect(
        memberStatusRefusal({
          actorId: "a1",
          target: { ...base, is_founder: true },
          nextStatus,
          activeAdminCount: 5,
        })
      ).toMatch(/Founder accounts/);
    }
  });

  it("refuses agent principals — the kill switch stays on /ops", () => {
    expect(
      memberStatusRefusal({
        actorId: "a1",
        target: { ...base, role: "agent" },
        nextStatus: "suspended",
        activeAdminCount: 5,
      })
    ).toMatch(/operator console/);
  });

  it("refuses self-suspension", () => {
    expect(
      memberStatusRefusal({
        actorId: "t1",
        target: base,
        nextStatus: "suspended",
        activeAdminCount: 5,
      })
    ).toMatch(/your own account/);
  });

  it("refuses suspending the last active admin", () => {
    expect(
      memberStatusRefusal({
        actorId: "a1",
        target: { ...base, role: "admin" },
        nextStatus: "suspended",
        activeAdminCount: 1,
      })
    ).toMatch(/last active admin/);
  });

  it("admits suspending an admin when another active admin remains", () => {
    expect(
      memberStatusRefusal({
        actorId: "a1",
        target: { ...base, role: "admin" },
        nextStatus: "suspended",
        activeAdminCount: 2,
      })
    ).toBeNull();
  });

  it("admits restoring a suspended member, and never blocks restore on the admin count", () => {
    expect(
      memberStatusRefusal({
        actorId: "a1",
        target: { ...base, status: "suspended" },
        nextStatus: "active",
        activeAdminCount: 0,
      })
    ).toBeNull();
  });
});
