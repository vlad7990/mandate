import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { PageShell } from "@/components/ui/page-shell";
import { IconArrowLeft } from "@/components/icons";
import { createTemplateAction } from "../actions";
import { TemplateForm, type CompetencyOption } from "../template-form";

/**
 * Author an org role template. The route is admin-gated in ROUTE_RULES
 * (skills:write); RLS is the backstop — org rows only, is_global false
 * by the coherence CHECK.
 */
export default async function NewTemplatePage() {
  const supabase = await createServerSupabaseClient();

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
        <span className="text-primary">New</span>
      </div>

      <header className="space-y-1">
        <h1 className="font-h2 text-h2 text-on-surface">New Role Template</h1>
        <p className="max-w-2xl text-body-main text-on-surface-variant">
          An organisation template sits beside the global library. Give it a
          global template&rsquo;s key and yours wins for your organisation.
        </p>
      </header>

      <TemplateForm
        action={createTemplateAction}
        initial={null}
        competencies={competencies}
        globalKeys={globalKeys}
        submitLabel="Create Template"
      />
    </PageShell>
  );
}
