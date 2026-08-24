// The D8 seam-bind proofs (096). The sourcing judgment has NO surface
// yet — these tests are its drive: the raw runner is unexported, and
// the only door refuses without the Candidate Search Agent's session
// BEFORE any billed search is spent, injects the org's skills into the
// system prompt, keeps the compliance blocklist on the tool call, and
// records counts — never a person, never a domain list.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SourceConnector } from "@/lib/sourcing/source-policy";

const mocks = vi.hoisted(() => ({
  signIn: vi.fn(),
  applySkills: vi.fn(),
  create: vi.fn(),
  captureSeamError: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/agents/session", () => ({
  signInCandidateSearchAgent: mocks.signIn,
}));
vi.mock("@/lib/skills/skill-injector", () => ({
  applySkillsToPrompt: mocks.applySkills,
}));
vi.mock("@/lib/anthropic", () => ({
  getAnthropic: () => ({ messages: { create: mocks.create } }),
}));
vi.mock("@/lib/observability/sentry", () => ({
  captureSeamError: mocks.captureSeamError,
}));

import { runSourcingSearchAsAgent } from "./run-sourcing-search";

const WEB_CONNECTOR: SourceConnector = {
  id: "c1",
  organization_id: "org1",
  provider: "web_search",
  label: "Test sources",
  allowed_domains: ["github.com", "crunchbase.com"],
  status: "active",
};

function agentSession(overrides?: { rpcError?: unknown }) {
  const rpc = vi.fn().mockResolvedValue({ error: overrides?.rpcError ?? null });
  const signOut = vi.fn().mockResolvedValue(undefined);
  return {
    session: {
      ok: true as const,
      client: { rpc } as never,
      userId: "agent-user",
      organizationId: "org1",
      signOut,
    },
    rpc,
    signOut,
  };
}

function terminalResponse(text: string, searchResults = 1) {
  return {
    stop_reason: "end_turn",
    content: [
      ...Array.from({ length: searchResults }, () => ({
        type: "web_search_tool_result",
        content: [{ type: "web_search_result", url: "https://github.com/x" }],
      })),
      { type: "text", text },
    ],
  };
}

const LEAD_JSON = JSON.stringify({
  summary: "One plausible lead.",
  leads: [
    {
      full_name: "Quill Farrow",
      current_title: "VP Engineering",
      current_company: "Meridian",
      location: null,
      rationale: "Spoke on post-trade systems.",
      evidence: [{ url: "https://github.com/quillf", claim: "Maintains the ledger tooling." }],
      confidence: "medium",
    },
  ],
  coverage_notes: [],
});

const BRIEF = {
  role_title: "Head of Platform",
  company_name: "Acme",
  brief: "Platform leader for a regulated market.",
  must_haves: [],
  exclude_names: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.applySkills.mockResolvedValue("SYSTEM+SKILLS");
});

describe("runSourcingSearchAsAgent — the seam-bind (D8)", () => {
  it("hard-stops with no usable source BEFORE any sign-in", async () => {
    const run = await runSourcingSearchAsAgent(BRIEF, [], {
      projectId: null,
    });
    expect(run.status).toBe("no_source");
    expect(mocks.signIn).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("refuses without the agent's session, spending NO search (D5)", async () => {
    mocks.signIn.mockResolvedValue({
      ok: false,
      reason: "the candidate_search agent has no credentials in this environment",
    });
    const run = await runSourcingSearchAsAgent(BRIEF, [WEB_CONNECTOR], {
      projectId: null,
    });
    expect(run.status).toBe("agent_unavailable");
    if (run.status === "agent_unavailable") {
      expect(run.reason).toMatch(/credentials|suspended/);
    }
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.applySkills).not.toHaveBeenCalled();
  });

  it("injects skills via the agent's session, keeps the blocklist, records counts", async () => {
    const { session, rpc, signOut } = agentSession();
    mocks.signIn.mockResolvedValue(session);
    mocks.create.mockResolvedValue(terminalResponse(LEAD_JSON, 2));

    const run = await runSourcingSearchAsAgent(BRIEF, [WEB_CONNECTOR], {
      projectId: "proj1",
    });

    expect(run.status).toBe("ready");
    if (run.status !== "ready") return;
    expect(run.result.content.leads).toHaveLength(1);
    expect(run.result.search_rounds).toBe(2);

    // Skills rode the AGENT's session (D6).
    expect(mocks.applySkills).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        projectId: "proj1",
        organizationId: "org1",
        client: session.client,
      })
    );
    const call = mocks.create.mock.calls[0][0];
    expect(call.system).toBe("SYSTEM+SKILLS");

    // The compliance boundary survived the seam: allowed scoped,
    // LinkedIn blocked at the tool parameters.
    expect(call.tools[0].allowed_domains).toEqual(["crunchbase.com", "github.com"]);
    expect(call.tools[0].blocked_domains).toContain("linkedin.com");

    // The trail: counts only — no person, no domain list, no brief text.
    expect(rpc).toHaveBeenCalledWith("record_agent_event", {
      p_event_type: "sourcing_search_executed",
      p_project_id: "proj1",
      p_detail: {
        agent_kind: "candidate_search",
        trigger: "run",
        search_rounds: 2,
        domains: 2,
        leads: 1,
      },
    });
    const detailText = JSON.stringify(rpc.mock.calls[0][1]);
    expect(detailText).not.toMatch(/Quill|Farrow|github|Acme|Platform/);

    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("signs out even when the judgment throws, and records nothing", async () => {
    const { session, rpc, signOut } = agentSession();
    mocks.signIn.mockResolvedValue(session);
    mocks.create.mockRejectedValue(new Error("model down"));

    const run = await runSourcingSearchAsAgent(BRIEF, [WEB_CONNECTOR], {
      projectId: null,
    });

    expect(run.status).toBe("failed");
    expect(rpc).not.toHaveBeenCalled();
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
