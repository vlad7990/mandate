/**
 * Illustrative three-circle alignment diagram for the marketing page.
 * Visually echoes the in-app TriangulationPanel SVG but rendered at
 * marketing scale with illustrative scores. Pure SVG, no client JS.
 *
 * NO TRAFFIC LIGHTS. This used to map scores through green / amber /
 * red — ≥70 good, ≥45 warn, below that risk — and apply the result to
 * the medallion stroke and both pairwise pills. Green/amber/red is the
 * universal grammar of pass / caution / fail, so an amber ring beside a
 * named person is a verdict on that person, rendered three sections
 * after the page states that "no hire or no-hire verdict is produced
 * anywhere in the product". The colour was doing evaluative work the
 * copy explicitly disclaims, and a search principal reading in order
 * catches it.
 *
 * Alignment is a MAGNITUDE. It is now expressed as one accent hue whose
 * ring opacity tracks the score, so a lower number reads as "less", not
 * as "bad". If a future design needs to flag a genuine risk, that has
 * to be a stated, human-authored judgement — not a colour ramp applied
 * to a number.
 *
 * LABEL COLOUR: the four small uppercase labels use `--fg-soft`, NOT
 * `--fg-muted`. They sit on top of the translucent circle fills, and a
 * ratio measured against the page background is misleading there —
 * `--fg-muted` reads 5.10:1 on `--bg` but only 2.85:1 once composited
 * over the cyan fill. `--fg-soft` clears 4.5:1 against every fill in
 * this diagram (worst case 5.59:1). Do not "tidy" these back to the
 * muted token without re-measuring against the composited backdrop.
 * (They were `#6b6b7e` hardcoded, which failed everywhere.)
 */

/** Ring emphasis for a 0–100 magnitude. Opacity only — never hue. */
function ringOpacity(score: number): number {
  const clamped = Math.max(0, Math.min(100, score));
  // 0 → 0.35, 100 → 1.0. Keeps a low score visible rather than fading
  // it toward "wrong".
  return +(0.35 + (clamped / 100) * 0.65).toFixed(3);
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
  const overallRing = ringOpacity(overall);
  const ccRing = ringOpacity(candidateCompany);
  const chRing = ringOpacity(candidateHm);

  return (
    <svg
      viewBox="0 0 540 460"
      role="img"
      /* "Illustrative example" leads, because the visual caveat sits in
         the adjacent column and a screen-reader user may never reach
         it — the label previously stated the scores as plain fact. */
      aria-label={`Illustrative example of an alignment diagram, not live data. Overall ${overall}, candidate to company ${candidateCompany}, candidate to hiring manager ${candidateHm}.`}
      className="m-tri-svg w-full h-auto max-w-[540px] mx-auto block"
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

      {/* Radar/sonar pulse — three concentric ping rings emanating
          from the center medallion. Each ring scales 0.2 → 2.4 with a
          fading opacity over 4s, staggered so there's always one
          mid-ping. Reduced motion + mobile damp this in marketing.css. */}
      <g className="m-tri-radar">
        <circle cx="270" cy="245" r="48" />
        <circle cx="270" cy="245" r="48" />
        <circle cx="270" cy="245" r="48" />
      </g>

      {/* Three intersecting circles — wrapped in a slow-rotating group
          so the diagram feels alive. The rotor rotates around the
          center medallion (270, 245); the medallion itself is rendered
          outside the rotor so the score number stays upright. */}
      <g className="m-tri-rotor">
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
      </g>

      {/* Pairwise score pills on overlap edges */}
      <g>
        <rect
          x="131"
          y="166"
          width="48"
          height="22"
          rx="2"
          fill="var(--bg)"
          stroke="var(--accent)"
          strokeOpacity={ccRing}
          strokeWidth="1.2"
        />
        <text
          x="155"
          y="181"
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
          x="361"
          y="166"
          width="48"
          height="22"
          rx="2"
          fill="var(--bg)"
          stroke="var(--accent)"
          strokeOpacity={chRing}
          strokeWidth="1.2"
        />
        <text
          x="385"
          y="181"
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
        fill="var(--bg)"
        stroke="var(--accent)"
        strokeOpacity={overallRing}
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
        fill="var(--fg-soft)"
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
        fill="var(--fg-soft)"
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
        fill="var(--fg-soft)"
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
        fill="var(--fg-soft)"
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
