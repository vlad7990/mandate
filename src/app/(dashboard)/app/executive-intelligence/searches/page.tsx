import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  SEARCH_STATUS_LABELS,
  SERVICE_TIER_LABELS,
  type ExecutiveSearchRow,
} from "@/lib/executive/types";

type SearchListRow = Pick<
  ExecutiveSearchRow,
  | "id"
  | "role_title"
  | "company_name"
  | "status"
  | "service_tier"
  | "company_context_status"
  | "created_at"
>;

export default async function ExecutiveSearchesPage() {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("executive_searches")
    .select(
      "id, role_title, company_name, status, service_tier, company_context_status, created_at"
    )
    .order("created_at", { ascending: false });

  const searches = (data ?? []) as SearchListRow[];

  return (
    <div className="min-h-full p-6">
      <div className="max-w-5xl mx-auto pt-4 space-y-6">
        <div className="flex items-center gap-3 font-mono-label text-mono-label uppercase tracking-widest text-outline">
          <Link
            href="/app/executive-intelligence"
            className="hover:text-on-surface transition-colors flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-[14px]">arrow_back</span>
            Executive Intelligence
          </Link>
          <span className="text-outline-variant">/</span>
          <span className="text-on-surface-variant">Searches</span>
        </div>

        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1">
            <h1 className="font-h2 text-h2 text-on-surface">Executive Searches</h1>
            <p className="text-body-main text-on-surface-variant">
              Structured due-diligence engagements — one per executive role.
            </p>
          </div>
          <Link
            href="/app/executive-intelligence/searches/new"
            className="bg-primary-container text-on-primary-container px-5 py-2.5 font-mono-label text-mono-label uppercase tracking-widest hover:brightness-110 transition-all flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-[16px]">add</span>
            New Search
          </Link>
        </header>

        {error && (
          <div className="border border-error/40 bg-error-container/30 px-4 py-3 rounded text-error text-body-main">
            Failed to load searches: {error.message}
          </div>
        )}

        {!error && searches.length === 0 && (
          <div className="bg-surface-container-low border border-outline-variant p-12 flex flex-col items-center text-center space-y-4">
            <span className="material-symbols-outlined text-[32px] text-outline">
              workspace_premium
            </span>
            <div className="space-y-1 max-w-md">
              <h2 className="font-h3 text-h3 text-on-surface">No executive searches yet</h2>
              <p className="text-body-main text-on-surface-variant">
                Start from a role template or a blank intake. The Company Context
                Agent and Role Architect take it from there — you approve every
                artifact.
              </p>
            </div>
            <div className="flex gap-3">
              <Link
                href="/app/executive-intelligence/searches/new"
                className="bg-primary-container text-on-primary-container px-5 py-2.5 font-mono-label text-mono-label uppercase tracking-widest hover:brightness-110 transition-all"
              >
                Start Blank
              </Link>
              <Link
                href="/app/executive-intelligence/templates"
                className="border border-outline-variant text-on-surface-variant px-5 py-2.5 font-mono-label text-mono-label uppercase tracking-widest hover:bg-surface-container transition-colors"
              >
                Browse Templates
              </Link>
            </div>
          </div>
        )}

        {searches.length > 0 && (
          <div className="bg-surface-container-low border border-outline-variant divide-y divide-outline-variant/40">
            {searches.map((s) => (
              <Link
                key={s.id}
                href={`/app/executive-intelligence/searches/${s.id}`}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 hover:bg-surface-container transition-colors"
              >
                <div className="space-y-0.5">
                  <p className="text-headline-md text-on-surface font-body-main">
                    {s.role_title}{" "}
                    <span className="text-on-surface-variant">@ {s.company_name}</span>
                  </p>
                  <p className="font-mono-label text-mono-label text-outline uppercase tracking-wider">
                    Opened {new Date(s.created_at).toLocaleDateString()} ·{" "}
                    {SERVICE_TIER_LABELS[s.service_tier]} tier · research{" "}
                    {s.company_context_status}
                  </p>
                </div>
                <span className="font-mono-label text-mono-label uppercase tracking-widest px-2.5 py-1 border border-outline-variant text-on-surface-variant">
                  {SEARCH_STATUS_LABELS[s.status]}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
