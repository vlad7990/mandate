// The pool-search seam's unit proofs (096). The live drive proves the
// page end to end; these pin the seam's contract: honest refusal with
// nothing spent, the agent-side read feeding the judgment, skills in
// the system prompt, and a trail of counts with no query text.
//
// §206 — and now the CEILING. The fake client below is not a stub that
// returns rows: it PROJECTS the select string (so a JSON path the code
// forgets to select disappears from the payload) and APPLIES the clauses
// it is handed (so a filter left in Node stops narrowing anything). That
// is what makes "every filter reaches the query" a guard rather than a
// wish — mutation-tested, each of these fails when its construct moves.

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

import {
  describeJudgedPool,
  POOL_JUDGE_CAP,
  runCandidateSearchAsAgent,
} from "./run-candidate-search";

type Row = Record<string, unknown>;

const CANDIDATES: Row[] = [
  {
    id: "c1",
    project_id: "p1",
    full_name: "Harmon Vale",
    current_title: "COO",
    current_company: "Acme",
    archetype: "Operator",
    pipeline_stage: "matched",
    cv_structured: {
      domain: "Supply chain",
      scale: "12 sites",
      tech_exposure: ["SAP", "Kinaxis"],
      transformation_experience: ["Post-merger integration"],
      summary: "Ops leader. Deep supply-chain history.",
    },
    created_by: "rec-a",
    email: "harmon@vale.test",
    linkedin_url: null,
    network_profile_id: "np-harmon",
    updated_at: "2026-09-20T00:00:00Z",
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
    network_profile_id: "np-iris",
    updated_at: "2026-09-19T00:00:00Z",
  },
];

// §204 — the same human as c1 AFTER a merge: their second record keys on
// name|company, not on the email, which is the whole reason they were two
// profiles. The merge repointed this row onto Harmon's person.
const MERGED_SECOND_RECORD: Row = {
  id: "c3",
  project_id: "p2",
  full_name: "Harmon Vale",
  current_title: "Chief Operating Officer",
  current_company: "Acme",
  archetype: "Operator",
  pipeline_stage: "matched",
  cv_structured: {},
  created_by: null,
  email: null,
  linkedin_url: null,
  network_profile_id: "np-harmon",
  updated_at: "2026-09-18T00:00:00Z",
};
const PROJECTS = [{ id: "p1", title: "COO Search" }];
const SCORES = [
  { candidate_id: "c1", overall_score: 7.4, tier: "tier_1" },
  { candidate_id: "c2", overall_score: 6.1, tier: "tier_2" },
];

// ── The fake PostgREST client ────────────────────────────────────────────

type Clause = { op: string; column: string; value: unknown };

type Read = {
  table: string;
  select: string;
  head: boolean;
  countMode: string | null;
  clauses: Clause[];
  orders: Array<{ column: string; ascending: boolean; nullsFirst?: boolean }>;
  limit: number | null;
  rows: number;
};

/** `alias:col->>key`, `alias:col->key`, or a plain column. */
function project(row: Row, select: string): Row {
  const out: Row = {};
  for (const raw of select.split(",")) {
    const item = raw.trim();
    if (!item) continue;
    const [aliasPart, pathPart] = item.includes(":")
      ? [item.slice(0, item.indexOf(":")), item.slice(item.indexOf(":") + 1)]
      : [item, item];
    const text = pathPart.includes("->>");
    const [column, key] = text ? pathPart.split("->>") : pathPart.split("->");
    if (key === undefined) {
      out[aliasPart] = row[column];
      continue;
    }
    const json = (row[column] ?? {}) as Row;
    const value = json[key];
    out[aliasPart] = value === undefined ? null : text ? String(value) : value;
  }
  return out;
}

function matches(row: Row, clause: Clause): boolean {
  switch (clause.op) {
    case "eq":
      return row[clause.column] === clause.value;
    case "in":
      return (clause.value as unknown[]).includes(row[clause.column]);
    case "is":
      return row[clause.column] === clause.value;
    case "or": {
      // Only the shapes this seam emits are understood; anything else is a
      // loud failure rather than a quiet pass.
      return String(clause.value)
        .split(/,(?![^(]*\))/)
        .some((term) => {
          const isNull = term.match(/^(\w+)\.is\.null$/);
          if (isNull) return row[isNull[1]] === null;
          const inList = term.match(/^(\w+)\.in\.\((.*)\)$/);
          if (inList) return inList[2].split(",").includes(String(row[inList[1]]));
          throw new Error(`fake client cannot parse or() term: ${term}`);
        });
    }
    default:
      throw new Error(`fake client cannot apply ${clause.op}`);
  }
}

function fakeClient(tables: Record<string, Row[]>, reads: Read[]) {
  const rpc = vi.fn().mockResolvedValue({ error: null });
  const signOut = vi.fn().mockResolvedValue(undefined);

  const from = (table: string) => {
    const state: Read = {
      table,
      select: "",
      head: false,
      countMode: null,
      clauses: [],
      orders: [],
      limit: null,
      rows: 0,
    };

    const run = () => {
      let rows = (tables[table] ?? []).filter((r) =>
        state.clauses.every((c) => matches(r, c))
      );
      for (const order of [...state.orders].reverse()) {
        rows = [...rows].sort((a, b) => {
          const av = a[order.column] ?? null;
          const bv = b[order.column] ?? null;
          if (av === bv) return 0;
          // NULLs sort last when nullsFirst is false, first otherwise.
          if (av === null) return order.nullsFirst === false ? 1 : -1;
          if (bv === null) return order.nullsFirst === false ? -1 : 1;
          const cmp = String(av) < String(bv) ? -1 : 1;
          return order.ascending ? cmp : -cmp;
        });
      }
      const count = rows.length;
      const limited = state.limit === null ? rows : rows.slice(0, state.limit);
      state.rows = state.head ? 0 : limited.length;
      reads.push({ ...state, clauses: [...state.clauses] });
      return {
        data: state.head ? [] : limited.map((r) => project(r, state.select)),
        count: state.countMode ? count : null,
        error: null,
      };
    };

    const builder = {
      select(cols: string, opts?: { count?: string; head?: boolean }) {
        state.select = cols;
        state.countMode = opts?.count ?? null;
        state.head = opts?.head ?? false;
        return builder;
      },
      order(
        column: string,
        opts?: { ascending?: boolean; nullsFirst?: boolean }
      ) {
        state.orders.push({
          column,
          ascending: opts?.ascending !== false,
          nullsFirst: opts?.nullsFirst,
        });
        return builder;
      },
      limit(n: number) {
        state.limit = n;
        return builder;
      },
      eq(column: string, value: unknown) {
        state.clauses.push({ op: "eq", column, value });
        return builder;
      },
      in(column: string, value: unknown[]) {
        state.clauses.push({ op: "in", column, value });
        return builder;
      },
      is(column: string, value: unknown) {
        state.clauses.push({ op: "is", column, value });
        return builder;
      },
      or(expr: string) {
        state.clauses.push({ op: "or", column: "", value: expr });
        return builder;
      },
      then(
        resolve: (v: unknown) => unknown,
        reject?: (e: unknown) => unknown
      ) {
        try {
          return Promise.resolve(resolve(run()));
        } catch (err) {
          return reject ? Promise.resolve(reject(err)) : Promise.reject(err);
        }
      },
    };
    return builder;
  };

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

function agentSession(candidates: Row[] = CANDIDATES) {
  const reads: Read[] = [];
  return {
    ...fakeClient(
      { candidates, projects: PROJECTS, candidate_scores: SCORES },
      reads
    ),
    reads,
  };
}

/** The narrowed pool read — the one that actually returns candidate rows. */
function poolRead(reads: Read[]): Read {
  const read = reads.find((r) => r.table === "candidates" && !r.head);
  if (!read) throw new Error("the seam never read the pool");
  return read;
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

function pooledCandidates(): Array<Record<string, unknown>> {
  const payload = JSON.parse(mocks.create.mock.calls[0][0].messages[0].content);
  return payload.candidates;
}

function answers() {
  mocks.create.mockResolvedValue({
    content: [{ type: "text", text: MATCH_JSON }],
  });
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
    const { session, reads } = agentSession();
    mocks.signIn.mockResolvedValue(session);
    answers();

    await runCandidateSearchAsAgent(
      "ops leaders",
      { ...NO_FILTERS, ownerIds: ["someone-else"] },
      "mandate"
    );

    // c1 belongs to rec-a and is out of scope; c2 is UNOWNED and stays.
    expect(pooledIds()).toEqual(["c2"]);
    // §206 — and the trawl was a CLAUSE, so the out-of-scope row was never
    // read at all.
    expect(poolRead(reads).clauses).toContainEqual({
      op: "or",
      column: "",
      value: "created_by.is.null,created_by.in.(someone-else)",
    });
  });

  it("searches everything when no trawl is given — Pool search is unchanged", async () => {
    const { session } = agentSession();
    mocks.signIn.mockResolvedValue(session);
    answers();

    await runCandidateSearchAsAgent("ops leaders", NO_FILTERS);
    expect(pooledIds()).toEqual(["c1", "c2"]);
  });

  it("does not propose someone already on the mandate", async () => {
    const { session } = agentSession();
    mocks.signIn.mockResolvedValue(session);
    answers();

    await runCandidateSearchAsAgent(
      "ops leaders",
      { ...NO_FILTERS, excludePersonKeys: ["np-harmon"] },
      "mandate"
    );
    expect(pooledIds()).toEqual(["c2"]);
  });

  // §204 — the defect that slice closed. The exclusion used to compare
  // COMPUTED identity keys, so a merged person's second record (which keys
  // differently by construction — that is why they were split) was proposed
  // again, and the copy that followed was permitted. Mandate membership is
  // asked of the person, so both records drop out together.
  it("does not propose a MERGED person whose other record keys differently", async () => {
    const { session } = agentSession([...CANDIDATES, MERGED_SECOND_RECORD]);
    mocks.signIn.mockResolvedValue(session);
    answers();

    await runCandidateSearchAsAgent(
      "ops leaders",
      { ...NO_FILTERS, excludePersonKeys: ["np-harmon"] },
      "mandate"
    );

    expect(pooledIds()).toEqual(["c2"]);
  });

  // The other half of the same rule: a row with NO person yet (§196/139 —
  // a CV still being read) still has to answer "already on this mandate?",
  // and answers it on its computed key.
  it("excludes a person-less row on its computed key", async () => {
    const pending = {
      ...MERGED_SECOND_RECORD,
      id: "c4",
      full_name: "Pending Person",
      current_company: "Nowhere",
      network_profile_id: null,
    };
    const { session } = agentSession([...CANDIDATES, pending]);
    mocks.signIn.mockResolvedValue(session);
    answers();

    await runCandidateSearchAsAgent(
      "ops leaders",
      { ...NO_FILTERS, excludePersonKeys: ["key:name:pending person|nowhere"] },
      "mandate"
    );

    expect(pooledIds()).toEqual(["c1", "c2"]);
  });

  it("records what prompted the run, and never whose CVs it saw", async () => {
    const { session, rpc } = agentSession();
    mocks.signIn.mockResolvedValue(session);
    answers();

    await runCandidateSearchAsAgent(
      "ops leaders",
      { ...NO_FILTERS, ownerIds: ["rec-a"], excludePersonKeys: ["np-someone"] },
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
    answers();

    const run = await runCandidateSearchAsAgent("ops leaders with scale", {
      ...NO_FILTERS,
      projectId: "p1",
    });

    expect(run.status).toBe("ready");
    if (run.status !== "ready") return;
    expect(run.result.matches).toHaveLength(1);
    expect(run.judged).toBe(2);
    expect(run.inScope).toBe(2);

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
        // §206 D3 — the third count.
        judged: 2,
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

// ── §206 — the ceiling ───────────────────────────────────────────────────

describe("§206 — the pool read's ceiling", () => {
  /** A pool deliberately larger than the cap, newest id first. */
  function bigPool(n: number): Row[] {
    return Array.from({ length: n }, (_, i) => ({
      id: `big-${String(n - i).padStart(4, "0")}`,
      project_id: "p1",
      full_name: `Person ${i}`,
      current_title: "Head of Ops",
      current_company: "Widening Co",
      archetype: "Operator",
      pipeline_stage: "found",
      cv_structured: { domain: "Ops", summary: "One. Two." },
      created_by: null,
      email: null,
      linkedin_url: null,
      network_profile_id: `np-big-${i}`,
      // Newest first: index 0 is the most recently updated.
      updated_at: `2026-09-${String(30 - (i % 28)).padStart(2, "0")}T00:00:00Z`,
      __rank: i,
    }));
  }

  it("asks the DATABASE for one more than the cap, never the whole pool", async () => {
    const { session, reads } = agentSession(bigPool(260));
    mocks.signIn.mockResolvedValue(session);
    answers();

    await runCandidateSearchAsAgent("ops leaders", NO_FILTERS);

    // The cap must arrive as a LIMIT. Slicing after the read would leave
    // this null and ship every row into the function.
    expect(poolRead(reads).limit).toBe(POOL_JUDGE_CAP + 1);
    expect(poolRead(reads).rows).toBe(POOL_JUDGE_CAP + 1);
    expect(pooledIds()).toHaveLength(POOL_JUDGE_CAP);
  });

  it("never selects cv_structured — only the six fields the payload uses", async () => {
    const { session, reads } = agentSession(CANDIDATES);
    mocks.signIn.mockResolvedValue(session);
    answers();

    await runCandidateSearchAsAgent("ops leaders", NO_FILTERS);

    const select = poolRead(reads).select;
    // The column averages 14.9 KB a row. Selecting it to use six fields of
    // it was the wire half of the ceiling; a bare mention here is that
    // defect returning.
    expect(select).not.toMatch(/cv_structured(?!\s*->)/);
    for (const path of [
      "cv_structured->>domain",
      "cv_structured->>scale",
      "cv_structured->tech_exposure",
      "cv_structured->transformation_experience",
      "cv_structured->>summary",
    ]) {
      expect(select).toContain(path);
    }

    // And the payload is built from those paths, not from a profile object:
    // the projection above is all the fake returns.
    const first = pooledCandidates()[0];
    expect(first.signals).toBe("Supply chain, 12 sites, SAP, Kinaxis, Post-merger integration");
    expect(first.headline).toBe("Ops leader.");
  });

  it("pushes every filter into the query — none is left for Node", async () => {
    const { session, reads } = agentSession(CANDIDATES);
    mocks.signIn.mockResolvedValue(session);
    answers();

    await runCandidateSearchAsAgent("ops leaders", {
      projectId: "p1",
      archetype: "Operator",
      stage: "matched",
      tier: "tier_1",
      ownerIds: ["rec-a"],
    });

    const clauses = poolRead(reads).clauses;
    expect(clauses).toContainEqual({ op: "eq", column: "project_id", value: "p1" });
    expect(clauses).toContainEqual({ op: "eq", column: "archetype", value: "Operator" });
    expect(clauses).toContainEqual({
      op: "eq",
      column: "pipeline_stage",
      value: "matched",
    });
    // Tier lives one table away, so it arrives as the id set that table
    // resolved to — the shape the candidates list uses.
    expect(clauses).toContainEqual({ op: "in", column: "id", value: ["c1"] });
    expect(clauses).toContainEqual({
      op: "or",
      column: "",
      value: "created_by.is.null,created_by.in.(rec-a)",
    });

    // The read returned exactly the one row those clauses admit — nothing
    // was narrowed after the fact.
    expect(poolRead(reads).rows).toBe(1);
    expect(pooledIds()).toEqual(["c1"]);
  });

  // D4 — whose CV the model never sees. Recency, not score: scores are
  // calibrated against the mandate a candidate was scored FOR, so ranking
  // by them would promote people judged for an unrelated role and bury
  // every newly parsed CV (§175's class as a ranking).
  it("keeps the most recently updated, with a deterministic tiebreak", async () => {
    const { session, reads } = agentSession(bigPool(260));
    mocks.signIn.mockResolvedValue(session);
    answers();

    await runCandidateSearchAsAgent("ops leaders", NO_FILTERS);

    expect(poolRead(reads).orders).toEqual([
      // NULLS LAST is explicit: updated_at is nullable, and a row with no
      // timestamp is not the newest thing in the pool.
      { column: "updated_at", ascending: false, nullsFirst: false },
      { column: "id", ascending: false },
    ]);

    // Nothing the model saw is older than something it did not see.
    const judged = new Set(pooledIds());
    const pool = bigPool(260);
    const newest = [...pool]
      .sort((a, b) =>
        String(a.updated_at) === String(b.updated_at)
          ? String(b.id).localeCompare(String(a.id))
          : String(b.updated_at).localeCompare(String(a.updated_at))
      )
      .slice(0, POOL_JUDGE_CAP)
      .map((r) => r.id as string);
    expect([...judged].sort()).toEqual([...newest].sort());
  });

  it("reads scores for the judged rows only, not for the whole pool", async () => {
    const { session, reads } = agentSession(bigPool(260));
    mocks.signIn.mockResolvedValue(session);
    answers();

    await runCandidateSearchAsAgent("ops leaders", NO_FILTERS);

    const scoreRead = reads.find((r) => r.table === "candidate_scores");
    expect(scoreRead).toBeDefined();
    const idClause = scoreRead!.clauses.find((c) => c.column === "candidate_id");
    expect((idClause?.value as unknown[]).length).toBe(POOL_JUDGE_CAP);
  });

  // D3 — the count is never silently short.
  it("reports judged and inScope, and the trail carries all three counts", async () => {
    const { session, rpc } = agentSession(bigPool(260));
    mocks.signIn.mockResolvedValue(session);
    answers();

    const run = await runCandidateSearchAsAgent("ops leaders", NO_FILTERS);

    expect(run.status).toBe("ready");
    if (run.status !== "ready") return;
    expect(run.judged).toBe(POOL_JUDGE_CAP);
    expect(run.inScope).toBe(260);

    const detail = rpc.mock.calls[0][1].p_detail;
    expect(detail.pool).toBe(260);
    expect(detail.filtered).toBe(260);
    expect(detail.judged).toBe(POOL_JUDGE_CAP);
  });

  it("states the cut exactly when one happened, and never otherwise", () => {
    expect(describeJudgedPool({ judged: 200, inScope: 1340 })).toBe(
      "Judged the 200 most recently updated of 1,340 in scope"
    );
    // Equal counts are a complete answer, and a disclosure there would
    // teach the reader to ignore the real one.
    expect(describeJudgedPool({ judged: 4, inScope: 4 })).toBeNull();
    expect(describeJudgedPool({ judged: 0, inScope: 0 })).toBeNull();
  });

  it("says nothing about a cut when the whole scope was judged", async () => {
    const { session } = agentSession(CANDIDATES);
    mocks.signIn.mockResolvedValue(session);
    answers();

    const run = await runCandidateSearchAsAgent("ops leaders", NO_FILTERS);
    if (run.status !== "ready") throw new Error("expected a ready run");
    expect(run.judged).toBe(run.inScope);
    expect(describeJudgedPool(run)).toBeNull();
  });

  // A rejected query must not read as an empty pool: now that the filters
  // are in the request, silence would answer "nobody matches" to a
  // question that was never asked.
  it("fails loudly when the pool read is rejected", async () => {
    const { session, rpc } = agentSession(CANDIDATES);
    mocks.signIn.mockResolvedValue(session);
    const broken = {
      ...session,
      client: {
        ...(session.client as unknown as { rpc: unknown }),
        from: (table: string) =>
          table === "candidates"
            ? {
                select: () => ({
                  order: () => ({
                    order: () => ({
                      limit: () => Promise.resolve({ data: null, count: null, error: { message: "414 URI too long" } }),
                    }),
                  }),
                }),
              }
            : { select: () => Promise.resolve({ data: [], count: 0, error: null }) },
      } as never,
    };
    mocks.signIn.mockResolvedValue(broken);

    const run = await runCandidateSearchAsAgent("ops leaders", NO_FILTERS);

    expect(run.status).toBe("failed");
    expect(mocks.create).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
    expect(mocks.captureSeamError).toHaveBeenCalled();
  });
});
