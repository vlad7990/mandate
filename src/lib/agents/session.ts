import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { captureSeamError } from "@/lib/observability/sentry";

/**
 * Agent sessions — how an AI agent authenticates as a principal.
 *
 * The agents-as-principals programme (D3): each agent is a users row
 * with role 'agent' and a GoTrue account whose long random password is
 * held as one env secret per agent. The pipeline signs in at run start
 * (password grant, throwaway client — the changePasswordAction shape),
 * works under the agent's own RLS, and persists nothing: no cookies, no
 * stored session, and the refresh token is revoked by the signOut the
 * caller owes the session when its run ends.
 *
 * ## No fallback, by design
 *
 * When the secret is absent or the sign-in fails, this module refuses
 * LOUDLY and returns a reason — it never hands back the service-role
 * client. The silent fallback IS the bug the programme exists to
 * remove: a master key wearing an agent's name is worse than an honest
 * refusal, because the refusal degrades one interpretation and the
 * master key bypasses every policy in the product. Callers fail soft
 * per D5: the human act that triggered the run must already be
 * persisted before the agent is asked to think about it.
 *
 * ## Suspension is checked here, not just felt
 *
 * A suspended agent's password grant still succeeds at GoTrue (status
 * lives on public.users, not auth.users), but every predicate resolves
 * NULL and the session can read nothing. Running the pipeline in that
 * state would burn an Anthropic call to produce writes that land
 * nowhere, silently. So the session verifies its own row (the 059
 * self-read reaches it regardless of status), and a row that is not an
 * active agent is refused by name — the operator's kill switch answers
 * within one run, not one token TTL.
 */

export type AgentSession =
  | {
      ok: true;
      client: SupabaseClient;
      userId: string;
      organizationId: string;
      /** Revokes the session in GoTrue's ledger. Callers own this — run it in a finally. */
      signOut: () => Promise<void>;
    }
  | { ok: false; reason: string };

/**
 * Sign in the feedback interpreter — slice one's agent. The credential
 * pair is minted by the operator when the agent's users row is created
 * (the recipe is in the handoff) and rotated by founder hand.
 */
export async function signInFeedbackInterpreter(): Promise<AgentSession> {
  return signInAgent({
    kind: "feedback_interpreter",
    email: process.env.AGENT_INTERPRETER_EMAIL,
    password: process.env.AGENT_INTERPRETER_PASSWORD,
  });
}

/**
 * Sign in the ranking agent — slice two. Its own credential and
 * therefore its own /ops kill switch (D1): the operator can suspend
 * ranking without touching feedback interpretation.
 */
export async function signInRankingAgent(): Promise<AgentSession> {
  return signInAgent({
    kind: "ranker",
    email: process.env.AGENT_RANKER_EMAIL,
    password: process.env.AGENT_RANKER_PASSWORD,
  });
}

/**
 * Sign in the CV parsing agent — slice three. Own credential, own
 * kill switch; the seam hands it bytes, never storage.
 */
export async function signInCvParser(): Promise<AgentSession> {
  return signInAgent({
    kind: "cv_parser",
    email: process.env.AGENT_CVPARSER_EMAIL,
    password: process.env.AGENT_CVPARSER_PASSWORD,
  });
}

/**
 * Sign in the evaluation agent — slice four. Own credential, own kill
 * switch; writes exactly one jsonb key, and never before it has
 * something to write (D5).
 */
export async function signInEvaluator(): Promise<AgentSession> {
  return signInAgent({
    kind: "evaluator",
    email: process.env.AGENT_EVALUATOR_EMAIL,
    password: process.env.AGENT_EVALUATOR_PASSWORD,
  });
}

/**
 * Sign in the positioning agent — slice five, the first of the
 * candidate-intelligence cluster. Own credential, own kill switch;
 * writes exactly one jsonb key through the RLS-bound RPC.
 */
export async function signInPositioningAgent(): Promise<AgentSession> {
  return signInAgent({
    kind: "positioner",
    email: process.env.AGENT_POSITIONING_EMAIL,
    password: process.env.AGENT_POSITIONING_PASSWORD,
  });
}

/**
 * Sign in the candidate research agent — slice six. Own credential,
 * own kill switch. Its model call reaches the public web through
 * Anthropic's web_search tool; suspension refuses the run at sign-in,
 * before any search is made.
 */
export async function signInCandidateResearchAgent(): Promise<AgentSession> {
  return signInAgent({
    kind: "researcher",
    email: process.env.AGENT_RESEARCH_EMAIL,
    password: process.env.AGENT_RESEARCH_PASSWORD,
  });
}

/**
 * Sign in the triangulation agent — slice seven. Own credential, own
 * kill switch; pure synthesis over three intelligence reports, no web
 * search, one jsonb key through the RLS-bound RPC.
 */
export async function signInTriangulationAgent(): Promise<AgentSession> {
  return signInAgent({
    kind: "triangulator",
    email: process.env.AGENT_TRIANGULATION_EMAIL,
    password: process.env.AGENT_TRIANGULATION_PASSWORD,
  });
}

/**
 * Sign in the psychology agent — slice eight, closing the
 * candidate-intelligence cluster. Own credential, own kill switch;
 * reads human testimony (notes, recruiter context) and never authors
 * it — its notes grant is SELECT-only by 081.
 */
export async function signInPsychologyAgent(): Promise<AgentSession> {
  return signInAgent({
    kind: "psychology",
    email: process.env.AGENT_PSYCHOLOGY_EMAIL,
    password: process.env.AGENT_PSYCHOLOGY_PASSWORD,
  });
}

/**
 * Sign in the desk digest agent — slice nine, the first principal
 * outside the candidate cluster. Own credential, own kill switch; it
 * sees nothing (the manager hands it the rollup pre-assembled) and
 * its whole reach is one INSERT on the append-only record table.
 */
export async function signInDeskDigestAgent(): Promise<AgentSession> {
  return signInAgent({
    kind: "digest",
    email: process.env.AGENT_DIGEST_EMAIL,
    password: process.env.AGENT_DIGEST_PASSWORD,
  });
}

/**
 * Sign in the Company Intelligence Agent — slice ten, the first of the
 * company-side grouping and the first zero-new-grant principal: every
 * read and write it makes was already in the pool (074's projects
 * S+U, skills S). One identity holds both judgments — the company
 * report and the hiring-manager dossier. Its model calls reach the
 * public web through Anthropic's web_search tool; suspension refuses
 * the run at sign-in, before any search is made.
 */
export async function signInCompanyIntelAgent(): Promise<AgentSession> {
  return signInAgent({
    kind: "company_intel",
    email: process.env.AGENT_COMPANYINTEL_EMAIL,
    password: process.env.AGENT_COMPANYINTEL_PASSWORD,
  });
}

/**
 * Sign in the Culture Agent — slice eleven, the second zero-new-grant
 * principal: the projects row and the feedback tail it reads were in
 * the pool from 074 (the interpreter's feedback grant, reused). The
 * recruiter's optional context string is its one human-handed input —
 * carried verbatim onto culture_context, a boolean in the trail.
 */
export async function signInCultureAgent(): Promise<AgentSession> {
  return signInAgent({
    kind: "culture",
    email: process.env.AGENT_CULTURE_EMAIL,
    password: process.env.AGENT_CULTURE_PASSWORD,
  });
}

/**
 * Sign in the Boolean Search Agent — slice twelve, the sourcing-side
 * opener and the first new-grant principal since 082: job_specs
 * SELECT (the brief is read-only), boolean_queries SELECT (the
 * current draft is model input) and INSERT (the versioned append) —
 * no UPDATE or DELETE ever; the version history is immutable to it
 * and the recruiter's edit/restore acts stay the human's own.
 */
export async function signInBooleanSearchAgent(): Promise<AgentSession> {
  return signInAgent({
    kind: "boolean_search",
    email: process.env.AGENT_BOOLEAN_EMAIL,
    password: process.env.AGENT_BOOLEAN_PASSWORD,
  });
}

/**
 * Sign in the Intake Agent — slice thirteen, the fourteen-agent map's
 * first agent converted thirteenth, and the third zero-new-grant
 * principal. Its judgment touches ONE row of one table — the mandate
 * being born — plus the trail door; the clients registry (the
 * resolve_client find-or-create, the client_id link, the context
 * promotion) stays the recruiter's act in the after() context: the
 * parser split, inverted — the agent hands its analysis BACK.
 */
export async function signInIntakeAgent(): Promise<AgentSession> {
  return signInAgent({
    kind: "intake",
    email: process.env.AGENT_INTAKE_EMAIL,
    password: process.env.AGENT_INTAKE_PASSWORD,
  });
}

/**
 * Sign in the Search Health Agent — slice fourteen, the LAST of the
 * fourteen-agent map. One principal, two judgments: health
 * suggestions (the pool's merge-UPDATE) and the weekly report (the
 * one new door — an INSERT-only, generated_by-pinned blind insert on
 * project_reports; the seam mints the id itself). When the scheduled
 * sweep's channel exists it will be THIS principal signing in from
 * the CRON_SECRET-gated route — same credential, same kill switch, a
 * `scheduled` trigger in the same vocabulary (D7).
 */
export async function signInSearchHealthAgent(): Promise<AgentSession> {
  return signInAgent({
    kind: "search_health",
    email: process.env.AGENT_METRICS_EMAIL,
    password: process.env.AGENT_METRICS_PASSWORD,
  });
}

/**
 * Sign in the Calibration Agent — the FIFTEENTH principal, the first
 * conversion outside the fourteen-agent map (§73's queue). One
 * judgment: deriving the scoring model's dimension weights from the
 * recruiter's onboarding answers. The fourth zero-new-grant
 * principal — 074's pool covers the projects merge, the
 * calibration_history snapshot (changed_by = this agent), and the
 * skills read. Recalibration stays the interpreter's act; two
 * principals lawfully write the same blob at different moments, each
 * signing its own judgment.
 */
export async function signInCalibrationAgent(): Promise<AgentSession> {
  return signInAgent({
    kind: "calibration",
    email: process.env.AGENT_CALIBRATION_EMAIL,
    password: process.env.AGENT_CALIBRATION_PASSWORD,
  });
}

/**
 * Sign in the Role Spec Agent — the SIXTEENTH principal (AGENTS.md
 * #4). One judgment: drafting the job spec onto the recruiter's
 * versioned placeholder. The first NEW-GRANT principal since 087:
 * 092's job_specs UPDATE is double-pinned on is_final — the agent
 * can neither touch a finalized spec nor finalize one; the canonical
 * version stays the recruiter's editorial act forever. Failure
 * bookkeeping (generation_error, the timeout marker) stays HUMAN.
 */
export async function signInRoleSpecAgent(): Promise<AgentSession> {
  return signInAgent({
    kind: "rolespec",
    email: process.env.AGENT_ROLESPEC_EMAIL,
    password: process.env.AGENT_ROLESPEC_PASSWORD,
  });
}

/**
 * Sign in the Shortlist Agent — the SEVENTEENTH principal (AGENTS.md
 * #11), the read-shaped conversion. One judgment: the submission
 * report over the recruiter's composed slate. 093 mints its two
 * doors: shortlists SELECT (the slate row is the model input) and an
 * UPDATE double-pinned on submitted_at — the agent can neither touch
 * a SUBMITTED slate nor submit one; what was sent never silently
 * changes, and submission stays the recruiter's editorial act
 * forever. The slate reads (candidates, scores, project) were
 * already in the pool.
 */
export async function signInShortlistAgent(): Promise<AgentSession> {
  return signInAgent({
    kind: "shortlist",
    email: process.env.AGENT_SHORTLIST_EMAIL,
    password: process.env.AGENT_SHORTLIST_PASSWORD,
  });
}

async function signInAgent(args: {
  kind: string;
  email: string | undefined;
  password: string | undefined;
}): Promise<AgentSession> {
  const { kind, email, password } = args;

  if (!email || !password) {
    return {
      ok: false,
      reason: `the ${kind} agent has no credentials in this environment (AGENT_* env vars absent) — refusing; there is deliberately no service-role fallback`,
    };
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return { ok: false, reason: "Supabase URL or anon key is not set" };
  }

  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.user) {
    return {
      ok: false,
      reason: `the ${kind} agent could not sign in (${error?.message ?? "no user"})`,
    };
  }

  // The agent's own row, under its own session — the self-read policy
  // reaches it whatever the status, so a refusal here can say why.
  const { data: row } = await client
    .from("users")
    .select("role, status, organization_id")
    .eq("id", data.user.id)
    .maybeSingle<{
      role: string | null;
      status: string;
      organization_id: string | null;
    }>();

  if (!row || row.role !== "agent" || !row.organization_id) {
    await client.auth.signOut();
    return {
      ok: false,
      reason: `the ${kind} account is not an agent principal (role ${row?.role ?? "unknown"})`,
    };
  }
  if (row.status !== "active") {
    await client.auth.signOut();
    return {
      ok: false,
      reason: `the ${kind} agent is ${row.status} — an operator suspended it from /ops`,
    };
  }

  return {
    ok: true,
    client,
    userId: data.user.id,
    organizationId: row.organization_id,
    signOut: async () => {
      try {
        await client.auth.signOut();
      } catch (err) {
        captureSeamError(`[agents/session] ${kind} sign-out failed`, err);
      }
    },
  };
}
