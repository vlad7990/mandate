import { describe, expect, it } from "vitest";
import {
  SAMPLE_ACTIVITY,
  sampleActivityFor,
  sampleActivityGroups,
} from "./activity";
import { SAMPLE_CLIENTS, SAMPLE_MANDATES, SAMPLE_PLACEMENTS } from "./data";
import { describeActivity, describeActor, isMoneyEvent } from "@/lib/activity/describe";
import {
  ACTIVITY_EVENT_TYPES,
  ACTIVITY_GROUP_OF,
  APP_RECORDABLE_EVENTS,
} from "@/lib/activity/types";

/**
 * The activity trail is a projection, so almost everything worth asserting
 * is that it agrees with what it projects.
 */

describe("the sample trail renders through the product's own describer", () => {
  it("produces a real sentence for every row", () => {
    // The point of storing rows rather than prose: `describeActivity` writes
    // the sentence, so the sample cannot word an event differently from the
    // product. A row whose detail is wrong shows up as a degenerate string.
    for (const row of SAMPLE_ACTIVITY) {
      const sentence = describeActivity(row);
      expect(sentence.length, `${row.event_type} rendered nothing`).toBeGreaterThan(10);
      // The fallback arm renders the event type with underscores stripped.
      // Hitting it means the row is of a type `describe.ts` does not handle.
      expect(sentence).not.toBe(row.event_type.replace(/_/g, " "));
      expect(sentence).not.toContain("undefined");
      expect(sentence).not.toContain("null");
      expect(sentence).not.toContain("NaN");
    }
  });

  it("uses only event types the vocabulary has", () => {
    const known = new Set<string>(ACTIVITY_EVENT_TYPES);
    for (const row of SAMPLE_ACTIVITY) {
      expect(known.has(row.event_type)).toBe(true);
    }
  });

  it("shows no event the product cannot actually write", () => {
    /*
      `report_exported` and `hm_portal_opened` are in the vocabulary and are
      deliberately never written — the first because the only honest place
      to log it is client-side, the second because the portal has no session
      for the RPC to stamp. A sample that showed either would be teaching a
      feature that does not exist.
    */
    const unwritten = new Set<string>(["report_exported", "hm_portal_opened"]);
    // Guard: if these ever start being written, this assertion should be
    // revisited rather than silently passing on a stale list.
    for (const e of unwritten) expect(APP_RECORDABLE_EVENTS).toContain(e);

    expect(SAMPLE_ACTIVITY.filter((r) => unwritten.has(r.event_type))).toEqual([]);
  });

  it("names an actor on all but the one deliberate system row", () => {
    const system = SAMPLE_ACTIVITY.filter((r) => describeActor(r) === "System");
    expect(system).toHaveLength(1);
    expect(system[0].actor_label).toBeNull();
  });

  it("is newest first", () => {
    const times = SAMPLE_ACTIVITY.map((r) => Date.parse(r.created_at));
    expect([...times].sort((a, b) => b - a)).toEqual(times);
  });

  it("gives every row a sample id that cannot reach a query", () => {
    for (const row of SAMPLE_ACTIVITY) {
      expect(row.id.startsWith("sample-")).toBe(true);
      for (const fk of [row.project_id, row.client_id, row.placement_id]) {
        if (fk) expect(fk.startsWith("sample-")).toBe(true);
      }
    }
  });
});

describe("the trail points at things the sample actually shows", () => {
  it("names only mandates that exist", () => {
    const ids = new Set(SAMPLE_MANDATES.map((m) => m.id));
    for (const row of SAMPLE_ACTIVITY) {
      if (row.project_id) expect(ids.has(row.project_id)).toBe(true);
    }
  });

  it("names only clients that exist", () => {
    const ids = new Set(SAMPLE_CLIENTS.map((c) => c.id));
    for (const row of SAMPLE_ACTIVITY) {
      if (row.client_id) expect(ids.has(row.client_id)).toBe(true);
    }
  });

  it("names only placements that exist", () => {
    const ids = new Set(SAMPLE_PLACEMENTS.map((p) => p.id));
    for (const row of SAMPLE_ACTIVITY) {
      if (row.placement_id) expect(ids.has(row.placement_id)).toBe(true);
    }
  });

  it("reverses exactly the amount the placement screen shows clawed back", () => {
    // The fallthrough pair is the sample's demonstration of the reversal
    // ledger, and the trail must not quote a different number from the one
    // /app/placements renders.
    const reversal = SAMPLE_ACTIVITY.find((r) => r.event_type === "fee_reversed");
    expect(reversal).toBeDefined();
    const placement = SAMPLE_PLACEMENTS.find(
      (p) => p.id === reversal!.placement_id
    );
    expect(placement).toBeDefined();
    expect(reversal!.detail.amount).toBe(placement!.billed);
  });

  it("records the fallthrough as a status change plus a reversal, never a deletion", () => {
    // §5a's third commercial decision, which the trail has to demonstrate
    // rather than describe: the quarter that billed the fee still reports
    // billing it, and the clawback lands in the quarter it happened.
    expect(
      SAMPLE_ACTIVITY.some((r) => r.event_type === "placement_status_changed")
    ).toBe(true);
    expect(SAMPLE_ACTIVITY.some((r) => r.event_type === "fee_reversed")).toBe(true);
    expect(
      SAMPLE_ACTIVITY.some((r) => r.event_type === "placement_deleted")
    ).toBe(false);
  });
});

describe("visibility is enforced, not decorated", () => {
  it("hides every money row from a reader without fees:read", () => {
    const rows = sampleActivityFor({ seesFees: false, seesMembers: false });
    expect(rows.some((r) => isMoneyEvent(r.event_type))).toBe(false);
    expect(rows.some((r) => r.visibility === "fees")).toBe(false);
  });

  it("hides member changes from a reader without org:manage", () => {
    const rows = sampleActivityFor({ seesFees: true, seesMembers: false });
    expect(rows.some((r) => r.visibility === "admin")).toBe(false);
  });

  it("still leaves a viewer a trail worth reading", () => {
    // A restriction that empties the screen is indistinguishable from a
    // broken one, and the page deliberately is not capability-gated (§5b).
    const rows = sampleActivityFor({ seesFees: false, seesMembers: false });
    expect(rows.length).toBeGreaterThanOrEqual(4);
  });

  it("shows an admin with fees everything", () => {
    const rows = sampleActivityFor({ seesFees: true, seesMembers: true });
    expect(rows).toHaveLength(SAMPLE_ACTIVITY.length);
  });

  it("covers all three visibility tiers", () => {
    // Otherwise the three assertions above could pass over a fixture that
    // simply has no rows at the tier being excluded.
    const tiers = new Set(SAMPLE_ACTIVITY.map((r) => r.visibility));
    expect([...tiers].sort()).toEqual(["admin", "fees", "org"]);
  });
});

describe("the group filter", () => {
  it("spans more than one group, so the filter has something to do", () => {
    const counts = sampleActivityGroups(SAMPLE_ACTIVITY);
    expect(counts.size).toBeGreaterThan(2);
  });

  it("assigns every row to a known group", () => {
    for (const row of SAMPLE_ACTIVITY) {
      expect(ACTIVITY_GROUP_OF[row.event_type]).toBeDefined();
    }
  });
});
