// Making text safe for the PDF fonts.
//
// The documents use the standard base-14 PDF fonts, whose WinAnsi encoding
// covers Latin-1 and a short list of typographic extras. react-pdf does not
// drop a character outside that set and does not raise on one — it emits
// whatever byte sits at that position. The weekly report shipped printing
// "→" as "’", "▲" as "²" and "▼" as "¼" for exactly this reason.
//
// Those two were literals in our own source and are simply fixed. This module
// exists for the text we do not write: evaluation narratives, market
// commentary, positioning lines and verdicts all arrive from a model, and
// nothing stops one emitting "→" or "✓" mid-sentence.
//
// ── The limit of this approach ──
//
// A sanitiser can only map a character onto one the font already has. It
// cannot render a script the font lacks. A candidate named in Chinese,
// Japanese, Korean, Greek, Hebrew, Arabic or Cyrillic comes out as question
// marks, which for a recruiting product is a worse failure than a wrong
// arrow — it erases the person. The fix for that is an embedded font with
// the coverage, not a bigger replacement table. Until one is registered,
// `unsupportedGlyphs` is what tells you it is happening rather than letting
// it reach a client unnoticed.

/**
 * Printed in place of a character with no representation at all.
 *
 * A visible mark rather than a silent deletion: dropping the character would
 * turn an unrenderable name into an empty cell, and an empty cell reads as
 * "nobody", which is a claim we do not want the font making.
 */
export const UNSUPPORTED_MARK = "?";

/**
 * The 27 printable characters WinAnsi carries at 0x80–0x9F, where Latin-1
 * has controls. Curly quotes, dashes, the bullet and the ellipsis all live
 * here — which is why ordinary typographic punctuation needs no replacing.
 */
const CP1252_EXTRAS = new Set([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030,
  0x0160, 0x2039, 0x0152, 0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022,
  0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178,
]);

/** Whether the font can print this code point as itself. */
export function isRepresentable(codePoint: number): boolean {
  // Newline is load-bearing — the weekly report's executive summary is
  // paragraph-separated — and react-pdf honours it.
  if (codePoint === 0x0a || codePoint === 0x0d || codePoint === 0x09) {
    return true;
  }
  if (codePoint >= 0x20 && codePoint <= 0x7e) return true;
  if (codePoint >= 0xa0 && codePoint <= 0xff) return true;
  return CP1252_EXTRAS.has(codePoint);
}

/**
 * Characters worth translating rather than marking unsupported.
 *
 * Every value here is a judgement call about what the sentence should say
 * once the symbol cannot be drawn, and they are meant to be argued with. The
 * rule followed: keep the meaning, accept slightly plainer prose. A tick
 * becoming "yes" reads a little flatly mid-sentence, but it survives being
 * read aloud, which "?" does not.
 */
export const GLYPH_REPLACEMENTS: Readonly<Record<string, string>> = {
  // Direction. "»" and "«" are in the encoding and carry a stage change
  // ("Screened » Client interview") better than a word would.
  "→": "»", "⟶": "»", "⇒": "»", "➔": "»", "➜": "»", "➞": "»", "↦": "»",
  "←": "«", "⟵": "«", "⇐": "«",
  // Vertical direction is nearly always a ranking move, where the word is
  // clearer than any symbol the font has.
  "↑": "up", "⬆": "up", "▲": "up", "▴": "up",
  "↓": "down", "⬇": "down", "▼": "down", "▾": "down",
  // Polarity. Dropping these would invert the meaning of a "✓ / ✗" list.
  "✓": "yes", "✔": "yes", "☑": "yes",
  "✗": "no", "✘": "no", "✕": "no", "☒": "no", "❌": "no",
  // Decorative marks collapse onto punctuation the font has.
  "‣": "•", "▪": "•", "▫": "•", "●": "•", "○": "•", "■": "•", "□": "•",
  "★": "*", "☆": "*", "✦": "*", "❖": "*",
  // Maths and comparison, spelled out rather than approximated.
  "≥": ">=", "≤": "<=", "≠": "!=", "≈": "~", "±": "±", "−": "-", "∞": "infinity",
  // Punctuation with exact equivalents.
  "′": "'", "″": '"', "‹": "‹", "⁄": "/", "‑": "-", "‒": "–", "―": "—",
  "ﬁ": "fi", "ﬂ": "fl", "ﬀ": "ff", "ﬃ": "ffi", "ﬄ": "ffl",
  // Spaces that are not the space character.
  " ": " ", " ": " ", " ": " ", " ": " ", " ": " ",
  // Invisible. These must map to nothing rather than to UNSUPPORTED_MARK,
  // or a zero-width joiner nobody can see becomes a "?" everybody can.
  "​": "", "‌": "", "‍": "", "﻿": "",
};

/**
 * Make a string printable, translating what can be translated and marking
 * what cannot. Iterates by code point, so an emoji counts once rather than
 * once per surrogate half.
 */
export function pdfSafeText(input: string): string {
  let out = "";
  for (const char of input) {
    const replacement = GLYPH_REPLACEMENTS[char];
    if (replacement !== undefined) {
      out += replacement;
      continue;
    }
    out += isRepresentable(char.codePointAt(0) as number)
      ? char
      : UNSUPPORTED_MARK;
  }
  return out;
}

/**
 * The characters in a string that would not survive, deduplicated.
 *
 * Separate from `pdfSafeText` because the interesting question is usually
 * not "what did it print" but "is a model emitting things we have no glyph
 * for" — which is worth knowing before a client sees it. Excludes anything
 * with a replacement, since those are handled rather than lost.
 */
export function unsupportedGlyphs(input: string): string[] {
  const found = new Set<string>();
  for (const char of input) {
    if (char in GLYPH_REPLACEMENTS) continue;
    if (!isRepresentable(char.codePointAt(0) as number)) found.add(char);
  }
  return [...found];
}

/**
 * Apply `pdfSafeText` to every string in a value, preserving its shape.
 *
 * Applied once at each document's entry rather than at every interpolation:
 * a PDF has dozens of text nodes, and a guard that has to be remembered at
 * each one is a guard that will be missed at the one that matters. Numbers,
 * booleans and nulls pass through; so do class instances and React elements,
 * which are not ours to rebuild.
 */
export function sanitizeForPdf<T>(value: T): T {
  const lost = new Set<string>();
  const result = walk(value, lost);

  // Substituting quietly is how the arrows survived to production in the
  // first place. A character with no glyph at all is the case a replacement
  // table cannot fix — usually a name in a script the font does not carry —
  // so say so while someone is still in a position to notice.
  if (lost.size > 0 && process.env.NODE_ENV !== "production") {
    console.warn(
      `[pdf] no glyph for ${[...lost].join(" ")} — printed as "${UNSUPPORTED_MARK}". ` +
        `The base-14 fonts cover Latin-1 only; rendering this needs an embedded font.`
    );
  }

  return result;
}

function walk<T>(value: T, lost: Set<string>): T {
  if (typeof value === "string") {
    for (const char of unsupportedGlyphs(value)) lost.add(char);
    return pdfSafeText(value) as T;
  }
  if (Array.isArray(value)) return value.map((v) => walk(v, lost)) as T;

  if (value !== null && typeof value === "object") {
    // Plain objects only. A Date, a Map or a React element rebuilt key by key
    // would come back as something that is no longer one.
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) return value;
    if ("$$typeof" in value) return value;

    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      out[key] = walk(nested, lost);
    }
    return out as T;
  }

  return value;
}
