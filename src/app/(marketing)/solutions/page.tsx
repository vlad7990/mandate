import type { Metadata } from "next";
import Link from "next/link";
import { SiteNav } from "../_components/site-nav";
import { SiteFooter } from "../_components/site-footer";
import { PageHero, PageCta } from "../_components/page-hero";
import { Reveal } from "../_components/reveal";
import { CheckMark } from "../_components/icons";
import { tier, type TierId } from "../_data/pricing";

export const dynamic = "force-static";

const TITLE = "Solutions";
const DESCRIPTION =
  "How Mandate is used by boutique search principals, multi-consultant firms and in-house talent teams — the same discipline under three different kinds of pressure.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/solutions" },
  openGraph: {
    title: `${TITLE} · Mandate`,
    description: DESCRIPTION,
    url: "/solutions",
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

/**
 * Each segment names the tier it starts on rather than restating a
 * price. The figure is read from `_data/pricing.ts` at render, so a
 * price change cannot leave a stale number on this page — the exact
 * failure that put "unlimited mandates" on one page and "3 active
 * searches" on another for the same $399.
 */
const SEGMENTS: ReadonlyArray<{
  readonly label: string;
  readonly title: string;
  readonly body: string;
  readonly points: readonly string[];
  readonly startsOn: TierId;
  readonly featured?: true;
}> = [
  {
    label: "Boutique search",
    title: "One or two principals",
    body: "You are the process. Every hour spent reading CVs is an hour not spent with the client.",
    points: [
      "Intake to calibrated model in an afternoon, not a fortnight",
      "A client portal that makes you look like a larger firm",
      "Search health tells you which mandate is quietly dying",
    ],
    startsOn: "starter",
  },
  {
    label: "Multi-consultant firms",
    title: "Five to fifty consultants",
    body: "Your risk is not speed. It is that every consultant runs a different method, and the quality of a search depends on who took it.",
    points: [
      "Custom evaluation lenses encode your firm's point of view into every search",
      "A shared executive network, deduplicated to people rather than rows",
      "Portfolio analytics that compare method, not just outcomes",
    ],
    startsOn: "growth",
    featured: true,
  },
  {
    label: "In-house talent",
    title: "Executive hiring inside the company",
    body: "You will be asked, months later, why this person. The answer needs to exist in writing, from before the decision.",
    points: [
      "Executive Intelligence: a gated diligence chain with an append-only audit trail",
      "Approved records are immutable, so the bar cannot be edited after the fact",
      "A report that names its own gaps before someone else does",
    ],
    startsOn: "ei",
  },
];

const PRESSURE = [
  {
    row: "The real question",
    boutique: "Can I stay credible across six mandates at once?",
    firm: "Does a search run the same way whoever takes it?",
    inHouse: "Can I show the board how this decision was made?",
  },
  {
    row: "What breaks first",
    boutique: "Follow-up. A slate sits with a client and nobody chases it.",
    firm: 'Consistency. Two consultants, two definitions of "senior enough".',
    inHouse: "Memory. Six months later, nobody can reconstruct the bar.",
  },
  {
    row: "What matters most",
    boutique: "Search health and the client portal",
    firm: "Skills studio and the shared network",
    inHouse: "Executive Intelligence and the audit trail",
  },
  {
    row: "Where to start",
    boutique: "Starter, one live mandate",
    firm: "Growth, one team",
    inHouse: "Agency plus Executive Intelligence",
  },
] as const;

export default function SolutionsPage() {
  return (
    <>
      <SiteNav active="solutions" />
      <main id="main">
        <PageHero
          label="Solutions"
          heading={
            <>
              Same operating system. <em>Three different rooms.</em>
            </>
          }
          lede="A solo principal defends the slate to a client. A multi-consultant firm defends the method to itself. An in-house team defends the hire to a board. The pressure is different; the discipline is the same."
        />

        <Segments />
        <Pressure />

        <PageCta
          heading={<>Tell us how your searches actually run.</>}
          body="We will show you where the method holds and where it leaks — using one of your own open mandates."
          action={{ href: "/request-access", label: "Request access" }}
        />
      </main>
      <SiteFooter />
    </>
  );
}

function Segments() {
  return (
    <section className="m-section m-section--gap-tight-top m-section--tint-cool">
      <div className="m-container">
        <Reveal className="m-reveal m-segments" as="ul" threshold={0.1}>
          {SEGMENTS.map((s) => {
            const t = tier(s.startsOn);
            return (
              <li
                key={s.label}
                className={`m-segment ${s.featured ? "m-segment--featured" : ""}`}
              >
                <div>
                  <span className="m-mono--label" style={{ color: "var(--accent)" }}>
                    {s.label}
                  </span>
                  <h2 className="m-segment__title" style={{ marginTop: "0.625rem" }}>
                    {s.title}
                  </h2>
                  <p className="m-segment__body" style={{ marginTop: "0.75rem" }}>
                    {s.body}
                  </p>
                </div>

                <ul className="m-segment__points">
                  {s.points.map((p) => (
                    <li key={p}>
                      <CheckMark />
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>

                <div className="m-segment__foot">
                  <span className="m-segment__from">
                    {t.price ? "Starts at" : "Agency plan plus"}
                  </span>
                  <p className="m-segment__price">
                    {t.price ? (
                      <>
                        ${t.price} <small>{t.cadence}</small>
                      </>
                    ) : (
                      t.priceLabel
                    )}
                  </p>
                </div>
              </li>
            );
          })}
        </Reveal>

        <p className="m-sechead__body" style={{ marginTop: "2rem" }}>
          Every plan runs the full agent stack.{" "}
          <Link href="/pricing" className="m-link m-link--accent">
            Compare what changes between them
          </Link>
          .
        </p>
      </div>
    </section>
  );
}

function Pressure() {
  return (
    <section className="m-section m-section--gap-tight-top">
      <div className="m-container">
        <Reveal className="m-reveal">
          <div className="m-sechead">
            <h2 className="m-h2" style={{ maxWidth: "24ch" }}>
              The same mandate, three different rooms
            </h2>
          </div>
        </Reveal>

        <Reveal className="m-reveal" threshold={0.1}>
          <div className="m-table__wrap">
            <table className="m-table">
              <caption className="m-sr-only">
                What each kind of team is under pressure to answer, what fails
                first for them, and where they start.
              </caption>
              <thead>
                <tr>
                  <th scope="col">
                    <span className="m-sr-only">Dimension</span>
                  </th>
                  <th scope="col">Boutique</th>
                  <th scope="col">Multi-consultant</th>
                  <th scope="col">In-house</th>
                </tr>
              </thead>
              <tbody>
                {PRESSURE.map((r) => (
                  <tr key={r.row}>
                    <th scope="row">{r.row}</th>
                    <td>{r.boutique}</td>
                    <td>{r.firm}</td>
                    <td>{r.inHouse}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
