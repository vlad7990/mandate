import { notFound, redirect } from "next/navigation";
import { TerminalTitle } from "@/components/ui/page-shell";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { SetBreadcrumbs } from "@/components/dashboard/breadcrumbs";
import {
  SkillForm,
  type SkillFormInitial,
  type SkillFormProject,
  type SkillType,
} from "../skill-form";
import { isSampleId } from "@/lib/sample";
import { SampleNotBuilt } from "@/components/sample/sample-not-built";

type SkillRow = {
  id: string;
  name: string;
  description: string;
  skill_type: SkillType;
  trigger_conditions: string;
  instructions: string;
  applies_to_project_id: string | null;
  applies_to_client_id: string | null;
};

export default async function EditSkillPage({
  params,
}: {
  params: Promise<{ skillId: string }>;
}) {
  const { skillId } = await params;

  // The three sample skills are read-only rows with no edit control, so
  // this is only reachable by a typed URL — which is exactly the case the
  // silent redirect handled worst.
  if (isSampleId(skillId)) {
    return (
      <SampleNotBuilt
        title="Skill"
        context="Sample skill"
        backHref="/app/settings/skills"
        backLabel="Skills studio"
        scope="skills"
      />
    );
  }
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

  const [skillQ, projectsQ] = await Promise.all([
    supabase
      .from("skills")
      .select(
        "id, name, description, skill_type, trigger_conditions, instructions, applies_to_project_id, applies_to_client_id"
      )
      .eq("id", skillId)
      .maybeSingle<SkillRow>(),
    supabase
      .from("projects")
      .select("id, title")
      .order("created_at", { ascending: false }),
  ]);

  if (!skillQ.data) {
    notFound();
  }

  const skill = skillQ.data;
  const initial: SkillFormInitial = {
    id: skill.id,
    name: skill.name,
    description: skill.description,
    skill_type: skill.skill_type,
    trigger_conditions: skill.trigger_conditions,
    instructions: skill.instructions,
    applies_to_project_id: skill.applies_to_project_id,
    applies_to_client_id: skill.applies_to_client_id,
  };

  const { data: clientRows } = await supabase
    .from("clients")
    .select("id, name")
    .order("name");
  const clients = (clientRows ?? []) as Array<{ id: string; name: string }>;

  return (
    <div className="px-6 py-6 space-y-5 max-w-[1400px] mx-auto">
      <SetBreadcrumbs
        crumbs={[
          { label: "Settings", href: "/app/settings" },
          { label: "Skills", href: "/app/settings/skills" },
          { label: skill.name, maxChars: 32 },
        ]}
      />

      <header className="space-y-2">
        <TerminalTitle>EDIT_SKILL</TerminalTitle>
        <p className="font-mono-label text-mono-label text-on-surface-variant uppercase tracking-widest">
          Changes apply to the next agent invocation. Existing reports keep
          the prompt they were generated against.
        </p>
      </header>

      <SkillForm
        clients={clients}
        initial={initial}
        projects={(projectsQ.data ?? []) as SkillFormProject[]}
      />
    </div>
  );
}
