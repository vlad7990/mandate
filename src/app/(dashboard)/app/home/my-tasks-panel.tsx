import { createServerSupabaseClient } from "@/lib/supabase-server";
import { MyTasksList } from "./my-tasks-list";

/**
 * The viewer's open tasks (106) — work the desk asked of THEM, with a
 * Complete button whose right the RLS pin enforces. Renders nothing
 * when the viewer has no tasks and none were ever assigned; renders an
 * honest empty line once tasks are part of their working life.
 */
export async function MyTasksPanel() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("tasks")
    .select("id, title, detail, due_on, project_id, status")
    .eq("assignee_id", user.id)
    .eq("status", "open")
    .order("due_on", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  const tasks = (data ?? []) as Array<{
    id: string;
    title: string;
    detail: string;
    due_on: string | null;
    project_id: string | null;
    status: string;
  }>;

  if (tasks.length === 0) return null;

  const projectIds = [...new Set(tasks.map((t) => t.project_id).filter(Boolean))] as string[];
  const { data: projectRows } = projectIds.length
    ? await supabase.from("projects").select("id, title").in("id", projectIds)
    : { data: [] };
  const titles = new Map(
    ((projectRows ?? []) as Array<{ id: string; title: string }>).map((p) => [p.id, p.title])
  );

  return (
    <MyTasksList
      tasks={tasks.map((t) => ({
        ...t,
        project_title: t.project_id ? (titles.get(t.project_id) ?? null) : null,
      }))}
      today={new Date().toISOString().slice(0, 10)}
    />
  );
}
