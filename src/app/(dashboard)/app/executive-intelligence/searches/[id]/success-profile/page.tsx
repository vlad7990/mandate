import { notFound, redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { normalizeSuccessProfile } from "@/lib/ai/executive-role-architect-agent";
import type { SuccessProfileRow } from "@/lib/executive/types";
import { ProfileEmpty } from "./profile-empty";
import { ProfileError } from "./profile-error";
import { ProfileGenerating } from "./profile-generating";
import { ProfileEditor, type ProfileVersionSummary } from "./profile-editor";
import { isSampleId } from "@/lib/sample";
import { SampleEiSuccessProfile } from "@/components/sample/sample-ei-success-profile";

// Server-action generation runs in an after() callback on this route; give it a
// generous ceiling so generation (~80s) completes before the function is
// reclaimed. Matches Vercel's current default; set explicitly for durability.
export const maxDuration = 300;

type SearchSummary = {
  id: string;
  role_title: string;
  company_name: string;
  company_context_status: string;
};

/**
 * State routing mirrors the job-spec page: the render path is side-effect
 * free (generation only starts from explicit user clicks), and a transient
 * generation/failure on the latest version never hides an existing usable
 * profile.
 *
 * Priority: approved > newest healthy draft as the editor row; in-flight and
 * failed rows surface as banners unless nothing usable exists.
 */
export default async function SuccessProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // W7 filled this in. The profile describes the role and never a
  // candidate — see the header of `sample-ei-success-profile.tsx` for why
  // that put it outside D1 rather than behind it.
  if (isSampleId(id)) {
    return <SampleEiSuccessProfile />;
  }
  const supabase = await createServerSupabaseClient();

  const { data: search, error: searchError } = await supabase
    .from("executive_searches")
    .select("id, role_title, company_name, company_context_status")
    .eq("id", id)
    .single<SearchSummary>();

  if (searchError || !search) {
    if (searchError?.code === "PGRST116") notFound();
    redirect("/app/executive-intelligence/searches");
  }

  const { data: profiles, error: profilesError } = await supabase
    .from("role_success_profiles")
    .select(
      "id, search_id, organization_id, version, content_json, status, prompt_version, model_version, is_generating, generation_error, created_by, approved_by, approved_at, created_at, updated_at"
    )
    .eq("search_id", id)
    .order("version", { ascending: false });

  if (profilesError) {
    redirect(`/app/executive-intelligence/searches/${id}`);
  }

  const rows = (profiles ?? []) as SuccessProfileRow[];

  if (rows.length === 0) {
    return (
      <ProfileEmpty
        searchId={search.id}
        roleTitle={search.role_title}
        companyName={search.company_name}
        companyContextReady={search.company_context_status === "ready"}
      />
    );
  }

  const healthy = rows.filter((r) => !r.is_generating && !r.generation_error);
  // The approved profile wins; otherwise the newest healthy draft.
  const editorRow =
    healthy.find((r) => r.status === "approved") ?? healthy[0] ?? null;
  const activeGenerationRow = rows.find((r) => r.is_generating) ?? null;
  const failedGenerationRow = rows.find((r) => r.generation_error) ?? null;

  if (failedGenerationRow && !editorRow) {
    return (
      <ProfileError
        searchId={search.id}
        roleTitle={search.role_title}
        companyName={search.company_name}
        version={failedGenerationRow.version}
        errorMessage={failedGenerationRow.generation_error ?? "Generation failed."}
      />
    );
  }

  if (activeGenerationRow && !editorRow) {
    return (
      <ProfileGenerating
        searchId={search.id}
        roleTitle={search.role_title}
        companyName={search.company_name}
        profileId={activeGenerationRow.id}
        version={activeGenerationRow.version}
      />
    );
  }

  if (!editorRow) {
    redirect(`/app/executive-intelligence/searches/${id}`);
  }

  // Approver display name for the provenance line.
  let approverName: string | null = null;
  if (editorRow.approved_by) {
    const { data: approver } = await supabase
      .from("users")
      .select("full_name, email")
      .eq("id", editorRow.approved_by)
      .maybeSingle<{ full_name: string | null; email: string | null }>();
    approverName = approver?.full_name?.trim() || approver?.email || null;
  }

  const versions: ProfileVersionSummary[] = rows.map((r) => ({
    id: r.id,
    version: r.version,
    status: r.status,
    is_generating: r.is_generating,
    generation_error: r.generation_error,
    updated_at: r.updated_at,
  }));

  return (
    <ProfileEditor
      // Remount when the editor row changes (e.g. a generation lands) so
      // local editing state never reflects a previous version.
      key={editorRow.id}
      searchId={search.id}
      roleTitle={search.role_title}
      companyName={search.company_name}
      profileId={editorRow.id}
      version={editorRow.version}
      status={editorRow.status}
      promptVersion={editorRow.prompt_version}
      modelVersion={editorRow.model_version}
      approvedAt={editorRow.approved_at}
      approverName={approverName}
      updatedAt={editorRow.updated_at}
      content={normalizeSuccessProfile(editorRow.content_json)}
      versions={versions}
      activeGeneration={
        activeGenerationRow
          ? {
              profileId: activeGenerationRow.id,
              version: activeGenerationRow.version,
            }
          : null
      }
      failedGeneration={
        failedGenerationRow
          ? {
              version: failedGenerationRow.version,
              error: failedGenerationRow.generation_error ?? "Generation failed.",
            }
          : null
      }
    />
  );
}
