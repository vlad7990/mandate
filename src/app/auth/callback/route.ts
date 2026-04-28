import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { isFounderEmail } from "@/lib/auth/founders";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";
  const errorDescription = searchParams.get("error_description");

  if (errorDescription) {
    return NextResponse.redirect(
      `${origin}/auth/signin?error=${encodeURIComponent(errorDescription)}`
    );
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/auth/signin`);
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      `${origin}/auth/signin?error=${encodeURIComponent(error.message)}`
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(`${origin}/auth/signin`);
  }

  const { data: profile } = await supabase
    .from("users")
    .select("status")
    .eq("id", user.id)
    .single();

  if (profile?.status === "suspended") {
    await supabase.auth.signOut();
    return NextResponse.redirect(
      `${origin}/auth/signin?error=${encodeURIComponent("Your account is suspended.")}`
    );
  }

  if (profile?.status === "pending" && !isFounderEmail(user.email)) {
    return NextResponse.redirect(`${origin}/auth/pending`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
