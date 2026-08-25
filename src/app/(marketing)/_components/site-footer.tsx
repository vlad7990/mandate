import Link from "next/link";
import { NAV_LINKS } from "../_nav-links";

/**
 * Site footer, shared by every marketing page.
 *
 * The Product column is generated from `NAV_LINKS` rather than typed
 * out again — it had already drifted from the nav once, offering an
 * `#executive-intelligence` anchor the desktop row did not carry.
 *
 * The imported design has Product / Company / Legal columns pointing at
 * eleven separate pages. Only these routes exist, so the structure is
 * kept but every link resolves — no 404s shipped to look fuller.
 */
export function SiteFooter() {
  return (
    <footer className="m-footer">
      <div className="m-container">
        <div className="m-footer__cols">
          <div className="m-footer__brand">
            {/* Was an empty rounded blue square. The nav mark carries an
                M; the footer mark carried nothing, so the site signed
                off with a blank chip. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/mark.png"
              alt=""
              aria-hidden
              className="m-footer__mark"
            />
            <span className="m-footer__wordmark">Mandate</span>
            <p className="m-footer__blurb">
              An AI operating system for executive search.
            </p>
          </div>

          <nav className="m-footer__col" aria-label="Product">
            <h3 className="m-footer__heading">Product</h3>
            {NAV_LINKS.map((l) => (
              <Link key={l.key} href={l.href} className="m-footer__link">
                {l.label}
              </Link>
            ))}
          </nav>

          <nav className="m-footer__col" aria-label="Access">
            <h3 className="m-footer__heading">Access</h3>
            <Link href="/handbook" className="m-footer__link">
              Handbook
            </Link>
            <Link href="/status" className="m-footer__link">
              Status
            </Link>
            <Link href="/request-access" className="m-footer__link">
              Request access
            </Link>
            <Link href="/auth/signin" className="m-footer__link">
              Log in
            </Link>
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
