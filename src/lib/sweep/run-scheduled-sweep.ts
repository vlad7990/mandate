import "server-only";
import { signInSearchHealthAgent } from "@/lib/agents/session";
import { runHealthSuggestionsAndPersist } from "@/lib/ai/run-search-health";
import { runWeeklyReportAndPersist } from "@/lib/ai/run-weekly-report";
import { sendEmail } from "@/lib/email/send";
import { FOUNDER_EMAILS } from "@/lib/auth/founders";
import { captureSeamError } from "@/lib/observability/sentry";
import {
  renderSweepDigest,
  type SweepOutcome,
  type SweepProjectResult,
} from "./digest";

/**
 * The scheduled sweep (NEXT-resend D3) — §58's standing promise,
 * kept: the cron route signs in THE SEARCH HEALTH AGENT (same
 * credential, same /ops kill switch — suspension refuses the whole
 * sweep at the first sign-in, before any token is spent), runs both
 * of its judgments per active mandate with the `scheduled` trigger
 * 087 reserved, and sends the founder allowlist ONE digest.
 *
 * ## The writes are the record; the email is only the channel (D7)
 *
 * Reports and suggestions land through the same seams the on-demand
 * buttons use, and they STAND whether or not the digest delivers. A
 * refused send logs and captures; nothing is rolled back, and next
 * Monday's digest is unaffected.
 *
 * ## Enumeration under the agent's own session
 *
 * The active-mandate list is read under the agent's own RLS — the
 * pool's projects SELECT (074). No service role, nothing ambient;
 * the sweep sees exactly what the agent may see.
 */
export async function runScheduledSweep(now: Date): Promise<
  | { ran: true; outcome: SweepOutcome; digest: "sent" | "send_failed" | "not-configured" }
  | { ran: false; reason: string }
> {
  const weekStarting = mondayIso(now);

  const session = await signInSearchHealthAgent();
  if (!session.ok) {
    // The kill switch covers the SCHEDULED face too (087 D7). The
    // digest still goes out saying exactly what happened — a sweep
    // that vanishes silently reads as "all healthy" (D5).
    const outcome: SweepOutcome = {
      weekStarting,
      results: [],
      agentRefusedReason: session.reason,
    };
    const digest = await deliver(outcome);
    return { ran: true, outcome, digest };
  }

  type ProjectRow = { id: string; title: string };
  let projects: ProjectRow[] = [];
  try {
    const { data, error } = await session.client
      .from("projects")
      .select("id, title")
      .eq("status", "active")
      .order("created_at", { ascending: true });
    if (error) {
      captureSeamError("[sweep] active-mandate enumeration failed", error);
      return { ran: false, reason: "enumeration failed" };
    }
    projects = (data ?? []) as ProjectRow[];
  } finally {
    await session.signOut();
  }

  const results: SweepProjectResult[] = [];
  for (const project of projects) {
    // Sequential on purpose: two model calls per mandate is plenty of
    // parallelism to deny ourselves — the cron has minutes, and a
    // burst of N simultaneous Anthropic calls is how a sweep turns
    // into a bill spike.
    const report = await runWeeklyReportAndPersist(project.id, {
      trigger: "scheduled",
    });
    const suggestions = await runHealthSuggestionsAndPersist(project.id, {
      trigger: "scheduled",
    });

    results.push({
      projectId: project.id,
      title: project.title,
      health:
        suggestions.status === "ready"
          ? suggestions.blob.health_status
          : suggestions.status === "healthy"
            ? "healthy"
            : "unknown",
      report:
        report.status === "ready"
          ? "written"
          : report.status === "agent_unavailable"
            ? "agent_unavailable"
            : "failed",
      suggestions:
        suggestions.status === "ready"
          ? { outcome: "generated", count: suggestions.blob.suggestions.length }
          : suggestions.status === "healthy"
            ? { outcome: "healthy_skipped" }
            : suggestions.status === "agent_unavailable"
              ? { outcome: "agent_unavailable" }
              : { outcome: "failed" },
    });
  }

  const outcome: SweepOutcome = { weekStarting, results };
  const digest = await deliver(outcome);
  return { ran: true, outcome, digest };
}

async function deliver(
  outcome: SweepOutcome
): Promise<"sent" | "send_failed" | "not-configured"> {
  const rendered = renderSweepDigest(outcome);
  const result = await sendEmail({
    to: [...FOUNDER_EMAILS],
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  });
  if (result.sent) return "sent";
  if (result.reason === "not-configured") return "not-configured";
  captureSeamError(
    `[sweep] digest send ${result.reason} for ${FOUNDER_EMAILS.length} recipients`
  );
  return "send_failed";
}

function mondayIso(now: Date): string {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
