import { describe, expect, it } from "vitest";
import {
  describeTrawl,
  inTrawl,
  trawlScopeFor,
  type DeskMember,
} from "./trawl";

const MGR = "mgr-1";
const REC_A = "rec-a";
const REC_B = "rec-b";
const OTHER = "rec-other";

const MEMBERS: DeskMember[] = [
  { id: MGR, managerId: null, status: "active" },
  { id: REC_A, managerId: MGR, status: "active" },
  { id: REC_B, managerId: MGR, status: "active" },
  { id: OTHER, managerId: null, status: "active" },
  { id: "rec-gone", managerId: MGR, status: "suspended" },
];

describe("trawlScopeFor", () => {
  it("gives a recruiter their own book and nobody else's", () => {
    const scope = trawlScopeFor("recruiter", REC_A, MEMBERS);
    expect(scope).toEqual({ kind: "own", ownerIds: [REC_A] });
    expect(inTrawl(scope, REC_A)).toBe(true);
    expect(inTrawl(scope, REC_B)).toBe(false);
    expect(inTrawl(scope, MGR)).toBe(false);
  });

  it("gives a manager their own plus their reports'", () => {
    const scope = trawlScopeFor("manager", MGR, MEMBERS);
    expect(scope.kind).toBe("desk");
    if (scope.kind !== "desk") return;
    expect([...scope.ownerIds].sort()).toEqual([MGR, REC_A, REC_B].sort());
    expect(inTrawl(scope, REC_A)).toBe(true);
    // Someone else's recruiter is not on this desk.
    expect(inTrawl(scope, OTHER)).toBe(false);
  });

  it("leaves a suspended report's book out of the desk", () => {
    const scope = trawlScopeFor("manager", MGR, MEMBERS);
    expect(inTrawl(scope, "rec-gone")).toBe(false);
  });

  it("gives a manager with no reports exactly their own book", () => {
    const scope = trawlScopeFor("manager", OTHER, MEMBERS);
    expect(scope).toEqual({ kind: "desk", ownerIds: [OTHER] });
    expect(inTrawl(scope, MGR)).toBe(false);
  });

  it("gives an admin the whole organisation", () => {
    const scope = trawlScopeFor("admin", MGR, MEMBERS);
    expect(scope).toEqual({ kind: "org" });
    expect(inTrawl(scope, OTHER)).toBe(true);
    expect(inTrawl(scope, null)).toBe(true);
  });

  it("treats a researcher or viewer like a recruiter — their own only", () => {
    for (const role of ["researcher", "viewer"] as const) {
      expect(trawlScopeFor(role, REC_A, MEMBERS)).toEqual({
        kind: "own",
        ownerIds: [REC_A],
      });
    }
  });

  it("does not walk a second level", () => {
    // A reports to MGR; C reports to A. MGR's desk is A, never C.
    const deep: DeskMember[] = [
      ...MEMBERS,
      { id: "rec-c", managerId: REC_A, status: "active" },
    ];
    const scope = trawlScopeFor("manager", MGR, deep);
    expect(inTrawl(scope, "rec-c")).toBe(false);
  });
});

describe("inTrawl — the unowned rule", () => {
  // THE RULED BACKFILL. Every candidate row predating migration 140 has
  // created_by NULL; if unowned meant nobody's, every trawl would have
  // been empty on the day this shipped.
  it("puts an unowned candidate in every scope", () => {
    for (const scope of [
      trawlScopeFor("recruiter", REC_A, MEMBERS),
      trawlScopeFor("manager", MGR, MEMBERS),
      trawlScopeFor("admin", MGR, MEMBERS),
    ]) {
      expect(inTrawl(scope, null)).toBe(true);
      expect(inTrawl(scope, undefined)).toBe(true);
    }
  });
});

describe("describeTrawl", () => {
  it("says what the agent was allowed to look at", () => {
    expect(describeTrawl(trawlScopeFor("admin", MGR, MEMBERS), 318)).toBe(
      "every CV this organisation holds · 318 people"
    );
    expect(describeTrawl(trawlScopeFor("manager", MGR, MEMBERS), 90)).toBe(
      "your desk — you and 2 people, plus unowned CVs · 90 people"
    );
    expect(describeTrawl(trawlScopeFor("recruiter", REC_A, MEMBERS), 41)).toBe(
      "your own CVs, plus unowned CVs · 41 people"
    );
  });

  it("is honest when a manager heads an empty desk", () => {
    expect(describeTrawl(trawlScopeFor("manager", OTHER, MEMBERS), 7)).toBe(
      "your own CVs (nobody reports to you yet), plus unowned CVs · 7 people"
    );
  });

  it("counts one person singularly", () => {
    expect(describeTrawl({ kind: "own", ownerIds: [REC_A] }, 1)).toContain(
      "1 person"
    );
  });
});
