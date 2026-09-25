"use server";

import { createServerSupabaseClient } from "@/lib/supabase-server";
import { requireActionContext } from "@/lib/auth/access";
import { parseRole } from "@/lib/auth/roles";
import { runAction } from "@/lib/actions/run";
import { type ActionResult } from "@/lib/actions/result";
import { runCandidateSearchAsAgent } from "@/lib/ai/run-candidate-search";
import { agentErrorMessage } from "@/lib/ai/agent-errors";
import { identityKey } from "@/lib/candidate-identity";
import { describeTrawl, trawlScopeFor, type DeskMember } from "@/lib/desk/trawl";
import { buildPoolQuery } from "@/lib/calibration/pool-query";
import { type CalibrationModel } from "@/lib/ai/role-analysis";

const SUBJECT = "The pool suggestion";

export type PoolSuggestion = {
  candidateId: string;
  fullName: string;
  currentTitle: string | null;
  currentCompany: string | null;
  /** Which mandate this row currently sits in, if any. */
  fromMandate: string | null;
  matchScore: number;
  reasoning: string;
};

export type PoolSuggestionsResult =
  | {
      status: "ready";
      suggestions: PoolSuggestion[];
      /** What the agent was allowed to look at, in words. */
      trawl: string;
      /** The restatement of the role the agent searched against. */
      intent: string;
    }
  | { status: "empty_pool"; trawl: string }
  | { status: "no_calibration" };

/**
 * "Suggest from our pool" (§200 slice 3).
 *
 * The founder's third ask: an agent that reads the CVs already in the
 * database and proposes the ones aligned to this search, so a person can
 * be reused across mandates instead of re-sourced.
 *
 * It mints NO new agent. The Candidate Search Agent has ranked the pool
 * against a recruiter's typed query since 096; this asks it the same
 * question with the MANDATE's calibration as the query. Same principal,
 * same schema, same trail event — only the prompt's origin differs, which
 * the event records as `trigger: "mandate"`.
 *
 * It WRITES NOTHING. The agent's grants are read-only by construction
 * (096), and adding anyone is the human's own act through
 * `addPersonToProjectAction`, under their own session. §196's doctrine:
 * the agent authors the proposal, a person approves it.
 */
export async function suggestFromPoolAction(
  projectId: string
): Promise<ActionResult<PoolSuggestionsResult>> {
  return runAction<PoolSuggestionsResult>(SUBJECT, async () => {
    const actor = await requireActionContext("candidates:write");
    const supabase = await createServerSupabaseClient();

    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id, organization_id, calibration_model")
      .eq("id", projectId)
      .single<{
        id: string;
        organization_id: string | null;
        calibration_model: Partial<CalibrationModel> | null;
      }>();

    if (projectError || !project) {
      throw new Error("That mandate is not visible from your organisation.");
    }
    if (project.organization_id !== actor.organizationId) {
      throw new Error("That mandate belongs to a different organisation.");
    }

    // Without a scoring model there is no role to match against, and a
    // query built from an empty calibration would return whoever the
    // model happened to like. Refuse rather than guess (§175's class).
    const query = buildPoolQuery(project.calibration_model);
    if (!query) return { status: "no_calibration" };

    // The trawl (140). Read under the caller's own session: these are the
    // org's members, which every active member may already read.
    const { data: memberData } = await supabase
      .from("users")
      .select("id, manager_id, status, role")
      .eq("organization_id", actor.organizationId ?? "");

    const members = ((memberData ?? []) as Array<{
      id: string;
      manager_id: string | null;
      status: string;
    }>).map<DeskMember>((m) => ({
      id: m.id,
      managerId: m.manager_id,
      status: m.status,
    }));

    // The caller's own role comes from the same read as the desk, so the
    // scope and the roster can never disagree about who reports to whom.
    const me = ((memberData ?? []) as Array<{ id: string; role: string | null }>)
      .find((m) => m.id === actor.userId);
    const scope = trawlScopeFor(parseRole(me?.role ?? null), actor.userId, members);

    // People already on this mandate are not suggestions. Computed from
    // the same identity rule the copy uses, so the list and the add can
    // never disagree about who is already here.
    const { data: already } = await supabase
      .from("candidates")
      .select("full_name, email, linkedin_url, current_company")
      .eq("project_id", projectId);

    const excludeIdentityKeys = (
      (already ?? []) as Array<{
        full_name: string;
        email: string | null;
        linkedin_url: string | null;
        current_company: string | null;
      }>
    ).map(identityKey);

    const run = await runCandidateSearchAsAgent(
      query,
      {
        projectId: null,
        archetype: null,
        stage: null,
        tier: null,
        ownerIds: scope.kind === "org" ? null : scope.ownerIds,
        excludeIdentityKeys,
      },
      "mandate",
      projectId
    );

    if (run.status === "agent_unavailable") {
      throw new Error(
        "The Candidate Search Agent could not run — an operator has " +
          "suspended it or its credentials are absent. Nothing was searched."
      );
    }
    if (run.status === "failed") {
      throw new Error(agentErrorMessage(run.error, SUBJECT));
    }
    if (run.status === "empty_pool") {
      return { status: "empty_pool", trawl: describeTrawl(scope, 0) };
    }

    // Join the agent's ids back to rows the CALLER can read. A match the
    // caller cannot read is dropped rather than rendered as a mystery.
    const ids = run.result.matches.map((m) => m.candidate_id);
    const { data: rows } = await supabase
      .from("candidates")
      .select("id, full_name, current_title, current_company, project_id")
      .in("id", ids.length > 0 ? ids : ["00000000-0000-0000-0000-000000000000"]);

    const byId = new Map(
      ((rows ?? []) as Array<{
        id: string;
        full_name: string;
        current_title: string | null;
        current_company: string | null;
        project_id: string | null;
      }>).map((r) => [r.id, r])
    );

    const { data: projectRows } = await supabase
      .from("projects")
      .select("id, title")
      .eq("organization_id", actor.organizationId ?? "");
    const titleById = new Map(
      ((projectRows ?? []) as Array<{ id: string; title: string }>).map((p) => [
        p.id,
        p.title,
      ])
    );

    const suggestions: PoolSuggestion[] = run.result.matches
      .map((m) => {
        const row = byId.get(m.candidate_id);
        if (!row) return null;
        return {
          candidateId: row.id,
          fullName: row.full_name,
          currentTitle: row.current_title,
          currentCompany: row.current_company,
          fromMandate: row.project_id
            ? titleById.get(row.project_id) ?? null
            : null,
          matchScore: m.match_score,
          reasoning: m.reasoning,
        };
      })
      .filter((s): s is PoolSuggestion => s !== null);

    return {
      status: "ready",
      suggestions,
      trawl: describeTrawl(scope, run.poolSize),
      intent: run.result.parsed_criteria.intent,
    };
  });
}
