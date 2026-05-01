import { Document, Page, Text, View } from "@react-pdf/renderer";
import type { WeeklyReport } from "@/lib/ai/weekly-report-agent";
import { PDF_COLORS, PDF_STYLES } from "./styles";

export type WeeklyReportPdfMeta = {
  project_title: string;
  company_name: string;
  generated_at: string;
};

export function WeeklyReportPdfDocument({
  report,
  meta,
}: {
  report: WeeklyReport;
  meta: WeeklyReportPdfMeta;
}) {
  return (
    <Document
      title={`Mandate · Weekly Report · ${meta.project_title}`}
      author="Mandate"
      subject={`${meta.project_title} — week of ${report.week_starting}`}
    >
      <Page size="A4" style={PDF_STYLES.page} wrap>
        <View style={PDF_STYLES.brandBar} fixed>
          <View>
            <Text style={PDF_STYLES.brandMark}>MANDATE</Text>
            <Text style={PDF_STYLES.brandKicker}>WEEKLY PROGRESS REPORT</Text>
          </View>
          <Text style={PDF_STYLES.brandMeta}>
            Week of {report.week_starting}
          </Text>
        </View>

        <View style={PDF_STYLES.subhead}>
          <Text style={PDF_STYLES.subheadTitle}>{meta.project_title}</Text>
          <Text style={PDF_STYLES.subheadMeta}>
            {meta.company_name} · Generated {meta.generated_at.slice(0, 10)}
          </Text>
        </View>

        <View style={PDF_STYLES.body}>
          <SectionHeader label="01 · Executive Summary" />
          <Text style={PDF_STYLES.p}>{report.executive_summary}</Text>

          <SectionHeader
            label="02 · Top Candidates"
            meta={`${report.top_candidates.length} ranked`}
          />
          {report.top_candidates.length === 0 ? (
            <Text style={PDF_STYLES.pMuted}>
              No ranked candidates yet.
            </Text>
          ) : (
            report.top_candidates.map((c, i) => (
              <View key={c.candidate_id} style={{ marginBottom: 6 }}>
                <Text
                  style={{
                    fontSize: 10,
                    fontFamily: "Helvetica-Bold",
                    color: PDF_COLORS.textPrimary,
                    marginBottom: 2,
                  }}
                >
                  {i + 1}. {c.name}
                </Text>
                <Text style={PDF_STYLES.pMuted}>{c.one_liner}</Text>
              </View>
            ))
          )}

          <SectionHeader
            label="03 · Sourced This Week"
            meta={`${report.candidates_sourced_count}`}
          />
          {report.candidates_sourced_names.length === 0 ? (
            <Text style={PDF_STYLES.pMuted}>None.</Text>
          ) : (
            report.candidates_sourced_names.map((n, i) => (
              <BulletRow key={i} text={n} />
            ))
          )}

          <SectionHeader
            label="04 · Pipeline Movement"
            meta={`${report.pipeline_moves.length}`}
          />
          {report.pipeline_moves.length === 0 ? (
            <Text style={PDF_STYLES.pMuted}>No stage changes this week.</Text>
          ) : (
            report.pipeline_moves.map((m, i) => (
              <BulletRow
                key={i}
                text={`${m.name} · ${m.from_stage} → ${m.to_stage}`}
              />
            ))
          )}

          <SectionHeader
            label="05 · Ranking Changes"
            meta={`${report.rank_moves.length}`}
          />
          {report.rank_moves.length === 0 ? (
            <Text style={PDF_STYLES.pMuted}>No ranking shifts this week.</Text>
          ) : (
            report.rank_moves.map((r, i) => (
              <BulletRow
                key={i}
                text={`${r.direction === "up" ? "▲" : "▼"} ${r.name} · ${r.delta} positions`}
              />
            ))
          )}

          <SectionHeader
            label="06 · Feedback Insights"
            meta={`${report.feedback_insights.length}`}
          />
          {report.feedback_insights.length === 0 ? (
            <Text style={PDF_STYLES.pMuted}>No new feedback this week.</Text>
          ) : (
            report.feedback_insights.map((f, i) => (
              <View key={i} style={{ marginBottom: 4 }}>
                <Text
                  style={{
                    fontSize: 9,
                    fontFamily: "Helvetica-Bold",
                    color: PDF_COLORS.textPrimary,
                  }}
                >
                  {f.topic}
                </Text>
                <Text style={PDF_STYLES.pMuted}>{f.detail}</Text>
              </View>
            ))
          )}

          <SectionHeader label="07 · Next Steps" />
          {report.next_steps.map((step, i) => (
            <BulletRow key={i} text={step} />
          ))}

          <SectionHeader label="08 · Market Commentary" />
          <View style={PDF_STYLES.callout}>
            <Text style={PDF_STYLES.p}>{report.market_commentary}</Text>
          </View>
        </View>

        <View style={PDF_STYLES.footer} fixed>
          <Text>
            Mandate · {meta.project_title} · {meta.company_name}
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

function BulletRow({ text }: { text: string }) {
  return (
    <View style={{ flexDirection: "row", marginBottom: 2 }}>
      <Text
        style={{
          width: 10,
          fontSize: 10,
          color: PDF_COLORS.textMuted,
        }}
      >
        ·
      </Text>
      <Text
        style={{
          flex: 1,
          fontSize: 10,
          lineHeight: 1.4,
          color: PDF_COLORS.textPrimary,
        }}
      >
        {text}
      </Text>
    </View>
  );
}
