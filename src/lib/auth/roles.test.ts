import { describe, expect, it } from "vitest";
import {
  CAPABILITIES,
  DEFAULT_ROLE,
  ROLES,
  ROLE_LABELS,
  ROLE_SUMMARIES,
  CAPABILITY_LABELS,
  can,
  capabilitiesOf,
  parseRole,
  type Capability,
  type Role,
} from "./roles";

/**
 * The matrix, written out longhand rather than derived from `GRANTS`.
 *
 * A test that recomputes the thing it is testing passes whether or not the
 * thing is right. This is the founder's decision transcribed, and the point
 * is that changing `GRANTS` without meaning to breaks it here.
 */
const MATRIX: Record<Capability, readonly Role[]> = {
  "org:read": ["admin", "manager", "recruiter", "researcher", "viewer"],
  "candidates:write": ["admin", "manager", "recruiter", "researcher"],
  "mandates:write": ["admin", "manager", "recruiter"],
  "clients:share": ["admin", "manager", "recruiter"],
  "fees:read": ["admin", "manager", "recruiter"],
  "desk:manage": ["admin", "manager"],
  "skills:write": ["admin"],
  "org:manage": ["admin"],
};

describe("the capability matrix", () => {
  for (const capability of CAPABILITIES) {
    for (const role of ROLES) {
      const expected = MATRIX[capability].includes(role);
      it(`${role} ${expected ? "may" : "may not"} ${capability}`, () => {
        expect(can(role, capability)).toBe(expected);
      });
    }
  }

  it("covers every capability", () => {
    expect(Object.keys(MATRIX).sort()).toEqual([...CAPABILITIES].sort());
  });
});

describe("the shape of the roles", () => {
  it("lets every role read", () => {
    for (const role of ROLES) {
      expect(can(role, "org:read")).toBe(true);
    }
  });

  it("gives the viewer nothing but reading", () => {
    expect(capabilitiesOf("viewer")).toEqual(["org:read"]);
  });

  it("gives the admin everything", () => {
    expect(capabilitiesOf("admin")).toEqual([...CAPABILITIES]);
  });

  // The two limits that define the researcher, and the reason the role
  // exists at all. If either of these flips, the role has become a recruiter.
  it("stops the researcher at the mandate and at the client", () => {
    expect(can("researcher", "candidates:write")).toBe(true);
    expect(can("researcher", "mandates:write")).toBe(false);
    expect(can("researcher", "clients:share")).toBe(false);
  });

  // The three limits that define the manager (064). The first is what
  // separates them from a recruiter; the other two are what separates them
  // from an admin — if either flips, the fifth role has collapsed into one
  // of its neighbours and stopped paying for itself.
  it("gives the manager the desk and stops them at member administration", () => {
    expect(can("manager", "desk:manage")).toBe(true);
    expect(can("manager", "org:manage")).toBe(false);
    expect(can("manager", "skills:write")).toBe(false);
  });

  it("keeps the desk from the recruiter", () => {
    expect(can("recruiter", "desk:manage")).toBe(false);
  });

  it("orders capabilities as declared, not as stored", () => {
    expect(capabilitiesOf("recruiter")).toEqual([
      "org:read",
      "candidates:write",
      "mandates:write",
      "clients:share",
      "fees:read",
    ]);
  });
});

describe("can()", () => {
  // The signature takes `Role | null` precisely so this case exists rather
  // than being narrowed away at each call site.
  it("denies null and undefined everything", () => {
    for (const capability of CAPABILITIES) {
      expect(can(null, capability)).toBe(false);
      expect(can(undefined, capability)).toBe(false);
    }
  });
});

describe("parseRole", () => {
  it("accepts every declared role", () => {
    for (const role of ROLES) {
      expect(parseRole(role)).toBe(role);
    }
  });

  it("normalises case and surrounding space", () => {
    expect(parseRole("  Admin ")).toBe("admin");
    expect(parseRole("RECRUITER")).toBe("recruiter");
  });

  // The column was unconstrained text until migration 046, so rows written
  // before it can hold anything at all. An unreadable role must lose access,
  // never gain it.
  it("returns null for anything outside the vocabulary", () => {
    for (const value of [
      "",
      "owner",
      "superuser",
      "admins",
      "admin;--",
      "service_role",
      null,
      undefined,
      42,
      {},
      ["admin"],
    ]) {
      expect(parseRole(value)).toBeNull();
    }
  });

  it("denies everything for an unparseable role", () => {
    const parsed = parseRole("owner");
    for (const capability of CAPABILITIES) {
      expect(can(parsed, capability)).toBe(false);
    }
  });
});

describe("defaults and labels", () => {
  // A new account must not arrive able to write. Migration 046 sets both the
  // column default and the signup trigger to match this.
  it("defaults to the role that can do nothing but read", () => {
    expect(DEFAULT_ROLE).toBe("viewer");
    expect(capabilitiesOf(DEFAULT_ROLE)).toEqual(["org:read"]);
  });

  it("labels and summarises every role", () => {
    for (const role of ROLES) {
      expect(ROLE_LABELS[role]).toBeTruthy();
      expect(ROLE_SUMMARIES[role]).toBeTruthy();
    }
  });

  it("labels every capability", () => {
    for (const capability of CAPABILITIES) {
      expect(CAPABILITY_LABELS[capability]).toBeTruthy();
    }
  });
});
