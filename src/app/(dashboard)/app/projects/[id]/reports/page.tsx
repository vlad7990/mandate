import { notFound, redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { SetBreadcrumbs } from "@/components/dashboard/breadcrumbs";
import { MastHead } from "@/components/ui/mast-head";
import { LiveTick } from "@/components/ui/live-tick";
import type { WeeklyReport } from "@/lib/ai/weekly-report-agent";
import { IconChevronDown, IconDocument } from "@/components/icons";
import {
  GenerateReportButton,
  ReportExportActions,
} from "./report-actions-client";

type ProjectRow = {
  id: string;
  title: string;
  company_name: string;
};

type ReportRow = {
  id: string;
  week_starting: string;
  content: WeeklyReport;
  generated_at: string;
  ai_model: string;
};

export default async function WeeklyReportsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, title, company_name")
    .eq("id", id)
    .single<ProjectRow>();

  if (projectError || !project) {
    if (projectError?.code === "PGRST116") notFound();
    redirect("/");
  }

  const { data: rawReports } = await supabase
    .from("project_reports")
    .select("id, week_starting, content, generated_at, ai_model")
    .eq("project_id", id)
    .order("generated_at", { ascending: false });

  const reports = (rawReports ?? []) as ReportRow[];
  const latest = reports[0] ?? null;
  const archive = reports.slice(1);

  return (
    <div className="px-6 py-6 space-y-5 max-w-[1400px] mx-auto">
      <SetBreadcrumbs
        crumbs={[
          { label: project.title, href: `/app/projects/${project.id}`, maxChars: 32 },
          { label: "Weekly Report" },
        ]}
      />

      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div className="space-y-2">
          <h1 className="font-h1 text-h1 text-on-surface tracking-tight">
            WEEKLY_PROGRESS_REPORT
          </h1>
          <p className="font-mono-label text-mono-label text-on-surface-variant uppercase tracking-widest">
            {reports.length === 0
              ? "No reports yet — generate the first one to share with your client."
              : `${reports.length} report${reports.length === 1 ? "" : "s"} on file · ${project.company_name}`}
          </p>
        </div>
        <GenerateReportButton projectId={project.id} />
      </header>

      {latest ? (
        <article className="bg-surface-container border border-outline-variant overflow-hidden">
          <header className="bg-surface-container-high px-5 py-3 border-b border-outline-variant flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="font-h2 text-h2 text-on-surface uppercase tracking-tight">
                Week of {latest.week_starting}
              </h2>
              <p className="font-mono-label text-mono-label text-outline uppercase tracking-widest mt-0.5">
                Generated <LiveTick iso={latest.generated_at} label="" pulse={false} />
                {latest.ai_model && ` · ${latest.ai_model}`}
              </p>
            </div>
            <ReportExportActions
              report={latest.content}
              projectTitle={project.title}
              companyName={project.company_name}
              generatedAt={latest.generated_at}
            />
          </header>
          <div className="p-5">
            <ReportBody report={latest.content} />
          </div>
        </article>
      ) : (
        <div className="bg-surface-container-low border border-outline-variant px-8 py-12 flex flex-col items-center text-center space-y-4 relative overflow-hidden">
          <div
            className="absolute inset-0 terminal-grid opacity-10 pointer-events-none"
            aria-hidden
          />
          <div className="relative w-16 h-16 border border-primary-container/40 bg-primary-container/10 flex items-center justify-center">
            <IconDocument size={28} className="text-primary" />
          </div>
          <p className="text-body-main text-on-surface-variant max-w-md relative">
            The agent will pull this week&rsquo;s sourced candidates, pipeline
            movement, ranking changes, and feedback into a single client-ready
            briefing. Click <strong>Generate Weekly Report</strong> above to
            create the first one.
          </p>
        </div>
      )}

      {archive.length > 0 && (
        <section className="space-y-2">
          <MastHead
            tone="neutral"
            label={
              <span className="flex items-baseline gap-2">
                <span>Archive</span>
                <span className="text-outline tabular-nums">
                  · {String(archive.length).padStart(2, "0")}
                </span>
              </span>
            }
          />
          <ul className="space-y-2">
            {archive.map((r) => (
              <li
                key={r.id}
                className="bg-surface-container-low border border-outline-variant p-3"
              >
                <details className="group">
                  <summary className="flex items-center justify-between gap-3 cursor-pointer">
                    <div>
                      <div className="font-h2 text-h2 text-on-surface uppercase tracking-tight">
                        Week of {r.week_starting}
                      </div>
                      <div className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
                        Generated{" "}
                        <LiveTick iso={r.generated_at} label="" pulse={false} />
                      </div>
                    </div>
                    <IconChevronDown
                      size={20}
                      className="text-outline group-open:rotate-180 transition-transform"
                    />
                  </summary>
                  <div className="mt-3 pt-3 border-t border-outline-variant/40 space-y-3">
                    <ReportExportActions
                      report={r.content}
                      projectTitle={project.title}
                      companyName={project.company_name}
                      generatedAt={r.generated_at}
                    />
                    <ReportBody report={r.content} />
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function ReportBody({ report }: { report: WeeklyReport }) {
  return (
    <div className="space-y-5">
      <Section title="Executive Summary">
        <p className="text-on-surface text-body-main leading-relaxed whitespace-pre-line">
          {report.executive_summary}
        </p>
      </Section>

      <Section title={`Top ${report.top_candidates.length} Candidates`}>
        {report.top_candidates.length === 0 ? (
          <p className="font-mono-label text-mono-label text-outline italic uppercase tracking-widest">
            No ranked candidates yet.
          </p>
        ) : (
          <ol className="space-y-2">
            {report.top_candidates.map((c, i) => (
              <li
                key={c.candidate_id}
                className="flex items-start gap-3 bg-surface-container-low border border-outline-variant px-3 py-2"
              >
                <span className="font-h2 text-h2 text-primary tabular-nums w-8 shrink-0">
                  #{i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-mono-data text-body-main text-on-surface font-semibold">
                    {c.name}
                  </div>
                  <p className="text-body-main text-on-surface-variant mt-0.5 leading-relaxed">
                    {c.one_liner}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Section title={`Sourced This Week · ${report.candidates_sourced_count}`}>
          {report.candidates_sourced_names.length === 0 ? (
            <p className="font-mono-label text-mono-label text-outline italic uppercase tracking-widest">
              None.
            </p>
          ) : (
            <ul className="space-y-1 font-mono-data text-body-main text-on-surface-variant">
              {report.candidates_sourced_names.map((n, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-outline shrink-0">·</span>
                  <span>{n}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Pipeline Movement">
          {report.pipeline_moves.length === 0 ? (
            <p className="font-mono-label text-mono-label text-outline italic uppercase tracking-widest">
              No stage changes this week.
            </p>
          ) : (
            <ul className="space-y-1 font-mono-data text-body-main text-on-surface-variant">
              {report.pipeline_moves.map((m, i) => (
                <li key={i}>
                  <span className="font-semibold text-on-surface">
                    {m.name}
                  </span>{" "}
                  · {m.from_stage} → {m.to_stage}
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Ranking Changes">
          {report.rank_moves.length === 0 ? (
            <p className="font-mono-label text-mono-label text-outline italic uppercase tracking-widest">
              No ranking shifts this week.
            </p>
          ) : (
            <ul className="space-y-1 font-mono-data text-body-main text-on-surface-variant">
              {report.rank_moves.map((r, i) => (
                <li key={i} className="flex items-baseline gap-2">
                  <span
                    className={
                      r.direction === "up"
                        ? "text-secondary-fixed-dim"
                        : "text-error"
                    }
                  >
                    {r.direction === "up" ? "▲" : "▼"} {r.delta}
                  </span>
                  <span className="font-semibold text-on-surface">
                    {r.name}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Feedback Insights">
          {report.feedback_insights.length === 0 ? (
            <p className="font-mono-label text-mono-label text-outline italic uppercase tracking-widest">
              No new feedback this week.
            </p>
          ) : (
            <ul className="space-y-2">
              {report.feedback_insights.map((f, i) => (
                <li key={i}>
                  <div className="font-mono-label text-mono-label text-secondary-fixed-dim uppercase tracking-widest">
                    {f.topic}
                  </div>
                  <p className="text-body-main text-on-surface-variant">
                    {f.detail}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <Section title="Next Steps">
        <ol className="space-y-1 list-decimal list-inside font-mono-data text-body-main text-on-surface-variant">
          {report.next_steps.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>
      </Section>

      <Section title="Market Commentary">
        <div className="bg-primary-container/10 border-l-2 border-l-primary-container px-3 py-3">
          <p className="text-on-surface text-body-main leading-relaxed">
            {report.market_commentary}
          </p>
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="font-mono-label text-mono-label text-outline uppercase tracking-widest border-b border-outline-variant/40 pb-1">
        {title}
      </h3>
      {children}
    </section>
  );
}
