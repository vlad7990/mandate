import { notFound, redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { CvUploadForm } from "./upload-form";
import { isSampleId } from "@/lib/sample";
import { SampleNotBuilt } from "@/components/sample/sample-not-built";

export default async function NewCandidatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // A form, and a sample one would upload nowhere.
  if (isSampleId(id)) {
    return (
      <SampleNotBuilt
        title="Add candidate"
        context="Sample mandate"
        backHref={`/app/projects/${id}/candidates`}
        backLabel="Candidates"
        scope="mandate"
      />
    );
  }
  const supabase = await createServerSupabaseClient();

  const { data: project, error } = await supabase
    .from("projects")
    .select("id, title, company_name, calibration_model")
    .eq("id", id)
    .single<{
      id: string;
      title: string;
      company_name: string;
      calibration_model: { role_title?: string } | null;
    }>();

  if (error || !project) {
    if (error?.code === "PGRST116") notFound();
    redirect("/");
  }

  return (
    <CvUploadForm
      projectId={project.id}
      roleTitle={project.title}
      companyName={project.company_name}
    />
  );
}
