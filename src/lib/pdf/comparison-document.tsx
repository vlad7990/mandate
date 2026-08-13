import { Document, Page, Text, View } from "@react-pdf/renderer";
import { TIER_BANDS, type Tier } from "@/lib/ranking/tiers";
import type {
  ComparisonContext,
  ComparisonRow,
  DimensionWeights,
  MarketInsight,
} from "@/lib/comparison/comparison-export";
import {
  blindSpots,
  type ComparisonGrid,
  type CoverageState,
} from "@/lib/comparison/evidence-index";
import type { DimensionKey } from "@/lib/ai/onboarding-analysis";
import {
  PDF_CALLOUT_MIN_PRESENCE,
  PDF_COLORS,
  PDF_CONTENT_WIDTH,
  PDF_STYLES,
  scoreColor,
  tierColor,
} from "./styles";

/**
 * Master scoring table column widths, in points.
 *
 * Each score column has to be wide enough for its own heading, not just for
 * a single digit — the headings are the widest thing in these columns. See
 * `thNum` in styles.ts for the tracking that makes these fit.
 */
const SCORE_COL = 34;
const RANK_COL = 22;
const TIER_COL = 64;
const OVERALL_COL = 42;

/** Evidence grid: the dimension label column. Fits "Transformation (w4)". */
const DIMENSION_COL = 84;

/**
 * What the master table's fixed columns consume, leaving the rest to the
 * candidate name. Exported so a test can assert the table still fits the
 * page: react-pdf does not complain when columns overrun, it just prints
 * the last one off the right margin.
 */
export const MASTER_TABLE_FIXED_WIDTH =
  RANK_COL + TIER_COL + OVERALL_COL + SCORE_COL * 5;

/**
 * The evidence grid grows a column per candidate, so its type has to shrink
 * as the slate grows or the names overprint each other. Thresholds are in
 * points of available column width, measured rather than guessed.
 *
 * The comparison page builds this grid from the primary slate only — at most
 * four candidates today — so in practice only the first tier is reached. The
 * narrower tiers are here because nothing in the type stops a caller passing
 * the full pool, and the failure mode when it does is silent overprinting
 * rather than an error.
 *
 * Past roughly nine columns even the stacked layout runs out of room. A slate
 * that wide wants a landscape page, which the document does not do today.
 */
export function gridDensity(candidateCount: number) {
  const colWidth =
    (PDF_CONTENT_WIDTH - DIMENSION_COL) / Math.max(candidateCount, 1);
  if (colWidth >= 90)
    return { name: 8, cell: 9, pad: 6, tracking: 0.5, stack: false };
  // Below this a double-barrelled surname is wider than its column, so the
  // name has to be laid out a token per line rather than wrapped.
  if (colWidth >= 64)
    return { name: 7.5, cell: 8.5, pad: 5, tracking: 0.25, stack: true };
  return { name: 7, cell: 8, pad: 4, tracking: 0, stack: true };
}

type GridDensity = ReturnType<typeof gridDensity>;

/**
 * A candidate's name as an evidence-grid column heading.
 *
 * Once the columns are narrow, a surname can be wider than its column, and
 * react-pdf overflows rather than clips — the name overprints the next
 * candidate's. Below that width the name is laid out a word per line, with
 * double-barrelled surnames split at the hyphen they already contain, so
 * every line is a token that fits.
 */
function HeaderName({
  name,
  density,
}: {
  name: string;
  density: GridDensity;
}) {
  const style = {
    fontSize: density.name,
    fontFamily: "Helvetica-Bold",
    color: "#ffffff",
    letterSpacing: density.tracking,
    // Overrides `th`, which uppercases. Capitals cost roughly a sixth of the
    // width for no gain here — a name is not a label — and at eight columns
    // that sixth is the difference between fitting and overprinting.
    textTransform: "none",
  } as const;

  if (!density.stack) {
    return <Text style={style}>{name}</Text>;
  }

  // "Alexander Mwangi-Fitzgerald" → ["Alexander", "Mwangi-", "Fitzgerald"]
  const lines = name
    .trim()
    .split(/\s+/)
    .flatMap((word) => (word.includes("-") ? word.split(/(?<=-)/) : [word]));

  return (
    <View>
      {lines.map((line, i) => (
        <Text key={i} style={style}>
          {line}
        </Text>
      ))}
    </View>
  );
}

const DIMENSION_LABEL: Record<DimensionKey, string> = {
  technical: "Technical",
  domain: "Domain",
  leadership: "Leadership",
  regulatory: "Regulatory",
  transformation: "Transformation",
};

const STATE_TEXT: Record<CoverageState, string> = {
  evidenced: "Evidenced",
  thin: "Their account",
  conflicted: "Disagree",
  absent: "Not assessed",
};

const STATE_COLOR: Record<CoverageState, string> = {
  evidenced: PDF_COLORS.good,
  thin: PDF_COLORS.warn,
  conflicted: PDF_COLORS.bad,
  absent: PDF_COLORS.textDim,
};

const TIER_ORDER: Tier[] = ["tier_1", "tier_2", "tier_3", "tier_4"];

export function ComparisonPdfDocument({
  rows,
  weights,
  insight,
  context,
  grid,
}: {
  rows: ComparisonRow[];
  weights: DimensionWeights | null;
  insight: MarketInsight;
  context: ComparisonContext;
  grid?: ComparisonGrid | null;
}) {
  const primary = rows.slice(0, Math.min(4, rows.length));
  const backup = rows.slice(primary.length, primary.length + 3);
  const viable = insight.tier_counts.tier_1 + insight.tier_counts.tier_2;

  return (
    <Document
      title={`Mandate · Comparative Market Report · ${context.project_title}`}
      author="Mandate"
      subject={`${context.project_title} — ${context.company_name}`}
    >
      <Page size="A4" style={PDF_STYLES.page} wrap>
        <View style={PDF_STYLES.brandBar} fixed>
          <View>
            <Text style={PDF_STYLES.brandMark}>MANDATE</Text>
            <Text style={PDF_STYLES.brandKicker}>
              COMPARATIVE MARKET REPORT
            </Text>
          </View>
          <Text style={PDF_STYLES.brandMeta}>
            {context.generated_at.slice(0, 10)}
          </Text>
        </View>

        <View style={PDF_STYLES.subhead}>
          <Text style={PDF_STYLES.subheadTitle}>{context.project_title}</Text>
          <Text style={PDF_STYLES.subheadMeta}>
            {context.company_name} · {insight.total_scored} scored ·{" "}
            {viable} viable · {insight.tier_counts.tier_3} stretch ·{" "}
            {insight.tier_counts.tier_4} off
          </Text>
        </View>

        <View style={PDF_STYLES.body}>
          {/* Evidence before scores. A PDF sent to a hiring manager is read as
              a recommendation, and a reader who takes in the ranking first
              rarely goes back for what was never assessed. */}
          <EvidenceSection grid={grid ?? null} />

          {/* Master scoring table */}
          <SectionHeader
            label="02 · Master Scoring Table"
            meta={
              weights
                ? `Weights T${weights.technical}/D${weights.domain}/L${weights.leadership}/R${weights.regulatory}/X${weights.transformation}`
                : undefined
            }
          />
          <View style={PDF_STYLES.table}>
            <View style={PDF_STYLES.thead} fixed>
              <Text style={[PDF_STYLES.th, { width: RANK_COL }]}>#</Text>
              <Text style={[PDF_STYLES.th, { flex: 1 }]}>Candidate</Text>
              <Text style={[PDF_STYLES.th, { width: TIER_COL }]}>Tier</Text>
              <Text style={[PDF_STYLES.thNum, { width: OVERALL_COL }]}>
                Overall
              </Text>
              <Text style={[PDF_STYLES.thNum, { width: SCORE_COL }]}>Tech</Text>
              <Text style={[PDF_STYLES.thNum, { width: SCORE_COL }]}>Dom</Text>
              <Text style={[PDF_STYLES.thNum, { width: SCORE_COL }]}>Lead</Text>
              <Text style={[PDF_STYLES.thNum, { width: SCORE_COL }]}>Reg</Text>
              <Text style={[PDF_STYLES.thNum, { width: SCORE_COL }]}>
                Xform
              </Text>
            </View>
            {/* wrap={false}: a split row put a candidate's name on one page and
                their title and tier on the next, under the fixed brand bar. */}
            {rows.map((r) => (
              <View key={r.candidate_id} style={PDF_STYLES.tbodyRow} wrap={false}>
                <Text
                  style={[
                    PDF_STYLES.td,
                    PDF_STYLES.tdNum,
                    { width: RANK_COL, color: PDF_COLORS.textMuted },
                  ]}
                >
                  {r.rank}
                </Text>
                <View style={[PDF_STYLES.td, { flex: 1 }]}>
                  <Text style={{ fontSize: 9, fontFamily: "Helvetica-Bold" }}>
                    {r.full_name}
                  </Text>
                  <Text
                    style={{
                      fontSize: 8,
                      color: PDF_COLORS.textMuted,
                      marginTop: 1,
                    }}
                  >
                    {r.current_title ?? "—"}
                    {r.current_company ? ` · ${r.current_company}` : ""}
                  </Text>
                </View>
                <View style={[PDF_STYLES.td, { width: TIER_COL }]}>
                  <Text
                    style={{
                      ...PDF_STYLES.pill,
                      backgroundColor: tierColor(r.tier),
                    }}
                  >
                    {TIER_BANDS[r.tier].label.split(" · ")[0]}
                  </Text>
                </View>
                <Text
                  style={[
                    PDF_STYLES.td,
                    PDF_STYLES.tdNum,
                    { width: OVERALL_COL, color: scoreColor(r.overall) },
                  ]}
                >
                  {r.overall.toFixed(2)}
                </Text>
                <ScoreCell value={r.technical} />
                <ScoreCell value={r.domain} />
                <ScoreCell value={r.leadership} />
                <ScoreCell value={r.regulatory} />
                <ScoreCell value={r.transformation} />
              </View>
            ))}
          </View>

          {/* Tiered market view */}
          <SectionHeader label="03 · Tiered Market View" />
          {TIER_ORDER.map((tier) => {
            const list = rows.filter((r) => r.tier === tier);
            if (list.length === 0) return null;
            return (
              <View key={tier} wrap={false} style={{ marginBottom: 8 }}>
                <View
                  style={{
                    backgroundColor: tierColor(tier),
                    paddingHorizontal: 8,
                    paddingVertical: 5,
                    flexDirection: "row",
                    justifyContent: "space-between",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 9,
                      fontFamily: "Helvetica-Bold",
                      color: "#ffffff",
                      letterSpacing: 1,
                      textTransform: "uppercase",
                    }}
                  >
                    {TIER_BANDS[tier].label}
                  </Text>
                  <Text
                    style={{
                      fontSize: 8,
                      color: "#ffffff",
                      letterSpacing: 1,
                    }}
                  >
                    {list.length} candidate{list.length === 1 ? "" : "s"}
                  </Text>
                </View>
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: PDF_COLORS.outlineSoft,
                    borderTopWidth: 0,
                  }}
                >
                  {list.map((r, i) => (
                    <View
                      key={r.candidate_id}
                      style={{
                        flexDirection: "row",
                        paddingHorizontal: 8,
                        paddingVertical: 5,
                        backgroundColor:
                          i % 2 === 0 ? PDF_COLORS.paper : PDF_COLORS.paperAlt,
                      }}
                    >
                      <Text
                        style={{
                          width: 30,
                          fontSize: 9,
                          fontFamily: "Helvetica-Bold",
                          color: PDF_COLORS.textMuted,
                        }}
                      >
                        #{r.rank}
                      </Text>
                      <View style={{ flex: 3 }}>
                        <Text
                          style={{
                            fontSize: 9,
                            fontFamily: "Helvetica-Bold",
                          }}
                        >
                          {r.full_name}
                        </Text>
                        <Text
                          style={{
                            fontSize: 8,
                            color: PDF_COLORS.textMuted,
                            marginTop: 1,
                          }}
                        >
                          {r.current_title ?? "—"}
                          {r.current_company ? ` · ${r.current_company}` : ""}
                        </Text>
                      </View>
                      <Text
                        style={{
                          width: 50,
                          fontSize: 10,
                          fontFamily: "Helvetica-Bold",
                          color: scoreColor(r.overall),
                          textAlign: "right",
                        }}
                      >
                        {r.overall.toFixed(2)}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            );
          })}

          {/* Slate */}
          <SectionHeader
            label="04 · Recommended Slate"
            meta={`Primary ${primary.length} · Backup ${backup.length}`}
          />
          <SlateBlock title={`Primary slate — Top ${primary.length}`} rows={primary} accent={PDF_COLORS.accent} />
          {backup.length > 0 && (
            <SlateBlock
              title={`Backup slate — Next ${backup.length}`}
              rows={backup}
              accent={PDF_COLORS.textMuted}
            />
          )}

          {/* Market reality + partner take */}
          <View style={PDF_STYLES.callout} minPresenceAhead={PDF_CALLOUT_MIN_PRESENCE}>
            <Text style={PDF_STYLES.calloutLabel}>Market Reality</Text>
            <Text style={PDF_STYLES.p}>{insight.reality_statement}</Text>
          </View>
          <View
            style={[PDF_STYLES.callout, { borderLeftColor: PDF_COLORS.good }]}
            minPresenceAhead={PDF_CALLOUT_MIN_PRESENCE}
          >
            <Text
              style={[PDF_STYLES.calloutLabel, { color: PDF_COLORS.good }]}
            >
              Final Partner Take
            </Text>
            <Text style={PDF_STYLES.p}>{insight.partner_take}</Text>
          </View>
        </View>

        <View style={PDF_STYLES.footer} fixed>
          <Text>
            Mandate · {context.project_title} · {context.company_name}
          </Text>
          <Text
            render={({ pageNumber, totalPages }) =>
              `Page ${pageNumber} of ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}

/**
 * Evidence coverage, per dimension, per candidate.
 *
 * Renders nothing when there is no grid — an empty section in an exported
 * document reads as "nothing was found", which is a different and wrong claim
 * from "this export predates the evidence index".
 */
function EvidenceSection({ grid }: { grid: ComparisonGrid | null }) {
  if (!grid || grid.candidates.length === 0) return null;
  const spots = blindSpots(grid);
  const density = gridDensity(grid.candidates.length);

  return (
    <View>
      <SectionHeader
        label="01 · Evidence & Gaps"
        meta="A blank is a gap in the search, not a low score"
      />

      {spots.length > 0 && (
        <Text
          style={[
            PDF_STYLES.pMuted,
            { color: PDF_COLORS.warn, marginBottom: 6 },
          ]}
        >
          Nobody has been assessed on{" "}
          {spots.map((s) => DIMENSION_LABEL[s].toLowerCase()).join(", ")}. Every
          candidate looks equally unproven there because none was tested on it.
        </Text>
      )}

      {/* wrap={false}: always five rows, one per dimension. */}
      <View style={PDF_STYLES.table} wrap={false}>
        <View style={PDF_STYLES.thead}>
          <Text style={[PDF_STYLES.th, { width: DIMENSION_COL }]}>
            Dimension
          </Text>
          {grid.candidates.map((c) => (
            <View
              key={c.candidate_id}
              style={[
                PDF_STYLES.th,
                { flex: 1, paddingHorizontal: density.pad },
              ]}
            >
              {/* Not uppercased: capitals cost roughly a sixth of the width
                  for no gain here — a name is not a label. */}
              <HeaderName name={c.full_name} density={density} />
            </View>
          ))}
        </View>
        {grid.rows.map((row) => (
          <View key={row.dimension} style={PDF_STYLES.tbodyRow} wrap={false}>
            <Text style={[PDF_STYLES.td, { width: DIMENSION_COL }]}>
              {DIMENSION_LABEL[row.dimension]}
              {row.weight === null ? "" : ` (w${row.weight})`}
            </Text>
            {row.cells.map((cell) => (
              <Text
                key={cell.candidate_id}
                style={[
                  PDF_STYLES.td,
                  {
                    flex: 1,
                    fontSize: density.cell,
                    paddingHorizontal: density.pad,
                    color: STATE_COLOR[cell.coverage.state],
                  },
                ]}
              >
                {STATE_TEXT[cell.coverage.state]}
              </Text>
            ))}
          </View>
        ))}
      </View>

      {grid.candidates
        .filter((c) => c.critical_gaps.length > 0)
        .map((c) => (
          <Text key={c.candidate_id} style={PDF_STYLES.pMuted}>
            {c.full_name} — still unknown on{" "}
            {c.critical_gaps.map((g) => DIMENSION_LABEL[g].toLowerCase()).join(", ")}
            , which this role weights heavily.
          </Text>
        ))}
    </View>
  );
}

function SectionHeader({ label, meta }: { label: string; meta?: string }) {
  return (
    <View style={PDF_STYLES.sectionHeader}>
      <Text style={PDF_STYLES.sectionLabel}>{label}</Text>
      {meta && <Text style={PDF_STYLES.sectionMeta}>{meta}</Text>}
    </View>
  );
}

function SlateBlock({
  title,
  rows,
  accent,
}: {
  title: string;
  rows: ComparisonRow[];
  accent: string;
}) {
  return (
    <View style={{ marginBottom: 8 }}>
      <Text
        style={{
          fontSize: 9,
          fontFamily: "Helvetica-Bold",
          color: PDF_COLORS.textPrimary,
          marginBottom: 4,
        }}
      >
        {title}
      </Text>
      {rows.map((r, i) => (
        <View
          key={r.candidate_id}
          wrap={false}
          style={{
            borderLeftWidth: 3,
            borderLeftColor: accent,
            backgroundColor: PDF_COLORS.paperAlt,
            padding: 8,
            marginBottom: 4,
          }}
        >
          <View
            style={{ flexDirection: "row", justifyContent: "space-between" }}
          >
            <Text style={{ fontSize: 10, fontFamily: "Helvetica-Bold" }}>
              #{i + 1} · {r.full_name}
            </Text>
            <Text
              style={{
                fontSize: 11,
                fontFamily: "Helvetica-Bold",
                color: scoreColor(r.overall),
              }}
            >
              {r.overall.toFixed(2)}
            </Text>
          </View>
          <Text
            style={{
              fontSize: 8,
              color: PDF_COLORS.textMuted,
              marginTop: 2,
            }}
          >
            {r.current_title ?? "—"}
            {r.current_company ? ` @ ${r.current_company}` : ""}
            {"  ·  "}
            <Text style={{ fontFamily: "Helvetica-Bold" }}>
              {TIER_BANDS[r.tier].label.split(" · ")[0]}
            </Text>
          </Text>
          {r.evaluation?.final_verdict.narrative && (
            <Text
              style={{
                fontSize: 9,
                marginTop: 4,
                color: PDF_COLORS.textPrimary,
                lineHeight: 1.4,
              }}
            >
              {r.evaluation.final_verdict.narrative}
            </Text>
          )}
        </View>
      ))}
    </View>
  );
}

function ScoreCell({ value }: { value: number }) {
  return (
    <Text
      style={[
        PDF_STYLES.td,
        PDF_STYLES.tdNum,
        { width: SCORE_COL, color: scoreColor(value) },
      ]}
    >
      {value}
    </Text>
  );
}
