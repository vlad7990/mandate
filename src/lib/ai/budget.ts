import "server-only";
import { getServiceRoleSupabaseClient } from "@/lib/supabase-service-role";
import { captureSeamError } from "@/lib/observability/sentry";
import { modelPricing } from "./registry";

/**
 * THE AI SPEND CEILING (C11, migration 164, the founder's word
 * 2026-10-08: 30 rolling days, soft $50, hard $250, ENABLED).
 *
 * 163 bounded escalation hops by COUNT, because a hop is a discrete,
 * rare, failure-triggered event. Ordinary model calls are the hottest
 * path in the product and the thing worth bounding about them is not how
 * many there are but what they cost — a 211k-token research call and a
 * 3-token copilot turn are both "one call" and differ 70,000-fold in
 * price. So this is denominated in dollars.
 *
 * ## It is a READ, not a counter write
 *
 * One `ai_budget_verdict()` call per process per 60 seconds — the
 * registry's cache shape, for the registry's reason. Never one query per
 * model call. That is what makes a guard on the hot path affordable at
 * all, and it is the specific objection this design was built to answer:
 * a counter write in front of every call to bound a $2/month bill is the
 * wrong trade.
 *
 * The cost is staleness. Spend is measured up to 60 seconds late, so the
 * ceiling can be overshot by up to a minute of calls. At measured burn
 * that is cents; at a runaway it is the difference between stopping at
 * $250 and stopping at $255. A ceiling is a circuit breaker, not an
 * accounting boundary, and buying exactness here would cost a database
 * round trip on every inference in the product.
 *
 * ## FAIL DIRECTIONS, and why they differ from 163's
 *
 * 163's ceiling guards an OPTIONAL retry, so it refuses when it cannot
 * answer — skipping a hop costs nothing the product had before
 * escalation existed. This guard sits on the PRIMARY path, where the
 * seam's standing law is that no database read may ever block a model
 * call. So:
 *
 *   * verdict unreadable  → ALLOW, warn once, capture to Sentry. A
 *     budget outage must not take the product down. The budget is a
 *     spend control, not a security boundary.
 *   * budget disabled     → ALLOW.
 *   * over the hard cap   → REFUSE. The deliberate exception to the law,
 *     and it is a MEASURED refusal rather than an uncertain one: we know
 *     we are over, we are not guessing.
 *   * model is unpriced   → REFUSE while a budget is enabled. See below.
 *   * registry unreadable → ALLOW (pricing unknown ≠ unpriced).
 *
 * ## Why an unpriced model is refused
 *
 * `ai_run_cost_usd` returns NULL for a model with either price missing,
 * and `sum()` skips NULLs — so spend against an unpriced model is
 * INVISIBLE to the ceiling. A budget with such a model in play is not a
 * budget. Refusing is the only honest option: we cannot bound what we
 * cannot price.
 *
 * This is inert today. All three active models carry measured prices;
 * the only unpriced row is claude-opus-5, which is `benchmarking` and
 * therefore unreachable anyway (C9). The refusal exists so that adding a
 * model and forgetting its prices fails loudly, rather than silently
 * uncapping the budget — the same shape as C9's rule that you may not
 * route to an unbenchmarked model.
 *
 * ## What a person sees
 *
 * `BudgetExceededError` carries no numbers a recruiter could act on, and
 * callers pass it through `agentErrorMessage`, which maps anything
 * without an HTTP status to "could not run. This has been logged". That
 * is the right sentence: a recruiter at a client agency cannot fix our
 * spend cap, and telling them the figure would disclose our billing. The
 * real reason goes to the server console and to Sentry.
 */

const TTL_MS = 60_000;

type Verdict = {
  enabled: boolean;
  window_days: number;
  spend_usd: number;
  soft_usd: number;
  hard_usd: number;
  over_soft: boolean;
  over_hard: boolean;
  unpriced_runs: number;
};

let cache: { fetchedAt: number; verdict: Verdict | null } | null = null;
let warned = false;
let softWarned = false;

/** Thrown before any provider call. Deliberately not an Anthropic SDK
 * error: it carries no status, so `agentErrorMessage` renders it through
 * the generic "could not run" branch rather than "busy, try again". */
export class BudgetExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BudgetExceededError";
  }
}

function warnBudgetUnreadable(err: unknown): void {
  if (warned) return;
  warned = true;
  captureSeamError(
    "[budget] ai_budget_verdict unreadable — model calls proceed UNCAPPED until it recovers",
    err
  );
}

async function readVerdict(): Promise<Verdict | null> {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < TTL_MS) return cache.verdict;

  let verdict = cache?.verdict ?? null;
  try {
    const supabase = getServiceRoleSupabaseClient();
    const { data, error } = await supabase
      .rpc("ai_budget_verdict")
      .maybeSingle<Verdict>();
    if (error) throw error;
    if (!data) throw new Error("ai_budget_verdict returned no row");
    verdict = {
      ...data,
      // numeric comes back as a string over PostgREST.
      spend_usd: Number(data.spend_usd),
      soft_usd: Number(data.soft_usd),
      hard_usd: Number(data.hard_usd),
    };
  } catch (err) {
    // Stale beats blind, and the window is stamped either way so a dead
    // database costs one attempt per TTL rather than one per call.
    warnBudgetUnreadable(err);
  }
  cache = { fetchedAt: now, verdict };
  return verdict;
}

/**
 * Called by the inference seam immediately before every provider call,
 * on both the streaming and non-streaming paths. Throws
 * `BudgetExceededError` to refuse; returns normally to allow.
 */
export async function assertWithinBudget(model: string): Promise<void> {
  const verdict = await readVerdict();
  // Unreadable: allow. The law protects the primary call.
  if (!verdict || !verdict.enabled) return;

  if (verdict.over_hard) {
    throw new BudgetExceededError(
      `AI spend ceiling reached: $${verdict.spend_usd.toFixed(2)} over ` +
        `${verdict.window_days} days against a $${verdict.hard_usd.toFixed(2)} ` +
        `cap. Model calls are refused until the cap is raised in ` +
        `ai_budget_policy or the window rolls forward.`
    );
  }

  if (verdict.over_soft && !softWarned) {
    // Once per process. The point is a Sentry event a human sees, not a
    // line per call.
    softWarned = true;
    captureSeamError(
      `[budget] AI spend is $${verdict.spend_usd.toFixed(2)} over ` +
        `${verdict.window_days} days, past the $${verdict.soft_usd.toFixed(2)} ` +
        `soft threshold (hard cap $${verdict.hard_usd.toFixed(2)}). Nothing is ` +
        `blocked yet.`,
      new Error("ai budget soft threshold crossed")
    );
  }

  const pricing = await modelPricing(model);
  if (pricing === "unpriced") {
    throw new BudgetExceededError(
      `${model} has no price in provider_models, so spend against it is ` +
        `invisible to the $${verdict.hard_usd.toFixed(2)} ceiling. Set ` +
        `price_input_per_mtok and price_output_per_mtok from the provider's ` +
        `documentation, or disable the budget.`
    );
  }
}

/** Test-only: drop the cache and both warn-once latches. */
export function __resetBudgetCache(): void {
  cache = null;
  warned = false;
  softWarned = false;
}
