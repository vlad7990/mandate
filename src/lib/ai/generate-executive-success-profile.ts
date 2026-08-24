import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getAnthropic } from "@/lib/anthropic";
import { agentErrorMessage, safeFailureMessage } from "./agent-errors";
import {
  ROLE_ARCHITECT_SYSTEM_PROMPT,
  SUCCESS_PROFILE_SCHEMA,
  normalizeSuccessProfile,
  type SuccessProfileContent,
} from "./executive-role-architect-agent";
import { recordExecutiveAuditEvent } from "@/lib/executive/audit";
import { signInExecutiveIntelAgent } from "@/lib/agents/session";
import { applySkillsToPrompt } from "@/lib/skills/skill-injector";
import type {
  ExecutiveCompetencyRow,
  ExecutiveSearchRow,
} from "@/lib/executive/types";

/**
 * How this generator names itself in a failure a person reads. Whatever
 * lands in the error column is rendered verbatim with a Retry CTA, so it
 * outlives the request — see `agent-errors.ts`.
 */
const SUBJECT = "Success-profile generation";

export const ROLE_ARCHITECT_MODEL = "claude-sonnet-4-6";

/** Read-only SSR client for after() callbacks — see generate-job-spec.ts. */
async function createReadOnlySupabaseClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {
          /* read-only */
        },
      },
    }
  );
}

/** How the run was asked for — the trail names it (095: D4). */
export type ExecutiveTrigger = "initial" | "regenerate";

/**
 * The refusal sentence (095: D5) — lands in generation_error via the
 * HUMAN half and is rendered verbatim with the Retry CTA.
 */
const EXECINTEL_UNAVAILABLE_SENTENCE =
  "The Executive Intelligence Agent could not run — an operator has suspended it or its credentials are absent. Retry when it is restored.";

/**
 * Generate the Executive Success Profile for a search and persist it onto an
 * existing placeholder row in role_success_profiles (the caller inserts the
 * placeholder via allocate_and_insert_success_profile and passes its id).
 *
 * The seam (095): the EXECUTIVE INTELLIGENCE AGENT's session, signed in
 * per run — the nineteenth principal's second judgment. The split stands
 * as built: the human allocated the versioned draft placeholder; the
 * agent reads the search and the competency library it lawfully sees,
 * judges with skills riding ITS session, and lands content on the draft
 * through 095's status-pinned UPDATE (it can neither touch an approved
 * profile nor approve one). The generated audit event wears the AGENT's
 * id — 095's actor pin would refuse anything else. FAILURE BOOKKEEPING
 * STAYS HUMAN (the 090 doctrine): markGenerationFailed and the failed
 * audit event keep the recruiter's cookie session.
 *
 * Terminal-state discipline mirrors generate-job-spec.ts: every failure path
 * clears is_generating and writes generation_error so the polling UI always
 * lands on either the editor or the retry view.
 */
export async function generateAndStoreSuccessProfile(
  profileRowId: string,
  searchId: string,
  actorId: string | null,
  trigger: ExecutiveTrigger = "regenerate"
): Promise<void> {
  const session = await signInExecutiveIntelAgent();
  if (!session.ok) {
    console.error(
      `[generate-success-profile] The Executive Intelligence Agent could ` +
        `not run — an operator has suspended it or its credentials are ` +
        `absent. The placeholder is marked. (${session.reason})`
    );
    // The marker is the HUMAN's bookkeeping — the agent has no session
    // to sign with, which is the tell (090: D2).
    await markGenerationFailed(profileRowId, EXECINTEL_UNAVAILABLE_SENTENCE);
    return;
  }

  try {
    await generateUnderAgentSession(
      session.client,
      session.userId,
      profileRowId,
      searchId,
      actorId,
      trigger
    );
  } finally {
    // Persist nothing (D3): revoke the run's session from GoTrue's ledger.
    await session.signOut();
  }
}

async function generateUnderAgentSession(
  supabase: Awaited<ReturnType<typeof createReadOnlySupabaseClient>>,
  agentId: string,
  profileRowId: string,
  searchId: string,
  actorId: string | null,
  trigger: ExecutiveTrigger
): Promise<void> {
  const { data: search, error: fetchError } = await supabase
    .from("executive_searches")
    .select("*")
    .eq("id", searchId)
    .single<ExecutiveSearchRow>();

  if (fetchError || !search) {
    const message = `Failed to load executive search ${searchId} for profile generation: ${fetchError?.message ?? "not found"}`;
    await markGenerationFailed(profileRowId, agentErrorMessage(fetchError, SUBJECT));
    throw new Error(message);
  }

  // Global + org competency library. The agent may only weight keys from
  // this list; the schema instructs, this data grounds.
  const { data: competencies, error: compError } = await supabase
    .from("executive_competencies")
    .select("id, organization_id, key, name, category, definition, positive_indicators, negative_indicators")
    .order("category")
    .order("name");

  if (compError) {
    const message = `Failed to load competency library: ${compError.message}`;
    await markGenerationFailed(profileRowId, agentErrorMessage(compError, SUBJECT));
    throw new Error(message);
  }

  const library = ((competencies ?? []) as ExecutiveCompetencyRow[]).map(
    (c) => ({
      key: c.key,
      name: c.name,
      category: c.category,
      definition: c.definition,
    })
  );

  const userPrompt = JSON.stringify(
    {
      intake: {
        company_name: search.company_name,
        industry: search.industry,
        business_model: search.business_model,
        revenue_range: search.revenue_range,
        employee_count: search.employee_count,
        funding_stage: search.funding_stage,
        ownership_structure: search.ownership_structure,
        geographic_footprint: search.geographic_footprint,
        regulatory_environment: search.regulatory_environment,
        role_title: search.role_title,
        role_family: search.role_family,
        is_new_role: search.is_new_role,
        reason_for_hire: search.reason_for_hire,
        reporting_line: search.reporting_line,
        board_exposure: search.board_exposure,
        team_size: search.team_size,
        budget_scope: search.budget_scope,
        business_situation: search.business_situation,
        expected_90_day_outcomes: search.expected_90_day_outcomes,
        expected_first_year_outcomes: search.expected_first_year_outcomes,
        non_negotiables: search.non_negotiables,
        preferred_leadership_style: search.preferred_leadership_style,
        service_tier: search.service_tier,
      },
      company_operating_context:
        search.company_context_status === "ready"
          ? search.company_context
          : null,
      competency_library: library,
    },
    null,
    2
  );

  // Skills ride the AGENT's session (095: D6 — the §50 doctrine). No
  // project scope exists for an executive search; org-wide skills apply.
  const system = await applySkillsToPrompt(ROLE_ARCHITECT_SYSTEM_PROMPT, {
    projectId: null,
    organizationId: search.organization_id,
    client: supabase,
  });

  let content: SuccessProfileContent;
  try {
    const anthropic = getAnthropic();
    const response = await anthropic.messages.create({
      model: ROLE_ARCHITECT_MODEL,
      max_tokens: 8000,
      system,
      messages: [{ role: "user", content: userPrompt }],
      output_config: {
        format: {
          type: "json_schema",
          schema: SUCCESS_PROFILE_SCHEMA,
        },
      },
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("Role-architect response contained no text block");
    }

    // Normalize even schema-validated output: drops any competency entries
    // with malformed shapes and clamps weights to 0–100.
    content = normalizeSuccessProfile(JSON.parse(textBlock.text));
  } catch (err) {
    // Two audiences, two strings. The audit trail keeps the real message —
    // it is ours to read and the whole point of recording a failure — while
    // the column a recruiter sees gets the mapped one.
    const message = err instanceof Error ? err.message : "AI call failed.";
    await markGenerationFailed(profileRowId, agentErrorMessage(err, SUBJECT));
    // The FAILED event is the human half's bookkeeping (090 doctrine) —
    // and 095's actor pin would refuse the agent signing anyone else's
    // name, so this insert rides the cookie session with the clicker's id.
    await recordExecutiveAuditEvent(await createReadOnlySupabaseClient(), {
      organizationId: search.organization_id,
      searchId,
      profileId: profileRowId,
      actorId,
      eventType: "profile_generation_failed",
      detail: { error: message },
    });
    throw err;
  }

  // Drop hallucinated competency keys defensively — only library keys pass.
  const knownKeys = new Set(library.map((c) => c.key));
  const filteredContent: SuccessProfileContent = {
    ...content,
    recommended_competency_weights:
      content.recommended_competency_weights.filter((w) =>
        knownKeys.has(w.competency_key)
      ),
  };

  let cleared = false;
  try {
    const { error: updateError } = await supabase
      .from("role_success_profiles")
      .update({
        content_json: filteredContent,
        is_generating: false,
        generation_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", profileRowId);

    if (updateError) {
      throw new Error(
        `Failed to persist generated success profile: ${updateError.message}`
      );
    }
    cleared = true;

    // The generated event wears the AGENT's id — the judgment signs its
    // own name in the executive ledger (095's actor pin enforces it).
    await recordExecutiveAuditEvent(supabase, {
      organizationId: search.organization_id,
      searchId,
      profileId: profileRowId,
      actorId: agentId,
      eventType: "profile_generated",
      detail: {
        model_version: ROLE_ARCHITECT_MODEL,
        competency_count:
          filteredContent.recommended_competency_weights.length,
      },
    });

    // The main trail (095: D4): trigger, version, a competency count —
    // never the profile's text. Best-effort after the landing.
    const { data: profRow } = await supabase
      .from("role_success_profiles")
      .select("version")
      .eq("id", profileRowId)
      .maybeSingle<{ version: number }>();
    const { error: eventErr } = await supabase.rpc("record_agent_event", {
      p_event_type: "success_profile_generated",
      p_detail: {
        agent_kind: "execintel",
        trigger,
        version: profRow?.version ?? null,
        competencies: filteredContent.recommended_competency_weights.length,
      },
    });
    if (eventErr) {
      console.error(
        "[generate-success-profile] failed to record the trail event",
        eventErr
      );
    }
  } catch (err) {
    await markGenerationFailed(profileRowId, agentErrorMessage(err, SUBJECT));
    cleared = true;
    throw err;
  } finally {
    if (!cleared) {
      await markGenerationFailed(
        profileRowId,
        "Generation failed during persistence (unrecoverable)."
      );
    }
  }
}

/** Terminal failed state — clears is_generating, never re-throws. */
async function markGenerationFailed(
  profileRowId: string,
  errorMessage: string
): Promise<void> {
  try {
    const supabase = await createReadOnlySupabaseClient();
    await supabase
      .from("role_success_profiles")
      .update({
        is_generating: false,
        generation_error: safeFailureMessage(errorMessage, SUBJECT),
        updated_at: new Date().toISOString(),
      })
      .eq("id", profileRowId);
  } catch (err) {
    console.error(
      "[generate-success-profile] failed to mark generation as failed",
      err
    );
  }
}
