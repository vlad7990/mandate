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

/**
 * Generate the Executive Success Profile for a search and persist it onto an
 * existing placeholder row in role_success_profiles (the caller inserts the
 * placeholder via allocate_and_insert_success_profile and passes its id).
 *
 * Terminal-state discipline mirrors generate-job-spec.ts: every failure path
 * clears is_generating and writes generation_error so the polling UI always
 * lands on either the editor or the retry view.
 */
export async function generateAndStoreSuccessProfile(
  profileRowId: string,
  searchId: string,
  actorId: string | null
): Promise<void> {
  const supabase = await createReadOnlySupabaseClient();

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

  let content: SuccessProfileContent;
  try {
    const anthropic = getAnthropic();
    const response = await anthropic.messages.create({
      model: ROLE_ARCHITECT_MODEL,
      max_tokens: 8000,
      system: ROLE_ARCHITECT_SYSTEM_PROMPT,
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
    await recordExecutiveAuditEvent(supabase, {
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

    await recordExecutiveAuditEvent(supabase, {
      organizationId: search.organization_id,
      searchId,
      profileId: profileRowId,
      actorId,
      eventType: "profile_generated",
      detail: {
        model_version: ROLE_ARCHITECT_MODEL,
        competency_count:
          filteredContent.recommended_competency_weights.length,
      },
    });
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
