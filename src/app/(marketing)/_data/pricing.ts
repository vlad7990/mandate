/**
 * Commercial terms, in one place.
 *
 * Why this is a module: the imported `/pricing` comp and the shipped
 * homepage disagreed about what Starter includes — the comp said
 * "unlimited mandates", the homepage said "1 user, 3 active searches".
 * Two pages on the same site quoting different terms against the same
 * $399 is the precise failure the page spends its whole length arguing
 * the product prevents.
 *
 * The homepage wording is authoritative (founder decision, 2026-08-11);
 * the comp was corrected to match. Both surfaces now render from here.
 *
 * A price or a limit changes in this file or it does not change.
 */

export type TierId = "starter" | "growth" | "agency" | "ei";

export type Tier = {
  readonly id: TierId;
  readonly name: string;
  /** Numeric price, already formatted. Absent for enquiry-only tiers. */
  readonly price?: string;
  readonly cadence?: string;
  /** Shown instead of a number when there is no list price. */
  readonly priceLabel?: string;
  readonly headline: string;
  readonly points: readonly string[];
  readonly featured?: true;
  /** Overrides the badge on the featured tier. */
  readonly badge?: string;
  /**
   * Enquiry tiers get a different CTA. Every tier used to carry an
   * identical "Request Access" button on a page that states twice
   * there is no self-serve signup — four buttons offering the same
   * thing is not a choice, and it made the tier grid read as a
   * checkout it is not.
   */
  readonly cta: { readonly label: string; readonly href: string };
};

export const TIERS: readonly Tier[] = [
  {
    id: "starter",
    name: "Starter",
    price: "399",
    cadence: "/mo",
    headline: "1 user, 3 active searches",
    points: [
      "Full intelligence stack",
      "Ranking, comparison and shortlists",
      "30-day evaluation history",
      "Email support",
    ],
    cta: { label: "Request access", href: "/request-access" },
  },
  {
    id: "growth",
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
    // Not "Most popular". The product has zero customers and the site
    // carries no social proof by policy — an unsubstantiated popularity
    // claim attached to the money undercuts everything honest near it.
    badge: "Includes the HM Portal",
    cta: { label: "Request access", href: "/request-access" },
  },
  {
    id: "agency",
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
    cta: { label: "Request access", href: "/request-access" },
  },
  {
    id: "ei",
    name: "Executive Intelligence",
    // Priced on enquiry rather than listed. EI carries a materially
    // different cost profile per search, and the number is not set.
    priceLabel: "Contact sales",
    headline: "Add-on to any plan",
    points: [
      "Gated diligence chain",
      "Versioned success profiles",
      "Per-candidate interview plans",
      "Immutable approved records",
      "Append-only audit trail",
    ],
    cta: { label: "Contact sales", href: "mailto:hello@getmandate.io" },
  },
];

/** Tier lookup for the pages that address one directly. */
export function tier(id: TierId): Tier {
  const found = TIERS.find((t) => t.id === id);
  if (!found) throw new Error(`Unknown tier: ${id}`);
  return found;
}

/**
 * The comparison matrix.
 *
 * Every value here restates something a tier card already claims — the
 * table is a second view of the same data, never a source of new terms.
 * The comp carried an "evaluation history" row with values for Growth
 * and Agency that appear on no tier card; it is omitted rather than
 * invented.
 */
export type MatrixValue = "yes" | "no" | string;

export const MATRIX: ReadonlyArray<{
  readonly feature: string;
  readonly values: Readonly<Record<TierId, MatrixValue>>;
}> = [
  {
    feature: "Mandates, agents, ranking and shortlists",
    values: { starter: "yes", growth: "yes", agency: "yes", ei: "no" },
  },
  {
    feature: "Hiring Manager Portal",
    values: { starter: "no", growth: "yes", agency: "yes", ei: "no" },
  },
  {
    feature: "Triangulation reports",
    values: { starter: "no", growth: "yes", agency: "yes", ei: "no" },
  },
  {
    feature: "Calibration history + restore",
    values: { starter: "no", growth: "yes", agency: "yes", ei: "no" },
  },
  {
    feature: "Global Executive Network",
    values: { starter: "no", growth: "no", agency: "yes", ei: "no" },
  },
  {
    feature: "Custom skills + agents",
    values: { starter: "no", growth: "no", agency: "yes", ei: "no" },
  },
  {
    feature: "Gated diligence chain + audit trail",
    values: { starter: "no", growth: "no", agency: "no", ei: "yes" },
  },
  {
    feature: "Active searches",
    values: {
      starter: "3",
      growth: "10",
      agency: "Unlimited",
      ei: "Follows plan",
    },
  },
  {
    feature: "Users",
    values: {
      starter: "1",
      growth: "5",
      agency: "Unlimited",
      ei: "Follows plan",
    },
  },
  {
    feature: "Support",
    values: {
      starter: "Email",
      growth: "Priority",
      agency: "Dedicated + SLA",
      ei: "Follows plan",
    },
  },
];

/** Billing questions, kept separate from the product FAQ on the homepage. */
export const BILLING_FAQ: ReadonlyArray<{
  readonly q: string;
  readonly a: string;
}> = [
  {
    q: "Is there a free trial?",
    a: "No. Access is granted by approval, not by credit card. Request access and we will walk a live mandate through with you before anything is charged.",
  },
  {
    q: "Are agent runs metered?",
    a: "No. Your plan caps how many searches you can run at once, never how many times you re-run the model inside one. A mandate that needs four recalibrations costs the same as one that needs none — we would rather you correct a wrong bar than live with it.",
  },
  {
    q: "What happens if we cancel?",
    a: "Access is removed; your records are retained and remain readable. Gates take away access, never your account of what happened.",
  },
  {
    q: "Can we be billed annually?",
    a: "Monthly only today. Tell us if annual billing matters for your procurement and we will work to it.",
  },
];
