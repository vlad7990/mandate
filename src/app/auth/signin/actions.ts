"use server";

import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export async function signInAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    redirect(`/auth/signin?error=${encodeURIComponent("Email and password are required.")}`);
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

  redirect("/");
}
