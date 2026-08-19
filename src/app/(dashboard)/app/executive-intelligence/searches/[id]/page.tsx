import { notFound, redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { isSampleId } from "@/lib/sample";
import { SampleEiWorkspace } from "@/components/sample/sample-ei-workspace";
import { normalizeSuccessProfile } from "@/lib/ai/executive-role-architect-agent";
import { formatDateUtc } from "@/lib/executive/format";
import type { ExecutiveCompanyContext } from "@/lib/ai/executive-company-context-agent";
import {
  EXEC_CANDIDATE_STAGE_LABELS,
  SEARCH_STATUS_LABELS,
  SERVICE_TIER_LABELS,
  type ExecutiveAuditEventRow,
  type ExecutiveCandidateStage,
  type ExecutiveSearchRow,
  type ProfileStatus,
} from "@/lib/executive/types";
import {
  ExecutiveSearchWorkspace,
  type CandidateRow,
  type ChainStep,
  type ProfilePanel,
  type WorkspaceVm,
} from "./workspace-view";

/**
 * The Executive Intelligence workspace — comp 11. Data only; `workspace-view`
 * owns every pixel. Nothing here is taken from the comp: each count is
 * computed from the linked candidates and their plan and assessment rows.
 */

type ProfileRow = {
  id: string;
  version: number;
  status: ProfileStatus;
  is_generating: boolean;
  generation_error: string | null;
  updated_at: string;
  approved_at: string | null;
  approved_by: string | null;
  prompt_version: string | null;
  content_json: unknown;
};

type LinkedRow = {
  stage: ExecutiveCandidateStage;
  candidate_id: string;
  candidates: {
    id: string;
    full_name: string;
    current_title: string | null;
    current_company: string | null;
  } | null;
};

type ArtifactRow = { candidate_id: string; status: ProfileStatus };

/** approved beats draft beats nothing — the state that matters per candidate. */
type ArtifactState = "approved" | "draft" | "none";

function artifactStates(rows: ArtifactRow[]): Map<string, ArtifactState> {
  const out = new Map<string, ArtifactState>();
  for (const r of rows) {
    if (r.status === "approved") out.set(r.candidate_id, "approved");
    else if (out.get(r.candidate_id) !== "approved") out.set(r.candidate_id, "draft");
  }
  return out;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "";
  return (first + last).toUpperCase();
}

/** "2 in diligence · 1 advanced" — zero counts are left out entirely. */
function stageSummary(counts: Map<ExecutiveCandidateStage, number>): string {
  return [...counts.entries()]
    .map(([stage, count]) => `${count} ${EXEC_CANDIDATE_STAGE_LABELS[stage].toLowerCase()}`)
    .join(" · ");
}

export default async function ExecutiveSearchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Sample ids never touch the database — see the note in the mandate
  // route. Checked before the client is constructed.
  if (isSampleId(id)) {
    return <SampleEiWorkspace />;
  }

  const supabase = await createServerSupabaseClient();

  const { data: search, error } = await supabase
    .from("executive_searches")
    .select("*")
    .eq("id", id)
    .single<ExecutiveSearchRow>();

  if (error || !search) {
    if (error?.code === "PGRST116") notFound();
    redirect("/app/executive-intelligence/searches");
  }

  const [
    { data: profileRows },
    { data: auditRows },
    { data: weightRows },
    { data: linkedRows },
    { data: planRows },
    { data: assessmentRows },
  ] = await Promise.all([
    supabase
      .from("role_success_profiles")
      .select(
        "id, version, status, is_generating, generation_error, updated_at, approved_at, approved_by, prompt_version, content_json"
      )
      .eq("search_id", id)
      .order("version", { ascending: false })
      .limit(5),
    supabase
      .from("executive_audit_events")
      .select("id, event_type, created_at, detail")
      .eq("search_id", id)
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("executive_search_competencies")
      .select("weight, executive_competencies!executive_search_competencies_competency_id_fkey(key, name)")
      .eq("search_id", id)
      .order("weight", { ascending: false }),
    supabase
      .from("executive_search_candidates")
      .select(
        "stage, candidate_id, candidates!executive_search_candidates_candidate_id_fkey(id, full_name, current_title, current_company)"
      )
      .eq("search_id", id)
      .order("created_at", { ascending: true }),
    supabase
      .from("executive_interview_plans")
      .select("candidate_id, status")
      .eq("search_id", id),
    supabase
      .from("executive_assessments")
      .select("candidate_id, status")
      .eq("search_id", id),
  ]);

  const profiles = (profileRows ?? []) as unknown as ProfileRow[];
  const audit = (auditRows ?? []) as Pick<
    ExecutiveAuditEventRow,
    "id" | "event_type" | "created_at" | "detail"
  >[];
  const linked = (linkedRows ?? []) as unknown as LinkedRow[];
  const plans = artifactStates((planRows ?? []) as ArtifactRow[]);
  const assessments = artifactStates((assessmentRows ?? []) as ArtifactRow[]);

  type CompetencyEmbed = { key: string; name: string };
  const rawWeights = (
    (weightRows ?? []) as unknown as Array<{
      weight: number;
      executive_competencies: CompetencyEmbed | CompetencyEmbed[] | null;
    }>
  ).flatMap((r) => {
    const comp = Array.isArray(r.executive_competencies)
      ? r.executive_competencies[0]
      : r.executive_competencies;
    return comp ? [{ key: comp.key, name: comp.name, weight: Math.max(r.weight, 0) }] : [];
  });
  // Share of the search's total weight — the stored numbers are not
  // guaranteed to sum to 100, so a raw value with a % sign would be a claim
  // the data does not support.
  const weightTotal = rawWeights.reduce((sum, w) => sum + w.weight, 0);
  const weights = rawWeights.map((w) => ({
    key: w.key,
    name: w.name,
    share: weightTotal > 0 ? Math.round((w.weight / weightTotal) * 100) : 0,
  }));

  const approvedProfile = profiles.find((p) => p.status === "approved") ?? null;
  const latestProfile = profiles[0] ?? null;

  let approverName: string | null = null;
  if (approvedProfile?.approved_by) {
    const { data: approver } = await supabase
      .from("users")
      .select("full_name, email")
      .eq("id", approvedProfile.approved_by)
      .maybeSingle<{ full_name: string | null; email: string | null }>();
    approverName = approver?.full_name?.trim() || approver?.email || null;
  }

  const stageCounts = new Map<ExecutiveCandidateStage, number>();
  for (const row of linked) {
    stageCounts.set(row.stage, (stageCounts.get(row.stage) ?? 0) + 1);
  }

  const countBy = (states: Map<string, ArtifactState>, want: ArtifactState) =>
    linked.filter((l) => (states.get(l.candidate_id) ?? "none") === want).length;

  const plansApproved = countBy(plans, "approved");
  const plansDraft = countBy(plans, "draft");
  const assessmentsApproved = countBy(assessments, "approved");
  const assessmentsDraft = countBy(assessments, "draft");

  const contextStatus = search.company_context_status;
  const context =
    contextStatus === "ready"
      ? (search.company_context as unknown as ExecutiveCompanyContext)
      : null;

  const base = `/app/executive-intelligence/searches/${search.id}`;

  const steps: ChainStep[] = [
    {
      label: "Company context",
      badge:
        contextStatus === "ready"
          ? "Ready"
          : contextStatus === "generating"
            ? "Researching"
            : contextStatus === "failed"
              ? "Failed"
              : "Not run",
      detail: context
        ? `${context.sources?.length ?? 0} sources · ${formatDateUtc(context.generated_at)}`
        : contextStatus === "generating"
          ? "The Company Context Agent is researching now"
          : contextStatus === "failed"
            ? "Retry from the context panel"
            : "Run research to ground the profile",
      state: contextStatus === "ready" ? "done" : "active",
    },
    {
      label: "Success profile",
      badge: approvedProfile
        ? "Approved"
        : latestProfile?.is_generating
          ? "Drafting"
          : latestProfile?.generation_error
            ? "Failed"
            : latestProfile
              ? "In review"
              : "Not started",
      detail: approvedProfile
        ? `v${approvedProfile.version}${approverName ? ` · approved by ${approverName}` : ""}`
        : latestProfile?.is_generating
          ? "An AI draft is generating"
          : latestProfile?.generation_error
            ? "The last generation failed — open the profile to retry"
            : latestProfile
              ? `v${latestProfile.version} awaits review and approval`
              : "Drafted by the Role Architect from this intake",
      state: approvedProfile ? "done" : "active",
      href: `${base}/success-profile`,
    },
    {
      label: "Candidates",
      badge: linked.length > 0 ? `${linked.length} linked` : "None linked",
      detail:
        linked.length > 0
          ? stageSummary(stageCounts)
          : "Attach candidates from the organisation pool",
      state: linked.length > 0 ? "done" : "active",
      href: `${base}/candidates`,
    },
    {
      label: "Interview plans",
      badge:
        linked.length === 0
          ? "Locked"
          : plansApproved === linked.length
            ? "Approved"
            : plansApproved + plansDraft > 0
              ? "In progress"
              : "Not started",
      detail:
        linked.length === 0
          ? "Opens once a candidate is linked"
          : `${plansApproved} approved · ${plansDraft} draft · ${
              linked.length - plansApproved - plansDraft
            } not started`,
      state:
        linked.length === 0
          ? "locked"
          : plansApproved === linked.length
            ? "done"
            : "active",
    },
    {
      label: "Assessments",
      badge:
        plansApproved === 0
          ? "Locked"
          : assessmentsApproved > 0
            ? `${assessmentsApproved} approved`
            : "Not started",
      detail:
        plansApproved === 0
          ? "Opens per candidate once their interview plan is approved"
          : `${assessmentsApproved} approved · ${assessmentsDraft} draft · ${
              plansApproved - assessmentsApproved - assessmentsDraft
            } open`,
      state:
        plansApproved === 0 ? "locked" : assessmentsApproved > 0 ? "done" : "active",
    },
  ];

  // Only the first open step is the one to act on. Later open steps are real
  // work but not the next move, so they read as `todo` rather than competing
  // for the same accent.
  let claimed = false;
  const chain: ChainStep[] = steps.map((s) => {
    if (s.state !== "active") return s;
    if (claimed) return { ...s, state: "todo" as const };
    claimed = true;
    return s;
  });

  const profile: ProfilePanel = approvedProfile
    ? {
        kind: "approved",
        mission: normalizeSuccessProfile(approvedProfile.content_json).role_mission,
        weights,
        approvedAt: approvedProfile.approved_at,
        approverName,
        version: approvedProfile.version,
        supersedes:
          profiles.find((p) => p.version < approvedProfile.version)?.version ?? null,
        promptVersion: approvedProfile.prompt_version,
      }
    : {
        kind: "pending",
        chip: latestProfile?.is_generating
          ? "Generating"
          : latestProfile
            ? "Draft"
            : "Not generated",
        body: latestProfile?.is_generating
          ? "The Role Architect is drafting from this intake and the company research. This page updates when it lands."
          : latestProfile?.generation_error
            ? "The last generation failed. Open the profile to retry — nothing was written."
            : latestProfile
              ? `Version ${latestProfile.version} is drafted and awaits your review. Nothing downstream unlocks until it is approved: the weights it writes are what every candidate is measured against.`
              : "Not yet drafted. The Role Architect writes the first version from this intake and the company research; you review, edit, and approve it.",
        error: latestProfile?.generation_error ?? null,
      };

  const candidates: CandidateRow[] = linked.flatMap((row) => {
    const c = row.candidates;
    if (!c) return [];
    const planState = plans.get(row.candidate_id) ?? "none";
    const assessmentState = assessments.get(row.candidate_id) ?? "none";

    // The note names the next real step, and the link goes to it.
    const note =
      assessmentState === "approved"
        ? "Assessment approved · report compiles"
        : assessmentState === "draft"
          ? "Assessment in draft"
          : planState === "approved"
            ? "Interview plan approved · assessment not started"
            : planState === "draft"
              ? "Interview plan in draft · not yet approved"
              : "Interview plan not started";

    const href =
      assessmentState === "approved"
        ? `${base}/candidates/${c.id}/report`
        : planState === "none"
          ? `${base}/candidates/${c.id}/interview-plan`
          : `${base}/candidates/${c.id}/assessment`;

    return [
      {
        id: c.id,
        name: c.full_name,
        subtitle:
          [c.current_title, c.current_company].filter(Boolean).join(" · ") ||
          "No current role on record",
        initials: initials(c.full_name),
        stageLabel: EXEC_CANDIDATE_STAGE_LABELS[row.stage],
        note,
        href,
        muted: row.stage === "on_hold" || row.stage === "declined",
      },
    ];
  });

  const intake = [
    { k: "Business situation", v: search.business_situation },
    { k: "Reason for hire", v: search.reason_for_hire },
    { k: "Outcomes in the first year", v: search.expected_first_year_outcomes },
    { k: "Outcomes in 90 days", v: search.expected_90_day_outcomes },
    { k: "Non-negotiables", v: search.non_negotiables },
    { k: "Reporting line", v: search.reporting_line },
    { k: "Board exposure", v: search.board_exposure },
    { k: "Team size", v: search.team_size },
    { k: "Budget / P&L", v: search.budget_scope },
    { k: "Regulatory environment", v: search.regulatory_environment },
  ].flatMap((r) => (r.v ? [{ k: r.k, v: r.v }] : []));

  const facts = [
    search.industry,
    search.employee_count ? `${search.employee_count} staff` : null,
    search.revenue_range,
    linked.length > 0
      ? `${linked.length} candidate${linked.length === 1 ? "" : "s"} linked`
      : null,
  ].filter((f): f is string => Boolean(f));

  const vm: WorkspaceVm = {
    searchId: search.id,
    roleTitle: search.role_title,
    companyName: search.company_name,
    statusLabel: SEARCH_STATUS_LABELS[search.status],
    tierLabel: SERVICE_TIER_LABELS[search.service_tier],
    facts,
    chain,
    profile,
    profileHref: `${base}/success-profile`,
    profileLinkLabel: latestProfile ? "Open profile" : "Generate profile",
    candidates,
    candidatesHref: `${base}/candidates`,
    contextStatus,
    contextError: search.company_context_error,
    context,
    intake,
    audit: audit.map((e) => ({
      id: e.id,
      date: formatDateUtc(e.created_at),
      eventType: e.event_type,
    })),
  };

  return <ExecutiveSearchWorkspace vm={vm} />;
}
