// The schema_failed wiring's representative proof (slice 3, gate
// 03bafc3): a model answer whose shape is unusable marks the run
// schema_failed and still throws exactly as before — the outer 090
// bookkeeping sees the same error it always did.

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/anthropic", () => ({
  getAnthropic: () => ({ messages: { create: mocks.create } }),
}));
vi.mock("@/lib/supabase-service-role", () => ({
  getServiceRoleSupabaseClient: () => ({
    from: () => ({
      insert: () => Promise.resolve({ error: null }),
      update: (patch: unknown) => ({
        eq: (_c: string, id: string) => {
          mocks.update(patch, id);
          return Promise.resolve({ error: null });
        },
      }),
    }),
  }),
}));
vi.mock("@/lib/agents/session", () => ({ signInRelationshipAgent: vi.fn() }));
vi.mock("@/lib/skills/skill-injector", () => ({
  applySkillsToPrompt: vi.fn(async (p: string) => p),
}));
vi.mock("@/lib/observability/sentry", () => ({ captureSeamError: vi.fn() }));

import { generateRelationshipJudgment } from "./run-relationship";

const INPUT = {
  profile: {
    display_name: "Test Person",
    relationship_state: "cold",
    disposition: {},
    follow_up_at: null,
    follow_up_note: null,
    last_meaningful_contact_at: null,
  },
  appearances: [],
  contact_history: [],
  strategies: [],
  evidence: {},
  today: "2026-08-25",
};

beforeEach(() => vi.clearAllMocks());

describe("schema_failed wiring", () => {
  it("marks the run and rethrows when the model returns unparseable text", async () => {
    mocks.create.mockResolvedValue({
      content: [{ type: "text", text: "not json at all" }],
      stop_reason: "end_turn",
      usage: { input_tokens: 10, output_tokens: 4 },
    });

    await expect(generateRelationshipJudgment(INPUT)).rejects.toThrow();
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.update.mock.calls[0][0]).toEqual({
      outcome: "schema_failed",
    });
  });

  it("marks the run when the response carries no text block", async () => {
    mocks.create.mockResolvedValue({
      content: [],
      stop_reason: "end_turn",
      usage: {},
    });
    await expect(generateRelationshipJudgment(INPUT)).rejects.toThrow(
      /no text block/
    );
    expect(mocks.update).toHaveBeenCalledWith(
      { outcome: "schema_failed" },
      expect.any(String)
    );
  });

  it("does NOT mark on a good answer", async () => {
    mocks.create.mockResolvedValue({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            relationship_state: "cold",
            disposition: {},
            follow_up_at: null,
            follow_up_note: null,
          }),
        },
      ],
      stop_reason: "end_turn",
      usage: {},
    });
    const result = await generateRelationshipJudgment(INPUT);
    expect(result.relationship_state).toBe("cold");
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
