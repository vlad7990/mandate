import Link from "next/link";
import { after } from "next/server";
import { notFound, redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { isSampleId } from "@/lib/sample";
import { SampleCandidateDetail } from "@/components/sample/sample-candidate-detail";
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
import { SetBreadcrumbs } from "@/components/dashboard/breadcrumbs";
import { LiveTick } from "@/components/ui/live-tick";
import { IconInfo, IconRefresh } from "@/components/icons";
import { CandidateView } from "./candidate-view";
import { PANEL_BODY, Panel, PanelMeta } from "@/components/projects/panel";
import { StatusChip } from "@/components/ui/status-chip";
import {
  ensureCandidateEvaluation,
  readCandidateEvaluation,
} from "@/lib/ai/generate-evaluation";
import { type Tier } from "@/lib/ranking/tiers";
import { normaliseRecruiterAssessment } from "@/lib/recruiter-assessment";
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
import { PlacementPanel } from "./placement-panel";
import { getAccess } from "@/lib/auth/access";
import { can } from "@/lib/auth/roles";
import { canReadPlacementFees } from "@/lib/fees/access";
import {
  FEE_LINE_COLUMNS,
  FEE_MODEL_LABELS,
  FEE_TERMS_COLUMNS,
  PLACEMENT_COLUMNS,
  PLACEMENT_FEE_COLUMNS,
  type FeeLineRow,
  type FeeTermsRow,
  type PlacementFeeRow,
  type PlacementRow,
} from "@/lib/fees/types";
import { resolveTerms } from "@/lib/fees/compute";
import { OutreachPanel, type OutreachEntry } from "./outreach-panel";
import { PortalLinkButton } from "./portal-link";
import { PipelineSelect } from "./pipeline-select";
import { RecruiterAssessmentPanel } from "./recruiter-assessment-panel";
import { PositioningPanel } from "./positioning-panel";
import { TierComparison } from "@/components/ui/tier-comparison";
import type { PositioningResult } from "@/lib/ai/positioning-agent";
import type { CandidatePsychology } from "@/lib/ai/psychology-agent";
import type { CultureProfile } from "@/lib/ai/company-culture-agent";
import { computeCultureMatch } from "@/lib/culture/culture-match";
import {
  normaliseAnnotationMap,
  normaliseConfidenceOverrides,
  normaliseFlagArray,
} from "@/lib/intelligence/overlays";
import { PsychologyPanel } from "./psychology-panel";
import { CandidateIntelligencePanel } from "./candidate-intelligence-panel";
import { TriangulationPanel } from "./triangulation-panel";
import type { CandidateIntelligenceReport } from "@/lib/ai/candidate-research-agent";
import type { TriangulationReport } from "@/lib/ai/triangulation-agent";
import type { CompanyIntelligenceReport } from "@/lib/ai/company-intelligence-agent";
import type { HiringManagerIntelligenceReport } from "@/lib/ai/hiring-manager-research-agent";
import type { Stakeholder } from "@/lib/ai/onboarding-analysis";
import { RetryEvaluationButton } from "./retry-evaluation-button";
import { RetryParseButton } from "./retry-parse-button";
import {
  OutreachStrategyPanel,
  type OutreachStrategyRow,
} from "./strategy-panel";
import {
  EngagementPanel,
  type EngagementLaneRow,
} from "./engagement-panel";
import { PrescreenPanel, type PrescreenRow } from "./prescreen-panel";
import {
  InterviewPlanPanel,
  type InterviewPlanRow,
} from "./interview-plan-panel";
import { computeEvidenceCoverage } from "@/lib/candidates/evidence-coverage";

type ProjectRow = {
  id: string;
  title: string;
  company_name: string;
  client_id: string | null;
  calibration_model: Partial<CalibrationModel> | null;
  company_context:
    | (Partial<CompanyContext> & {
        culture_profile?: CultureProfile;
        intelligence_report?: CompanyIntelligenceReport;
        hm_intelligence?: HiringManagerIntelligenceReport;
      })
    | null;
  onboarding_responses: { stakeholders?: Stakeholder[] } | null;
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
  recruiter_assessment: unknown;
  updated_at: string;
  /** Provenance. Drives the Art. 14 notification duty for sourced people. */
  source_kind: string | null;
  sourced_at: string | null;
  subject_notified_at: string | null;
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

  // Sample ids never touch the database — see the note in the mandate
  // route. Both ids must be sample, so a real project cannot be paired
  // with a fixture candidate or the reverse.
  if (isSampleId(id) && isSampleId(candidateId)) {
    return <SampleCandidateDetail projectId={id} candidateId={candidateId} />;
  }

  const supabase = await createServerSupabaseClient();

  // Independent lookups — neither filters on the other — so they issue
  // together. The ownership check that ties them (candidate.project_id
  // === id) still runs below, before anything renders.
  const [
    { data: project, error: projectError },
    { data: candidate, error: candError },
  ] = await Promise.all([
    supabase
      .from("projects")
      .select(
        "id, title, company_name, client_id, calibration_model, company_context, onboarding_responses"
      )
      .eq("id", id)
      .single<ProjectRow>(),
    supabase
      .from("candidates")
      .select(
        "id, project_id, full_name, email, linkedin_url, twitter_url, github_url, website_url, phone, location, current_title, current_company, archetype, pipeline_stage, cv_url, cv_structured, cv_processing, cv_parse_error, recruiter_assessment, updated_at, source_kind, sourced_at, subject_notified_at"
      )
      .eq("id", candidateId)
      .single<CandidateRow>(),
  ]);

  if (projectError || !project) {
    if (projectError?.code === "PGRST116") notFound();
    redirect("/");
  }

  if (candError || !candidate) {
    if (candError?.code === "PGRST116") notFound();
    redirect(`/app/projects/${id}/candidates`);
  }

  if (candidate.project_id !== id) {
    redirect(`/app/projects/${id}/candidates`);
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

  // The interview plan (116) — latest version, whatever its status; the
  // chip on the panel tells the truth about which state it is in.
  const { data: interviewPlanRow } = await supabase
    .from("interview_plans")
    .select(
      "id, version, status, content_json, is_generating, generation_error, approved_at"
    )
    .eq("project_id", projectId)
    .eq("candidate_id", candidate.id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle<InterviewPlanRow>();

  // Executive evaluation. This is a CACHE READ — it never calls the
  // agent, so the dossier renders at query speed whether or not a report
  // exists yet.
  //
  // It used to await `ensureCandidateEvaluation`, which generates on a
  // miss. That put a ~90s Sonnet call in the render path of the most
  // visited page in the product: with no loading boundary, first visit to
  // any candidate was a blank screen until the agent finished. Now a miss
  // schedules the same generation in `after()` — which runs once the
  // response has been flushed — and the page renders its existing pending
  // panel in the meantime.
  const evaluationState = await readCandidateEvaluation(candidate.id, project.id);
  if (evaluationState.status === "pending") {
    // Runs as the EVALUATION AGENT (077): the seam signs in per run, so
    // the render-built client this branch used to thread through
    // after() — the cookie caveat's fourth occurrence — is gone rather
    // than worked around. Any visitor's cache-miss (a viewer included,
    // who could never persist the write before) now generates lawfully;
    // a refused evaluator logs inside the seam and the pending panel
    // stands.
    after(async () => {
      try {
        await ensureCandidateEvaluation(candidate.id, project.id, {
          trigger: "profile_view",
        });
      } catch (err) {
        // after() rejections are invisible to the request; log so a
        // failed first-visit generation is at least diagnosable. The
        // recruiter still has the Retry button on the pending panel.
        console.error("[evaluation] background generation failed", err);
      }
    });
  }
  const evaluation =
    evaluationState.status === "ready" ? evaluationState.evaluation : null;

  // AI-derived tier from candidate_scores (the canonical source of
  // truth — `evaluation.final_verdict.tier` is a snapshot per report).
  const { data: scoreRow } = await supabase
    .from("candidate_scores")
    .select("tier, overall_score")
    .eq("project_id", project.id)
    .eq("candidate_id", candidate.id)
    .maybeSingle<{ tier: string | null; overall_score: number | null }>();
  const aiTier = (scoreRow?.tier as Tier | null) ?? null;

  const recruiterAssessment = normaliseRecruiterAssessment(
    candidate.recruiter_assessment
  );

  // Contact record, newest first. Drives both the outreach history and the
  // Art. 14 banner — a sourced person who has never been told is an open
  // obligation, not just an empty tab.
  const { data: outreachRows } = await supabase
    .from("candidate_outreach")
    .select(
      "id, channel, direction, subject, body, includes_privacy_notice, occurred_at, provider, delivery_status, sent_by_principal"
    )
    .eq("candidate_id", candidate.id)
    .order("occurred_at", { ascending: false });

  const outreach = (outreachRows ?? []) as OutreachEntry[];

  // The engagement lane (#22, 100) — the conversation's durable state,
  // maintained by the agent, decided by humans.
  const { data: laneRow } = await supabase
    .from("engagement_states")
    .select("id, state, escalation_reason, next_follow_up_at, draft, updated_at")
    .eq("candidate_id", candidate.id)
    .eq("project_id", projectId)
    .maybeSingle();

  const engagementLane = (laneRow ?? null) as EngagementLaneRow | null;

  // The pre-screen (#23, 101) — the live lane (an abandoned one is
  // history), plus the coverage gap computed from the CV in code.
  const { data: prescreenRow } = await supabase
    .from("prescreens")
    .select(
      "id, status, question_set, professional_evidence, interest_profile, escalation_reason, completed_at, updated_at"
    )
    .eq("candidate_id", candidate.id)
    .eq("project_id", projectId)
    .neq("status", "abandoned")
    .maybeSingle();

  const prescreen = (prescreenRow ?? null) as PrescreenRow | null;
  const evidenceCoverage = computeEvidenceCoverage(
    (candidate.cv_structured ?? null) as Record<string, unknown> | null
  );

  // The latest outreach strategy (#21, 097) — the draft source for the
  // outreach flow. Latest version wins; the panel renders its status.
  const { data: strategyRow } = await supabase
    .from("outreach_strategies")
    .select("id, status, version, content, created_at, approved_at")
    .eq("candidate_id", candidate.id)
    .eq("project_id", projectId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const strategy = (strategyRow ?? null) as OutreachStrategyRow | null;

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

  // The placement record, and the money behind it. Three reads rather than
  // one join because the fee tables are behind `fees:read` and the
  // placement is not — a researcher gets the placement and two empty
  // arrays, which is the answer, not a failure. See migration 050.
  const { data: placementRow } = await supabase
    .from("placements")
    .select(PLACEMENT_COLUMNS)
    .eq("candidate_id", candidate.id)
    .eq("project_id", projectId)
    .maybeSingle<PlacementRow>();

  let placementFee: PlacementFeeRow | null = null;
  let feeLines: FeeLineRow[] = [];

  if (placementRow) {
    const [{ data: feeRow }, { data: lineRows }] = await Promise.all([
      supabase
        .from("placement_fees")
        .select(PLACEMENT_FEE_COLUMNS)
        .eq("placement_id", placementRow.id)
        .maybeSingle<PlacementFeeRow>(),
      supabase
        .from("placement_fee_lines")
        .select(FEE_LINE_COLUMNS)
        .eq("placement_id", placementRow.id)
        .order("sequence", { ascending: true })
        .returns<FeeLineRow[]>(),
    ]);
    placementFee = feeRow ?? null;
    feeLines = lineRows ?? [];
  }

  // The client's active contacts, for the sign-off picker. Read from the
  // placement's own `client_id` rather than the project's, because 050
  // denormalises it so a placement keeps its client if the mandate is later
  // re-pointed. Empty when the mandate has no client yet, in which case the
  // sign-off is typed as a name instead.
  let signOffContacts: Array<{ id: string; full_name: string; title: string | null }> = [];

  if (placementRow?.client_id) {
    const { data: contactRows } = await supabase
      .from("client_contacts")
      .select("id, full_name, title")
      .eq("client_id", placementRow.client_id)
      .eq("is_archived", false)
      .order("is_primary", { ascending: false })
      .order("full_name")
      .returns<Array<{ id: string; full_name: string; title: string | null }>>();

    signOffContacts = contactRows ?? [];
  }

  const access = await getAccess();

  // The own-placement exception, decided here so the panel never holds a
  // figure it declines to draw. RLS has already refused to send the rows
  // to anyone this returns false for; this is what makes the UI say
  // "Restricted" rather than "no fee recorded".
  const canSeeFees = placementRow
    ? canReadPlacementFees(access?.role, access?.userId ?? null, placementRow)
    : can(access?.role, "fees:read");

  // The caller's org, not the project's — RLS scopes both to the same one,
  // and the project select does not carry `organization_id`.
  // The agreement in force, for the record-offer form's defaults and the
  // line that tells the user what it will bill. RLS refuses these rows
  // without `fees:read`, so a researcher gets null and the form asks for
  // the numbers instead of pretending to know them.
  const { data: termsRows } = canSeeFees
    ? await supabase
        .from("fee_terms")
        .select(FEE_TERMS_COLUMNS)
        .or(
          [
            `project_id.eq.${projectId}`,
            project.client_id ? `client_id.eq.${project.client_id}` : null,
          ]
            .filter(Boolean)
            .join(",")
        )
        .returns<FeeTermsRow[]>()
    : { data: null };

  const resolvedTerms = resolveTerms(
    (termsRows ?? []).find((t) => t.client_id != null) ?? null,
    (termsRows ?? []).find((t) => t.project_id === projectId) ?? null
  );

  const { data: orgRow } = access?.organizationId
    ? await supabase
        .from("organizations")
        .select("base_currency")
        .eq("id", access.organizationId)
        .maybeSingle<{ base_currency: string }>()
    : { data: null };

  const notices = (
    <>
      {parseError && (
        <div
          role="alert"
          className="mb-5 flex items-start gap-3 border border-error/60 bg-error/10 px-4 py-3"
        >
          <span className="mt-px shrink-0 font-mono-label text-[10px] font-bold uppercase tracking-[0.1em] text-error">
            Failed
          </span>
          <div>
            <div className="text-[13px] font-semibold text-on-surface">
              CV parse failed
            </div>
            <p className="mt-1 text-[13px] leading-relaxed text-on-surface-variant">
              {parseError}
            </p>
            {candidate.cv_url && (
              <RetryParseButton
                candidateId={candidate.id}
                projectId={project.id}
              />
            )}
          </div>
        </div>
      )}

      {isProcessing && (
        <div
          role="status"
          aria-live="polite"
          className="mb-5 flex items-center gap-3 border border-primary-container/40 bg-primary-container/10 px-4 py-3"
        >
          <IconRefresh size={16} className="animate-spin text-primary" />
          <div>
            <div className="font-mono-label text-[10px] font-bold uppercase tracking-[0.1em] text-primary">
              AI parse in flight
            </div>
            <p className="mt-0.5 text-[13px] leading-relaxed text-on-surface-variant">
              The structured profile lands here when the agent finishes.
            </p>
          </div>
        </div>
      )}
    </>
  );

  const overview = (
    <>
      <ArchetypeStrip archetype={archetype} fitSummary={profile.fit_summary} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-8">
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

        <div className="space-y-4 lg:col-span-4">
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
            value={profile.domain ?? null}
          />
          <EditableSignalCard
            candidateId={candidate.id}
            projectId={projectId}
            field="scale"
            title="Scale"
            value={profile.scale ?? null}
          />
          <ChipCard title="Tech exposure" items={profile.tech_exposure ?? []} />
          <ChipCard
            title="Transformation"
            items={profile.transformation_experience ?? []}
          />
        </div>
      </div>
    </>
  );

  const evaluationTab = (
    <>
      {evaluation ? (
        <EvaluationReport
          evaluation={evaluation}
          candidateId={candidate.id}
          candidateName={candidate.full_name}
          candidateTitle={candidate.current_title}
          candidateCompany={candidate.current_company}
          projectId={project.id}
        />
      ) : profile.fit_dimensions ? (
        <EvaluationPendingPanel
          processing={isProcessing}
          candidateId={candidate.id}
          projectId={project.id}
        />
      ) : null}

      <RecruiterAssessmentPanel
        candidateId={candidate.id}
        projectId={project.id}
        aiTier={aiTier}
        initial={recruiterAssessment}
      />
    </>
  );

  const triangulation = (
    <>
      <TriangulationPanel
        candidateId={candidate.id}
        projectId={project.id}
        candidateName={candidate.full_name}
        companyName={project.company_name}
        hmName={firstStakeholder(project.onboarding_responses)?.name ?? null}
        readiness={{
          company: Boolean(project.company_context?.intelligence_report),
          candidate: Boolean(
            (profile as { candidate_intelligence?: CandidateIntelligenceReport })
              .candidate_intelligence
          ),
          hm: Boolean(project.company_context?.hm_intelligence),
        }}
        initial={
          ((profile as { triangulation_report?: TriangulationReport })
            .triangulation_report) ?? null
        }
      />

      <CandidateIntelligencePanel
        candidateId={candidate.id}
        projectId={project.id}
        candidateName={candidate.full_name}
        initial={
          ((profile as { candidate_intelligence?: CandidateIntelligenceReport })
            .candidate_intelligence) ?? null
        }
      />

      <PsychologyPanel
        candidateId={candidate.id}
        projectId={project.id}
        initial={
          ((profile as { psychology?: CandidatePsychology }).psychology) ?? null
        }
        initialContext={
          (profile as { psychology_context?: string | null })
            .psychology_context ?? null
        }
        notes={normaliseAnnotationMap(
          (profile as { psychology_notes?: unknown }).psychology_notes
        )}
        flags={normaliseFlagArray(
          (profile as { psychology_flags?: unknown }).psychology_flags
        )}
        overrides={normaliseConfidenceOverrides(
          (profile as { psychology_confidence_overrides?: unknown })
            .psychology_confidence_overrides
        )}
        cultureMatch={computeCultureMatch(
          (profile as { psychology?: CandidatePsychology }).psychology ?? null,
          project.company_context?.culture_profile ?? null
        )}
      />
    </>
  );

  return (
    <>
      <SetBreadcrumbs
        crumbs={[
          { label: project.title, href: `/app/projects/${project.id}`, maxChars: 24 },
          { label: "Candidates", href: `/app/projects/${project.id}/candidates` },
          { label: candidate.full_name, maxChars: 28 },
        ]}
      />

      <CandidateView
        notices={notices}
        identity={
          <CandidateIdentity
            candidate={candidate}
            profile={profile}
            archetype={archetype}
            projectId={projectId}
            aiTier={aiTier}
            recruiterTier={recruiterAssessment.tier}
          />
        }
        rail={
          <DecisionRail
            candidate={candidate}
            projectId={projectId}
            stage={stage}
            fitPct={fitPct}
            archetype={archetype}
          />
        }
        tabs={[
          { id: "overview", label: "Overview", content: overview },
          { id: "evaluation", label: "Evaluation", content: evaluationTab },
          {
            id: "interview",
            label: "Interview plan",
            content: (
              <InterviewPlanPanel
                projectId={projectId}
                candidateId={candidate.id}
                initial={interviewPlanRow ?? null}
                hasCalibration={Boolean(
                  project.calibration_model?.dimension_weights
                )}
              />
            ),
          },
          { id: "triangulation", label: "Triangulation", content: triangulation },
          {
            id: "positioning",
            label: "Positioning",
            content: (
              <PositioningPanel
                candidateId={candidate.id}
                projectId={project.id}
                initial={
                  ((profile as { positioning_kit?: PositioningResult })
                    .positioning_kit) ?? null
                }
              />
            ),
          },
          {
            id: "placement",
            label: "Placement & fee",
            content: (
              <PlacementPanel
                projectId={projectId}
                candidateId={candidate.id}
                candidateName={candidate.full_name}
                placement={placementRow ?? null}
                fee={placementFee}
                lines={feeLines}
                canSeeFees={canSeeFees}
                canWrite={can(access?.role, "mandates:write")}
                today={new Date().toISOString().slice(0, 10)}
                baseCurrency={orgRow?.base_currency ?? "USD"}
                contacts={signOffContacts}
                terms={
                  resolvedTerms
                    ? {
                        summary: [
                          resolvedTerms.source === "mandate"
                            ? "Mandate override"
                            : "Client agreement",
                          FEE_MODEL_LABELS[resolvedTerms.fee_model],
                          resolvedTerms.fee_percentage != null
                            ? `${resolvedTerms.fee_percentage}%`
                            : null,
                          resolvedTerms.currency,
                          `${resolvedTerms.guarantee_days}-day guarantee`,
                        ]
                          .filter(Boolean)
                          .join(" // "),
                        feePercentage: resolvedTerms.fee_percentage,
                        currency: resolvedTerms.currency,
                      }
                    : null
                }
              />
            ),
          },
          {
            id: "notes",
            label: "Notes & activity",
            content: (
              <CandidateNotesPanel
                candidateId={candidate.id}
                projectId={projectId}
                candidateName={candidate.full_name}
                notes={notes as CandidateNote[]}
              />
            ),
          },
          {
            id: "outreach",
            label: "Outreach",
            content: (
              <>
                <OutreachStrategyPanel
                  projectId={projectId}
                  candidateId={candidate.id}
                  candidateEmail={candidate.email}
                  strategy={strategy}
                />
                <EngagementPanel
                  projectId={projectId}
                  candidateId={candidate.id}
                  lane={engagementLane}
                />
                <PrescreenPanel
                  projectId={projectId}
                  candidateId={candidate.id}
                  prescreen={prescreen}
                  coverage={evidenceCoverage}
                />
                <OutreachPanel
                  projectId={projectId}
                  candidateId={candidate.id}
                  candidate={{
                    source_kind: candidate.source_kind,
                    sourced_at: candidate.sourced_at,
                    subject_notified_at: candidate.subject_notified_at,
                  }}
                  entries={outreach}
                />
                {/* Beside the notice machinery on purpose (D10): the
                    notice is the natural moment to hand the person
                    their window. */}
                <PortalLinkButton candidateId={candidate.id} />
              </>
            ),
          },
        ]}
      />
    </>
  );
}

/**
 * Identity. One h1, and no control inside it — the name is still editable,
 * but the edit affordance is the text itself rather than a button competing
 * with the heading. Everything that scores or decides lives in the rail.
 */
function CandidateIdentity({
  candidate,
  profile,
  archetype,
  projectId,
  aiTier,
  recruiterTier,
}: {
  candidate: CandidateRow;
  profile: Partial<CandidateProfile>;
  archetype: Archetype | null;
  projectId: string;
  aiTier: Tier | null;
  recruiterTier: Tier | null;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
      <span
        aria-hidden
        className="flex h-14 w-14 shrink-0 items-center justify-center border border-outline-variant bg-surface-container-high font-mono-label text-base font-semibold uppercase text-on-surface-variant"
      >
        {initials(candidate.full_name)}
      </span>

      <div className="min-w-0 flex-1 space-y-3">
        <h1 className="text-[26px] font-bold leading-tight tracking-tight text-on-surface">
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

        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[13px] text-on-surface-variant">
          <EditableText
            candidateId={candidate.id}
            projectId={projectId}
            field="current_title"
            value={candidate.current_title}
            placeholder="Current title"
            ariaLabel="current title"
          />
          <span className="text-outline-variant" aria-hidden>
            /
          </span>
          <EditableText
            candidateId={candidate.id}
            projectId={projectId}
            field="current_company"
            value={candidate.current_company}
            placeholder="Current company"
            ariaLabel="current company"
          />
          <span className="text-outline-variant" aria-hidden>
            /
          </span>
          <span className="inline-flex items-center gap-1 text-outline">
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
            experience
          </span>
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <ArchetypeSelect
            candidateId={candidate.id}
            projectId={projectId}
            value={archetype}
          />
          <TierComparison aiTier={aiTier} recruiterTier={recruiterTier} />
        </div>

        <ContactFieldsRail
          candidateId={candidate.id}
          projectId={projectId}
          initial={{
            email: candidate.email,
            phone: candidate.phone,
            // Fallback to the parsed CV value when the typed column hasn't
            // been overridden yet.
            location: candidate.location ?? profile.location ?? null,
            linkedin_url: candidate.linkedin_url,
            twitter_url: candidate.twitter_url,
            github_url: candidate.github_url,
            website_url: candidate.website_url,
          }}
        />
      </div>
    </div>
  );
}

/**
 * The decision rail. Present on every tab, because advancing a stage and
 * recording feedback are what a recruiter does daily, and neither should be
 * behind a tab. The fit figure sits here too — it is a reading of the
 * evidence, not a verdict, so it stays beside the controls rather than
 * heading the page.
 */
function DecisionRail({
  candidate,
  projectId,
  stage,
  fitPct,
  archetype,
}: {
  candidate: CandidateRow;
  projectId: string;
  stage: PipelineStage;
  fitPct: number | null;
  archetype: Archetype | null;
}) {
  return (
    <>
      <div className="flex flex-col gap-2.5">
        <p className="font-mono-label text-[10px] font-bold uppercase tracking-[0.12em] text-outline">
          Pipeline stage
        </p>
        <PipelineSelect
          candidateId={candidate.id}
          projectId={projectId}
          current={stage}
        />
        <p className="text-[11px] leading-relaxed text-outline">
          Changing the stage is logged and visible to the mandate.
        </p>
      </div>

      <div className="border-t border-outline-variant/60 pt-4">
        <div className="flex items-center justify-between gap-2">
          <p className="font-mono-label text-[10px] font-bold uppercase tracking-[0.12em] text-outline">
            Overall fit
          </p>
          {archetype && (
            <span className="font-mono-label text-[10px] uppercase tracking-[0.08em] text-outline">
              {archetype}
            </span>
          )}
        </div>
        <div className="mt-2 flex items-baseline gap-1">
          <span
            className={cn(
              "font-heading text-[30px] leading-none tabular-nums",
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
            <span className="font-mono-label text-[11px] uppercase tracking-[0.08em] text-on-surface-variant">
              %
            </span>
          )}
        </div>
        <div
          className="mt-2 h-1.5 overflow-hidden bg-surface-container-highest"
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
        <p className="mt-2 text-[11px] leading-relaxed text-outline">
          Weighted against the approved calibration. Decision support — never a
          recommendation.
        </p>
      </div>

      <div className="border-t border-outline-variant/60 pt-4">
        <Link
          href={`/app/projects/${projectId}/feedback?candidate=${candidate.id}`}
          prefetch={false}
          className="flex items-center justify-center gap-2 border border-outline-variant px-4 py-2.5 font-mono-label text-[11px] font-semibold uppercase tracking-[0.1em] text-on-surface-variant transition-colors hover:border-primary hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          Submit feedback
        </Link>
      </div>

      <div className="flex flex-col gap-1.5 border-t border-outline-variant/60 pt-4 text-[11px] leading-relaxed text-outline">
        {candidate.cv_url && (
          <span className="truncate">{candidate.cv_url.split("/").pop()}</span>
        )}
        <LiveTick iso={candidate.updated_at} label="Updated" pulse={false} />
        <Link
          href={`/app/projects/${projectId}/candidates`}
          prefetch={false}
          className="mt-1 text-primary hover:underline"
        >
          All candidates
        </Link>
      </div>
    </>
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
    <Panel
      title="Archetype"
      meta={
        <PanelMeta>
          {archetype ?? "Awaiting parse"} · decision support, not a
          recommendation
        </PanelMeta>
      }
    >
      <div className={cn(PANEL_BODY, "flex flex-col gap-2.5")}>
        {archetype && (
          <p className={cn("text-[13px] leading-relaxed", ARCHETYPE_TEXT[archetype])}>
            {ARCHETYPE_BLURBS[archetype]}
          </p>
        )}
        {fitSummary && (
          <p className="max-w-[76ch] text-sm leading-relaxed text-on-surface">
            {fitSummary}
          </p>
        )}
      </div>
    </Panel>
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
    <Panel
      title="Synthesis"
      meta={
        <StatusChip tone={summary ? "secondary" : "neutral"} intensity="soft">
          {summary ? "Parsed" : "Pending"}
        </StatusChip>
      }
    >
      <div className={cn(PANEL_BODY, "max-w-[76ch] text-sm leading-relaxed text-on-surface")}>
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
    </Panel>
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
  // Three signal columns in one ledger rather than three cards. The tone
  // lives in the column heading now: a 2px coloured left rule on each column
  // was three accent bars competing across a single panel.
  return (
    <Panel title="Signals">
      <div className="grid grid-cols-1 divide-y divide-outline-variant/60 md:grid-cols-3 md:divide-x md:divide-y-0">
        <SignalColumn
          candidateId={candidateId}
          projectId={projectId}
          field="strengths"
          title="Strengths"
          tone="secondary"
          marker="+"
          items={strengths ?? []}
        />
        <SignalColumn
          candidateId={candidateId}
          projectId={projectId}
          field="development_areas"
          title="Development"
          tone="warn"
          marker="−"
          items={development ?? []}
        />
        <SignalColumn
          candidateId={candidateId}
          projectId={projectId}
          field="risks"
          title="Risk Vectors"
          tone="danger"
          marker="!"
          items={risks ?? []}
        />
      </div>
    </Panel>
  );
}

function SignalColumn({
  candidateId,
  projectId,
  field,
  title,
  tone,
  marker,
  items,
}: {
  candidateId: string;
  projectId: string;
  field: "strengths" | "development_areas" | "risks";
  title: string;
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
  return (
    <div className="p-[18px]">
      <h4
        className={cn(
          "mb-3 flex items-center gap-2 font-mono-label text-[10px] font-bold uppercase tracking-[0.12em] tabular-nums",
          headingClass
        )}
      >
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
    <Panel
      title="Fit by dimension"
      meta={
        fitPct != null ? (
          <PanelMeta>
            <span className="tabular-nums">{fitPct}% overall</span>
          </PanelMeta>
        ) : undefined
      }
    >
      <div className={cn(PANEL_BODY, "flex flex-col gap-4")}>
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
        <p className="border-t border-outline-variant/60 px-[18px] py-3.5 text-[13px] leading-relaxed text-on-surface-variant">
          {fitSummary}
        </p>
      )}
    </Panel>
  );
}

function EditableSignalCard({
  candidateId,
  projectId,
  field,
  title,
  value,
}: {
  candidateId: string;
  projectId: string;
  field: "domain" | "scale";
  title: string;
  value: string | null;
}) {
  return (
    <Panel title={title}>
      <div className={cn(PANEL_BODY, "text-[13px] leading-relaxed text-on-surface-variant")}>
        <EditableText
          candidateId={candidateId}
          projectId={projectId}
          field={field}
          value={value}
          placeholder={`Click to add ${title.toLowerCase()}.`}
          ariaLabel={title.toLowerCase()}
        />
      </div>
    </Panel>
  );
}

function ChipCard({
  title,
  items,
}: {
  title: string;
  items: string[];
}) {
  return (
    <Panel
      title={title}
      meta={
        <PanelMeta>
          <span className="tabular-nums">{items.length}</span>
        </PanelMeta>
      }
    >
      <div className={PANEL_BODY}>
        {items.length === 0 ? (
          <p className="text-[13px] leading-relaxed text-outline">
            Nothing recorded yet.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {items.map((item, i) => (
              <span
                key={i}
                className="border border-outline-variant bg-surface-container px-2 py-1 font-mono-label text-[10px] uppercase tracking-[0.08em] text-on-surface-variant"
              >
                {item}
              </span>
            ))}
          </div>
        )}
      </div>
    </Panel>
  );
}

function CareerTimeline({
  roles,
}: {
  roles: CandidateProfile["roles"] | undefined;
}) {
  const list = roles ?? [];
  return (
    <Panel
      title="Career"
      meta={
        <PanelMeta>
          <span className="tabular-nums">
            {list.length} role{list.length === 1 ? "" : "s"}
          </span>
        </PanelMeta>
      }
    >
      {list.length === 0 ? (
        <p className={cn(PANEL_BODY, "text-[13px] leading-relaxed text-outline")}>
          Career history will populate here once the CV is parsed.
        </p>
      ) : (
        <ol className="flex flex-col gap-5 p-[18px]">
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
                  className="mt-2 h-2 w-2 shrink-0 bg-secondary-fixed-dim ring-1 ring-secondary-fixed-dim/40 ring-offset-2 ring-offset-surface-container-low"
                  aria-hidden
                />
                <div className="min-w-0 flex-1 border border-outline-variant bg-surface-container px-3 py-2">
                  <div className="text-[13px] font-semibold text-on-surface">
                    {role.title}
                  </div>
                  <p className="mt-1 text-[13px] leading-relaxed text-on-surface-variant">
                    {role.summary}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Panel>
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
    <Panel
      title="Evaluation report"
      meta={
        <PanelMeta>{processing ? "Pending" : "Generation failed"}</PanelMeta>
      }
    >
      <div className={cn(PANEL_BODY, "flex flex-wrap items-start gap-3")}>
        {processing ? (
          <IconRefresh size={18} className="mt-0.5 animate-spin text-primary" />
        ) : (
          <IconInfo size={18} className="mt-0.5 text-tertiary" />
        )}
        <div className="min-w-0 flex-1 space-y-1.5">
          {processing ? (
            <p className="text-[13px] leading-relaxed text-on-surface-variant">
              The CV is still being parsed. Once parsing completes, the
              evaluation agent will run automatically and the report will
              appear here on the next visit.
            </p>
          ) : (
            <p className="text-[13px] leading-relaxed text-on-surface-variant">
              The evaluation agent could not produce a report on the last
              attempt. Click <span className="font-semibold text-on-surface">Retry evaluation</span>{" "}
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
    </Panel>
  );
}

// Forces TS to treat ARCHETYPES as imported even if unused above (it's referenced by Archetype).
void ARCHETYPES;

/**
 * First non-empty stakeholder is treated as the hiring manager — same
 * convention used on the project page. Triangulation needs the name to
 * label the HM circle in the Venn diagram and to gate the action.
 */
function firstStakeholder(
  onboarding: { stakeholders?: Stakeholder[] } | null
): Stakeholder | null {
  const list = onboarding?.stakeholders ?? [];
  return list.find((s) => s && typeof s.name === "string" && s.name.trim()) ?? null;
}

/**
 * Inline tab rail above the bento grid. The Triangulation panel sits
 * lower on the page; this rail is purely an anchor jump so the user can
 * find it without scrolling. Server-rendered — no JS state needed.
 */
