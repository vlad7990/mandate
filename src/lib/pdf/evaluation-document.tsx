import { Document, Page, Text, View } from "@react-pdf/renderer";
import {
  ALIGNMENT_LIGHT_LABELS,
  RECOMMENDATION_LABELS,
  VERDICT_TIER_LABELS,
  type CandidateEvaluation,
} from "@/lib/ai/candidate-evaluation";
import { type DimensionKey } from "@/lib/ai/onboarding-analysis";
import { PDF_COLORS, PDF_STYLES, scoreColor, tierColor } from "./styles";

const DIM_LABEL: Record<DimensionKey, string> = {
  technical: "Technical",
  domain: "Domain",
  leadership: "Leadership",
  regulatory: "Regulatory",
  transformation: "Transformation",
};

const ALIGNMENT_FG: Record<"green" | "amber" | "red", string> = {
  green: PDF_COLORS.good,
  amber: PDF_COLORS.warn,
  red: PDF_COLORS.bad,
};

export type EvaluationPdfMeta = {
  candidate_name: string;
  candidate_title: string | null;
  candidate_company: string | null;
};

export function EvaluationPdfDocument({
  evaluation,
  meta,
}: {
  evaluation: CandidateEvaluation;
  meta: EvaluationPdfMeta;
}) {
  const verdictTier = evaluation.final_verdict.tier;

  return (
    <Document
      title={`Mandate · Executive Evaluation · ${meta.candidate_name}`}
      author="Mandate"
      subject={`${evaluation.role_title} — ${evaluation.company_name}`}
    >
      <Page size="A4" style={PDF_STYLES.page} wrap>
        {/* Brand bar */}
        <View style={PDF_STYLES.brandBar} fixed>
          <View>
            <Text style={PDF_STYLES.brandMark}>MANDATE</Text>
            <Text style={PDF_STYLES.brandKicker}>EXECUTIVE EVALUATION</Text>
          </View>
          <Text style={PDF_STYLES.brandMeta}>
            {evaluation.generated_at.slice(0, 10)}
          </Text>
        </View>

        {/* Subhead */}
        <View style={PDF_STYLES.subhead}>
          <Text style={PDF_STYLES.subheadTitle}>{meta.candidate_name}</Text>
          <Text style={PDF_STYLES.subheadMeta}>
            {[meta.candidate_title, meta.candidate_company]
              .filter(Boolean)
              .join(" @ ") || "—"}
            {"   ·   "}
            <Text style={{ fontFamily: "Helvetica-Bold" }}>
              {evaluation.role_title}
            </Text>{" "}
            · {evaluation.company_name}
          </Text>
        </View>

        <View style={PDF_STYLES.body}>
          {/* Verdict + recommendation banner */}
          <View
            style={{
              flexDirection: "row",
              gap: 8,
              marginBottom: 10,
            }}
          >
            <Banner
              label="Verdict"
              value={VERDICT_TIER_LABELS[verdictTier]}
              color={tierColor(verdictTier)}
            />
            <Banner
              label="Recommendation"
              value={RECOMMENDATION_LABELS[evaluation.recommendation]}
              color={
                evaluation.recommendation === "primary"
                  ? PDF_COLORS.good
                  : evaluation.recommendation === "secondary"
                    ? PDF_COLORS.accent
                    : PDF_COLORS.bad
              }
            />
            <Banner
              label="Alignment"
              value={ALIGNMENT_LIGHT_LABELS[evaluation.alignment_test.light]}
              color={ALIGNMENT_FG[evaluation.alignment_test.light]}
            />
          </View>

          {/* 1. Scoring table */}
          <SectionHeader label="01 · Scoring Table" />
          <View style={PDF_STYLES.table}>
            <View style={PDF_STYLES.thead}>
              <Text style={[PDF_STYLES.th, { flex: 2 }]}>Dimension</Text>
              <Text style={[PDF_STYLES.th, { width: 50, textAlign: "right" }]}>
                Score
              </Text>
              <Text style={[PDF_STYLES.th, { width: 60, textAlign: "right" }]}>
                Weight
              </Text>
              <Text style={[PDF_STYLES.th, { flex: 4 }]}>Commentary</Text>
            </View>
            {evaluation.scoring_table.map((row) => (
              <View key={row.dimension} style={PDF_STYLES.tbodyRow}>
                <Text style={[PDF_STYLES.td, { flex: 2 }]}>
                  {DIM_LABEL[row.dimension]}
                </Text>
                <Text
                  style={[
                    PDF_STYLES.td,
                    PDF_STYLES.tdNum,
                    { width: 50, color: scoreColor(row.score) },
                  ]}
                >
                  {row.score}/10
                </Text>
                <Text
                  style={[PDF_STYLES.td, PDF_STYLES.tdNum, { width: 60 }]}
                >
                  {row.weight}/10
                </Text>
                <Text style={[PDF_STYLES.td, { flex: 4 }]}>
                  {row.commentary}
                </Text>
              </View>
            ))}
          </View>

          {/* 2. Profile summary */}
          <SectionHeader label="02 · Executive Summary" />
          <Text style={PDF_STYLES.p}>
            {evaluation.profile_summary.executive_summary}
          </Text>
          <Text
            style={{
              fontSize: 8,
              fontFamily: "Helvetica-Bold",
              color: PDF_COLORS.textMuted,
              letterSpacing: 1,
              marginTop: 4,
              marginBottom: 4,
              textTransform: "uppercase",
            }}
          >
            Background
          </Text>
          {evaluation.profile_summary.background_bullets.map((b, i) => (
            <BulletRow key={i} text={b} />
          ))}

          {/* 3. Alignment test */}
          <SectionHeader label="03 · Critical Role Alignment Test" />
          <Text style={[PDF_STYLES.p, PDF_STYLES.bold]}>
            Q: {evaluation.alignment_test.question}
          </Text>
          <Text style={PDF_STYLES.p}>{evaluation.alignment_test.answer}</Text>
          <Text style={[PDF_STYLES.pMuted, { marginTop: 2 }]}>
            <Text
              style={{
                fontFamily: "Helvetica-Bold",
                color: ALIGNMENT_FG[evaluation.alignment_test.light],
              }}
            >
              {ALIGNMENT_LIGHT_LABELS[evaluation.alignment_test.light]}
              {" — "}
            </Text>
            {evaluation.alignment_test.justification}
          </Text>

          {/* 4. Strengths */}
          <SectionHeader label="04 · Strengths" />
          {evaluation.strengths.map((s, i) => (
            <View key={i} wrap={false} style={{ marginBottom: 6 }}>
              <Text
                style={{
                  fontSize: 10,
                  fontFamily: "Helvetica-Bold",
                  color: PDF_COLORS.textPrimary,
                  marginBottom: 2,
                }}
              >
                {String(i + 1).padStart(2, "0")} — {s.headline}
              </Text>
              <Text style={PDF_STYLES.p}>{s.detail}</Text>
              <Text style={[PDF_STYLES.pMuted]}>
                <Text style={PDF_STYLES.bold}>Signal: </Text>
                {s.signal}
              </Text>
            </View>
          ))}

          {/* 5. Gaps */}
          <SectionHeader label="05 · Critical Gaps" />
          {evaluation.gaps.map((g, i) => (
            <View key={i} wrap={false} style={{ marginBottom: 6 }}>
              <Text
                style={{
                  fontSize: 10,
                  fontFamily: "Helvetica-Bold",
                  color: PDF_COLORS.bad,
                  marginBottom: 2,
                }}
              >
                {String(i + 1).padStart(2, "0")} — {g.headline}
              </Text>
              <Text style={PDF_STYLES.p}>{g.detail}</Text>
              <Text style={[PDF_STYLES.pMuted]}>
                <Text style={PDF_STYLES.bold}>Role mismatch: </Text>
                {g.role_mismatch}
              </Text>
            </View>
          ))}

          {/* 6. Comparison */}
          <SectionHeader label="06 · Comparison" />
          <Text style={PDF_STYLES.p}>{evaluation.comparison.positioning}</Text>
          {evaluation.comparison.competitors.length > 0 && (
            <View style={PDF_STYLES.table}>
              <View style={PDF_STYLES.thead}>
                <Text style={[PDF_STYLES.th, { flex: 2 }]}>Candidate</Text>
                <Text style={[PDF_STYLES.th, { flex: 1 }]}>Tier</Text>
                <Text style={[PDF_STYLES.th, { flex: 1 }]}>Direction</Text>
                <Text style={[PDF_STYLES.th, { flex: 4 }]}>Trade-off</Text>
              </View>
              {evaluation.comparison.competitors.map((c) => (
                <View key={c.candidate_id} style={PDF_STYLES.tbodyRow}>
                  <Text style={[PDF_STYLES.td, { flex: 2 }]}>
                    {c.full_name}
                  </Text>
                  <Text style={[PDF_STYLES.td, { flex: 1 }]}>
                    {c.tier_label}
                  </Text>
                  <Text
                    style={[
                      PDF_STYLES.td,
                      {
                        flex: 1,
                        color:
                          c.direction === "ahead"
                            ? PDF_COLORS.good
                            : c.direction === "behind"
                              ? PDF_COLORS.bad
                              : PDF_COLORS.textMuted,
                        fontFamily: "Helvetica-Bold",
                        textTransform: "uppercase",
                      },
                    ]}
                  >
                    {c.direction}
                  </Text>
                  <Text style={[PDF_STYLES.td, { flex: 4 }]}>
                    {c.vs_summary}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* 7. Final verdict */}
          <SectionHeader label="07 · Final Verdict" />
          <View style={PDF_STYLES.callout}>
            <Text style={PDF_STYLES.calloutLabel}>
              {VERDICT_TIER_LABELS[verdictTier]}
            </Text>
            <Text style={PDF_STYLES.p}>
              {evaluation.final_verdict.narrative}
            </Text>
          </View>

          {/* 8. Positioning */}
          <SectionHeader label="08 · How to Position" />
          <Text style={PDF_STYLES.p}>
            <Text style={PDF_STYLES.bold}>Opener: </Text>
            {evaluation.positioning.opener}
          </Text>
          <Text
            style={{
              fontSize: 8,
              fontFamily: "Helvetica-Bold",
              color: PDF_COLORS.textMuted,
              letterSpacing: 1,
              marginTop: 4,
              marginBottom: 2,
              textTransform: "uppercase",
            }}
          >
            Talking points
          </Text>
          {evaluation.positioning.talking_points.map((tp, i) => (
            <Text key={i} style={PDF_STYLES.p}>
              {i + 1}. {tp}
            </Text>
          ))}
          <Text style={[PDF_STYLES.pMuted, { marginTop: 4 }]}>
            <Text style={PDF_STYLES.bold}>If client objects: </Text>
            {evaluation.positioning.objection_handling}
          </Text>

          {/* 9. Recommendation */}
          <SectionHeader label="09 · Recommendation" />
          <View style={PDF_STYLES.callout}>
            <Text style={PDF_STYLES.calloutLabel}>
              {RECOMMENDATION_LABELS[evaluation.recommendation]}
            </Text>
            <Text style={PDF_STYLES.p}>
              {evaluation.recommendation_rationale}
            </Text>
          </View>
        </View>

        {/* Footer */}
        <View style={PDF_STYLES.footer} fixed>
          <Text>
            Mandate · {evaluation.role_title} · {evaluation.company_name}
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

function Banner({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <View
      style={{
        flex: 1,
        padding: 8,
        borderWidth: 1,
        borderColor: color,
        backgroundColor: PDF_COLORS.paperAlt,
      }}
    >
      <Text
        style={{
          fontSize: 7,
          fontFamily: "Helvetica-Bold",
          color: PDF_COLORS.textMuted,
          letterSpacing: 1.5,
          textTransform: "uppercase",
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          fontSize: 11,
          fontFamily: "Helvetica-Bold",
          color,
          marginTop: 2,
        }}
      >
        {value}
      </Text>
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
