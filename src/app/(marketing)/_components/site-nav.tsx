import Link from "next/link";
import { MobileNav } from "./mobile-nav";
import { NAV_LINKS, type NavKey } from "../_nav-links";

/**
 * Skip link + sticky masthead, shared by every marketing page.
 *
 * This used to live inline in `page.tsx` as a local `TopNav`, which was
 * fine while the homepage was the only marketing page. It is exported
 * rather than moved into `layout.tsx` on purpose: `/request-access` is
 * in this route group for its fonts and tokens, and it deliberately
 * ships without a nav — a conversion page should not offer five ways
 * to leave. A layout would have given it one silently.
 *
 * `active` drives `aria-current="page"`, which is also what the visual
 * active state hangs off — one signal, not a class that can disagree
 * with what a screen reader is told.
 */
export function SiteNav({ active }: { active?: NavKey }) {
  return (
    <>
      {/* First focusable element on the page. Without it, a keyboard or
          screen-reader user had no route past the nav on documents this
          long, and there was no <main> landmark to jump to. */}
      <a href="#main" className="m-skip">
        Skip to content
      </a>

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
            {/* A "System online" pip with a pulsing dot used to sit here.
                It was a static span — it checked nothing, and it was
                displayed to sighted users while /api/demo was returning
                502s. A health claim that cannot go false is not a status
                indicator, it is decoration wearing a status indicator's
                clothes. Restore it only wired to a real health endpoint,
                where a degraded state is allowed to show. */}
          </Link>

          <nav className="m-nav__links" aria-label="Primary">
            {NAV_LINKS.map((l) => (
              <Link
                key={l.key}
                href={l.href}
                className="m-nav__link"
                aria-current={l.key === active ? "page" : undefined}
              >
                {l.label}
              </Link>
            ))}
          </nav>

          <div className="m-nav__actions">
            <Link href="/auth/signin" className="m-btn m-btn--ghost">
              Log In
            </Link>
            <Link href="/request-access" className="m-btn m-btn--primary">
              Request Access
            </Link>
          </div>

          {/* Replaces the desktop link row below its breakpoint, where
              it is display:none and previously had no substitute. */}
          <MobileNav active={active} />
        </div>
      </header>
    </>
  );
}
