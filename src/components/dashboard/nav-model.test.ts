import { describe, expect, it } from "vitest";
import { NAV, PROJECTS_HREF, isNavItemActive, type NavItem } from "./nav-model";

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
  it("lights Projects on the dashboard home", () => {
    expect(activeLabels(PROJECTS_HREF)).toEqual(["Projects"]);
  });

  // The regression this module exists for: the old inline rule tested
  // `item.href === "/"`, which never matched, so opening a project left
  // the whole sidebar dark.
  it("keeps Projects lit while browsing a project", () => {
    expect(activeLabels("/app/projects")).toEqual(["Projects"]);
    expect(activeLabels("/app/projects/abc123")).toEqual(["Projects"]);
    expect(activeLabels("/app/projects/abc123/ranking")).toEqual(["Projects"]);
    expect(activeLabels("/app/projects/abc123/candidates/xyz")).toEqual([
      "Projects",
    ]);
  });

  it("distinguishes the three candidate destinations", () => {
    expect(activeLabels("/app/candidates")).toEqual(["Candidates"]);
    expect(activeLabels("/app/candidates/network")).toEqual(["Network"]);
    expect(activeLabels("/app/candidates/search")).toEqual(["AI Search"]);
  });

  it("keeps Exec Intel lit through its whole tree", () => {
    expect(activeLabels("/app/executive-intelligence")).toEqual(["Exec Intel"]);
    expect(activeLabels("/app/executive-intelligence/searches")).toEqual([
      "Exec Intel",
    ]);
    expect(
      activeLabels("/app/executive-intelligence/searches/abc/success-profile")
    ).toEqual(["Exec Intel"]);
  });

  it("keeps Settings lit through its whole tree", () => {
    expect(activeLabels("/app/settings")).toEqual(["Settings"]);
    expect(activeLabels("/app/settings/skills/new")).toEqual(["Settings"]);
  });

  it("never lights two sections at once", () => {
    const paths = [
      "/app/home",
      "/app/projects/abc123",
      "/app/candidates",
      "/app/candidates/network",
      "/app/candidates/search",
      "/app/executive-intelligence/searches/abc",
      "/app/analytics",
      "/app/settings/skills",
    ];
    for (const p of paths) {
      expect(activeLabels(p), `two sections active on ${p}`).toHaveLength(1);
    }
  });

  // Prefix matching requires the slash, so a sibling route that merely
  // shares a string prefix cannot steal the highlight.
  it("does not match a sibling sharing a string prefix", () => {
    expect(isNavItemActive(item("Analytics"), "/app/analytics-archive")).toBe(
      false
    );
    expect(
      isNavItemActive(item("Exec Intel"), "/app/executive-intelligence-beta")
    ).toBe(false);
    expect(isNavItemActive(item("Projects"), "/app/projects-archive")).toBe(
      false
    );
  });

  it("lights nothing on a path outside the dashboard", () => {
    expect(activeLabels("/pricing")).toEqual([]);
    expect(activeLabels("/executive-intelligence")).toEqual([]);
    expect(activeLabels("/auth/signin")).toEqual([]);
  });

  // The pre-/app URLs still exist as redirects; if one ever reaches the
  // sidebar un-redirected, it should not silently look correct.
  it("does not light up for the old un-prefixed paths", () => {
    expect(activeLabels("/home")).toEqual([]);
    expect(activeLabels("/projects/abc123")).toEqual([]);
  });
});
