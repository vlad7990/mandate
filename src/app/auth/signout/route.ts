import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";

/**
 * Sign-out endpoint. After clearing the Supabase session we send the
 * user to the public marketing landing (/) rather than directly back
 * to the sign-in form — the proxy will already reject any subsequent
 * dashboard navigation, and a fresh marketing page reads as a
 * cleaner end-of-session moment than a half-loaded auth screen.
 */
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/", request.url), { status: 303 });
}
