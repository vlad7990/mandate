import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * §177 (F-A) — every scoring entry point passes the role seam's door.
 *
 * The compiler cannot hold this. `runCvParseAndPersist(...)` type-checks
 * perfectly whether or not `assertCalibrationMatchesSpec` was awaited
 * first, and the failure is silent in the worst way: the parse succeeds,
 * the evaluation reads a stale role, and a client receives a confident
 * verdict about a named person scored against the wrong job. That is the
 * exact defect §175 found in production.
 *
 * So the guard is on the SOURCE TEXT, and the duplication IS the check —
 * a shared wrapper would walk straight out from under it, which is the
 * standing lesson this codebase has already paid for twice.
 *
 * Mutation-tested before it was trusted. Deleting any one
 * `assertCalibrationMatchesSpec(` call fails two of the three
 * assertions below — including the case where the call goes but the
 * import stays, which is how this would actually rot.
 *
 * What this guard does NOT catch, stated plainly: renaming the door in
 * spec-drift.ts alone leaves these assertions green. That mutation is
 * caught by `tsc`, because every call site would stop resolving. The
 * division is deliberate — the compiler owns renames, this owns
 * deletions and new call sites.
 */

const ROOT = path.resolve(__dirname, "../../..");
const SRC = path.join(ROOT, "src");

/** The door. Written as a literal on purpose — see the note above. */
const DOOR = "assertCalibrationMatchesSpec";

/**
 * The seams that produce a scored judgment about a candidate. Ruling
 * A.4: evaluation and ranking only. Copilot, the portals' weight
 * displays and mandate-gap computation are advisory or read-only, and
 * blocking them would be hostile.
 */
const GUARDED_CALLS = ["runCvParseAndPersist", "runRoleAnalysis"];

/**
 * The agent seams themselves — they RUN the judgment rather than
 * authorise it, and they receive the calibration as an argument from an
 * action that has already passed the door. Guarding them would be
 * guarding the wrong side of the seam.
 */
const IMPLEMENTATION_FILES = new Set([
  path.join(SRC, "lib", "candidates", "agent-parser.ts"),
  path.join(SRC, "lib", "ai", "run-role-analysis.ts"),
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function callSites(): { file: string; call: string; source: string }[] {
  const found: { file: string; call: string; source: string }[] = [];
  for (const file of walk(SRC)) {
    if (IMPLEMENTATION_FILES.has(file)) continue;
    const source = fs.readFileSync(file, "utf8");
    for (const call of GUARDED_CALLS) {
      // The invocation, not the import line.
      if (new RegExp(`\\b${call}\\s*\\(`).test(source)) {
        found.push({ file, call, source });
      }
    }
  }
  return found;
}

describe("the role seam's door (§177)", () => {
  it("finds the scoring call sites it is meant to guard", () => {
    // If this drops to zero the guard has stopped guarding anything —
    // a rename would otherwise make every assertion below vacuous.
    expect(callSites().length).toBeGreaterThanOrEqual(4);
  });

  it("guards every scoring call site with the door", () => {
    // Matches the INVOCATION, not the import. Mutation-testing found
    // that `source.includes(DOOR)` passes on a file where the call was
    // deleted but `import { assertCalibrationMatchesSpec }` remains —
    // which is exactly how this would rot in practice.
    const unguarded = callSites()
      .filter(({ source }) => !source.includes(DOOR + "("))
      .map(({ file, call }) => `${path.relative(ROOT, file)} calls ${call}()`);

    expect(unguarded).toEqual([]);
  });

  it("puts the door BEFORE the judgment in every file", () => {
    const wrongOrder: string[] = [];
    for (const { file, call, source } of callSites()) {
      const door = source.indexOf(DOOR + "(");
      const judgment = source.search(new RegExp(`\\b${call}\\s*\\(`));
      if (door === -1 || door > judgment) {
        wrongOrder.push(`${path.relative(ROOT, file)}: ${call}`);
      }
    }
    expect(wrongOrder).toEqual([]);
  });
});
