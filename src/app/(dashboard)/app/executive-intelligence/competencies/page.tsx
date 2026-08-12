import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  IconArrowLeft,
} from "@/components/icons";
import {
  COMPETENCY_CATEGORY_LABELS,
  type CompetencyCategory,
  type ExecutiveCompetencyRow,
} from "@/lib/executive/types";

const CATEGORY_ORDER: CompetencyCategory[] = [
  "leadership",
  "functional",
  "operating",
  "governance",
];

export default async function ExecutiveCompetenciesPage() {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("executive_competencies")
    .select(
      "id, organization_id, key, name, category, definition, positive_indicators, negative_indicators"
    )
    .order("name");

  const competencies = (data ?? []) as ExecutiveCompetencyRow[];
  const byCategory = new Map<CompetencyCategory, ExecutiveCompetencyRow[]>(
    CATEGORY_ORDER.map((c) => [c, []])
  );
  for (const comp of competencies) {
    byCategory.get(comp.category)?.push(comp);
  }

  return (
    <div className="min-h-full p-6">
      <div className="max-w-5xl mx-auto pt-4 space-y-6">
        <div className="flex items-center gap-3 font-mono-label text-mono-label uppercase tracking-widest text-outline">
          <Link
            href="/app/executive-intelligence"
            className="hover:text-on-surface transition-colors flex items-center gap-1.5"
          >
            <IconArrowLeft size={14} />
            Executive Intelligence
          </Link>
          <span className="text-outline-variant">/</span>
          <span className="text-on-surface-variant">Competency Library</span>
        </div>

        <header className="space-y-1">
          <h1 className="font-h2 text-h2 text-on-surface">Competency Library</h1>
          <p className="text-body-main text-on-surface-variant max-w-2xl">
            Evidence-based executive competencies with observable indicators. The
            Role Architect weights profiles exclusively against this library, so
            every score traces to a defined, auditable competency.
          </p>
        </header>

        {error && (
          <div className="border border-error/40 bg-error-container/30 px-4 py-3 rounded text-error text-body-main">
            Failed to load competencies: {error.message}
          </div>
        )}

        {!error && competencies.length === 0 && (
          <div className="bg-surface-container-low border border-outline-variant p-12 text-center">
            <p className="text-body-main text-on-surface-variant">
              The library is empty. The global set is seeded by migration 033 —
              check that it has been applied.
            </p>
          </div>
        )}

        {CATEGORY_ORDER.map((category) => {
          const rows = byCategory.get(category) ?? [];
          if (rows.length === 0) return null;
          return (
            <section key={category} className="space-y-3">
              <h2 className="font-mono-label text-mono-label text-primary uppercase tracking-widest flex items-center gap-2">
                <span className="h-px w-6 bg-primary" />
                {COMPETENCY_CATEGORY_LABELS[category]} ({rows.length})
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {rows.map((c) => (
                  <div
                    key={c.id}
                    className="bg-surface-container-low border border-outline-variant p-5 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="text-headline-md text-on-surface font-body-main">
                        {c.name}
                      </h3>
                      <span className="font-mono-label text-mono-label uppercase tracking-wider text-outline shrink-0">
                        {c.organization_id ? "org" : "global"}
                      </span>
                    </div>
                    <p className="text-body-main text-on-surface-variant">{c.definition}</p>
                    {c.positive_indicators.length > 0 && (
                      <div>
                        <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest block mb-1">
                          Evidence of strength
                        </span>
                        <ul className="space-y-1">
                          {c.positive_indicators.map((ind) => (
                            <li key={ind} className="text-body-main text-on-surface-variant flex gap-2">
                              <span className="text-primary shrink-0">+</span>
                              {ind}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {c.negative_indicators.length > 0 && (
                      <div>
                        <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest block mb-1">
                          Evidence of concern
                        </span>
                        <ul className="space-y-1">
                          {c.negative_indicators.map((ind) => (
                            <li key={ind} className="text-body-main text-on-surface-variant flex gap-2">
                              <span className="text-error shrink-0">−</span>
                              {ind}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
