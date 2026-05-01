/**
 * Decorative three-circle alignment diagram for the marketing page.
 * Visually echoes the in-app TriangulationPanel SVG but rendered at
 * marketing scale with sample scores. Pure SVG, no client JS.
 */

const TONE = {
  good: "#22c55e",
  warn: "#f59e0b",
  risk: "#ef4444",
} as const;

function tone(score: number) {
  if (score >= 70) return TONE.good;
  if (score >= 45) return TONE.warn;
  return TONE.risk;
}

export function ThreeCircleAlignment({
  candidateName = "Candidate",
  companyName = "Company",
  hmName = "Hiring Manager",
  overall = 87,
  candidateCompany = 91,
  candidateHm = 83,
}: {
  candidateName?: string;
  companyName?: string;
  hmName?: string;
  overall?: number;
  candidateCompany?: number;
  candidateHm?: number;
}) {
  const overallTone = tone(overall);
  const ccTone = tone(candidateCompany);
  const chTone = tone(candidateHm);

  return (
    <svg
      viewBox="0 0 540 460"
      role="img"
      aria-label={`Alignment diagram. Overall ${overall}, candidate↔company ${candidateCompany}, candidate↔HM ${candidateHm}.`}
      className="w-full h-auto max-w-[540px] mx-auto block"
    >
      {/* Atmospheric backdrop circles */}
      <defs>
        <radialGradient id="m3-bg-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.18" />
          <stop offset="60%" stopColor="#3b82f6" stopOpacity="0.04" />
          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="m3-cand" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.32" />
          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.05" />
        </linearGradient>
        <linearGradient id="m3-co" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.05" />
        </linearGradient>
        <linearGradient id="m3-hm" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#a78bfa" stopOpacity="0.05" />
        </linearGradient>
      </defs>

      <circle cx="270" cy="240" r="240" fill="url(#m3-bg-glow)" />

      {/* Three intersecting circles */}
      <circle
        cx="270"
        cy="160"
        r="135"
        fill="url(#m3-cand)"
        stroke="#3b82f6"
        strokeOpacity="0.55"
        strokeWidth="1.5"
      />
      <circle
        cx="180"
        cy="290"
        r="135"
        fill="url(#m3-co)"
        stroke="#22d3ee"
        strokeOpacity="0.55"
        strokeWidth="1.5"
      />
      <circle
        cx="360"
        cy="290"
        r="135"
        fill="url(#m3-hm)"
        stroke="#a78bfa"
        strokeOpacity="0.55"
        strokeWidth="1.5"
      />

      {/* Pairwise score pills on overlap edges */}
      <g>
        <rect
          x="200"
          y="220"
          width="48"
          height="22"
          rx="2"
          fill="#0a0a0f"
          stroke={ccTone}
          strokeWidth="1.2"
        />
        <text
          x="224"
          y="235"
          textAnchor="middle"
          fill="#ececf4"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          {candidateCompany}
        </text>
      </g>
      <g>
        <rect
          x="292"
          y="220"
          width="48"
          height="22"
          rx="2"
          fill="#0a0a0f"
          stroke={chTone}
          strokeWidth="1.2"
        />
        <text
          x="316"
          y="235"
          textAnchor="middle"
          fill="#ececf4"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          {candidateHm}
        </text>
      </g>

      {/* Center overall medallion */}
      <circle
        cx="270"
        cy="245"
        r="48"
        fill="#0a0a0f"
        stroke={overallTone}
        strokeWidth="2"
      />
      <text
        x="270"
        y="245"
        textAnchor="middle"
        dominantBaseline="middle"
        fill="#ececf4"
        style={{
          fontSize: 36,
          fontWeight: 700,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {overall}
      </text>
      <text
        x="270"
        y="272"
        textAnchor="middle"
        fill="#6b6b7e"
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
        }}
      >
        Overall
      </text>

      {/* Outer labels */}
      <text
        x="270"
        y="34"
        textAnchor="middle"
        fill="#6b6b7e"
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          letterSpacing: "0.2em",
          textTransform: "uppercase",
        }}
      >
        CANDIDATE
      </text>
      <text
        x="270"
        y="54"
        textAnchor="middle"
        fill="#ececf4"
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 16,
          fontStyle: "italic",
          fontWeight: 400,
        }}
      >
        {candidateName}
      </text>

      <text
        x="60"
        y="438"
        textAnchor="start"
        fill="#6b6b7e"
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          letterSpacing: "0.2em",
          textTransform: "uppercase",
        }}
      >
        COMPANY
      </text>
      <text
        x="60"
        y="454"
        textAnchor="start"
        fill="#ececf4"
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 14,
          fontStyle: "italic",
          fontWeight: 400,
        }}
      >
        {companyName}
      </text>

      <text
        x="480"
        y="438"
        textAnchor="end"
        fill="#6b6b7e"
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          letterSpacing: "0.2em",
          textTransform: "uppercase",
        }}
      >
        HIRING MANAGER
      </text>
      <text
        x="480"
        y="454"
        textAnchor="end"
        fill="#ececf4"
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 14,
          fontStyle: "italic",
          fontWeight: 400,
        }}
      >
        {hmName}
      </text>
    </svg>
  );
}
