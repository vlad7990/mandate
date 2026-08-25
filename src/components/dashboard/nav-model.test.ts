import { describe, expect, it } from "vitest";
import {
  NAV,
  NAV_GROUPS,
  PROJECTS_HREF,
  isNavItemActive,
  navItemsInGroup,
  type NavItem,
} from "./nav-model";

/** Labels of every nav item that lights up for a path. */
function activeLabels(pathname: string): string[] {
  return NAV.filter((i) => isNavItemActive(i, pathname)).map((i) => i.label);
}

const item = (label: string): NavItem => {
  const found = NAV.find((i) => i.label === label);
  if (!found) throw new Error(`no nav item ${label}`);
  return found;
};

describe("isNavItemActive", () => {
  it("lights Portfolio on the dashboard home, and only there", () => {
    expect(activeLabels(PROJECTS_HREF)).toEqual(["Portfolio"]);
  });

  // Portfolio and Mandates are separate destinations in the rail, so the
  // project tree belongs to Mandates. Before the rail was grouped these
  // were one item and the distinction did not exist.
  it("lights Mandates across the project tree", () => {
    expect(activeLabels("/app/projects")).toEqual(["Mandates"]);
    expect(activeLabels("/app/projects/abc123")).toEqual(["Mandates"]);
    expect(activeLabels("/app/projects/abc123/ranking")).toEqual(["Mandates"]);
    expect(activeLabels("/app/projects/abc123/candidates/xyz")).toEqual([
      "Mandates",
    ]);
  });

  // Candidates is an exact match rather than a prefix precisely so its two
  // children own their own paths. Turning it into a prefix rule would light
  // three rows at once.
  it("distinguishes the candidate destinations", () => {
    expect(activeLabels("/app/candidates")).toEqual(["Candidates"]);
    expect(activeLabels("/app/candidates/network")).toEqual(["Network"]);
    expect(activeLabels("/app/candidates/search")).toEqual(["Pool search"]);
  });

  it("lights Executive Intelligence for its own page only", () => {
    expect(activeLabels("/app/executive-intelligence")).toEqual([
      "Executive Intelligence",
    ]);
    expect(activeLabels("/app/executive-intelligence/competencies")).toEqual([
      "Competencies",
    ]);
    expect(activeLabels("/app/executive-intelligence/templates")).toEqual([
      "Role templates",
    ]);
  });

  // Skills studio lives under /app/settings/skills, so a naive prefix
  // rule on Settings would light both entries at once.
  it("does not light Settings and Skills studio together", () => {
    expect(activeLabels("/app/settings")).toEqual(["Settings"]);
    expect(activeLabels("/app/settings/skills")).toEqual(["Skills studio"]);
    expect(activeLabels("/app/settings/skills/new")).toEqual(["Skills studio"]);
  });

  it("never lights two sections at once", () => {
    const paths = [
      "/app/home",
      "/app/projects",
      "/app/projects/abc123",
      "/app/candidates",
      "/app/candidates/network",
      "/app/candidates/search",
      "/app/analytics",
      "/app/executive-intelligence",
      "/app/executive-intelligence/competencies",
      "/app/settings",
      "/app/settings/skills/new",
    ];
    for (const p of paths) {
      expect(activeLabels(p), `expected exactly one active on ${p}`).toHaveLength(1);
    }
  });

  // Prefix matching requires the slash, so a sibling route that merely
  // shares a string prefix cannot steal the highlight.
  it("does not match a sibling sharing a string prefix", () => {
    expect(isNavItemActive(item("Analytics"), "/app/analytics-archive")).toBe(
      false
    );
    expect(isNavItemActive(item("Mandates"), "/app/projects-archive")).toBe(
      false
    );
    expect(isNavItemActive(item("Skills studio"), "/app/settings/skillset")).toBe(
      false
    );
  });

  it("lights nothing outside the dashboard", () => {
    expect(activeLabels("/pricing")).toEqual([]);
    expect(activeLabels("/executive-intelligence")).toEqual([]);
    expect(activeLabels("/auth/signin")).toEqual([]);
  });

  // The pre-/app URLs still exist as redirects; if one ever reaches the
  // sidebar un-redirected it should not silently look correct.
  it("does not light up for the old un-prefixed paths", () => {
    expect(activeLabels("/home")).toEqual([]);
    expect(activeLabels("/projects/abc123")).toEqual([]);
  });
});

describe("nav grouping", () => {
  it("assigns every item to a declared group", () => {
    const declared = new Set(NAV_GROUPS.map((g) => g.key));
    for (const i of NAV) {
      expect(declared.has(i.group), `${i.label} has unknown group`).toBe(true);
    }
  });

  it("leaves no group empty", () => {
    for (const g of NAV_GROUPS) {
      expect(navItemsInGroup(g.key).length, `${g.label} is empty`).toBeGreaterThan(0);
    }
  });

  // A duplicate destination in a rail is a navigation bug: two rows that
  // look different and go to the same place.
  it("has no duplicate destinations", () => {
    const hrefs = NAV.map((i) => i.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});
