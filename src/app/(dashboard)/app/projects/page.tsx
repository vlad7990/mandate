import Link from "next/link";
import { cookies } from "next/headers";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { computePortfolioMetrics } from "@/lib/metrics/portfolio";
import { HEALTH_LABELS, type HealthStatus } from "@/lib/metrics/types";
import { SetBreadcrumbs } from "@/components/dashboard/breadcrumbs";
import { SampleBanner } from "@/components/sample/sample-banner";
import {
  SAMPLE_DISMISSED_COOKIE,
  SAMPLE_MANDATES,
  HEALTH_LABEL as SAMPLE_HEALTH_LABEL,
  shouldShowSample,
  type SampleHealth,
} from "@/lib/sample";
import { IconArrowRight } from "@/components/icons";

export const metadata = { title: "Mandates" };

/**
 * Every mandate in the workspace.
 *
 * This route did not exist. The rail's Mandates entry pointed at it and
 * would have 404'd, and the only way to see the full list was the
 * dashboard's table, which shows the top few. The dashboard comp's
 * "View all" link needs a destination.
 */

/** Health is a dot plus a word. Never a gauge, never a red-to-green ramp. */
function HealthDot({ status }: { status: HealthStatus | SampleHealth }) {
  const critical = status === "at_risk" || status === "blocked";
  const warn = status === "stalled" || status === "stalling";
  const label =
    status in HEALTH_LABELS
      ? HEALTH_LABELS[status as HealthStatus]
      : SAMPLE_HEALTH_LABEL[status as SampleHealth];

  return (
    <span
      className={`inline-flex items-center gap-2 text-xs ${
        critical || warn ? "text-error" : "text-on-surface-variant"
      }`}
    >
      <span
        aria-hidden
        className={`h-[7px] w-[7px] shrink-0 rounded-full ${
          critical || warn ? "bg-error" : "bg-outline"
        }`}
      />
      {label}
    </span>
  );
}

export default async function MandatesPage() {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("projects")
    .select("id, title, company_name, status, created_at")
    .order("created_at", { ascending: false });

  const projects = data ?? [];
  const dismissed =
    (await cookies()).get(SAMPLE_DISMISSED_COOKIE)?.value === "1";
  const showSample = shouldShowSample({
    hasRealData: projects.length > 0,
    dismissed,
  });

  // Only worth computing when there is something to compute it for.
  const metrics = projects.length > 0 ? await computePortfolioMetrics() : null;
  const healthByProject = new Map(
    metrics?.attentionList.map((a) => [a.projectId, a.status]) ?? []
  );

  return (
    <div className="mx-auto max-w-[1600px] px-6 py-6">
      <SetBreadcrumbs crumbs={[{ label: "Mandates" }]} />

      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight text-on-surface">
            Mandates
          </h1>
          <p className="mt-1.5 text-sm text-on-surface-variant">
            {showSample
              ? "An example portfolio — your own mandates will appear here."
              : `${projects.length} ${projects.length === 1 ? "mandate" : "mandates"} in this workspace.`}
          </p>
        </div>
        <Link
          href="/app/projects/new"
          className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-primary bg-primary px-4 text-sm font-semibold text-on-primary transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          New mandate
          <IconArrowRight size={15} />
        </Link>
      </div>

      {showSample && (
        <div className="mt-5">
          <SampleBanner scope="mandates" />
        </div>
      )}

      <div className="mt-5 overflow-hidden rounded-xl border border-outline-variant bg-surface-container-low">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse tabular-nums">
            <caption className="sr-only">
              {showSample
                ? "Example mandates, with stage, candidate counts and health."
                : "Your mandates, with stage, candidate counts and health."}
            </caption>
            <thead>
              <tr>
                {["Mandate", "Stage", "Candidates", "Tier 1", "Day", "Health"].map(
                  (h) => (
                    <th
                      key={h}
                      scope="col"
                      className="border-b border-outline-variant px-4 py-3 text-left font-mono-label text-[10px] font-bold uppercase tracking-[0.1em] text-outline"
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {showSample
                ? SAMPLE_MANDATES.map((m) => (
                    <tr key={m.id} className="border-b border-outline-variant/50 last:border-0">
                      <td className="px-4 py-3">
                        <Link
                          href={`/app/projects/${m.id}`}
                          className="block rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                        >
                          <span className="block text-[13px] font-medium text-on-surface">
                            {m.title}
                          </span>
                          <span className="block text-xs text-outline">
                            {m.company}
                          </span>
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-md bg-surface-container-high px-2 py-1 font-mono-label text-[10px] font-semibold uppercase tracking-[0.08em] text-on-surface-variant">
                          {m.stage}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono-data text-[13px] text-on-surface">
                        {String(m.candidates).padStart(2, "0")}
                      </td>
                      <td className="px-4 py-3 font-mono-data text-[13px] text-on-surface">
                        {m.tierOne === null ? (
                          <span className="text-outline">—</span>
                        ) : (
                          String(m.tierOne).padStart(2, "0")
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono-data text-[13px] text-on-surface-variant">
                        {m.dayOfSearch}
                      </td>
                      <td className="px-4 py-3">
                        <HealthDot status={m.health} />
                      </td>
                    </tr>
                  ))
                : projects.map((p) => (
                    <tr key={p.id} className="border-b border-outline-variant/50 last:border-0">
                      <td className="px-4 py-3">
                        <Link
                          href={`/app/projects/${p.id}`}
                          className="block rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                        >
                          <span className="block text-[13px] font-medium text-on-surface">
                            {p.title}
                          </span>
                          <span className="block text-xs text-outline">
                            {p.company_name}
                          </span>
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-md bg-surface-container-high px-2 py-1 font-mono-label text-[10px] font-semibold uppercase tracking-[0.08em] text-on-surface-variant">
                          {(p.status ?? "active").toUpperCase()}
                        </span>
                      </td>
                      {/* Per-candidate counts need a join this page does
                          not do yet; the mandate's own page has them. */}
                      <td className="px-4 py-3 text-outline">—</td>
                      <td className="px-4 py-3 text-outline">—</td>
                      <td className="px-4 py-3 text-outline">—</td>
                      <td className="px-4 py-3">
                        <HealthDot
                          status={healthByProject.get(p.id) ?? "healthy"}
                        />
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
