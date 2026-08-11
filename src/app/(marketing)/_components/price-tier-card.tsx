import Link from "next/link";
import type { Tier } from "../_data/pricing";
import { CheckMark } from "./icons";

/**
 * One pricing tier, rendered identically on the homepage and `/pricing`.
 *
 * Shared as a component rather than only as data: the two surfaces had
 * begun to differ in more than their numbers — the homepage drew its
 * feature ticks with a `✓` character from the monospace face while the
 * comp drew a real stroked check. Two renderings of the same commercial
 * object is how the numbers drift next.
 */
export function PriceTierCard({ tier }: { tier: Tier }) {
  const enquiry = !tier.price;

  return (
    <li className={`m-price ${tier.featured ? "m-price--featured" : ""}`}>
      {tier.featured && tier.badge && (
        <span className="m-price__badge">{tier.badge}</span>
      )}

      <div className="m-price__head">
        <span className="m-mono--label m-price__name">{tier.name}</span>
        <div className="m-price__amount">
          {tier.price ? (
            <>
              <sup>$</sup>
              {tier.price}
              <sub>{tier.cadence}</sub>
            </>
          ) : (
            <span className="m-price__enquiry">{tier.priceLabel}</span>
          )}
        </div>
        <p className="m-price__headline">{tier.headline}</p>
      </div>

      <ul className="m-price__points">
        {tier.points.map((p) => (
          <li key={p}>
            <CheckMark />
            <span>{p}</span>
          </li>
        ))}
      </ul>

      <Link
        href={tier.cta.href}
        className={`m-btn ${tier.featured ? "m-btn--primary" : "m-btn--ghost"} m-price__cta`}
      >
        {tier.cta.label}
        {/* Without this, three tiers read "Request access" and the
            fourth "Contact sales" with nothing naming which plan the
            click applies to. */}
        <span className="m-sr-only"> — {tier.name}</span>
      </Link>

      {enquiry && (
        <p className="m-price__foot">
          Scoped per engagement. Added to any plan above.
        </p>
      )}
    </li>
  );
}
