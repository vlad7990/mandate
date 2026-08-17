import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Every client call of a server action must go through `unwrap`.
 *
 * This is the one part of the `ActionResult` contract the compiler cannot
 * hold on its own. An action that returns `Promise<ActionResult<void>>` and
 * is called as `await fooAction(x)` type-checks perfectly — the result is
 * simply discarded — and the UI then reports success on a mutation the
 * server refused. That is a **worse** bug than the redacted toast this
 * contract exists to fix: the redacted toast at least said *something* had
 * gone wrong.
 *
 * TypeScript does catch the subset where the result is read or the action
 * is passed to a typed slot; those are already covered by `tsc` and are not
 * re-checked here. This covers the fire-and-forget calls, which are most of
 * them.
 */

const ROOT = path.resolve(__dirname, "../../..");
const SRC = path.join(ROOT, "src");

/**
 * Actions handed straight to `<form action={...}>`. React's form-action type
 * forbids a return value, and these report failure by redirecting with
 * `?error=` — server-rendered, and so never redacted in the first place.
 */
const FORM_ACTIONS = new Set([
  "signInAction",
  "signUpAction",
  "createProjectAction",
  "createExecutiveSearchAction",
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

/**
 * Comments and string bodies out, so a prose mention of an action name in a
 * doc comment is not read as a call. Crude on purpose — it only has to be
 * good enough that an identifier followed by `(` means a call.
 */
function stripNonCode(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1")
    .replace(/`(?:[^`\\]|\\[\s\S])*`/g, "``")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''");
}

const files = walk(SRC);

const actionModules = files.filter((f) =>
  /^\s*(\/\*[\s\S]*?\*\/\s*)?"use server";/.test(fs.readFileSync(f, "utf8"))
);

const actionNames = new Set<string>();
for (const file of actionModules) {
  for (const m of fs.readFileSync(file, "utf8").matchAll(/^export async function (\w+)/gm)) {
    actionNames.add(m[1]);
  }
}

describe("server action call sites", () => {
  it("finds the action modules and their exports", () => {
    // A guard against the scan silently matching nothing — the failure mode
    // that would make every assertion below pass vacuously.
    expect(actionModules.length).toBeGreaterThan(25);
    expect(actionNames.size).toBeGreaterThan(90);
  });

  it("calls every action through unwrap()", () => {
    const offenders: string[] = [];

    for (const file of files) {
      if (actionModules.includes(file)) continue;
      const code = stripNonCode(fs.readFileSync(file, "utf8"));

      for (const name of actionNames) {
        if (FORM_ACTIONS.has(name)) continue;
        const call = new RegExp(`\\b${name}\\s*\\(`, "g");
        for (const m of code.matchAll(call)) {
          const before = code.slice(Math.max(0, m.index - 40), m.index);
          if (!/unwrap\(\s*await\s+$/.test(before)) {
            const line = code.slice(0, m.index).split("\n").length;
            offenders.push(`${path.relative(ROOT, file)}:${line} — ${name}`);
          }
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
