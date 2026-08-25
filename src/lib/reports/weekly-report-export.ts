// Pure formatters for the weekly progress report. No "use server" /
// "server-only" so both server and client can import. Used by the
// download buttons (markdown) and the email-draft modal.

import type { WeeklyReport } from "@/lib/ai/weekly-report-agent";

export type WeeklyReportContext = {
  project_title: string;
  company_name: string;
  generated_at: string;
};

export function weeklyReportToMarkdown(
  report: WeeklyReport,
  ctx: WeeklyReportContext
): string {
  const lines: string[] = [];

  lines.push(`# Weekly Progress Report — ${ctx.project_title}`);
  lines.push("");
  lines.push(`**Company:** ${ctx.company_name}`);
  lines.push(`**Week of:** ${report.week_starting}`);
  lines.push(`**Generated:** ${ctx.generated_at.slice(0, 10)}`);
  lines.push("");
  lines.push("---");
  lines.push("");

  lines.push("## Executive Summary");
  lines.push("");
  lines.push(report.executive_summary);
  lines.push("");

  lines.push("## Top Candidates");
  lines.push("");
  if (report.top_candidates.length === 0) {
    lines.push("_No ranked candidates yet._");
  } else {
    report.top_candidates.forEach((c, i) => {
      lines.push(`${i + 1}. **${c.name}** — ${c.one_liner}`);
    });
  }
  lines.push("");

  lines.push("## Sourced This Week");
  lines.push("");
  lines.push(`**Count:** ${report.candidates_sourced_count}`);
  if (report.candidates_sourced_names.length > 0) {
    lines.push("");
    for (const n of report.candidates_sourced_names) {
      lines.push(`- ${n}`);
    }
  }
  lines.push("");

  lines.push("## Pipeline Movement");
  lines.push("");
  if (report.pipeline_moves.length === 0) {
    lines.push("_No stage changes this week._");
  } else {
    for (const m of report.pipeline_moves) {
      lines.push(`- **${m.name}** · ${m.from_stage} → ${m.to_stage}`);
    }
  }
  lines.push("");

  lines.push("## Ranking Changes");
  lines.push("");
  if (report.rank_moves.length === 0) {
    lines.push("_No ranking shifts this week._");
  } else {
    for (const r of report.rank_moves) {
      const arrow = r.direction === "up" ? "▲" : "▼";
      lines.push(`- ${arrow} **${r.name}** · ${r.delta} positions`);
    }
  }
  lines.push("");

  lines.push("## Feedback Insights");
  lines.push("");
  if (report.feedback_insights.length === 0) {
    lines.push("_No new feedback this week._");
  } else {
    for (const f of report.feedback_insights) {
      lines.push(`- **${f.topic}** — ${f.detail}`);
    }
  }
  lines.push("");

  lines.push("## Next Steps");
  lines.push("");
  for (const step of report.next_steps) {
    lines.push(`- ${step}`);
  }
  lines.push("");

  lines.push("## Market Commentary");
  lines.push("");
  lines.push(report.market_commentary);
  lines.push("");

  return lines.join("\n");
}

export function weeklyReportToEmail(
  report: WeeklyReport,
  ctx: WeeklyReportContext
): { subject: string; body: string } {
  const subject = `${ctx.project_title} — weekly update · ${report.week_starting}`;
  const lines: string[] = [];
  lines.push(report.executive_summary);
  lines.push("");
  if (report.top_candidates.length > 0) {
    lines.push("Top of the slate this week:");
    report.top_candidates.forEach((c, i) => {
      lines.push(`  ${i + 1}. ${c.name} — ${c.one_liner}`);
    });
    lines.push("");
  }
  if (report.candidates_sourced_count > 0) {
    lines.push(
      `Sourcing: ${report.candidates_sourced_count} new candidates added this week.`
    );
    lines.push("");
  }
  if (report.feedback_insights.length > 0) {
    lines.push("From the feedback we've received:");
    for (const f of report.feedback_insights) {
      lines.push(`  • ${f.topic} — ${f.detail}`);
    }
    lines.push("");
  }
  lines.push("Next steps:");
  for (const step of report.next_steps) {
    lines.push(`  - ${step}`);
  }
  lines.push("");
  lines.push(`Market context: ${report.market_commentary}`);
  return { subject, body: lines.join("\n") };
}
