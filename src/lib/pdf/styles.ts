import { Font, StyleSheet } from "@react-pdf/renderer";

// react-pdf hyphenates automatically, which in narrow table cells splits
// ordinary words mid-syllable: "Not as-sessed", "DIMEN-SION", "Their
// ac-count". In the evidence grid that is every cell, and "Not assessed" is
// the phrase carrying the whole absence-is-a-finding idea — it has to read
// cleanly. Returning the word whole makes it wrap at spaces instead.
//
// Names are the one place a word can be too wide for its column on its own
// (a double-barrelled surname is a single unbreakable token). Breaking those
// is handled where it happens, by laying the name out over several lines —
// letting the hyphenator do it renders a doubled hyphen, because it appends
// its own to a fragment that already ends in one.
// Applies to every Mandate PDF, since they all import this module.
Font.registerHyphenationCallback((word) => [word]);

// Mandate PDF visual system. Single source of truth so the evaluation
// PDF and the comparison PDF share identical typography, colours, and
// chrome. Hex values are picked to legibly print on both screen and
// black-and-white photocopy — high contrast on the dark header,
// medium-contrast on body text.

// GLYPH SAFETY
//
// These documents use the standard base-14 PDF fonts (Helvetica), whose
// WinAnsi encoding covers Latin-1 and little else. A character outside it is
// not dropped and does not raise — react-pdf emits whatever byte falls at
// that position, so "→" prints as "’", "▲" as "²" and "▼" as "¼". Both
// arrows and triangles shipped in the weekly report this way.
//
// Safe: accented Latin, — – … « » · † ‡ ‰ € £ © ® ° ± × ÷ ¼ ½ ¾ and curly
// quotes. Not safe: arrows, geometric shapes, check marks, most maths, and
// emoji. AI-generated prose is the standing risk here, since nothing stops a
// model emitting "→" or "✓" mid-sentence; anything new that reaches a PDF
// wants a look at the rendered output, not just the JSX.
export const PDF_COLORS = {
  ink: "#0b1020",
  inkSoft: "#1f2937",
  paper: "#ffffff",
  paperAlt: "#f5f7fa",
  paperLow: "#e9edf2",
  outline: "#cbd5e1",
  outlineSoft: "#e2e8f0",
  textPrimary: "#0f172a",
  textMuted: "#475569",
  textDim: "#64748b",
  accent: "#1d4ed8",
  accentSoft: "#dbeafe",
  good: "#0d6e4e",
  goodSoft: "#dcfce7",
  warn: "#b45309",
  warnSoft: "#fef3c7",
  bad: "#9f1239",
  badSoft: "#fee2e2",
  brand: "#000000",
  brandText: "#ffffff",
} as const;

/**
 * Usable width inside `body` on A4 (595.28pt less 36pt padding a side).
 * Table column budgets are checked against this — a table whose fixed
 * columns exceed it silently clips at the right margin.
 */
export const PDF_CONTENT_WIDTH = 595.28 - 72;

/** Side padding on numeric cells and their headings. Shared so they align. */
const NUM_COL_PADDING = 4;

/**
 * Clearance between the brand bar and whatever follows it.
 *
 * The bar is `fixed`, so it repeats in the flow at the top of every page —
 * and so does this margin, which is the point. Continuation pages used to
 * start their content about 8pt under the black band, close enough to touch
 * it, because the only top padding was on `body` and `body` occurs once.
 *
 * On page one the subhead cancels it with an equal negative margin, so the
 * two masthead bands stay flush and read as one block. Nothing else follows
 * the bar directly, so nothing else needs to.
 */
const BRAND_BAR_GAP = 18;

/**
 * Space a callout needs below it before it will start on the current page.
 *
 * Without this the Final Verdict block opened at the foot of a page with
 * room for its border and nothing else, stranding a bare blue rule at the
 * top of the next one. Roughly a label plus two lines — enough that a
 * callout which does start is worth reading. Deliberately not `wrap={false}`:
 * these hold AI-generated prose of no fixed length, and an unsplittable
 * block taller than the page would be clipped rather than flowed.
 */
export const PDF_CALLOUT_MIN_PRESENCE = 56;

// TABLES ACROSS PAGE BREAKS
//
// Two failures, and they trade against each other. A row left to split puts
// a candidate's name on one page and their figures on the next; stopping
// that moves the break up, so the heading band opens the foot of a page with
// its rows overleaf, which is worse — the columns arrive unlabelled.
//
// `minPresenceAhead` reads like the answer and is not: it governs the space
// that must follow an element, so it neither holds a heading to its rows nor
// pushes a table onto the next page. Verified against rendered output.
//
// What works depends on whether the row count is bounded. A table with a
// fixed number of rows is `wrap={false}` and moves whole. The comparison
// master table has one row per candidate and can genuinely outgrow a page,
// so it wraps, and its heading is `fixed` to repeat above the continuation.

export const PDF_STYLES = StyleSheet.create({
  page: {
    paddingTop: 0,
    paddingBottom: 48,
    paddingHorizontal: 0,
    fontFamily: "Helvetica",
    fontSize: 10,
    color: PDF_COLORS.textPrimary,
    backgroundColor: PDF_COLORS.paper,
  },
  // Header band — the brand strip every page carries.
  brandBar: {
    backgroundColor: PDF_COLORS.brand,
    color: PDF_COLORS.brandText,
    paddingVertical: 18,
    paddingHorizontal: 36,
    marginBottom: BRAND_BAR_GAP,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  brandMark: {
    fontSize: 22,
    fontFamily: "Helvetica-Bold",
    color: PDF_COLORS.brandText,
    letterSpacing: 6,
  },
  brandKicker: {
    fontSize: 8,
    fontFamily: "Helvetica",
    color: "#94a3b8",
    letterSpacing: 2,
    marginTop: 4,
  },
  brandMeta: {
    fontSize: 8,
    fontFamily: "Helvetica",
    color: "#94a3b8",
    letterSpacing: 2,
    textAlign: "right",
  },
  // Subhead band sits directly below the brand bar; a thin tinted strip
  // that names the report and binds it to the role.
  subhead: {
    backgroundColor: PDF_COLORS.paperAlt,
    paddingVertical: 14,
    paddingHorizontal: 36,
    // Cancels the brand bar's gap so the two bands stay flush. Page one only,
    // which is the only page the subhead appears on.
    marginTop: -BRAND_BAR_GAP,
    borderBottomWidth: 1,
    borderBottomColor: PDF_COLORS.outline,
  },
  subheadTitle: {
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
    color: PDF_COLORS.textPrimary,
  },
  subheadMeta: {
    fontSize: 9,
    color: PDF_COLORS.textMuted,
    marginTop: 4,
    letterSpacing: 1,
  },
  // Body container — adds horizontal padding the header bands ignore.
  body: {
    paddingHorizontal: 36,
    paddingTop: 18,
  },
  // Section heading
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 14,
    marginBottom: 8,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: PDF_COLORS.outlineSoft,
  },
  sectionLabel: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: PDF_COLORS.textMuted,
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  sectionMeta: {
    marginLeft: "auto",
    fontSize: 8,
    color: PDF_COLORS.textDim,
  },
  // Generic paragraph
  p: {
    fontSize: 10,
    lineHeight: 1.45,
    color: PDF_COLORS.textPrimary,
    marginBottom: 6,
  },
  pMuted: {
    fontSize: 9,
    lineHeight: 1.4,
    color: PDF_COLORS.textMuted,
    marginBottom: 4,
  },
  bold: {
    fontFamily: "Helvetica-Bold",
  },
  // Tier / status pills
  pill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 1,
    textTransform: "uppercase",
    borderRadius: 2,
    color: "#ffffff",
    overflow: "hidden",
  },
  // Table primitives
  table: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: PDF_COLORS.outlineSoft,
    marginTop: 4,
    marginBottom: 8,
  },
  thead: {
    flexDirection: "row",
    backgroundColor: PDF_COLORS.ink,
  },
  th: {
    paddingHorizontal: 6,
    paddingVertical: 6,
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: "#ffffff",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  // Numeric column heading. `th`'s letterSpacing and 6pt side padding cost
  // more width than a narrow score column has, so the label used to overflow
  // its box and collide with its neighbour ("TECHDOM LEADREG XFOR"). Tighter
  // tracking and padding let the label sit inside the column it labels.
  thNum: {
    paddingHorizontal: NUM_COL_PADDING,
    paddingVertical: 6,
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: "#ffffff",
    letterSpacing: 0,
    textTransform: "uppercase",
    textAlign: "right",
  },
  tbodyRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderColor: PDF_COLORS.outlineSoft,
  },
  td: {
    paddingHorizontal: 6,
    paddingVertical: 6,
    fontSize: 9,
    color: PDF_COLORS.textPrimary,
  },
  tdNum: {
    // Must match thNum's padding or the figures sit off their heading.
    paddingHorizontal: NUM_COL_PADDING,
    fontFamily: "Helvetica-Bold",
    textAlign: "right",
  },
  // Callout block
  callout: {
    borderLeftWidth: 3,
    borderLeftColor: PDF_COLORS.accent,
    backgroundColor: PDF_COLORS.paperAlt,
    padding: 10,
    marginVertical: 6,
  },
  calloutLabel: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: PDF_COLORS.accent,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  // Footer
  footer: {
    position: "absolute",
    bottom: 18,
    left: 36,
    right: 36,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 8,
    color: PDF_COLORS.textDim,
  },
});

export function tierColor(
  tier: "tier_1" | "tier_2" | "tier_3" | "tier_4"
): string {
  if (tier === "tier_1") return PDF_COLORS.good;
  if (tier === "tier_2") return PDF_COLORS.accent;
  if (tier === "tier_3") return PDF_COLORS.warn;
  return PDF_COLORS.bad;
}

export function scoreColor(value: number): string {
  if (value >= 8) return PDF_COLORS.good;
  if (value >= 5) return PDF_COLORS.accent;
  return PDF_COLORS.bad;
}
