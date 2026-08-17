import { notFound, redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import type { OnboardingResponses } from "@/lib/ai/onboarding-analysis";
import type { CalibrationModel } from "@/lib/ai/role-analysis";
import { OnboardingWizard } from "./onboarding-wizard";
import { isSampleId } from "@/lib/sample";
import { SampleOnboarding } from "@/components/sample/sample-mandate-modules";

type ProjectRow = {
  id: string;
  title: string;
  company_name: string;
  calibration_model: Partial<CalibrationModel> | null;
  onboarding_responses: Partial<OnboardingResponses> | null;
};

export default async function OnboardingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // The sample mandate has no row in Postgres — `sample-larkspur` is not
  // a uuid, so before this the query below failed and the page fell
  // through to `redirect("/")`, landing a prospect on the dashboard with
  // no explanation. See `sample-mandate-shell.tsx`.
  if (isSampleId(id)) return <SampleOnboarding id={id} />;
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("projects")
    .select("id, title, company_name, calibration_model, onboarding_responses")
    .eq("id", id)
    .single<ProjectRow>();

  if (error || !data) {
    if (error?.code === "PGRST116") notFound();
    redirect("/");
  }

  // Calibration depends on the Intake / Research output. Bounce the user
  // back to the project page until role analysis has populated role_title.
  const analysisReady = Boolean(data.calibration_model?.role_title);
  if (!analysisReady) {
    redirect(`/app/projects/${id}`);
  }

  return (
    <OnboardingWizard
      projectId={data.id}
      roleTitle={data.title}
      companyName={data.company_name}
      initial={data.onboarding_responses ?? null}
    />
  );
}
