/**
 * Single source of truth for every count and section index the
 * marketing surface renders.
 *
 * Why this file exists: the page previously described the same system
 * as 17 agents (body), 14 agents (meta description + OG card), twelve
 * modules (prose) and 31 modules (hero rail) — and printed section
 * numerals 00–10 with 01 and 03 missing from the watermarks while the
 * eyebrows skipped 02 and used 03 twice. On a product whose entire
 * pitch is that its outputs reconcile, the homepage failing to
 * reconcile is a category refutation, not a typo. Derive, never retype.
 */

import { AGENTS } from "./_data/agents";

/**
 * Specialist agents in the system.
 *
 * Derived from the roster in `_data/agents.ts` rather than typed, so
 * the number in the hero rail, the meta description, the OG card and
 * the Platform page's phase map cannot disagree with the list of names
 * the Platform page actually renders.
 */
export const AGENT_COUNT = AGENTS.length;

/**
 * Agents gated behind the Executive Intelligence add-on.
 *
 * Derived, because the sentence on `/platform` used to say "Three of
 * the 17" as a typed word above a list whose add-on flags said
 * something else — the same class of error as the roster itself, and
 * the reason `_constants.ts` exists. Say it once, from the data.
 */
export const ADDON_AGENT_COUNT = AGENTS.filter((a) => a.addOn).length;

/** Specialised modules across the three intelligence layers. */
export const MODULE_COUNT = 12;

/** Scoring dimensions in the calibration model. */
export const DIMENSION_COUNT = 5;

/** Perspectives triangulated in the fusion layer. */
export const PERSPECTIVE_COUNT = 4;

type Section = { readonly numeral: string; readonly label: string };

/**
 * Section order matches the composition order in `page.tsx`. The
 * numeral drives the decorative watermark and the label drives the
 * eyebrow, so the two tracks cannot drift apart again.
 */
export const SECTIONS = {
  hero: { numeral: "00", label: "Mandate" },
  problem: { numeral: "01", label: "The problem" },
  simulator: { numeral: "02", label: "Live" },
  // Guardrails sit directly after the proof, not seven sections later.
  // The buyer's real question is "does this replace my judgment?" — it
  // has to be answered while they are still looking at the output, not
  // after ~7,000px of capability claims they have already discounted.
  principles: { numeral: "03", label: "Guardrails" },
  howItWorks: { numeral: "04", label: "How it works" },
  stack: { numeral: "05", label: "Stack" },
  // §169: the arc used to stop at the slate, which is where the PRODUCT
  // stopped in early 2026 and has not stopped since. The client's own
  // portal, the placement and the invoice all shipped without ever
  // reaching the homepage. Inserting here renumbers everything below —
  // which is exactly why these numerals are derived and never typed.
  afterTheSlate: { numeral: "06", label: "After the slate" },
  triangulation: { numeral: "07", label: "The fusion layer" },
  executiveIntelligence: {
    numeral: "08",
    label: "Executive Intelligence · Add-on",
  },
  pricing: { numeral: "09", label: "Pricing" },
  faq: { numeral: "10", label: "Questions" },
  cta: { numeral: "11", label: "Get started" },
} as const satisfies Record<string, Section>;

/** Renders the canonical `NN / Label` eyebrow string. */
export function eyebrow(section: Section): string {
  return `${section.numeral} / ${section.label}`;
}
