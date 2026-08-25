import { describe, expect, it } from "vitest";
import {
  CAPABILITIES,
  DEFAULT_ROLE,
  ROLES,
  HUMAN_ROLES,
  STAFF_ROLES,
  EXTERNAL_ROLES,
  AGENT_ROLES,
  ROLE_LABELS,
  ROLE_SUMMARIES,
  CAPABILITY_LABELS,
  can,
  capabilitiesOf,
  isExternalRole,
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
  // 107/108: the people the programme measures, plus the admin's
  // repair power — the database guard refuses an admin as an OWNER,
  // so this never makes an admin a subject. The researcher (108) is
  // the first holder WITHOUT fees:read; the database refuses the
  // mismatch (no financial key result on a researcher-owned
  // objective).
  "okrs:write": ["admin", "manager", "recruiter", "researcher"],
  "skills:write": ["admin"],
  "org:manage": ["admin"],
  "portal:read": ["hiring_manager", "client_hr", "client_admin"],
  "client:manage-people": ["client_admin"],
  // Held by no role at all: it resolves from is_founder, not from the
  // role column. Every role reading false here IS the assertion.
  "platform:operate": [],
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
  it("lets every staff role read the org, and no external ever", () => {
    for (const role of STAFF_ROLES) {
      expect(can(role, "org:read")).toBe(true);
    }
    // The load-bearing negative of the External Identity programme: an
    // external with org:read would walk through every generated SELECT
    // policy in migration 046. If one of these flips, the boundary is gone.
    for (const role of EXTERNAL_ROLES) {
      expect(can(role, "org:read")).toBe(false);
    }
  });

  it("keeps the portal from every staff role", () => {
    // The mirror negative: the proxy bounces staff off /portal because no
    // staff role holds portal:read.
    for (const role of STAFF_ROLES) {
      expect(can(role, "portal:read")).toBe(false);
    }
  });

  it("gives the viewer nothing but reading", () => {
    expect(capabilitiesOf("viewer")).toEqual(["org:read"]);
  });

  it("gives the admin everything on the staff side and nothing on the client side", () => {
    expect(capabilitiesOf("admin")).toEqual(
      CAPABILITIES.filter(
        (c) =>
          c !== "portal:read" &&
          c !== "client:manage-people" &&
          // Not a role capability at all — a customer org's admin must
          // never inherit the platform tier (the roles.ts header's own
          // argument for keeping is_founder out of the role model).
          c !== "platform:operate"
      )
    );
  });

  it("splits the vocabulary cleanly", () => {
    expect([...STAFF_ROLES, ...AGENT_ROLES, ...EXTERNAL_ROLES]).toEqual([...ROLES]);
    expect([...STAFF_ROLES, ...EXTERNAL_ROLES]).toEqual([...HUMAN_ROLES]);
    for (const role of STAFF_ROLES) expect(isExternalRole(role)).toBe(false);
    for (const role of EXTERNAL_ROLES) expect(isExternalRole(role)).toBe(true);
    for (const role of AGENT_ROLES) expect(isExternalRole(role)).toBe(false);
    expect(isExternalRole(null)).toBe(false);
    expect(isExternalRole(undefined)).toBe(false);
  });

  // The agents-as-principals negative (074, D2): the agent's capability
  // grant is EMPTY, deliberately and permanently. Capabilities gate
  // screens and server actions; an agent signs in to work, never to
  // look — its reach is the named RLS policies, and a capability
  // appearing here would hand every agent a route tree. Every false in
  // this loop IS the assertion, the platform:operate shape again.
  it("grants the agent nothing at all", () => {
    expect(capabilitiesOf("agent")).toEqual([]);
    for (const capability of CAPABILITIES) {
      expect(can("agent", capability)).toBe(false);
    }
  });

  // The three limits that define the client side: the HM is
  // mandate-scoped with no people powers, HR is client-scoped with no
  // people powers, and only the client_admin manages their company.
  it("keeps people management with the client admin alone", () => {
    expect(can("hiring_manager", "client:manage-people")).toBe(false);
    expect(can("client_hr", "client:manage-people")).toBe(false);
    expect(can("client_admin", "client:manage-people")).toBe(true);
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
      "okrs:write",
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
