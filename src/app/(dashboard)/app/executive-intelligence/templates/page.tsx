import Link from "next/link";
import { PageShell } from "@/components/ui/page-shell";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import type { ExecutiveRoleTemplateRow } from "@/lib/executive/types";
import {
  IconArrowLeft,
  IconArrowRight,
} from "@/components/icons";

type TemplateListRow = Pick<
  ExecutiveRoleTemplateRow,
  "id" | "organization_id" | "key" | "title" | "summary" | "role_family" | "competency_weights"
>;

export default async function ExecutiveTemplatesPage() {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("executive_role_templates")
    .select("id, organization_id, key, title, summary, role_family, competency_weights")
    .order("title");

  const templates = (data ?? []) as TemplateListRow[];

  return (
    <PageShell width="reading" className="space-y-6">
        <div className="flex items-center gap-3 font-mono-label text-mono-label uppercase tracking-widest text-outline">
          <Link
            href="/app/executive-intelligence"
            className="hover:text-on-surface transition-colors flex items-center gap-1.5"
          >
            <IconArrowLeft size={14} />
            Executive Intelligence
          </Link>
          <span className="text-outline-variant">/</span>
          <span className="text-on-surface-variant">Templates</span>
        </div>

        <header className="space-y-1">
          <h1 className="font-h2 text-h2 text-on-surface">Role Templates</h1>
          <p className="text-body-main text-on-surface-variant max-w-2xl">
            Curated starting points for common executive mandates. A template
            prefills the intake and seeds competency weights — everything remains
            editable before and after creation.
          </p>
        </header>

        {error && (
          <div className="border border-error/40 bg-error-container/30 px-4 py-3 rounded text-error text-body-main">
            Failed to load templates: {error.message}
          </div>
        )}

        {!error && templates.length === 0 && (
          <div className="bg-surface-container-low border border-outline-variant p-12 text-center">
            <p className="text-body-main text-on-surface-variant">
              No templates available. The global library is seeded by migration 033
              — check that it has been applied.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {templates.map((t) => {
            const weightCount = Array.isArray(t.competency_weights)
              ? t.competency_weights.length
              : 0;
            return (
              <div
                key={t.id}
                className="bg-surface-container-low border border-outline-variant p-5 flex flex-col gap-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-h3 text-h3 text-on-surface">{t.title}</h2>
                  <span className="font-mono-label text-mono-label uppercase tracking-widest px-2 py-1 border border-outline-variant text-outline shrink-0">
                    {t.organization_id ? "Org" : "Global"}
                  </span>
                </div>
                <p className="text-body-main text-on-surface-variant flex-1">{t.summary}</p>
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono-label text-mono-label text-outline uppercase tracking-wider">
                    {weightCount} weighted competencies
                  </span>
                  <Link
                    href={`/app/executive-intelligence/searches/new?template=${encodeURIComponent(t.key)}`}
                    className="bg-primary-container text-on-primary-container px-4 py-2 font-mono-label text-mono-label uppercase tracking-widest hover:brightness-110 transition-all flex items-center gap-1.5"
                  >
                    Use Template
                    <IconArrowRight size={15} />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
    </PageShell>
  );
}
