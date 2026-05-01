import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/session";

// Exact-match public paths.
const PUBLIC_PATHS = new Set(["/auth/signin", "/auth/signup", "/auth/callback"]);

// Prefix public paths — anything starting with one of these is
// reachable without a Supabase session. /hm/* is the hiring-manager
// portal (token-based access, no login required); /auth/* covers any
// auth-flow page we add in future without having to thread it back
// through PUBLIC_PATHS.
const PUBLIC_PREFIXES = ["/auth/", "/hm/", "/hm"];

const AUTH_ONLY_REDIRECT_TARGETS = new Set(["/auth/signin", "/auth/signup"]);

async function handle(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Bypass session refresh entirely for the public hiring-manager
  // portal — calls there don't need an authenticated Supabase session
  // and shouldn't pay the cookie round-trip.
  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  const { response, user } = await updateSession(request);

  if (!user) {
    const signinUrl = request.nextUrl.clone();
    signinUrl.pathname = "/auth/signin";
    signinUrl.search = "";
    if (pathname !== "/auth/pending") {
      signinUrl.searchParams.set("next", pathname);
    }
    return NextResponse.redirect(signinUrl);
  }

  if (user && AUTH_ONLY_REDIRECT_TARGETS.has(pathname)) {
    const home = request.nextUrl.clone();
    home.pathname = "/";
    home.search = "";
    return NextResponse.redirect(home);
  }

  return response;
}

function isPublic(pathname: string) {
  if (PUBLIC_PATHS.has(pathname)) return true;
  return PUBLIC_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix)
  );
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
