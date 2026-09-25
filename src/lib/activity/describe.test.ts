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

  it("describes task assignment and completion, and survives bare rows", () => {
    expect(
      describeActivity(
        event("task_assigned", { task_title: "Chase the reference", to_label: "Rae Recruiter" })
      )
    ).toBe('Assigned "Chase the reference" to Rae Recruiter');
    expect(describeActivity(event("task_assigned", {}))).toBe("Assigned a task");
    expect(
      describeActivity(event("task_completed", { task_title: "Chase the reference" }))
    ).toBe('Completed "Chase the reference"');
    expect(describeActivity(event("task_completed", {}))).toBe("Completed a task");
  });

  it("describes a candidate pipeline move with its stage labels", () => {
    expect(
      describeActivity(
        event("candidate_stage_changed", { from: "passed_rounds", to: "finalist" })
      )
    ).toBe("Moved the candidate from passed rounds to finalist");
    // A bare row must still read as a sentence (the empty-detail pin).
    expect(describeActivity(event("candidate_stage_changed", {}))).toBe(
      "Moved the candidate from unknown to unknown"
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

  /**
   * The contact events, added by 054.
   *
   * The name comes out of `detail` rather than a join, because the row it
   * would join to is gone by the time a removal is read back — same
   * reasoning as `actor_label` in 053.
   */
  describe("client contacts", () => {
    it("names the person and the title when one was added", () => {
      expect(
        describeActivity(
          event("client_contact_added", {
            name: "Jane Okafor",
            title: "MD, Markets",
            mode: "created",
          })
        )
      ).toBe("Added Jane Okafor, MD, Markets, as a contact");
    });

    it("says so when the new contact is also the primary", () => {
      expect(
        describeActivity(
          event("client_contact_added", { name: "Jane Okafor", is_primary: true })
        )
      ).toContain("made them the primary");
    });

    /**
     * Restoring reuses `client_contact_added` because the effect a reader
     * cares about is the same — this person is a contact again — and
     * `detail.mode` is what distinguishes the mechanism. The sentence has
     * to reflect that or the trail reads as a duplicate.
     */
    it("distinguishes a restore from a fresh contact", () => {
      expect(
        describeActivity(
          event("client_contact_added", { name: "Jane Okafor", mode: "restored" })
        )
      ).toBe("Restored Jane Okafor as a contact");
    });

    it("reports a rename with both names", () => {
      expect(
        describeActivity(
          event("client_contact_updated", {
            name: "Jane Okafor-Smith",
            name_from: "Jane Okafor",
          })
        )
      ).toBe("Renamed the contact Jane Okafor to Jane Okafor-Smith");
    });

    it("reports a promotion and a demotion as different things", () => {
      expect(
        describeActivity(
          event("client_contact_updated", {
            name: "Raj Patel",
            is_primary: true,
            was_primary: false,
          })
        )
      ).toBe("Made Raj Patel the primary contact");

      expect(
        describeActivity(
          event("client_contact_updated", {
            name: "Raj Patel",
            is_primary: false,
            was_primary: true,
          })
        )
      ).toBe("Raj Patel is no longer the primary contact");
    });

    it("separates archiving from deleting", () => {
      expect(
        describeActivity(
          event("client_contact_removed", { name: "Raj Patel", mode: "archived" })
        )
      ).toBe("Archived the contact Raj Patel");

      expect(
        describeActivity(
          event("client_contact_removed", { name: "Raj Patel", mode: "deleted" })
        )
      ).toBe("Deleted the contact Raj Patel");
    });
  });

  /**
   * The sign-off. Three sentences rather than one with two optional halves,
   * because "changed the sign-off from nobody to Jane" reads like a bug.
   */
  describe("placement sign-off", () => {
    it("reads as a recording when there was nothing before", () => {
      expect(
        describeActivity(event("placement_signoff_changed", { to: "Jane Okafor" }))
      ).toBe("Recorded Jane Okafor as signing the placement off");
    });

    it("reads as a change when there was", () => {
      expect(
        describeActivity(
          event("placement_signoff_changed", { from: "Raj Patel", to: "Jane Okafor" })
        )
      ).toBe("Changed who signed the placement off from Raj Patel to Jane Okafor");
    });

    it("reads as a removal when the name was cleared", () => {
      expect(
        describeActivity(event("placement_signoff_changed", { from: "Raj Patel" }))
      ).toBe("Removed Raj Patel as signing the placement off");
    });
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
  it("keeps the app-recordable set to the intent events", () => {
    expect([...APP_RECORDABLE_EVENTS]).toEqual([
      "shortlist_published",
      "report_exported",
      "hm_portal_opened",
      // 065: the desk's reassignment action. The one intent event that is
      // not client-facing — it files under the mandates group.
      "mandate_reassigned",
      // 102: the Skills Studio's five human acts — admin-gated inside the
      // RPC, and they file under mandates because skills change how every
      // search scores.
      "skill_created",
      "skill_updated",
      "skill_paused",
      "skill_activated",
      "skill_deleted",
      // 104: the pipeline move — writer-gated inside the RPC on
      // can_write_candidates(), and it files under mandates like the
      // rest of the candidate events.
      "candidate_stage_changed",
      // 141: the duplicate CV upload that was parsed, recognised and
      // dropped — the same candidate-writer gate, and it files under
      // mandates beside the pipeline move. The event hangs off the row
      // that SURVIVED: candidate_id cascades on delete, so anchoring it
      // to the discarded row would erase the record of the discard.
      "candidate_duplicate_discarded",
      // 106: the task domain — assignment desk-gated inside the RPC,
      // completion actor-stamped. Desk work files under mandates.
      "task_assigned",
      "task_completed",
      // 107: the OKR domain — both okr-writer-gated inside the RPC.
      // Goals measure the desk's searches, so they file under mandates.
      "objective_created",
      "objective_closed",
      // 116: the interview-plan lifecycle — mandate-writer-gated inside
      // the RPC. Plans score against the calibration, so they file
      // under mandates.
      "interview_plan_generation_requested",
      "interview_plan_generation_failed",
      "interview_plan_approved",
      // 117: the client-interview lifecycle — same gate, same group.
      // The answered event is absent on purpose: it is sessionless and
      // enters via its own SECURITY DEFINER entry point, never the door.
      "client_interview_generation_requested",
      "client_interview_generation_failed",
      "client_interview_approved",
      // 120: the model registry's two admin acts — the skill family's
      // admin gate extended; they file under mandates for the skills
      // precedent (the registry changes what runs every search).
      "model_provider_added",
      "model_assignment_changed",
      // 123: the invoice lifecycle — fee-writer-gated inside the RPC
      // (can_read_fees AND can_write_mandates) and written at 'fees'
      // visibility, the one intent family not at 'org'. Money group.
      "invoice_created",
      "invoice_issued",
      "invoice_voided",
      // 126: the send. Same fee-writer gate, same 'fees' tier.
      "invoice_sent",
    ]);
    for (const type of APP_RECORDABLE_EVENTS) {
      const expected =
        type === "mandate_reassigned" ||
        type === "candidate_stage_changed" ||
        type === "candidate_duplicate_discarded" ||
        type.startsWith("skill_") ||
        type.startsWith("task_") ||
        type.startsWith("objective_") ||
        type.startsWith("interview_plan_") ||
        type.startsWith("client_interview_") ||
        type.startsWith("model_")
          ? "mandates"
          : type.startsWith("invoice_")
            ? "money"
            : "client";
      expect(ACTIVITY_GROUP_OF[type]).toBe(expected);
    }
  });

  /**
   * 107's rider: the TS mirror had drifted to 46 entries against the
   * live CHECK's 78 — the external block and the later agent events
   * rendered as raw slugs. The count pins the reconciliation: 80 was
   * 107's rebuild; 116 added the three interview-plan human acts = 83;
   * 117 adds the three client-interview human acts + the sessionless
   * answered event = 87; 120 adds the model registry's two admin
   * acts = 89; 123 adds the invoice lifecycle's three human acts = 92;
   * 126 adds the send = 93; 129 adds the four admin-grant events = 97;
   * 130 adds the role seam's rederivation = 98; 132 adds the contested
   * verdict = 99; 140 adds the reporting line's move = 100; 141 adds the
   * discarded duplicate CV = 101; 142 adds the merge = 102.
   *
   * Note 142 grows the CHECK without growing the app-recordable door: the
   * merge event is written inside `merge_candidates` itself, so it shares
   * that transaction and cannot be skipped.
   */
  it("mirrors the live CHECK's hundred-and-two event types", () => {
    expect(ACTIVITY_EVENT_TYPES).toHaveLength(102);
    expect(new Set(ACTIVITY_EVENT_TYPES).size).toBe(102);
  });

  it("describes a discarded duplicate from the surviving row's side", () => {
    // The event hangs off the record that was KEPT, so the sentence has to
    // read as something that happened TO it — not as if this record were
    // the one thrown away.
    expect(
      describeActivity(
        event("candidate_duplicate_discarded", {
          file_name: "jane-doe-cv.pdf",
          matched_on: "email",
        })
      )
    ).toBe(
      "Discarded a duplicate CV upload — jane-doe-cv.pdf (same email address); this record was kept unchanged"
    );
    // Detail is snapshotted by the writer, so a row from an older shape
    // must still read rather than printing "undefined".
    expect(describeActivity(event("candidate_duplicate_discarded", {}))).toBe(
      "Discarded a duplicate CV upload; this record was kept unchanged"
    );
  });

  it("describes the OKR acts with titles and outcomes, never amounts", () => {
    expect(
      describeActivity(
        event("objective_created", {
          title: "Close the fintech book",
          scope: "book",
          owner_label: "Rae Recruiter",
        })
      )
    ).toBe('Set the objective "Close the fintech book" for Rae Recruiter');
    expect(
      describeActivity(event("objective_closed", { title: "Close the fintech book", outcome: "met" }))
    ).toBe('Closed the objective "Close the fintech book" — met');
    expect(
      describeActivity(
        event("objective_closed", { title: "Close the fintech book", outcome: "abandoned" })
      )
    ).toBe('Abandoned the objective "Close the fintech book"');
    expect(describeActivity(event("objective_created", {}))).toBe("Set an objective");
  });

  it("describes the reconciled external block by its snapshot names", () => {
    expect(
      describeActivity(
        event("external_invited", { invitee: "Priya Shah", email: "p@client.test", role: "hiring_manager" })
      )
    ).toBe("Invited Priya Shah as Hiring Manager");
    expect(
      describeActivity(event("candidate_withdrew", { person: "Jon Doe", from_stage: "interviewed" }))
    ).toBe("Jon Doe withdrew from the search at interviewed");
    expect(describeActivity(event("member_org_changed", { member: "Rae", from: "Org A", to: "Org B" }))).toBe(
      "Moved Rae from Org A to Org B"
    );
  });

  it("describes the invoice lifecycle, amounts riding the fees-tier rows", () => {
    expect(describeActivity(event("invoice_created", { client: "Larkspur Health" }))).toBe(
      "Started an invoice draft for Larkspur Health"
    );
    expect(describeActivity(event("invoice_created", {}))).toBe("Started an invoice draft");
    expect(
      describeActivity(
        event("invoice_issued", {
          invoice_number: "INV-2026-0001",
          client: "Larkspur Health",
          total: 64000,
          currency: "USD",
        })
      )
    ).toBe("Issued INV-2026-0001 to Larkspur Health for US$64,000");
    expect(
      describeActivity(event("invoice_voided", { invoice_number: "INV-2026-0001" }))
    ).toBe("Voided INV-2026-0001 — its fee lines are billable again");
    expect(
      describeActivity(
        event("invoice_sent", {
          invoice_number: "INV-2026-0001",
          to: "accounts@larkspur.test",
          total: 64000,
          currency: "USD",
        })
      )
    ).toBe("Sent INV-2026-0001 (US$64,000) to accounts@larkspur.test");
  });

  it("narrows untrusted values and rejects anything else", () => {
    expect(parseActivityEventType("fee_recorded")).toBe("fee_recorded");
    expect(parseActivityEventType("fee_invented")).toBeNull();
    expect(parseActivityEventType(null)).toBeNull();
    expect(parseActivityGroup("money")).toBe("money");
    expect(parseActivityGroup("everything")).toBeNull();
  });
});
