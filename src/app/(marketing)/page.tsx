import Link from "next/link";
import { Reveal } from "./_components/reveal";
import { LiveSimulator } from "./_components/live-simulator";
import { FaqAccordion } from "./_components/faq-accordion";
import { ThreeCircleAlignment } from "./_components/three-circle-alignment";

export const dynamic = "force-static";

export default function MarketingLandingPage() {
  return (
    <>
      <TopNav />
      <Hero />
      <StatsTicker />
      <Problem />
      <Simulator />
      <HowItWorks />
      <Stack />
      <Triangulation />
      <Features />
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
        </Link>

        <nav className="m-nav__actions" aria-label="Primary">
          <Link
            href="/auth/signin"
            className="m-btn m-btn--ghost"
            style={{ padding: "0.625rem 1rem" }}
          >
            Log In
          </Link>
          <Link
            href="/request-access"
            className="m-btn m-btn--primary"
            style={{ padding: "0.625rem 1rem" }}
          >
            Request Access
          </Link>
        </nav>
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
      className="m-section"
      style={{ position: "relative", paddingTop: "clamp(3rem, 6vw, 5rem)" }}
    >
      <div className="m-hero-glow" aria-hidden />
      <div className="m-hero-scan" aria-hidden />
      <div
        className="m-container m-hero-enter"
        style={{
          position: "relative",
          zIndex: 2,
          display: "grid",
          gap: "1.75rem",
          maxWidth: 980,
          margin: "0 auto",
          textAlign: "center",
          paddingBlock: "clamp(2rem, 6vw, 4rem)",
        }}
      >
        <span
          className="m-eyebrow"
          style={{ justifySelf: "center" }}
        >
          <span style={{ color: "var(--accent)" }}>●</span>{" "}
          14_AGENTS · 31_MODULES · ONE_OPERATING_SYSTEM
        </span>

        <h1 className="m-display">
          Executive Search.
          <br />
          <em>Reinvented.</em>
        </h1>

        <p
          className="m-lede"
          style={{
            margin: "0 auto",
            fontSize: "clamp(1.0625rem, 1.5vw, 1.25rem)",
          }}
        >
          The AI Operating System that takes you from one-line brief to
          shortlist submission — with 14 intelligent agents working in
          parallel, calibrating to your judgment as the search unfolds.
        </p>

        <div
          style={{
            display: "flex",
            gap: "0.75rem",
            justifyContent: "center",
            flexWrap: "wrap",
            marginTop: "0.5rem",
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
            <span>See It In Action</span>
            <span aria-hidden>↓</span>
          </a>
        </div>

        <HeroDataRail />
      </div>
    </section>
  );
}

function HeroDataRail() {
  // Six "live readouts" under the CTA — give the page that
  // trading-floor-screen feel without being noisy. Static numbers, but
  // monospace tabular feel them in.
  const items = [
    { label: "AGENTS", value: "14" },
    { label: "MODULES", value: "31" },
    { label: "DIMENSIONS", value: "5" },
    { label: "PERSPECTIVES", value: "4" },
    { label: "INTELLIGENCE", value: "3-WAY" },
    { label: "CALIBRATION", value: "AUTO" },
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
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "1.25rem",
              color: "var(--accent)",
              letterSpacing: "0.04em",
            }}
          >
            {it.value}
          </span>
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
  const cards = [
    {
      stat: "3–5 days",
      title: "to brief a search properly",
      detail:
        "Every recruiter starts from scratch — fragmented intake calls, scattered notes, inconsistent calibration. The first week is gone before sourcing begins.",
      accent: "var(--accent)",
    },
    {
      stat: "67%",
      title: "evaluation drift across team",
      detail:
        "Two recruiters look at the same CV and rank it differently. Without a shared scoring model, decisions flip with whoever ran the screen call.",
      accent: "var(--warn)",
    },
    {
      stat: "12+ tools",
      title: "with feedback in every one",
      detail:
        "Email threads, ATS notes, Slack DMs, Zoom recordings, recruiter scribbles. The signal that matters is in the inbox, not the system.",
      accent: "var(--critical)",
    },
  ];
  return (
    <section className="m-section">
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
                className="m-card"
                style={{
                  borderTop: `2px solid ${c.accent}`,
                }}
              >
                <div
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: "clamp(2.25rem, 4vw, 3rem)",
                    fontVariationSettings: "\"opsz\" 144",
                    fontWeight: 380,
                    color: c.accent,
                    letterSpacing: "-0.02em",
                    lineHeight: 1,
                    marginBottom: "0.75rem",
                  }}
                >
                  {c.stat}
                </div>
                <h3 className="m-h3" style={{ marginBottom: "0.625rem" }}>
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
      className="m-section"
      style={{ scrollMarginTop: "2rem" }}
    >
      <div className="m-container">
        <Reveal className="m-reveal">
          <span className="m-eyebrow">03 / Live</span>
          <h2 className="m-h2" style={{ marginTop: "1rem", maxWidth: "20ch" }}>
            Type any role.{" "}
            <em>Watch Mandate think.</em>
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
    <section id="how" className="m-section">
      <div className="m-container">
        <Reveal className="m-reveal">
          <span className="m-eyebrow">04 / Pipeline</span>
          <h2 className="m-h2" style={{ marginTop: "1rem", maxWidth: "24ch" }}>
            Five steps. <em>Every search runs the same shape.</em>
          </h2>
        </Reveal>

        <Reveal className="m-reveal" threshold={0.05}>
          <div className="m-pipeline" style={{ marginTop: "2.5rem" }}>
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
    <section className="m-section">
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
              <div key={col.title} className="m-card">
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
                  {col.items.map((it) => (
                    <li key={it} className="m-chip">
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
      className="m-section m-triangulation"
      style={{ paddingBlock: "clamp(5rem, 10vw, 8rem)" }}
    >
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
                {
                  k: "Candidate ↔ Company",
                  v: 91,
                  c: "#22c55e",
                },
                {
                  k: "Candidate ↔ HM",
                  v: 83,
                  c: "#f59e0b",
                },
                {
                  k: "Overall alignment",
                  v: 87,
                  c: "var(--accent)",
                },
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
                    }}
                  >
                    {s.v}
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
    <section className="m-section">
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
              <li key={c.name} className="m-card">
                <div
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
      price: "299",
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
      price: "799",
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
      price: "1,499",
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
  ];
  return (
    <section id="pricing" className="m-section">
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
            All plans include all 14 AI agents and the full intelligence
            stack. Save 20% with annual billing.
          </p>
        </Reveal>

        <Reveal className="m-reveal-stagger" as="ul" threshold={0.1}>
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
                      background: "var(--accent)",
                      color: "#fff",
                      fontFamily: "var(--font-mono)",
                      fontSize: "0.625rem",
                      letterSpacing: "0.18em",
                      textTransform: "uppercase",
                    }}
                  >
                    Most popular
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
                    <sup>£</sup>
                    {t.price}
                    <sub style={{ marginLeft: "0.25rem" }}>{t.cadence}</sub>
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
    q: "Does it replace my judgment as a recruiter?",
    a: "No — and we're explicit about it. Every AI assessment ships with a confidence score, a recruiter-flag affordance, and an override layer. The system is calibrated to make your judgment more visible and consistent across a search, not to replace it.",
  },
  {
    q: "How long does onboarding take?",
    a: "First search live in 30 minutes. We import your existing candidate data on Growth + Agency plans. The Calibration Engine adapts to your tier-1/tier-2 patterns within ~10 candidate evaluations, so the system feels native by week two.",
  },
  {
    q: "Can I use it for contingency and retained search?",
    a: "Yes. The HM Portal and shortlist narrative work especially well for retained mandates where the relationship matters. Contingency teams use the Boolean engine + ranking + global network most heavily.",
  },
  {
    q: "Does it work for in-house talent teams?",
    a: "Yes. In-house teams use it for confidential / executive hires where the same rigour applies. Pricing for in-house is the same — search seats are search seats.",
  },
  {
    q: "What happens to my data if I cancel?",
    a: "You get a full export of every project, candidate, score, and feedback history as JSON + CSV. Active data is removed within 30 days; backups roll off within 90 days per our standard retention policy.",
  },
  {
    q: "Can I try it before committing?",
    a: "Yes — the simulator above is unauthenticated and uses the production Intake Agent. For a full hands-on, request access and we'll set you up with a 14-day evaluation on a sample search.",
  },
];

function Faq() {
  return (
    <section className="m-section">
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
      className="m-section"
      style={{
        position: "relative",
        background: "var(--bg-elev-1)",
        borderBlock: "1px solid var(--line)",
      }}
    >
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
              className="m-btn m-btn--primary"
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
      <div
        className="m-container"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "1rem",
          fontFamily: "var(--font-mono)",
          fontSize: "0.6875rem",
          letterSpacing: "0.16em",
          textTransform: "uppercase",
        }}
      >
        <span>© 2026 Mandate · Closed Beta</span>
        <div style={{ display: "flex", gap: "1.25rem" }}>
          <a
            href="https://www.linkedin.com"
            target="_blank"
            rel="noreferrer"
            className="m-link"
            aria-label="LinkedIn"
          >
            LinkedIn
          </a>
          <a href="mailto:hello@mandate.ai" className="m-link">
            hello@mandate.ai
          </a>
          <Link href="/auth/signin" className="m-link">
            Sign in
          </Link>
        </div>
      </div>
    </footer>
  );
}
