import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAnthropic } from "@/lib/anthropic";
import {
  COMPANY_CULTURE_SCHEMA,
  COMPANY_CULTURE_SYSTEM_PROMPT,
  type CultureProfile,
} from "./company-culture-agent";
import { applySkillsToPrompt } from "@/lib/skills/skill-injector";
import { wrapWithRecruiterContext } from "./recruiter-context";
import { signInCultureAgent } from "@/lib/agents/session";

const COMPANY_CULTURE_MODEL = "claude-sonnet-4-6";

export type CompanyCultureInput = {
  company: unknown;
  onboarding: unknown;
  feedback_summaries: Array<{
    feedback_type: string;
    summary: string | null;
    content: string;
    created_at: string;
  }>;
};

export type RunCompanyCultureContext = {
  projectId: string;
  organizationId: string | null;
  recruiterContext?: string;
  /** Read recruiter-authored skills under this client — the agent's
   * own session when the seam runs; defaults to the request session. */
  skillClient?: SupabaseClient;
};

export async function runCompanyCulture(
  input: CompanyCultureInput,
  ctx: RunCompanyCultureContext
): Promise<CultureProfile> {
  const anthropic = getAnthropic();
  const userPrompt = JSON.stringify(input, null, 2);
  const baseSystem = await applySkillsToPrompt(COMPANY_CULTURE_SYSTEM_PROMPT, {
    projectId: ctx.projectId,
    organizationId: ctx.organizationId,
    client: ctx.skillClient,
  });
  const system = wrapWithRecruiterContext(baseSystem, ctx.recruiterContext);

  const response = await anthropic.messages.create({
    model: COMPANY_CULTURE_MODEL,
    max_tokens: 2000,
    system,
    messages: [{ role: "user", content: userPrompt }],
    output_config: {
      format: {
        type: "json_schema",
        schema: COMPANY_CULTURE_SCHEMA,
      },
    },
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Company-culture response contained no text block");
  }

  const partial = JSON.parse(textBlock.text) as Omit<
    CultureProfile,
    "generated_at"
  >;
  return {
    ...partial,
    generated_at: new Date().toISOString(),
  };
}

// ────────────────────────────────────────────────────────────────────────
// The seam (084): the CULTURE AGENT's session, signed in per run. The
// interpreter's shape: the projects row and the feedback tail are
// lawfully the agent's own reads (074 — the feedback grant is the
// interpreter's, reused), so the recruiter's action keeps only the
// gate and hands an id plus the one request-only human input — the
// recruiter's optional context string. The agent reads, derives,
// merges culture_profile under its own name, carries the context
// VERBATIM onto culture_context (or DELETES the key when none was
// given — stale context must not appear to have shaped a fresh read),
// records the event with a boolean and counts, and signs out
// persisting nothing.
// ────────────────────────────────────────────────────────────────────────

export type CompanyCultureRunResult =
  | { status: "ready"; profile: CultureProfile }
  /** Not eligible: project missing or outside the agent's org-bound
   * reach. */
  | { status: "unavailable" }
  /** The Culture Agent refused to sign in — suspended from /ops or
   * credentials absent. Nothing was generated and NOTHING WAS
   * DESTROYED (D5): the existing profile, context, and every sibling
   * key stand untouched. */
  | { status: "agent_unavailable"; reason: string }
  /** Generation or persistence failed; logged. */
  | { status: "failed" };

export async function runCompanyCultureAndPersist(
  projectId: string,
  recruiterContext?: string
): Promise<CompanyCultureRunResult> {
  const session = await signInCultureAgent();
  if (!session.ok) {
    console.error(
      `[company-culture] derivation skipped: ${session.reason}. ` +
        "The existing profile stands; the panel keeps rendering it."
    );
    return { status: "agent_unavailable", reason: session.reason };
  }

  try {
    return await runUnderAgentSession(session.client, projectId, recruiterContext);
  } finally {
    // Persist nothing (D3): revoke the run's session from GoTrue's ledger.
    await session.signOut();
  }
}

async function runUnderAgentSession(
  supabase: SupabaseClient,
  projectId: string,
  recruiterContext?: string
): Promise<CompanyCultureRunResult> {
  const { data: project, error } = await supabase
    .from("projects")
    .select("id, company_context, onboarding_responses, organization_id")
    .eq("id", projectId)
    .single<{
      id: string;
      company_context: Record<string, unknown> | null;
      onboarding_responses: unknown;
      organization_id: string | null;
    }>();
  if (error || !project) return { status: "unavailable" };

  const { data: feedback } = await supabase
    .from("feedback")
    .select("feedback_type, content, interpreted, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(20);

  type FbRow = {
    feedback_type: string;
    content: string;
    interpreted: { summary?: string } | null;
    created_at: string;
  };
  const feedback_summaries = ((feedback ?? []) as FbRow[]).map((f) => ({
    feedback_type: f.feedback_type,
    summary: f.interpreted?.summary ?? null,
    content: f.content,
    created_at: f.created_at,
  }));

  const company = (project.company_context ?? {}) as Record<string, unknown>;
  const replacedExisting = "culture_profile" in company;

  let profile: CultureProfile;
  try {
    profile = await runCompanyCulture(
      {
        company,
        onboarding: project.onboarding_responses ?? {},
        feedback_summaries,
      },
      {
        projectId,
        organizationId: project.organization_id,
        recruiterContext,
        skillClient: supabase,
      }
    );
  } catch (err) {
    console.error("[company-culture] agent derivation failed", err);
    return { status: "failed" };
  }

  // The merge-write: culture_profile lands; culture_context carries
  // the recruiter's words verbatim or is DELETED when none were given
  // (the delete-when-empty honesty — pinned by the 084 invariants);
  // every sibling key (intelligence_report, hm_intelligence,
  // culture_notes, culture_flags) untouched.
  const trimmedContext = recruiterContext?.trim() ?? "";
  const nextCompany: Record<string, unknown> = {
    ...company,
    culture_profile: profile,
  };
  if (trimmedContext.length > 0) {
    nextCompany.culture_context = trimmedContext;
  } else {
    delete nextCompany.culture_context;
  }

  const { error: updateErr } = await supabase
    .from("projects")
    .update({
      company_context: nextCompany,
      updated_at: new Date().toISOString(),
    })
    .eq("id", projectId);
  if (updateErr) {
    console.error("[company-culture] failed to persist the profile", updateErr);
    return { status: "failed" };
  }

  // The trail (D4): a boolean and counts — the context TEXT lives
  // visibly on culture_context, never in the trail.
  const { error: eventErr } = await supabase.rpc("record_agent_event", {
    p_event_type: "culture_profiled",
    p_project_id: projectId,
    p_detail: {
      agent_kind: "culture",
      trigger: replacedExisting ? "regenerate" : "analyse",
      replaced_existing: replacedExisting,
      has_recruiter_context: trimmedContext.length > 0,
      feedback_count: feedback_summaries.length,
    },
  });
  if (eventErr) {
    console.error("[company-culture] failed to record the event", eventErr);
  }

  return { status: "ready", profile };
}
