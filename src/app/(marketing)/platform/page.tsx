import type { Metadata } from "next";
import { SiteNav } from "../_components/site-nav";
import { SiteFooter } from "../_components/site-footer";
import { PageHero, PageCta } from "../_components/page-hero";
import { Reveal } from "../_components/reveal";
import { AGENT_COUNT } from "../_constants";
import { AGENT_PHASES, agentsInPhase } from "../_data/agents";

export const dynamic = "force-static";

const TITLE = "Platform";
const DESCRIPTION =
  `The ${AGENT_COUNT} specialist agents behind a Mandate search — what each one runs, what it produces, and the three surfaces where the work happens.`;

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/platform" },
  openGraph: {
    title: `${TITLE} · Mandate`,
    description: DESCRIPTION,
    url: "/platform",
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

export default function PlatformPage() {
  return (
    <>
      <SiteNav active="platform" />
      <main id="main">
        <PageHero
          label="Platform"
          heading={
            <>
              A pipeline, <em>not a chat window.</em>
            </>
          }
          lede={`${AGENT_COUNT} specialist agents, each with a defined trigger and a defined output, writing into one database the application orchestrates. You review, edit and approve at every step that matters.`}
          actions={[
            { href: "/#simulator", label: "Run the live simulator", primary: true },
            { href: "/request-access", label: "Request access" },
          ]}
        />

        <PhaseMap />
        <Surfaces />
        <SourcingLimit />

        <PageCta
          heading={<>See it run on one of your open mandates.</>}
          body="Bring a live brief. We will run it through intake, calibration and ranking with you, and you keep the output either way."
          action={{ href: "/request-access", label: "Request access" }}
        />
      </main>
      <SiteFooter />
    </>
  );
}

// ────────────────────────────────────────────────────────────────────
// What runs, and when
// ────────────────────────────────────────────────────────────────────

function PhaseMap() {
  const always = agentsInPhase("always");

  return (
    <section
      id="agents"
      className="m-section m-section--gap-tight-top m-section--tint-cool"
    >
      <div className="m-container">
        <Reveal className="m-reveal">
          <div className="m-sechead">
            <h2 className="m-h2">What runs, and when</h2>
            <p className="m-sechead__body">
              Grouped by the phase they serve. Every agent has one trigger and
              one output — nothing runs on a schedule you cannot see, and
              nothing writes anywhere you cannot read.
            </p>
          </div>
        </Reveal>

        {/* Counts come from the roster array. The imported comp badged
            this section's third column "6" above a list of four, so its
            headers summed to 17 while its rows summed to 15. */}
        <Reveal className="m-reveal m-phase-grid" as="ul" threshold={0.1}>
          {AGENT_PHASES.map((phase) => {
            const agents = agentsInPhase(phase.key);
            return (
              <li key={phase.key} className="m-phase">
                <div className="m-phase__head">
                  <span className="m-phase__label">{phase.label}</span>
                  <span className="m-phase__count">
                    <span className="m-sr-only">{`${agents.length} agents`}</span>
                    <span aria-hidden>{agents.length}</span>
                  </span>
                </div>
                <p className="m-phase__caption">{phase.caption}</p>
                <ul className="m-phase__list">
                  {agents.map((a) => (
                    <li key={a.name}>
                      <div className="m-agent__name">
                        {a.name}
                        {a.addOn && (
                          <span className="m-agent__addon">Add-on</span>
                        )}
                      </div>
                      <p className="m-agent__out">{a.output}</p>
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </Reveal>

        {always.map((a) => (
          <div key={a.name} className="m-agent-always">
            <span className="m-agent-always__label">Across every phase</span>
            <span className="m-agent__name">{a.name}</span>
            <p className="m-agent__out">{a.output}</p>
          </div>
        ))}

        <p className="m-sechead__body" style={{ marginTop: "1.5rem" }}>
          Three of the {AGENT_COUNT} are marked <strong>Add-on</strong>: they
          run only for accounts with Executive Intelligence.
        </p>
      </div>
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────
// Where the work happens
// ────────────────────────────────────────────────────────────────────

function Surfaces() {
  return (
    <section className="m-section m-section--gap-tight-top">
      <div className="m-container">
        <Reveal className="m-reveal">
          <div className="m-sechead">
            <h2 className="m-h2">Where the work happens</h2>
            <p className="m-sechead__body">
              Three surfaces carry the mandate: the workspace where the pipeline
              runs, the leaderboard where the field is ordered, and the
              shortlist where you commit.
            </p>
          </div>
        </Reveal>

        <Reveal className="m-reveal m-surfaces" as="ul" threshold={0.1}>
          <li className="m-surface">
            <div className="m-surface__frame">
              <div className="m-surface__chrome" aria-hidden>
                <span />
                <span />
                <span />
              </div>
              <div className="m-surface__body">
                <div className="m-mini__grid" aria-hidden>
                  <div className="m-mini__tile m-mini__tile--active">
                    <span className="m-mini__state">Active</span>
                    <span className="m-mini__name">Feedback</span>
                    <span className="m-mini__track">
                      <span style={{ width: "60%" }} />
                    </span>
                  </div>
                  <div className="m-mini__tile">
                    <span className="m-mini__state">Queued</span>
                    <span className="m-mini__name">Ranking</span>
                  </div>
                  <div className="m-mini__tile">
                    <span className="m-mini__state">Complete</span>
                    <span className="m-mini__name">Calibration</span>
                  </div>
                  <div className="m-mini__tile">
                    <span className="m-mini__state">Complete</span>
                    <span className="m-mini__name">Role Spec</span>
                  </div>
                </div>
              </div>
            </div>
            <h3 className="m-surface__title">Project workspace</h3>
            <p className="m-surface__desc">
              Live agent state, company context and the calibrated bar in one
              view. You can close the tab; the pipeline keeps running.
            </p>
          </li>

          <li className="m-surface">
            <div className="m-surface__frame">
              <div className="m-surface__chrome" aria-hidden>
                <span />
                <span />
                <span />
              </div>
              <div className="m-surface__body">
                <div className="m-mini" aria-hidden>
                  <div className="m-mini__row m-mini__row--lead">
                    <span className="m-mini__rank">01</span>
                    <span className="m-mini__who">Candidate A</span>
                    <span className="m-mini__score">87</span>
                  </div>
                  <div className="m-mini__row">
                    <span className="m-mini__rank">02</span>
                    <span className="m-mini__who">Candidate B</span>
                    <span className="m-mini__score">84</span>
                  </div>
                  <div className="m-mini__row">
                    <span className="m-mini__rank">03</span>
                    <span className="m-mini__who">Candidate C</span>
                    <span className="m-mini__score">76</span>
                  </div>
                  <div className="m-mini__rule" />
                  <span className="m-mini__tier">Tier 2</span>
                  <div className="m-mini__row">
                    <span className="m-mini__rank">04</span>
                    <span className="m-mini__who">Candidate D</span>
                    <span className="m-mini__score">74</span>
                  </div>
                </div>
              </div>
            </div>
            <h3 className="m-surface__title">Ranking</h3>
            <p className="m-surface__desc">
              Tiers, multi-dimension scores and the history of every rank
              change — including the feedback that caused it.
            </p>
          </li>

          <li className="m-surface">
            <div className="m-surface__frame">
              <div className="m-surface__chrome" aria-hidden>
                <span />
                <span />
                <span />
              </div>
              <div className="m-surface__body">
                <div className="m-mini" aria-hidden>
                  <p className="m-mini__quote">
                    Three candidates, three different bets.
                  </p>
                  <div className="m-mini__pairs">
                    <span className="m-mini__pair">
                      <span>A</span>
                      <span>Proven at scale, five-year horizon</span>
                    </span>
                    <span className="m-mini__pair">
                      <span>B</span>
                      <span>Faster, less regulated depth</span>
                    </span>
                    <span className="m-mini__pair">
                      <span>C</span>
                      <span>Sector switch, strongest on pace</span>
                    </span>
                  </div>
                  <span className="m-mini__send">Send to client portal</span>
                </div>
              </div>
            </div>
            <h3 className="m-surface__title">Shortlist</h3>
            <p className="m-surface__desc">
              A slate with the trade-offs written down, delivered to the hiring
              manager on a tokenised link that shows nothing internal.
            </p>
          </li>
        </Reveal>

        {/* The three frames above carry names and scores. They are drawn,
            not captured, and the page says so rather than letting a
            reader take them for a screenshot of live data. */}
        <p className="m-illus-note">
          Interface sketches — illustrative, not screenshots
        </p>
      </div>
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────
// What it does not do
// ────────────────────────────────────────────────────────────────────

const POSTURES = ["Exact", "Broad", "Adjacent", "Competitor"] as const;

function SourcingLimit() {
  return (
    <section className="m-section m-section--gap-tight-top m-section--tint-warm">
      <div className="m-container">
        <Reveal className="m-reveal m-split">
          <div>
            <span className="m-eyebrow">What it does not do</span>
            <h2 className="m-h2" style={{ marginTop: "1rem", maxWidth: "18ch" }}>
              Sourcing produces text you <em>paste elsewhere.</em>
            </h2>
            <p className="m-lede" style={{ marginTop: "1.25rem" }}>
              There is no ATS integration and no LinkedIn import. The Boolean
              Search agent writes queries in four postures — exact, broad,
              adjacent and competitor — and you run them where you already
              work. Candidates enter by CV upload.
            </p>
            <p
              className="m-sechead__body"
              style={{ marginTop: "1.25rem", maxWidth: "56ch" }}
            >
              We would rather state that than draw a funnel that does not
              exist.
            </p>
          </div>

          <div>
            {/* Static legend, not controls. The comp drew these as chips
                with Copy and Version history buttons beside them; a
                marketing page that renders buttons which do nothing
                spends exactly the credibility this section is trying to
                earn. They are list items, so nothing offers a click. */}
            <ul className="m-postures">
              {POSTURES.map((p, i) => (
                <li
                  key={p}
                  className={`m-posture ${i === 0 ? "m-posture--on" : ""}`}
                >
                  {p}
                </li>
              ))}
            </ul>
            <p className="m-query">
              (&quot;Chief Technology Officer&quot; OR &quot;Group CTO&quot;)
              AND (&quot;NHS&quot; OR &quot;private hospital&quot; OR
              &quot;healthcare provider&quot;) AND (&quot;platform
              replacement&quot; OR &quot;core system&quot; OR &quot;EPR&quot;)
            </p>
            <p className="m-illus-note">
              Illustrative query — exact posture
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
