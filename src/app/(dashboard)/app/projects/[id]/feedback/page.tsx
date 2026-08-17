import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  FEEDBACK_TYPE_LABELS,
  type FeedbackInterpretation,
  type FeedbackType,
} from "@/lib/ai/feedback-analysis";
import type { CalibrationModel } from "@/lib/ai/role-analysis";
import { MastHead } from "@/components/ui/mast-head";
import { cn } from "@/lib/utils";
import { FeedbackForm, type CandidateOption } from "./feedback-form";
import {
  IconAlert,
  IconArrowLeft,
  IconCheck,
  IconDocument,
  IconGroup,
  IconIntelligence,
  IconLeaderboard,
  IconPencil,
  IconRefresh,
  IconTrendUp,
  IconTune,
  type IconProps,
} from "@/components/icons";
import { isSampleId } from "@/lib/sample";
import { SampleFeedback } from "@/components/sample/sample-mandate-modules";

type ProjectRow = {
  id: string;
  title: string;
  company_name: string;
  calibration_model: Partial<CalibrationModel> | null;
};

type FeedbackRow = {
  id: string;
  candidate_id: string | null;
  submitted_by: string | null;
  feedback_type: string;
  content: string;
  interpreted: unknown;
  triggered_recalibration: boolean | null;
  created_at: string;
};

type CandidateLite = {
  id: string;
  full_name: string;
  current_title: string | null;
  current_company: string | null;
};

type ScoreLite = {
  candidate_id: string;
  rank_position: number | null;
  overall_score: number | null;
};

type UserLite = {
  id: string;
  full_name: string | null;
  email: string;
  role: string | null;
};

export default async function FeedbackPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ candidate?: string }>;
}) {
  const { id } = await params;

  // The sample mandate has no row in Postgres — `sample-larkspur` is not
  // a uuid, so before this the query below failed and the page fell
  // through to `redirect("/")`, landing a prospect on the dashboard with
  // no explanation. See `sample-mandate-shell.tsx`.
  if (isSampleId(id)) return <SampleFeedback id={id} />;
  const { candidate: initialCandidateRaw } = await searchParams;
  const supabase = await createServerSupabaseClient();

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, title, company_name, calibration_model")
    .eq("id", id)
    .single<ProjectRow>();

  if (projectError || !project) {
    if (projectError?.code === "PGRST116") notFound();
    redirect("/");
  }

  const [candidatesQ, scoresQ, feedbackQ] = await Promise.all([
    supabase
      .from("candidates")
      .select("id, full_name, current_title, current_company")
      .eq("project_id", id)
      .order("full_name", { ascending: true }),
    supabase
      .from("candidate_scores")
      .select("candidate_id, rank_position, overall_score")
      .eq("project_id", id),
    supabase
      .from("feedback")
      .select(
        "id, candidate_id, submitted_by, feedback_type, content, interpreted, triggered_recalibration, created_at"
      )
      .eq("project_id", id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const candidates = (candidatesQ.data ?? []) as CandidateLite[];
  const scores = (scoresQ.data ?? []) as ScoreLite[];
  const feedback = (feedbackQ.data ?? []) as FeedbackRow[];

  const scoresByCandidate = new Map<string, ScoreLite>();
  for (const s of scores) scoresByCandidate.set(s.candidate_id, s);

  const candidateOptions: CandidateOption[] = candidates.map((c) => {
    const s = scoresByCandidate.get(c.id);
    return {
      id: c.id,
      full_name: c.full_name,
      current_title: c.current_title,
      current_company: c.current_company,
      rank: s?.rank_position ?? null,
      overall: s?.overall_score ?? null,
    };
  });

  const candidatesById = new Map<string, CandidateLite>();
  for (const c of candidates) candidatesById.set(c.id, c);

  const submitterIds = Array.from(
    new Set(
      feedback
        .map((f) => f.submitted_by)
        .filter((x): x is string => !!x)
    )
  );
  let submittersById = new Map<string, UserLite>();
  if (submitterIds.length > 0) {
    const { data: submitters } = await supabase
      .from("users")
      .select("id, full_name, email, role")
      .in("id", submitterIds);
    submittersById = new Map<string, UserLite>(
      ((submitters ?? []) as UserLite[]).map((u) => [u.id, u])
    );
  }

  const initialCandidateId =
    initialCandidateRaw && candidatesById.has(initialCandidateRaw)
      ? initialCandidateRaw
      : null;

  const recalibratingCount = feedback.filter(
    (f) => f.triggered_recalibration
  ).length;

  return (
    <div className="min-h-full bg-surface text-on-surface">
      <div className="max-w-6xl mx-auto px-6 py-10 space-y-6">
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
          <span className="text-primary">Feedback</span>
        </div>

        <header className="flex justify-between items-end gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-secondary-fixed-dim font-mono-label text-mono-label uppercase bg-secondary-fixed-dim/10 px-1.5 py-0.5">
                SYSTEM_LIVE
              </span>
              <span className="text-outline font-mono-label text-mono-label">
                MANDATE: {project.title.toUpperCase()}
              </span>
            </div>
            <h1 className="font-h1 text-h1 text-on-surface uppercase tracking-tight">
              Hiring Manager Feedback Portal
            </h1>
            <p className="font-mono-label text-mono-label text-outline uppercase tracking-widest mt-1">
              {feedback.length} {feedback.length === 1 ? "entry" : "entries"} ·{" "}
              {recalibratingCount} triggered recalibration ·{" "}
              {project.company_name}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Link
              href={`/app/projects/${project.id}/ranking`}
              prefetch={false}
              className="px-4 py-2 border border-outline-variant text-on-surface-variant font-mono-label text-mono-label uppercase tracking-widest hover:border-primary hover:text-primary transition-colors flex items-center gap-2"
            >
              <IconLeaderboard size={14} />
              View Rankings
            </Link>
          </div>
        </header>

        <FeedbackForm
          projectId={project.id}
          candidates={candidateOptions}
          initialCandidateId={initialCandidateId}
        />

        <section className="space-y-3">
          <MastHead
            tone="primary"
            label="Active Review Logs"
            meta={`${feedback.length} ${feedback.length === 1 ? "entry" : "entries"}`}
          />
          {feedback.length === 0 ? (
            <div className="bg-surface-container-low border border-outline-variant p-8 text-center text-body-main text-outline">
              No feedback yet. Submit one above to bootstrap the audit log.
            </div>
          ) : (
            <ul className="space-y-2">
              {feedback.map((row) => {
                const candidate = row.candidate_id
                  ? candidatesById.get(row.candidate_id)
                  : null;
                const submitter = row.submitted_by
                  ? submittersById.get(row.submitted_by)
                  : null;
                return (
                  <FeedbackEntry
                    key={row.id}
                    row={row}
                    candidate={candidate ?? null}
                    submitter={submitter ?? null}
                  />
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function FeedbackEntry({
  row,
  candidate,
  submitter,
}: {
  row: FeedbackRow;
  candidate: CandidateLite | null;
  submitter: UserLite | null;
}) {
  const interpreted = (row.interpreted ?? {}) as Partial<FeedbackInterpretation> & {
    error?: string;
  };
  const recalibrated = !!row.triggered_recalibration;
  const submitterName =
    submitter?.full_name?.trim() ||
    submitter?.email ||
    (row.submitted_by ? "Unknown user" : "—");
  const submitterRole = submitter?.role ?? null;

  const ftype = row.feedback_type as FeedbackType;
  const ftypeLabel = FEEDBACK_TYPE_LABELS[ftype] ?? row.feedback_type;
  // More visually distinct chips: each type gets a filled background +
  // its own icon so the recruiter can tell them apart at a glance,
  // without the chips becoming louder than the body content.
  const ftypeStyles: Record<
    FeedbackType,
    { className: string; icon: (props: IconProps) => React.ReactElement }
  > = {
    hiring_manager: {
      className:
        "bg-primary-container/15 border-primary-container/60 text-primary",
      icon: IconGroup,
    },
    interview_outcome: {
      className: "bg-tertiary/10 border-tertiary/60 text-tertiary",
      icon: IconDocument,
    },
    recruiter_note: {
      className: "bg-surface-container-high border-outline text-on-surface-variant",
      icon: IconPencil,
    },
  };
  const ftypeStyle =
    ftypeStyles[ftype] ?? ftypeStyles.recruiter_note;
  const FtypeIcon = ftypeStyle.icon;

  return (
    <li
      className={cn(
        "bg-surface-container-low border p-4 space-y-3 relative overflow-hidden",
        recalibrated
          ? "border-secondary-fixed-dim/40 bg-secondary-fixed-dim/5"
          : "border-outline-variant"
      )}
    >
      {/* Recalibration left-edge accent — same instrumentation language
          as the dashboard KPI tiles, signals "this row mattered". */}
      {recalibrated && (
        <span className="absolute left-0 top-0 bottom-0 w-0.5 bg-secondary-fixed-dim" />
      )}
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <span
            className={cn(
              "px-2 py-0.5 border font-mono-label text-mono-label uppercase tracking-wider flex items-center gap-1.5",
              ftypeStyle.className
            )}
          >
            <FtypeIcon size={12} />
            {ftypeLabel}
          </span>
          {candidate ? (
            <span className="font-mono-label text-mono-label text-outline uppercase tracking-wider">
              re: {candidate.full_name}
            </span>
          ) : (
            <span className="font-mono-label text-mono-label text-outline uppercase tracking-wider">
              project-wide
            </span>
          )}
          {recalibrated && (
            <span className="px-2 py-0.5 border border-secondary-fixed-dim/40 bg-secondary-fixed-dim/10 text-secondary-fixed-dim font-mono-label text-mono-label uppercase tracking-wider flex items-center gap-1">
              <IconRefresh size={12} />
              Recalibration triggered
            </span>
          )}
        </div>
        <div className="font-mono-label text-mono-label text-outline uppercase tracking-wider whitespace-nowrap">
          {submitterName}
          {submitterRole ? ` · ${submitterRole}` : ""} ·{" "}
          {formatRelative(row.created_at)}
        </div>
      </header>

      <p className="font-mono-data text-body-main text-on-surface leading-relaxed border-l-2 border-primary-container/40 pl-3">
        {row.content}
      </p>

      {interpreted.summary && (
        <div className="border-t border-outline-variant/40 pt-3 space-y-3">
          <div className="flex items-start gap-2">
            <IconIntelligence size={14} className="text-primary mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="font-mono-label text-mono-label text-primary uppercase tracking-widest">
                AI synthesis
              </span>
              <p className="text-body-main text-on-surface-variant mt-1">
                {interpreted.summary}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <InterpretCard
              tone="primary"
              title="Preference shifts"
              icon={IconTrendUp}
              items={interpreted.preference_changes ?? []}
            />
            <InterpretCard
              tone="error"
              title="Bias patterns"
              icon={IconAlert}
              items={interpreted.bias_patterns ?? []}
            />
            <InterpretCard
              tone="tertiary"
              title="Contradictions"
              icon={IconCheck}
              items={interpreted.contradictions ?? []}
            />
          </div>

          {interpreted.suggested_weight_adjustments &&
            interpreted.suggested_weight_adjustments.length > 0 && (
              <WeightAdjustmentsCard
                adjustments={interpreted.suggested_weight_adjustments}
                applied={recalibrated}
              />
            )}
        </div>
      )}

      {!interpreted.summary && interpreted.error && (
        <div className="bg-error-container/10 border border-error/40 px-3 py-2 font-mono-data text-body-main text-error">
          Interpretation failed: {interpreted.error}
        </div>
      )}
      {!interpreted.summary && !interpreted.error && (
        <div className="font-mono-label text-mono-label text-outline uppercase tracking-wider flex items-center gap-1.5">
          <IconRefresh size={12} className="animate-spin" />
          Awaiting AI interpretation
        </div>
      )}
    </li>
  );
}

function InterpretCard({
  tone,
  title,
  icon: Icon,
  items,
}: {
  tone: "primary" | "error" | "tertiary";
  title: string;
  icon: (props: IconProps) => React.ReactElement;
  items: string[];
}) {
  const palette =
    tone === "primary"
      ? "border-l-primary-container text-primary"
      : tone === "error"
        ? "border-l-error text-error"
        : "border-l-tertiary text-tertiary";
  return (
    <div
      className={cn(
        "bg-surface-container-lowest border border-outline-variant border-l-2 p-3",
        palette.split(" ")[0]
      )}
    >
      <h4
        className={cn(
          "font-mono-label text-mono-label uppercase tracking-widest mb-2 flex items-center gap-1.5",
          palette.split(" ")[1]
        )}
      >
        <Icon size={12} />
        {title}
      </h4>
      {items.length === 0 ? (
        <span className="text-body-main text-outline italic">—</span>
      ) : (
        <ul className="space-y-1">
          {items.map((item, i) => (
            <li
              key={i}
              className="font-mono-data text-body-main text-on-surface-variant leading-snug"
            >
              · {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function WeightAdjustmentsCard({
  adjustments,
  applied,
}: {
  adjustments: NonNullable<FeedbackInterpretation["suggested_weight_adjustments"]>;
  applied: boolean;
}) {
  return (
    <div
      className={cn(
        "border px-3 py-2.5 space-y-2",
        applied
          ? "border-secondary-fixed-dim/40 bg-secondary-fixed-dim/5"
          : "border-outline-variant bg-surface-container"
      )}
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h4 className="font-mono-label text-mono-label uppercase tracking-widest text-on-surface-variant flex items-center gap-1.5">
          <IconTune size={12} />
          Weight adjustments
        </h4>
        <span
          className={cn(
            "px-1.5 py-0.5 border font-mono-label text-mono-label uppercase tracking-wider",
            applied
              ? "border-secondary-fixed-dim/60 bg-secondary-fixed-dim/10 text-secondary-fixed-dim"
              : "border-tertiary/60 bg-tertiary/10 text-tertiary"
          )}
        >
          {applied ? "Applied" : "Pending"}
        </span>
      </div>
      {/* Compact two-column grid — dimension chip + reason text. The
          delta lives inside the chip so the row reads as a single
          adjustment unit. */}
      <ul className="space-y-1">
        {adjustments.map((adj, i) => (
          <li
            key={i}
            className="grid grid-cols-[110px_1fr] gap-3 items-baseline font-mono-data text-body-main"
          >
            <span
              className={cn(
                "px-2 py-0.5 border font-mono-label text-mono-label uppercase tracking-widest flex items-center justify-between gap-2 shrink-0",
                adj.delta > 0
                  ? "border-secondary-fixed-dim/60 text-secondary-fixed-dim"
                  : "border-error/60 text-error"
              )}
            >
              <span className="truncate">{adj.dimension}</span>
              <span className="tabular-nums shrink-0">
                {adj.delta > 0 ? `+${adj.delta}` : adj.delta}
              </span>
            </span>
            <span className="text-on-surface-variant">{adj.reason}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime();
  const diffMs = Date.now() - t;
  const min = Math.round(diffMs / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hrs = Math.round(min / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toISOString().slice(0, 10);
}
