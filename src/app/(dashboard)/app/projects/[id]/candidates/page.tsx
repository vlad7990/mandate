import Link from "next/link";
import { CapabilityGate } from "@/components/auth/capability-gate";
import { notFound, redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  PIPELINE_LABELS,
  type Archetype,
  type PipelineStage,
} from "@/lib/ai/cv-parsing";
import { cn } from "@/lib/utils";
import { platformLabel } from "@/lib/sourcing/runs";
import {
  notificationBacklog,
  notificationLabel,
  notificationState,
} from "@/lib/candidates/notification";
import {
  IconArrowLeft,
  IconChevronRight,
  IconGroup,
  IconMail,
  IconPlus,
  IconRefresh,
  IconTarget,
  IconUpload,
} from "@/components/icons";

type ProjectRow = {
  id: string;
  title: string;
  company_name: string;
};

type CandidateRow = {
  id: string;
  full_name: string;
  current_title: string | null;
  current_company: string | null;
  archetype: string | null;
  pipeline_stage: string | null;
  cv_processing: boolean;
  cv_parse_error: string | null;
  updated_at: string;
  source_kind: string | null;
  source_platform: string | null;
  sourced_at: string | null;
  subject_notified_at: string | null;
};

/**
 * Which sourcing run a person is credited to. First touch — the earliest
 * EXECUTED run that surfaced them — read from `sourcing_candidate_attribution`
 * rather than stored, so back-filling an earlier run later corrects the answer
 * instead of leaving a stale winner behind.
 */
type Origin = {
  runId: string;
  version: number;
  label: string | null;
};

const STAGE_TONES: Record<string, string> = {
  found: "border-outline-variant text-on-surface-variant",
  reviewed: "border-primary-container/40 text-primary",
  matched: "border-primary-container/40 text-primary",
  shortlisted: "border-secondary-fixed-dim/40 text-secondary-fixed-dim",
  submitted: "border-secondary-fixed-dim/40 text-secondary-fixed-dim",
  interviewed: "border-tertiary/40 text-tertiary",
  passed_rounds: "border-tertiary/40 text-tertiary",
  finalist: "border-secondary-fixed-dim/60 text-secondary-fixed-dim",
  offer: "border-secondary-fixed-dim/60 text-secondary-fixed-dim",
  hired: "bg-secondary-fixed-dim/10 border-secondary-fixed-dim/40 text-secondary-fixed-dim",
  rejected: "border-error/40 text-error",
};

const ARCHETYPE_TONES: Record<Archetype, string> = {
  Builder: "border-primary-container/40 text-primary",
  Operator: "border-secondary-fixed-dim/40 text-secondary-fixed-dim",
  Transformer: "border-tertiary/40 text-tertiary",
  Infrastructure: "border-outline-variant text-on-surface-variant",
};

export default async function CandidatesPage({
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

  const { data: candidateRows, error: candidatesError } = await supabase
    .from("candidates")
    .select(
      "id, full_name, current_title, current_company, archetype, pipeline_stage, cv_processing, cv_parse_error, updated_at, source_kind, source_platform, sourced_at, subject_notified_at"
    )
    .eq("project_id", id)
    .order("updated_at", { ascending: false });

  if (candidatesError) {
    redirect(`/app/projects/${id}`);
  }

  const candidates = (candidateRows ?? []) as CandidateRow[];
  const origins = await loadOrigins(supabase, id);
  // Art. 14 backlog. Sourced people who have never been told we hold their
  // data are an open legal obligation, so the count belongs in the header
  // rather than buried one click into each record.
  const now = new Date();
  const backlog = notificationBacklog(candidates, now);

  return (
    <div className="min-h-full bg-surface text-on-surface">
      <div className="max-w-7xl mx-auto px-8 py-10 space-y-6">
        {/* breadcrumb */}
        <div className="flex items-center gap-3 font-mono-label text-mono-label uppercase tracking-widest text-outline">
          <Link
            href={`/app/projects/${project.id}`}
            prefetch={false}
            className="hover:text-on-surface transition-colors flex items-center gap-1.5"
          >
            <IconArrowLeft size={14} />
            Mandate
          </Link>
          <span className="text-outline-variant">/</span>
          <span className="text-on-surface-variant">{project.title}</span>
          <span className="text-outline-variant">/</span>
          <span className="text-primary">Candidates</span>
        </div>

        <header className="flex justify-between items-end gap-4 flex-wrap">
          <div>
            <h1 className="font-h1 text-h1 text-primary">CANDIDATE INTEL</h1>
            <p className="font-mono-label text-mono-label text-outline uppercase tracking-widest mt-1">
              {candidates.length} {candidates.length === 1 ? "candidate" : "candidates"} ·{" "}
              {project.company_name}
            </p>
            {(backlog.due > 0 || backlog.overdue > 0) && (
              <p
                className={cn(
                  "font-mono-label text-mono-label uppercase tracking-widest mt-1 flex items-center gap-1.5",
                  backlog.overdue > 0 ? "text-error" : "text-tertiary"
                )}
              >
                <IconMail size={12} />
                {backlog.overdue > 0
                  ? `${backlog.overdue} notification${backlog.overdue === 1 ? "" : "s"} overdue`
                  : `${backlog.due} notification${backlog.due === 1 ? "" : "s"} owed`}
                {backlog.overdue > 0 && backlog.due > 0
                  ? ` · ${backlog.due} more owed`
                  : ""}
              </p>
            )}
          </div>
          <CapabilityGate capability="candidates:write">
            <Link
              href={`/app/projects/${project.id}/candidates/new`}
              prefetch={false}
              className="px-6 py-3 bg-primary-container text-on-primary-container font-mono-label text-mono-label uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-all flex items-center gap-2"
            >
              <IconPlus size={16} />
              Add Candidate
            </Link>
          </CapabilityGate>
        </header>

        {candidates.length === 0 ? (
          <EmptyState projectId={project.id} />
        ) : (
          <ul className="bg-surface-container-low border border-outline-variant divide-y divide-outline-variant/40">
            {candidates.map((c) => (
              <CandidateRow
                key={c.id}
                projectId={project.id}
                candidate={c}
                origin={origins.get(c.id) ?? null}
                now={now}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function EmptyState({ projectId }: { projectId: string }) {
  return (
    <div className="bg-surface-container-low border border-outline-variant p-12 flex flex-col items-center text-center space-y-6">
      <div className="w-16 h-16 bg-primary-container/10 border border-primary-container/40 flex items-center justify-center">
        <IconGroup size={28} className="text-primary" />
      </div>
      <div className="space-y-2 max-w-md">
        <h2 className="font-h2 text-h2">No candidates yet</h2>
        <p className="text-body-main text-on-surface-variant">
          Upload a PDF or DOCX CV to parse the candidate profile and score
          fit against this role&rsquo;s calibration model.
        </p>
      </div>
      <CapabilityGate capability="candidates:write">
        <Link
          href={`/app/projects/${projectId}/candidates/new`}
          prefetch={false}
          className="px-6 py-3 bg-primary-container text-on-primary-container font-mono-label text-mono-label uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-all flex items-center gap-2"
        >
          <IconUpload size={16} />
          Add Candidate
        </Link>
      </CapabilityGate>
    </div>
  );
}

/**
 * First-touch attribution for every sourced person in this search, in two
 * reads. The view already resolves the winner per candidate; the second query
 * only supplies the labels the chip prints.
 */
async function loadOrigins(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  projectId: string
): Promise<Map<string, Origin>> {
  const origins = new Map<string, Origin>();

  const { data: attributionRows } = await supabase
    .from("sourcing_candidate_attribution")
    .select("candidate_id, attributed_run_id")
    .eq("project_id", projectId);

  const attribution = (attributionRows ?? []) as Array<{
    candidate_id: string;
    attributed_run_id: string;
  }>;
  if (attribution.length === 0) return origins;

  const { data: runRows } = await supabase
    .from("sourcing_runs")
    .select("id, version, label")
    .eq("project_id", projectId);

  const runsById = new Map(
    ((runRows ?? []) as Array<{
      id: string;
      version: number;
      label: string | null;
    }>).map((r) => [r.id, r])
  );

  for (const row of attribution) {
    const run = runsById.get(row.attributed_run_id);
    if (!run) continue;
    origins.set(row.candidate_id, {
      runId: run.id,
      version: run.version,
      label: run.label,
    });
  }

  return origins;
}

function CandidateRow({
  projectId,
  candidate,
  origin,
  now,
}: {
  projectId: string;
  candidate: CandidateRow;
  origin: Origin | null;
  now: Date;
}) {
  const stage = (candidate.pipeline_stage ?? "found") as PipelineStage;
  const archetype = candidate.archetype as Archetype | null;
  const stageTone = STAGE_TONES[stage] ?? STAGE_TONES.found;

  return (
    // The origin chip links to its RUN, not to the candidate, so it has to sit
    // outside the row link rather than nested inside it.
    <li className="flex items-center hover:bg-surface-container-high transition-colors group">
      <Link
        href={`/app/projects/${projectId}/candidates/${candidate.id}`}
        prefetch={false}
        className="flex-1 min-w-0 flex items-center gap-4 px-5 py-4"
      >
        <span className="w-10 h-10 bg-surface-container-high border border-outline-variant flex items-center justify-center font-mono-data text-mono-data text-on-surface uppercase">
          {initials(candidate.full_name)}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-on-surface text-body-main font-semibold truncate">
              {candidate.full_name}
            </span>
            {candidate.cv_processing && (
              <span className="font-mono-label text-mono-label text-primary uppercase tracking-wider flex items-center gap-1.5">
                <IconRefresh size={12} className="animate-spin" />
                Parsing
              </span>
            )}
            {candidate.cv_parse_error && (
              <span className="font-mono-label text-mono-label text-error uppercase tracking-wider">
                Parse failed
              </span>
            )}
          </div>
          <div className="font-mono-data text-body-main text-on-surface-variant truncate">
            {candidate.current_title ?? "—"}
            {candidate.current_company ? ` @ ${candidate.current_company}` : ""}
          </div>
        </div>
        <div className="hidden md:flex items-center gap-2 shrink-0">
          {archetype && (
            <span
              className={cn(
                "px-2 py-0.5 border font-mono-label text-mono-label uppercase tracking-wider",
                ARCHETYPE_TONES[archetype]
              )}
            >
              {archetype}
            </span>
          )}
          <span
            className={cn(
              "px-2 py-0.5 border font-mono-label text-mono-label uppercase tracking-wider",
              stageTone
            )}
          >
            {PIPELINE_LABELS[stage]}
          </span>
        </div>
        <span className="font-mono-label text-mono-label text-outline uppercase tracking-wider hidden lg:inline">
          {formatRelative(candidate.updated_at)}
        </span>
      </Link>
      <NotificationChip
        projectId={projectId}
        candidateId={candidate.id}
        candidate={candidate}
        now={now}
      />
      <OriginChip
        projectId={projectId}
        sourceKind={candidate.source_kind}
        sourcePlatform={candidate.source_platform}
        origin={origin}
      />
      <IconChevronRight
        size={18}
        className="mr-5 ml-2 shrink-0 text-outline group-hover:text-primary transition-colors"
      />
    </li>
  );
}

/**
 * Art. 14 chip — shown only while a notification is actually owed.
 *
 * It disappears once the person has been told, because a permanent "notified"
 * badge on every sourced candidate is noise that trains people to stop reading
 * the row. What needs to be visible is the open obligation and how late it is.
 * It links to the Outreach tab, which is the only place the duty can be
 * discharged.
 */
function NotificationChip({
  projectId,
  candidateId,
  candidate,
  now,
}: {
  projectId: string;
  candidateId: string;
  candidate: CandidateRow;
  now: Date;
}) {
  const state = notificationState(candidate, now);
  if (state.status !== "due" && state.status !== "overdue") return null;

  const overdue = state.status === "overdue";
  return (
    <Link
      href={`/app/projects/${projectId}/candidates/${candidateId}#outreach`}
      prefetch={false}
      title="GDPR Art. 14: this person did not give us their data and has not been told we hold it."
      className={cn(
        "hidden sm:flex items-center gap-1.5 shrink-0 px-2 py-0.5 border",
        "font-mono-label text-mono-label uppercase tracking-wider transition-colors",
        overdue
          ? "border-error/50 text-error hover:bg-error/10"
          : "border-tertiary/50 text-tertiary hover:bg-tertiary/10"
      )}
    >
      <IconMail size={12} />
      {notificationLabel(state)}
    </Link>
  );
}

/**
 * Origin chip — shown only for `source_kind = 'sourced'`.
 *
 * That flag marks someone who is in the system without having approached us,
 * which is the distinction everything downstream keys off: retention, the
 * Art. 14 notification obligation, and erasure. Making it visible on the list
 * is the cheapest way to keep it from becoming invisible bookkeeping.
 *
 * The chip links to the run that surfaced them — first touch, from the
 * attribution view. Without an executed run behind them (an archived lineage,
 * or a person marked sourced by hand) it still says so, just without a link:
 * "sourced, origin unrecorded" is a truthful chip, and a silent one is not.
 */
function OriginChip({
  projectId,
  sourceKind,
  sourcePlatform,
  origin,
}: {
  projectId: string;
  sourceKind: string | null;
  sourcePlatform: string | null;
  origin: Origin | null;
}) {
  if (sourceKind !== "sourced") return null;

  const chipClass =
    "hidden sm:flex items-center gap-1.5 shrink-0 px-2 py-0.5 border border-tertiary/40 text-tertiary font-mono-label text-mono-label uppercase tracking-wider";

  if (!origin) {
    return (
      <span
        className={chipClass}
        title={
          sourcePlatform
            ? `Sourced from ${platformLabel(sourcePlatform)}`
            : "Sourced — no executed run recorded"
        }
      >
        <IconTarget size={12} />
        Sourced
      </span>
    );
  }

  return (
    <Link
      href={`/app/projects/${projectId}/sourcing/runs/${origin.runId}/import`}
      prefetch={false}
      title={`First surfaced by v${origin.version}${origin.label ? ` · ${origin.label}` : ""}${sourcePlatform ? ` on ${platformLabel(sourcePlatform)}` : ""}`}
      className={cn(chipClass, "hover:border-primary hover:text-primary transition-colors")}
    >
      <IconTarget size={12} />
      Sourced · v{origin.version}
    </Link>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("") || "??";
}

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime();
  const diffMs = Date.now() - t;
  const min = Math.round(diffMs / 60_000);
  if (min < 1) return "JUST NOW";
  if (min < 60) return `${min}M AGO`;
  const hrs = Math.round(min / 60);
  if (hrs < 24) return `${hrs}H AGO`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}D AGO`;
  return new Date(iso).toISOString().slice(0, 10);
}
