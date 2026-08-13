import { describe, expect, it } from "vitest";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_CAPABILITY,
  NO_ACCESS_PATH,
  ROUTE_RULES,
  capabilityForPath,
} from "./route-access";
import { CAPABILITIES, can, type Role } from "./roles";

describe("capabilityForPath", () => {
  it("ignores everything outside /app", () => {
    for (const path of [
      "/",
      "/pricing",
      "/executive-intelligence",
      "/auth/signin",
      "/hm/abc-token",
      "/api/demo",
      "/application", // the prefix test must not match this
    ]) {
      expect(capabilityForPath(path)).toBeNull();
    }
  });

  it("falls back to the read baseline for an unlisted product route", () => {
    expect(capabilityForPath("/app/home")).toBe(DEFAULT_CAPABILITY);
    expect(capabilityForPath("/app/analytics")).toBe(DEFAULT_CAPABILITY);
    expect(capabilityForPath("/app/candidates/network")).toBe(DEFAULT_CAPABILITY);
  });

  it("matches a :segment against exactly one segment", () => {
    expect(capabilityForPath("/app/projects/abc/spec")).toBe("mandates:write");
    // One level deeper is a different route, and `prefix` is what admits it.
    expect(capabilityForPath("/app/projects/abc/spec/v2")).toBe("mandates:write");
    // A bare project page is readable — the rule is on the sub-routes.
    expect(capabilityForPath("/app/projects/abc")).toBe(DEFAULT_CAPABILITY);
  });

  it("puts the three client-facing screens behind clients:share", () => {
    expect(capabilityForPath("/app/projects/abc/shortlist")).toBe("clients:share");
    expect(capabilityForPath("/app/projects/abc/hiring-manager")).toBe("clients:share");
    expect(capabilityForPath("/app/projects/abc/reports")).toBe("clients:share");
  });

  it("puts candidate intake and sourcing behind candidates:write", () => {
    expect(capabilityForPath("/app/projects/abc/candidates/new")).toBe(
      "candidates:write"
    );
    expect(capabilityForPath("/app/projects/abc/sourcing")).toBe("candidates:write");
    expect(
      capabilityForPath("/app/projects/abc/sourcing/runs/xyz/import")
    ).toBe("candidates:write");
  });

  it("keeps reading a candidate open to everyone", () => {
    expect(capabilityForPath("/app/projects/abc/candidates")).toBe(
      DEFAULT_CAPABILITY
    );
    expect(capabilityForPath("/app/projects/abc/candidates/xyz")).toBe(
      DEFAULT_CAPABILITY
    );
  });

  // Order-sensitive: `/app/settings/skills/new` must not be swallowed by the
  // `:skillId` rule above it, and `/app/settings/skills` itself must stay
  // readable so a recruiter can see which lens is scoring their search.
  it("separates authoring a skill from reading the list", () => {
    expect(capabilityForPath("/app/settings/skills")).toBe("org:read");
    expect(capabilityForPath("/app/settings/skills/new")).toBe("skills:write");
    expect(capabilityForPath("/app/settings/skills/abc")).toBe("skills:write");
  });

  it("puts org administration behind org:manage", () => {
    expect(capabilityForPath("/app/settings/waitlist")).toBe("org:manage");
    expect(capabilityForPath("/app/settings/members")).toBe("org:manage");
    // The settings landing page is the caller's own profile — readable.
    expect(capabilityForPath("/app/settings")).toBe(DEFAULT_CAPABILITY);
  });

  it("opens an executive search behind mandates:write, reads it behind nothing", () => {
    expect(capabilityForPath("/app/executive-intelligence/searches/new")).toBe(
      "mandates:write"
    );
    expect(capabilityForPath("/app/executive-intelligence/searches")).toBe(
      DEFAULT_CAPABILITY
    );
    expect(capabilityForPath("/app/executive-intelligence/searches/abc")).toBe(
      DEFAULT_CAPABILITY
    );
  });
});

describe("the no-access destination", () => {
  // If this needed a capability the denied user lacked, the proxy would
  // redirect to it, evaluate the rule again, and redirect forever.
  it("is reachable by anyone the proxy redirects to it", () => {
    expect(capabilityForPath(NO_ACCESS_PATH)).toBe(DEFAULT_CAPABILITY);
    const everyRole: Role[] = ["admin", "recruiter", "researcher", "viewer"];
    for (const role of everyRole) {
      expect(can(role, DEFAULT_CAPABILITY)).toBe(true);
    }
  });
});

describe("the rule table itself", () => {
  it("names only real capabilities", () => {
    for (const rule of ROUTE_RULES) {
      expect(CAPABILITIES).toContain(rule.capability);
    }
  });

  it("has no rule shadowed by an earlier, more general one", () => {
    ROUTE_RULES.forEach((rule, index) => {
      const resolved = capabilityForPath(
        rule.pattern.replace(/:[^/]+/g, "placeholder")
      );
      expect(
        resolved,
        `rule ${index} (${rule.pattern}) is unreachable — an earlier rule matches it first`
      ).toBe(rule.capability);
    });
  });
});

/**
 * The guard is only as good as its coverage, so this walks the actual route
 * tree on disk rather than a list someone remembered to update.
 *
 * It does not assert that every route is restricted — most should not be.
 * It asserts that every route resolves to a capability at all, which is what
 * catches a page added outside `/app` by accident, or a route group that
 * silently changes the URL shape.
 */
describe("coverage of the real route tree", () => {
  const DASHBOARD_DIR = join(process.cwd(), "src/app/(dashboard)");

  /** Every `page.tsx` under the dashboard, as the URL it serves. */
  function routes(dir: string, urlPath: string): string[] {
    const found: string[] = [];
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        // `(group)` folders do not appear in the URL.
        const segment = entry.startsWith("(") && entry.endsWith(")")
          ? urlPath
          : `${urlPath}/${entry}`;
        found.push(...routes(full, segment));
      } else if (entry === "page.tsx") {
        found.push(urlPath || "/");
      }
    }
    return found;
  }

  const all = routes(DASHBOARD_DIR, "");

  it("finds the dashboard routes", () => {
    expect(all.length).toBeGreaterThan(30);
  });

  it("resolves every dashboard route to a capability", () => {
    for (const route of all) {
      // Dynamic segments are `[id]` on disk; the guard sees a real value.
      const concrete = route.replace(/\[[^\]]+\]/g, "placeholder");
      expect(capabilityForPath(concrete), `no capability for ${route}`).not.toBeNull();
    }
  });

  it("keeps every dashboard route under /app", () => {
    for (const route of all) {
      expect(route.startsWith("/app"), `${route} is outside /app`).toBe(true);
    }
  });
});
