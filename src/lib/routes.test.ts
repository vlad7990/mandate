import { describe, expect, it } from "vitest";
import { DASHBOARD_HOME, safeNextPath } from "./routes";

describe("safeNextPath", () => {
  it("passes through a same-origin absolute path", () => {
    expect(safeNextPath("/app/projects/abc123")).toBe("/app/projects/abc123");
    expect(safeNextPath("/app/home")).toBe("/app/home");
  });

  it("keeps query strings and fragments on the path", () => {
    expect(safeNextPath("/app/projects?tab=ranking#top")).toBe(
      "/app/projects?tab=ranking#top"
    );
  });

  it("falls back when there is no next", () => {
    expect(safeNextPath(null)).toBe(DASHBOARD_HOME);
    expect(safeNextPath(undefined)).toBe(DASHBOARD_HOME);
    expect(safeNextPath("")).toBe(DASHBOARD_HOME);
  });

  // The actual vulnerability: `${origin}${next}` with a protocol-relative
  // next sends the browser off-origin entirely.
  it("rejects protocol-relative paths", () => {
    expect(safeNextPath("//evil.com")).toBe(DASHBOARD_HOME);
    expect(safeNextPath("//evil.com/app/home")).toBe(DASHBOARD_HOME);
    // Browsers normalise a backslash to a slash, so this is the same attack.
    expect(safeNextPath("/\\evil.com")).toBe(DASHBOARD_HOME);
  });

  it("rejects absolute URLs and non-path values", () => {
    expect(safeNextPath("https://evil.com")).toBe(DASHBOARD_HOME);
    expect(safeNextPath("http://evil.com")).toBe(DASHBOARD_HOME);
    expect(safeNextPath("javascript:alert(1)")).toBe(DASHBOARD_HOME);
    expect(safeNextPath("app/home")).toBe(DASHBOARD_HOME);
  });

  it("rejects control characters used to split the redirect header", () => {
    expect(safeNextPath("/app/home\nLocation: https://evil.com")).toBe(
      DASHBOARD_HOME
    );
    expect(safeNextPath("/app/home\r\nSet-Cookie: a=b")).toBe(DASHBOARD_HOME);
    expect(safeNextPath("/app/\u0000home")).toBe(DASHBOARD_HOME);
  });

  it("allows a space, which is not a control character", () => {
    expect(safeNextPath("/app/my file")).toBe("/app/my file");
  });

  it("honours an explicit fallback", () => {
    expect(safeNextPath("//evil.com", "/auth/pending")).toBe("/auth/pending");
  });
});
