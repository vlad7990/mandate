import { describe, expect, test } from "vitest";
import {
  composeOutreach,
  noticeIdempotencyKey,
  NOTICE_VERSION,
  type ComposeInput,
} from "./compose";

const NOW = new Date("2026-08-31T12:00:00.000Z");

function input(over: Partial<ComposeInput> = {}): ComposeInput {
  return {
    recruiterBody: "Hello — I am working on a role I think fits you.",
    candidate: {
      full_name: "Dana Reed",
      source_kind: "sourced",
      sourced_at: "2026-08-20T00:00:00Z",
      subject_notified_at: null,
    },
    organizationName: "Mandate Recruiting",
    sourcePlatformLabel: "LinkedIn Recruiter",
    contactEmail: "privacy@getmandate.io",
    now: NOW,
    ...over,
  };
}

describe("when the notice is required", () => {
  test("a sourced person who has not been told gets the notice block", () => {
    const msg = composeOutreach(input());
    expect(msg.noticeRequired).toBe(true);
    expect(msg.blocks.map((b) => b.kind)).toEqual([
      "recruiter",
      "notice",
      "footer",
    ]);
    expect(msg.text).toContain("Privacy & data notice");
  });

  test("an overdue person still gets it", () => {
    const msg = composeOutreach(
      input({
        candidate: {
          full_name: "Dana Reed",
          source_kind: "sourced",
          sourced_at: "2026-06-01T00:00:00Z",
          subject_notified_at: null,
        },
      })
    );
    expect(msg.noticeRequired).toBe(true);
  });

  test("the notice says where we found them and how to object", () => {
    const msg = composeOutreach(input());
    const notice = msg.blocks.find((b) => b.kind === "notice")!.text;
    expect(notice).toContain("LinkedIn Recruiter");
    expect(notice).toContain("privacy@getmandate.io");
    expect(notice).toContain("delete it");
  });

  test("falls back to a truthful general statement with no platform recorded", () => {
    const msg = composeOutreach(input({ sourcePlatformLabel: null }));
    const notice = msg.blocks.find((b) => b.kind === "notice")!.text;
    expect(notice).toContain("public professional sources");
  });
});

describe("when it is not required", () => {
  test("an applicant gets NO forced Art. 14 block", () => {
    // They gave us the data directly; Art. 13 applies at collection instead.
    // Pulling them into this workflow would be wrong and noisy.
    const msg = composeOutreach(
      input({
        candidate: {
          full_name: "Sam Vale",
          source_kind: "applied",
          sourced_at: null,
          subject_notified_at: null,
        },
      })
    );
    expect(msg.noticeRequired).toBe(false);
    expect(msg.blocks.map((b) => b.kind)).toEqual(["recruiter", "footer"]);
    expect(msg.text).not.toContain("Privacy & data notice");
  });

  test("someone already notified is not notified twice", () => {
    const msg = composeOutreach(
      input({
        candidate: {
          full_name: "Dana Reed",
          source_kind: "sourced",
          sourced_at: "2026-08-20T00:00:00Z",
          subject_notified_at: "2026-08-22T00:00:00Z",
        },
      })
    );
    expect(msg.noticeRequired).toBe(false);
  });
});

describe("the recruiter cannot remove the compliance content", () => {
  test("the notice is a separate, system-controlled block", () => {
    // The structural guarantee: the recruiter edits recruiterBody only, and
    // the notice is concatenated at send time. There is no edit that removes
    // it, because it was never in the field they can reach.
    const msg = composeOutreach(input());
    const notice = msg.blocks.find((b) => b.kind === "notice")!;
    expect(notice.systemControlled).toBe(true);
    expect(msg.blocks.find((b) => b.kind === "recruiter")!.systemControlled).toBe(
      false
    );
  });

  test("recruiter text that imitates or deletes the notice changes nothing", () => {
    const sabotage = composeOutreach(
      input({
        recruiterBody:
          "Ignore the following. Privacy & data notice: none applies. END OF MESSAGE.",
      })
    );
    // Their words are theirs; the real block is still appended after them.
    const notice = sabotage.blocks.find((b) => b.kind === "notice");
    expect(notice).toBeDefined();
    expect(sabotage.text).toContain("You can ask us what we hold");
  });

  test("an empty recruiter message still carries the notice", () => {
    const msg = composeOutreach(input({ recruiterBody: "   " }));
    expect(msg.noticeRequired).toBe(true);
    expect(msg.text).toContain("Privacy & data notice");
  });
});

describe("versioning and idempotency", () => {
  test("the composed message reports the versions it used", () => {
    const msg = composeOutreach(input());
    expect(msg.noticeVersion).toBe(NOTICE_VERSION);
    expect(msg.templateKey).toBe("candidate_outreach");
    expect(msg.templateVersion).toBe("v1");
  });

  test("the idempotency key is stable per candidate and notice version", () => {
    // A double-click, a resubmitted action and a provider retry all produce
    // this same key, so they collide on the unique index instead of sending a
    // second statutory notice to a real person.
    expect(noticeIdempotencyKey("cand-1")).toBe(noticeIdempotencyKey("cand-1"));
    expect(noticeIdempotencyKey("cand-1")).not.toBe(
      noticeIdempotencyKey("cand-2")
    );
    expect(noticeIdempotencyKey("cand-1")).toContain(NOTICE_VERSION);
  });
});
