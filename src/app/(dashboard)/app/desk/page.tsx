import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { SetBreadcrumbs } from "@/components/dashboard/breadcrumbs";
import { SampleBanner } from "@/components/sample/sample-banner";
import { ReassignControl } from "./reassign-control";
import { DigestPanel } from "./digest-panel";
import { TasksPanel } from "./tasks-panel";
import { loadDeskRollup } from "@/lib/desk/rollup";

/**
 * The desk — the Recruiting Manager's surface (persona programme phase 2).
 *
 * A per-recruiter rollup derived entirely from rows that already exist:
 * mandates by lead, candidates in them, placements by owner, last activity
 * by actor. Nothing here is scored or invented — every number is a count
 * the manager could reproduce by hand, which is the §13 lesson (derive,
 * don't restate) applied to the screen most at risk of contradicting its
 * own drill-downs.
 *
 * Route-guarded by `desk:manage` in ROUTE_RULES; the data below is all
 * org-readable anyway (the desk is a persona boundary, not a data one),
 * and the money stays behind `fees:read` on its own pages.
 */

export default async function DeskPage() {
  const supabase = await createServerSupabaseClient();
  const { desks, activeProjects, unassigned, candidateCountByProject, openTasks } =
    await loadDeskRollup(supabase);

  const { data: digestRows } = await supabase
    .from("desk_digests")
    .select("content_json, created_at")
    .order("created_at", { ascending: false })
    .limit(1);
  const latestDigest = digestRows?.[0] ?? null;

  // 106 widened the roster to researchers (they hold tasks); a mandate
  // LEAD stays admin/manager/recruiter — the 064 trigger refuses the
  // rest, so the picker never offers them.
  const reassignTargets = desks
    .filter((d) => ["admin", "manager", "recruiter"].includes(d.member.role))
    .map((d) => ({
      id: d.member.id,
      label: d.member.full_name || d.member.email,
    }));
  const taskAssignees = desks.map((d) => ({
    id: d.member.id,
    label: d.member.full_name || d.member.email,
  }));
  const today = new Date().toISOString().slice(0, 10);
  const hasRealData = activeProjects.length > 0;

  return (
    <div className="min-h-full bg-surface text-on-surface">
      <SetBreadcrumbs crumbs={[{ label: "Desk" }]} />
      <div className="max-w-6xl mx-auto px-8 py-10 space-y-8">
        <header className="space-y-2">
          <p className="font-mono-label text-mono-label uppercase tracking-widest text-outline">
            Desk oversight
          </p>
          <h1 className="font-h1 text-h1">DESK_OVERVIEW</h1>
          <p className="text-body-main text-on-surface-variant max-w-2xl">
            Every recruiter&apos;s load, pipeline and placements, derived from the
            live rows — nothing scored, nothing asserted. Money lives in{" "}
            <Link href="/app/placements" className="text-primary hover:underline">
              Placements
            </Link>
            .
          </p>
        </header>

        {!hasRealData && <SampleDesk />}

        {hasRealData && (
          <>
            <section aria-label="Per-recruiter rollup" className="border border-outline-variant">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-outline-variant bg-surface-container-low font-mono-label text-mono-label uppercase tracking-widest text-on-surface-variant">
                    <th scope="col" className="px-4 py-3">Member</th>
                    <th scope="col" className="px-4 py-3 text-right">Active mandates</th>
                    <th scope="col" className="px-4 py-3 text-right">Candidates</th>
                    <th scope="col" className="px-4 py-3 text-right">Placements (started)</th>
                    <th scope="col" className="px-4 py-3 text-right">Open tasks (overdue)</th>
                    <th scope="col" className="px-4 py-3 text-right">Last activity</th>
                  </tr>
                </thead>
                <tbody>
                  {desks.map(({ member, led, candidateCount, placementsTotal, placementsStarted, lastSeen, openTasks: memberOpen, overdueTasks }) => (
                    <tr key={member.id} className="border-b border-outline-variant/40 last:border-b-0 align-top">
                      <th scope="row" className="px-4 py-3 font-normal">
                        <span className="block text-on-surface">{member.full_name || member.email}</span>
                        <span className="font-mono-label text-mono-label uppercase tracking-widest text-outline">
                          {member.role}
                        </span>
                      </th>
                      <td className="px-4 py-3 text-right font-mono-data tabular-nums">{led.length}</td>
                      <td className="px-4 py-3 text-right font-mono-data tabular-nums">{candidateCount}</td>
                      <td className="px-4 py-3 text-right font-mono-data tabular-nums">
                        {placementsTotal} ({placementsStarted})
                      </td>
                      <td className={overdueTasks > 0 ? "px-4 py-3 text-right font-mono-data tabular-nums text-error" : "px-4 py-3 text-right font-mono-data tabular-nums"}>
                        {memberOpen} ({overdueTasks})
                      </td>
                      <td className="px-4 py-3 text-right font-mono-data tabular-nums text-on-surface-variant">
                        {lastSeen ? new Date(lastSeen).toISOString().slice(0, 10) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section aria-label="Mandates by lead" className="space-y-3">
              <h2 className="font-mono-label text-mono-label uppercase tracking-widest text-on-surface-variant">
                Mandates · {activeProjects.length} active
                {unassigned.length > 0 && ` · ${unassigned.length} unassigned`}
              </h2>
              <div className="border border-outline-variant divide-y divide-outline-variant/40">
                {activeProjects.map((p) => (
                  <div key={p.id} className="px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/app/projects/${p.id}`}
                        className="text-on-surface hover:text-primary transition-colors"
                      >
                        {p.title}
                      </Link>
                      <span className="text-on-surface-variant"> · {p.company_name}</span>
                      <span className="ml-2 font-mono-data text-mono-data text-outline tabular-nums">
                        {candidateCountByProject.get(p.id) ?? 0} candidates
                      </span>
                    </div>
                    <ReassignControl
                      projectId={p.id}
                      currentLeadId={p.lead_recruiter_id}
                      members={reassignTargets}
                    />
                  </div>
                ))}
              </div>
            </section>

            <TasksPanel
              tasks={openTasks}
              members={taskAssignees}
              projects={activeProjects.map((p) => ({ id: p.id, title: p.title }))}
              today={today}
            />

            <DigestPanel latest={latestDigest} />
          </>
        )}
      </div>
    </div>
  );
}

/**
 * The desk with no mandates yet — a labelled example so the screen teaches
 * its shape before the org has data (the standing sample-data rule). All
 * figures are derived from this static fixture by the same arithmetic the
 * live table uses; none of it is stored, counted or exported.
 */
function SampleDesk() {
  const sample = [
    { name: "Dana Whitfield", role: "manager", mandates: 1, candidates: 6, placements: "2 (1)", last: "2026-08-17" },
    { name: "Priya Anand", role: "recruiter", mandates: 3, candidates: 21, placements: "1 (1)", last: "2026-08-18" },
    { name: "Marcus Bell", role: "recruiter", mandates: 2, candidates: 9, placements: "0 (0)", last: "2026-08-12" },
  ];
  return (
    <div className="space-y-4">
      <SampleBanner scope="desk" />
      <section aria-label="Sample desk rollup" className="border border-outline-variant">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-outline-variant bg-surface-container-low font-mono-label text-mono-label uppercase tracking-widest text-on-surface-variant">
              <th scope="col" className="px-4 py-3">Member</th>
              <th scope="col" className="px-4 py-3 text-right">Active mandates</th>
              <th scope="col" className="px-4 py-3 text-right">Candidates</th>
              <th scope="col" className="px-4 py-3 text-right">Placements (started)</th>
              <th scope="col" className="px-4 py-3 text-right">Last activity</th>
            </tr>
          </thead>
          <tbody>
            {sample.map((s) => (
              <tr key={s.name} className="border-b border-outline-variant/40 last:border-b-0">
                <th scope="row" className="px-4 py-3 font-normal">
                  <span className="block text-on-surface">{s.name}</span>
                  <span className="font-mono-label text-mono-label uppercase tracking-widest text-outline">{s.role}</span>
                </th>
                <td className="px-4 py-3 text-right font-mono-data tabular-nums">{s.mandates}</td>
                <td className="px-4 py-3 text-right font-mono-data tabular-nums">{s.candidates}</td>
                <td className="px-4 py-3 text-right font-mono-data tabular-nums">{s.placements}</td>
                <td className="px-4 py-3 text-right font-mono-data tabular-nums text-on-surface-variant">{s.last}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
