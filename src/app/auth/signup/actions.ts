"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { isFounderEmail } from "@/lib/auth/founders";
import { validatePassword } from "@/lib/auth/password-policy";
import { clientIpFrom, limitOpen } from "@/lib/rate-limit/server";
import { retryPhrase } from "@/lib/rate-limit/core";

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

  // Account spam is cheap to send and expensive to triage (088:
  // 5/hr/IP, 100/day global). Identity door: fails OPEN.
  const verdict = await limitOpen("sign_up_ip", clientIpFrom(await headers()));
  if (!verdict.allowed) {
    redirect(
      `/auth/signup?error=${encodeURIComponent(
        `Too many sign-up attempts from this location. Try again in ${retryPhrase(verdict.retryAfterSeconds)}.`
      )}`
    );
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
