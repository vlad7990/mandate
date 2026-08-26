import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * One print control, and one print contract.
 *
 * §133 ruled that a document prints as itself — the page IS the print
 * layout, so there is no second renderer and an exported copy cannot
 * disagree with the screen. The print pass (slice 3) took that from one
 * report to eight documents, and the risk it introduced is drift: a
 * second hand-rolled `window.print()` button with slightly different
 * classes, or a document that carries a print id and never opts into
 * the ink-on-paper rebinding.
 *
 * Both had already started. The invoice builder shipped a byte-identical
 * COPY of the report's button rather than importing it, because the
 * button was route-local and there was nothing to import. This test is
 * what stops the third copy.
 */

const SRC = path.resolve(__dirname, "../..");
const SHARED = "components/ui/print-report-button.tsx";

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

const FILES = walk(SRC).map((f) => ({
  rel: path.relative(SRC, f),
  text: fs.readFileSync(f, "utf8"),
}));

describe("the print contract", () => {
  it("finds the source tree", () => {
    expect(FILES.length).toBeGreaterThan(100);
    expect(FILES.some((f) => f.rel === SHARED)).toBe(true);
  });

  it("calls window.print() from exactly one place", () => {
    const callers = FILES.filter((f) => f.text.includes("window.print()")).map((f) => f.rel);
    expect(callers).toEqual([SHARED]);
  });

  /**
   * Every scoped print target must exist as an id somewhere, or the
   * button silently does nothing — it refuses to print rather than
   * spooling the whole workspace, which is the safe failure but an
   * invisible one.
   */
  it("points every scopeId at an element that carries that id", () => {
    const scopeIds = new Set<string>();
    for (const f of FILES) {
      for (const m of f.text.matchAll(/scopeId=["']([\w-]+)["']/g)) scopeIds.add(m[1]);
    }
    expect(scopeIds.size).toBeGreaterThan(0);

    const declared = new Set<string>();
    for (const f of FILES) {
      for (const m of f.text.matchAll(/\bid=["']([\w-]+)["']/g)) declared.add(m[1]);
      // The Panel shell sets `id={printId}`, so a page opts in by prop.
      for (const m of f.text.matchAll(/printId=["']([\w-]+)["']/g)) declared.add(m[1]);
    }

    const dangling = [...scopeIds].filter((id) => !declared.has(id));
    expect(dangling).toEqual([]);
  });

  /**
   * A printed document must rebind the dark terminal palette to ink on
   * paper, or it prints as near-white text on white. `m-report-doc` is
   * what does that (globals.css), and `Panel`'s `printId` applies it —
   * so every hand-rolled print target has to say so itself.
   */
  it("gives every print target the ink-on-paper class", () => {
    const offenders: string[] = [];

    for (const f of FILES) {
      for (const m of f.text.matchAll(/\bid=["']([\w-]+)["'][\s\S]{0,400}?className=\{?["'`]([^"'`]*)/g)) {
        const [, id, className] = m;
        const isPrintTarget = FILES.some((g) => g.text.includes(`scopeId="${id}"`));
        if (isPrintTarget && !className.includes("m-report-doc")) {
          offenders.push(`${f.rel} — #${id} is a print target without m-report-doc`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
