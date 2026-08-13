// GDPR Art. 14 — the notification clock for sourced candidates.
//
// Art. 14 applies when personal data is obtained from someone OTHER than the
// data subject. That is exactly `source_kind = 'sourced'`: a person who never
// approached us and does not know we hold a record about them. They must be
// told what we hold and where it came from, "within a reasonable period" and at
// the latest one month from obtaining the data (Art. 14(3)(a)).
//
// A candidate who applied is out of scope here — they handed the data over
// themselves, and the duty that applies is Art. 13 at the point of collection,
// which is a different obligation discharged in a different place. Reporting
// them as "notification due" would bury the real queue in noise.
//
// Pure. No I/O, no clock of its own — `now` is always passed in, so the status
// is testable at any point on the timeline.

/** Art. 14(3)(a): at the latest, one month from obtaining the data. */
export const ART14_DEADLINE_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

export type NotificationStatus =
  /** Not a sourced record — the duty does not arise here. */
  | "not_required"
  /** Told, and when. */
  | "notified"
  /** Sourced, not yet told, still inside the month. */
  | "due"
  /** Sourced, not told, past the deadline. */
  | "overdue";

export type NotificationState = {
  status: NotificationStatus;
  /**
   * Days left before the deadline; negative once past it. Null when the duty
   * does not arise, or when it has been discharged.
   */
  days_remaining: number | null;
  /** When the duty expires. Null when it does not arise or is discharged. */
  due_at: string | null;
};

export type NotifiableCandidate = {
  source_kind: string | null;
  sourced_at: string | null;
  subject_notified_at: string | null;
};

export function notificationState(
  candidate: NotifiableCandidate,
  now: Date
): NotificationState {
  if (candidate.source_kind !== "sourced") {
    return { status: "not_required", days_remaining: null, due_at: null };
  }

  if (candidate.subject_notified_at) {
    return { status: "notified", days_remaining: null, due_at: null };
  }

  // A sourced record with no sourced_at cannot have its deadline computed. It
  // is still owed a notification, so it reports as due rather than vanishing
  // from the queue — the failure mode to avoid is a person quietly dropping off
  // the list because a timestamp was missing.
  if (!candidate.sourced_at) {
    return { status: "due", days_remaining: null, due_at: null };
  }

  const sourced = new Date(candidate.sourced_at).getTime();
  if (!Number.isFinite(sourced)) {
    return { status: "due", days_remaining: null, due_at: null };
  }

  const dueMs = sourced + ART14_DEADLINE_DAYS * DAY_MS;
  const days_remaining = Math.ceil((dueMs - now.getTime()) / DAY_MS);

  return {
    status: days_remaining < 0 ? "overdue" : "due",
    days_remaining,
    due_at: new Date(dueMs).toISOString(),
  };
}

/** How many sourced people are still owed a notification, and how many are late. */
export function notificationBacklog(
  candidates: readonly NotifiableCandidate[],
  now: Date
): { due: number; overdue: number } {
  let due = 0;
  let overdue = 0;
  for (const c of candidates) {
    const state = notificationState(c, now);
    if (state.status === "due") due++;
    else if (state.status === "overdue") overdue++;
  }
  return { due, overdue };
}

export function notificationLabel(state: NotificationState): string | null {
  switch (state.status) {
    case "not_required":
    case "notified":
      return null;
    case "overdue":
      return state.days_remaining === null
        ? "Notification overdue"
        : `Notification ${Math.abs(state.days_remaining)}d overdue`;
    case "due":
      return state.days_remaining === null
        ? "Notification owed"
        : `Notify within ${state.days_remaining}d`;
  }
}
