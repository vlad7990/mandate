import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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
        console.error(`[agents/session] ${kind} sign-out failed`, err);
      }
    },
  };
}
