import { describe, expect, test } from "vitest";
import {
  actionSummary,
  buildActionQueue,
  type ActionQueueInput,
} from "./action-queue";

const NOW = new Date("2026-08-31T12:00:00.000Z");

const PROJECTS = [
  { id: "p1", title: "Head of IT Operations" },
  { id: "p2", title: "Global Head of RegTech" },
];

function sourced(project_id: string, sourced_at: string) {
  return {
    project_id,
    source_kind: "sourced",
    sourced_at,
    subject_notified_at: null,
  };
}

function input(over: Partial<ActionQueueInput> = {}): ActionQueueInput {
  return {
    projects: PROJECTS,
    candidates: [],
    runs: [],
    undecidedResults: [],
    myTasks: [],
    ...over,
  };
}

describe("ordering", () => {
  test("a single overdue notification outranks forty staged rows", () => {
    // The rule this module exists to enforce. Sorting by volume would bury a
    // statutory deadline under a pile of chores.
    const items = buildActionQueue(
      input({
        candidates: [sourced("p1", "2026-06-01T00:00:00Z")],
        runs: [{ id: "r1", project_id: "p2", status: "executed" }],
        undecidedResults: Array.from({ length: 40 }, () => ({ run_id: "r1" })),
      }),
      NOW
    );

    expect(items[0].kind).toBe("notification_overdue");
    expect(items[0].count).toBe(1);
    expect(items[1].kind).toBe("import_undecided");
    expect(items[1].count).toBe(40);
  });

  test("orders by consequence, then volume, then name", () => {
    const items = buildActionQueue(
      input({
        candidates: [
          sourced("p1", "2026-08-20T00:00:00Z"),
          sourced("p2", "2026-08-20T00:00:00Z"),
          sourced("p2", "2026-08-21T00:00:00Z"),
        ],
      }),
      NOW
    );
    expect(items.map((i) => i.kind)).toEqual([
      "notification_due",
      "notification_due",
    ]);
    // p2 has two, so it sorts above p1's one.
    expect(items[0].project_id).toBe("p2");
  });
});

describe("what counts as an action", () => {
  test("overdue and merely-due notifications are separate items", () => {
    const items = buildActionQueue(
      input({
        candidates: [
          sourced("p1", "2026-06-01T00:00:00Z"), // overdue
          sourced("p1", "2026-08-25T00:00:00Z"), // due
        ],
      }),
      NOW
    );
    expect(items.map((i) => i.kind)).toEqual([
      "notification_overdue",
      "notification_due",
    ]);
    expect(items[0].severity).toBe("urgent");
    expect(items[1].severity).toBe("attention");
  });

  test("applicants never appear — the duty does not arise", () => {
    const items = buildActionQueue(
      input({
        candidates: [
          {
            project_id: "p1",
            source_kind: "applied",
            sourced_at: null,
            subject_notified_at: null,
          },
        ],
      }),
      NOW
    );
    expect(items).toEqual([]);
  });

  test("a notified person drops off the queue", () => {
    const items = buildActionQueue(
      input({
        candidates: [
          {
            ...sourced("p1", "2026-06-01T00:00:00Z"),
            subject_notified_at: "2026-06-10T00:00:00Z",
          },
        ],
      }),
      NOW
    );
    expect(items).toEqual([]);
  });

  test("staged rows are attributed to their project through the run", () => {
    const items = buildActionQueue(
      input({
        runs: [{ id: "r1", project_id: "p2", status: "executed" }],
        undecidedResults: [{ run_id: "r1" }, { run_id: "r1" }],
      }),
      NOW
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      kind: "import_undecided",
      project_id: "p2",
      project_title: "Global Head of RegTech",
      count: 2,
    });
  });

  test("a staged row whose run is unknown is dropped, not mis-attributed", () => {
    const items = buildActionQueue(
      input({ undecidedResults: [{ run_id: "ghost" }] }),
      NOW
    );
    expect(items).toEqual([]);
  });

  test("drafts never executed surface as routine", () => {
    const items = buildActionQueue(
      input({
        runs: [
          { id: "r1", project_id: "p1", status: "draft" },
          { id: "r2", project_id: "p1", status: "executed" },
        ],
      }),
      NOW
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      kind: "run_never_executed",
      count: 1,
      severity: "routine",
    });
  });

  test("a project the recruiter cannot see contributes nothing", () => {
    // RLS already scopes the reads; this guards the join, so a run belonging
    // to an unlisted project cannot leak a title-less row into the queue.
    const items = buildActionQueue(
      input({ runs: [{ id: "r1", project_id: "other", status: "draft" }] }),
      NOW
    );
    expect(items).toEqual([]);
  });
});

describe("labels", () => {
  test("read as instructions, not statistics", () => {
    const items = buildActionQueue(
      input({ candidates: [sourced("p1", "2026-06-01T00:00:00Z")] }),
      NOW
    );
    expect(items[0].label).toContain("past the one-month deadline");
    expect(items[0].href).toBe("/app/projects/p1/candidates");
  });

  test("singular and plural both read correctly", () => {
    const one = buildActionQueue(
      input({
        runs: [{ id: "r1", project_id: "p1", status: "draft" }],
      }),
      NOW
    );
    expect(one[0].label).toBe("1 saved search has never been run");

    const many = buildActionQueue(
      input({
        runs: [
          { id: "r1", project_id: "p1", status: "draft" },
          { id: "r2", project_id: "p1", status: "draft" },
        ],
      }),
      NOW
    );
    expect(many[0].label).toBe("2 saved searches have never been run");
  });
});

describe("actionSummary", () => {
  test("counts items by severity", () => {
    const items = buildActionQueue(
      input({
        candidates: [
          sourced("p1", "2026-06-01T00:00:00Z"),
          sourced("p2", "2026-08-25T00:00:00Z"),
        ],
        runs: [{ id: "r1", project_id: "p1", status: "draft" }],
      }),
      NOW
    );
    expect(actionSummary(items)).toEqual({
      urgent: 1,
      attention: 1,
      routine: 1,
    });
  });

  test("an empty queue is all zeroes", () => {
    expect(actionSummary([])).toEqual({ urgent: 0, attention: 0, routine: 0 });
  });
});

describe("the viewer's tasks (106)", () => {
  const NOW = new Date("2026-08-25T09:00:00Z");

  test("overdue tasks aggregate into one attention row above the chores", () => {
    const items = buildActionQueue(
      input({
        runs: [{ id: "r1", project_id: "p1", status: "draft" }],
        myTasks: [
          { id: "t1", title: "Chase the reference", due_on: "2026-08-20" },
          { id: "t2", title: "Renew the seat", due_on: "2026-08-24" },
          { id: "t3", title: "No due date", due_on: null },
        ],
      }),
      NOW
    );
    const kinds = items.map((i) => i.kind);
    expect(kinds).toEqual(["task_overdue", "run_never_executed"]);
    const row = items[0];
    expect(row.count).toBe(2);
    expect(row.severity).toBe("attention");
    expect(row.project_id).toBeNull();
    expect(row.href).toBe("#my-tasks");
  });

  test("a task due today is a routine row at the end; none due, no rows", () => {
    const dueToday = buildActionQueue(
      input({ myTasks: [{ id: "t1", title: "Prep the panel", due_on: "2026-08-25" }] }),
      NOW
    );
    expect(dueToday.map((i) => i.kind)).toEqual(["task_due"]);
    expect(dueToday[0].severity).toBe("routine");

    const none = buildActionQueue(
      input({ myTasks: [{ id: "t1", title: "Someday", due_on: null }] }),
      NOW
    );
    expect(none).toEqual([]);
  });
});
