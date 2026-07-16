import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import type { ExecutiveCompanyContext } from "@/lib/ai/executive-company-context-agent";
import {
  DECISION_SUPPORT_DISCLAIMER,
  SEARCH_STATUS_LABELS,
  SERVICE_TIER_LABELS,
  type ExecutiveAuditEventRow,
  type ExecutiveSearchRow,
  type SuccessProfileRow,
} from "@/lib/executive/types";
import {
  CompanyContextPoller,
  RegenerateContextButton,
} from "@/components/executive/company-context-controls";

function IntakeItem({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div>
      <dt className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
        {label}
      </dt>
      <dd className="text-body-main text-on-surface">{value}</dd>
    </div>
  );
}

function Panel({
  icon,
  title,
  children,
  action,
}: {
  icon: string;
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="bg-surface-container-low border border-outline-variant p-5 space-y-4">
      <header className="flex items-center justify-between gap-3">
        <span className="font-mono-label text-mono-label text-secondary-fixed-dim uppercase tracking-widest flex items-center gap-2">
          <span
            className="material-symbols-outlined text-[14px]"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            {icon}
          </span>
          # {title}
        </span>
        {action}
      </header>
      {children}
    </section>
  );
}

const AUDIT_EVENT_LABELS: Record<string, string> = {
  search_created: "Search created",
  search_updated: "Search updated",
  profile_generation_requested: "Profile generation requested",
  profile_generated: "AI draft generated",
  profile_generation_failed: "Generation failed",
  profile_edited: "Profile edited",
  profile_new_version: "New version created",
  profile_regenerated: "Regeneration requested",
  profile_approved: "Profile approved",
};

export default async function ExecutiveSearchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: search, error } = await supabase
    .from("executive_searches")
    .select("*")
    .eq("id", id)
    .single<ExecutiveSearchRow>();

  if (error || !search) {
    if (error?.code === "PGRST116") notFound();
    redirect("/executive-intelligence/searches");
  }

  const [{ data: profileRows }, { data: auditRows }, { count: competencyCount }] =
    await Promise.all([
      supabase
        .from("role_success_profiles")
        .select("id, version, status, is_generating, generation_error, updated_at")
        .eq("search_id", id)
        .order("version", { ascending: false })
        .limit(5),
      supabase
        .from("executive_audit_events")
        .select("id, event_type, created_at, detail")
        .eq("search_id", id)
        .order("created_at", { ascending: false })
        .limit(10),
      supabase
        .from("executive_search_competencies")
        .select("id", { count: "exact", head: true })
        .eq("search_id", id),
    ]);

  const profiles = (profileRows ?? []) as Pick<
    SuccessProfileRow,
    "id" | "version" | "status" | "is_generating" | "generation_error" | "updated_at"
  >[];
  const audit = (auditRows ?? []) as Pick<
    ExecutiveAuditEventRow,
    "id" | "event_type" | "created_at" | "detail"
  >[];

  const approvedProfile = profiles.find((p) => p.status === "approved") ?? null;
  const latestProfile = profiles[0] ?? null;
  const contextStatus = search.company_context_status;
  const context =
    contextStatus === "ready"
      ? (search.company_context as unknown as ExecutiveCompanyContext)
      : null;

  return (
    <div className="min-h-full p-6">
      {contextStatus === "generating" && <CompanyContextPoller />}
      <div className="max-w-6xl mx-auto pt-4 space-y-6">
        <div className="flex items-center gap-3 font-mono-label text-mono-label uppercase tracking-widest text-outline">
          <Link
            href="/executive-intelligence/searches"
            className="hover:text-on-surface transition-colors flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-[14px]">arrow_back</span>
            Executive Searches
          </Link>
          <span className="text-outline-variant">/</span>
          <span className="text-on-surface-variant">{search.role_title}</span>
        </div>

        <header className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-h1 text-h1 text-on-surface">
              {search.role_title}{" "}
              <span className="text-on-surface-variant">@ {search.company_name}</span>
            </h1>
            <span className="font-mono-label text-mono-label uppercase tracking-widest px-2.5 py-1 border border-outline-variant text-on-surface-variant">
              {SEARCH_STATUS_LABELS[search.status]}
            </span>
            <span className="font-mono-label text-mono-label uppercase tracking-widest px-2.5 py-1 border border-primary-container/60 text-primary">
              {SERVICE_TIER_LABELS[search.service_tier]}
            </span>
          </div>
          <p className="font-mono-label text-mono-label text-outline uppercase tracking-wider">
            Opened {new Date(search.created_at).toLocaleDateString()}
          </p>
        </header>

        {/* Success Profile status card */}
        <section className="bg-surface-container-low border border-primary-container/50 p-5 flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="font-mono-label text-mono-label text-primary uppercase tracking-widest">
              Executive Success Profile
            </span>
            <p className="text-body-main text-on-surface-variant max-w-xl">
              {approvedProfile
                ? `Version ${approvedProfile.version} approved — the search is calibrated against a human-approved profile.`
                : latestProfile
                  ? latestProfile.is_generating
                    ? "An AI draft is generating now."
                    : latestProfile.generation_error
                      ? "The last generation failed — open the profile to retry."
                      : `Draft V${String(latestProfile.version).padStart(2, "0")} awaits your review and approval.`
                  : "Not yet generated. The Role Architect drafts it from this intake and the company research; you review and approve."}
            </p>
          </div>
          <Link
            href={`/executive-intelligence/searches/${search.id}/success-profile`}
            className="bg-primary-container text-on-primary-container px-5 py-2.5 font-mono-label text-mono-label uppercase tracking-widest hover:brightness-110 transition-all flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-[16px]">architecture</span>
            {latestProfile ? "Open Profile" : "Generate Profile"}
          </Link>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Intake brief */}
          <Panel icon="assignment" title="Intake Brief">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              <IntakeItem label="Industry" value={search.industry} />
              <IntakeItem label="Business Model" value={search.business_model} />
              <IntakeItem label="Revenue" value={search.revenue_range} />
              <IntakeItem label="Employees" value={search.employee_count} />
              <IntakeItem label="Funding Stage" value={search.funding_stage} />
              <IntakeItem label="Ownership" value={search.ownership_structure} />
              <IntakeItem label="Footprint" value={search.geographic_footprint} />
              <IntakeItem label="Reporting Line" value={search.reporting_line} />
              <IntakeItem label="Board Exposure" value={search.board_exposure} />
              <IntakeItem label="Team Size" value={search.team_size} />
              <IntakeItem label="Budget / P&L" value={search.budget_scope} />
              <IntakeItem
                label="Role Type"
                value={
                  search.is_new_role == null
                    ? null
                    : search.is_new_role
                      ? "Newly created role"
                      : "Replacement"
                }
              />
            </dl>
            {search.regulatory_environment && (
              <IntakeItem label="Regulatory Environment" value={search.regulatory_environment} />
            )}
            {search.business_situation && (
              <IntakeItem label="Business Situation" value={search.business_situation} />
            )}
            {search.expected_90_day_outcomes && (
              <IntakeItem label="90-Day Outcomes" value={search.expected_90_day_outcomes} />
            )}
            {search.expected_first_year_outcomes && (
              <IntakeItem label="First-Year Outcomes" value={search.expected_first_year_outcomes} />
            )}
            {search.non_negotiables && (
              <IntakeItem label="Non-Negotiables" value={search.non_negotiables} />
            )}
          </Panel>

          {/* Company research */}
          <Panel
            icon="travel_explore"
            title="Company Operating Context"
            action={
              contextStatus === "failed" ? (
                <RegenerateContextButton searchId={search.id} />
              ) : contextStatus === "none" ? (
                <RegenerateContextButton searchId={search.id} label="Run Research" />
              ) : undefined
            }
          >
            {contextStatus === "generating" && (
              <div className="space-y-3">
                <p className="text-body-main text-on-surface-variant flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                  Company Context Agent is researching {search.company_name} — this
                  page updates automatically.
                </p>
                <div className="h-3 w-11/12 bg-surface-container-high rounded-sm animate-pulse" />
                <div className="h-3 w-4/5 bg-surface-container-high rounded-sm animate-pulse" />
                <div className="h-3 w-3/5 bg-surface-container-high rounded-sm animate-pulse" />
              </div>
            )}
            {contextStatus === "failed" && (
              <div className="border border-error/30 bg-error-container/10 px-4 py-3">
                <p className="text-body-main text-on-surface-variant">
                  <span className="text-error font-mono-label text-mono-label uppercase tracking-widest mr-2">
                    Research failed
                  </span>
                  {search.company_context_error ?? "Unknown error."}
                </p>
              </div>
            )}
            {contextStatus === "none" && (
              <p className="text-body-main text-on-surface-variant">
                Research has not been run for this search yet.
              </p>
            )}
            {context && (
              <div className="space-y-4">
                <p className="text-body-main text-on-surface whitespace-pre-line">
                  {context.operating_summary}
                </p>
                {context.operating_challenges?.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {context.operating_challenges.map((c) => (
                      <span
                        key={c}
                        className="font-mono-label text-mono-label uppercase tracking-wider px-2 py-1 border border-outline-variant text-on-surface-variant"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                )}
                {context.stage_and_scale_demands && (
                  <div>
                    <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest block mb-1">
                      Stage & Scale Demands
                    </span>
                    <p className="text-body-main text-on-surface-variant whitespace-pre-line">
                      {context.stage_and_scale_demands}
                    </p>
                  </div>
                )}
                {context.regulatory_and_governance && (
                  <div>
                    <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest block mb-1">
                      Regulatory & Governance
                    </span>
                    <p className="text-body-main text-on-surface-variant whitespace-pre-line">
                      {context.regulatory_and_governance}
                    </p>
                  </div>
                )}
                {context.sources?.length > 0 && (
                  <p className="font-mono-label text-mono-label text-outline uppercase tracking-wider">
                    {context.sources.length} sources · generated{" "}
                    {new Date(context.generated_at).toLocaleString()}
                  </p>
                )}
                <p className="font-mono-label text-mono-label text-outline uppercase tracking-wider border-t border-outline-variant/40 pt-3">
                  {DECISION_SUPPORT_DISCLAIMER}
                </p>
              </div>
            )}
          </Panel>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Versions */}
          <Panel icon="history" title="Profile Versions">
            {profiles.length === 0 ? (
              <p className="text-body-main text-outline">No versions yet.</p>
            ) : (
              <ul className="space-y-1">
                {profiles.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center justify-between font-mono-label text-mono-label uppercase tracking-wider text-on-surface-variant py-1.5 border-b border-outline-variant/30 last:border-0"
                  >
                    <span>V{String(p.version).padStart(2, "0")}</span>
                    <span
                      className={
                        p.status === "approved"
                          ? "text-primary"
                          : p.is_generating
                            ? "text-secondary-fixed-dim"
                            : p.generation_error
                              ? "text-error"
                              : "text-outline"
                      }
                    >
                      {p.is_generating
                        ? "generating"
                        : p.generation_error
                          ? "failed"
                          : p.status}
                    </span>
                    <span className="text-outline">
                      {new Date(p.updated_at).toLocaleDateString()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="font-mono-label text-mono-label text-outline uppercase tracking-wider">
              {competencyCount ?? 0} competency selections on this search
            </p>
          </Panel>

          {/* Audit trail */}
          <Panel icon="receipt_long" title="Audit Trail">
            {audit.length === 0 ? (
              <p className="text-body-main text-outline">No events recorded.</p>
            ) : (
              <ul className="space-y-1.5">
                {audit.map((e) => (
                  <li
                    key={e.id}
                    className="flex items-center justify-between gap-3 text-body-main text-on-surface-variant py-1 border-b border-outline-variant/30 last:border-0"
                  >
                    <span>{AUDIT_EVENT_LABELS[e.event_type] ?? e.event_type}</span>
                    <span className="font-mono-label text-mono-label text-outline uppercase tracking-wider shrink-0">
                      {new Date(e.created_at).toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
