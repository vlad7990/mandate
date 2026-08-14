"use server";

import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { isFounderEmail } from "@/lib/auth/founders";
import { validatePassword } from "@/lib/auth/password-policy";

export async function signUpAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const fullName = String(formData.get("full_name") ?? "").trim();

  if (!email || !password || !fullName) {
    redirect(
      `/auth/signup?error=${encodeURIComponent("Full name, email, and password are required.")}`
    );
  }

  // Mirrors the Supabase Auth setting, and is deliberately not the boundary
  // — see the header of password-policy.ts. It must not be looser than the
  // dashboard, or a password that passes here comes back as a raw GoTrue
  // error for a rule the form never stated.
  const passwordError = validatePassword(password);
  if (passwordError) {
    redirect(`/auth/signup?error=${encodeURIComponent(passwordError)}`);
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } },
  });

  if (error) {
    redirect(`/auth/signup?error=${encodeURIComponent(error.message)}`);
  }

  // No session means email confirmation is enabled in Supabase Auth — user must confirm before sign-in.
  if (!data.session) {
    redirect(`/auth/signin?check_email=1&email=${encodeURIComponent(email)}`);
  }

  redirect(isFounderEmail(email) ? "/" : "/auth/pending");
}
