import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  PIPELINE_LABELS,
  type Archetype,
  type PipelineStage,
} from "@/lib/ai/cv-parsing";
import { cn } from "@/lib/utils";
import {
  IconArrowLeft,
  IconChevronRight,
  IconGroup,
  IconPlus,
  IconRefresh,
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
      "id, full_name, current_title, current_company, archetype, pipeline_stage, cv_processing, cv_parse_error, updated_at"
    )
    .eq("project_id", id)
    .order("updated_at", { ascending: false });

  if (candidatesError) {
    redirect(`/app/projects/${id}`);
  }

  const candidates = (candidateRows ?? []) as CandidateRow[];

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
          </div>
          <Link
            href={`/app/projects/${project.id}/candidates/new`}
            prefetch={false}
            className="px-6 py-3 bg-primary-container text-on-primary-container font-mono-label text-mono-label uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-all flex items-center gap-2"
          >
            <IconPlus size={16} />
            Add Candidate
          </Link>
        </header>

        {candidates.length === 0 ? (
          <EmptyState projectId={project.id} />
        ) : (
          <ul className="bg-surface-container-low border border-outline-variant divide-y divide-outline-variant/40">
            {candidates.map((c) => (
              <CandidateRow key={c.id} projectId={project.id} candidate={c} />
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
      <div className="w-16 h-16 rounded-full bg-primary-container/10 border border-primary-container/40 flex items-center justify-center">
        <IconGroup size={28} className="text-primary" />
      </div>
      <div className="space-y-2 max-w-md">
        <h2 className="font-h2 text-h2">No candidates yet</h2>
        <p className="text-body-main text-on-surface-variant">
          Upload a PDF or DOCX CV to parse the candidate profile and score
          fit against this role&rsquo;s calibration model.
        </p>
      </div>
      <Link
        href={`/app/projects/${projectId}/candidates/new`}
        prefetch={false}
        className="px-6 py-3 bg-primary-container text-on-primary-container font-mono-label text-mono-label uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-all flex items-center gap-2"
      >
        <IconUpload size={16} />
        Add Candidate
      </Link>
    </div>
  );
}

function CandidateRow({
  projectId,
  candidate,
}: {
  projectId: string;
  candidate: CandidateRow;
}) {
  const stage = (candidate.pipeline_stage ?? "found") as PipelineStage;
  const archetype = candidate.archetype as Archetype | null;
  const stageTone = STAGE_TONES[stage] ?? STAGE_TONES.found;

  return (
    <li>
      <Link
        href={`/app/projects/${projectId}/candidates/${candidate.id}`}
        prefetch={false}
        className="flex items-center gap-4 px-5 py-4 hover:bg-surface-container-high transition-colors group"
      >
        <span className="w-10 h-10 rounded bg-surface-container-high border border-outline-variant flex items-center justify-center font-mono-data text-mono-data text-on-surface uppercase">
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
        <IconChevronRight
          size={18}
          className="text-outline group-hover:text-primary transition-colors"
        />
      </Link>
    </li>
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
