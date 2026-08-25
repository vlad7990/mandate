import { describe, expect, it } from "vitest";
import { evaluateSendPolicy, type SendPolicyInput } from "./send-policy";

function input(overrides: Partial<SendPolicyInput> = {}): SendPolicyInput {
  return {
    actor: { kind: "human" },
    channel: "email",
    allowedChannels: ["email"],
    candidateEmail: "person@example.com",
    pipelineStage: "matched",
    profileDnc: false,
    dncReason: null,
    erasureOpen: false,
    suppressed: null,
    dailySendCap: null,
    sentTodayOrgWide: 0,
    weeklyCandidateCap: null,
    sentToCandidateThisWeek: 0,
    ...overrides,
  };
}

describe("evaluateSendPolicy — every ladder branch", () => {
  it("passes a lawful human email send", () => {
    expect(evaluateSendPolicy(input())).toEqual({ ok: true });
  });

  it("refuses when there is no address", () => {
    const r = evaluateSendPolicy(input({ candidateEmail: "  " }));
    expect(r).toMatchObject({ ok: false, code: "no_address" });
  });

  it("refuses a non-email channel by name", () => {
    const r = evaluateSendPolicy(input({ channel: "phone" }));
    expect(r).toMatchObject({ ok: false, code: "channel_not_allowed" });
  });

  it("refuses when the org's policy does not allow email", () => {
    const r = evaluateSendPolicy(input({ allowedChannels: ["phone"] }));
    expect(r).toMatchObject({ ok: false, code: "channel_not_allowed" });
  });

  it("refuses a suppressed person, naming the recorded reason", () => {
    const r = evaluateSendPolicy(
      input({ profileDnc: true, dncReason: "asked us to stop" })
    );
    expect(r).toMatchObject({ ok: false, code: "dnc" });
    expect((r as { message: string }).message).toContain("asked us to stop");
    expect((r as { message: string }).message).toContain("founder-level");
  });

  it("refuses while an erasure request is open", () => {
    const r = evaluateSendPolicy(input({ erasureOpen: true }));
    expect(r).toMatchObject({ ok: false, code: "erasure_open" });
  });

  it("refuses a withdrawn candidate", () => {
    const r = evaluateSendPolicy(input({ pipelineStage: "withdrawn" }));
    expect(r).toMatchObject({ ok: false, code: "withdrawn" });
  });

  it("refuses a bounce-suppressed address", () => {
    const r = evaluateSendPolicy(input({ suppressed: { reason: "bounce" } }));
    expect(r).toMatchObject({ ok: false, code: "suppressed" });
    expect((r as { message: string }).message).toContain("bounce");
  });

  it("refuses EVERY agent actor — no mission system exists", () => {
    const r = evaluateSendPolicy(
      input({ actor: { kind: "agent", principal: "outreach_strategy" } })
    );
    expect(r).toMatchObject({ ok: false, code: "agent_actor" });
  });

  it("suppression outranks the agent refusal — the DNC reason wins the message", () => {
    const r = evaluateSendPolicy(
      input({
        actor: { kind: "agent", principal: "engagement" },
        profileDnc: true,
        dncReason: "erasure requested via their portal",
      })
    );
    expect(r).toMatchObject({ ok: false, code: "dnc" });
  });

  it("enforces the org daily cap at the boundary", () => {
    expect(
      evaluateSendPolicy(input({ dailySendCap: 5, sentTodayOrgWide: 4 }))
    ).toEqual({ ok: true });
    const r = evaluateSendPolicy(
      input({ dailySendCap: 5, sentTodayOrgWide: 5 })
    );
    expect(r).toMatchObject({ ok: false, code: "org_daily_cap" });
    expect((r as { message: string }).message).toContain("5");
  });

  it("enforces the per-candidate weekly cap at the boundary", () => {
    expect(
      evaluateSendPolicy(
        input({ weeklyCandidateCap: 2, sentToCandidateThisWeek: 1 })
      )
    ).toEqual({ ok: true });
    const r = evaluateSendPolicy(
      input({ weeklyCandidateCap: 2, sentToCandidateThisWeek: 2 })
    );
    expect(r).toMatchObject({ ok: false, code: "candidate_weekly_cap" });
  });

  it("NULL caps mean uncapped — the 097 defaults", () => {
    expect(
      evaluateSendPolicy(
        input({
          dailySendCap: null,
          sentTodayOrgWide: 10_000,
          weeklyCandidateCap: null,
          sentToCandidateThisWeek: 500,
        })
      )
    ).toEqual({ ok: true });
  });
});
