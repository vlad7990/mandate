import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { cn } from "@/lib/utils";
import {
  actionSummary,
  buildActionQueue,
  type ActionItem,
  type ActionSeverity,
} from "@/lib/home/action-queue";
import type { NotifiableCandidate } from "@/lib/candidates/notification";
import {
  IconAlert,
  IconArrowRight,
  IconCheckCircle,
  IconChecklist,
} from "@/components/icons";

/**
 * What needs doing today, across every mandate.
 *
 * Sits at the top of the portfolio because the rest of that page answers
 * "how are my searches doing" and this answers "what do I do now" — and only
 * one of those gets acted on before lunch.
 *
 * Every read here is org-scoped by RLS; nothing widens access.
 */

const SEVERITY_TONE: Record<ActionSeverity, string> = {
  urgent: "border-error/50 bg-error/10 text-error",
  attention: "border-tertiary/50 bg-tertiary/10 text-tertiary",
  routine: "border-outline-variant text-on-surface-variant",
};

/** Long enough to be useful, short enough that the list stays a to-do list. */
const MAX_VISIBLE = 8;

export async function ActionQueuePanel() {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [projectsQ, candidatesQ, runsQ, undecidedQ, myTasksQ] = await Promise.all([
    supabase.from("projects").select("id, title"),
    supabase
      .from("candidates")
      .select("project_id, source_kind, sourced_at, subject_notified_at")
      .eq("source_kind", "sourced"),
    supabase.from("sourcing_runs").select("id, project_id, status"),
    supabase
      .from("sourcing_run_results")
      .select("run_id")
      .is("promoted_candidate_id", null),
    supabase
      .from("tasks")
      .select("id, title, due_on")
      .eq("status", "open")
      .eq("assignee_id", user?.id ?? ""),
  ]);

  const items = buildActionQueue(
    {
      projects: (projectsQ.data ?? []) as Array<{ id: string; title: string }>,
      candidates: (candidatesQ.data ?? []) as Array<
        NotifiableCandidate & { project_id: string | null }
      >,
      runs: (runsQ.data ?? []) as Array<{
        id: string;
        project_id: string;
        status: string;
      }>,
      undecidedResults: (undecidedQ.data ?? []) as Array<{ run_id: string }>,
      myTasks: (myTasksQ.data ?? []) as Array<{
        id: string;
        title: string;
        due_on: string | null;
      }>,
    },
    new Date()
  );

  const summary = actionSummary(items);
  const visible = items.slice(0, MAX_VISIBLE);

  return (
    <section className="space-y-3">
      <header className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2 className="font-mono-label text-mono-label text-primary uppercase tracking-widest flex items-center gap-2">
          <IconChecklist size={14} />
          NEEDS_YOU · across every mandate
        </h2>
        {items.length > 0 && (
          <span className="font-mono-label text-mono-label uppercase tracking-widest tabular-nums text-on-surface-variant">
            {summary.urgent > 0 && (
              <span className="text-error">{summary.urgent} urgent · </span>
            )}
            {items.length} open
          </span>
        )}
      </header>

      {items.length === 0 ? (
        <div className="bg-surface-container-low border border-outline-variant px-4 py-3 flex items-center gap-2">
          <IconCheckCircle size={14} className="text-secondary-fixed-dim shrink-0" />
          <p className="text-body-main text-on-surface-variant">
            Nothing outstanding — no notifications owed, no imports waiting on a
            decision, no saved search left unrun.
          </p>
        </div>
      ) : (
        <ul className="bg-surface-container-low border border-outline-variant divide-y divide-outline-variant/40">
          {visible.map((item) => (
            <ActionRow key={`${item.kind}-${item.project_id}`} item={item} />
          ))}
          {items.length > MAX_VISIBLE && (
            <li className="px-4 py-2 font-mono-label text-mono-label text-outline uppercase tracking-widest tabular-nums">
              +{items.length - MAX_VISIBLE} more across your mandates
            </li>
          )}
        </ul>
      )}
    </section>
  );
}

function ActionRow({ item }: { item: ActionItem }) {
  return (
    <li>
      <Link
        href={item.href}
        prefetch={false}
        className="flex items-center gap-3 px-4 py-3 hover:bg-surface-container-high transition-colors group"
      >
        <span
          className={cn(
            "px-1.5 py-0 border shrink-0 font-mono-label text-mono-label uppercase tracking-widest flex items-center gap-1",
            SEVERITY_TONE[item.severity]
          )}
        >
          {item.severity === "urgent" && <IconAlert size={12} />}
          {item.severity}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-body-main text-on-surface">{item.label}</p>
          <p className="font-mono-label text-mono-label text-outline uppercase tracking-widest truncate">
            {item.project_title ?? "your desk"}
          </p>
        </div>
        <IconArrowRight
          size={16}
          className="text-outline group-hover:text-primary transition-colors shrink-0"
        />
      </Link>
    </li>
  );
}
