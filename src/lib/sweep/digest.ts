/**
 * The scheduled sweep's digest (NEXT-resend D3/D5) — the pure half,
 * so the vitest harness can hold the honesty rules the way
 * `scrub.test.ts` holds §59's boundary and `core.test.ts` holds
 * §61's.
 *
 * ## The honesty rule (D5)
 *
 * A digest that silently omits failures reads as "all healthy" — the
 * §59 half-blind-monitor lesson applied to email. So every ACTIVE
 * mandate appears in the digest exactly once, whatever happened to
 * it: a failed run says "run failed", a suspended agent says so, a
 * healthy mandate says why no suggestions were generated. Nothing is
 * dropped.
 *
 * ## What may ride this email (D6)
 *
 * Mandate titles, health enums, counts, and run outcomes — the
 * digest goes to the FOUNDER allowlist about the founder's own org.
 * Candidate names, briefs, feedback, and report content never
 * appear; the report itself lives in the product, one click away.
 */

export type SweepProjectResult = {
  projectId: string;
  title: string;
  health: "healthy" | "stalled" | "at_risk" | "unknown";
  report: "written" | "failed" | "agent_unavailable";
  suggestions:
    | { outcome: "generated"; count: number }
    | { outcome: "healthy_skipped" }
    | { outcome: "failed" }
    | { outcome: "agent_unavailable" };
};

export type SweepOutcome = {
  weekStarting: string;
  results: SweepProjectResult[];
  /** Set when the agent refused sign-in — the whole sweep was skipped
   * and the digest says exactly that. */
  agentRefusedReason?: string;
};

// Local rather than imported from lib/email/send: that module is
// server-only, and this one stays pure so the D5 harness can hold it.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** The route runs daily; the sweep is a Monday act (D3). */
export function isSweepDay(now: Date): boolean {
  return now.getUTCDay() === 1;
}

export function renderSweepDigest(outcome: SweepOutcome): {
  subject: string;
  html: string;
  text: string;
} {
  const n = outcome.results.length;
  const stalled = outcome.results.filter((r) => r.health !== "healthy" && r.health !== "unknown").length;

  const subject = outcome.agentRefusedReason
    ? `[Mandate] Weekly sweep — SKIPPED (agent unavailable)`
    : `[Mandate] Weekly sweep — ${n} mandate${n === 1 ? "" : "s"}, ${stalled} needing attention`;

  const lines: string[] = [];
  lines.push(`Week of ${outcome.weekStarting}.`);
  if (outcome.agentRefusedReason) {
    lines.push(
      `The Search Health Agent could not run — ${outcome.agentRefusedReason}. ` +
        `No reports were written this week; the mandates below are listed without fresh judgments.`
    );
  }
  for (const r of outcome.results) {
    lines.push(`• ${r.title} — ${healthLabel(r.health)}; ${reportLabel(r.report)}; ${suggestionsLabel(r.suggestions)}`);
  }
  if (n === 0) {
    lines.push("No active mandates this week.");
  }

  const text = lines.join("\n");
  const html =
    `<p>${escapeHtml(lines[0]!)}</p>` +
    (outcome.agentRefusedReason ? `<p><strong>${escapeHtml(lines[1]!)}</strong></p>` : "") +
    `<ul>` +
    outcome.results
      .map(
        (r) =>
          `<li><strong>${escapeHtml(r.title)}</strong> — ${escapeHtml(healthLabel(r.health))}; ` +
          `${escapeHtml(reportLabel(r.report))}; ${escapeHtml(suggestionsLabel(r.suggestions))}</li>`
      )
      .join("") +
    `</ul>` +
    (n === 0 ? `<p>No active mandates this week.</p>` : "");

  return { subject, html, text };
}

function healthLabel(h: SweepProjectResult["health"]): string {
  switch (h) {
    case "healthy": return "healthy";
    case "stalled": return "STALLED";
    case "at_risk": return "AT RISK";
    case "unknown": return "health unknown (run failed)";
  }
}

function reportLabel(r: SweepProjectResult["report"]): string {
  switch (r) {
    case "written": return "weekly report written";
    case "failed": return "report run FAILED";
    case "agent_unavailable": return "report skipped (agent unavailable)";
  }
}

function suggestionsLabel(s: SweepProjectResult["suggestions"]): string {
  switch (s.outcome) {
    case "generated": return `${s.count} suggestion${s.count === 1 ? "" : "s"} generated`;
    case "healthy_skipped": return "no suggestions (healthy)";
    case "failed": return "suggestions run FAILED";
    case "agent_unavailable": return "suggestions skipped (agent unavailable)";
  }
}
