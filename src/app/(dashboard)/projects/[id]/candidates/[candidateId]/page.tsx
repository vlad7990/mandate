import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  ARCHETYPES,
  type Archetype,
  type CandidateProfile,
  type FitDimensions,
  type PipelineStage,
} from "@/lib/ai/cv-parsing";
import {
  type CalibrationModel,
  type CompanyContext,
} from "@/lib/ai/role-analysis";
import { cn } from "@/lib/utils";
import { BreadcrumbRail } from "@/components/ui/breadcrumb-rail";
import { LiveTick } from "@/components/ui/live-tick";
import { StatusChip } from "@/components/ui/status-chip";
import { ensureCandidateEvaluation } from "@/lib/ai/generate-evaluation";
import { ContactFieldsRail } from "./contact-fields";
import {
  ArchetypeSelect,
  EditableList,
  EditableNumber,
  EditableText,
  EditableTextarea,
} from "./editable-fields";
import { EvaluationReport } from "./evaluation-report";
import { CandidateNotesPanel, type CandidateNote } from "./notes-panel";
import { PipelineSelect } from "./pipeline-select";
import { RetryEvaluationButton } from "./retry-evaluation-button";

type ProjectRow = {
  id: string;
  title: string;
  company_name: string;
  calibration_model: Partial<CalibrationModel> | null;
  company_context: Partial<CompanyContext> | null;
};

type CandidateRow = {
  id: string;
  project_id: string;
  full_name: string;
  email: string | null;
  linkedin_url: string | null;
  twitter_url: string | null;
  github_url: string | null;
  website_url: string | null;
  phone: string | null;
  location: string | null;
  current_title: string | null;
  current_company: string | null;
  archetype: string | null;
  pipeline_stage: string | null;
  cv_url: string | null;
  cv_structured: unknown;
  cv_processing: boolean;
  cv_parse_error: string | null;
  updated_at: string;
};

const ARCHETYPE_BLURBS: Record<Archetype, string> = {
  Builder:
    "Built something from zero — founders, first-engineer trajectories, greenfield programs.",
  Operator:
    "Scaled and ran mature systems — predictable execution, steady-state ownership.",
  Transformer:
    "Post-merger integration, turnarounds, and modernisation programs at pace.",
  Infrastructure:
    "Deep platform / SRE / IT-ops focus — reliability and the substrate teams build on.",
};

const ARCHETYPE_TEXT: Record<Archetype, string> = {
  Builder: "text-primary",
  Operator: "text-secondary-fixed-dim",
  Transformer: "text-tertiary",
  Infrastructure: "text-on-surface-variant",
};

const FIT_DIMENSION_LABELS: Record<keyof FitDimensions, string> = {
  technical: "TECHNICAL",
  domain: "DOMAIN",
  leadership: "LEADERSHIP",
  regulatory: "REGULATORY",
  transformation: "TRANSFORMATION",
};

export default async function CandidateProfilePage({
  params,
}: {
  params: Promise<{ id: string; candidateId: string }>;
}) {
  const { id, candidateId } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, title, company_name, calibration_model, company_context")
    .eq("id", id)
    .single<ProjectRow>();

  if (projectError || !project) {
    if (projectError?.code === "PGRST116") notFound();
    redirect("/");
  }

  const { data: candidate, error: candError } = await supabase
    .from("candidates")
    .select(
      "id, project_id, full_name, email, linkedin_url, twitter_url, github_url, website_url, phone, location, current_title, current_company, archetype, pipeline_stage, cv_url, cv_structured, cv_processing, cv_parse_error, updated_at"
    )
    .eq("id", candidateId)
    .single<CandidateRow>();

  if (candError || !candidate) {
    if (candError?.code === "PGRST116") notFound();
    redirect(`/projects/${id}/candidates`);
  }

  if (candidate.project_id !== id) {
    redirect(`/projects/${id}/candidates`);
  }

  // Local alias so client components nested directly in the page body
  // can pass the project id without spelling out `project.id` each time.
  const projectId = project.id;

  const profile = (candidate.cv_structured ?? {}) as Partial<CandidateProfile>;
  const isProcessing = candidate.cv_processing;
  const parseError = candidate.cv_parse_error;
  const stage = (candidate.pipeline_stage ?? "found") as PipelineStage;
  const archetype = (candidate.archetype as Archetype | null) ??
    (profile.archetype as Archetype | undefined) ?? null;
  const fitPct = computeFitPct(
    profile.fit_dimensions,
    project.calibration_model?.dimension_weights ?? null
  );

  // Generate the executive evaluation on first profile visit. The gate
  // is idempotent: cache hit returns the stored report immediately;
  // miss runs the agent (~6–10s), persists, and returns. Falls back to
  // null when the CV isn't ready yet — the page renders a placeholder
  // panel instead of the full report.
  const evaluation = await ensureCandidateEvaluation(candidate.id, project.id);

  // Notes feed for the candidate. Pinned first, then newest. RLS scopes
  // by org, so the SELECT is implicitly safe across orgs.
  const { data: rawNotes } = await supabase
    .from("candidate_notes")
    .select(
      "id, candidate_id, note_type, content, is_pinned, call_duration_minutes, created_by, created_at, updated_at"
    )
    .eq("candidate_id", candidate.id)
    .order("is_pinned", { ascending: false })
    .order("created_at", { ascending: false });

  type RawNote = {
    id: string;
    candidate_id: string;
    note_type: string;
    content: string;
    is_pinned: boolean;
    call_duration_minutes: number | null;
    created_by: string | null;
    created_at: string;
    updated_at: string;
  };
  const noteRows = (rawNotes ?? []) as RawNote[];

  // Stitch a display name onto each note. We resolve in one query keyed
  // by created_by so a recruiter's name shows up next to their note.
  const authorIds = Array.from(
    new Set(noteRows.map((n) => n.created_by).filter((v): v is string => !!v))
  );
  let authorMap = new Map<string, string>();
  if (authorIds.length > 0) {
    const { data: authors } = await supabase
      .from("users")
      .select("id, full_name, email")
      .in("id", authorIds);
    authorMap = new Map(
      (authors ?? []).map((a) => [
        a.id as string,
        ((a as { full_name?: string | null }).full_name?.trim() ||
          (a as { email?: string | null }).email ||
          "Unknown") as string,
      ])
    );
  }

  const notes = noteRows.map((n) => ({
    ...n,
    note_type: n.note_type as CandidateNote["note_type"],
    created_by_name: n.created_by ? authorMap.get(n.created_by) ?? null : null,
  }));

  return (
    <div className="px-6 py-6 space-y-5 max-w-[1600px] mx-auto">
      <BreadcrumbRail
        segments={[
          { label: "Mandate", href: "/" },
          { label: project.title, href: `/projects/${project.id}`, maxChars: 24 },
          { label: "Candidates", href: `/projects/${project.id}/candidates` },
          { label: candidate.full_name, maxChars: 28 },
        ]}
      />

      {parseError && (
        <div
          role="alert"
          className="bg-error/10 border border-error/60 px-4 py-3 flex items-start gap-3"
        >
          <span
            className="material-symbols-outlined text-error text-[18px] mt-0.5"
            style={{ fontVariationSettings: "'FILL' 1" }}
            aria-hidden
          >
            error
          </span>
          <div>
            <div className="font-mono-label text-mono-label text-error uppercase tracking-widest">
              CV parse failed
            </div>
            <p className="font-mono-data text-body-main text-on-surface-variant mt-1">
              {parseError}
            </p>
          </div>
        </div>
      )}

      {isProcessing && (
        <div
          role="status"
          aria-live="polite"
          className="bg-primary-container/10 border border-primary-container/40 px-4 py-3 flex items-center gap-3"
        >
          <span
            className="material-symbols-outlined text-primary animate-spin"
            aria-hidden
          >
            progress_activity
          </span>
          <div>
            <div className="font-mono-label text-mono-label text-primary uppercase tracking-widest">
              AI parse in flight
            </div>
            <p className="font-mono-data text-body-main text-on-surface-variant mt-0.5">
              Refresh in a few seconds — the structured profile lands here when
              the agent finishes.
            </p>
          </div>
        </div>
      )}

      <CandidateHero
        candidate={candidate}
        profile={profile}
        archetype={archetype}
        stage={stage}
        projectId={project.id}
        fitPct={fitPct}
      />

      <ArchetypeStrip
        archetype={archetype}
        fitSummary={profile.fit_summary}
      />

      {evaluation ? (
        <EvaluationReport
          evaluation={evaluation}
          candidateId={candidate.id}
          candidateName={candidate.full_name}
          projectId={project.id}
        />
      ) : profile.fit_dimensions ? (
        <EvaluationPendingPanel
          processing={isProcessing}
          candidateId={candidate.id}
          projectId={project.id}
        />
      ) : null}

      {/* Bento grid: AI summary + strengths/dev/risks (8) | fit (4) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-8 space-y-4">
          <SynthesisCard
            candidateId={candidate.id}
            projectId={projectId}
            summary={profile.summary}
          />

          <SignalsLedger
            candidateId={candidate.id}
            projectId={projectId}
            strengths={profile.strengths}
            development={profile.development_areas}
            risks={profile.risks}
          />

          <CareerTimeline roles={profile.roles} />
        </div>

        <div className="lg:col-span-4 space-y-4">
          <FitCard
            dimensions={profile.fit_dimensions}
            weights={project.calibration_model?.dimension_weights ?? null}
            fitSummary={profile.fit_summary}
            fitPct={fitPct}
          />
          <EditableSignalCard
            candidateId={candidate.id}
            projectId={projectId}
            field="domain"
            title="Domain"
            icon="domain"
            value={profile.domain ?? null}
          />
          <EditableSignalCard
            candidateId={candidate.id}
            projectId={projectId}
            field="scale"
            title="Scale"
            icon="trending_up"
            value={profile.scale ?? null}
          />
          <ChipCard
            title="Tech Exposure"
            icon="hub"
            items={profile.tech_exposure ?? []}
          />
          <ChipCard
            title="Transformation"
            icon="autorenew"
            items={profile.transformation_experience ?? []}
          />
        </div>
      </div>

      <CandidateNotesPanel
        candidateId={candidate.id}
        projectId={projectId}
        candidateName={candidate.full_name}
        notes={notes as CandidateNote[]}
      />

      <footer className="pt-4 border-t border-outline-variant/60 flex items-center justify-between flex-wrap gap-3">
        <Link
          href={`/projects/${project.id}/candidates`}
          prefetch={false}
          className="flex items-center gap-2 text-outline font-mono-label text-mono-label uppercase tracking-widest hover:text-on-surface transition-colors focus-visible:outline-none focus-visible:text-primary focus-visible:underline focus-visible:underline-offset-2"
        >
          <span className="material-symbols-outlined text-[14px]" aria-hidden>
            arrow_back
          </span>
          All candidates
        </Link>
        <div className="font-mono-label text-mono-label text-outline uppercase tracking-widest flex items-center gap-3 tabular-nums">
          {candidate.cv_url && (
            <span className="truncate max-w-[24ch]">
              {candidate.cv_url.split("/").pop()}
            </span>
          )}
          <LiveTick iso={candidate.updated_at} label="Updated" pulse={false} />
        </div>
      </footer>
    </div>
  );
}

function CandidateHero({
  candidate,
  profile,
  archetype,
  stage,
  projectId,
  fitPct,
}: {
  candidate: CandidateRow;
  profile: Partial<CandidateProfile>;
  archetype: Archetype | null;
  stage: PipelineStage;
  projectId: string;
  fitPct: number | null;
}) {
  return (
    <article className="bg-surface-container border border-outline-variant relative overflow-hidden">
      {/* Tonal accent strip — archetype-coloured if available, else
          neutral. Sets the dossier's identity at a glance without the
          heavy primary-border-2 the previous design used. */}
      <div
        className={cn(
          "absolute inset-x-0 top-0 h-0.5",
          archetype === "Builder"
            ? "bg-primary"
            : archetype === "Operator"
              ? "bg-secondary-fixed-dim"
              : archetype === "Transformer"
                ? "bg-tertiary"
                : "bg-outline"
        )}
        aria-hidden
      />
      <div className="p-5 flex flex-col md:flex-row gap-5 items-start">
        <div className="shrink-0">
          <div className="w-20 h-20 border border-outline-variant bg-surface-container-high flex items-center justify-center font-h2 text-h2 text-on-surface uppercase">
            {initials(candidate.full_name)}
          </div>
        </div>
        <div className="flex-1 min-w-0 space-y-3">
          <div className="space-y-1.5">
            <h1 className="font-h1 text-h1 text-on-surface tracking-tight">
              <EditableText
                candidateId={candidate.id}
                projectId={projectId}
                field="full_name"
                value={candidate.full_name}
                placeholder="Candidate name"
                required
                ariaLabel="full name"
              />
            </h1>
            <p className="font-mono-data text-body-main text-on-surface-variant flex items-baseline gap-2 flex-wrap">
              <EditableText
                candidateId={candidate.id}
                projectId={projectId}
                field="current_title"
                value={candidate.current_title}
                placeholder="Current title"
                ariaLabel="current title"
                inputClassName="uppercase"
                className="uppercase"
              />
              <span className="text-outline-variant" aria-hidden>
                {"//"}
              </span>
              <span className="text-primary uppercase">
                <EditableText
                  candidateId={candidate.id}
                  projectId={projectId}
                  field="current_company"
                  value={candidate.current_company}
                  placeholder="Current company"
                  ariaLabel="current company"
                />
              </span>
            </p>
            <div className="flex items-center gap-2">
              <ArchetypeSelect
                candidateId={candidate.id}
                projectId={projectId}
                value={archetype}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="flex flex-wrap gap-1.5 items-center">
              <span className="px-2 py-0.5 border border-outline-variant bg-surface-container-high font-mono-label text-mono-label uppercase tracking-wider text-on-surface-variant inline-flex items-center gap-1">
                EXP:
                <EditableNumber
                  candidateId={candidate.id}
                  projectId={projectId}
                  field="years_experience"
                  value={
                    typeof profile.years_experience === "number"
                      ? profile.years_experience
                      : null
                  }
                  unit="Y"
                  placeholder="—Y"
                  ariaLabel="years of experience"
                />
              </span>
            </div>
            <ContactFieldsRail
              candidateId={candidate.id}
              projectId={projectId}
              initial={{
                email: candidate.email,
                phone: candidate.phone,
                // Fallback to the parsed CV value when the typed
                // column hasn't been overridden yet.
                location: candidate.location ?? profile.location ?? null,
                linkedin_url: candidate.linkedin_url,
                twitter_url: candidate.twitter_url,
                github_url: candidate.github_url,
                website_url: candidate.website_url,
              }}
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <PipelineSelect
              candidateId={candidate.id}
              projectId={projectId}
              current={stage}
            />
            <Link
              href={`/projects/${projectId}/feedback?candidate=${candidate.id}`}
              prefetch={false}
              className="px-3 py-1.5 border border-outline-variant text-on-surface-variant font-mono-label text-mono-label uppercase tracking-widest hover:border-primary hover:text-primary transition-colors flex items-center gap-1.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <span className="material-symbols-outlined text-[14px]" aria-hidden>
                rate_review
              </span>
              Submit Feedback
            </Link>
          </div>
        </div>

        {/* Right-rail KPI block — overall fit + archetype quick read */}
        <div className="shrink-0 w-full md:w-56 border border-outline-variant bg-surface-container-low p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
              Overall Fit
            </span>
            {archetype && (
              <span className="font-mono-label text-mono-label uppercase tracking-widest text-outline">
                {archetype}
              </span>
            )}
          </div>
          <div className="flex items-baseline gap-1">
            <span
              className={cn(
                "font-h1 text-h1 tabular-nums leading-none",
                fitPct == null
                  ? "text-outline"
                  : fitPct >= 70
                    ? "text-secondary-fixed-dim"
                    : fitPct >= 45
                      ? "text-tertiary"
                      : "text-error"
              )}
            >
              {fitPct == null ? "—" : fitPct}
            </span>
            {fitPct != null && (
              <span className="text-on-surface-variant font-mono-label text-mono-label uppercase tracking-widest">
                %
              </span>
            )}
          </div>
          <div
            className="w-full bg-surface-container-highest h-1.5 overflow-hidden"
            role="meter"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={fitPct ?? 0}
            aria-label="Overall fit percentage"
          >
            <div
              className={cn(
                "h-full transition-[width]",
                fitPct == null
                  ? "bg-outline-variant"
                  : fitPct >= 70
                    ? "bg-secondary-fixed-dim"
                    : fitPct >= 45
                      ? "bg-tertiary"
                      : "bg-error"
              )}
              style={{ width: `${fitPct ?? 0}%` }}
            />
          </div>
        </div>
      </div>
    </article>
  );
}

function ArchetypeStrip({
  archetype,
  fitSummary,
}: {
  archetype: Archetype | null;
  fitSummary: string | undefined;
}) {
  if (!archetype && !fitSummary) return null;
  return (
    <article className="bg-surface-container-low border border-outline-variant p-4 flex items-start gap-4">
      <span
        className="material-symbols-outlined text-secondary-fixed-dim text-[20px] mt-0.5 shrink-0"
        style={{ fontVariationSettings: "'FILL' 1" }}
        aria-hidden
      >
        bolt
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
            Archetype
          </span>
          {archetype ? (
            <span
              className={cn(
                "font-h2 text-h2 uppercase tracking-tight",
                ARCHETYPE_TEXT[archetype]
              )}
            >
              {archetype}
            </span>
          ) : (
            <span className="font-h2 text-h2 text-outline">— Awaiting parse —</span>
          )}
        </div>
        {archetype && (
          <p className="text-body-main text-on-surface-variant mt-1 leading-snug">
            {ARCHETYPE_BLURBS[archetype]}
          </p>
        )}
        {fitSummary && (
          <p className="text-body-main text-on-surface mt-2 pt-2 border-t border-outline-variant/40 leading-relaxed">
            {fitSummary}
          </p>
        )}
      </div>
    </article>
  );
}

function SynthesisCard({
  candidateId,
  projectId,
  summary,
}: {
  candidateId: string;
  projectId: string;
  summary: string | undefined;
}) {
  return (
    <article className="bg-surface-container border border-outline-variant overflow-hidden">
      <header className="bg-surface-container-high px-4 py-2.5 border-b border-outline-variant flex justify-between items-center">
        <span className="font-mono-label text-mono-label text-on-surface-variant uppercase tracking-widest flex items-center gap-2">
          <span className="material-symbols-outlined text-[14px]" aria-hidden>
            psychology
          </span>
          AI_CORE_SYNTHESIS
        </span>
        <StatusChip tone={summary ? "secondary" : "neutral"} intensity="soft">
          {summary ? "Parsed" : "Pending"}
        </StatusChip>
      </header>
      <div className="p-4 text-on-surface text-body-main leading-relaxed font-mono-data">
        <EditableTextarea
          candidateId={candidateId}
          projectId={projectId}
          field="summary"
          value={summary ?? null}
          rows={5}
          placeholder="Add a one-paragraph synthesis."
          emptyState={<>Synthesis will appear once the CV is parsed. Click to write one manually.</>}
        />
      </div>
    </article>
  );
}

function SignalsLedger({
  candidateId,
  projectId,
  strengths,
  development,
  risks,
}: {
  candidateId: string;
  projectId: string;
  strengths: string[] | undefined;
  development: string[] | undefined;
  risks: string[] | undefined;
}) {
  // Three signal columns rendered as a single bordered ledger with
  // vertical dividers — denser and more terminal than three separate
  // cards. Each column carries a tonal left rule so the recruiter's eye
  // can find the signal type without re-reading the heading.
  return (
    <article className="bg-surface-container-low border border-outline-variant overflow-hidden">
      <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-outline-variant/60">
        <SignalColumn
          candidateId={candidateId}
          projectId={projectId}
          field="strengths"
          title="Strengths"
          icon="trending_up"
          tone="secondary"
          marker="+"
          items={strengths ?? []}
        />
        <SignalColumn
          candidateId={candidateId}
          projectId={projectId}
          field="development_areas"
          title="Development"
          icon="warning"
          tone="warn"
          marker="−"
          items={development ?? []}
        />
        <SignalColumn
          candidateId={candidateId}
          projectId={projectId}
          field="risks"
          title="Risk Vectors"
          icon="report"
          tone="danger"
          marker="!"
          items={risks ?? []}
        />
      </div>
    </article>
  );
}

function SignalColumn({
  candidateId,
  projectId,
  field,
  title,
  icon,
  tone,
  marker,
  items,
}: {
  candidateId: string;
  projectId: string;
  field: "strengths" | "development_areas" | "risks";
  title: string;
  icon: string;
  tone: "secondary" | "warn" | "danger";
  marker: string;
  items: string[];
}) {
  const headingClass =
    tone === "secondary"
      ? "text-secondary-fixed-dim"
      : tone === "warn"
        ? "text-tertiary"
        : "text-error";
  const ruleClass =
    tone === "secondary"
      ? "border-l-secondary-fixed-dim"
      : tone === "warn"
        ? "border-l-tertiary"
        : "border-l-error";
  return (
    <div className={cn("p-4 border-l-2", ruleClass)}>
      <h4
        className={cn(
          "font-mono-label text-mono-label uppercase tracking-widest mb-3 flex items-center gap-2 tabular-nums",
          headingClass
        )}
      >
        <span className="material-symbols-outlined text-[14px]" aria-hidden>
          {icon}
        </span>
        {title}
        <span className="text-outline">· {String(items.length).padStart(2, "0")}</span>
      </h4>
      <EditableList
        candidateId={candidateId}
        projectId={projectId}
        field={field}
        items={items}
        marker={marker}
        markerClass={headingClass}
        emptyLabel="No items yet — add the first."
        addLabel={`Add ${title.toLowerCase()}`}
        itemPlaceholder={`Type a ${title.toLowerCase().replace(/s$/, "")}…`}
      />
    </div>
  );
}

function FitCard({
  dimensions,
  weights,
  fitSummary,
  fitPct,
}: {
  dimensions: FitDimensions | undefined;
  weights:
    | { technical: number; domain: number; leadership: number; regulatory: number; transformation: number }
    | null;
  fitSummary: string | undefined;
  fitPct: number | null;
}) {
  const dims = Object.keys(FIT_DIMENSION_LABELS) as Array<keyof FitDimensions>;

  return (
    <article className="bg-surface-container border border-outline-variant overflow-hidden">
      <header className="bg-surface-container-high px-4 py-2.5 border-b border-outline-variant flex items-center justify-between gap-2">
        <span className="font-mono-label text-mono-label text-primary uppercase tracking-widest flex items-center gap-2">
          <span className="material-symbols-outlined text-[14px]" aria-hidden>
            radar
          </span>
          Multi-dimensional Fit
        </span>
        {fitPct != null && (
          <span className="font-mono-label text-mono-label uppercase tracking-widest tabular-nums text-on-surface-variant">
            <span className="text-primary">{fitPct}%</span> overall
          </span>
        )}
      </header>
      <div className="p-4 space-y-4">
        {dims.map((dim) => {
          const score = clamp10(dimensions?.[dim]);
          const weight = clamp10(weights?.[dim]);
          return (
            <div key={dim} className="space-y-1.5">
              <div className="flex justify-between items-baseline font-mono-data text-mono-data">
                <span className="text-on-surface uppercase">
                  {FIT_DIMENSION_LABELS[dim]}
                </span>
                <span className="flex items-baseline gap-2">
                  <span
                    className={cn(
                      "tabular-nums",
                      score == null
                        ? "text-outline"
                        : score >= 7
                          ? "text-secondary-fixed-dim"
                          : score >= 4
                            ? "text-on-surface"
                            : "text-tertiary"
                    )}
                  >
                    {score == null ? "—" : `${score * 10}%`}
                  </span>
                  {weight != null && (
                    <span className="font-mono-label text-mono-label text-outline uppercase tracking-wider tabular-nums">
                      W:{weight}
                    </span>
                  )}
                </span>
              </div>
              <div
                className="grid grid-cols-10 gap-1"
                role="meter"
                aria-valuemin={0}
                aria-valuemax={10}
                aria-valuenow={score ?? 0}
                aria-label={`${FIT_DIMENSION_LABELS[dim]} score`}
              >
                {Array.from({ length: 10 }).map((_, i) => {
                  const filled = score != null && i < score;
                  return (
                    <div
                      key={i}
                      className={cn(
                        "h-1.5",
                        filled
                          ? score! >= 7
                            ? "bg-secondary-fixed-dim"
                            : score! >= 4
                              ? "bg-primary"
                              : "bg-tertiary"
                          : "bg-surface-container-high"
                      )}
                      aria-hidden
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      {fitSummary && (
        <div className="px-4 pb-4">
          <div className="border-l-2 border-secondary-fixed-dim/60 bg-secondary-fixed-dim/5 px-3 py-2">
            <p className="font-mono-data text-body-main text-secondary-fixed-dim leading-snug">
              {fitSummary}
            </p>
          </div>
        </div>
      )}
    </article>
  );
}

function EditableSignalCard({
  candidateId,
  projectId,
  field,
  title,
  icon,
  value,
}: {
  candidateId: string;
  projectId: string;
  field: "domain" | "scale";
  title: string;
  icon: string;
  value: string | null;
}) {
  return (
    <article className="bg-surface-container-low border border-outline-variant">
      <header className="px-4 py-2 border-b border-outline-variant/60 bg-surface-container">
        <h3 className="font-mono-label text-mono-label text-primary uppercase tracking-widest flex items-center gap-2">
          <span className="material-symbols-outlined text-[14px]" aria-hidden>
            {icon}
          </span>
          {title}
        </h3>
      </header>
      <div className="px-4 py-3 text-body-main text-on-surface-variant">
        <EditableText
          candidateId={candidateId}
          projectId={projectId}
          field={field}
          value={value}
          placeholder={`Click to add ${title.toLowerCase()}.`}
          ariaLabel={title.toLowerCase()}
        />
      </div>
    </article>
  );
}

function ChipCard({
  title,
  icon,
  items,
}: {
  title: string;
  icon: string;
  items: string[];
}) {
  return (
    <article className="bg-surface-container-low border border-outline-variant">
      <header className="px-4 py-2 border-b border-outline-variant/60 bg-surface-container flex items-center justify-between gap-2">
        <h3 className="font-mono-label text-mono-label text-primary uppercase tracking-widest flex items-center gap-2">
          <span className="material-symbols-outlined text-[14px]" aria-hidden>
            {icon}
          </span>
          {title}
        </h3>
        <span className="font-mono-label text-mono-label text-outline tabular-nums">
          {String(items.length).padStart(2, "0")}
        </span>
      </header>
      <div className="px-4 py-3">
        {items.length === 0 ? (
          <p className="text-body-main text-outline italic">—</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {items.map((item, i) => (
              <span
                key={i}
                className="px-2 py-0.5 border border-outline-variant bg-surface-container font-mono-label text-mono-label text-on-surface-variant uppercase tracking-wider"
              >
                {item}
              </span>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

function CareerTimeline({
  roles,
}: {
  roles: CandidateProfile["roles"] | undefined;
}) {
  const list = roles ?? [];
  return (
    <article className="bg-surface-container border border-outline-variant overflow-hidden">
      <header className="bg-surface-container-high px-4 py-2.5 border-b border-outline-variant flex items-center justify-between gap-2">
        <span className="font-mono-label text-mono-label text-on-surface-variant uppercase tracking-widest flex items-center gap-2">
          <span className="material-symbols-outlined text-[14px]" aria-hidden>
            route
          </span>
          Career Progression Map
        </span>
        <span className="font-mono-label text-mono-label text-outline tabular-nums">
          {String(list.length).padStart(2, "0")} role
          {list.length === 1 ? "" : "s"}
        </span>
      </header>
      {list.length === 0 ? (
        <div className="p-5 text-body-main text-outline italic">
          Career history will populate here once the CV is parsed.
        </div>
      ) : (
        <ol className="p-5 space-y-5">
          {list.map((role, i) => (
            <li key={i} className="grid grid-cols-[8.5rem_1fr] gap-4 items-start">
              <div className="text-right pt-0.5">
                <div className="font-mono-label text-mono-label text-on-surface uppercase tracking-widest tabular-nums">
                  {role.start_date}{role.end_date ? ` — ${role.end_date.toUpperCase()}` : ""}
                </div>
                <div className="text-body-main text-on-surface-variant mt-0.5 truncate">
                  {role.company}
                </div>
              </div>
              <div className="flex items-start gap-3 min-w-0">
                <div
                  className="w-2 h-2 mt-2 bg-secondary-fixed-dim ring-1 ring-secondary-fixed-dim/40 ring-offset-2 ring-offset-surface-container shrink-0"
                  aria-hidden
                />
                <div className="bg-surface-container-high border border-outline-variant px-3 py-2 flex-1 min-w-0">
                  <div className="font-mono-data text-mono-data text-secondary-fixed-dim uppercase tracking-wider">
                    {role.title}
                  </div>
                  <p className="text-body-main text-on-surface-variant mt-1 leading-snug">
                    {role.summary}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </article>
  );
}

function clamp10(v: number | undefined | null): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return Math.max(0, Math.min(10, Math.round(v)));
}

/**
 * Compute a weighted overall fit % from the candidate's per-dimension scores
 * and the project's role weights. Returns null when either side is missing.
 */
function computeFitPct(
  dimensions: FitDimensions | undefined,
  weights:
    | { technical: number; domain: number; leadership: number; regulatory: number; transformation: number }
    | null
): number | null {
  if (!dimensions) return null;
  const dims: Array<keyof FitDimensions> = [
    "technical",
    "domain",
    "leadership",
    "regulatory",
    "transformation",
  ];

  if (!weights) {
    const total = dims.reduce((acc, d) => acc + (clamp10(dimensions[d]) ?? 0), 0);
    return Math.round((total / (dims.length * 10)) * 100);
  }

  let weightedSum = 0;
  let weightTotal = 0;
  for (const d of dims) {
    const score = clamp10(dimensions[d]) ?? 0;
    const weight = clamp10(weights[d]) ?? 0;
    weightedSum += score * weight;
    weightTotal += weight * 10;
  }
  if (weightTotal === 0) return null;
  return Math.round((weightedSum / weightTotal) * 100);
}

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase() ?? "")
      .join("") || "??"
  );
}

/**
 * Pending state for the executive evaluation. Two cases:
 *   1. CV is still parsing — point at the existing "AI parse in flight"
 *      banner above and explain the evaluation will follow.
 *   2. CV is parsed but the agent failed on this request — instruct a
 *      refresh. The gate retries idempotently on the next render.
 */
function EvaluationPendingPanel({
  processing,
  candidateId,
  projectId,
}: {
  processing: boolean;
  candidateId: string;
  projectId: string;
}) {
  return (
    <article className="bg-surface-container border border-outline-variant relative overflow-hidden">
      <div
        className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-primary-container/30 via-primary/30 to-primary-container/10"
        aria-hidden
      />
      <div className="px-5 py-4 flex items-start gap-3 flex-wrap">
        <span
          className={cn(
            "material-symbols-outlined text-[20px] mt-0.5",
            processing ? "text-primary animate-spin" : "text-tertiary"
          )}
          aria-hidden
        >
          {processing ? "progress_activity" : "error"}
        </span>
        <div className="flex-1 min-w-0 space-y-1.5">
          <div
            className={cn(
              "font-mono-label text-mono-label uppercase tracking-widest",
              processing ? "text-primary" : "text-tertiary"
            )}
          >
            {processing
              ? "Executive Evaluation Report — Pending"
              : "Executive Evaluation Report — Generation Failed"}
          </div>
          {processing ? (
            <p className="text-body-main text-on-surface-variant leading-relaxed">
              The CV is still being parsed. Once parsing completes, the
              evaluation agent will run automatically and the report will
              appear here on the next visit.
            </p>
          ) : (
            <p className="text-body-main text-on-surface-variant leading-relaxed">
              The evaluation agent could not produce a report on the last
              attempt. Click <span className="text-on-surface font-semibold">Retry Evaluation</span>{" "}
              to clear the cache and regenerate. Generation is idempotent —
              a successful retry replaces the cached failure.
            </p>
          )}
        </div>
        {!processing && (
          <RetryEvaluationButton
            candidateId={candidateId}
            projectId={projectId}
          />
        )}
      </div>
    </article>
  );
}

// Forces TS to treat ARCHETYPES as imported even if unused above (it's referenced by Archetype).
void ARCHETYPES;
