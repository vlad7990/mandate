import { describe, expect, it } from "vitest";
import { humanizeTerminalTitle } from "./page-shell";

/**
 * The twelve tokens actually in the product, so the derived names can be
 * read as a list and judged as English rather than asserted one at a time.
 * If a thirteenth is added and derives badly, the fix is a `label` prop —
 * this list is what makes "badly" visible.
 */
describe("humanizeTerminalTitle", () => {
  it.each([
    ["PLACEMENTS_AND_FEES", "Placements and fees"],
    ["GLOBAL_EXECUTIVE_NETWORK", "Global executive network"],
    ["ACCESS_REQUESTS", "Access requests"],
    ["SKILLS_STUDIO", "Skills studio"],
    ["EDIT_SKILL", "Edit skill"],
    ["NEW_SKILL", "New skill"],
    ["ACTIVITY_TRAIL", "Activity trail"],
    ["RANK_LEADERBOARD", "Rank leaderboard"],
    ["COMPARATIVE_MARKET_REPORT", "Comparative market report"],
    ["CALIBRATION_HISTORY", "Calibration history"],
    ["WEEKLY_PROGRESS_REPORT", "Weekly progress report"],
  ])("%s → %s", (token, expected) => {
    expect(humanizeTerminalTitle(token)).toBe(expected);
  });

  // The one the derivation gets wrong, which is why `label` exists. Pinned
  // so that nobody "fixes" the derivation to special-case acronyms and
  // quietly breaks the override at the call site.
  it("derives an acronym badly, which is what the label prop is for", () => {
    expect(humanizeTerminalTitle("AI_CANDIDATE_SEARCH")).toBe(
      "Ai candidate search"
    );
  });

  it("is sentence case, not title case", () => {
    expect(humanizeTerminalTitle("WEEKLY_PROGRESS_REPORT")).not.toBe(
      "Weekly Progress Report"
    );
  });

  it("survives a token with no underscore", () => {
    expect(humanizeTerminalTitle("PLACEMENTS")).toBe("Placements");
  });

  it("survives empty and degenerate tokens rather than throwing", () => {
    expect(humanizeTerminalTitle("")).toBe("");
    expect(humanizeTerminalTitle("___")).toBe("___");
  });
});
