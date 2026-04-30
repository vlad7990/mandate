import { Document, Page, Text, View } from "@react-pdf/renderer";
import { TIER_BANDS, type Tier } from "@/lib/ranking/tiers";
import type {
  ComparisonContext,
  ComparisonRow,
  DimensionWeights,
  MarketInsight,
} from "@/lib/comparison/comparison-export";
import { PDF_COLORS, PDF_STYLES, scoreColor, tierColor } from "./styles";

const TIER_ORDER: Tier[] = ["tier_1", "tier_2", "tier_3", "tier_4"];

export function ComparisonPdfDocument({
  rows,
  weights,
  insight,
  context,
}: {
  rows: ComparisonRow[];
  weights: DimensionWeights | null;
  insight: MarketInsight;
  context: ComparisonContext;
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
          {/* Master scoring table */}
          <SectionHeader
            label="01 · Master Scoring Table"
            meta={
              weights
                ? `Weights T${weights.technical}/D${weights.domain}/L${weights.leadership}/R${weights.regulatory}/X${weights.transformation}`
                : undefined
            }
          />
          <View style={PDF_STYLES.table}>
            <View style={PDF_STYLES.thead}>
              <Text style={[PDF_STYLES.th, { width: 24 }]}>#</Text>
              <Text style={[PDF_STYLES.th, { flex: 3 }]}>Candidate</Text>
              <Text style={[PDF_STYLES.th, { flex: 1 }]}>Tier</Text>
              <Text
                style={[PDF_STYLES.th, { width: 40, textAlign: "right" }]}
              >
                Overall
              </Text>
              <Text
                style={[PDF_STYLES.th, { width: 26, textAlign: "right" }]}
              >
                Tech
              </Text>
              <Text
                style={[PDF_STYLES.th, { width: 30, textAlign: "right" }]}
              >
                Dom
              </Text>
              <Text
                style={[PDF_STYLES.th, { width: 26, textAlign: "right" }]}
              >
                Lead
              </Text>
              <Text
                style={[PDF_STYLES.th, { width: 30, textAlign: "right" }]}
              >
                Reg
              </Text>
              <Text
                style={[PDF_STYLES.th, { width: 32, textAlign: "right" }]}
              >
                Xform
              </Text>
            </View>
            {rows.map((r) => (
              <View key={r.candidate_id} style={PDF_STYLES.tbodyRow}>
                <Text
                  style={[
                    PDF_STYLES.td,
                    PDF_STYLES.tdNum,
                    { width: 24, color: PDF_COLORS.textMuted },
                  ]}
                >
                  {r.rank}
                </Text>
                <View style={[PDF_STYLES.td, { flex: 3 }]}>
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
                <View style={[PDF_STYLES.td, { flex: 1 }]}>
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
                    { width: 40, color: scoreColor(r.overall) },
                  ]}
                >
                  {r.overall.toFixed(2)}
                </Text>
                <ScoreCell value={r.technical} width={26} />
                <ScoreCell value={r.domain} width={30} />
                <ScoreCell value={r.leadership} width={26} />
                <ScoreCell value={r.regulatory} width={30} />
                <ScoreCell value={r.transformation} width={32} />
              </View>
            ))}
          </View>

          {/* Tiered market view */}
          <SectionHeader label="02 · Tiered Market View" />
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
            label="03 · Recommended Slate"
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
          <View style={PDF_STYLES.callout}>
            <Text style={PDF_STYLES.calloutLabel}>Market Reality</Text>
            <Text style={PDF_STYLES.p}>{insight.reality_statement}</Text>
          </View>
          <View
            style={[PDF_STYLES.callout, { borderLeftColor: PDF_COLORS.good }]}
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

function ScoreCell({ value, width }: { value: number; width: number }) {
  return (
    <Text
      style={[
        PDF_STYLES.td,
        PDF_STYLES.tdNum,
        { width, color: scoreColor(value) },
      ]}
    >
      {value}
    </Text>
  );
}
