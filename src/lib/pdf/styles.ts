import { StyleSheet } from "@react-pdf/renderer";

// Mandate PDF visual system. Single source of truth so the evaluation
// PDF and the comparison PDF share identical typography, colours, and
// chrome. Hex values are picked to legibly print on both screen and
// black-and-white photocopy — high contrast on the dark header,
// medium-contrast on body text.

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
