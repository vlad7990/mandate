import { describe, expect, it } from "vitest";
import {
  previewMerge,
  describeConfirm,
  describeReceipt,
  type RecordSummary,
  type MergeReceipt,
} from "./merge";

/**
 * The words around an irreversible delete.
 *
 * The MECHANICS are `merge_candidates` (migration 142) and are proven by
 * drive 134 and by a live call through PostgREST, not here — no unit test
 * can reparent eighteen tables. What is tested here is the part that
 * decides whether a recruiter presses the button understanding what it
 * does: the confirm and the receipt.
 *
 * Both are asserted almost word for word, on purpose. This sentence IS the
 * safeguard.
 */

function rec(over: Partial<RecordSummary> & { id: string }): RecordSummary {
  return {
    fullName: "James Chen",
    stage: "found",
    score: null,
    notes: 0,
    cvName: null,
    email: null,
    linkedinUrl: null,
    currentTitle: null,
    currentCompany: "Barclays",
    hasPlacement: false,
    createdAt: "2026-09-01T00:00:00Z",
    ...over,
  };
}

describe("previewMerge — what is about to happen", () => {
  it("refuses outright when the record being discarded carries a placement (D3)", () => {
    const preview = previewMerge(
      rec({ id: "keep" }),
      rec({ id: "drop", fullName: "James Chen", hasPlacement: true })
    );
    expect(preview.refused).toBe(true);
    expect(preview.refusal).toContain("carries a placement");
    expect(preview.refusal).toContain("nothing has been changed");
    // A refusal must not also describe gains and losses — there are none.
    expect(preview.keeps).toEqual([]);
    expect(preview.loses).toEqual([]);
  });

  it("does NOT refuse when the SURVIVOR is the one carrying the placement", () => {
    // Only the discarded record's placement is a problem. Refusing here
    // would block the very resolution D3 tells the recruiter to make.
    const preview = previewMerge(
      rec({ id: "keep", hasPlacement: true }),
      rec({ id: "drop" })
    );
    expect(preview.refused).toBe(false);
  });

  it("counts a score as lost ONLY when both records have one (D1)", () => {
    const collision = previewMerge(
      rec({ id: "keep", score: 72 }),
      rec({ id: "drop", score: 68 })
    );
    expect(collision.loses.join(" ")).toContain("its score of 68");
    expect(collision.loses.join(" ")).toContain("this record's 72");

    // The survivor has none, so the other record's score MOVES and
    // nothing is lost. Calling that a loss would be a lie that makes a
    // recruiter hesitate over a merge that costs them nothing.
    const noCollision = previewMerge(
      rec({ id: "keep", score: null }),
      rec({ id: "drop", score: 68 })
    );
    expect(noCollision.loses.join(" ")).not.toContain("score");
  });

  it("promises notes will move, attributed", () => {
    const preview = previewMerge(
      rec({ id: "keep" }),
      rec({ id: "drop", notes: 3 })
    );
    expect(preview.keeps.join(" ")).toContain("3 notes move across");
    expect(preview.keeps.join(" ")).toContain("attributed");
  });

  it("names a blank that will be filled, and stays silent about one that will not (D4)", () => {
    const fills = previewMerge(
      rec({ id: "keep", email: null }),
      rec({ id: "drop", email: "j.chen@barclays.com" })
    );
    expect(fills.keeps.join(" ")).toContain("email address");

    const noOverwrite = previewMerge(
      rec({ id: "keep", email: "already@here.com" }),
      rec({ id: "drop", email: "j.chen@barclays.com" })
    );
    expect(noOverwrite.keeps.join(" ")).not.toContain("email address");
  });

  it("always names the loss of the record itself", () => {
    const preview = previewMerge(rec({ id: "keep" }), rec({ id: "drop" }));
    expect(preview.loses.join(" ")).toContain("cannot be brought back");
  });

  it("names the CV that is deleted with the discarded record", () => {
    const preview = previewMerge(
      rec({ id: "keep" }),
      rec({ id: "drop", cvName: "chen-cv.pdf" })
    );
    expect(preview.loses.join(" ")).toContain("chen-cv.pdf");
  });
});

describe("describeConfirm — the last thing before an irreversible delete", () => {
  it("names both records, the losses, and that there is no undo", () => {
    const keep = rec({ id: "keep", fullName: "James Chen", score: 72 });
    const discard = rec({
      id: "drop",
      fullName: "J. Chen",
      score: 68,
      notes: 2,
      cvName: "chen-v2.pdf",
    });
    const text = describeConfirm(keep, discard, previewMerge(keep, discard));

    expect(text).toContain('Keep "James Chen" and discard "J. Chen"?');
    expect(text).toContain("Lost for good:");
    expect(text).toContain("its score of 68");
    expect(text).toContain("chen-v2.pdf");
    expect(text).toContain("This cannot be undone.");
    expect(text).toContain("2 notes move across");
  });

  it("omits the carried-over section entirely when nothing is carried", () => {
    const keep = rec({ id: "keep" });
    const discard = rec({ id: "drop" });
    const text = describeConfirm(keep, discard, previewMerge(keep, discard));
    expect(text).not.toContain("Carried over:");
    expect(text).toContain("This cannot be undone.");
  });
});

describe("describeReceipt — what actually happened", () => {
  function receipt(over: Partial<MergeReceipt> = {}): MergeReceipt {
    return {
      kept_id: "keep",
      kept_label: "James Chen",
      discarded_label: "J. Chen",
      discarded_cv: null,
      moved: {},
      dropped: {},
      filled: [],
      ...over,
    };
  }

  it("reads the receipt the database returned, not the prediction", () => {
    const text = describeReceipt(
      receipt({
        moved: { notes: 6, feedback: 2, trail_events: 11 },
        filled: ["email"],
        dropped: { score: 68 },
      })
    );
    expect(text).toContain('Merged "J. Chen" into "James Chen".');
    expect(text).toContain("6 notes");
    expect(text).toContain("2 pieces of feedback");
    expect(text).toContain("11 trail entries");
    expect(text).toContain("Filled a blank field: email");
    expect(text).toContain("Dropped: the other record's score of 68");
  });

  it("singularises, so a receipt never reads '1 notes'", () => {
    const text = describeReceipt(receipt({ moved: { notes: 1, feedback: 1 } }));
    expect(text).toContain("1 note,");
    expect(text).toContain("1 piece of feedback");
    expect(text).not.toContain("1 notes");
  });

  it("says nothing about drops when nothing was dropped", () => {
    const text = describeReceipt(receipt({ moved: { notes: 2 } }));
    expect(text).not.toContain("Dropped");
  });

  it("still reads when the merge moved nothing at all", () => {
    expect(describeReceipt(receipt())).toBe(
      'Merged "J. Chen" into "James Chen".'
    );
  });

  it("reports drops LAST and never silently", () => {
    // The order matters: the drop is the half a recruiter needs to
    // notice, and burying it mid-sentence is how it gets missed.
    const text = describeReceipt(
      receipt({ moved: { notes: 1 }, dropped: { engagement: 1, prescreens: 1 } })
    );
    expect(text.indexOf("Dropped")).toBeGreaterThan(text.indexOf("Moved"));
    expect(text).toContain("1 engagement lane");
    expect(text).toContain("1 prescreen");
  });
});
