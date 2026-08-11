import Link from "next/link";
import { Reveal } from "./_components/reveal";
import { LiveSimulator } from "./_components/live-simulator";
import { FaqAccordion } from "./_components/faq-accordion";
import { ThreeCircleAlignment } from "./_components/three-circle-alignment";
import { CountUp } from "./_components/count-up";
import { ScrollProgress } from "./_components/scroll-progress";
import { TerminalCursor } from "./_components/terminal-cursor";
import { ParticleField } from "./_components/particle-field";
import { DataStream } from "./_components/data-stream";
import { TypewriterReveal } from "./_components/typewriter-reveal";

export const dynamic = "force-static";

export default function MarketingLandingPage() {
  return (
    <>
      <ScrollProgress />
      <TopNav />
      <Hero />
      <StatsTicker />
      <Problem />
      <Simulator />
      <HowItWorks />
      <Stack />
      <Triangulation />
      <ExecutiveIntelligence />
      <Features />
      <Principles />
      <Pricing />
      <Faq />
      <CtaFooter />
      <Footer />
    </>
  );
}

// ────────────────────────────────────────────────────────────────────
// Top nav — minimal, monospace wordmark + two links
// ────────────────────────────────────────────────────────────────────

function TopNav() {
  return (
    <header className="m-nav">
      <div className="m-container m-nav__inner">
        <Link href="/" className="m-nav__brand" aria-label="Mandate home">
          <span aria-hidden className="m-nav__mark">
            M
          </span>
          <span className="m-nav__wordmark">Mandate</span>
          <span aria-hidden className="m-nav__beta">
            BETA
          </span>
          <span className="m-nav__live" aria-hidden>
            <span className="m-nav__live-dot" />
            System online
          </span>
        </Link>

        <nav className="m-nav__links" aria-label="Primary">
          <a href="#how" className="m-nav__link">
            Platform
          </a>
          <a href="#intelligence" className="m-nav__link">
            Intelligence
          </a>
          <a href="#simulator" className="m-nav__link">
            Live Demo
          </a>
          <a href="#pricing" className="m-nav__link">
            Pricing
          </a>
        </nav>

        <div className="m-nav__actions">
          <Link href="/auth/signin" className="m-btn m-btn--ghost">
            Log In
          </Link>
          <Link href="/request-access" className="m-btn m-btn--primary">
            Request Access
          </Link>
        </div>
      </div>
    </header>
  );
}

// ────────────────────────────────────────────────────────────────────
// 1. HERO
// ────────────────────────────────────────────────────────────────────

function Hero() {
  return (
    <section
      className="m-hero m-section m-section--gap-tight-bottom"
      style={{ position: "relative" }}
    >
      <div className="m-hero-glow" aria-hidden />
      <div className="m-hero-scan" aria-hidden />
      <ParticleField />
      <span className="m-section__numeral" aria-hidden>
        00
      </span>
      {/*
        Drop the auto-stagger m-hero-enter wrapper and instead use
        explicit per-element classes (.m-hero-{kicker, headline-1, sub,
        ctas, stats}) — that way the spec timings can be dialed
        precisely without relying on DOM child order.
      */}
      <div
        className="m-container"
        style={{
          position: "relative",
          zIndex: 2,
          display: "grid",
          gap: "2rem",
          maxWidth: 1080,
          margin: "0 auto",
          textAlign: "center",
        }}
      >
        <span
          className="m-eyebrow m-hero-kicker"
          style={{ justifySelf: "center" }}
        >
          <span className="m-hero-kicker-dot" aria-hidden />
          17_SPECIALIST_AGENTS · ONE_ACCOUNTABLE_HUMAN
        </span>

        <h1 className="m-display">
          <span className="m-hero-headline-1">One line in.</span>
          <br />
          <em>
            <TypewriterReveal
              text="A defensible shortlist out."
              delay={700}
              speed={80}
              cursorDuration={2000}
            />
          </em>
        </h1>

        <p
          className="m-lede m-hero-sub"
          style={{
            margin: "0 auto",
            maxWidth: 640,
            fontSize: "clamp(1.0625rem, 1.5vw, 1.25rem)",
            color: "var(--fg-muted)",
          }}
        >
          Type the mandate. Mandate decomposes it, researches the company,
          drafts the role specification and builds the scoring model — then
          you approve the bar before a single candidate is scored against it.
        </p>

        <div
          className="m-hero-ctas"
          style={{
            display: "flex",
            gap: "0.75rem",
            justifyContent: "center",
            flexWrap: "wrap",
          }}
        >
          <Link
            href="/request-access"
            className="m-btn m-btn--primary"
          >
            <span>Request Access</span>
            <span aria-hidden>→</span>
          </Link>
          <a href="#simulator" className="m-btn m-btn--ghost">
            <span>Run the live simulator</span>
            <span aria-hidden>↓</span>
          </a>
        </div>

        <p className="m-hero-trust">
          Access is granted by approval, not by credit card. No trial, no
          self-serve tier.
        </p>

        <div className="m-hero-stats">
          <HeroDataRail />
        </div>
      </div>
    </section>
  );
}

function HeroDataRail() {
  // Six "live readouts" under the CTA — give the page that
  // trading-floor-screen feel without being noisy. Numbers count up
  // from 0 as the rail enters the viewport.
  const items: Array<{
    label: string;
    to?: number;
    suffix?: string;
    text?: string;
  }> = [
    { label: "AGENTS", to: 14 },
    { label: "MODULES", to: 31 },
    { label: "DIMENSIONS", to: 5 },
    { label: "PERSPECTIVES", to: 4 },
    { label: "INTELLIGENCE", text: "3-WAY" },
    { label: "CALIBRATION", text: "AUTO" },
  ];
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
        gap: "1px",
        background: "var(--line)",
        border: "1px solid var(--line)",
        marginTop: "2rem",
      }}
    >
      {items.map((it) => (
        <div
          key={it.label}
          style={{
            background: "var(--bg)",
            padding: "1rem 0.75rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.375rem",
            alignItems: "center",
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "0.625rem",
              letterSpacing: "0.2em",
              color: "var(--fg-muted)",
            }}
          >
            {it.label}
          </span>
          {it.to !== undefined ? (
            <CountUp
              to={it.to}
              duration={1600}
              className="m-stat-rail__value"
            />
          ) : (
            <span className="m-stat-rail__value">{it.text}</span>
          )}
        </div>
      ))}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Stats ticker — marquee under the hero
// ────────────────────────────────────────────────────────────────────

function StatsTicker() {
  const stats = [
    "14 AI AGENTS",
    "31 INTELLIGENCE MODULES",
    "3-WAY CANDIDATE ALIGNMENT",
    "USED BY EXECUTIVE SEARCH PROFESSIONALS",
    "5-DIMENSION CALIBRATION",
    "REAL-TIME WEB RESEARCH",
    "AUTO-RECALIBRATION FROM FEEDBACK",
  ];
  // Duplicate the list so the marquee loop is seamless.
  const looped = [...stats, ...stats];
  return (
    <div className="m-ticker" aria-hidden>
      <div className="m-ticker__track">
        {looped.map((s, i) => (
          <span key={i} className="m-ticker__item">
            <span>◇</span>
            {s}
          </span>
        ))}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// 2. PROBLEM
// ────────────────────────────────────────────────────────────────────

function Problem() {
  const cards: Array<{
    statTo: number;
    statPrefix?: string;
    statSuffix?: string;
    statRange?: string;
    unit: string;
    title: string;
    detail: string;
    accent: string;
    cardClass: string;
  }> = [
    {
      statTo: 5,
      statRange: "3–5",
      unit: "days",
      title: "to brief a search properly",
      detail:
        "Every recruiter starts from scratch — fragmented intake calls, scattered notes, inconsistent calibration. The first week is gone before sourcing begins.",
      accent: "var(--accent)",
      cardClass: "m-card",
    },
    {
      statTo: 67,
      unit: "%",
      title: "evaluation drift across team",
      detail:
        "Two recruiters look at the same CV and rank it differently. Without a shared scoring model, decisions flip with whoever ran the screen call.",
      accent: "var(--warn)",
      cardClass: "m-card m-card--warn",
    },
    {
      statTo: 12,
      statSuffix: "+",
      unit: "tools",
      title: "with feedback in every one",
      detail:
        "Email threads, ATS notes, Slack DMs, Zoom recordings, recruiter scribbles. The signal that matters is in the inbox, not the system.",
      accent: "var(--critical)",
      cardClass: "m-card m-card--danger",
    },
  ];
  return (
    <section className="m-section m-section--gap-tight-top m-section--tint-cool">
      <span className="m-section__numeral" aria-hidden>
        02
      </span>
      <div className="m-container">
        <Reveal className="m-reveal" as="div">
          <span className="m-eyebrow">02 / The status quo</span>
          <h2 className="m-h2" style={{ marginTop: "1rem", maxWidth: "22ch" }}>
            The way executive search works today is{" "}
            <em>broken in three places.</em>
          </h2>
        </Reveal>

        <Reveal
          className="m-reveal-stagger"
          as="ul"
          threshold={0.1}
        >
          <ul
            style={{
              listStyle: "none",
              padding: 0,
              marginTop: "3rem",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: "1.25rem",
            }}
          >
            {cards.map((c) => (
              <li
                key={c.title}
                className={c.cardClass}
                style={{
                  borderTop: `2px solid ${c.accent}`,
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.875rem",
                }}
              >
                <div
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: "clamp(3rem, 6vw, 5rem)",
                    fontVariationSettings: "\"opsz\" 144",
                    fontWeight: 360,
                    color: c.accent,
                    letterSpacing: "-0.035em",
                    lineHeight: 0.92,
                    display: "flex",
                    alignItems: "baseline",
                    gap: "0.5rem",
                  }}
                >
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>
                    {c.statRange ? (
                      c.statRange
                    ) : (
                      <>
                        <CountUp
                          to={c.statTo}
                          duration={1800}
                        />
                        {c.statSuffix}
                      </>
                    )}
                  </span>
                  <span
                    style={{
                      fontSize: "0.875rem",
                      fontFamily: "var(--font-mono)",
                      letterSpacing: "0.18em",
                      textTransform: "uppercase",
                      color: "var(--fg-muted)",
                      fontVariationSettings: "normal",
                      fontWeight: 500,
                    }}
                  >
                    {c.unit}
                  </span>
                </div>
                <h3 className="m-h3" style={{ marginBottom: "0.125rem" }}>
                  {c.title}
                </h3>
                <p
                  style={{
                    color: "var(--fg-soft)",
                    fontSize: "0.9375rem",
                    lineHeight: 1.6,
                  }}
                >
                  {c.detail}
                </p>
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────
// 3. LIVE SIMULATOR
// ────────────────────────────────────────────────────────────────────

function Simulator() {
  return (
    <section
      id="simulator"
      className="m-section m-section--gap-tight-bottom"
      style={{ scrollMarginTop: "2rem" }}
    >
      <DataStream />
      <span className="m-section__numeral m-section__numeral--right" aria-hidden>
        03
      </span>
      <div className="m-container">
        <Reveal className="m-reveal">
          <span className="m-eyebrow">
            <span className="m-sim__live">
              <span className="m-sim__live-dot" />
              <span>LIVE DEMO</span>
            </span>
            <span aria-hidden>·</span>
            03 / Live
          </span>
          <h2 className="m-h2" style={{ marginTop: "1rem", maxWidth: "20ch" }}>
            Type any role.{" "}
            <em>
              Watch Mandate think.
              <TerminalCursor delay={400} duration={2400} />
            </em>
          </h2>
          <p
            className="m-lede"
            style={{ marginTop: "1.25rem", maxWidth: "60ch" }}
          >
            Drop an executive brief — a one-liner, a paste from an email,
            a vague description. The Intake Agent decomposes it,
            calibrates a scoring model, and drafts the first three
            Boolean queries in real time.
          </p>
        </Reveal>

        <Reveal className="m-reveal" threshold={0.05}>
          <div style={{ marginTop: "2.5rem" }}>
            <LiveSimulator />
          </div>
        </Reveal>

        <Reveal className="m-reveal">
          <p
            style={{
              marginTop: "2rem",
              padding: "1rem 1.25rem",
              borderLeft: "2px solid var(--accent)",
              background: "var(--accent-soft)",
              fontFamily: "var(--font-body)",
              fontSize: "0.9375rem",
              color: "var(--fg)",
              maxWidth: 720,
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "0.6875rem",
                letterSpacing: "0.18em",
                color: "var(--accent)",
                marginRight: "0.5rem",
                textTransform: "uppercase",
              }}
            >
              Note
            </span>
            This is what Mandate does in 30 seconds. Manually, the same
            decomposition takes a senior recruiter three days.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────
// 4. HOW IT WORKS
// ────────────────────────────────────────────────────────────────────

function HowItWorks() {
  const steps = [
    {
      n: "01",
      title: "One-line brief",
      sub: "AI decomposes the role",
      icon: "◑",
    },
    {
      n: "02",
      title: "Company research",
      sub: "AI maps culture + context",
      icon: "◐",
    },
    {
      n: "03",
      title: "Candidate evaluation",
      sub: "AI scores 5 dimensions",
      icon: "◓",
    },
    {
      n: "04",
      title: "Client feedback",
      sub: "AI recalibrates automatically",
      icon: "◒",
    },
    {
      n: "05",
      title: "Shortlist",
      sub: "AI generates submission narrative",
      icon: "●",
    },
  ];
  return (
    <section id="how" className="m-section m-section--gap-tight-top">
      <span className="m-section__numeral" aria-hidden>
        04
      </span>
      <div className="m-container">
        <Reveal className="m-reveal">
          <span className="m-eyebrow">04 / Pipeline</span>
          <h2 className="m-h2" style={{ marginTop: "1rem", maxWidth: "24ch" }}>
            Five steps. <em>Every search runs the same shape.</em>
          </h2>
        </Reveal>

        <Reveal className="m-reveal-cascade m-pipeline-cascade" threshold={0.05}>
          <div className="m-pipeline" style={{ marginTop: "3rem" }}>
            {steps.map((s) => (
              <div key={s.n} className="m-pipeline__step">
                <div className="m-pipeline__num">STEP {s.n}</div>
                <div
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: "1.75rem",
                    color: "var(--accent)",
                    marginBottom: "0.5rem",
                    lineHeight: 1,
                  }}
                  aria-hidden
                >
                  {s.icon}
                </div>
                <h3 className="m-h3" style={{ marginBottom: "0.375rem" }}>
                  {s.title}
                </h3>
                <p
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.6875rem",
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    color: "var(--fg-muted)",
                  }}
                >
                  {s.sub}
                </p>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────
// 5. INTELLIGENCE STACK
// ────────────────────────────────────────────────────────────────────

function Stack() {
  const cols = [
    {
      title: "ROLE_INTELLIGENCE",
      blurb: "From one-line brief to ranked candidate slate.",
      items: [
        "Intake Agent",
        "Job Spec Builder",
        "Boolean Search",
        "Sourcing Strategy",
      ],
    },
    {
      title: "CANDIDATE_INTELLIGENCE",
      blurb: "Read every candidate the way your best partner would.",
      items: [
        "CV Parsing",
        "Evaluation Engine",
        "Psychology Module",
        "Positioning Kit",
      ],
    },
    {
      title: "CLIENT_INTELLIGENCE",
      blurb: "Predict what the client actually wants.",
      items: [
        "HM Portal",
        "Culture Analysis",
        "Feedback Interpretation",
        "Weekly Reports",
      ],
    },
  ];
  return (
    <section className="m-section m-section--gap-feature-bottom m-section--tint-warm">
      <span className="m-section__numeral m-section__numeral--right" aria-hidden>
        05
      </span>
      <div className="m-container">
        <Reveal className="m-reveal">
          <span className="m-eyebrow">05 / Stack</span>
          <h2 className="m-h2" style={{ marginTop: "1rem", maxWidth: "24ch" }}>
            The complete <em>intelligence stack.</em>
          </h2>
          <p
            className="m-lede"
            style={{ marginTop: "1.25rem", maxWidth: "60ch" }}
          >
            Twelve specialised modules across three intelligence layers.
            Every layer reads from the others — the system gets sharper
            the more you feed it.
          </p>
        </Reveal>

        <Reveal className="m-reveal-stagger" as="div" threshold={0.1}>
          <div
            style={{
              marginTop: "3rem",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: "1.5rem",
            }}
          >
            {cols.map((col) => (
              <div key={col.title} className="m-card m-card--shimmer">
                <div
                  className="m-mono--label"
                  style={{ color: "var(--accent)", marginBottom: "0.625rem" }}
                >
                  {col.title}
                </div>
                <p
                  style={{
                    fontFamily: "var(--font-display)",
                    fontWeight: 420,
                    fontVariationSettings: "\"opsz\" 60",
                    fontSize: "1.0625rem",
                    color: "var(--fg)",
                    marginBottom: "1.25rem",
                    lineHeight: 1.35,
                  }}
                >
                  {col.blurb}
                </p>
                <ul
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "0.5rem",
                    listStyle: "none",
                    padding: 0,
                  }}
                >
                  {col.items.map((it, i) => (
                    <li
                      key={it}
                      className="m-chip m-chip-pop"
                      style={{
                        animationDelay: `${250 + i * 70}ms`,
                      }}
                    >
                      <span className="m-chip__dot" />
                      {it}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────
// 6. TRIANGULATION HIGHLIGHT
// ────────────────────────────────────────────────────────────────────

function Triangulation() {
  return (
    <section
      id="intelligence"
      className="m-section m-triangulation m-section--gap-feature-top m-section--gap-tight-bottom"
    >
      <span className="m-section__numeral" aria-hidden>
        06
      </span>
      <div
        className="m-container"
        style={{
          position: "relative",
          zIndex: 2,
          display: "grid",
          gap: "3rem",
          gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
          alignItems: "center",
        }}
      >
        <Reveal className="m-reveal">
          <div>
            <span className="m-eyebrow">06 / The fusion layer</span>
            <h2
              className="m-h2"
              style={{ marginTop: "1rem", maxWidth: "22ch" }}
            >
              The feature <em>no other platform has.</em>
            </h2>
            <p
              className="m-lede"
              style={{ marginTop: "1.25rem" }}
            >
              Mandate cross-references candidate psychology, company
              culture, and hiring-manager preferences to produce a
              three-way alignment score — with anticipated objections
              and prepared responses.
            </p>

            <ul
              style={{
                listStyle: "none",
                padding: 0,
                marginTop: "2rem",
                display: "grid",
                gap: "0.625rem",
              }}
            >
              {[
                { k: "Candidate ↔ Company", v: 91, c: "#22c55e" },
                { k: "Candidate ↔ HM", v: 83, c: "#f59e0b" },
                { k: "Overall alignment", v: 87, c: "var(--accent)" },
              ].map((s) => (
                <li
                  key={s.k}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "1rem",
                    padding: "0.75rem 0.875rem",
                    border: "1px solid var(--line)",
                    background: "var(--bg-elev-1)",
                  }}
                >
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "0.6875rem",
                      letterSpacing: "0.16em",
                      textTransform: "uppercase",
                      color: "var(--fg-muted)",
                      flex: 1,
                    }}
                  >
                    {s.k}
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "1.5rem",
                      fontWeight: 600,
                      color: s.c,
                      letterSpacing: "0.02em",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    <CountUp to={s.v} duration={1800} />
                  </span>
                  <span
                    style={{
                      width: 100,
                      height: 6,
                      background: "var(--bg-elev-3)",
                      position: "relative",
                    }}
                    aria-hidden
                  >
                    <span
                      style={{
                        position: "absolute",
                        inset: 0,
                        width: `${s.v}%`,
                        background: s.c,
                      }}
                    />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </Reveal>

        <Reveal className="m-reveal" threshold={0.1}>
          <ThreeCircleAlignment
            candidateName="Sample Candidate"
            companyName="Sample Company"
            hmName="Hiring Manager"
            overall={87}
            candidateCompany={91}
            candidateHm={83}
          />
        </Reveal>
      </div>
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────
// 7. FEATURE GRID
// ────────────────────────────────────────────────────────────────────

function Features() {
  const cards = [
    {
      icon: "🛰",
      name: "Company Intelligence",
      blurb: "Live web research on the hiring company — strategy, leadership, recent moves.",
    },
    {
      icon: "🧠",
      name: "Candidate Psychology",
      blurb: "Leadership style, risk tolerance, change orientation — calibrated from CV + notes.",
    },
    {
      icon: "🎯",
      name: "HM Psychology",
      blurb: "Hiring-manager preference + bias detection from public footprint and feedback.",
    },
    {
      icon: "◆",
      name: "Recruiter Copilot",
      blurb: "Always-available AI assistant scoped to the active project. Context-aware.",
    },
    {
      icon: "⟲",
      name: "Calibration Engine",
      blurb: "Auto-recalibrates dimension weights from every feedback signal you capture.",
    },
    {
      icon: "✺",
      name: "Global Network",
      blurb: "Cross-project talent pool — every candidate becomes a permanent searchable asset.",
    },
  ];
  return (
    <section className="m-section m-section--gap-tight-top m-section--tint-cool">
      <span className="m-section__numeral m-section__numeral--right" aria-hidden>
        07
      </span>
      <div className="m-container">
        <Reveal className="m-reveal">
          <span className="m-eyebrow">07 / Modules</span>
          <h2 className="m-h2" style={{ marginTop: "1rem", maxWidth: "26ch" }}>
            Six modules that <em>change how the work feels.</em>
          </h2>
        </Reveal>

        <Reveal className="m-reveal-stagger" as="ul" threshold={0.05}>
          <ul
            style={{
              listStyle: "none",
              padding: 0,
              marginTop: "3rem",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: "1.25rem",
            }}
          >
            {cards.map((c) => (
              <li key={c.name} className="m-card m-feature-card">
                <div
                  className="m-feature-card__icon"
                  style={{
                    fontSize: "1.75rem",
                    color: "var(--accent)",
                    marginBottom: "0.875rem",
                    lineHeight: 1,
                  }}
                  aria-hidden
                >
                  {c.icon}
                </div>
                <h3
                  className="m-h3"
                  style={{ marginBottom: "0.5rem" }}
                >
                  {c.name}
                </h3>
                <p
                  style={{
                    color: "var(--fg-soft)",
                    fontSize: "0.9375rem",
                    lineHeight: 1.55,
                  }}
                >
                  {c.blurb}
                </p>
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────
// 8. PRICING
// ────────────────────────────────────────────────────────────────────

function Pricing() {
  const tiers = [
    {
      name: "Starter",
      price: "399",
      cadence: "/mo",
      headline: "1 user, 3 active searches",
      points: [
        "All 14 AI agents",
        "Full intelligence stack",
        "30-day evaluation history",
        "Email support",
      ],
      featured: false,
    },
    {
      name: "Growth",
      price: "999",
      cadence: "/mo",
      headline: "5 users, 10 active searches",
      points: [
        "Everything in Starter",
        "Hiring Manager Portal",
        "Triangulation reports",
        "Calibration history + restore",
        "Priority support",
      ],
      featured: true,
    },
    {
      name: "Agency",
      price: "1,899",
      cadence: "/mo",
      headline: "Unlimited users + searches",
      points: [
        "Everything in Growth",
        "Global Executive Network",
        "Custom skills + agents",
        "Dedicated success partner",
        "SLA + onboarding workshop",
      ],
      featured: false,
    },
    {
      // Priced on enquiry rather than listed. EI carries a materially
      // different cost profile per search, and the number is not set.
      name: "Executive Intelligence",
      price: null,
      priceLabel: "Contact sales",
      cadence: "",
      headline: "Add-on to any plan",
      points: [
        "Gated diligence chain",
        "Versioned success profiles",
        "Per-candidate interview plans",
        "Immutable approved records",
        "Append-only audit trail",
      ],
      featured: false,
    },
  ];
  return (
    <section id="pricing" className="m-section m-section--gap-tight-bottom">
      <span className="m-section__numeral" aria-hidden>
        08
      </span>
      <div className="m-container">
        <Reveal className="m-reveal">
          <span className="m-eyebrow">08 / Pricing</span>
          <h2 className="m-h2" style={{ marginTop: "1rem", maxWidth: "22ch" }}>
            Pricing that <em>scales with the practice.</em>
          </h2>
          <p
            className="m-lede"
            style={{ marginTop: "1rem", maxWidth: "60ch" }}
          >
            All plans include the full agent stack. Billed monthly, cancel
            anytime — no annual lock-in.
          </p>
        </Reveal>

        <Reveal className="m-reveal-scale" as="ul" threshold={0.1}>
          <ul
            style={{
              listStyle: "none",
              padding: 0,
              marginTop: "3rem",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: "1.25rem",
              alignItems: "stretch",
            }}
          >
            {tiers.map((t) => (
              <li
                key={t.name}
                className={`m-price ${t.featured ? "m-price--featured" : ""}`}
              >
                {t.featured && (
                  <div
                    style={{
                      position: "absolute",
                      top: "-12px",
                      left: "1.5rem",
                      padding: "0.25rem 0.625rem",
                      background: "var(--accent-fill)",
                      color: "#fff",
                      fontFamily: "var(--font-mono)",
                      fontSize: "0.625rem",
                      letterSpacing: "0.18em",
                      textTransform: "uppercase",
                    }}
                  >
                    <span className="m-price__sparkle">Most popular</span>
                  </div>
                )}
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.25rem",
                  }}
                >
                  <span className="m-mono--label" style={{ color: "var(--accent)" }}>
                    {t.name}
                  </span>
                  <div className="m-price__amount">
                    {t.price ? (
                      <>
                        <sup>$</sup>
                        {t.price}
                        <sub style={{ marginLeft: "0.25rem" }}>{t.cadence}</sub>
                      </>
                    ) : (
                      <span className="m-price__enquiry">{t.priceLabel}</span>
                    )}
                  </div>
                  <p
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "0.75rem",
                      letterSpacing: "0.14em",
                      textTransform: "uppercase",
                      color: "var(--fg-muted)",
                    }}
                  >
                    {t.headline}
                  </p>
                </div>
                <ul
                  style={{
                    listStyle: "none",
                    padding: 0,
                    display: "grid",
                    gap: "0.625rem",
                    flex: 1,
                  }}
                >
                  {t.points.map((p) => (
                    <li
                      key={p}
                      style={{
                        display: "flex",
                        gap: "0.625rem",
                        alignItems: "flex-start",
                        color: "var(--fg-soft)",
                        fontSize: "0.9375rem",
                      }}
                    >
                      <span
                        style={{
                          color: "var(--accent)",
                          fontFamily: "var(--font-mono)",
                          marginTop: 1,
                        }}
                        aria-hidden
                      >
                        ✓
                      </span>
                      {p}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/request-access"
                  className={`m-btn ${t.featured ? "m-btn--primary" : "m-btn--ghost"}`}
                  style={{ width: "100%" }}
                >
                  Request Access
                </Link>
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────
// 9. FAQ
// ────────────────────────────────────────────────────────────────────

const FAQ_ITEMS = [
  {
    q: "Is my client data secure?",
    a: "Every project is org-scoped. Row-level security in Supabase prevents cross-org access at the database layer; we don't rely on application-level filters alone. CV uploads sit in private storage with signed-URL access. We never train models on your data.",
  },
  {
    q: "How is this different from LinkedIn Recruiter?",
    a: "LinkedIn Recruiter is a sourcing surface — find people. Mandate is the operating system around it: intake, calibration, evaluation, feedback interpretation, shortlist generation, submission narratives. The Boolean queries we generate run inside LinkedIn; we don't replace it.",
  },
  {
    q: "Does it source candidates for me?",
    a: "No. It writes the LinkedIn, X-Ray and ATS queries — exact, broad, adjacent and competitor — and you run them. Candidates enter by CV upload. We would rather say that plainly than imply a funnel that does not exist.",
  },
  {
    q: "Who is accountable for a decision?",
    a: "You are. Generation never becomes operational truth — competency weights only take effect when a human approves the profile, and the approving identity is derived from the session, not supplied by the client.",
  },
  {
    q: "Does it replace my judgment as a recruiter?",
    a: "No, and the product is built to prevent it. Nothing produces a hire or no-hire verdict. Every output is decision support, every artifact is reviewed and approved by a person, and the approval is recorded with who did it and when.",
  },
  {
    q: "Can I correct an approved record?",
    a: "You create a new version. The previous one is archived and remains readable. Nothing is overwritten — the database rejects the edit regardless of role, including ours.",
  },
  {
    q: "Why is there no free trial?",
    a: "Access is granted by approval. Every workspace holds real candidate data under real obligations, and we would rather have the conversation first.",
  },
  {
    q: "Does it work for in-house talent teams?",
    a: "Yes. In-house teams use it for confidential and executive hires where the same rigour applies. The pricing is the same — a seat is a seat.",
  },
];

// ────────────────────────────────────────────────────────────────────
// EXECUTIVE INTELLIGENCE — the gated chain
// ────────────────────────────────────────────────────────────────────

/** Each link in the chain. `state` drives the visual treatment. */
const EI_CHAIN: Array<{
  label: string;
  meta: string;
  state: "approved" | "current" | "locked";
}> = [
  { label: "Success profile", meta: "Approved · v3", state: "approved" },
  { label: "Interview plan", meta: "Approved · v2", state: "approved" },
  { label: "Assessment", meta: "Human-authored", state: "current" },
  { label: "Report", meta: "Unlocks on approval", state: "locked" },
];

function ExecutiveIntelligence() {
  return (
    <section
      id="executive-intelligence"
      className="m-section m-section--gap-tight-top m-section--tint-cool"
    >
      <span className="m-section__numeral" aria-hidden>
        07
      </span>
      <div className="m-container">
        <div className="m-ei-grid">
          <Reveal className="m-reveal">
            <span className="m-eyebrow">Executive Intelligence · Add-on</span>
            <h2 className="m-h2" style={{ marginTop: "1rem", maxWidth: "18ch" }}>
              Due diligence that <em>survives the board minute.</em>
            </h2>
            <p className="m-lede" style={{ marginTop: "1.25rem", maxWidth: "58ch" }}>
              A gated chain — success profile, interview plan, assessment —
              where each step requires human approval of the last. Approved
              records are immutable at the database layer. The audit trail is
              append-only. The assessment has no AI in it at all.
            </p>
          </Reveal>

          <Reveal className="m-reveal-scale" threshold={0.15}>
            <ul className="m-chain" aria-label="Executive Intelligence approval chain">
              {EI_CHAIN.map((step) => (
                <li key={step.label} className={`m-chain__step m-chain__step--${step.state}`}>
                  <span className="m-chain__mark" aria-hidden>
                    {step.state === "locked" ? "○" : step.state === "current" ? "●" : "✓"}
                  </span>
                  <span className="m-chain__label">{step.label}</span>
                  <span className="m-chain__meta">{step.meta}</span>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────
// PRINCIPLES — what the system will never do
// ────────────────────────────────────────────────────────────────────

const PRINCIPLES = [
  {
    title: "Decide for you",
    body: "No hire or no-hire verdict is produced anywhere in the product. Every output is decision support, with a human accountable for the call.",
  },
  {
    title: "Profile a person",
    body: "No psychological labels, no protected-characteristic inference, no deception detection, and no audio, video, facial or voice analysis.",
  },
  {
    title: "Rewrite the record",
    body: "Approved artifacts cannot be edited — corrections create a new version and archive the old one. The audit log accepts inserts only.",
  },
];

function Principles() {
  return (
    <section className="m-section m-section--gap-tight-top">
      <span className="m-section__numeral m-section__numeral--right" aria-hidden>
        09
      </span>
      <div className="m-container">
        <Reveal className="m-reveal">
          <span className="m-eyebrow">09 / Guardrails</span>
          <h2 className="m-h2" style={{ marginTop: "1rem", maxWidth: "20ch" }}>
            What the system <em>will never do.</em>
          </h2>
          <p className="m-lede" style={{ marginTop: "1rem", maxWidth: "62ch" }}>
            These are enforced in the prompts, the application and the
            database — not stated as intentions.
          </p>
        </Reveal>

        <Reveal className="m-reveal-stagger" as="ul" threshold={0.1}>
          <ul className="m-principles">
            {PRINCIPLES.map((p) => (
              <li key={p.title} className="m-card m-principle">
                <h3 className="m-principle__title">{p.title}</h3>
                <p className="m-principle__body">{p.body}</p>
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}

function Faq() {
  return (
    <section className="m-section m-section--gap-tight-top m-section--gap-feature-bottom">
      <span className="m-section__numeral m-section__numeral--right" aria-hidden>
        09
      </span>
      <div className="m-container" style={{ maxWidth: 880 }}>
        <Reveal className="m-reveal">
          <span className="m-eyebrow">09 / Questions</span>
          <h2 className="m-h2" style={{ marginTop: "1rem", maxWidth: "22ch" }}>
            Common <em>questions.</em>
          </h2>
        </Reveal>

        <Reveal className="m-reveal" threshold={0.05}>
          <div style={{ marginTop: "2.5rem" }}>
            <FaqAccordion items={FAQ_ITEMS} />
          </div>
        </Reveal>
      </div>
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────
// 10. CTA FOOTER
// ────────────────────────────────────────────────────────────────────

function CtaFooter() {
  return (
    <section
      className="m-section m-section--gap-feature-top"
      style={{
        position: "relative",
        background: "var(--bg-elev-1)",
        borderBlock: "1px solid var(--line)",
      }}
    >
      <span className="m-section__numeral" aria-hidden>
        10
      </span>
      <div className="m-cta-bg" aria-hidden />
      <div className="m-hero-glow" aria-hidden style={{ opacity: 0.5 }} />
      <div
        className="m-container"
        style={{
          position: "relative",
          zIndex: 2,
          textAlign: "center",
          maxWidth: 760,
          display: "grid",
          gap: "1.5rem",
          justifyItems: "center",
        }}
      >
        <Reveal className="m-reveal">
          <span className="m-eyebrow">10 / Get started</span>
        </Reveal>
        <Reveal className="m-reveal">
          <h2 className="m-h2" style={{ maxWidth: "20ch", margin: "0 auto" }}>
            Ready to <em>transform your search practice?</em>
          </h2>
        </Reveal>
        <Reveal className="m-reveal">
          <p
            className="m-lede"
            style={{ margin: "0 auto", textAlign: "center" }}
          >
            Join the waitlist. The first 20 firms get three months free.
          </p>
        </Reveal>
        <Reveal className="m-reveal">
          <div
            style={{
              display: "flex",
              gap: "0.75rem",
              flexWrap: "wrap",
              justifyContent: "center",
            }}
          >
            <Link
              href="/request-access"
              className="m-btn m-btn--primary m-btn--breathe m-btn--gradient-border"
              style={{ padding: "1rem 1.75rem", fontSize: "0.8125rem" }}
            >
              <span>Request Access</span>
              <span aria-hidden>→</span>
            </Link>
            <a
              href="mailto:hello@mandate.ai"
              className="m-btn m-btn--ghost"
              style={{ padding: "1rem 1.5rem" }}
            >
              <span>hello@mandate.ai</span>
            </a>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────
// Footer
// ────────────────────────────────────────────────────────────────────

function Footer() {
  return (
    <footer className="m-footer">
      <div className="m-container">
        {/*
          The imported design has Product / Company / Legal columns
          pointing at eleven separate pages. Only the on-page anchors
          and the auth routes exist today, so the structure is kept but
          every link resolves — no 404s shipped to look fuller.
        */}
        <div className="m-footer__cols">
          <div className="m-footer__brand">
            <div className="m-footer__mark" aria-hidden />
            <span className="m-footer__wordmark">Mandate</span>
            <p className="m-footer__blurb">
              An AI operating system for executive search.
            </p>
          </div>

          <nav className="m-footer__col" aria-label="Product">
            <h2 className="m-footer__heading">Product</h2>
            <a href="#how" className="m-footer__link">Platform</a>
            <a href="#executive-intelligence" className="m-footer__link">
              Executive Intelligence
            </a>
            <a href="#simulator" className="m-footer__link">Live demo</a>
            <a href="#pricing" className="m-footer__link">Pricing</a>
          </nav>

          <nav className="m-footer__col" aria-label="Access">
            <h2 className="m-footer__heading">Access</h2>
            <Link href="/request-access" className="m-footer__link">
              Request access
            </Link>
            <Link href="/auth/signin" className="m-footer__link">Log in</Link>
            <a href="mailto:hello@mandate.ai" className="m-footer__link">
              hello@mandate.ai
            </a>
            <a
              href="https://www.linkedin.com"
              target="_blank"
              rel="noreferrer"
              className="m-footer__link"
            >
              LinkedIn
            </a>
          </nav>
        </div>

        <div className="m-footer__base">
          <span>© 2026 Mandate · Closed Beta</span>
        </div>
      </div>
    </footer>
  );
}
