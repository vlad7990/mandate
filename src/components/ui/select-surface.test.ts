import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Every picker in the product goes through the styled Select.
 *
 * ## The defect
 *
 * A native `<select>` can be styled down to the last pixel and still
 * break the product's visual language, because the part a user actually
 * looks at — the open list — is drawn by the operating system, not by
 * the page. No stylesheet reaches inside it. It ignores the elevation
 * ramp, the one-pixel --border frame, the mono label type and the square
 * corners, and on Windows it renders as a 1990s combo box.
 *
 * Sixty of them were live across thirty-eight files. The closed controls
 * all looked correct, which is exactly why this went unnoticed for so
 * long: nothing is wrong until the moment someone clicks.
 *
 * ## Why a structural check rather than a fixed list
 *
 * Naming the thirty-eight leaves the thirty-ninth. A native select is
 * the obvious thing to reach for — it is three lines and it works — so
 * the next one will be written by somebody solving a different problem
 * who never sees this file. The check walks the tree instead, the same
 * shape as `embed-ambiguity.test.ts` and `routes.test.ts`, both of which
 * exist because a list would have gone stale.
 *
 * ## What this guard does NOT prove
 *
 * It reads source text. It proves no `<select>` element is authored in
 * the app's own `.tsx`; it cannot prove the replacement looks right, is
 * reachable by keyboard, or posts the right value in a form. Those are
 * the live drive's job, not this file's.
 */

const SRC = path.resolve(__dirname, "../..");

/**
 * `select.tsx` is the one file allowed to say the word, because its
 * comments explain the element it exists to replace. It authors no
 * `<select>` of its own — the assertion below still applies to it.
 */
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.tsx$/.test(entry.name) && !/\.test\.tsx$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/**
 * An authored `<select>` or `<option>` ELEMENT, not a mention of one.
 *
 * The distinction matters: the component that replaced them documents
 * what it replaced, and a guard that cannot tell prose from code would
 * forbid explaining itself. An element is `<select` or `<option`
 * followed by whitespace, `>` or `/`; a mention is almost always inside
 * a backtick pair, a `//` line or a `*` block comment.
 */
const ELEMENT = /<(select|option)(\s|>|\/)/g;

function authoredElements(source: string): Array<{ line: number; tag: string }> {
  const found: Array<{ line: number; tag: string }> = [];
  source.split("\n").forEach((text, index) => {
    const code = text.trim();
    // Drop comment lines and anything inside backticks before matching,
    // so prose about the old element does not read as the old element.
    if (code.startsWith("//") || code.startsWith("*") || code.startsWith("/*")) {
      return;
    }
    const withoutProse = text.replace(/`[^`]*`/g, "");
    for (const match of withoutProse.matchAll(ELEMENT)) {
      found.push({ line: index + 1, tag: match[1] });
    }
  });
  return found;
}

describe("the dropdown surface", () => {
  const files = walk(SRC);

  it("walks a tree that actually has components in it", () => {
    // Without this, a bad SRC path would make the whole guard vacuous:
    // zero files scanned, zero violations found, green.
    expect(files.length).toBeGreaterThan(100);
  });

  it("authors no native <select> or <option> anywhere in the app", () => {
    const offenders: string[] = [];
    for (const file of files) {
      for (const hit of authoredElements(fs.readFileSync(file, "utf8"))) {
        offenders.push(`${path.relative(SRC, file)}:${hit.line} <${hit.tag}>`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("detects a native select when one is present", () => {
    // Mutation check. The assertion above is only worth anything if it
    // can fail, and a source-text guard that silently matches nothing
    // is the easiest kind of test to write by accident.
    const planted = [
      '<label className="flex">',
      '  <select value={x} onChange={(e) => set(e.target.value)}>',
      '    <option value="a">A</option>',
      "  </select>",
      "</label>",
    ].join("\n");
    // Opening tags only — `</option>` is a closer, and counting it would
    // make the guard's output read as twice the violations there are.
    expect(authoredElements(planted).map((h) => h.tag)).toEqual([
      "select",
      "option",
    ]);
  });

  it("does not mistake prose about the old element for the old element", () => {
    const prose = [
      "/**",
      " * Every picker used to be a native <select>.",
      " */",
      "// a <select> sizes itself to its widest <option>",
      "const note = `the <select> popup is drawn by the OS`;",
    ].join("\n");
    expect(authoredElements(prose)).toEqual([]);
  });
});
