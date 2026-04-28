import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/session";

const PUBLIC_PATHS = new Set(["/", "/auth/signin", "/auth/signup", "/auth/callback"]);
const AUTH_ONLY_REDIRECT_TARGETS = new Set(["/auth/signin", "/auth/signup"]);

async function handle(request: NextRequest) {
  const { response, user } = await updateSession(request);
  const { pathname } = request.nextUrl;

  if (!user && !isPublic(pathname)) {
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
  return PUBLIC_PATHS.has(pathname);
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
