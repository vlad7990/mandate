import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * §190 — the apply door fails CLOSED, pinned.
 *
 * verifyTurnstile()'s 'disabled' mode fails OPEN by design — right for
 * the marketing form, catastrophic for a public CV-upload endpoint. The
 * door therefore consults `turnstileConfigured()` and refuses when the
 * keys are absent — on the PAGE (no form rendered) and in the ROUTE
 * (403 before the body is read). Both are pinned by source text because
 * the defect this prevents is a deletion: remove either call and the
 * endpoint quietly opens to scripts the day the keys land in only one
 * of the two places.
 *
 * The proxy pin is the §138 lesson: /join was never actually public
 * until the allowlist knew it. A public route the proxy bounces reads
 * as a broken product; a public route MISSING from this file would be
 * unreachable and the whole slice dead code.
 */

const ROOT = path.resolve(__dirname, "../../..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");

describe("the apply door (§190)", () => {
  it("page and route both consult turnstileConfigured()", () => {
    expect(read("src/app/apply/[token]/page.tsx")).toContain(
      "turnstileConfigured()"
    );
    expect(read("src/app/apply/[token]/api/submit/route.ts")).toContain(
      "turnstileConfigured()"
    );
  });

  it("the route refuses before reading the body when keys are absent", () => {
    const route = read("src/app/apply/[token]/api/submit/route.ts");
    const gate = route.indexOf("turnstileConfigured()");
    const body = route.indexOf("req.formData()");
    expect(gate).toBeGreaterThan(-1);
    expect(body).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(body);
  });

  it("the route is rate-limited on the money tier", () => {
    const route = read("src/app/apply/[token]/api/submit/route.ts");
    // limitClosed, not limitOpen: parse + evaluation + refuter per
    // submission is our money, and an unreachable limiter must refuse.
    expect(route).toMatch(/limitClosed\("apply"/);
    expect(route).not.toMatch(/limitOpen\(/);
  });

  it("the proxy knows /apply is public", () => {
    expect(read("src/proxy.ts")).toMatch(/"\/apply\/", "\/apply"/);
  });

  it("the form carries the Art.13 notice that justifies subject_notified_at", () => {
    const form = read("src/app/apply/[token]/apply-form.tsx");
    expect(form).toMatch(/analysed — including by AI tooling/);
    expect(form).toMatch(/deletion of your data/);
  });
});
