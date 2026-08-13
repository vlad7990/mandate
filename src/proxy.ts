import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/session";
import { DASHBOARD_HOME } from "@/lib/routes";
import { can, parseRole } from "@/lib/auth/roles";
import {
  capabilityForPath,
  DEFAULT_CAPABILITY,
  NO_ACCESS_PATH,
} from "@/lib/auth/route-access";

// Hard-public — skip session refresh entirely. Used for endpoints that
// must work for unauthenticated visitors with no cookie round-trip
// (the HM portal token-based pages, the public landing-page demo API).
const ALWAYS_PUBLIC_PREFIXES = ["/hm/", "/hm", "/api/demo"];

// Public-facing pages that unauthenticated users SHOULD see. We still
// run the session refresh on these so authenticated visitors can be
// bounced to their dashboard, but we never force a sign-in redirect.
// Kept explicit rather than derived from the marketing nav: this is an
// authentication boundary, and it should be readable in one place
// without following an import. If you add a marketing route, add it
// here too — anything not listed redirects to sign-in, which is the
// safe default but silently hides a new public page.
const PUBLIC_PAGES = new Set([
  "/",
  "/platform",
  "/executive-intelligence",
  "/solutions",
  "/pricing",
  "/request-access",
  "/auth/signin",
  "/auth/signup",
  "/auth/callback",
  "/auth/pending",
]);

// Pages an authenticated user should never see — they bounce to the
// dashboard. Marketing landing + raw auth pages count.
const AUTH_BOUNCE_TARGETS = new Set([
  "/",
  "/auth/signin",
  "/auth/signup",
]);

function isAlwaysPublic(pathname: string): boolean {
  return ALWAYS_PUBLIC_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix)
  );
}

function isPublicPage(pathname: string): boolean {
  if (PUBLIC_PAGES.has(pathname)) return true;
  if (pathname.startsWith("/auth/")) return true;
  return false;
}

async function handle(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Hard-public — bypass session entirely.
  if (isAlwaysPublic(pathname)) {
    return NextResponse.next();
  }

  const { response, user, supabase } = await updateSession(request);

  // Authenticated visitor on a marketing/auth landing page → bounce
  // to the dashboard so they don't get stuck on the public surface.
  if (user && AUTH_BOUNCE_TARGETS.has(pathname)) {
    const home = request.nextUrl.clone();
    home.pathname = DASHBOARD_HOME;
    home.search = "";
    return NextResponse.redirect(home);
  }

  // Unauthenticated visitor on a public-facing page → let them through.
  if (!user && isPublicPage(pathname)) {
    return response;
  }

  // Unauthenticated visitor on a protected page → sign-in with `next`.
  if (!user) {
    const signinUrl = request.nextUrl.clone();
    signinUrl.pathname = "/auth/signin";
    signinUrl.search = "";
    if (pathname !== "/auth/pending") {
      signinUrl.searchParams.set("next", pathname);
    }
    return NextResponse.redirect(signinUrl);
  }

  // Authenticated, and on a route that asks for more than the baseline →
  // check the role before rendering it.
  //
  // The `!== DEFAULT_CAPABILITY` test is what keeps this affordable. Most
  // of the forty dashboard routes are readable by every role, and querying
  // the profile on each of them would put a database round trip in front of
  // every navigation for no decision. Only the routes that actually
  // restrict something pay for the lookup.
  //
  // Not consulted for the marketing surface or the HM portal: those return
  // null from `capabilityForPath` and never reach here.
  const required = capabilityForPath(pathname);

  if (required && required !== DEFAULT_CAPABILITY) {
    const { data: profile } = await supabase
      .from("users")
      .select("role, status")
      .eq("id", user.id)
      .single<{ role: string | null; status: string }>();

    // Status is folded in here rather than trusted from the layout: a
    // suspended account keeps its org and its role string, and only the
    // active check stops it. Same rule as `current_user_role()` in
    // migration 046, so the guard and the database agree.
    const role = profile?.status === "active" ? parseRole(profile.role) : null;

    if (!can(role, required)) {
      const denied = request.nextUrl.clone();
      denied.pathname = NO_ACCESS_PATH;
      denied.search = "";
      denied.searchParams.set("capability", required);
      denied.searchParams.set("from", pathname);
      return NextResponse.redirect(denied);
    }
  }

  return response;
}

export async function middleware(request: NextRequest) {
  return handle(request);
}

export { middleware as proxy };

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js)$).*)",
  ],
};
