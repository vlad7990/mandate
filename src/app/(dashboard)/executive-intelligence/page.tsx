import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  DECISION_SUPPORT_DISCLAIMER,
  SEARCH_STATUS_LABELS,
  type ExecutiveSearchRow,
} from "@/lib/executive/types";

type ModuleArea = {
  label: string;
  icon: string;
  href: string | null;
  description: string;
};

// Phase 1 live areas link out; Phase 2+ areas render as planned-but-disabled
// so the module's full due-diligence arc is visible from day one.
const MODULE_AREAS: ModuleArea[] = [
  {
    label: "Executive Searches",
    icon: "workspace_premium",
    href: "/executive-intelligence/searches",
    description: "Due-diligence engagements per executive role",
  },
  {
    label: "Role Success Profiles",
    icon: "architecture",
    href: "/executive-intelligence/searches",
    description: "AI-drafted, human-approved success definitions",
  },
  {
    label: "Templates",
    icon: "content_copy",
    href: "/executive-intelligence/templates",
    description: "Curated intake presets for common mandates",
  },
  {
    label: "Competency Library",
    icon: "menu_book",
    href: "/executive-intelligence/competencies",
    description: "Evidence-based competencies behind every weight",
  },
  {
    label: "Candidates",
    icon: "person_search",
    href: null,
    description: "Executive candidate linkage — Phase 2",
  },
  {
    label: "Interview Plans",
    icon: "event_note",
    href: null,
    description: "Stage-by-stage evidence plans — Phase 2",
  },
  {
    label: "Active Interviews",
    icon: "forum",
    href: null,
    description: "Consent-based interview support — Phase 2",
  },
  {
    label: "Assessments",
    icon: "grading",
    href: null,
    description: "Structured evidence capture — Phase 2",
  },
  {
    label: "Risk Reviews",
    icon: "policy",
    href: null,
    description: "Pre-decision risk synthesis — Phase 2",
  },
  {
    label: "Final Reports",
    icon: "description",
    href: null,
    description: "Board-ready due-diligence reports — Phase 2",
  },
  {
    label: "Executive Advisors",
    icon: "diversity_3",
    href: null,
    description: "Advisor network — Phase 2",
  },
  {
    label: "Settings",
    icon: "settings",
    href: null,
    description: "Module configuration — Phase 2",
  },
];

type RecentSearch = Pick<
  ExecutiveSearchRow,
  "id" | "role_title" | "company_name" | "status" | "created_at"
>;

export default async function ExecutiveIntelligencePage() {
  const supabase = await createServerSupabaseClient();

  const [
    { count: activeSearches },
    { count: approvedProfiles },
    { count: templateCount },
    { count: competencyCount },
    { data: recentData },
  ] = await Promise.all([
    supabase
      .from("executive_searches")
      .select("id", { count: "exact", head: true })
      .eq("status", "active"),
    supabase
      .from("role_success_profiles")
      .select("id", { count: "exact", head: true })
      .eq("status", "approved"),
    supabase
      .from("executive_role_templates")
      .select("id", { count: "exact", head: true }),
    supabase
      .from("executive_competencies")
      .select("id", { count: "exact", head: true }),
    supabase
      .from("executive_searches")
      .select("id, role_title, company_name, status, created_at")
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const recent = (recentData ?? []) as RecentSearch[];

  const kpis = [
    { label: "Active Searches", value: activeSearches ?? 0 },
    { label: "Approved Profiles", value: approvedProfiles ?? 0 },
    { label: "Role Templates", value: templateCount ?? 0 },
    { label: "Competencies", value: competencyCount ?? 0 },
  ];

  return (
    <div className="min-h-full p-6">
      <div className="max-w-6xl mx-auto pt-4 space-y-8">
        <header className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="h-px w-8 bg-primary" />
            <span className="font-mono-label text-mono-label text-primary uppercase tracking-widest">
              Premium Module
            </span>
          </div>
          <h1 className="font-h1 text-h1 text-on-surface">Executive Intelligence</h1>
          <p className="text-body-main text-on-surface-variant max-w-3xl">
            Structured executive due diligence: has this candidate demonstrated the
            experience, judgment, leadership capability, operating scale, and
            company-stage fit required to succeed in this specific executive role —
            not merely &ldquo;did they interview well.&rdquo;
          </p>
          <p className="font-mono-label text-mono-label text-outline uppercase tracking-wider">
            {DECISION_SUPPORT_DISCLAIMER}
          </p>
        </header>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {kpis.map((k) => (
            <div
              key={k.label}
              className="bg-surface-container-low border border-outline-variant p-5 space-y-1"
            >
              <p className="font-mono-data text-h2 text-on-surface tabular-nums">{k.value}</p>
              <p className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
                {k.label}
              </p>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/executive-intelligence/searches/new"
            className="bg-primary-container text-on-primary-container px-6 py-3 font-mono-label text-mono-label uppercase tracking-widest hover:brightness-110 transition-all flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            New Executive Search
          </Link>
          <Link
            href="/executive-intelligence/templates"
            className="border border-outline-variant text-on-surface-variant px-6 py-3 font-mono-label text-mono-label uppercase tracking-widest hover:bg-surface-container transition-colors"
          >
            Start From Template
          </Link>
        </div>

        {recent.length > 0 && (
          <section className="space-y-3">
            <h2 className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
              Recent Searches
            </h2>
            <div className="bg-surface-container-low border border-outline-variant divide-y divide-outline-variant/40">
              {recent.map((s) => (
                <Link
                  key={s.id}
                  href={`/executive-intelligence/searches/${s.id}`}
                  className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-surface-container transition-colors"
                >
                  <span className="text-body-main text-on-surface">
                    {s.role_title}{" "}
                    <span className="text-on-surface-variant">@ {s.company_name}</span>
                  </span>
                  <span className="font-mono-label text-mono-label uppercase tracking-wider text-outline">
                    {SEARCH_STATUS_LABELS[s.status]}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        <section className="space-y-3">
          <h2 className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
            Module Map
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {MODULE_AREAS.map((area) =>
              area.href ? (
                <Link
                  key={area.label}
                  href={area.href}
                  className="bg-surface-container-low border border-outline-variant p-5 space-y-2 hover:border-primary-container/70 hover:bg-surface-container transition-colors"
                >
                  <span className="material-symbols-outlined text-[22px] text-primary">
                    {area.icon}
                  </span>
                  <p className="text-headline-md text-on-surface font-body-main">{area.label}</p>
                  <p className="text-body-main text-on-surface-variant">{area.description}</p>
                </Link>
              ) : (
                <div
                  key={area.label}
                  className="bg-surface-container-lowest border border-outline-variant/50 p-5 space-y-2 opacity-60"
                  aria-disabled
                >
                  <span className="material-symbols-outlined text-[22px] text-outline">
                    {area.icon}
                  </span>
                  <p className="text-headline-md text-on-surface-variant font-body-main">
                    {area.label}
                  </p>
                  <p className="text-body-main text-outline">{area.description}</p>
                </div>
              )
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
