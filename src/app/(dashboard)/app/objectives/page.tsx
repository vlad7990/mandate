import { createServerSupabaseClient } from "@/lib/supabase-server";
import { SetBreadcrumbs } from "@/components/dashboard/breadcrumbs";
import { PageShell, TerminalTitle } from "@/components/ui/page-shell";
import { getAccess } from "@/lib/auth/access";
import { can } from "@/lib/auth/roles";
import { computeObjectiveProgress } from "@/lib/okrs/progress";
import {
  KEY_RESULT_COLUMNS,
  OBJECTIVE_COLUMNS,
  type KeyResultRow,
  type ObjectiveRow,
} from "@/lib/okrs/types";
import { ObjectivesPanel, type ObjectiveVM } from "./objectives-panel";

/**
 * The objectives board (107) — where recruiters and managers set OKRs
 * and watch them measure themselves.
 *
 * Readable by every active role (the Analytics/tasks shape: goals the
 * desk is measured by are visible work), writable behind `okrs:write`
 * per-control like the Kanban board — so there is no ROUTE_RULES
 * entry and the page renders read-only for a viewer. The money rule
 * is RLS's, not this page's: a financial key result row simply never
 * arrives for a role without `fees:read`, and the card renders what
 * arrived.
 */

type MemberLite = {
  id: string;
  full_name: string | null;
  email: string;
  role: string;
  status: string;
};

export default async function ObjectivesPage() {
  const supabase = await createServerSupabaseClient();
  const access = await getAccess();

  const canWrite = can(access?.role, "okrs:write");
  const isDesk = can(access?.role, "desk:manage");

  const [{ data: objectiveRows }, { data: krRows }, { data: memberRows }, { data: projectRows }] =
    await Promise.all([
      supabase
        .from("objectives")
        .select(OBJECTIVE_COLUMNS)
        .order("created_at", { ascending: false })
        .returns<ObjectiveRow[]>(),
      supabase
        .from("objective_key_results")
        .select(KEY_RESULT_COLUMNS)
        .order("created_at", { ascending: true })
        .returns<KeyResultRow[]>(),
      supabase
        .from("users")
        .select("id, full_name, email, role, status")
        .order("full_name")
        .returns<MemberLite[]>(),
      supabase
        .from("projects")
        .select("id, title")
        .neq("status", "archived")
        .order("updated_at", { ascending: false })
        .returns<Array<{ id: string; title: string }>>(),
    ]);

  const objectives = objectiveRows ?? [];
  const keyResults = krRows ?? [];
  const members = memberRows ?? [];
  const projects = projectRows ?? [];

  const memberLabel = new Map(members.map((m) => [m.id, m.full_name || m.email]));
  const projectTitle = new Map(projects.map((p) => [p.id, p.title]));

  const krsByObjective = new Map<string, KeyResultRow[]>();
  for (const kr of keyResults) {
    const bucket = krsByObjective.get(kr.objective_id);
    if (bucket) bucket.push(kr);
    else krsByObjective.set(kr.objective_id, [kr]);
  }

  const progressByObjective = await Promise.all(
    objectives.map((o) =>
      computeObjectiveProgress(o, krsByObjective.get(o.id) ?? [], supabase)
    )
  );

  const vms: ObjectiveVM[] = objectives.map((o, i) => {
    const progress = new Map(progressByObjective[i].map((p) => [p.keyResultId, p]));
    return {
      id: o.id,
      title: o.title,
      detail: o.detail,
      status: o.status,
      periodStart: o.period_start,
      periodEnd: o.period_end,
      ownerLabel: memberLabel.get(o.owner_user_id) ?? "unknown",
      projectTitle: o.project_id ? projectTitle.get(o.project_id) ?? null : null,
      keyResults: (krsByObjective.get(o.id) ?? []).map((kr) => ({
        id: kr.id,
        kind: kr.kind,
        label: kr.label,
        metric_source: kr.metric_source,
        target_value: kr.target_value === null ? null : Number(kr.target_value),
        currency: kr.currency,
        direction: kr.direction,
        attestedLabel: kr.attested_by ? memberLabel.get(kr.attested_by) ?? "unknown" : null,
        current: progress.get(kr.id)?.current ?? null,
        status: progress.get(kr.id)?.status ?? "pending",
      })),
    };
  });

  const active = objectives.filter((o) => o.status === "active").length;
  const closed = objectives.filter((o) => o.status === "closed").length;

  // The only legal owners (the 108 guard): active managers,
  // recruiters and researchers. Offered only to the desk — everyone
  // else creates for themselves and the picker would be a refusal
  // waiting to happen.
  const ownerOptions = isDesk
    ? members
        .filter(
          (m) =>
            m.status === "active" &&
            (m.role === "manager" || m.role === "recruiter" || m.role === "researcher")
        )
        .map((m) => ({ id: m.id, label: m.full_name || m.email }))
    : [];

  return (
    <PageShell className="space-y-5">
      <SetBreadcrumbs crumbs={[{ label: "Objectives" }]} />

      <div>
        <TerminalTitle>OBJECTIVES_AND_KEY_RESULTS</TerminalTitle>
        <p className="mt-2 font-mono-label text-mono-label uppercase leading-[1.5] tracking-widest text-on-surface-variant tabular-nums">
          {[
            `${objectives.length} objective${objectives.length === 1 ? "" : "s"}`,
            `${active} active`,
            `${closed} closed`,
            canWrite ? null : "read-only",
          ]
            .filter(Boolean)
            .join(" // ")}
        </p>
      </div>

      <ObjectivesPanel
        objectives={vms}
        canWrite={canWrite}
        ownerOptions={ownerOptions}
        projects={projects}
      />
    </PageShell>
  );
}
