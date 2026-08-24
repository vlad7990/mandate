import { describe, expect, it } from "vitest";
import {
  isSweepDay,
  renderSweepDigest,
  type SweepOutcome,
} from "./digest";

/**
 * The D5 harness: the digest never drops a mandate, states failures
 * as failures, and says plainly when the agent was suspended — a
 * digest that omits what went wrong reads as "all healthy", which is
 * the failure mode this slice's channel exists to end.
 */

describe("isSweepDay — the Monday gate", () => {
  it("fires only on UTC Mondays", () => {
    expect(isSweepDay(new Date("2026-08-24T06:00:00Z"))).toBe(true);  // Monday
    expect(isSweepDay(new Date("2026-08-25T06:00:00Z"))).toBe(false); // Tuesday
    expect(isSweepDay(new Date("2026-08-23T06:00:00Z"))).toBe(false); // Sunday
    // The 06:00 UTC cron on Sunday evening US time is still Monday UTC —
    // the gate is UTC on purpose, matching the schedule's own clock.
    expect(isSweepDay(new Date("2026-08-24T23:59:00Z"))).toBe(true);
  });
});

describe("renderSweepDigest — the honesty rules", () => {
  const base: SweepOutcome = {
    weekStarting: "2026-08-24",
    results: [
      {
        projectId: "p1",
        title: "Head of IT Operations",
        health: "stalled",
        report: "written",
        suggestions: { outcome: "generated", count: 4 },
      },
      {
        projectId: "p2",
        title: "VP Engineering",
        health: "healthy",
        report: "written",
        suggestions: { outcome: "healthy_skipped" },
      },
      {
        projectId: "p3",
        title: "CTO Search",
        health: "unknown",
        report: "failed",
        suggestions: { outcome: "failed" },
      },
    ],
  };

  it("lists every mandate exactly once, failures included", () => {
    const { text } = renderSweepDigest(base);
    for (const title of ["Head of IT Operations", "VP Engineering", "CTO Search"]) {
      expect(text.split(title).length - 1).toBe(1);
    }
    expect(text).toContain("report run FAILED");
    expect(text).toContain("suggestions run FAILED");
    expect(text).toContain("health unknown (run failed)");
  });

  it("counts only genuinely unhealthy mandates in the subject", () => {
    const { subject } = renderSweepDigest(base);
    // stalled counts; healthy does not; unknown does NOT masquerade as
    // needing-attention — it is already loudly a failure in the body.
    expect(subject).toContain("3 mandates, 1 needing attention");
  });

  it("says plainly when the agent was suspended, and still sends", () => {
    const { subject, text } = renderSweepDigest({
      weekStarting: "2026-08-24",
      results: [],
      agentRefusedReason: "the search_health agent is suspended — an operator suspended it from /ops",
    });
    expect(subject).toContain("SKIPPED");
    expect(text).toContain("The Search Health Agent could not run");
    expect(text).toContain("suspended");
  });

  it("handles an empty week without inventing content", () => {
    const { text } = renderSweepDigest({ weekStarting: "2026-08-24", results: [] });
    expect(text).toContain("No active mandates this week.");
  });

  it("escapes titles in the html half", () => {
    const { html } = renderSweepDigest({
      weekStarting: "2026-08-24",
      results: [
        {
          projectId: "p1",
          title: 'CTO <script>alert("x")</script>',
          health: "healthy",
          report: "written",
          suggestions: { outcome: "healthy_skipped" },
        },
      ],
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
