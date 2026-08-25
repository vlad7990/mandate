import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { PageShell } from "@/components/ui/page-shell";
import { IconArrowLeft } from "@/components/icons";
import type { ExecutiveRoleTemplateRow } from "@/lib/executive/types";
import { isSampleId } from "@/lib/sample";
import { SampleNotBuilt } from "@/components/sample/sample-not-built";
import { updateTemplateAction } from "../../actions";
import { TemplateForm, type CompetencyOption } from "../../template-form";

/**
 * Edit an ORG template. A global id lands back on the list — globals
 * are nobody's to edit, and offering the form would promise a save
 * RLS then refuses.
 */
export default async function EditTemplatePage({
  params,
}: {
  params: Promise<{ templateId: string }>;
}) {
  const { templateId } = await params;

  // A sample id is not a uuid; the query below would 22P02. Say whose
  // gap it is instead of moving the reader somewhere they did not ask
  // to go — see routes.test.ts.
  if (isSampleId(templateId)) {
    return (
      <SampleNotBuilt
        title="Edit role template"
        context="Executive intelligence // org template authoring"
        backHref="/app/executive-intelligence/templates"
        backLabel="Templates"
      />
    );
  }

  const supabase = await createServerSupabaseClient();

  const { data: template, error } = await supabase
    .from("executive_role_templates")
    .select(
      "id, organization_id, key, title, summary, role_family, intake_defaults, competency_weights"
    )
    .eq("id", templateId)
    .maybeSingle<
      Pick<
        ExecutiveRoleTemplateRow,
        | "id"
        | "organization_id"
        | "key"
        | "title"
        | "summary"
        | "role_family"
        | "intake_defaults"
        | "competency_weights"
      >
    >();

  if (error) redirect("/app/executive-intelligence/templates");
  if (!template) notFound();
  if (template.organization_id == null) {
    redirect("/app/executive-intelligence/templates");
  }

  const [{ data: compRows }, { data: globalRows }] = await Promise.all([
    supabase
      .from("executive_competencies")
      .select("key, name, category")
      .order("category")
      .order("name"),
    supabase
      .from("executive_role_templates")
      .select("key")
      .is("organization_id", null),
  ]);

  const competencies = (compRows ?? []) as CompetencyOption[];
  const globalKeys = ((globalRows ?? []) as Array<{ key: string }>).map(
    (r) => r.key
  );

  const weights = Array.isArray(template.competency_weights)
    ? (template.competency_weights as Array<{
        competency_key: string;
        weight: number;
      }>)
    : [];

  return (
    <PageShell width="reading" className="space-y-6">
      <div className="flex items-center gap-3 font-mono-label text-mono-label uppercase tracking-widest text-outline">
        <Link
          href="/app/executive-intelligence/templates"
          className="flex items-center gap-1.5 transition-colors hover:text-on-surface"
        >
          <IconArrowLeft size={14} />
          Templates
        </Link>
        <span className="text-outline-variant">/</span>
        <span className="text-primary">Edit</span>
      </div>

      <header className="space-y-1">
        <h1 className="font-h2 text-h2 text-on-surface">{template.title}</h1>
        <p className="font-mono-label text-mono-label uppercase tracking-widest text-outline">
          Org template · {template.key}
        </p>
      </header>

      <TemplateForm
        action={updateTemplateAction.bind(null, template.id)}
        initial={{
          title: template.title,
          key: template.key,
          summary: template.summary,
          role_family: template.role_family,
          intake_defaults:
            (template.intake_defaults as Record<string, unknown>) ?? {},
          competency_weights: weights,
        }}
        competencies={competencies}
        globalKeys={globalKeys}
        submitLabel="Save Changes"
      />
    </PageShell>
  );
}
