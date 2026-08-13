// What needs doing today, across every mandate.
//
// Everything the product tracks is per-project: the Art. 14 notification
// backlog, staged import rows awaiting a decision, runs saved but never run.
// A recruiter carrying six mandates has no way to see any of it without
// opening each one, so the work quietly does not happen. This module is the
// aggregation.
//
// Two rules shaped it:
//
// 1. EVERY ITEM IS AN ACTION, not a statistic. "12 candidates" is a number;
//    "3 people you sourced have not been told you hold their data, 2 of them
//    overdue" is a thing to do. If a row does not tell the recruiter what to
//    do next, it does not belong here — a dashboard of counts is something you
//    stop reading by the second week.
//
// 2. LEGAL OBLIGATIONS OUTRANK CONVENIENCE. An overdue Art. 14 notification is
//    a compliance exposure with a statutory clock; an undecided import row is
//    a chore. They must never sort by count, or forty staged rows would bury
//    one overdue notification.

import {
  notificationBacklog,
  type NotifiableCandidate,
} from "@/lib/candidates/notification";

export const ACTION_KINDS = [
  "notification_overdue",
  "notification_due",
  "import_undecided",
  "run_never_executed",
] as const;

export type ActionKind = (typeof ACTION_KINDS)[number];

/**
 * Ordering. Lower sorts first, and it is by CONSEQUENCE rather than by volume:
 * a missed statutory deadline is not comparable to an unfinished chore.
 */
const KIND_RANK: Record<ActionKind, number> = {
  notification_overdue: 0,
  notification_due: 1,
  import_undecided: 2,
  run_never_executed: 3,
};

export type ActionSeverity = "urgent" | "attention" | "routine";

const KIND_SEVERITY: Record<ActionKind, ActionSeverity> = {
  notification_overdue: "urgent",
  notification_due: "attention",
  import_undecided: "attention",
  run_never_executed: "routine",
};

export type ActionItem = {
  kind: ActionKind;
  severity: ActionSeverity;
  project_id: string;
  project_title: string;
  count: number;
  /** Imperative, and specific enough to act on without opening anything. */
  label: string;
  /** Deep link to the screen where the action is actually performed. */
  href: string;
};

export type ActionQueueInput = {
  projects: ReadonlyArray<{ id: string; title: string }>;
  /** Every candidate the org can see, with provenance. */
  candidates: ReadonlyArray<NotifiableCandidate & { project_id: string | null }>;
  /** Sourcing runs, for drafts never executed. */
  runs: ReadonlyArray<{ id: string; project_id: string; status: string }>;
  /** Staged result rows still awaiting a promote/skip decision. */
  undecidedResults: ReadonlyArray<{ run_id: string }>;
};

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

export function buildActionQueue(
  input: ActionQueueInput,
  now: Date
): ActionItem[] {
  const titleById = new Map(input.projects.map((p) => [p.id, p.title]));
  const items: ActionItem[] = [];

  for (const project of input.projects) {
    const mine = input.candidates.filter((c) => c.project_id === project.id);
    const backlog = notificationBacklog(mine, now);

    if (backlog.overdue > 0) {
      items.push({
        kind: "notification_overdue",
        severity: KIND_SEVERITY.notification_overdue,
        project_id: project.id,
        project_title: project.title,
        count: backlog.overdue,
        label: `${backlog.overdue} sourced ${plural(backlog.overdue, "person is", "people are")} past the one-month deadline to be told you hold their data`,
        href: `/app/projects/${project.id}/candidates`,
      });
    }

    if (backlog.due > 0) {
      items.push({
        kind: "notification_due",
        severity: KIND_SEVERITY.notification_due,
        project_id: project.id,
        project_title: project.title,
        count: backlog.due,
        label: `${backlog.due} sourced ${plural(backlog.due, "person still needs", "people still need")} the Art. 14 notification`,
        href: `/app/projects/${project.id}/candidates`,
      });
    }
  }

  // Staged rows, grouped up to their project through the run they belong to.
  const projectByRun = new Map(input.runs.map((r) => [r.id, r.project_id]));
  const undecidedByProject = new Map<string, number>();
  for (const row of input.undecidedResults) {
    const projectId = projectByRun.get(row.run_id);
    if (!projectId) continue;
    undecidedByProject.set(
      projectId,
      (undecidedByProject.get(projectId) ?? 0) + 1
    );
  }

  for (const [projectId, count] of undecidedByProject) {
    const title = titleById.get(projectId);
    if (!title) continue;
    items.push({
      kind: "import_undecided",
      severity: KIND_SEVERITY.import_undecided,
      project_id: projectId,
      project_title: title,
      count,
      label: `${count} imported ${plural(count, "row is", "rows are")} waiting on a keep-or-skip decision`,
      href: `/app/projects/${projectId}/sourcing?tab=runs`,
    });
  }

  // A saved strategy nobody ever ran. Cheap to forget, and the whole point of
  // recording it was to find out what it produced.
  const draftsByProject = new Map<string, number>();
  for (const run of input.runs) {
    if (run.status !== "draft") continue;
    draftsByProject.set(
      run.project_id,
      (draftsByProject.get(run.project_id) ?? 0) + 1
    );
  }

  for (const [projectId, count] of draftsByProject) {
    const title = titleById.get(projectId);
    if (!title) continue;
    items.push({
      kind: "run_never_executed",
      severity: KIND_SEVERITY.run_never_executed,
      project_id: projectId,
      project_title: title,
      count,
      label: `${count} saved ${plural(count, "search has", "searches have")} never been run`,
      href: `/app/projects/${projectId}/sourcing?tab=runs`,
    });
  }

  items.sort(
    (a, b) =>
      KIND_RANK[a.kind] - KIND_RANK[b.kind] ||
      b.count - a.count ||
      a.project_title.localeCompare(b.project_title)
  );

  return items;
}

/** Counts by severity, for the header. */
export function actionSummary(items: readonly ActionItem[]): {
  urgent: number;
  attention: number;
  routine: number;
} {
  return {
    urgent: items.filter((i) => i.severity === "urgent").length,
    attention: items.filter((i) => i.severity === "attention").length,
    routine: items.filter((i) => i.severity === "routine").length,
  };
}
