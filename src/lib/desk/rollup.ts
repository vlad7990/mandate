import "server-only";
import type { createServerSupabaseClient } from "@/lib/supabase-server";

/**
 * The desk rollup — one loader shared by the desk page and the digest
 * agent, so the screen and the digest can never disagree about a count
 * (§13's same-thing-twice defect family, prevented structurally).
 *
 * Everything is derived from live rows with arithmetic a manager could
 * reproduce by hand. No scoring, no invention.
 */

type Supabase = Awaited<ReturnType<typeof createServerSupabaseClient>>;

export type DeskMember = {
  id: string;
  full_name: string | null;
  email: string;
  role: string;
};

export type DeskProject = {
  id: string;
  title: string;
  company_name: string;
  status: string;
  lead_recruiter_id: string | null;
  updated_at: string | null;
};

export type MemberDesk = {
  member: DeskMember;
  led: DeskProject[];
  candidateCount: number;
  placementsTotal: number;
  placementsStarted: number;
  lastSeen: string | null;
};

export type DeskRollup = {
  members: DeskMember[];
  activeProjects: DeskProject[];
  unassigned: DeskProject[];
  candidateCountByProject: Map<string, number>;
  desks: MemberDesk[];
};

export async function loadDeskRollup(supabase: Supabase): Promise<DeskRollup> {
  const [{ data: members }, { data: projects }, { data: candidates }, { data: placements }, { data: lastActivity }] =
    await Promise.all([
      supabase
        .from("users")
        .select("id, full_name, email, role, status")
        .eq("status", "active")
        .in("role", ["admin", "manager", "recruiter"])
        .order("full_name"),
      supabase
        .from("projects")
        .select("id, title, company_name, status, lead_recruiter_id, updated_at")
        .order("updated_at", { ascending: false }),
      supabase.from("candidates").select("id, project_id"),
      supabase.from("placements").select("id, owner_user_id, status"),
      supabase
        .from("activity_events")
        .select("actor_id, created_at")
        .order("created_at", { ascending: false })
        .limit(500),
    ]);

  const memberList = (members ?? []) as (DeskMember & { status: string })[];
  const projectList = (projects ?? []) as DeskProject[];

  const candidateCountByProject = new Map<string, number>();
  for (const c of (candidates ?? []) as { id: string; project_id: string | null }[]) {
    if (!c.project_id) continue;
    candidateCountByProject.set(c.project_id, (candidateCountByProject.get(c.project_id) ?? 0) + 1);
  }

  const placementsByOwner = new Map<string, { total: number; started: number }>();
  for (const p of (placements ?? []) as { id: string; owner_user_id: string | null; status: string }[]) {
    if (!p.owner_user_id) continue;
    const entry = placementsByOwner.get(p.owner_user_id) ?? { total: 0, started: 0 };
    entry.total += 1;
    // Vocabulary is lowercase ('started', 050's CHECK); the uppercase
    // variant silently counted zero — caught seeding the live smoke desk.
    if (p.status === "started") entry.started += 1;
    placementsByOwner.set(p.owner_user_id, entry);
  }

  const lastSeenByActor = new Map<string, string>();
  for (const e of (lastActivity ?? []) as { actor_id: string | null; created_at: string }[]) {
    if (e.actor_id && !lastSeenByActor.has(e.actor_id)) lastSeenByActor.set(e.actor_id, e.created_at);
  }

  const activeProjects = projectList.filter((p) => p.status !== "archived");
  const unassigned = activeProjects.filter((p) => !p.lead_recruiter_id);

  const desks: MemberDesk[] = memberList.map((m) => {
    const led = activeProjects.filter((p) => p.lead_recruiter_id === m.id);
    const pl = placementsByOwner.get(m.id) ?? { total: 0, started: 0 };
    return {
      member: { id: m.id, full_name: m.full_name, email: m.email, role: m.role },
      led,
      candidateCount: led.reduce((sum, p) => sum + (candidateCountByProject.get(p.id) ?? 0), 0),
      placementsTotal: pl.total,
      placementsStarted: pl.started,
      lastSeen: lastSeenByActor.get(m.id) ?? null,
    };
  });

  return { members: desks.map((d) => d.member), activeProjects, unassigned, candidateCountByProject, desks };
}
