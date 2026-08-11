import type { Metadata } from "next";
import { SiteNav } from "../_components/site-nav";
import { SiteFooter } from "../_components/site-footer";
import { PageHero, PageCta } from "../_components/page-hero";
import { Reveal } from "../_components/reveal";
import { tier } from "../_data/pricing";

export const dynamic = "force-static";

const TITLE = "Executive Intelligence";
const DESCRIPTION =
  "A gated diligence chain for executive hires: versioned success profiles, per-candidate interview plans, human-authored assessment, and a report compiled only from approved records.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/executive-intelligence" },
  openGraph: {
    title: `${TITLE} · Mandate`,
    description: DESCRIPTION,
    url: "/executive-intelligence",
    siteName: "Mandate",
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: `${TITLE} · Mandate` }],
  },
  twitter: {
    card: "summary_large_image",
    title: `${TITLE} · Mandate`,
    description: DESCRIPTION,
    images: ["/og.png"],
  },
};

export default function ExecutiveIntelligencePage() {
  return (
    <>
      <SiteNav active="executive-intelligence" />
      <main id="main">
        <PageHero
          label="Enterprise add-on"
          heading={
            <>
              Structured, auditable <em>executive due diligence.</em>
            </>
          }
          lede={
            <>
              One question, answered with evidence: has this person{" "}
              <em>demonstrated</em> the judgment, leadership and operating
              scale this role requires — not did they interview well.
            </>
          }
          actions={[
            {
              href: "mailto:hello@getmandate.io",
              label: "Contact sales",
              primary: true,
            },
            { href: "#chain", label: "See how the chain works" },
          ]}
        />

        <Chain />
        <Guarantees />
        <NotAScore />

        <PageCta
          heading={<>Priced by engagement, not by seat.</>}
          body="Executive Intelligence is an enterprise add-on to any plan. Tell us how your firm runs diligence and we will scope it with you."
          action={{ href: "mailto:hello@getmandate.io", label: "Contact sales" }}
        />
      </main>
      <SiteFooter />
    </>
  );
}

// ────────────────────────────────────────────────────────────────────
// The gated chain
// ────────────────────────────────────────────────────────────────────

const CHAIN = [
  {
    title: "Executive search",
    meta: "Intake + company context",
    body: "Twenty-two intake fields across company, role and mandate, plus a web-grounded company picture. Nothing downstream can start until this is in place.",
  },
  {
    title: "Success profile",
    meta: "AI-drafted · human-approved",
    body: "Mission, outcomes, capabilities, operating scale, derailers, non-negotiable gaps and weighted competencies. Generation changes nothing — the weights become operational only when a human approves them.",
  },
  {
    title: "Interview plan",
    meta: "Per candidate · versioned",
    body: "Stages with objectives, interviewer roles, assigned competencies, questions, evidence to listen for and weak-answer indicators. Competency coverage is computed by the application, not claimed by the model.",
  },
  {
    title: "Assessment",
    meta: "No AI on this step",
    human: true,
    body: "The interviewer records the evidence themselves — free text per competency and one of four levels: strong, moderate, limited, or no evidence observed. Nothing is drafted for them.",
  },
  {
    title: "Report",
    meta: "Compiled from approved records",
    body: "One document, assembled only from artifacts that were approved — with a section dedicated to where the evidence is thin.",
  },
] as const;

function Chain() {
  return (
    <section
      id="chain"
      className="m-section m-section--gap-tight-top m-section--tint-cool"
    >
      <div className="m-container">
        <Reveal className="m-reveal">
          <div className="m-sechead">
            <span className="m-eyebrow">The gated chain</span>
            <h2 className="m-h2">
              Each step requires human approval of the last
            </h2>
            <p className="m-sechead__body">
              These are not interface conventions. Every gate is a database
              constraint, and every approval is irreversible in place.
            </p>
          </div>
        </Reveal>

        <Reveal className="m-reveal m-chainrows" as="ol" threshold={0.1}>
          {CHAIN.map((step, i) => (
            <li
              key={step.title}
              className={`m-chainrow ${"human" in step && step.human ? "m-chainrow--human" : ""}`}
            >
              <span className="m-chainrow__n" aria-hidden>
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="m-chainrow__id">
                <h3 className="m-chainrow__title">{step.title}</h3>
                {/* The human-only step is marked by a border, a position
                    in the sequence AND this label — never by colour on
                    its own, which a third of readers would not receive. */}
                <p
                  className={`m-chainrow__meta ${
                    "human" in step && step.human ? "m-chainrow__meta--flag" : ""
                  }`}
                >
                  {step.meta}
                </p>
              </div>
              <p className="m-chainrow__body">{step.body}</p>
            </li>
          ))}
        </Reveal>
      </div>
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────
// Why it holds up
// ────────────────────────────────────────────────────────────────────

const GUARANTEES = [
  {
    title: "Approved records are immutable",
    body: "A database trigger rejects any edit to an approved record — for every role, including the service account. Corrections create a new version and archive the old one.",
  },
  {
    title: "Approval identity cannot be forged",
    body: "The approving user is derived from the session inside a database function. The client never supplies it.",
  },
  {
    title: "The audit trail is append-only",
    body: "Twenty-three defined event types. No update, no delete. What happened stays on the record.",
  },
  {
    title: "The application computes the facts",
    body: "Competency coverage and evidence strength are calculated server-side from approved data on every save. The agent proposes wording; it cannot influence the numbers.",
  },
] as const;

function Guarantees() {
  return (
    <section className="m-section m-section--gap-tight-top">
      <div className="m-container">
        <Reveal className="m-reveal">
          <div className="m-sechead">
            <h2 className="m-h2" style={{ maxWidth: "22ch" }}>
              Why it holds up under scrutiny
            </h2>
          </div>
        </Reveal>

        <Reveal className="m-reveal m-guarantees" as="ul" threshold={0.1}>
          {GUARANTEES.map((g) => (
            <li key={g.title} className="m-card m-guarantee">
              <h3 className="m-h3">{g.title}</h3>
              <p className="m-guarantee__body">{g.body}</p>
            </li>
          ))}
        </Reveal>
      </div>
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────
// Evidence strength is not a score
// ────────────────────────────────────────────────────────────────────

const COVERAGE = [
  { name: "Scaling operations", level: "Strong", width: 100, soft: false },
  { name: "Partner influence", level: "Moderate", width: 66, soft: true },
  { name: "Technology judgment", level: "None yet", width: 0, soft: true },
] as const;

function NotAScore() {
  const ei = tier("ei");

  return (
    <section className="m-section m-section--gap-tight-top m-section--tint-cool">
      <div className="m-container">
        <Reveal className="m-reveal m-split">
          <div>
            <span className="m-eyebrow">A deliberate limit</span>
            <h2 className="m-h2" style={{ marginTop: "1rem", maxWidth: "20ch" }}>
              Evidence strength is <em>not a score of the candidate.</em>
            </h2>
            <p className="m-lede" style={{ marginTop: "1.25rem" }}>
              It measures how much of the role&apos;s weighted competency set
              has supporting evidence recorded. A high figure means the
              interviews covered the ground. It is not a grade, not a
              percentile, and not a recommendation — and the interface is built
              so it can never be read as one.
            </p>
            <p
              className="m-sechead__body"
              style={{ marginTop: "1.25rem", maxWidth: "56ch" }}
            >
              {ei.name} is {ei.priceLabel?.toLowerCase()} — an add-on to any
              plan, scoped to how your firm runs diligence.
            </p>
          </div>

          <div>
            <div className="m-cover">
              <div className="m-cover__head">
                <span className="m-cover__pct">83%</span>
                <span className="m-cover__of">
                  of weighted competencies have evidence recorded · 5 of 6
                </span>
              </div>
              <ul className="m-cover__list">
                {COVERAGE.map((c) => (
                  <li key={c.name} className="m-cover__row">
                    <span className="m-cover__name">{c.name}</span>
                    {/* One hue at two weights. A red-to-green ramp here
                        would state the opposite of what the column above
                        says this number means. */}
                    <span
                      className={`m-cover__track ${c.soft ? "m-cover__track--soft" : ""}`}
                      aria-hidden
                    >
                      <span style={{ width: `${c.width}%` }} />
                    </span>
                    <span className="m-cover__level">{c.level}</span>
                  </li>
                ))}
              </ul>
              <p className="m-cover__foot">
                Four levels, stated in words. No letter grades, no red-to-green
                ramp, no pass mark.
              </p>
            </div>
            <p className="m-illus-note">
              Illustrative example — not live data
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
