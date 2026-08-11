import Link from "next/link";
import { ArrowRight } from "./icons";

/**
 * Hero for the four product pages.
 *
 * Deliberately smaller than the homepage's `.m-display`. That headline
 * runs to 8rem because the landing page has one job and the whole
 * viewport to do it in; repeating the same size on every page would
 * flatten the site into five equally loud front doors. `.m-display--page`
 * keeps the face, the italic accent and the tracking, at page scale —
 * the same voice at conversational volume.
 *
 * The mono label above the heading is the comps' own device and the
 * homepage's `.m-eyebrow`, minus the section numeral: `00–10` addresses
 * a position in the homepage's sequence, and a standalone page has no
 * position in it.
 */
export function PageHero({
  label,
  heading,
  lede,
  actions,
}: {
  label: string;
  heading: React.ReactNode;
  lede: React.ReactNode;
  actions?: ReadonlyArray<{
    readonly href: string;
    readonly label: string;
    readonly primary?: true;
  }>;
}) {
  return (
    <section className="m-section m-page-hero m-section--gap-tight-bottom">
      <div className="m-container">
        <span className="m-eyebrow">{label}</span>
        <h1 className="m-display m-display--page">{heading}</h1>
        <p className="m-lede m-page-hero__lede">{lede}</p>

        {actions && actions.length > 0 && (
          <div className="m-page-hero__actions">
            {actions.map((a) => (
              <Link
                key={a.href}
                href={a.href}
                className={`m-btn ${a.primary ? "m-btn--primary" : "m-btn--ghost"}`}
              >
                <span>{a.label}</span>
                {a.primary && <ArrowRight />}
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * Closing call to action, shared by all four pages.
 *
 * One primary action per page. The comps close each page with a single
 * filled button and no second option, which is right — a page that has
 * just finished making its argument should not reopen the question.
 */
export function PageCta({
  heading,
  body,
  action,
}: {
  heading: React.ReactNode;
  body?: React.ReactNode;
  action: { readonly href: string; readonly label: string };
}) {
  return (
    <section className="m-section m-page-cta m-section--gap-feature-top">
      <div className="m-container">
        <h2 className="m-h2 m-page-cta__heading">{heading}</h2>
        {body && <p className="m-lede m-page-cta__body">{body}</p>}
        <Link href={action.href} className="m-btn m-btn--primary m-page-cta__btn">
          <span>{action.label}</span>
          <ArrowRight />
        </Link>
      </div>
    </section>
  );
}
