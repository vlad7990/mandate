import type { Metadata } from "next";
import { SiteNav } from "../_components/site-nav";
import { SiteFooter } from "../_components/site-footer";
import { PageHero, PageCta } from "../_components/page-hero";
import { PriceTierCard } from "../_components/price-tier-card";
import { Reveal } from "../_components/reveal";
import { CheckMark, DashMark } from "../_components/icons";
import { AGENT_COUNT } from "../_constants";
import { BILLING_FAQ, MATRIX, TIERS, type MatrixValue } from "../_data/pricing";

export const dynamic = "force-static";

const TITLE = "Pricing";
const DESCRIPTION =
  "Flat monthly pricing per account, from $399. Agent runs are not metered. Access is granted by approval — there is no self-serve signup and no free trial.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/pricing" },
  openGraph: {
    title: `${TITLE} · Mandate`,
    description: DESCRIPTION,
    url: "/pricing",
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

export default function PricingPage() {
  return (
    <>
      <SiteNav active="pricing" />
      <main id="main">
        <PageHero
          label="Pricing"
          heading={
            <>
              Flat monthly. <em>No usage meter.</em>
            </>
          }
          lede="One price per account, billed monthly. Agent runs are not metered — a search that needs four recalibrations costs the same as one that needs none."
        />

        <Tiers />
        <Comparison />
        <BillingQuestions />

        <PageCta
          heading={<>Start with one mandate.</>}
          body="Access is granted by approval, not by credit card. Tell us what you are hiring for and we will walk a live search through with you before anything is charged."
          action={{ href: "/request-access", label: "Request access" }}
        />
      </main>
      <SiteFooter />
    </>
  );
}

// ────────────────────────────────────────────────────────────────────
// Tiers
// ────────────────────────────────────────────────────────────────────

function Tiers() {
  return (
    <section className="m-section m-section--gap-tight-top">
      <div className="m-container">
        <Reveal className="m-reveal-scale m-price-grid" as="ul" threshold={0.1}>
          {TIERS.map((t) => (
            <PriceTierCard key={t.id} tier={t} />
          ))}
        </Reveal>

        {/*
          The comp put an identical "Request access" button on all four
          tiers of a page that states twice there is no self-serve
          signup — four buttons offering the same single thing, which
          makes the grid read as a checkout it is not. The tier CTAs now
          come from the tier data (the add-on asks you to contact sales,
          because that is genuinely a different conversation), and this
          line says plainly what clicking any of them starts.
        */}
        <p className="m-price-grid__foot">
          Every plan begins the same way: a request, a conversation, then a
          workspace. Billing starts once your workspace is approved.
        </p>
      </div>
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────
// What changes between plans
// ────────────────────────────────────────────────────────────────────

/**
 * A matrix cell. `yes`/`no` render an icon plus a word — the icon never
 * carries the meaning on its own, and the word is visually hidden only
 * where the row and column already name it aloud for a screen reader.
 */
function Cell({ value, feature, tierName }: {
  value: MatrixValue;
  feature: string;
  tierName: string;
}) {
  if (value === "yes") {
    return (
      <span className="m-table__yes">
        <CheckMark size={16} />
        <span className="m-sr-only">{`${feature} is included in ${tierName}`}</span>
      </span>
    );
  }
  if (value === "no") {
    return (
      <span className="m-table__no">
        <DashMark size={16} />
        <span className="m-sr-only">{`${feature} is not included in ${tierName}`}</span>
      </span>
    );
  }
  return <>{value}</>;
}

function Comparison() {
  return (
    <section
      id="compare"
      className="m-section m-section--gap-tight-top m-section--tint-cool"
    >
      <div className="m-container">
        <Reveal className="m-reveal">
          <div className="m-sechead">
            <h2 className="m-h2">What changes between plans</h2>
            {/* The trailing space belongs INSIDE the literal. JSX strips
                whitespace containing a newline between a text node and an
                adjacent expression container, which once shipped
                "intelligence layers.Every layer reads" to production. */}
            <p className="m-sechead__body">
              {`Every plan runs the full stack of ${AGENT_COUNT} agents. `}
              What changes is how many searches run at once, how many people
              can work on them, and whether the diligence chain is switched
              on.
            </p>
          </div>
        </Reveal>

        <Reveal className="m-reveal" threshold={0.1}>
          <div className="m-table__wrap">
            <table className="m-table m-table--center">
              <caption className="m-sr-only">
                Feature comparison across the Starter, Growth and Agency plans
                and the Executive Intelligence add-on.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Feature</th>
                  {TIERS.map((t) => (
                    <th key={t.id} scope="col">
                      {t.id === "ei" ? "EI add-on" : t.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MATRIX.map((row) => (
                  <tr key={row.feature}>
                    <th scope="row">{row.feature}</th>
                    {TIERS.map((t) => (
                      <td key={t.id}>
                        <Cell
                          value={row.values[t.id]}
                          feature={row.feature}
                          tierName={t.name}
                        />
                      </td>
                    ))}
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

// ────────────────────────────────────────────────────────────────────
// Billing questions
// ────────────────────────────────────────────────────────────────────

function BillingQuestions() {
  return (
    <section className="m-section m-section--gap-tight-top">
      <div className="m-container">
        <div className="m-split">
          <Reveal className="m-reveal">
            <h2 className="m-h2" style={{ maxWidth: "14ch" }}>
              Billing questions
            </h2>
          </Reveal>

          {/*
            Native <details>, matching the homepage FAQ rebuild. Zero
            client JavaScript, every answer readable and findable in-page
            without it, and no `inert` state to get wrong.
          */}
          <div className="m-bfaq">
            {BILLING_FAQ.map((item) => (
              <details key={item.q} className="m-bfaq__item">
                <summary className="m-bfaq__q">
                  {item.q}
                  <svg
                    className="m-bfaq__chev"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </summary>
                <p className="m-bfaq__a">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
