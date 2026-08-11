import Link from "next/link";
import { Reveal } from "./_components/reveal";
import { LiveSimulator } from "./_components/live-simulator";
import { FaqAccordion } from "./_components/faq-accordion";
import { ThreeCircleAlignment } from "./_components/three-circle-alignment";
import { CountUp } from "./_components/count-up";
import { ScrollProgress } from "./_components/scroll-progress";
import { TerminalCursor } from "./_components/terminal-cursor";
import { TypewriterReveal } from "./_components/typewriter-reveal";
import { MobileNav } from "./_components/mobile-nav";
import {
  AGENT_COUNT,
  DIMENSION_COUNT,
  MODULE_COUNT,
  PERSPECTIVE_COUNT,
  SECTIONS,
  eyebrow,
} from "./_constants";

export const dynamic = "force-static";

export default function MarketingLandingPage() {
  return (
    <>
      {/* First focusable element on the page. Without it, a keyboard or
          screen-reader user had no route past the nav on a document
          this long, and there was no <main> landmark to jump to. */}
      <a href="#main" className="m-skip">
        Skip to content
      </a>
      <ScrollProgress />
      <TopNav />
      <main id="main">
        <Hero />
        {/*
          Section count cut 13 → 11. StatsTicker duplicated the agent
          pipeline that HowItWorks now states explicitly, and Features
          restated Triangulation and HowItWorks in weaker form. Both
          components are retained below but no longer rendered.
        */}
        <Problem />
        <Simulator />
        {/*
          Principles moved up from position 07. The sections that spend
          credibility (a quantified manual-effort claim, an absolute
          competitive claim, sample scores animated like live readouts)
          were all being read BEFORE the sections that earn it — so by
          the time a search principal reached "what the system will
          never do", they had already discounted the page. Guardrails
          now land while the simulator output is still on screen.
        */}
        <Principles />
        <HowItWorks />
        <Stack />
        <Triangulation />
        <ExecutiveIntelligence />
        <Pricing />
        <Faq />
        <CtaFooter />
      </main>
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

        {/* Replaces the desktop link row below 1120px, where it is
            display:none and previously had no substitute. */}
        <MobileNav />
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
      <span className="m-section__numeral" aria-hidden>
        {SECTIONS.hero.numeral}
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
          {`${AGENT_COUNT}_SPECIALIST_AGENTS · ONE_ACCOUNTABLE_HUMAN`}
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
    { label: "AGENTS", to: AGENT_COUNT },
    // Was a hardcoded 31 against prose that says twelve — the rail now
    // reads from the same constant as the Stack section.
    { label: "MODULES", to: MODULE_COUNT },
    { label: "DIMENSIONS", to: DIMENSION_COUNT },
    { label: "PERSPECTIVES", to: PERSPECTIVE_COUNT },
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
              // 0.625rem = 10px, below the legibility floor for
              // functional text. At 0.2em tracking these labels are the
              // smallest type on the page and they carry the data's
              // meaning, so they cannot be texture.
              fontSize: "0.6875rem",
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


// ────────────────────────────────────────────────────────────────────
// 2. PROBLEM
// ────────────────────────────────────────────────────────────────────

function Problem() {
  return (
    <section className="m-section m-section--gap-tight-top m-section--tint-cool">
      <span className="m-section__numeral m-section__numeral--right" aria-hidden>
        {SECTIONS.problem.numeral}
      </span>
      <div className="m-container">
        <div className="m-problem">
          <Reveal className="m-reveal">
            <span className="m-eyebrow">{eyebrow(SECTIONS.problem)}</span>
            <h2 className="m-h2" style={{ marginTop: "1rem" }}>
              Executive search is judgment work performed{" "}
              <em>under bad conditions.</em>
            </h2>
          </Reveal>

          <Reveal className="m-reveal" threshold={0.15}>
            <div className="m-problem__body">
              <p className="m-lede">
                Dozens of CVs. A hiring manager whose stated requirements
                drift from their revealed preferences. No consistent scoring.
                No audit trail. Decisions get made on recency and charisma,
                then rationalised afterwards.
              </p>
              <blockquote className="m-pullquote">
                <span>From a slate you defend in the room —</span>
                <strong>to a slate that defends itself in the minutes.</strong>
              </blockquote>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────
// 3. LIVE SIMULATOR
// ────────────────────────────────────────────────────────────────────

function Simulator() {
  // The lone inline `scrollMarginTop: 2rem` that used to sit on this
  // section is gone — 32px against a 73px nav under-corrected even on
  // the one section that had it. `scroll-padding-top` on the scrolling
  // element now covers every anchor on the page.
  return (
    <section
      id="simulator"
      className="m-section m-section--gap-tight-bottom"
    >
      <span className="m-section__numeral m-section__numeral--right" aria-hidden>
        {SECTIONS.simulator.numeral}
      </span>
      <div className="m-container">
        <Reveal className="m-reveal">
          <span className="m-eyebrow">
            <span className="m-sim__live">
              <span className="m-sim__live-dot" />
              <span>LIVE DEMO</span>
            </span>
            <span aria-hidden>·</span>
            {eyebrow(SECTIONS.simulator)}
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
            {/* Dropped "Manually, the same decomposition takes a senior
                recruiter three days." The buyer IS that recruiter and
                knows the real figure, so an inflated one discredited
                every claim after it — and it was the page's first
                quantified statement, in its most authoritative-looking
                container. 30 seconds is verifiable and stands alone. */}
            This is what Mandate does in 30 seconds.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────
// 4. HOW IT WORKS
// ────────────────────────────────────────────────────────────────────

const HOW_STEPS = [
  {
    n: "01",
    title: "Decompose",
    body: "One line becomes a structured mandate and a grounded company picture — the estate, the history, the constraints nobody put in the brief.",
  },
  {
    n: "02",
    title: "Calibrate",
    body: "A structured intake produces weighted dimensions, must-haves and anti-patterns. You edit them. You approve them. Only then do they count.",
  },
  {
    n: "03",
    title: "Evaluate",
    body: "Every CV is parsed, scored against the approved model and placed in a tier — with the evidence behind each dimension shown next to the number.",
  },
  {
    n: "04",
    title: "Defend",
    body: "The shortlist carries its trade-offs. Client feedback recalibrates the model and re-ranks the field, and the change is versioned.",
  },
];

/** The pipeline, stated once. Calibration is highlighted because it is
 *  the step the whole product argument turns on. */
const PIPELINE = [
  "Mandate", "Spec", "Calibration", "Sourcing",
  "Evaluation", "Ranking", "Shortlist", "Feedback", "Recalibrate",
];

function HowItWorks() {
  return (
    <section id="how" className="m-section m-section--gap-tight-top">
      <span className="m-section__numeral" aria-hidden>
        {SECTIONS.howItWorks.numeral}
      </span>
      <div className="m-container">
        <Reveal className="m-reveal">
          <span className="m-eyebrow">{eyebrow(SECTIONS.howItWorks)}</span>
          <h2 className="m-h2" style={{ marginTop: "1rem", maxWidth: "20ch" }}>
            Calibration <em>before evaluation.</em>
          </h2>
          <p className="m-lede" style={{ marginTop: "1rem", maxWidth: "62ch" }}>
            The bar is set and approved before the faces appear. Everything
            downstream scores against the same model, and the model is
            versioned.
          </p>
        </Reveal>

        {/* Reveal IS the <ol> — it used to wrap one, which made the
            stagger target a single child so the 50ms per-item delays
            never fired. */}
        <Reveal className="m-reveal-stagger m-steps" as="ol" threshold={0.1}>
          {HOW_STEPS.map((s) => (
            <li key={s.n} className="m-card m-step">
              <span className="m-step__n" aria-hidden>{s.n}</span>
              <h3 className="m-step__title">{s.title}</h3>
              <p className="m-step__body">{s.body}</p>
            </li>
          ))}
        </Reveal>

        <Reveal className="m-reveal" threshold={0.2}>
          <ol className="m-pipeline-row" aria-label="Search pipeline">
            {PIPELINE.map((label, i) => (
              <li
                key={label}
                className={
                  label === "Calibration"
                    ? "m-pipeline-row__item m-pipeline-row__item--key"
                    : "m-pipeline-row__item"
                }
              >
                {label}
                {i < PIPELINE.length - 1 && (
                  <span className="m-pipeline-row__arrow" aria-hidden>›</span>
                )}
              </li>
            ))}
          </ol>
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
        "Working-Style Signals",
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
        {SECTIONS.stack.numeral}
      </span>
      <div className="m-container">
        <Reveal className="m-reveal">
          <span className="m-eyebrow">{eyebrow(SECTIONS.stack)}</span>
          <h2 className="m-h2" style={{ marginTop: "1rem", maxWidth: "24ch" }}>
            The complete <em>intelligence stack.</em>
          </h2>
          <p
            className="m-lede"
            style={{ marginTop: "1.25rem", maxWidth: "60ch" }}
          >
            {/* The trailing space belongs INSIDE the literal. JSX strips
                whitespace containing a newline between an expression
                container and an adjacent text node, so without it this
                rendered as "intelligence layers.Every layer reads". */}
            {`${MODULE_COUNT} specialised modules across three intelligence layers. `}
            Every layer reads from the others — the system gets sharper
            the more you feed it.
          </p>
        </Reveal>

        {/* Grid on the Reveal itself, so the stagger's per-child delays
            reach the three cards rather than a single wrapper div. */}
        <Reveal
          className="m-reveal-stagger"
          as="div"
          threshold={0.1}
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
        {SECTIONS.triangulation.numeral}
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
            <span className="m-eyebrow">{eyebrow(SECTIONS.triangulation)}</span>
            <h2
              className="m-h2"
              style={{ marginTop: "1rem", maxWidth: "22ch" }}
            >
              {/* Was "The feature no other platform has." — an absolute,
                  undated, unscoped competitive claim from a product
                  wearing a BETA chip. Describing the capability is
                  stronger with a skeptic and cannot be falsified by a
                  competitor's release note. */}
              Three-way alignment, <em>scored and evidenced.</em>
            </h2>
            <p
              className="m-lede"
              style={{ marginTop: "1.25rem" }}
            >
              Mandate cross-references candidate working-style signals, company
              culture, and hiring-manager preferences to produce a
              three-way alignment score — with anticipated objections
              and prepared responses.
            </p>

            {/* Say what these numbers are. Unlabelled score bars beneath
                a claim about defensible scoring read as evidence, and a
                search principal will correctly identify them as a
                mockup — which discredits the claim they sit under. */}
            <p
              style={{
                marginTop: "2rem",
                marginBottom: "0.75rem",
                fontFamily: "var(--font-mono)",
                fontSize: "0.6875rem",
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: "var(--fg-muted)",
              }}
            >
              Illustrative shape of the output — not live data
            </p>
            <ul
              style={{
                listStyle: "none",
                padding: 0,
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
                    {/* Was <CountUp>, which ticked these up like a live
                        telemetry readout. They are illustrative values,
                        and animating them as though they were being
                        computed is the one thing a page arguing for
                        auditable numbers must not do. */}
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
        `All ${AGENT_COUNT} AI agents`,
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
        {SECTIONS.pricing.numeral}
      </span>
      <div className="m-container">
        <Reveal className="m-reveal">
          <span className="m-eyebrow">{eyebrow(SECTIONS.pricing)}</span>
          <h2 className="m-h2" style={{ marginTop: "1rem", maxWidth: "22ch" }}>
            Pricing that <em>scales with the practice.</em>
          </h2>
          <p
            className="m-lede"
            style={{ marginTop: "1rem", maxWidth: "60ch" }}
          >
            {/* Was "Billed monthly, cancel anytime — no annual lock-in",
                which implied a self-serve subscription the hero explicitly
                denies. One commercial story: approval first, then billing. */}
            All plans include the full agent stack, billed monthly. Billing
            begins once your workspace is approved — there is no self-serve
            signup.
          </p>
        </Reveal>

        {/* The grid lives on the Reveal itself. Wrapping a styled <ul>
            in <Reveal as="ul"> produced invalid ul > ul and left the
            scale-stagger with one child. Also fixes the 4th tier
            orphaning alone onto row two around 1152px: auto-fit at
            minmax(280px) yielded 3 columns there, so the track count is
            now explicit per breakpoint via .m-price-grid. */}
        <Reveal
          className="m-reveal-scale m-price-grid"
          as="ul"
          threshold={0.1}
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
                    {/* Was "✦ Most popular ✦". The product has zero
                        customers and the page carries no social proof by
                        policy — an unsubstantiated popularity claim
                        attached to the money undercut everything honest
                        around it. Replaced with a factual differentiator. */}
                    <span>Includes the HM Portal</span>
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
        {SECTIONS.executiveIntelligence.numeral}
      </span>
      <div className="m-container">
        <div className="m-ei-grid">
          <Reveal className="m-reveal">
            <span className="m-eyebrow">{eyebrow(SECTIONS.executiveIntelligence)}</span>
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

          {/* The chain IS the reveal target — the four steps stagger in
              sequence, which is the whole point of a chain that gates on
              approval. Wrapping the <ul> gave the scale-stagger one
              child, so all four appeared at once. */}
          <Reveal
            className="m-reveal-scale m-chain"
            as="ul"
            threshold={0.15}
            aria-label="Executive Intelligence approval chain"
          >
            {EI_CHAIN.map((step) => (
              <li key={step.label} className={`m-chain__step m-chain__step--${step.state}`}>
                <span className="m-chain__mark" aria-hidden>
                  {step.state === "locked" ? "○" : step.state === "current" ? "●" : "✓"}
                </span>
                <span className="m-chain__label">{step.label}</span>
                <span className="m-chain__meta">{step.meta}</span>
              </li>
            ))}
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
    title: "Never decides for you",
    body: "No hire or no-hire verdict is produced anywhere in the product. Every output is decision support, with a human accountable for the call.",
  },
  {
    title: "Never profiles a person",
    body: "No psychological labels, no protected-characteristic inference, no deception detection, and no audio, video, facial or voice analysis.",
  },
  {
    title: "Never rewrites the record",
    body: "Approved artifacts cannot be edited — corrections create a new version and archive the old one. The audit log accepts inserts only.",
  },
];

function Principles() {
  // gap-tight-bottom pairs with HowItWorks' gap-tight-top below — the
  // modifiers are applied in pairs, upper --bottom + lower --top. The
  // numeral flips left so the move does not leave three right-aligned
  // watermarks in a row.
  return (
    <section className="m-section m-section--gap-tight-top m-section--gap-tight-bottom">
      <span className="m-section__numeral" aria-hidden>
        {SECTIONS.principles.numeral}
      </span>
      <div className="m-container">
        <Reveal className="m-reveal">
          <span className="m-eyebrow">{eyebrow(SECTIONS.principles)}</span>
          <h2 className="m-h2" style={{ marginTop: "1rem", maxWidth: "20ch" }}>
            What the system <em>will never do.</em>
          </h2>
          <p className="m-lede" style={{ marginTop: "1rem", maxWidth: "62ch" }}>
            These are enforced in the prompts, the application and the
            database — not stated as intentions.
          </p>
        </Reveal>

        <Reveal
          className="m-reveal-stagger m-principles"
          as="ul"
          threshold={0.1}
        >
          {PRINCIPLES.map((p) => (
            <li key={p.title} className="m-card m-principle">
              <h3 className="m-principle__title">{p.title}</h3>
              <p className="m-principle__body">{p.body}</p>
            </li>
          ))}
        </Reveal>
      </div>
    </section>
  );
}

function Faq() {
  return (
    <section className="m-section m-section--gap-tight-top m-section--gap-feature-bottom">
      <span className="m-section__numeral m-section__numeral--right" aria-hidden>
        {SECTIONS.faq.numeral}
      </span>
      <div className="m-container" style={{ maxWidth: 880 }}>
        <Reveal className="m-reveal">
          <span className="m-eyebrow">{eyebrow(SECTIONS.faq)}</span>
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
        {SECTIONS.cta.numeral}
      </span>
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
          <span className="m-eyebrow">{eyebrow(SECTIONS.cta)}</span>
        </Reveal>
        <Reveal className="m-reveal">
          <h2 className="m-h2" style={{ maxWidth: "20ch", margin: "0 auto" }}>
            Set the bar <em>before you see the faces.</em>
          </h2>
        </Reveal>
        <Reveal className="m-reveal">
          <p
            className="m-lede"
            style={{ margin: "0 auto", textAlign: "center" }}
          >
            {/* Was "Join the waitlist. The first 20 firms get three months
                free." — an unsubstantiated scarcity offer that reads as a
                growth-hack tell to this buyer, and a third commercial story.
                Replaced with what actually happens after the click, which is
                the reassurance this moment was missing entirely. */}
            Tell us the mandate you are running now. A founder reads every
            request and replies within 48 hours, and we will walk a live
            search through with you before anything is billed.
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
              /* m-btn--gradient-border rotated an unclipped conic-gradient
                 pseudo-element (inset:-2px, border-radius:inherit=0), so a
                 diagonal cyan slab swept across the final CTA, its label and
                 the secondary button — the last thing a visitor saw looked
                 like a rendering fault. m-btn--breathe stacked a 56px pulsing
                 glow on top, on a brief that rejects neon glow. Both removed. */
              className="m-btn m-btn--primary"
              style={{ padding: "1rem 1.75rem", fontSize: "0.8125rem" }}
            >
              <span>Request Access</span>
              <span aria-hidden>→</span>
            </Link>
            <a
              href="mailto:hello@getmandate.io"
              className="m-btn m-btn--ghost"
              style={{ padding: "1rem 1.5rem" }}
            >
              <span>hello@getmandate.io</span>
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
            <h3 className="m-footer__heading">Product</h3>
            <a href="#how" className="m-footer__link">Platform</a>
            <a href="#executive-intelligence" className="m-footer__link">
              Executive Intelligence
            </a>
            <a href="#simulator" className="m-footer__link">Live demo</a>
            <a href="#pricing" className="m-footer__link">Pricing</a>
          </nav>

          <nav className="m-footer__col" aria-label="Access">
            <h3 className="m-footer__heading">Access</h3>
            <Link href="/request-access" className="m-footer__link">
              Request access
            </Link>
            <Link href="/auth/signin" className="m-footer__link">Log in</Link>
            <a href="mailto:hello@getmandate.io" className="m-footer__link">
              hello@getmandate.io
            </a>
            <a
              href="https://www.linkedin.com/company/getmandate"
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
