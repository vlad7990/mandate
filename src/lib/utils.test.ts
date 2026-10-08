import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

import { cn, FONT_SIZES } from "./utils";

/**
 * `cn` has to keep a font size and a text colour at the same time.
 *
 * ## The defect
 *
 * tailwind-merge groups classes by name and keeps the last of each
 * group. A custom `text-<name>` it does not recognise looks exactly
 * like a custom text colour, so the product's six `--text-*` sizes
 * were filed as colours and a size and a colour became mutually
 * exclusive. Whichever came last won; the other vanished.
 *
 * It was not theoretical. `SelectTrigger` writes `text-on-surface` in
 * its base and `text-mono-label` in its tone class, so every dropdown
 * in the product rendered without its colour. The dark theme's
 * inherited colour is near enough that no one saw it.
 *
 * ## Why the registry check matters more than the merge checks
 *
 * The merge assertions below would pass forever once `utils.ts` is
 * correct. The failure mode that actually recurs is someone adding a
 * seventh `--text-*` token to `globals.css` and not adding it here —
 * at which point that token starts eating colours and nothing says so.
 * The last test reads the stylesheet rather than trusting a list.
 */

const GLOBALS = path.resolve(__dirname, "../app/globals.css");

describe("cn — font size and colour are independent", () => {
  it("keeps both, in either order", () => {
    expect(cn("text-mono-label", "text-on-surface-variant").split(" ").sort())
      .toEqual(["text-mono-label", "text-on-surface-variant"]);
    expect(cn("text-on-surface-variant", "text-mono-label").split(" ").sort())
      .toEqual(["text-mono-label", "text-on-surface-variant"]);
  });

  it("still lets a size override a size", () => {
    expect(cn("text-mono-label", "text-body-main")).toBe("text-body-main");
  });

  it("still lets a colour override a colour", () => {
    expect(cn("text-primary", "text-error")).toBe("text-error");
  });

  it("keeps the colour SelectTrigger asks for", () => {
    // The exact ordering the component composes: colour in the base,
    // size in the tone class. This is the case that was broken.
    const merged = cn(
      "text-left text-on-surface transition-colors",
      "font-mono-label text-mono-label uppercase tracking-wider"
    );
    expect(merged).toContain("text-on-surface");
    expect(merged).toContain("text-mono-label");
  });
});

describe("the font-size registry", () => {
  /**
   * Every `--text-<name>` declared in the stylesheet, ignoring the
   * `--font-weight` / `--line-height` / `--letter-spacing` companions
   * Tailwind reads off the same token.
   */
  function declaredTokens(): string[] {
    const css = fs.readFileSync(GLOBALS, "utf8");
    const names = new Set<string>();
    for (const m of css.matchAll(/^\s*--text-([a-z0-9-]+)\s*:/gm)) {
      const name = m[1];
      if (/--(font-weight|line-height|letter-spacing)$/.test(`--${name}`)) {
        continue;
      }
      if (/-{2}/.test(name)) continue;
      names.add(name);
    }
    return [...names].sort();
  }

  it("reads a stylesheet that actually declares sizes", () => {
    // Without this, a bad path would make the check below vacuous.
    expect(declaredTokens().length).toBeGreaterThan(3);
  });

  it("registers every --text-* token declared in globals.css", () => {
    const missing = declaredTokens().filter(
      (t) => !(FONT_SIZES as readonly string[]).includes(t)
    );
    expect(missing).toEqual([]);
  });

  it("registers nothing that the stylesheet does not declare", () => {
    // The other direction: a stale entry here is harmless at runtime
    // but tells the next reader a token exists when it does not.
    const declared = declaredTokens();
    const stale = FONT_SIZES.filter((t) => !declared.includes(t));
    expect(stale).toEqual([]);
  });
});
