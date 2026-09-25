// The pool-search seam's unit proofs (096). The live drive proves the
// page end to end; these pin the seam's contract: honest refusal with
// nothing spent, the agent-side read feeding the judgment, skills in
// the system prompt, and a trail of counts with no query text.

import { beforeEach, describe, expect, it, vi } from "vitest";

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

import { runCandidateSearchAsAgent } from "./run-candidate-search";

const CANDIDATES = [
  {
    id: "c1",
    project_id: "p1",
    full_name: "Harmon Vale",
    current_title: "COO",
    current_company: "Acme",
    archetype: "Operator",
    pipeline_stage: "matched",
    cv_structured: { summary: "Ops leader. Deep supply-chain history." },
    created_by: "rec-a",
    email: "harmon@vale.test",
    linkedin_url: null,
  },
  {
    id: "c2",
    project_id: "p1",
    full_name: "Iris Coldwater",
    current_title: "VP Ops",
    current_company: "Meridian",
    archetype: "Builder",
    pipeline_stage: "screening",
    cv_structured: {},
    // Unowned: a pre-140 row, in EVERY trawl by ruling.
    created_by: null,
    email: "iris@coldwater.test",
    linkedin_url: null,
  },
];
const PROJECTS = [{ id: "p1", title: "COO Search" }];
const SCORES = [
  { candidate_id: "c1", overall_score: 7.4, tier: "tier_1" },
  { candidate_id: "c2", overall_score: 6.1, tier: "tier_2" },
];

function agentSession() {
  const rpc = vi.fn().mockResolvedValue({ error: null });
  const signOut = vi.fn().mockResolvedValue(undefined);
  const tables: Record<string, unknown[]> = {
    candidates: CANDIDATES,
    projects: PROJECTS,
    candidate_scores: SCORES,
  };
  const from = vi.fn((table: string) => ({
    select: () => Promise.resolve({ data: tables[table] ?? [] }),
  }));
  return {
    session: {
      ok: true as const,
      client: { rpc, from } as never,
      userId: "agent-user",
      organizationId: "org1",
      signOut,
    },
    rpc,
    signOut,
  };
}

const MATCH_JSON = JSON.stringify({
  parsed_criteria: { intent: "Ops leaders.", must_haves: ["ops"], nice_to_haves: [] },
  matches: [{ candidate_id: "c1", match_score: 82, reasoning: "Direct fit." }],
});

const NO_FILTERS = { projectId: null, archetype: null, stage: null, tier: null };

/** What the model was actually handed, as ids. */
function pooledIds(): string[] {
  const payload = JSON.parse(mocks.create.mock.calls[0][0].messages[0].content);
  return payload.candidates.map((c: { id: string }) => c.id);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.applySkills.mockResolvedValue("SYSTEM+SKILLS");
});

describe("runCandidateSearchAsAgent — the pool-search seam", () => {
  it("refuses without the agent's session, spending nothing (D5)", async () => {
    mocks.signIn.mockResolvedValue({ ok: false, reason: "suspended from /ops" });
    const run = await runCandidateSearchAsAgent("ops leaders", NO_FILTERS);
    expect(run.status).toBe("agent_unavailable");
    expect(mocks.create).not.toHaveBeenCalled();
  });

  // §200 — the trawl. A SCOPE, not a boundary: RLS is untouched and the
  // same reader can open any of these rows elsewhere.
  it("narrows the haystack to the trawl, and keeps every unowned row", async () => {
    const { session } = agentSession();
    mocks.signIn.mockResolvedValue(session);
    mocks.create.mockResolvedValue({
      content: [{ type: "text", text: MATCH_JSON }],
    });

    await runCandidateSearchAsAgent(
      "ops leaders",
      { ...NO_FILTERS, ownerIds: ["someone-else"] },
      "mandate"
    );

    // c1 belongs to rec-a and is out of scope; c2 is UNOWNED and stays.
    expect(pooledIds()).toEqual(["c2"]);
  });

  it("searches everything when no trawl is given — Pool search is unchanged", async () => {
    const { session } = agentSession();
    mocks.signIn.mockResolvedValue(session);
    mocks.create.mockResolvedValue({
      content: [{ type: "text", text: MATCH_JSON }],
    });

    await runCandidateSearchAsAgent("ops leaders", NO_FILTERS);
    expect(pooledIds()).toEqual(["c1", "c2"]);
  });

  it("does not propose someone already on the mandate", async () => {
    const { session } = agentSession();
    mocks.signIn.mockResolvedValue(session);
    mocks.create.mockResolvedValue({
      content: [{ type: "text", text: MATCH_JSON }],
    });

    await runCandidateSearchAsAgent(
      "ops leaders",
      { ...NO_FILTERS, excludeIdentityKeys: ["email:harmon@vale.test"] },
      "mandate"
    );
    expect(pooledIds()).toEqual(["c2"]);
  });

  it("records what prompted the run, and never whose CVs it saw", async () => {
    const { session, rpc } = agentSession();
    mocks.signIn.mockResolvedValue(session);
    mocks.create.mockResolvedValue({
      content: [{ type: "text", text: MATCH_JSON }],
    });

    await runCandidateSearchAsAgent(
      "ops leaders",
      { ...NO_FILTERS, ownerIds: ["rec-a"], excludeIdentityKeys: ["email:x@y.z"] },
      "mandate",
      "p-target"
    );

    // Drive 132's finding: the search is deliberately NOT filtered to the
    // mandate, so without this the event landed with no mandate at all —
    // "a suggestion ran" was true and unanswerable as "for what".
    expect(rpc.mock.calls[0][1].p_project_id).toBe("p-target");
    const detail = rpc.mock.calls[0][1].p_detail;
    expect(detail.trigger).toBe("mandate");
    expect(detail.owner_scoped).toBe(true);
    expect(detail.excluded).toBe(1);
    expect(JSON.stringify(detail)).not.toContain("rec-a");
  });

  it("judges the agent-side pool with skills and records counts, no query text", async () => {
    const { session, rpc, signOut } = agentSession();
    mocks.signIn.mockResolvedValue(session);
    mocks.create.mockResolvedValue({
      content: [{ type: "text", text: MATCH_JSON }],
    });

    const run = await runCandidateSearchAsAgent("ops leaders with scale", {
      ...NO_FILTERS,
      projectId: "p1",
    });

    expect(run.status).toBe("ready");
    if (run.status !== "ready") return;
    expect(run.result.matches).toHaveLength(1);
    expect(run.poolSize).toBe(2);

    // Skills rode the AGENT's session (D6), project-scoped.
    expect(mocks.applySkills).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        projectId: "p1",
        organizationId: "org1",
        client: session.client,
      })
    );
    expect(mocks.create.mock.calls[0][0].system).toBe("SYSTEM+SKILLS");

    // The trail: counts and filter booleans — never the query's text.
    expect(rpc).toHaveBeenCalledWith("record_agent_event", {
      p_event_type: "candidate_search_answered",
      p_project_id: "p1",
      p_detail: {
        agent_kind: "candidate_search",
        trigger: "query",
        pool: 2,
        filtered: 2,
        matches: 1,
        project_filter: true,
        archetype_filter: false,
        stage_filter: false,
        tier_filter: false,
        // §200 — counts only, never whose CVs the trawl saw.
        owner_scoped: false,
        excluded: 0,
      },
    });
    const detailText = JSON.stringify(rpc.mock.calls[0][1]);
    expect(detailText).not.toMatch(/ops leaders|Vale|Coldwater|Acme/);

    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("answers an empty filtered pool honestly with no model spend and no event", async () => {
    const { session, rpc, signOut } = agentSession();
    mocks.signIn.mockResolvedValue(session);

    const run = await runCandidateSearchAsAgent("anyone", {
      ...NO_FILTERS,
      archetype: "Transformer",
    });

    expect(run.status).toBe("empty_pool");
    expect(mocks.create).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("signs out when the judgment throws, and records nothing", async () => {
    const { session, rpc, signOut } = agentSession();
    mocks.signIn.mockResolvedValue(session);
    mocks.create.mockRejectedValue(new Error("model down"));

    const run = await runCandidateSearchAsAgent("ops leaders", NO_FILTERS);

    expect(run.status).toBe("failed");
    expect(rpc).not.toHaveBeenCalled();
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
