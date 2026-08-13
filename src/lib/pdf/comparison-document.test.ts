// Layout guards for the comparison PDF.
//
// These exist because react-pdf fails silently on overflow: a column whose
// heading is wider than its box does not error, it prints over its neighbour,
// and a table wider than the page prints its last column off the right edge.
// Both shipped undetected until the document was first rendered and looked at.
// Nothing here replaces looking at the output — they only catch the widths
// drifting back.

import { describe, expect, it } from "vitest";
import {
  MASTER_TABLE_FIXED_WIDTH,
  gridDensity,
} from "./comparison-document";
import { PDF_CONTENT_WIDTH } from "./styles";

/**
 * Rough advance width of Helvetica-Bold as a fraction of font size, for
 * uppercase labels and for mixed-case names. Estimates, deliberately — the
 * point is to catch a column being halved, not to typeset to the point.
 */
const BOLD_CAPS_EM = 0.62;
const BOLD_MIXED_EM = 0.56;

function estimateWidth(
  text: string,
  fontSize: number,
  { tracking = 0, caps = false }: { tracking?: number; caps?: boolean } = {}
): number {
  const em = caps ? BOLD_CAPS_EM : BOLD_MIXED_EM;
  return text.length * (em * fontSize + tracking);
}

/**
 * The widest run of characters that cannot be broken across lines. This, not
 * the whole string, is what has to fit a column — everything else wraps at a
 * space. Double-barrelled surnames are the hard case: one long token.
 */
function longestToken(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .reduce((longest, token) => (token.length > longest.length ? token : longest), "");
}

describe("master scoring table widths", () => {
  it("leaves the candidate column a workable share of the page", () => {
    const nameColumn = PDF_CONTENT_WIDTH - MASTER_TABLE_FIXED_WIDTH;
    // Names and titles wrap, but below roughly this the title becomes a
    // four-line stack and the row stops reading as one line per person.
    expect(nameColumn).toBeGreaterThan(180);
  });

  it("fits within the page", () => {
    expect(MASTER_TABLE_FIXED_WIDTH).toBeLessThan(PDF_CONTENT_WIDTH);
  });

  it("gives each score column room for its own heading", () => {
    // The headings, not the digits, are the widest thing in these columns —
    // which is exactly what the original widths were sized for and why they
    // collided ("TECHDOM LEADREG XFOR").
    const SCORE_COL = 34;
    const PADDING = 4 * 2;
    for (const heading of ["Tech", "Dom", "Lead", "Reg", "Xform"]) {
      expect(estimateWidth(heading, 7, { caps: true })).toBeLessThan(
        SCORE_COL - PADDING
      );
    }
    expect(estimateWidth("Overall", 7, { caps: true })).toBeLessThan(
      42 - PADDING
    );
  });
});

describe("evidence grid density", () => {
  const DIMENSION_COL = 84;
  const columnWidth = (n: number) => (PDF_CONTENT_WIDTH - DIMENSION_COL) / n;

  it("never grows the type as the slate grows", () => {
    let previous = Infinity;
    for (let n = 1; n <= 12; n += 1) {
      const { name } = gridDensity(n);
      expect(name).toBeLessThanOrEqual(previous);
      previous = name;
    }
  });

  // The case that overprinted the next candidate's name: one long unbreakable
  // token. Stacking splits it at the hyphen it already contains, so the token
  // that has to fit shrinks from the whole surname to its second half.
  const NAME = "Alexander Mwangi-Fitzgerald";
  const STACKED_TOKEN = "Fitzgerald";

  // Nine is where even the stacked layout runs out of portrait A4; the page
  // builds this grid from at most four candidates today.
  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9])(
    "keeps a long surname inside its column at %i candidates",
    (n) => {
      const density = gridDensity(n);
      const available = columnWidth(n) - density.pad * 2;
      const token = density.stack ? STACKED_TOKEN : longestToken(NAME);
      expect(
        estimateWidth(token, density.name, { tracking: density.tracking })
      ).toBeLessThan(available);
    }
  );

  it("stacks the name once columns are too narrow to hold a full one", () => {
    expect(gridDensity(4).stack).toBe(false);
    expect(gridDensity(6).stack).toBe(true);
    expect(gridDensity(8).stack).toBe(true);
  });
});
