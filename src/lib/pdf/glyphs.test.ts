import { describe, expect, it, vi } from "vitest";
import {
  UNSUPPORTED_MARK,
  isRepresentable,
  pdfSafeText,
  sanitizeForPdf,
  unsupportedGlyphs,
} from "./glyphs";

const cp = (char: string) => char.codePointAt(0) as number;

describe("isRepresentable", () => {
  it("accepts what the font can actually print", () => {
    for (const char of "Aa1 .,;:!?()[]{}/@#$%&*+-=<>|~^_`'\"\\") {
      expect(isRepresentable(cp(char))).toBe(true);
    }
    // Latin-1: accented names have always been fine and must stay fine.
    for (const char of "ÅåÄäÖöÉéÈèÑñÇçØøÆæßÜüÎîÔô") {
      expect(isRepresentable(cp(char))).toBe(true);
    }
    // WinAnsi's 0x80–0x9F block — the typographic punctuation the documents
    // and the model both use constantly.
    for (const char of "€…†‡‰•–—''\"\"™«»·°±×÷") {
      expect(isRepresentable(cp(char))).toBe(true);
    }
  });

  it("keeps newlines, which carry paragraph breaks", () => {
    expect(isRepresentable(0x0a)).toBe(true);
    expect(isRepresentable(0x0d)).toBe(true);
    expect(isRepresentable(0x09)).toBe(true);
  });

  it("rejects what it cannot", () => {
    for (const char of "→←↑↓✓✗★●≥≤≠∞′″") {
      expect(isRepresentable(cp(char))).toBe(false);
    }
    expect(isRepresentable(cp("李"))).toBe(false);
    expect(isRepresentable(cp("Ж"))).toBe(false);
    expect(isRepresentable(cp("→"))).toBe(false);
  });
});

describe("pdfSafeText", () => {
  it("leaves ordinary prose untouched", () => {
    const prose =
      "Björn Håkansson — 900M to 3.6B transactions, «acquiring» not issuing… 4×.";
    expect(pdfSafeText(prose)).toBe(prose);
  });

  it("translates the characters that actually shipped wrong", () => {
    // These three printed as "’", "²" and "¼" in the weekly report.
    expect(pdfSafeText("Screened → Client interview")).toBe(
      "Screened » Client interview"
    );
    expect(pdfSafeText("▲ 2 positions")).toBe("up 2 positions");
    expect(pdfSafeText("▼ 3 positions")).toBe("down 3 positions");
  });

  it("keeps polarity when a model writes a tick-and-cross list", () => {
    expect(pdfSafeText("✓ Payments depth\n✗ Regulatory ownership")).toBe(
      "yes Payments depth\nno Regulatory ownership"
    );
  });

  it("spells out comparisons rather than approximating them", () => {
    expect(pdfSafeText("≥ 8 years, ≤ 2 moves, ≠ contractor")).toBe(
      ">= 8 years, <= 2 moves, != contractor"
    );
  });

  it("removes zero-width characters instead of marking them", () => {
    // A joiner nobody can see must not become a "?" everybody can.
    expect(pdfSafeText("Raghu​nathan")).toBe("Raghunathan");
    expect(pdfSafeText("﻿Priya")).toBe("Priya");
  });

  it("normalises exotic spaces to the one the font has", () => {
    expect(pdfSafeText("3.6B transactions")).toBe("3.6B transactions");
    expect(pdfSafeText("Tier 1")).toBe("Tier 1");
  });

  it("marks what it cannot translate, once per character", () => {
    expect(pdfSafeText("李明")).toBe(`${UNSUPPORTED_MARK}${UNSUPPORTED_MARK}`);
  });

  it("counts an emoji once, not once per surrogate half", () => {
    // Naive charCodeAt iteration would emit two marks for one character.
    expect(pdfSafeText("👍")).toBe(UNSUPPORTED_MARK);
    expect(pdfSafeText("a👍b")).toBe(`a${UNSUPPORTED_MARK}b`);
  });

  it("never leaves an unprintable character behind", () => {
    const nasty = "→ ✓ 李 👍 ≥ ★ ​ ′";
    for (const char of pdfSafeText(nasty)) {
      expect(isRepresentable(cp(char))).toBe(true);
    }
  });

  it("is idempotent", () => {
    const once = pdfSafeText("Screened → ✓ 李");
    expect(pdfSafeText(once)).toBe(once);
  });
});

describe("unsupportedGlyphs", () => {
  it("reports only what is genuinely lost, not what is translated", () => {
    // The arrow and tick survive as "»" and "yes", so they are not losses.
    expect(unsupportedGlyphs("Screened → ✓ done")).toEqual([]);
  });

  it("reports a script the font does not carry", () => {
    expect(unsupportedGlyphs("李明 Zhang")).toEqual(["李", "明"]);
  });

  it("deduplicates", () => {
    expect(unsupportedGlyphs("李李李")).toEqual(["李"]);
  });
});

describe("sanitizeForPdf", () => {
  it("reaches strings nested in arrays and objects", () => {
    const input = {
      name: "Priya →",
      scores: [{ commentary: "✓ strong" }, { commentary: "✗ weak" }],
      nested: { deep: { deeper: "▲ 2" } },
    };
    expect(sanitizeForPdf(input)).toEqual({
      name: "Priya »",
      scores: [{ commentary: "yes strong" }, { commentary: "no weak" }],
      nested: { deep: { deeper: "up 2" } },
    });
  });

  it("leaves non-strings as they are", () => {
    const input = {
      score: 9,
      weight: null,
      ok: true,
      missing: undefined,
      tier: "tier_1",
    };
    expect(sanitizeForPdf(input)).toEqual(input);
  });

  it("does not rebuild a class instance into a plain object", () => {
    // A Date reconstructed key by key comes back as {} and stops being a Date.
    const date = new Date("2026-08-13T09:14:00.000Z");
    const result = sanitizeForPdf({ generated: date });
    expect(result.generated).toBeInstanceOf(Date);
    expect(result.generated.toISOString()).toBe("2026-08-13T09:14:00.000Z");
  });

  it("does not descend into a React element", () => {
    const element = { $$typeof: Symbol.for("react.element"), props: { x: "→" } };
    expect(sanitizeForPdf({ element }).element).toBe(element);
  });

  it("does not mutate its input", () => {
    const input = { name: "Priya →" };
    const output = sanitizeForPdf(input);
    expect(input.name).toBe("Priya →");
    expect(output).not.toBe(input);
  });

  it("warns once about characters it had to mark, naming them", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      sanitizeForPdf({ a: "李明", b: { c: "Жуков" }, d: "李" });
      expect(warn).toHaveBeenCalledTimes(1);
      const [message] = warn.mock.calls[0] as [string];
      // Deduplicated across the whole tree, not one warning per string.
      expect(message).toContain("李");
      expect(message).toContain("Ж");
    } finally {
      warn.mockRestore();
    }
  });

  it("stays quiet when everything survives, translated or not", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      sanitizeForPdf({ a: "Screened → ✓", b: "Björn Håkansson — Klarna" });
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});
