import { describe, expect, it } from "vitest";
import {
  applyCommsPolicy,
  DEFAULT_COMMS_POLICY,
  type CommsPolicy,
} from "./strategy-policy";
import type { OutreachStrategyContent } from "@/lib/ai/outreach-strategy";

function content(
  overrides: Partial<OutreachStrategyContent> = {}
): OutreachStrategyContent {
  return {
    angle: "A step up in scope at a growing firm.",
    career_hook: "Your T+1 migration maps directly onto this mandate.",
    may_disclose: ["role scope", "sector"],
    must_not_disclose: [],
    channel: "email",
    cadence: "Wait five business days, then one nudge.",
    talking_points: ["Ran settlement through a regime change"],
    likely_questions: ["Why is the role open? — leadership growth"],
    draft_subject: "A post-trade leadership conversation",
    draft_body:
      "Your work on the T+1 migration stood out. I am running a search for a COO role that needs exactly that. Would you take a short call next week?",
    ...overrides,
  };
}

const openPolicy: CommsPolicy = {
  allowed_channels: ["email", "phone"],
  client_identity_disclosure: "open",
  compensation_discussion: "range_allowed",
};

describe("applyCommsPolicy", () => {
  it("leaves a compliant draft untouched under an open policy", () => {
    const input = content();
    const result = applyCommsPolicy(input, openPolicy, "Acme Clearing");
    expect(result.clamped).toBe(false);
    expect(result.reasons).toEqual([]);
    expect(result.content).toEqual(input);
  });

  it("clamps a disallowed channel to the org's first allowed channel", () => {
    const result = applyCommsPolicy(
      content({ channel: "phone" }),
      { ...openPolicy, allowed_channels: ["email"] },
      null
    );
    expect(result.clamped).toBe(true);
    expect(result.content.channel).toBe("email");
    expect(result.reasons[0]).toMatch(/channel 'phone'/);
  });

  it("treats an empty allowed_channels list as the default, not a dead end", () => {
    const result = applyCommsPolicy(
      content({ channel: "phone" }),
      { ...openPolicy, allowed_channels: [] },
      null
    );
    expect(result.content.channel).toBe("email");
  });

  it("scrubs the client's name everywhere under 'after_nda'", () => {
    const result = applyCommsPolicy(
      content({
        angle: "Acme Clearing needs a COO.",
        draft_subject: "COO at Acme Clearing",
        draft_body: "Acme Clearing is scaling. ACME CLEARING wants you.",
        may_disclose: ["the client is Acme Clearing", "sector"],
        talking_points: ["Acme Clearing's regime change"],
        likely_questions: ["Is this Acme Clearing?"],
      }),
      { ...openPolicy, client_identity_disclosure: "after_nda" },
      "Acme Clearing"
    );
    expect(result.clamped).toBe(true);
    const text = JSON.stringify(result.content);
    expect(text.toLowerCase()).not.toContain("acme clearing");
    expect(result.content.draft_body).toContain("a confidential client");
    // The leaking may_disclose entry is dropped, not rewritten — a
    // disclosure list entry naming the client has no compliant form.
    expect(result.content.may_disclose).toEqual(["sector"]);
    expect(result.content.must_not_disclose).toContain("the client's identity");
  });

  it("pins the client's identity into must_not_disclose under 'never' even when the draft was clean", () => {
    const result = applyCommsPolicy(
      content(),
      { ...openPolicy, client_identity_disclosure: "never" },
      "Acme Clearing"
    );
    expect(result.clamped).toBe(false);
    expect(result.content.must_not_disclose).toContain("the client's identity");
  });

  it("does nothing about identity when no client name is known", () => {
    const result = applyCommsPolicy(
      content(),
      { ...openPolicy, client_identity_disclosure: "never" },
      null
    );
    expect(result.content.must_not_disclose).toEqual([]);
  });

  it("cuts compensation sentences and points under 'human_only'", () => {
    const result = applyCommsPolicy(
      content({
        draft_body:
          "Your migration work stood out. The salary is £250k with equity on top. Would you take a call?",
        talking_points: ["Comp package beats market", "Regime-change experience"],
      }),
      { ...openPolicy, compensation_discussion: "human_only" },
      null
    );
    expect(result.clamped).toBe(true);
    expect(result.content.draft_body).not.toMatch(/salary|equity/i);
    expect(result.content.draft_body).toContain("Would you take a call?");
    expect(result.content.talking_points).toEqual([
      "Regime-change experience",
    ]);
    expect(result.content.must_not_disclose).toContain("compensation details");
  });

  it("replaces a compensation-led subject line under 'human_only'", () => {
    const result = applyCommsPolicy(
      content({ draft_subject: "£250k salary — COO role" }),
      { ...openPolicy, compensation_discussion: "human_only" },
      null
    );
    expect(result.content.draft_subject).toBe(
      "An opportunity worth a conversation"
    );
  });

  it("keeps compensation content under 'range_allowed'", () => {
    const input = content({
      draft_body: "The salary range is competitive. Would you take a call?",
    });
    const result = applyCommsPolicy(input, openPolicy, null);
    expect(result.clamped).toBe(false);
    expect(result.content.draft_body).toBe(input.draft_body);
  });

  it("DEFAULT_COMMS_POLICY conceals nothing but keeps compensation human-only", () => {
    const result = applyCommsPolicy(
      content({
        draft_body: "Acme Clearing is hiring. The salary is high. Call me.",
      }),
      DEFAULT_COMMS_POLICY,
      "Acme Clearing"
    );
    // after_approval: the name may stand (the human approves the draft
    // before it is sent); human_only: the salary sentence may not.
    expect(result.content.draft_body).toContain("Acme Clearing");
    expect(result.content.draft_body).not.toMatch(/salary/i);
  });
});
