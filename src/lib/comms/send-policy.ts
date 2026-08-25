// The Candidate Communication Service's policy ladder — pure (099).
//
// Spec §5: the ordered checks that decide whether a candidate message
// may leave Mandate at all. Every branch is a NAMED refusal with a
// sentence a recruiter can act on; the service is thin IO around this
// function, and the vitest contracts cover every branch. Order
// matters and is the spec's: identity, channel, suppression (DNC /
// erasure / withdrawal / bounce list), autonomy, caps.

export type SendActor =
  | { kind: "human" }
  | { kind: "agent"; principal: string };

export type SendPolicyInput = {
  actor: SendActor;
  channel: string;
  allowedChannels: string[];
  candidateEmail: string | null;
  pipelineStage: string | null;
  profileDnc: boolean;
  dncReason: string | null;
  erasureOpen: boolean;
  /** The address is on email_suppressions, with its reason. */
  suppressed: { reason: string } | null;
  dailySendCap: number | null;
  sentTodayOrgWide: number;
  weeklyCandidateCap: number | null;
  sentToCandidateThisWeek: number;
};

export type SendRefusal = {
  ok: false;
  code:
    | "no_address"
    | "channel_not_allowed"
    | "dnc"
    | "erasure_open"
    | "withdrawn"
    | "suppressed"
    | "agent_actor"
    | "org_daily_cap"
    | "candidate_weekly_cap";
  message: string;
};

export type SendPolicyResult = { ok: true } | SendRefusal;

export function evaluateSendPolicy(input: SendPolicyInput): SendPolicyResult {
  if (!input.candidateEmail || input.candidateEmail.trim().length === 0) {
    return {
      ok: false,
      code: "no_address",
      message:
        "This person has no email address on record — nothing can be sent.",
    };
  }

  if (input.channel !== "email") {
    return {
      ok: false,
      code: "channel_not_allowed",
      message: `'${input.channel}' is not a sendable channel — email is the only send channel in this slice.`,
    };
  }
  if (!input.allowedChannels.includes("email")) {
    return {
      ok: false,
      code: "channel_not_allowed",
      message:
        "Email is not in this organisation's allowed channels — an admin sets that in the communication policy.",
    };
  }

  if (input.profileDnc) {
    return {
      ok: false,
      code: "dnc",
      message:
        `This person is marked do-not-contact` +
        (input.dncReason ? ` (${input.dncReason})` : "") +
        ` — nothing was sent. Only a founder-level act with a recorded reason clears the suppression.`,
    };
  }
  if (input.erasureOpen) {
    return {
      ok: false,
      code: "erasure_open",
      message:
        "This person has an open erasure request — nothing can be sent while it stands.",
    };
  }
  if (input.pipelineStage === "withdrawn") {
    return {
      ok: false,
      code: "withdrawn",
      message:
        "This person withdrew from the search — nothing was sent.",
    };
  }
  if (input.suppressed) {
    return {
      ok: false,
      code: "suppressed",
      message: `This address is on the suppression list (${input.suppressed.reason}) — nothing was sent.`,
    };
  }

  if (input.actor.kind === "agent") {
    return {
      ok: false,
      code: "agent_actor",
      message:
        "Candidate sends are human acts — no mission system exists for an agent to send under.",
    };
  }

  if (
    input.dailySendCap != null &&
    input.sentTodayOrgWide >= input.dailySendCap
  ) {
    return {
      ok: false,
      code: "org_daily_cap",
      message: `The organisation's daily send cap (${input.dailySendCap}) is reached — nothing was sent today.`,
    };
  }
  if (
    input.weeklyCandidateCap != null &&
    input.sentToCandidateThisWeek >= input.weeklyCandidateCap
  ) {
    return {
      ok: false,
      code: "candidate_weekly_cap",
      message: `This person's weekly contact cap (${input.weeklyCandidateCap}) is reached — nothing was sent.`,
    };
  }

  return { ok: true };
}
