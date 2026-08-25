import { describe, expect, it } from "vitest";
import { buildRelationshipUpdate } from "./relationship-merge";
import type { RelationshipJudgment } from "@/lib/ai/relationship";

const NOW = new Date("2026-08-25T12:00:00Z");

function judgment(
  overrides: Partial<RelationshipJudgment> = {}
): RelationshipJudgment {
  return {
    relationship_state: "engaged",
    disposition: {
      summary: "Warm after two replies.",
      timing: "Open from Q1",
      motivation: null,
      location_constraints: null,
      compensation_context: null,
      notice_period: null,
      open_questions: ["Confirm notice period"],
    },
    follow_up_at: "2026-09-10",
    follow_up_note: "Nudge after their board week.",
    ...overrides,
  };
}

describe("buildRelationshipUpdate", () => {
  it("builds exactly the four maintainable fields plus the stamp", () => {
    const update = buildRelationshipUpdate({
      judgment: judgment(),
      profileDnc: false,
      lastMeaningfulContactAt: "2026-08-20T09:00:00Z",
      now: NOW,
    });
    expect(Object.keys(update).sort()).toEqual([
      "disposition",
      "follow_up_at",
      "follow_up_note",
      "last_meaningful_contact_at",
      "relationship_state",
      "updated_at",
    ]);
    expect(update.relationship_state).toBe("engaged");
    expect(update.follow_up_at).toBe("2026-09-10");
    expect(update.last_meaningful_contact_at).toBe("2026-08-20T09:00:00Z");
  });

  it("writes NO state for a suppressed profile — the rest still lands", () => {
    const update = buildRelationshipUpdate({
      judgment: judgment(),
      profileDnc: true,
      lastMeaningfulContactAt: null,
      now: NOW,
    });
    expect(update.relationship_state).toBeUndefined();
    expect(update.disposition.summary).toBe("Warm after two replies.");
  });

  it("writes NO state when the model strays outside the writable vocabulary", () => {
    const update = buildRelationshipUpdate({
      judgment: judgment({
        relationship_state:
          "do_not_contact" as RelationshipJudgment["relationship_state"],
      }),
      profileDnc: false,
      lastMeaningfulContactAt: null,
      now: NOW,
    });
    expect(update.relationship_state).toBeUndefined();
  });

  it("nulls a malformed follow-up date and blank notes", () => {
    const update = buildRelationshipUpdate({
      judgment: judgment({ follow_up_at: "soon", follow_up_note: "   " }),
      profileDnc: false,
      lastMeaningfulContactAt: null,
      now: NOW,
    });
    expect(update.follow_up_at).toBeNull();
    expect(update.follow_up_note).toBeNull();
  });

  it("never carries a dnc key whatever the model returned", () => {
    const update = buildRelationshipUpdate({
      judgment: judgment(),
      profileDnc: false,
      lastMeaningfulContactAt: null,
      now: NOW,
    }) as unknown as Record<string, unknown>;
    expect(update.dnc).toBeUndefined();
    expect(update.dnc_reason).toBeUndefined();
    expect(update.dnc_set_at).toBeUndefined();
    expect(update.dnc_set_by).toBeUndefined();
  });
});
