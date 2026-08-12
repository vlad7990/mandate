import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import type { ExecutiveRoleTemplateRow } from "@/lib/executive/types";
import { NewExecutiveSearchForm } from "./new-executive-search-form";
import {
  IconArrowLeft,
  IconCopy,
} from "@/components/icons";

type SearchParams = Promise<{ error?: string; template?: string }>;

export default async function NewExecutiveSearchPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { error, template: templateKey } = await searchParams;

  // Template prefill is best-effort: an unknown key just renders a blank
  // form. Org-private overrides win over the global row with the same key —
  // matching the resolution in createExecutiveSearchAction.
  type TemplatePreview = Pick<
    ExecutiveRoleTemplateRow,
    "organization_id" | "key" | "title" | "intake_defaults"
  >;
  let template: TemplatePreview | null = null;
  if (templateKey) {
    const supabase = await createServerSupabaseClient();
    const { data } = await supabase
      .from("executive_role_templates")
      .select("organization_id, key, title, intake_defaults")
      .eq("key", templateKey);
    const candidates = (data ?? []) as TemplatePreview[];
    template =
      candidates.find((t) => t.organization_id !== null) ??
      candidates[0] ??
      null;
  }

  const defaults =
    template && typeof template.intake_defaults === "object" && template.intake_defaults
      ? template.intake_defaults
      : {};

  return (
    <div className="min-h-full p-6">
      <div className="max-w-4xl mx-auto pt-6 space-y-8">
        <div className="flex items-center gap-3 font-mono-label text-mono-label uppercase tracking-widest text-outline">
          <Link
            href="/app/executive-intelligence/searches"
            className="hover:text-on-surface transition-colors flex items-center gap-1.5"
          >
            <IconArrowLeft size={14} />
            Executive Searches
          </Link>
          <span className="text-outline-variant">/</span>
          <span className="text-on-surface-variant">New Search</span>
        </div>

        <header className="space-y-3">
          <h1 className="font-h2 text-h2 text-on-surface">New Executive Search</h1>
          <p className="text-on-surface-variant font-body-main max-w-2xl">
            A structured due-diligence brief. On creation, the Company Context Agent
            researches the operating environment, and the Executive Role Architect
            can then draft a Success Profile for your review and approval.
          </p>
          {template && (
            <div className="inline-flex items-center gap-2 border border-primary-container/70 bg-surface-container-lowest px-3 py-1.5">
              <IconCopy size={16} className="text-primary" />
              <span className="font-mono-label text-mono-label text-on-surface-variant uppercase tracking-widest">
                Prefilled from template: {template.title}
              </span>
            </div>
          )}
        </header>

        {error && (
          <div className="border border-error/40 bg-error-container/30 px-4 py-3 rounded text-error text-body-main">
            {error}
          </div>
        )}

        <NewExecutiveSearchForm
          defaults={defaults as Record<string, unknown>}
          templateKey={template?.key ?? null}
        />
      </div>
    </div>
  );
}
