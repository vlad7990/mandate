import { describe, expect, it } from "vitest";
import {
  composeClientInterviewContent,
  parseAnswersBody,
} from "./interview-answers-core";
import { persistClientInterviewAnswers } from "./interview-answers";
import type { ClientInterviewQuestion } from "@/lib/ai/client-interview-agent";

const INTERVIEW_ID = "3b241101-e2bb-4255-8caf-4136c566a962";

const QUESTIONS: ClientInterviewQuestion[] = [
  {
    id: "q01",
    question: "What is the compensation range?",
    why_it_matters: "Anchors offers.",
    gap_id: "missing_info:1",
    gap_label: "Compensation range",
  },
  {
    id: "q02",
    question: "Who does the role report to?",
    why_it_matters: "Shapes seniority.",
    gap_id: "missing_info:2",
    gap_label: "Reporting line",
  },
];

describe("parseAnswersBody", () => {
  it("refuses non-objects and malformed interview ids", () => {
    expect(parseAnswersBody(null).ok).toBe(false);
    expect(parseAnswersBody("x").ok).toBe(false);
    expect(
      parseAnswersBody({ interview_id: "not-a-uuid", answers: {} }).ok
    ).toBe(false);
  });

  it("keeps only app-shaped question ids with non-empty string answers", () => {
    const parsed = parseAnswersBody({
      interview_id: INTERVIEW_ID,
      answers: {
        q01: "  £180–210k  ",
        q02: "",
        q999: "also fine",
        "'; DROP TABLE": "nope",
        q0: "too short",
        q03: 42,
      },
      hm_label: "Jane",
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.answers).toEqual({
      q01: "£180–210k",
      q999: "also fine",
    });
    expect(parsed.value.hm_label).toBe("Jane");
  });

  it("refuses a non-object answers field", () => {
    expect(
      parseAnswersBody({ interview_id: INTERVIEW_ID, answers: ["a"] }).ok
    ).toBe(false);
  });
});

describe("composeClientInterviewContent", () => {
  it("composes answered questions only, in the set's order", () => {
    const content = composeClientInterviewContent(
      QUESTIONS,
      { q02: "The CFO.", q01: "£180–210k" },
      "Jane Smith @ Acme",
      3
    );
    expect(content).toBe(
      [
        "CLIENT INTERVIEW — answers to question set v3",
        "From: Jane Smith @ Acme",
        "",
        "Q: What is the compensation range?",
        "A: £180–210k",
        "",
        "Q: Who does the role report to?",
        "A: The CFO.",
      ].join("\n")
    );
  });

  it("omits the From line when the label is empty", () => {
    const content = composeClientInterviewContent(
      QUESTIONS,
      { q01: "Yes" },
      "",
      1
    );
    expect(content.startsWith("CLIENT INTERVIEW — answers to question set v1\n\nQ:")).toBe(
      true
    );
  });

  it("ignores answers for unknown question ids", () => {
    const content = composeClientInterviewContent(
      QUESTIONS,
      { q77: "Orphan" },
      "",
      1
    );
    expect(content).not.toContain("Orphan");
  });
});

// ---------------------------------------------------------------------------
// persistClientInterviewAnswers — the two doors (127, gate D1(b)/D3(c))
// ---------------------------------------------------------------------------

type Recorded =
  | { op: "insert"; payload: Record<string, unknown> }
  | { op: "update"; payload: Record<string, unknown>; id: string };

/**
 * The narrowest fake that exercises the real call chain: the prior-answer
 * lookup, then either an insert or an update-by-id. Deliberately not a
 * mock of Supabase — it records what the function asked the database to
 * do, which is the thing D3(c) is a claim about.
 */
function fakeSupabase(prior: { id: string } | null) {
  const recorded: Recorded[] = [];
  const client = {
    from() {
      return {
        select() {
          const builder: Record<string, unknown> = {};
          builder.eq = () => builder;
          builder.maybeSingle = async () => ({ data: prior, error: null });
          return builder;
        },
        insert(payload: Record<string, unknown>) {
          recorded.push({ op: "insert", payload });
          return {
            select: () => ({
              single: async () => ({ data: { id: "inserted-row" }, error: null }),
            }),
          };
        },
        update(payload: Record<string, unknown>) {
          return {
            eq: (_column: string, id: string) => {
              recorded.push({ op: "update", payload, id });
              return {
                select: () => ({
                  single: async () => ({ data: { id }, error: null }),
                }),
              };
            },
          };
        },
      };
    },
  };
  return { client, recorded };
}

const PARSED = {
  interview_id: INTERVIEW_ID,
  answers: { q01: "£180–210k", q999: "not in the set" },
  hm_label: "Jane Smith",
};

describe("persistClientInterviewAnswers", () => {
  it("the token door writes an anonymous row and never replaces", async () => {
    const { client, recorded } = fakeSupabase(null);
    const result = await persistClientInterviewAnswers({
      supabase: client as never,
      projectId: "p1",
      organizationId: "o1",
      questions: QUESTIONS,
      version: 3,
      parsed: PARSED,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.replaced).toBe(false);
    expect(recorded).toHaveLength(1);
    expect(recorded[0].op).toBe("insert");
    // 069 D5: the token path's anonymity is a design fact, and 127 must
    // not quietly close it.
    expect(recorded[0].payload.submitted_by).toBeNull();
  });

  it("the signed-in door attributes the row to the session's author", async () => {
    const { client, recorded } = fakeSupabase(null);
    const result = await persistClientInterviewAnswers({
      supabase: client as never,
      projectId: "p1",
      organizationId: "o1",
      questions: QUESTIONS,
      version: 3,
      parsed: PARSED,
      submittedByUserId: "u-42",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.replaced).toBe(false);
    expect(recorded[0].op).toBe("insert");
    expect(recorded[0].payload.submitted_by).toBe("u-42");
  });

  it("D3(c): a second answer from the same author EDITS the standing row", async () => {
    const { client, recorded } = fakeSupabase({ id: "existing-row" });
    const result = await persistClientInterviewAnswers({
      supabase: client as never,
      projectId: "p1",
      organizationId: "o1",
      questions: QUESTIONS,
      version: 3,
      parsed: PARSED,
      submittedByUserId: "u-42",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.replaced).toBe(true);
    expect(result.feedbackId).toBe("existing-row");
    // One answer per person per mandate: an update, never a second insert.
    expect(recorded).toHaveLength(1);
    expect(recorded[0].op).toBe("update");
    if (recorded[0].op !== "update") return;
    expect(recorded[0].id).toBe("existing-row");
    // The author is not restated on an edit — moving it would re-arm
    // guard_author_in_org for no reason, and it cannot legitimately change.
    expect(recorded[0].payload).not.toHaveProperty("submitted_by");
  });

  it("answers_json keeps only what the approved set actually asked", async () => {
    const { client, recorded } = fakeSupabase(null);
    await persistClientInterviewAnswers({
      supabase: client as never,
      projectId: "p1",
      organizationId: "o1",
      questions: QUESTIONS,
      version: 3,
      parsed: PARSED,
      submittedByUserId: "u-42",
    });

    // q999 parses as app-shaped but is not in the set: keeping it would
    // prefill a field that no longer exists.
    expect(recorded[0].payload.answers_json).toEqual({ q01: "£180–210k" });
  });

  it("refuses a submission that answers nothing in the set", async () => {
    const { client, recorded } = fakeSupabase(null);
    const result = await persistClientInterviewAnswers({
      supabase: client as never,
      projectId: "p1",
      organizationId: "o1",
      questions: QUESTIONS,
      version: 3,
      parsed: { ...PARSED, answers: { q999: "orphan" } },
      submittedByUserId: "u-42",
    });

    expect(result.ok).toBe(false);
    expect(recorded).toHaveLength(0);
  });
});
