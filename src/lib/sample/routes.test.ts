import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Every dashboard route that can be handed a sample id must say so.
 *
 * ## The defect this generalises
 *
 * A sample id — `sample-larkspur`, `sample-anand` — is not a uuid. A route
 * that passes one to PostgREST gets `22P02` back, which is not `PGRST116`,
 * so it falls into the `redirect("/")` arm written for "that record is not
 * yours". The reader is moved to the dashboard and told nothing.
 *
 * W3 found eleven routes doing this under `/app/projects/[id]`, and the
 * sweep after it found nine more across the executive-search tree, the skill
 * detail, the import wizard, the ranking comparison and the candidate upload
 * form. Twenty routes, one defect, and none of it visible from any test that
 * existed: they all rendered fine for a real uuid.
 *
 * ## Why the check is structural rather than a list
 *
 * Naming the twenty would leave the twenty-first — a route added next month
 * inherits the same `redirect("/")` idiom by copy-paste and nothing notices.
 * This walks the route tree instead, so a new dynamic page is covered the
 * day it exists. Same shape as assertion (1) in
 * `supabase/tests/suspended_account_invariants.sql`, which loops every
 * RLS-enabled table rather than listing them.
 *
 * A route satisfies this by handling the id — with a sample screen, or with
 * `SampleNotBuilt`, which says the gap is the sample's rather than moving
 * the reader somewhere they did not ask to go.
 */

const DASHBOARD = path.resolve(__dirname, "../../app/(dashboard)");

/**
 * Routes whose dynamic segment can never carry a sample id.
 *
 * Empty, deliberately. If something is added here it needs a reason in
 * writing, because "unreachable by clicking" is not one — a typed URL, a
 * bookmark and a shared link all still arrive.
 */
const EXEMPT: ReadonlyArray<string> = [];

function dynamicPages(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) dynamicPages(full, out);
    else if (entry.name === "page.tsx" && full.includes("[")) out.push(full);
  }
  return out;
}

const pages = dynamicPages(DASHBOARD);

describe("sample ids reach every dynamic dashboard route", () => {
  it("finds the route tree", () => {
    // Guards against the walk silently matching nothing, which would make
    // the assertion below pass vacuously.
    expect(pages.length).toBeGreaterThan(20);
  });

  it("handles a sample id on every dynamic route", () => {
    // `isSampleId(` and not `isSampleId`: deleting the branch but leaving the
    // import behind passed the first version of this test. Lint would have
    // caught the unused import eventually, but a guard that a control run
    // walks straight through is not a guard.
    const unhandled = pages
      .map((p) => path.relative(DASHBOARD, p))
      .filter((rel) => !EXEMPT.includes(rel))
      .filter(
        (rel) =>
          !fs.readFileSync(path.join(DASHBOARD, rel), "utf8").includes("isSampleId(")
      );

    expect(unhandled).toEqual([]);
  });
});
