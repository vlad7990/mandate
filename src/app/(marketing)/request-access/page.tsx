import Link from "next/link";
import { RequestAccessForm } from "./request-access-form";

export const metadata = {
  title: "Request Access · Mandate",
  description:
    "Apply for access to Mandate, the AI-driven executive search platform.",
};

/**
 * This route used to live outside the (marketing) group and rendered in
 * Material 3 tokens with a Material Symbols icon font — a different
 * design system from the page that sends every visitor here. On a
 * surface with no customers, craft is the credibility instrument, and
 * it was being dropped at the exact moment of commitment. It now sits
 * inside the group, inherits marketing.css and the three fonts, and is
 * built from the same m-* primitives as the landing page.
 */
export default function RequestAccessPage() {
  return (
    <main className="m-access">
      <div className="m-access__shell">
        <header className="m-access__bar">
          <Link href="/" prefetch={false} className="m-access__brand">
            <span aria-hidden className="m-nav__mark">
              M
            </span>
            <span>Mandate</span>
          </Link>
          <Link
            href="/auth/signin"
            prefetch={false}
            className="m-access__signin"
          >
            Sign in
          </Link>
        </header>

        <div className="m-access__body">
          <span className="m-eyebrow">Closed beta · By approval</span>
          <h1 className="m-h2" style={{ marginTop: "0.75rem" }}>
            Request <em>access.</em>
          </h1>
          <p className="m-access__lede">
            Mandate is in closed beta with a hand-picked group of executive
            search firms. Tell us about you and what you&rsquo;re trying to
            solve — a founder reads every application and replies within 48
            hours.
          </p>
          <RequestAccessForm />
        </div>
      </div>
    </main>
  );
}
