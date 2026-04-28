"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { analyzeAndStoreRole } from "@/lib/ai/analyze-role";

const MAX_INPUT_LENGTH = 500;

export async function createProjectAction(formData: FormData) {
  const oneLine = String(formData.get("one_line") ?? "").trim();

  if (!oneLine) {
    redirect(
      `/projects/new?error=${encodeURIComponent("Please describe the role in one line.")}`
    );
  }

  if (oneLine.length > MAX_INPUT_LENGTH) {
    redirect(
      `/projects/new?error=${encodeURIComponent(`Keep the input under ${MAX_INPUT_LENGTH} characters.`)}`
    );
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/signin");
  }

  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("organization_id, status")
    .eq("id", user.id)
    .single();

  if (profileError || !profile?.organization_id || profile.status !== "active") {
    redirect(
      `/projects/new?error=${encodeURIComponent("Your account is not provisioned to start a search.")}`
    );
  }

  // Optimistic insert with placeholder title/company. The AI fills these in shortly.
  const { data: inserted, error: insertError } = await supabase
    .from("projects")
    .insert({
      organization_id: profile.organization_id,
      created_by: user.id,
      title: "Analyzing…",
      company_name: "Analyzing…",
      one_line_input: oneLine,
      status: "active",
      calibration_model: {},
      company_context: {},
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    redirect(
      `/projects/new?error=${encodeURIComponent(
        insertError?.message ?? "Could not create the project. Please retry."
      )}`
    );
  }

  // Fire AI analysis after the response is sent so the user lands on /projects/[id] instantly.
  after(async () => {
    try {
      await analyzeAndStoreRole(inserted.id, oneLine);
    } catch (err) {
      console.error("[analyze-role] failed for project", inserted.id, err);
    }
  });

  redirect(`/projects/${inserted.id}`);
}
