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
import { PipelineSelect } from "./pipeline-select";

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

const ARCHETYPE_TONES: Record<Archetype, string> = {
  Builder: "border-primary-container/40 text-primary",
  Operator: "border-secondary-fixed-dim/40 text-secondary-fixed-dim",
  Transformer: "border-tertiary/40 text-tertiary",
  Infrastructure: "border-outline-variant text-on-surface-variant",
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
    .select(
      "id, title, company_name, calibration_model, company_context"
    )
    .eq("id", id)
    .single<ProjectRow>();

  if (projectError || !project) {
    if (projectError?.code === "PGRST116") notFound();
    redirect("/");
  }

  const { data: candidate, error: candError } = await supabase
    .from("candidates")
    .select(
      "id, project_id, full_name, email, linkedin_url, current_title, current_company, archetype, pipeline_stage, cv_url, cv_structured, cv_processing, cv_parse_error, updated_at"
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

  const profile = (candidate.cv_structured ?? {}) as Partial<CandidateProfile>;
  const isProcessing = candidate.cv_processing;
  const parseError = candidate.cv_parse_error;
  const stage = (candidate.pipeline_stage ?? "found") as PipelineStage;
  const archetype = (candidate.archetype as Archetype | null) ??
    (profile.archetype as Archetype | undefined) ?? null;

  return (
    <div className="min-h-full bg-surface text-on-surface">
      <div className="max-w-7xl mx-auto px-6 py-10 space-y-6">
        {/* breadcrumb */}
        <div className="flex items-center gap-3 font-mono-label text-mono-label uppercase tracking-widest text-outline flex-wrap">
          <Link
            href={`/projects/${project.id}/candidates`}
            prefetch={false}
            className="hover:text-on-surface transition-colors flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-[14px]">arrow_back</span>
            Candidates
          </Link>
          <span className="text-outline-variant">/</span>
          <span className="text-primary truncate max-w-md">
            {candidate.full_name}
          </span>
          <Link
            href={`/projects/${project.id}/feedback?candidate=${candidate.id}`}
            prefetch={false}
            className="ml-auto px-3 py-1.5 border border-outline-variant text-on-surface-variant font-mono-label text-mono-label uppercase tracking-widest hover:border-primary hover:text-primary transition-colors flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-[14px]">rate_review</span>
            Submit Feedback
          </Link>
        </div>

        {parseError && (
          <div className="bg-error-container/10 border border-error/40 px-4 py-3 flex items-start gap-3">
            <span
              className="material-symbols-outlined text-error mt-0.5"
              style={{ fontVariationSettings: "'FILL' 1", fontSize: "18px" }}
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
          <div className="bg-primary-container/10 border border-primary-container/40 px-4 py-3 flex items-center gap-3">
            <span className="material-symbols-outlined text-primary animate-spin">
              progress_activity
            </span>
            <div>
              <div className="font-mono-label text-mono-label text-primary uppercase tracking-widest">
                AI parse in flight
              </div>
              <p className="font-mono-data text-body-main text-on-surface-variant mt-0.5">
                Refresh in a few seconds — the structured profile lands here
                when the agent finishes.
              </p>
            </div>
          </div>
        )}

        {/* Header card + Archetype */}
        <div className="flex flex-col md:flex-row gap-4">
          <div className="bg-surface-container border border-outline-variant p-5 flex-1 flex gap-5 items-start">
            <div className="relative shrink-0">
              <div className="w-24 h-24 rounded border-2 border-primary bg-surface-container-high flex items-center justify-center font-h2 text-h2 text-on-surface uppercase">
                {initials(candidate.full_name)}
              </div>
            </div>
            <div className="space-y-2 min-w-0">
              <h1 className="font-h1 text-h1 text-on-surface uppercase tracking-tight truncate">
                {candidate.full_name}
              </h1>
              <p className="font-mono-data text-body-main text-primary truncate">
                {(candidate.current_title ?? "—").toUpperCase()}{" "}
                {candidate.current_company ? (
                  <span className="text-on-surface-variant">
                    {"// "}
                    {candidate.current_company.toUpperCase()}
                  </span>
                ) : null}
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                {profile.location && (
                  <Tag>LOC: {profile.location.toUpperCase()}</Tag>
                )}
                {typeof profile.years_experience === "number" && (
                  <Tag>EXP: {profile.years_experience}Y</Tag>
                )}
                {candidate.email && (
                  <a
                    href={`mailto:${candidate.email}`}
                    className="px-2 py-0.5 border border-outline bg-surface-container-highest font-mono-label text-mono-label text-on-surface-variant uppercase tracking-wider hover:text-primary hover:border-primary transition-colors"
                  >
                    {candidate.email}
                  </a>
                )}
                {candidate.linkedin_url && (
                  <a
                    href={candidate.linkedin_url}
                    target="_blank"
                    rel="noreferrer"
                    className="px-2 py-0.5 border border-outline bg-surface-container-highest font-mono-label text-mono-label text-on-surface-variant uppercase tracking-wider hover:text-primary hover:border-primary transition-colors flex items-center gap-1.5"
                  >
                    <span className="material-symbols-outlined text-[12px]">link</span>
                    LinkedIn
                  </a>
                )}
              </div>
              <div className="pt-2">
                <PipelineSelect
                  candidateId={candidate.id}
                  projectId={project.id}
                  current={stage}
                />
              </div>
            </div>
          </div>

          <ArchetypeCard
            archetype={archetype}
            fitSummary={profile.fit_summary}
            fitDimensions={profile.fit_dimensions}
            weights={
              project.calibration_model?.dimension_weights ?? null
            }
          />
        </div>

        {/* Bento grid: AI summary + strengths/dev/risks (8) | fit (4) */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          <div className="md:col-span-8 space-y-4">
            <SynthesisCard summary={profile.summary} />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <ListCard
                tone="strengths"
                title="STRENGTHS"
                icon="trending_up"
                items={profile.strengths}
                marker="+"
              />
              <ListCard
                tone="development"
                title="DEVELOPMENT"
                icon="warning"
                items={profile.development_areas}
                marker="-"
              />
              <ListCard
                tone="risks"
                title="RISK_VECTORS"
                icon="report"
                items={profile.risks}
                marker="!"
              />
            </div>

            <CareerTimeline roles={profile.roles} />
          </div>

          <div className="md:col-span-4 space-y-4">
            <FitCard
              dimensions={profile.fit_dimensions}
              weights={project.calibration_model?.dimension_weights ?? null}
              fitSummary={profile.fit_summary}
            />
            <SignalCard
              title="Domain"
              icon="domain"
              value={profile.domain}
            />
            <SignalCard
              title="Scale"
              icon="trending_up"
              value={profile.scale}
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

        <footer className="pt-4 border-t border-outline-variant/60 flex items-center justify-between flex-wrap gap-3">
          <Link
            href={`/projects/${project.id}/candidates`}
            prefetch={false}
            className="flex items-center gap-2 text-outline font-mono-label text-mono-label uppercase tracking-widest hover:text-on-surface transition-colors"
          >
            <span className="material-symbols-outlined text-[14px]">arrow_back</span>
            All candidates
          </Link>
          <div className="font-mono-label text-mono-label text-outline uppercase tracking-wider flex items-center gap-3">
            {candidate.cv_url && (
              <span>{candidate.cv_url.split("/").pop()}</span>
            )}
            <span>UPDATED {formatRelative(candidate.updated_at)}</span>
          </div>
        </footer>
      </div>
    </div>
  );
}

function ArchetypeCard({
  archetype,
  fitSummary,
  fitDimensions,
  weights,
}: {
  archetype: Archetype | null;
  fitSummary: string | undefined;
  fitDimensions: FitDimensions | undefined;
  weights:
    | { technical: number; domain: number; leadership: number; regulatory: number; transformation: number }
    | null;
}) {
  const fitPct = useFitPct(fitDimensions, weights);

  return (
    <div className="bg-surface-container border border-outline-variant p-5 w-full md:w-80 flex flex-col justify-between gap-3">
      <div className="flex items-start justify-between">
        <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
          ARCHETYPE
        </span>
        <span
          className="material-symbols-outlined text-secondary-fixed-dim"
          style={{ fontVariationSettings: "'FILL' 1", fontSize: "18px" }}
        >
          bolt
        </span>
      </div>
      <div className="space-y-1">
        {archetype ? (
          <>
            <h2
              className={cn(
                "font-h2 text-h2 uppercase tracking-tight",
                ARCHETYPE_TONES[archetype]
              )}
            >
              {archetype}
            </h2>
            <p className="text-body-main text-on-surface-variant leading-snug">
              {ARCHETYPE_BLURBS[archetype]}
            </p>
          </>
        ) : (
          <h2 className="font-h2 text-h2 text-outline">— Awaiting parse —</h2>
        )}
      </div>
      <div className="space-y-1">
        <div className="flex items-baseline justify-between font-mono-label text-mono-label text-outline uppercase tracking-wider">
          <span>OVERALL FIT</span>
          <span
            className={cn(
              "tabular-nums",
              fitPct == null
                ? "text-outline"
                : fitPct >= 70
                  ? "text-secondary-fixed-dim"
                  : fitPct >= 45
                    ? "text-tertiary"
                    : "text-error"
            )}
          >
            {fitPct == null ? "—" : `${fitPct}%`}
          </span>
        </div>
        <div className="w-full bg-surface-container-low h-1">
          <div
            className={cn(
              "h-full transition-all",
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
        {fitSummary && (
          <p className="text-body-main text-on-surface-variant pt-2 border-t border-outline-variant/40">
            {fitSummary}
          </p>
        )}
      </div>
    </div>
  );
}

function SynthesisCard({ summary }: { summary: string | undefined }) {
  return (
    <article className="bg-surface-container border border-outline-variant overflow-hidden">
      <header className="bg-surface-container-high px-4 py-2 border-b border-outline-variant flex justify-between items-center">
        <span className="font-mono-label text-mono-label text-on-surface-variant uppercase tracking-widest flex items-center gap-2">
          <span className="material-symbols-outlined text-[14px]">psychology</span>
          AI_CORE_SYNTHESIS
        </span>
        <span className="font-mono-data text-mono-data text-primary">
          {summary ? "PARSED" : "PENDING"}
        </span>
      </header>
      <div className="p-4 text-on-surface text-body-main leading-relaxed">
        <span className="text-secondary-fixed-dim font-mono-data text-body-main mr-1">
          &gt;
        </span>
        {summary || (
          <span className="text-outline italic">
            Synthesis will appear once the CV is parsed.
          </span>
        )}
      </div>
    </article>
  );
}

function ListCard({
  tone,
  title,
  icon,
  items,
  marker,
}: {
  tone: "strengths" | "development" | "risks";
  title: string;
  icon: string;
  items: string[] | undefined;
  marker: string;
}) {
  const palette =
    tone === "strengths"
      ? "border-l-secondary-fixed-dim text-secondary-fixed-dim"
      : tone === "development"
        ? "border-l-tertiary text-tertiary"
        : "border-l-error text-error";
  const list = items ?? [];

  return (
    <div
      className={cn(
        "bg-surface-container border-l-2 border-y border-r border-outline-variant p-3",
        palette.split(" ")[0]
      )}
    >
      <h4
        className={cn(
          "font-mono-label text-mono-label uppercase tracking-widest mb-3 flex items-center gap-2",
          palette.split(" ")[1]
        )}
      >
        <span className="material-symbols-outlined text-[14px]">{icon}</span>
        {title}
      </h4>
      <ul className="space-y-2">
        {list.length === 0 && (
          <li className="text-body-main text-outline italic">—</li>
        )}
        {list.map((item, i) => (
          <li
            key={i}
            className="flex items-start gap-2 font-mono-data text-body-main text-on-surface-variant"
          >
            <span className={cn(palette.split(" ")[1], "shrink-0")}>{marker}</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FitCard({
  dimensions,
  weights,
  fitSummary,
}: {
  dimensions: FitDimensions | undefined;
  weights:
    | { technical: number; domain: number; leadership: number; regulatory: number; transformation: number }
    | null;
  fitSummary: string | undefined;
}) {
  const dims = (Object.keys(FIT_DIMENSION_LABELS) as Array<keyof FitDimensions>);

  return (
    <div className="bg-surface-container border border-outline-variant p-4 flex flex-col">
      <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest mb-4">
        MULTI-DIMENSIONAL FIT
      </span>
      <div className="space-y-4 flex-1">
        {dims.map((dim) => {
          const score = clamp10(dimensions?.[dim]);
          const weight = clamp10(weights?.[dim]);
          return (
            <div key={dim} className="space-y-2">
              <div className="flex justify-between items-baseline font-mono-data text-mono-data">
                <span className="text-on-surface uppercase">
                  {FIT_DIMENSION_LABELS[dim]}
                </span>
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
              </div>
              <div className="grid grid-cols-10 gap-1">
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
                    />
                  );
                })}
              </div>
              {weight != null && (
                <div className="font-mono-label text-mono-label text-outline uppercase tracking-wider">
                  Role weight: {weight}/10
                </div>
              )}
            </div>
          );
        })}
      </div>
      {fitSummary && (
        <div className="mt-6 p-3 border border-secondary-fixed-dim/30 bg-secondary-fixed-dim/5">
          <p className="font-mono-data text-body-main text-secondary-fixed-dim leading-snug">
            {fitSummary}
          </p>
        </div>
      )}
    </div>
  );
}

function SignalCard({
  title,
  icon,
  value,
}: {
  title: string;
  icon: string;
  value: string | undefined;
}) {
  return (
    <div className="bg-surface-container-low border border-outline-variant p-4 space-y-2">
      <h3 className="font-mono-label text-mono-label text-primary uppercase tracking-widest flex items-center gap-2">
        <span className="material-symbols-outlined text-[14px]">{icon}</span>
        {title}
      </h3>
      <p className="text-body-main text-on-surface-variant">
        {value || <span className="italic text-outline">—</span>}
      </p>
    </div>
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
    <div className="bg-surface-container-low border border-outline-variant p-4 space-y-2">
      <h3 className="font-mono-label text-mono-label text-primary uppercase tracking-widest flex items-center gap-2">
        <span className="material-symbols-outlined text-[14px]">{icon}</span>
        {title}
      </h3>
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
      <header className="bg-surface-container-high px-4 py-2 border-b border-outline-variant">
        <span className="font-mono-label text-mono-label text-on-surface-variant uppercase tracking-widest flex items-center gap-2">
          <span className="material-symbols-outlined text-[14px]">route</span>
          CAREER PROGRESSION MAP
        </span>
      </header>
      {list.length === 0 ? (
        <div className="p-6 text-body-main text-outline italic">
          Career history will populate here once the CV is parsed.
        </div>
      ) : (
        <div className="p-6 space-y-6">
          {list.map((role, i) => (
            <div key={i} className="flex items-start gap-6">
              <div className="w-44 shrink-0 text-right">
                <div className="font-mono-label text-mono-label text-on-surface uppercase tracking-widest">
                  {role.start_date} — {role.end_date.toUpperCase()}
                </div>
                <div className="text-body-main text-outline mt-0.5">
                  {role.company}
                </div>
              </div>
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <div className="w-3 h-3 mt-1.5 bg-secondary-fixed-dim border-4 border-surface ring-1 ring-secondary-fixed-dim shrink-0" />
                <div className="bg-surface-container-high border border-outline-variant p-3 flex-1">
                  <div className="font-mono-data text-mono-data text-secondary-fixed-dim uppercase tracking-wider">
                    {role.title}
                  </div>
                  <p className="text-body-main text-on-surface-variant mt-1 leading-snug">
                    {role.summary}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="px-2 py-0.5 border border-outline bg-surface-container-highest font-mono-label text-mono-label text-on-surface-variant uppercase tracking-wider">
      {children}
    </span>
  );
}

function clamp10(v: number | undefined | null): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return Math.max(0, Math.min(10, Math.round(v)));
}

/**
 * Compute a weighted overall fit % from the candidate's per-dimension scores
 * and the project's role weights. Returns null when either side is missing.
 *
 * Uses sum(score_i * weight_i) / sum(weight_i * 10) — i.e. weighted average
 * of the score ratios. Falls back to a simple average when weights are
 * unavailable so the candidate still gets a meaningful number.
 */
function useFitPct(
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

// Forces TS to treat ARCHETYPES as imported even if unused above (it's referenced by Archetype).
void ARCHETYPES;
