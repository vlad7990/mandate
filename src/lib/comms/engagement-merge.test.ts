import { describe, expect, it } from "vitest";
import {
  buildEngagementUpdate,
  detectHardEscalation,
} from "./engagement-merge";
import type { EngagementJudgment } from "@/lib/ai/engagement";
import { DEFAULT_COMMS_POLICY } from "@/lib/outreach/strategy-policy";

const NOW = new Date("2026-08-25T12:00:00Z");

function judgment(
  overrides: Partial<EngagementJudgment> = {}
): EngagementJudgment {
  return {
    state: "timing_follow_up",
    escalation_reason: null,
    next_follow_up_at: "2026-09-04",
    draft: {
      subject: "Re: A CTO mandate",
      body: "Following up as promised — is Thursday still good for a call?",
    },
    ...overrides,
  };
}

describe("buildEngagementUpdate", () => {
  it("builds exactly the four maintainable fields plus the stamp", () => {
    const { update, clamped } = buildEngagementUpdate({
      judgment: judgment(),
      policy: DEFAULT_COMMS_POLICY,
      clientName: "Fennwick Systems",
      now: NOW,
    });
    expect(Object.keys(update).sort()).toEqual([
      "draft",
      "escalation_reason",
      "next_follow_up_at",
      "state",
      "updated_at",
    ]);
    expect(update.state).toBe("timing_follow_up");
    expect(update.next_follow_up_at).toBe("2026-09-04");
    expect(update.draft?.body).toContain("Thursday");
    expect(clamped).toBe(false);
  });

  it("carries an escalation WITH its reason", () => {
    const { update } = buildEngagementUpdate({
      judgment: judgment({
        state: "escalated",
        escalation_reason: "the candidate asked about equity specifics",
        draft: null,
      }),
      policy: DEFAULT_COMMS_POLICY,
      clientName: null,
      now: NOW,
    });
    expect(update.state).toBe("escalated");
    expect(update.escalation_reason).toBe(
      "the candidate asked about equity specifics"
    );
  });

  it("refuses a reasonless escalation — the state move is dropped, the rest lands", () => {
    const { update, reasons } = buildEngagementUpdate({
      judgment: judgment({
        state: "escalated",
        escalation_reason: "   ",
      }),
      policy: DEFAULT_COMMS_POLICY,
      clientName: null,
      now: NOW,
    });
    expect(update.state).toBeUndefined();
    expect(update.escalation_reason).toBeNull();
    expect(update.next_follow_up_at).toBe("2026-09-04");
    expect(reasons).toContain("an escalation without a reason was refused");
  });

  it("writes NO state when the model strays outside the vocabulary", () => {
    const { update } = buildEngagementUpdate({
      judgment: judgment({
        state: "ghosted" as EngagementJudgment["state"],
      }),
      policy: DEFAULT_COMMS_POLICY,
      clientName: null,
      now: NOW,
    });
    expect(update.state).toBeUndefined();
  });

  it("drops the draft on an escalated lane — the next move is the human's", () => {
    const { update, reasons } = buildEngagementUpdate({
      judgment: judgment({
        state: "escalated",
        escalation_reason: "finalist-level sensitivity",
      }),
      policy: DEFAULT_COMMS_POLICY,
      clientName: null,
      now: NOW,
    });
    expect(update.draft).toBeNull();
    expect(reasons).toContain(
      "an escalated lane proposes nothing — the draft was dropped"
    );
  });

  it("scrubs the client's name from the draft under a concealing policy", () => {
    const { update, clamped } = buildEngagementUpdate({
      judgment: judgment({
        draft: {
          subject: "Fennwick Systems CTO role",
          body: "Fennwick Systems would like to meet you next week.",
        },
      }),
      policy: {
        ...DEFAULT_COMMS_POLICY,
        client_identity_disclosure: "after_nda",
      },
      clientName: "Fennwick Systems",
      now: NOW,
    });
    expect(clamped).toBe(true);
    expect(update.draft?.subject).not.toContain("Fennwick");
    expect(update.draft?.body).not.toContain("Fennwick");
  });

  it("cuts compensation content from the draft under 'human_only'", () => {
    const { update, clamped } = buildEngagementUpdate({
      judgment: judgment({
        draft: {
          subject: "Re: A CTO mandate",
          body: "Good to hear from you. The salary is £250k plus equity. Is Thursday still good?",
        },
      }),
      policy: DEFAULT_COMMS_POLICY,
      clientName: null,
      now: NOW,
    });
    expect(clamped).toBe(true);
    expect(update.draft?.body).not.toMatch(/salary|equity/i);
    expect(update.draft?.body).toContain("Thursday");
  });

  it("nulls a malformed follow-up date and an empty draft", () => {
    const { update } = buildEngagementUpdate({
      judgment: judgment({
        next_follow_up_at: "soon",
        draft: { subject: "x", body: "   " },
      }),
      policy: DEFAULT_COMMS_POLICY,
      clientName: null,
      now: NOW,
    });
    expect(update.next_follow_up_at).toBeNull();
    expect(update.draft).toBeNull();
  });
});

describe("detectHardEscalation", () => {
  it("trips on a request for a human", () => {
    expect(
      detectHardEscalation("I'd rather speak to a real person about this.")
    ).toBe("the candidate asked for a human");
  });

  it("trips on the privacy family before anything else", () => {
    expect(
      detectHardEscalation("Please delete my data and stop contacting me.")
    ).toMatch(/privacy workflow/);
  });

  it("trips on legal or discrimination phrasing", () => {
    expect(
      detectHardEscalation("This feels discriminatory and my lawyer will hear about it.")
    ).toMatch(/legal or discrimination/);
  });

  it("stays quiet on an ordinary reply", () => {
    expect(
      detectHardEscalation("Thanks — travelling until Thursday, happy to talk after.")
    ).toBeNull();
    expect(detectHardEscalation(null)).toBeNull();
    expect(detectHardEscalation("   ")).toBeNull();
  });
});
