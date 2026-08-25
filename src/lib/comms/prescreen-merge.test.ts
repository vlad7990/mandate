import { describe, expect, it } from "vitest";
import {
  buildPrescreenUpdate,
  stripVerdictKeys,
  type TranscriptTurn,
} from "./prescreen-merge";
import type { PrescreenJudgment } from "@/lib/ai/prescreen";
import { DEFAULT_COMMS_POLICY } from "@/lib/outreach/strategy-policy";

const NOW = new Date("2026-08-25T12:00:00Z");

const TRANSCRIPT: TranscriptTurn[] = [
  {
    direction: "outbound",
    channel: "email",
    subject: "A few questions",
    body: "Invitation",
    occurred_at: "2026-08-23T10:00:00Z",
  },
];

function judgment(
  overrides: Partial<PrescreenJudgment> = {}
): PrescreenJudgment {
  return {
    status: "in_progress",
    escalation_reason: null,
    question_set: {
      subject: "A few questions on the mandate",
      body: "Two quick questions before we book a call.",
      questions: ["Which regulatory regimes have you operated under?"],
    },
    professional_evidence: {
      leadership: {
        value: "Ran a platform org of 60",
        status: "validated",
        source: "reply 1",
      },
    },
    interest_profile: {
      interest: "open",
      motivation: "scope",
      timing: null,
      location: null,
      comp_context: null,
      notice: null,
      constraints: null,
      questions: [],
    },
    ...overrides,
  };
}

describe("buildPrescreenUpdate", () => {
  it("builds the maintainable fields and carries the deterministic transcript", () => {
    const { update, clamped } = buildPrescreenUpdate({
      judgment: judgment(),
      policy: DEFAULT_COMMS_POLICY,
      clientName: "Wrenfold Assurance",
      transcript: TRANSCRIPT,
      now: NOW,
    });
    expect(update.status).toBe("in_progress");
    expect(update.transcript).toEqual(TRANSCRIPT);
    expect(update.professional_evidence.leadership?.status).toBe("validated");
    expect(update.completed_at).toBeNull();
    expect(clamped).toBe(false);
  });

  it("stamps completion exactly when complete", () => {
    const { update } = buildPrescreenUpdate({
      judgment: judgment({ status: "complete", question_set: null }),
      policy: DEFAULT_COMMS_POLICY,
      clientName: null,
      transcript: [],
      now: NOW,
    });
    expect(update.status).toBe("complete");
    expect(update.completed_at).toBe(NOW.toISOString());
  });

  it("strips verdict-shaped keys wherever the model hid them", () => {
    const dirty = judgment();
    (dirty.professional_evidence as Record<string, unknown>).overall_score = 87;
    (dirty.interest_profile as unknown as Record<string, unknown>).pass = true;
    (dirty.professional_evidence.leadership as unknown as Record<string, unknown>).qualified = "yes";
    const { update, reasons } = buildPrescreenUpdate({
      judgment: dirty,
      policy: DEFAULT_COMMS_POLICY,
      clientName: null,
      transcript: [],
      now: NOW,
    });
    const landed = JSON.stringify({
      e: update.professional_evidence,
      i: update.interest_profile,
      q: update.question_set,
    });
    expect(landed).not.toMatch(/"[^"]*(score|pass|verdict|qualif)[^"]*":/i);
    expect(reasons.join(" ")).toContain("verdict-shaped keys were stripped");
  });

  it("refuses a reasonless escalation — the status move is dropped", () => {
    const { update, reasons } = buildPrescreenUpdate({
      judgment: judgment({ status: "escalated", escalation_reason: "  " }),
      policy: DEFAULT_COMMS_POLICY,
      clientName: null,
      transcript: [],
      now: NOW,
    });
    expect(update.status).toBeUndefined();
    expect(update.escalation_reason).toBeNull();
    expect(reasons).toContain("an escalation without a reason was refused");
  });

  it("drops the question set on an escalated pre-screen", () => {
    const { update, reasons } = buildPrescreenUpdate({
      judgment: judgment({
        status: "escalated",
        escalation_reason: "the candidate asked about equity specifics",
      }),
      policy: DEFAULT_COMMS_POLICY,
      clientName: null,
      transcript: [],
      now: NOW,
    });
    expect(update.status).toBe("escalated");
    expect(update.question_set).toBeNull();
    expect(reasons.join(" ")).toContain("escalated pre-screen proposes nothing");
  });

  it("clamps the questions through the shared policy validator", () => {
    const { update, clamped } = buildPrescreenUpdate({
      judgment: judgment({
        question_set: {
          subject: "Wrenfold Assurance questions",
          body: "Wrenfold Assurance would like to know more.",
          questions: [
            "What salary range are you targeting?",
            "Which regulatory regimes have you operated under?",
          ],
        },
      }),
      policy: {
        ...DEFAULT_COMMS_POLICY,
        client_identity_disclosure: "after_nda",
      },
      clientName: "Wrenfold Assurance",
      transcript: [],
      now: NOW,
    });
    expect(clamped).toBe(true);
    expect(JSON.stringify(update.question_set)).not.toContain("Wrenfold");
    expect(update.question_set?.questions).toHaveLength(1);
    expect(update.question_set?.questions[0]).toContain("regulatory");
  });

  it("coerces out-of-vocabulary interest and evidence statuses", () => {
    const dirty = judgment();
    (dirty.interest_profile as unknown as Record<string, unknown>).interest = "smashing";
    dirty.professional_evidence.leadership = {
      value: "x",
      status: "graded" as never,
      source: null,
    };
    const { update } = buildPrescreenUpdate({
      judgment: dirty,
      policy: DEFAULT_COMMS_POLICY,
      clientName: null,
      transcript: [],
      now: NOW,
    });
    expect(update.interest_profile.interest).toBe("unknown");
    expect(update.professional_evidence.leadership?.status).toBe("unknown");
  });

  it("writes NO status when the model strays outside the vocabulary", () => {
    const { update } = buildPrescreenUpdate({
      judgment: judgment({
        status: "abandoned" as PrescreenJudgment["status"],
      }),
      policy: DEFAULT_COMMS_POLICY,
      clientName: null,
      transcript: [],
      now: NOW,
    });
    expect(update.status).toBeUndefined();
  });
});

describe("stripVerdictKeys", () => {
  it("removes matching keys at any depth and keeps arrays whole", () => {
    const hits: string[] = [];
    const out = stripVerdictKeys(
      {
        keep: [{ nested: { fit_score: 9, note: "ok" } }],
        verdict: "hire",
        passed_rounds: 2,
      },
      hits
    ) as Record<string, unknown>;
    expect(out.verdict).toBeUndefined();
    expect(out.passed_rounds).toBeUndefined();
    expect(JSON.stringify(out)).toContain("ok");
    expect(JSON.stringify(out)).not.toContain("fit_score");
    expect(hits.sort()).toEqual(["fit_score", "passed_rounds", "verdict"]);
  });
});
