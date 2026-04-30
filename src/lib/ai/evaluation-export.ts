// Pure formatters for the evaluation report. No "server-only" — both
// server and client use these. The Download Report button serializes to
// markdown; the Draft Client Email button serializes to a plain-text
// email body. Keeping these pure means the formatter can be unit-tested
// and reused by future export targets (PDF generator, etc.).

import {
  ALIGNMENT_LIGHT_LABELS,
  RECOMMENDATION_LABELS,
  VERDICT_TIER_LABELS,
  type CandidateEvaluation,
} from "./candidate-evaluation";
import { type DimensionKey } from "./onboarding-analysis";

const DIMENSION_LABEL: Record<DimensionKey, string> = {
  technical: "Technical",
  domain: "Domain",
  leadership: "Leadership",
  regulatory: "Regulatory",
  transformation: "Transformation",
};

export type ExportContext = {
  candidate_name: string;
  candidate_title: string | null;
  candidate_company: string | null;
};

/**
 * Serialize the evaluation as a markdown document. Headings, tables,
 * lists — everything a recruiter would want when they paste the file
 * into Notion or attach it to an email. Avoids HTML so the file works
 * everywhere (Slack, GitHub, plain editors).
 */
export function evaluationToMarkdown(
  evaluation: CandidateEvaluation,
  ctx: ExportContext
): string {
  const lines: string[] = [];

  lines.push(`# Executive Evaluation Report — ${ctx.candidate_name}`);
  lines.push("");
  lines.push(
    `**Role:** ${evaluation.role_title} — ${evaluation.company_name}`
  );
  if (ctx.candidate_title || ctx.candidate_company) {
    lines.push(
      `**Currently:** ${[ctx.candidate_title, ctx.candidate_company]
        .filter(Boolean)
        .join(" @ ")}`
    );
  }
  lines.push(`**Drafted:** ${evaluation.generated_at.slice(0, 10)}`);
  lines.push("");
  lines.push("---");
  lines.push("");

  // 1. Scoring table
  lines.push("## 1. Scoring Table");
  lines.push("");
  lines.push("| Dimension | Score | Weight | Commentary |");
  lines.push("| --- | ---: | ---: | --- |");
  for (const row of evaluation.scoring_table) {
    lines.push(
      `| ${DIMENSION_LABEL[row.dimension]} | ${row.score}/10 | ${row.weight}/10 | ${escapeTableCell(row.commentary)} |`
    );
  }
  lines.push("");

  // 2. Profile summary
  lines.push("## 2. Profile Summary");
  lines.push("");
  lines.push(evaluation.profile_summary.executive_summary);
  lines.push("");
  lines.push("**Background**");
  lines.push("");
  for (const b of evaluation.profile_summary.background_bullets) {
    lines.push(`- ${b}`);
  }
  lines.push("");

  // 3. Alignment test
  lines.push("## 3. Critical Role Alignment Test");
  lines.push("");
  lines.push(`**Question:** ${evaluation.alignment_test.question}`);
  lines.push("");
  lines.push(`**Answer:** ${evaluation.alignment_test.answer}`);
  lines.push("");
  lines.push(
    `**RAG:** ${ALIGNMENT_LIGHT_LABELS[evaluation.alignment_test.light]} — ${evaluation.alignment_test.justification}`
  );
  lines.push("");

  // 4. Strengths
  lines.push("## 4. Strengths");
  lines.push("");
  evaluation.strengths.forEach((s, i) => {
    lines.push(`### ${String(i + 1).padStart(2, "0")} — ${s.headline}`);
    lines.push("");
    lines.push(s.detail);
    lines.push("");
    lines.push(`> Signal: ${s.signal}`);
    lines.push("");
  });

  // 5. Gaps
  lines.push("## 5. Critical Gaps");
  lines.push("");
  evaluation.gaps.forEach((g, i) => {
    lines.push(`### ${String(i + 1).padStart(2, "0")} — ${g.headline}`);
    lines.push("");
    lines.push(g.detail);
    lines.push("");
    lines.push(`> Role mismatch: ${g.role_mismatch}`);
    lines.push("");
  });

  // 6. Comparison
  lines.push("## 6. Direct Comparison");
  lines.push("");
  lines.push(evaluation.comparison.positioning);
  lines.push("");
  if (evaluation.comparison.competitors.length > 0) {
    lines.push("| Candidate | Tier | Direction | Trade-off |");
    lines.push("| --- | --- | --- | --- |");
    for (const c of evaluation.comparison.competitors) {
      lines.push(
        `| ${c.full_name} | ${c.tier_label} | ${c.direction} | ${escapeTableCell(c.vs_summary)} |`
      );
    }
    lines.push("");
  }

  // 7. Final verdict
  lines.push("## 7. Final Verdict");
  lines.push("");
  lines.push(`**Tier:** ${VERDICT_TIER_LABELS[evaluation.final_verdict.tier]}`);
  lines.push("");
  lines.push(evaluation.final_verdict.narrative);
  lines.push("");

  // 8. How to position
  lines.push("## 8. How to Position");
  lines.push("");
  lines.push(`**Opener:** ${evaluation.positioning.opener}`);
  lines.push("");
  lines.push("**Talking points**");
  evaluation.positioning.talking_points.forEach((tp, i) => {
    lines.push(`${i + 1}. ${tp}`);
  });
  lines.push("");
  lines.push(`**If client objects:** ${evaluation.positioning.objection_handling}`);
  lines.push("");

  // 9. Recommendation
  lines.push("## 9. Recommendation");
  lines.push("");
  lines.push(
    `**${RECOMMENDATION_LABELS[evaluation.recommendation]}** — ${evaluation.recommendation_rationale}`
  );
  lines.push("");

  return lines.join("\n");
}

/**
 * Serialize the evaluation as a plain-text client email draft. The
 * recruiter copies this, pastes it into Outlook/Gmail, edits the
 * salutation, and sends. We deliberately omit a greeting line so it
 * never feels like a robotic mail-merge.
 */
export function evaluationToEmailDraft(
  evaluation: CandidateEvaluation,
  ctx: ExportContext
): { subject: string; body: string } {
  const subject = `Candidate evaluation — ${ctx.candidate_name} for ${evaluation.role_title}`;

  const lines: string[] = [];

  lines.push(evaluation.positioning.opener);
  lines.push("");
  lines.push(`Quick context on ${ctx.candidate_name}:`);
  for (const b of evaluation.profile_summary.background_bullets) {
    lines.push(`  • ${b}`);
  }
  lines.push("");

  lines.push("Why this candidate is worth a conversation:");
  evaluation.positioning.talking_points.forEach((tp, i) => {
    lines.push(`  ${i + 1}. ${tp}`);
  });
  lines.push("");

  lines.push(
    `Alignment test — "${evaluation.alignment_test.question}"`
  );
  lines.push(
    `${ALIGNMENT_LIGHT_LABELS[evaluation.alignment_test.light]}: ${evaluation.alignment_test.answer}`
  );
  lines.push("");

  if (evaluation.gaps.length > 0) {
    lines.push("Where I'd want to dig in further:");
    for (const g of evaluation.gaps) {
      lines.push(`  • ${g.headline} — ${g.role_mismatch}`);
    }
    lines.push("");
  }

  lines.push(`If you push back: ${evaluation.positioning.objection_handling}`);
  lines.push("");

  lines.push(
    `My read: ${VERDICT_TIER_LABELS[evaluation.final_verdict.tier]}. ${evaluation.final_verdict.narrative}`
  );
  lines.push("");

  lines.push(
    `Recommendation: ${RECOMMENDATION_LABELS[evaluation.recommendation]} — ${evaluation.recommendation_rationale}`
  );

  return { subject, body: lines.join("\n") };
}

function escapeTableCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n+/g, " ");
}
