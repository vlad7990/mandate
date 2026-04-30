// Pure formatters for the multi-candidate comparison dashboard. No
// "server-only" — both server and client rely on these. The Download
// Markdown / Download HTML / Draft Email actions all serialize from the
// same data shape so the artifacts stay consistent across surfaces.

import {
  type CandidateEvaluation,
  VERDICT_TIER_LABELS,
} from "@/lib/ai/candidate-evaluation";
import { type DimensionKey } from "@/lib/ai/onboarding-analysis";
import { TIER_BANDS, type Tier } from "@/lib/ranking/tiers";

const DIMENSION_LABEL: Record<DimensionKey, string> = {
  technical: "Technical",
  domain: "Domain",
  leadership: "Leadership",
  regulatory: "Regulatory",
  transformation: "Transformation",
};

export type ComparisonRow = {
  candidate_id: string;
  full_name: string;
  current_title: string | null;
  current_company: string | null;
  archetype: string | null;
  rank: number;
  overall: number;
  tier: Tier;
  technical: number;
  domain: number;
  leadership: number;
  regulatory: number;
  transformation: number;
  /** From cv_structured.evaluation when present. */
  evaluation: CandidateEvaluation | null;
  /** Lifted from cv_structured.summary for slate cards. */
  headline: string | null;
};

export type DimensionWeights = {
  technical: number;
  domain: number;
  leadership: number;
  regulatory: number;
  transformation: number;
};

export type MarketInsight = {
  total_parsed: number;
  total_scored: number;
  tier_counts: Record<Tier, number>;
  /** Top two dimensions by weight, used in the market reality sentence. */
  top_weighted: Array<{ dimension: DimensionKey; weight: number }>;
  /** Programmatic market reality statement built from scoring stats. */
  reality_statement: string;
  /** Programmatic final partner take aggregated from evaluations. */
  partner_take: string;
};

export type ComparisonContext = {
  project_title: string;
  company_name: string;
  generated_at: string;
};

// ────────────────────────────────────────────────────────────────────────
// Insight builders — deterministic, no AI calls
// ────────────────────────────────────────────────────────────────────────

export function buildMarketInsight(
  rows: ComparisonRow[],
  weights: DimensionWeights | null,
  totalParsed: number,
  context: ComparisonContext
): MarketInsight {
  const tier_counts: Record<Tier, number> = {
    tier_1: 0,
    tier_2: 0,
    tier_3: 0,
    tier_4: 0,
  };
  for (const r of rows) tier_counts[r.tier] += 1;

  const top_weighted = weightsToRanked(weights);

  const reality_statement = buildRealityStatement({
    rows,
    tier_counts,
    top_weighted,
    context,
    totalParsed,
  });

  const partner_take = buildPartnerTake({
    rows,
    tier_counts,
    top_weighted,
    context,
  });

  return {
    total_parsed: totalParsed,
    total_scored: rows.length,
    tier_counts,
    top_weighted,
    reality_statement,
    partner_take,
  };
}

function weightsToRanked(
  weights: DimensionWeights | null
): Array<{ dimension: DimensionKey; weight: number }> {
  if (!weights) return [];
  const entries: Array<{ dimension: DimensionKey; weight: number }> = (
    Object.entries(weights) as Array<[DimensionKey, number]>
  ).map(([dimension, weight]) => ({ dimension, weight }));
  return entries.sort((a, b) => b.weight - a.weight).slice(0, 2);
}

function buildRealityStatement({
  rows,
  tier_counts,
  top_weighted,
  context,
  totalParsed,
}: {
  rows: ComparisonRow[];
  tier_counts: Record<Tier, number>;
  top_weighted: Array<{ dimension: DimensionKey; weight: number }>;
  context: ComparisonContext;
  totalParsed: number;
}): string {
  const trueMatches = tier_counts.tier_1 + tier_counts.tier_2;
  const stretches = tier_counts.tier_3;
  const offProfile = tier_counts.tier_4;

  const dominantWeights =
    top_weighted.length >= 2
      ? `${DIMENSION_LABEL[top_weighted[0].dimension]} (${top_weighted[0].weight}/10) and ${DIMENSION_LABEL[top_weighted[1].dimension]} (${top_weighted[1].weight}/10)`
      : top_weighted.length === 1
        ? `${DIMENSION_LABEL[top_weighted[0].dimension]} (${top_weighted[0].weight}/10)`
        : "the calibrated dimensions";

  const archetypeMix = countArchetypes(rows);

  const supplyLine =
    trueMatches === 0
      ? `Of ${rows.length} scored profiles for ${context.project_title} at ${context.company_name}, none clear the Tier 1/2 bar — the live market for this mandate is undersupplied.`
      : trueMatches === 1
        ? `Only 1 of ${rows.length} scored profiles for ${context.project_title} at ${context.company_name} clears the Tier 1/2 bar — this is a thin market.`
        : `${trueMatches} of ${rows.length} scored profiles for ${context.project_title} at ${context.company_name} clear the Tier 1/2 bar — a workable but selective slate.`;

  const stretchLine =
    stretches > 0
      ? ` ${stretches} stretch profile${stretches === 1 ? "" : "s"} sit in Tier 3, viable only if the recruiter can credibly position the gaps.`
      : "";
  const offLine =
    offProfile > 0
      ? ` ${offProfile} candidate${offProfile === 1 ? " is" : "s are"} off profile and should not progress.`
      : "";

  const calibrationLine = ` Calibration weights this mandate hardest on ${dominantWeights}; the slate is filtered against that lens.`;

  const archetypeLine =
    archetypeMix.length > 0
      ? ` Archetype mix skews ${archetypeMix.map((a) => `${a.label} ×${a.count}`).join(", ")}.`
      : "";

  const parsedLine =
    totalParsed > rows.length
      ? ` ${totalParsed - rows.length} profile${totalParsed - rows.length === 1 ? " is" : "s are"} still parsing and not yet ranked.`
      : "";

  return (
    supplyLine + stretchLine + offLine + calibrationLine + archetypeLine + parsedLine
  );
}

function buildPartnerTake({
  rows,
  tier_counts,
  top_weighted,
  context,
}: {
  rows: ComparisonRow[];
  tier_counts: Record<Tier, number>;
  top_weighted: Array<{ dimension: DimensionKey; weight: number }>;
  context: ComparisonContext;
}): string {
  const top = rows.slice(0, 3);
  if (top.length === 0) {
    return `No ranked candidates for ${context.project_title}. Recommend widening the boolean and re-sourcing before any client conversation.`;
  }

  const headline = top[0];
  const headlineWeight = top_weighted[0]?.dimension;

  const leaderLine = `${headline.full_name} leads the field at ${headline.overall.toFixed(2)} overall (${TIER_BANDS[headline.tier].label.split(" · ")[0]})${
    headlineWeight
      ? `, anchored on ${DIMENSION_LABEL[headlineWeight].toLowerCase()} where they score ${headline[headlineWeight]}/10`
      : ""
  }.`;

  const slateLine =
    top.length >= 2
      ? ` ${top
          .slice(1)
          .map(
            (r) =>
              `${r.full_name} backs the slate at ${r.overall.toFixed(2)} (${TIER_BANDS[r.tier].label.split(" · ")[0]})`
          )
          .join("; ")}.`
      : "";

  const supplyTake =
    tier_counts.tier_1 >= 3
      ? " The market is genuinely deep — recommend running all three to interview and using competitive tension to compress the timeline."
      : tier_counts.tier_1 + tier_counts.tier_2 >= 3
        ? " The slate is workable. Recommend leading with the Tier 1 names and holding the Tier 2 backups in reserve in case the primary set declines."
        : tier_counts.tier_1 + tier_counts.tier_2 >= 1
          ? " The market is thin. Recommend pushing the Tier 1/2 candidate(s) into immediate conversation and flagging the supply constraint to the client."
          : " There is no Tier 1/2 supply against the current calibration. Recommend a calibration review with the hiring manager before continuing to source.";

  return leaderLine + slateLine + supplyTake;
}

function countArchetypes(
  rows: ComparisonRow[]
): Array<{ label: string; count: number }> {
  const map = new Map<string, number>();
  for (const r of rows) {
    if (!r.archetype) continue;
    map.set(r.archetype, (map.get(r.archetype) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

// ────────────────────────────────────────────────────────────────────────
// Markdown export
// ────────────────────────────────────────────────────────────────────────

export function comparisonToMarkdown({
  rows,
  weights,
  insight,
  context,
}: {
  rows: ComparisonRow[];
  weights: DimensionWeights | null;
  insight: MarketInsight;
  context: ComparisonContext;
}): string {
  const lines: string[] = [];

  lines.push(`# Comparative Market Report — ${context.project_title}`);
  lines.push("");
  lines.push(`**Company:** ${context.company_name}`);
  lines.push(`**Generated:** ${context.generated_at.slice(0, 10)}`);
  lines.push(
    `**Pool:** ${insight.total_scored} scored / ${insight.total_parsed} parsed`
  );
  lines.push("");
  lines.push("---");
  lines.push("");

  // Master scoring table
  lines.push("## 1. Master Scoring Table");
  lines.push("");
  const weightHeader = weights
    ? ` _(weights: T${weights.technical}/D${weights.domain}/L${weights.leadership}/R${weights.regulatory}/X${weights.transformation})_`
    : "";
  lines.push(`Ranked across all candidates evaluated.${weightHeader}`);
  lines.push("");
  lines.push(
    "| # | Candidate | Title | Tier | Overall | Tech | Domain | Lead | Regul | Xform |"
  );
  lines.push("| ---: | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |");
  for (const r of rows) {
    const titleCell = `${r.current_title ?? "—"}${r.current_company ? ` @ ${r.current_company}` : ""}`;
    lines.push(
      `| ${r.rank} | ${escapeCell(r.full_name)} | ${escapeCell(titleCell)} | ${TIER_BANDS[r.tier].label.split(" · ")[0]} | ${r.overall.toFixed(2)} | ${r.technical} | ${r.domain} | ${r.leadership} | ${r.regulatory} | ${r.transformation} |`
    );
  }
  lines.push("");

  // Tiered market view
  lines.push("## 2. Tiered Market View");
  lines.push("");
  for (const tier of ["tier_1", "tier_2", "tier_3", "tier_4"] as Tier[]) {
    const list = rows.filter((r) => r.tier === tier);
    if (list.length === 0) continue;
    lines.push(`### ${TIER_BANDS[tier].label} — ${list.length} candidate${list.length === 1 ? "" : "s"}`);
    lines.push("");
    for (const r of list) {
      lines.push(
        `- **${r.full_name}** · #${r.rank} · ${r.overall.toFixed(2)}/10${
          r.headline ? ` — ${r.headline}` : ""
        }`
      );
    }
    lines.push("");
  }

  // Slate recommendation
  const primary = rows.slice(0, Math.min(4, rows.length));
  const backup = rows.slice(primary.length, primary.length + 3);

  lines.push("## 3. Recommended Slate");
  lines.push("");
  lines.push(`### Primary slate — Top ${primary.length}`);
  lines.push("");
  primary.forEach((r, i) => {
    lines.push(
      `${i + 1}. **${r.full_name}** — ${TIER_BANDS[r.tier].label.split(" · ")[0]} · ${r.overall.toFixed(2)} · ${r.current_title ?? "—"}${r.current_company ? ` @ ${r.current_company}` : ""}`
    );
    if (r.evaluation?.final_verdict.narrative) {
      lines.push(`   > ${r.evaluation.final_verdict.narrative}`);
    }
  });
  lines.push("");

  if (backup.length > 0) {
    lines.push(`### Backup slate — Next ${backup.length}`);
    lines.push("");
    backup.forEach((r, i) => {
      lines.push(
        `${i + 1}. **${r.full_name}** — ${TIER_BANDS[r.tier].label.split(" · ")[0]} · ${r.overall.toFixed(2)} · ${r.current_title ?? "—"}${r.current_company ? ` @ ${r.current_company}` : ""}`
      );
    });
    lines.push("");
  }

  lines.push("### Market Reality");
  lines.push("");
  lines.push(insight.reality_statement);
  lines.push("");

  lines.push("### Final Partner Take");
  lines.push("");
  lines.push(insight.partner_take);
  lines.push("");

  // Per-candidate evaluation excerpts
  lines.push("## 4. Per-Candidate Verdicts");
  lines.push("");
  for (const r of rows.slice(0, primary.length + backup.length)) {
    lines.push(`### ${r.full_name} — Rank #${r.rank}`);
    lines.push("");
    lines.push(
      `Tier: **${TIER_BANDS[r.tier].label}** · Overall **${r.overall.toFixed(2)}/10**`
    );
    lines.push("");
    if (r.evaluation) {
      lines.push(
        `**Verdict:** ${VERDICT_TIER_LABELS[r.evaluation.final_verdict.tier]} — ${r.evaluation.final_verdict.narrative}`
      );
      lines.push("");
      lines.push(`**Positioning:** ${r.evaluation.positioning.opener}`);
      lines.push("");
      if (r.evaluation.gaps.length > 0) {
        lines.push("**Key gaps:**");
        for (const g of r.evaluation.gaps) {
          lines.push(`- ${g.headline} — ${g.role_mismatch}`);
        }
        lines.push("");
      }
    } else {
      lines.push("_Executive evaluation has not yet been generated for this candidate._");
      lines.push("");
    }
  }

  return lines.join("\n");
}

// ────────────────────────────────────────────────────────────────────────
// HTML export — print-ready single-file document
// ────────────────────────────────────────────────────────────────────────

export function comparisonToHtml({
  rows,
  weights,
  insight,
  context,
}: {
  rows: ComparisonRow[];
  weights: DimensionWeights | null;
  insight: MarketInsight;
  context: ComparisonContext;
}): string {
  const primary = rows.slice(0, Math.min(4, rows.length));
  const backup = rows.slice(primary.length, primary.length + 3);

  const tierColor: Record<Tier, string> = {
    tier_1: "#0d6e4e",
    tier_2: "#1d4ed8",
    tier_3: "#b45309",
    tier_4: "#9f1239",
  };

  const scoreColor = (v: number): string => {
    if (v >= 8) return "#0d6e4e";
    if (v >= 5) return "#b45309";
    return "#9f1239";
  };

  const styles = `
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body { font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #0f172a; background: #f8fafc; margin: 0; padding: 32px; line-height: 1.55; }
    .doc { max-width: 1100px; margin: 0 auto; background: #fff; padding: 40px; border: 1px solid #e2e8f0; }
    h1 { font-size: 28px; margin: 0 0 4px; letter-spacing: -0.01em; }
    h2 { font-size: 18px; margin: 32px 0 12px; text-transform: uppercase; letter-spacing: 0.08em; color: #475569; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; }
    h3 { font-size: 14px; margin: 20px 0 8px; text-transform: uppercase; letter-spacing: 0.08em; }
    .meta { font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.06em; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    thead th { background: #0f172a; color: #fff; padding: 8px 10px; text-align: left; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; font-size: 11px; }
    tbody td { padding: 8px 10px; border-bottom: 1px solid #e2e8f0; vertical-align: middle; }
    tbody tr:nth-child(even) td { background: #f8fafc; }
    .num { text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; }
    .tier-pill { display: inline-block; padding: 2px 8px; border-radius: 999px; color: #fff; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; }
    .score-cell { font-weight: 700; font-variant-numeric: tabular-nums; text-align: right; }
    .tier-section { margin: 16px 0 20px; }
    .tier-header { display: flex; align-items: center; gap: 12px; padding: 10px 14px; color: #fff; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; font-size: 12px; }
    .tier-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 10px; padding: 12px; background: #f1f5f9; }
    .tier-card { background: #fff; border: 1px solid #e2e8f0; padding: 12px; }
    .tier-card .name { font-weight: 700; font-size: 14px; }
    .tier-card .role { font-size: 12px; color: #64748b; margin-top: 2px; }
    .tier-card .meta-row { display: flex; justify-content: space-between; margin-top: 8px; font-size: 11px; color: #475569; text-transform: uppercase; letter-spacing: 0.06em; }
    .slate-card { border: 1px solid #e2e8f0; padding: 16px; margin-bottom: 10px; background: #fff; }
    .slate-card.primary { border-left: 4px solid #1d4ed8; }
    .slate-card.backup { border-left: 4px solid #94a3b8; }
    .slate-card .header { display: flex; justify-content: space-between; align-items: baseline; flex-wrap: wrap; gap: 8px; }
    .slate-card .rank { font-size: 24px; font-weight: 700; color: #0f172a; font-variant-numeric: tabular-nums; }
    .slate-card .verdict { margin-top: 8px; color: #334155; font-size: 13px; }
    .panel { background: #f1f5f9; padding: 16px; border-left: 4px solid #1d4ed8; margin-top: 12px; }
    .panel.partner { border-left-color: #0d6e4e; }
    .panel h3 { margin-top: 0; }
    @media print { body { background: #fff; padding: 0; } .doc { border: none; padding: 24px; } }
  `;

  const rowsHtml = rows
    .map(
      (r) => `
        <tr>
          <td class="num">${r.rank}</td>
          <td><strong>${esc(r.full_name)}</strong></td>
          <td>${esc(r.current_title ?? "—")}${r.current_company ? ` <span style="color:#64748b">@ ${esc(r.current_company)}</span>` : ""}</td>
          <td><span class="tier-pill" style="background:${tierColor[r.tier]}">${esc(TIER_BANDS[r.tier].label.split(" · ")[0])}</span></td>
          <td class="num" style="color:${scoreColor(r.overall)}">${r.overall.toFixed(2)}</td>
          <td class="score-cell" style="color:${scoreColor(r.technical)}">${r.technical}</td>
          <td class="score-cell" style="color:${scoreColor(r.domain)}">${r.domain}</td>
          <td class="score-cell" style="color:${scoreColor(r.leadership)}">${r.leadership}</td>
          <td class="score-cell" style="color:${scoreColor(r.regulatory)}">${r.regulatory}</td>
          <td class="score-cell" style="color:${scoreColor(r.transformation)}">${r.transformation}</td>
        </tr>
      `
    )
    .join("");

  const tierSections = (["tier_1", "tier_2", "tier_3", "tier_4"] as Tier[])
    .map((tier) => {
      const list = rows.filter((r) => r.tier === tier);
      if (list.length === 0) return "";
      const cards = list
        .map(
          (r) => `
            <div class="tier-card">
              <div class="name">${esc(r.full_name)}</div>
              <div class="role">${esc(r.current_title ?? "—")}${r.current_company ? ` @ ${esc(r.current_company)}` : ""}</div>
              ${r.headline ? `<div style="margin-top:8px;font-size:12px;color:#475569">${esc(r.headline)}</div>` : ""}
              <div class="meta-row">
                <span>Rank #${r.rank}</span>
                <span style="color:${scoreColor(r.overall)};font-weight:700">${r.overall.toFixed(2)}/10</span>
              </div>
            </div>
          `
        )
        .join("");
      return `
        <section class="tier-section">
          <div class="tier-header" style="background:${tierColor[tier]}">
            <span>${esc(TIER_BANDS[tier].label)}</span>
            <span style="opacity:0.85">· ${list.length} candidate${list.length === 1 ? "" : "s"}</span>
          </div>
          <div class="tier-cards">${cards}</div>
        </section>
      `;
    })
    .join("");

  const slateHtml = (group: ComparisonRow[], variant: "primary" | "backup") =>
    group
      .map(
        (r, i) => `
          <article class="slate-card ${variant}">
            <div class="header">
              <div>
                <div class="rank">#${i + 1}</div>
                <div style="font-size:18px;font-weight:700;margin-top:2px">${esc(r.full_name)}</div>
                <div style="font-size:12px;color:#64748b">${esc(r.current_title ?? "—")}${r.current_company ? ` @ ${esc(r.current_company)}` : ""}</div>
              </div>
              <div style="text-align:right">
                <span class="tier-pill" style="background:${tierColor[r.tier]}">${esc(TIER_BANDS[r.tier].label.split(" · ")[0])}</span>
                <div style="font-size:22px;font-weight:700;margin-top:6px;color:${scoreColor(r.overall)}">${r.overall.toFixed(2)}</div>
              </div>
            </div>
            ${
              r.evaluation
                ? `<div class="verdict">${esc(r.evaluation.final_verdict.narrative)}</div>`
                : ""
            }
          </article>
        `
      )
      .join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Comparative Market Report — ${esc(context.project_title)}</title>
<style>${styles}</style>
</head>
<body>
<main class="doc">
  <header>
    <div class="meta">Comparative Market Report</div>
    <h1>${esc(context.project_title)}</h1>
    <div class="meta">${esc(context.company_name)} · Generated ${esc(context.generated_at.slice(0, 10))} · ${insight.total_scored} scored / ${insight.total_parsed} parsed</div>
  </header>

  <h2>Master Scoring Table</h2>
  ${
    weights
      ? `<div class="meta" style="margin-bottom:8px">Weights — Technical ${weights.technical} · Domain ${weights.domain} · Leadership ${weights.leadership} · Regulatory ${weights.regulatory} · Transformation ${weights.transformation}</div>`
      : ""
  }
  <table>
    <thead>
      <tr>
        <th>#</th><th>Candidate</th><th>Title</th><th>Tier</th>
        <th style="text-align:right">Overall</th>
        <th style="text-align:right">Tech</th><th style="text-align:right">Domain</th><th style="text-align:right">Lead</th><th style="text-align:right">Regul</th><th style="text-align:right">Xform</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>

  <h2>Tiered Market View</h2>
  ${tierSections}

  <h2>Recommended Slate</h2>
  <h3>Primary Slate — Top ${primary.length}</h3>
  ${slateHtml(primary, "primary")}
  ${backup.length > 0 ? `<h3>Backup Slate — Next ${backup.length}</h3>${slateHtml(backup, "backup")}` : ""}

  <div class="panel">
    <h3>Market Reality</h3>
    <p>${esc(insight.reality_statement)}</p>
  </div>
  <div class="panel partner">
    <h3>Final Partner Take</h3>
    <p>${esc(insight.partner_take)}</p>
  </div>
</main>
</body>
</html>`;
}

// ────────────────────────────────────────────────────────────────────────
// Email draft
// ────────────────────────────────────────────────────────────────────────

export function comparisonToEmail({
  rows,
  insight,
  context,
}: {
  rows: ComparisonRow[];
  insight: MarketInsight;
  context: ComparisonContext;
}): { subject: string; body: string } {
  const subject = `${context.project_title} — comparative slate (${insight.total_scored} scored, ${insight.tier_counts.tier_1 + insight.tier_counts.tier_2} viable)`;

  const primary = rows.slice(0, Math.min(4, rows.length));
  const backup = rows.slice(primary.length, primary.length + 3);

  const lines: string[] = [];
  lines.push(insight.reality_statement);
  lines.push("");
  lines.push(`Primary slate (top ${primary.length}):`);
  primary.forEach((r, i) => {
    lines.push(
      `  ${i + 1}. ${r.full_name} — ${TIER_BANDS[r.tier].label.split(" · ")[0]} · ${r.overall.toFixed(2)}/10 · ${r.current_title ?? "—"}${r.current_company ? ` @ ${r.current_company}` : ""}`
    );
    if (r.evaluation?.final_verdict.narrative) {
      lines.push(`       ${r.evaluation.final_verdict.narrative}`);
    }
  });
  lines.push("");

  if (backup.length > 0) {
    lines.push(`Backup slate:`);
    backup.forEach((r, i) => {
      lines.push(
        `  ${i + 1}. ${r.full_name} — ${TIER_BANDS[r.tier].label.split(" · ")[0]} · ${r.overall.toFixed(2)}/10 · ${r.current_title ?? "—"}${r.current_company ? ` @ ${r.current_company}` : ""}`
      );
    });
    lines.push("");
  }

  lines.push(`Final partner take: ${insight.partner_take}`);
  lines.push("");
  lines.push(
    `Detailed dossiers per candidate available on request — full markdown / HTML report attached separately.`
  );

  return { subject, body: lines.join("\n") };
}

function escapeCell(v: string): string {
  return v.replace(/\|/g, "\\|").replace(/\n+/g, " ");
}

function esc(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
