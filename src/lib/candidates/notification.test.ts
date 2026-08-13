import { describe, expect, test } from "vitest";
import {
  ART14_DEADLINE_DAYS,
  notificationBacklog,
  notificationLabel,
  notificationState,
  type NotifiableCandidate,
} from "./notification";

const NOW = new Date("2026-08-31T12:00:00.000Z");

function candidate(o: Partial<NotifiableCandidate> = {}): NotifiableCandidate {
  return {
    source_kind: "sourced",
    sourced_at: "2026-08-20T12:00:00.000Z",
    subject_notified_at: null,
    ...o,
  };
}

describe("who the duty applies to", () => {
  test("a sourced person is owed a notification", () => {
    expect(notificationState(candidate(), NOW).status).toBe("due");
  });

  test("an applicant is NOT — they handed the data over themselves", () => {
    // Art. 13 applies at the point of collection instead, discharged elsewhere.
    // Listing them here would bury the real queue in noise.
    for (const kind of ["applied", "referred", "imported", null]) {
      expect(notificationState(candidate({ source_kind: kind }), NOW).status).toBe(
        "not_required"
      );
    }
  });

  test("someone already told is done", () => {
    const state = notificationState(
      candidate({ subject_notified_at: "2026-08-21T09:00:00.000Z" }),
      NOW
    );
    expect(state.status).toBe("notified");
    expect(state.days_remaining).toBeNull();
  });
});

describe("the one-month clock", () => {
  test("counts from when the data was obtained, not from today", () => {
    // Sourced 11 days ago, so 19 of the 30 days remain.
    const state = notificationState(candidate(), NOW);
    expect(state.days_remaining).toBe(19);
    expect(state.due_at).toBe("2026-09-19T12:00:00.000Z");
  });

  test("goes overdue the day after the deadline, not on it", () => {
    const onDeadline = notificationState(
      candidate({ sourced_at: "2026-08-01T12:00:00.000Z" }),
      NOW
    );
    expect(onDeadline.days_remaining).toBe(0);
    expect(onDeadline.status).toBe("due");

    const pastIt = notificationState(
      candidate({ sourced_at: "2026-07-31T12:00:00.000Z" }),
      NOW
    );
    expect(pastIt.days_remaining).toBeLessThan(0);
    expect(pastIt.status).toBe("overdue");
  });

  test("uses the statutory month", () => {
    expect(ART14_DEADLINE_DAYS).toBe(30);
  });

  test("a sourced record with no timestamp stays in the queue", () => {
    // The failure to avoid is a real person quietly dropping off the list
    // because a timestamp was missing. Still owed, deadline simply unknown.
    const missing = notificationState(candidate({ sourced_at: null }), NOW);
    expect(missing.status).toBe("due");
    expect(missing.days_remaining).toBeNull();

    const garbage = notificationState(candidate({ sourced_at: "not a date" }), NOW);
    expect(garbage.status).toBe("due");
    expect(garbage.days_remaining).toBeNull();
  });
});

describe("notificationBacklog", () => {
  test("separates the late from the merely pending, and ignores applicants", () => {
    const backlog = notificationBacklog(
      [
        candidate(),
        candidate(),
        candidate({ sourced_at: "2026-06-01T12:00:00.000Z" }),
        candidate({ subject_notified_at: "2026-08-22T12:00:00.000Z" }),
        candidate({ source_kind: "applied" }),
      ],
      NOW
    );
    expect(backlog).toEqual({ due: 2, overdue: 1 });
  });

  test("an empty pool owes nothing", () => {
    expect(notificationBacklog([], NOW)).toEqual({ due: 0, overdue: 0 });
  });
});

describe("notificationLabel", () => {
  test("says how long is left, or how late it is", () => {
    expect(notificationLabel(notificationState(candidate(), NOW))).toBe(
      "Notify within 19d"
    );
    expect(
      notificationLabel(
        notificationState(candidate({ sourced_at: "2026-07-01T12:00:00.000Z" }), NOW)
      )
    ).toBe("Notification 31d overdue");
  });

  test("falls back to a bare statement when the deadline is unknown", () => {
    expect(
      notificationLabel(notificationState(candidate({ sourced_at: null }), NOW))
    ).toBe("Notification owed");
  });

  test("says nothing when nothing is owed", () => {
    expect(
      notificationLabel(notificationState(candidate({ source_kind: "applied" }), NOW))
    ).toBeNull();
    expect(
      notificationLabel(
        notificationState(candidate({ subject_notified_at: "2026-08-22T00:00:00Z" }), NOW)
      )
    ).toBeNull();
  });
});
