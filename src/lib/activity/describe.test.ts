import { describe, expect, it } from "vitest";
import { describeActivity, describeActor, isMoneyEvent } from "./describe";
import {
  ACTIVITY_EVENT_TYPES,
  ACTIVITY_GROUP_OF,
  APP_RECORDABLE_EVENTS,
  parseActivityEventType,
  parseActivityGroup,
  type ActivityEventRow,
  type ActivityEventType,
} from "./types";

function event(
  type: ActivityEventType,
  detail: Record<string, unknown> = {},
  overrides: Partial<ActivityEventRow> = {}
): ActivityEventRow {
  return {
    id: "event-1",
    organization_id: "org-1",
    actor_id: "user-1",
    actor_label: "Rae Recruiter",
    event_type: type,
    project_id: null,
    candidate_id: null,
    client_id: null,
    placement_id: null,
    target_user_id: null,
    detail,
    visibility: "org",
    created_at: "2026-08-13T10:00:00Z",
    ...overrides,
  };
}

describe("describeActivity", () => {
  it("describes a placement being recorded", () => {
    expect(describeActivity(event("placement_recorded", { offer_date: "2026-01-05" }))).toBe(
      "Recorded a placement, offer dated 2026-01-05"
    );
  });

  it("describes a status transition with its labels, not its raw values", () => {
    const line = describeActivity(
      event("placement_status_changed", { from: "offered", to: "started" })
    );
    expect(line).toContain("offer out");
    expect(line).toContain("started");
    expect(line).not.toContain("offered");
  });

  it("carries a fallthrough reason into the sentence", () => {
    expect(
      describeActivity(
        event("placement_status_changed", {
          from: "started",
          to: "fell_through",
          reason: "Left inside guarantee",
        })
      )
    ).toContain("Left inside guarantee");
  });

  it("formats a recorded fee in its own currency", () => {
    const line = describeActivity(
      event("fee_recorded", { total: 90000, currency: "GBP", model: "retained", percentage: 30 })
    );
    expect(line).toContain("£90,000");
    expect(line).toContain("30%");
  });

  /** Postgres hands `numeric` back as a string often enough to matter. */
  it("reads numerics whether they arrive as numbers or strings", () => {
    const asString = describeActivity(
      event("fee_recorded", { total: "90000.00", currency: "USD", percentage: "30" })
    );
    expect(asString).toContain("90,000");
    expect(asString).toContain("30%");
  });

  it("picks the field that actually changed on a fee update", () => {
    expect(
      describeActivity(
        event("fee_updated", {
          total_from: 90000,
          total_to: 75000,
          currency: "USD",
          percentage_from: 30,
          percentage_to: 30,
        })
      )
    ).toBe("Changed the fee from US$90,000 to US$75,000");

    expect(
      describeActivity(
        event("fee_updated", {
          total_from: 90000,
          total_to: 90000,
          currency: "USD",
          percentage_from: 30,
          percentage_to: 25,
        })
      )
    ).toBe("Changed the fee rate from 30% to 25%");
  });

  it("describes an instalment being earned", () => {
    expect(
      describeActivity(
        event("fee_line_earned", {
          label: "Engagement",
          amount: 30000,
          currency: "USD",
          earned_on: "2026-02-01",
        })
      )
    ).toBe("Marked Engagement (US$30,000) earned on 2026-02-01");
  });

  /**
   * The amount is stored negative. "Reversed -US$30,000" reads as a double
   * negative, so the sentence carries the sign instead of the number.
   */
  it("does not double up the sign on a reversal", () => {
    const line = describeActivity(
      event("fee_reversed", {
        amount: -30000,
        currency: "USD",
        reason: "Left inside guarantee",
      })
    );
    expect(line).toBe("Reversed US$30,000 — Left inside guarantee");
    expect(line).not.toContain("-US$");
  });

  it("labels roles rather than printing the raw column", () => {
    expect(
      describeActivity(
        event("member_role_changed", { member: "Vic Viewer", from: "viewer", to: "recruiter" })
      )
    ).toBe("Changed Vic Viewer from Viewer to Recruiter");
  });

  it("describes the founder flag in both directions", () => {
    expect(
      describeActivity(event("member_founder_changed", { member: "Ada", to: true }))
    ).toContain("Made Ada a platform operator");
    expect(
      describeActivity(event("member_founder_changed", { member: "Ada", to: false }))
    ).toContain("Removed platform operator");
  });

  it("says which scope fee terms belong to", () => {
    expect(
      describeActivity(event("fee_terms_created", { scope: "client", percentage: 25 }))
    ).toBe("Added client fee terms at 25%");
    expect(
      describeActivity(event("fee_terms_created", { scope: "mandate", fixed_amount: 40000, currency: "USD" }))
    ).toBe("Added mandate fee terms at US$40,000");
  });

  /**
   * The trail must stay legible when `detail` is empty — a row written by
   * an older trigger, or one whose payload was dropped.
   */
  it("produces a sentence for every event type with no detail at all", () => {
    for (const type of ACTIVITY_EVENT_TYPES) {
      const line = describeActivity(event(type));
      expect(line.length).toBeGreaterThan(0);
      expect(line).not.toContain("undefined");
      expect(line).not.toContain("null");
      expect(line).not.toContain("NaN");
    }
  });
});

describe("describeActor", () => {
  it("uses the snapshotted label", () => {
    expect(describeActor(event("placement_recorded"))).toBe("Rae Recruiter");
  });

  /**
   * The whole reason `actor_label` exists: a departed colleague's row is
   * ON DELETE SET NULL, and without the snapshot every entry they ever made
   * would read as unattributed.
   */
  it("falls back to System when there was no actor", () => {
    expect(
      describeActor(event("placement_recorded", {}, { actor_id: null, actor_label: null }))
    ).toBe("System");
    expect(
      describeActor(event("placement_recorded", {}, { actor_label: "   " }))
    ).toBe("System");
  });
});

describe("the vocabulary", () => {
  it("groups every event type", () => {
    for (const type of ACTIVITY_EVENT_TYPES) {
      expect(ACTIVITY_GROUP_OF[type]).toBeDefined();
    }
  });

  it("marks exactly the fee events as money", () => {
    const money = ACTIVITY_EVENT_TYPES.filter(isMoneyEvent);
    expect(money).toEqual(
      ACTIVITY_EVENT_TYPES.filter((t) => ACTIVITY_GROUP_OF[t] === "money")
    );
  });

  /**
   * `record_activity_event` refuses anything outside this list. If the two
   * drift, the app either loses an event type it thinks it can write or
   * gains the ability to fabricate a money entry.
   */
  it("keeps the app-recordable set to the three intent events", () => {
    expect([...APP_RECORDABLE_EVENTS]).toEqual([
      "shortlist_published",
      "report_exported",
      "hm_portal_opened",
    ]);
    for (const type of APP_RECORDABLE_EVENTS) {
      expect(ACTIVITY_GROUP_OF[type]).toBe("client");
    }
  });

  it("narrows untrusted values and rejects anything else", () => {
    expect(parseActivityEventType("fee_recorded")).toBe("fee_recorded");
    expect(parseActivityEventType("fee_invented")).toBeNull();
    expect(parseActivityEventType(null)).toBeNull();
    expect(parseActivityGroup("money")).toBe("money");
    expect(parseActivityGroup("everything")).toBeNull();
  });
});
