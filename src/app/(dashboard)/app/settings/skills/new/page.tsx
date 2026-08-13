import { redirect } from "next/navigation";
import { TerminalTitle } from "@/components/ui/page-shell";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { SetBreadcrumbs } from "@/components/dashboard/breadcrumbs";
import { SkillForm, type SkillFormProject } from "../skill-form";

export default async function NewSkillPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/signin");

  const { data: profile } = await supabase
    .from("users")
    .select("organization_id, status")
    .eq("id", user.id)
    .single<{ organization_id: string | null; status: string }>();

  if (!profile || profile.status !== "active" || !profile.organization_id) {
    redirect("/app/settings");
  }

  const { data: clientRows } = await supabase
    .from("clients")
    .select("id, name")
    .order("name");
  const clients = (clientRows ?? []) as Array<{ id: string; name: string }>;

  const { data: projects } = await supabase
    .from("projects")
    .select("id, title")
    .order("created_at", { ascending: false });

  return (
    <div className="px-6 py-6 space-y-5 max-w-[1400px] mx-auto">
      <SetBreadcrumbs
        crumbs={[
          { label: "Settings", href: "/app/settings" },
          { label: "Skills", href: "/app/settings/skills" },
          { label: "New" },
        ]}
      />

      <header className="space-y-2">
        <TerminalTitle>NEW_SKILL</TerminalTitle>
        <p className="font-mono-label text-mono-label text-on-surface-variant uppercase tracking-widest">
          Compose a behavioural override that all six AI agents will pick up
          on their next invocation.
        </p>
      </header>

      <SkillForm
        clients={clients}
        initial={{
          id: null,
          name: "",
          description: "",
          skill_type: "search_skill",
          trigger_conditions: "",
          instructions: "",
          applies_to_project_id: null,
    applies_to_client_id: null,
        }}
        projects={(projects ?? []) as SkillFormProject[]}
      />
    </div>
  );
}
