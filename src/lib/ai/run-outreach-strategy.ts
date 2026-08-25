import "server-only";
import { getAnthropic } from "@/lib/anthropic";
import {
  OUTREACH_STRATEGY_SCHEMA,
  OUTREACH_STRATEGY_SYSTEM_PROMPT,
  type OutreachStrategyContent,
} from "./outreach-strategy";
import type { CalibrationModel, CompanyContext } from "./role-analysis";
import { signInOutreachStrategyAgent } from "@/lib/agents/session";
import { applySkillsToPrompt } from "@/lib/skills/skill-injector";
import {
  applyCommsPolicy,
  DEFAULT_COMMS_POLICY,
  type CommsPolicy,
} from "@/lib/outreach/strategy-policy";
import { captureSeamError } from "@/lib/observability/sentry";

const STRATEGY_MODEL = "claude-sonnet-4-6";

export type OutreachStrategyInput = {
  role_context: {
    title: string;
    role_title: string | null;
    inferred_scope: string | null;
  };
  company_context: Partial<CompanyContext>;
  calibration: Partial<CalibrationModel>;
  candidate: {
    full_name: string;
    current_title: string | null;
    current_company: string | null;
    evidence: Record<string, unknown>;
  };
  /** Prior contact, oldest first — subjects and directions, so a
   * follow-up reads differently from a first touch. */
  contact_history: Array<{
    direction: string;
    channel: string;
    subject: string | null;
    occurred_at: string;
  }>;
  policy: CommsPolicy;
};

export async function generateOutreachStrategy(
  input: OutreachStrategyInput,
  options?: { system?: string }
): Promise<OutreachStrategyContent> {
  const anthropic = getAnthropic();
  const userPrompt = JSON.stringify(input, null, 2);

  const response = await anthropic.messages.create({
    model: STRATEGY_MODEL,
    max_tokens: 2500,
    system: options?.system ?? OUTREACH_STRATEGY_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
    output_config: {
      format: {
        type: "json_schema",
        schema: OUTREACH_STRATEGY_SCHEMA,
      },
    },
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Outreach-strategy response contained no text block");
  }

  return JSON.parse(textBlock.text) as OutreachStrategyContent;
}

// ────────────────────────────────────────────────────────────────────────
// The seam (097): the OUTREACH STRATEGY AGENT's session, signed in per
// drafting act — the TWENTY-FIRST principal, the Engage arc's first.
// The split (D2): the human door is the recruiter's explicit "Draft
// strategy" act on the candidate page (their cookie session proves
// they may act on this candidate BEFORE any agent exists); the
// judgment runs here. The agent re-reads the mandate, the candidate's
// evidence, the contact history (097's read grant), and the org's
// comms policy under ITS OWN session — never cookie-fetched rows
// handed sideways — judges with skills riding its session (D6),
// clamps the result deterministically against org_comms_policy
// (strategy-policy.ts, layer one of the 099 two-layer check), INSERTs
// the draft under its own name through 097's pinned door, records the
// trail event with COUNTS (never a name, never the draft's text), and
// signs out in a finally. Approving, editing, declining, superseding
// and sending stay the recruiter's acts — the pin refuses the agent
// BOTH ways.
// ────────────────────────────────────────────────────────────────────────

export type OutreachStrategyRunResult =
  | { status: "drafted" }
  /** Candidate/project missing or outside the agent's org-bound reach. */
  | { status: "unavailable" }
  /** A live draft already exists for this candidate-lane — supersede
   * or decide it first (the partial unique index would refuse anyway;
   * this refusal is the same boundary, honest and free). */
  | { status: "draft_exists" }
  /** The person is marked do-not-contact (098): no strategy is
   * drafted, no model call is spent. Only a founder-level act with a
   * recorded reason clears the suppression. */
  | { status: "dnc" }
  /** The agent refused to sign in — suspended from /ops or credentials
   * absent. Nothing was drafted and NOTHING WAS DESTROYED (D5). */
  | { status: "agent_unavailable"; reason: string }
  /** Generation or persistence failed; logged. */
  | { status: "failed" };

export async function runOutreachStrategyAndPersist(
  projectId: string,
  candidateId: string
): Promise<OutreachStrategyRunResult> {
  const session = await signInOutreachStrategyAgent();
  if (!session.ok) {
    console.error(
      `[outreach-strategy] The Outreach Strategy Agent could not run — an ` +
        `operator has suspended it or its credentials are absent. Nothing ` +
        `was drafted; the contact log and history are untouched. ` +
        `(${session.reason})`
    );
    return { status: "agent_unavailable", reason: session.reason };
  }

  try {
    const supabase = session.client;

    const [
      { data: project },
      { data: candidate },
      { data: outreach },
      { data: policyRow },
      { data: priorStrategies },
    ] = await Promise.all([
      supabase
        .from("projects")
        .select("id, title, company_name, calibration_model, company_context")
        .eq("id", projectId)
        .maybeSingle<{
          id: string;
          title: string;
          company_name: string;
          calibration_model: Partial<CalibrationModel> | null;
          company_context: Partial<CompanyContext> | null;
        }>(),
      supabase
        .from("candidates")
        .select(
          "id, full_name, current_title, current_company, cv_structured, network_profile_id"
        )
        .eq("id", candidateId)
        .maybeSingle<{
          id: string;
          full_name: string;
          current_title: string | null;
          current_company: string | null;
          cv_structured: Record<string, unknown> | null;
          network_profile_id: string | null;
        }>(),
      supabase
        .from("candidate_outreach")
        .select("direction, channel, subject, occurred_at")
        .eq("candidate_id", candidateId)
        .order("occurred_at", { ascending: true }),
      supabase
        .from("org_comms_policy")
        .select(
          "allowed_channels, client_identity_disclosure, compensation_discussion"
        )
        .eq("organization_id", session.organizationId)
        .maybeSingle<CommsPolicy>(),
      supabase
        .from("outreach_strategies")
        .select("id, status, version")
        .eq("candidate_id", candidateId)
        .eq("project_id", projectId)
        .order("version", { ascending: false }),
    ]);

    if (!project || !candidate) return { status: "unavailable" };

    // The relationship record speaks first (098): a suppressed person
    // gets no strategy and costs no model call. The comms service will
    // re-check at send time in 099 — this is the drafting-side layer.
    if (candidate.network_profile_id) {
      const { data: person } = await supabase
        .from("network_profiles")
        .select("dnc")
        .eq("id", candidate.network_profile_id)
        .maybeSingle<{ dnc: boolean }>();
      if (person?.dnc) return { status: "dnc" };
    }

    // ONE live draft per candidate-lane, refused before the spend.
    if ((priorStrategies ?? []).some((s) => s.status === "draft")) {
      return { status: "draft_exists" };
    }
    const nextVersion = (priorStrategies?.[0]?.version ?? 0) + 1;

    // An absent policy row reads as the defaults — deterministic
    // fallback, no silent write (D3).
    const policy: CommsPolicy = policyRow ?? DEFAULT_COMMS_POLICY;

    const evidence = candidate.cv_structured ?? {};

    // The judgment carries the org's skills (D6), read under the
    // agent's own session.
    const system = await applySkillsToPrompt(OUTREACH_STRATEGY_SYSTEM_PROMPT, {
      projectId,
      organizationId: session.organizationId,
      client: supabase,
    });

    let drafted: OutreachStrategyContent;
    try {
      drafted = await generateOutreachStrategy(
        {
          role_context: {
            title: project.title,
            role_title: project.calibration_model?.role_title ?? null,
            inferred_scope: project.calibration_model?.inferred_scope ?? null,
          },
          company_context: project.company_context ?? {},
          calibration: project.calibration_model ?? {},
          candidate: {
            full_name: candidate.full_name,
            current_title: candidate.current_title,
            current_company: candidate.current_company,
            evidence,
          },
          contact_history: (outreach ?? []).map((o) => ({
            direction: o.direction as string,
            channel: o.channel as string,
            subject: o.subject as string | null,
            occurred_at: o.occurred_at as string,
          })),
          policy,
        },
        { system }
      );
    } catch (err) {
      captureSeamError("[outreach-strategy] agent generation failed", err);
      return { status: "failed" };
    }

    // The disclosure clamp — deterministic, before persistence. The
    // client's identity for the clamp is the mandate's company name.
    const { content, clamped } = applyCommsPolicy(
      drafted,
      policy,
      project.company_name
    );

    const { error: insertError } = await supabase
      .from("outreach_strategies")
      .insert({
        organization_id: session.organizationId,
        project_id: projectId,
        candidate_id: candidateId,
        content,
        status: "draft",
        version: nextVersion,
        created_by: session.userId,
      });
    if (insertError) {
      // A concurrent draft raced past the read above and collided on
      // the one-live-draft index — the same boundary, reported honestly.
      if (insertError.code === "23505") return { status: "draft_exists" };
      captureSeamError(
        "[outreach-strategy] failed to persist the draft",
        insertError
      );
      return { status: "failed" };
    }

    // The trail (D4): COUNTS only — never a name, never the draft's
    // text, never a disclosure list. Best-effort after the landing.
    const { error: eventErr } = await supabase.rpc("record_agent_event", {
      p_event_type: "outreach_strategy_drafted",
      p_project_id: projectId,
      p_candidate_id: candidateId,
      p_detail: {
        agent_kind: "outreach_strategy",
        version: nextVersion,
        channel: content.channel,
        talking_points: content.talking_points.length,
        evidence_keys: Object.keys(evidence).length,
        prior_contacts: (outreach ?? []).length,
        policy_clamped: clamped,
      },
    });
    if (eventErr) {
      captureSeamError(
        "[outreach-strategy] failed to record the draft event",
        eventErr
      );
    }

    return { status: "drafted" };
  } finally {
    // Persist nothing (D2): revoke the run's session from GoTrue's ledger.
    await session.signOut();
  }
}
