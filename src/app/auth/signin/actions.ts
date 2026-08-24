"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { safeNextPath } from "@/lib/routes";
import { clientIpFrom, limitOpen } from "@/lib/rate-limit/server";
import { retryPhrase } from "@/lib/rate-limit/core";

export async function signInAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  // The proxy puts the requested path on the sign-in URL as `?next=`,
  // and the page forwards it through this hidden field. It used to be
  // dropped here — every sign-in landed on the dashboard root, so a
  // bookmarked deep link survived the redirect chain only to be
  // discarded at the last hop. Validated, never used raw.
  const next = safeNextPath(String(formData.get("next") ?? ""));

  if (!email || !password) {
    redirect(`/auth/signin?error=${encodeURIComponent("Email and password are required.")}`);
  }

  // Credential stuffing runs at machine speed; a person retrying a
  // password does not (088: 10/hr/IP, deliberately NO global cap —
  // a global cap on sign-in is a self-inflicted outage). Identity
  // door: fails OPEN.
  const verdict = await limitOpen("sign_in_ip", clientIpFrom(await headers()));
  if (!verdict.allowed) {
    redirect(
      `/auth/signin?error=${encodeURIComponent(
        `Too many sign-in attempts from this location. Try again in ${retryPhrase(verdict.retryAfterSeconds)}.`
      )}`
    );
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect(`/auth/signin?error=${encodeURIComponent(error.message)}`);
  }

  const userId = data.user?.id;
  if (!userId) {
    redirect(`/auth/signin?error=${encodeURIComponent("Sign-in succeeded but no session was returned.")}`);
  }

  const { data: profile } = await supabase
    .from("users")
    .select("status")
    .eq("id", userId)
    .single();

  if (profile?.status === "suspended") {
    await supabase.auth.signOut();
    redirect(`/auth/signin?error=${encodeURIComponent("Your account is suspended. Contact a workspace admin.")}`);
  }

  if (profile?.status === "pending") {
    redirect("/auth/pending");
  }

  redirect(next);
}
