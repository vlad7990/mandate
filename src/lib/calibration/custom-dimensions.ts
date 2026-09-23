// §196 — custom industry dimensions: the pure layer.
//
// Client-safe on purpose (no `server-only`): the approval panel renders
// these in the browser, the scoring math folds them in on both sides of
// the wire, and the parser builds its schema from them on the server.
// One module, no Supabase, so every caller reads the same rules.
//
// Everything here is defensive. `projects.calibration_model` is JSONB —
// it has no shape the database enforces, it has been written by four
// different agents across 137 migrations, and a row written before this
// slice has no `custom_dimensions` key at all. So `normalise` is the
// only door: nothing downstream reads the raw array.

import {
  CUSTOM_DEFINITION_MAX,
  CUSTOM_DIMENSION_KEY_RE,
  CUSTOM_DIMENSIONS_MAX,
  CUSTOM_LABEL_MAX,
  CUSTOM_RATIONALE_MAX,
  DIMENSION_KEYS,
  type CustomDimension,
  type CustomDimensionOrigin,
  type CustomDimensionProposal,
} from "@/lib/ai/onboarding-analysis";

const CORE_KEYS = new Set<string>(DIMENSION_KEYS);

/**
 * Trim to a bound WITHOUT cutting a word in half.
 *
 * Drive 128 produced "…no options pricing, no Greeks management, and no
 * P&L owne" — a hard `.slice()` at 400. On a label that is merely ugly.
 * On a DEFINITION it is worse than ugly: the definition is the text the
 * CV parser scores a candidate against, and the clause a mid-sentence
 * cut usually eats is the "what a 0 looks like" half, which is exactly
 * the half that stops the model scoring generously by default.
 *
 * So: back off to the last space, drop any dangling punctuation, and end
 * with an ellipsis so the cut is VISIBLE — to the recruiter approving it
 * and to the model reading it. A silently shortened definition reads as
 * a complete one.
 *
 * The back-off is capped: if the last space is in the first 60% of the
 * budget (a single very long token), take the hard cut instead rather
 * than throw most of the text away.
 */
function truncateAtWord(input: string, max: number): string {
  const s = input.trim();
  if (s.length <= max) return s;

  // Leave room for the ellipsis so the result honours `max`.
  const budget = Math.max(1, max - 1);
  const cut = s.slice(0, budget);
  const lastSpace = cut.lastIndexOf(" ");
  const body = lastSpace > budget * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${body.replace(/[\s,;:.—–-]+$/, "")}…`;
}

function str(v: unknown, max: number): string {
  return typeof v === "string" ? truncateAtWord(v, max) : "";
}

/** Same 0–10 integer clamp the core weights use. */
function clampWeight(v: unknown): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(10, Math.round(v)));
}

/**
 * Is this a key we can safely store and score against? Rejects the five
 * core names outright — a custom "domain" would silently shadow the
 * columnar one everywhere the two are merged.
 */
export function isValidCustomKey(key: unknown): key is string {
  return (
    typeof key === "string" &&
    CUSTOM_DIMENSION_KEY_RE.test(key) &&
    !CORE_KEYS.has(key)
  );
}

/**
 * Coerce whatever is in the JSONB into a trustworthy list. Drops rows
 * that can't be made sense of rather than throwing: a malformed entry
 * must never take down a mandate page, and dropping is the honest
 * outcome — an axis we can't read is an axis we can't score.
 *
 * Deduplicates on key (first wins) and enforces the cap, so no caller
 * has to.
 */
export function normaliseCustomDimensions(raw: unknown): CustomDimension[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: CustomDimension[] = [];

  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;

    if (!isValidCustomKey(e.key)) continue;
    if (seen.has(e.key)) continue;

    const label = str(e.label, CUSTOM_LABEL_MAX);
    const definition = str(e.definition, CUSTOM_DEFINITION_MAX);
    // A dimension with no label or no definition cannot be scored
    // against or approved with understanding. Drop it.
    if (!label || !definition) continue;

    seen.add(e.key);
    out.push({
      key: e.key,
      label,
      definition,
      rationale: str(e.rationale, CUSTOM_RATIONALE_MAX),
      weight: clampWeight(e.weight),
      // Anything we can't read as an explicit approval is NOT approved.
      // The default must fail closed — an unreadable status becoming
      // "approved" would let a malformed write score candidates on an
      // axis no human ever saw.
      status: e.status === "approved" ? "approved" : "proposed",
      origin: e.origin === "recruiter" ? "recruiter" : "agent",
    });
    if (out.length >= CUSTOM_DIMENSIONS_MAX) break;
  }

  return out;
}

/** Read the custom dimensions off a calibration model of unknown shape. */
export function customDimensionsOf(
  calibration: { custom_dimensions?: unknown } | null | undefined
): CustomDimension[] {
  return normaliseCustomDimensions(calibration?.custom_dimensions);
}

/**
 * The ONLY dimensions that may touch a score. Everything in the scoring
 * path, the parser schema and the portals calls this, never the raw
 * list — that is what makes "proposed does not score" a property of the
 * system rather than a promise made in four places.
 *
 * A zero-weight approved dimension is excluded too: it contributes
 * nothing to a weighted average, so asking the parser to score it would
 * spend tokens to move no number.
 */
export function approvedCustomDimensions(
  calibration: { custom_dimensions?: unknown } | null | undefined
): CustomDimension[] {
  return customDimensionsOf(calibration).filter(
    (d) => d.status === "approved" && d.weight > 0
  );
}

/**
 * §196 slice 2 — the calibration model as an AGENT may see it.
 *
 * Six seams serialise `project.calibration_model` straight into a prompt
 * (evaluation, comparison, shortlist report, interview plan, copilot,
 * positioning). Since slice 1 that object carries `custom_dimensions`,
 * and a PROPOSED entry carries the Calibration Agent's `rationale` — an
 * argument for scoring people on a new axis that no human has accepted.
 *
 * Two things follow, and both matter:
 *
 *   * A proposed axis must not reach a prompt AT ALL. There is no schema
 *     field for it, so it cannot be scored — but a model told "this role
 *     also values X" will let X colour the judgements it CAN make. The
 *     approval gate has to hold on the way IN, not only on the way out.
 *   * `rationale` is stripped even from approved axes. It is the agent
 *     arguing to a recruiter, not a description of what is measured, and
 *     several of these seams write prose a client reads.
 *
 * Callers pass the RESULT into their prompt, never the stored row.
 */
export function calibrationForPrompt<
  T extends { custom_dimensions?: unknown },
>(calibration: T | null | undefined): T | null {
  if (!calibration) return null;
  const approved = approvedCustomDimensions(calibration).map((d) => ({
    key: d.key,
    label: d.label,
    definition: d.definition,
    weight: d.weight,
  }));
  return { ...calibration, custom_dimensions: approved } as T;
}

export type ManualDimensionInput = {
  label: string;
  definition: string;
  weight: number;
};

export type ManualDimensionResult =
  | { ok: true; dimension: CustomDimension }
  | { ok: false; error: string };

/**
 * Build a recruiter-authored dimension. The escape hatch, not the path:
 * the agent proposes these unprompted, and this exists for the case
 * where it missed something the recruiter knows.
 *
 * Recruiter-authored dimensions land APPROVED. The approval gate exists
 * to put a human between an agent's invention and a candidate's rank —
 * when the human IS the author, there is nobody left to witness.
 */
export function buildManualDimension(
  input: ManualDimensionInput,
  existing: CustomDimension[]
): ManualDimensionResult {
  const label = str(input.label, CUSTOM_LABEL_MAX);
  const definition = str(input.definition, CUSTOM_DEFINITION_MAX);

  if (label.length < 2) {
    return { ok: false, error: "Give the dimension a name." };
  }
  if (definition.length < 10) {
    return {
      ok: false,
      error:
        "Describe what a 10 looks like and what a 0 looks like — this is what a CV gets scored against.",
    };
  }
  if (existing.length >= CUSTOM_DIMENSIONS_MAX) {
    return {
      ok: false,
      error: `A mandate carries at most ${CUSTOM_DIMENSIONS_MAX} custom dimensions. Remove one first.`,
    };
  }

  const key = slugify(label, existing);
  if (!key) {
    return {
      ok: false,
      error: "That name can't be turned into an identifier. Use plain letters.",
    };
  }

  return {
    ok: true,
    dimension: {
      key,
      label,
      definition,
      rationale: "Added by the recruiter.",
      weight: clampWeight(input.weight),
      status: "approved",
      origin: "recruiter",
    },
  };
}

/**
 * Label → stable key, uniquified against what's already on the mandate
 * and against the five core names.
 */
function slugify(label: string, existing: CustomDimension[]): string | null {
  const base = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^([0-9])/, "d$1")
    .slice(0, 36);
  if (!base) return null;

  const taken = new Set(existing.map((d) => d.key));
  let candidate = base;
  let n = 2;
  while (taken.has(candidate) || CORE_KEYS.has(candidate)) {
    candidate = `${base}_${n++}`.slice(0, 40);
    if (n > 50) return null;
  }
  return isValidCustomKey(candidate) ? candidate : null;
}

/**
 * Fold a fresh set of agent proposals into what the mandate already
 * carries.
 *
 * THE INVARIANT THIS FILE EXISTS FOR: a re-run of the Calibration Agent
 * MUST NOT revoke a human approval, silently rewrite an approved
 * dimension's definition, or reset it to "proposed". Calibration re-runs
 * on every feedback-driven recalibration; if the agent could overwrite
 * approvals, one recalibration would quietly re-author the criteria a
 * recruiter signed for — and candidates already scored on the old
 * definition would be ranked against the new one without anyone
 * being told.
 *
 * So: approved dimensions survive verbatim. Only their WEIGHT moves, and
 * only because weight is the agent's job on every other axis too. New
 * proposals append while there is room under the cap. Stale proposals
 * (never approved, no longer proposed) fall away.
 */
export function mergeProposals(
  existing: CustomDimension[],
  proposals: CustomDimensionProposal[],
  origin: CustomDimensionOrigin = "agent"
): CustomDimension[] {
  const approved = existing.filter((d) => d.status === "approved");
  const byKey = new Map(approved.map((d) => [d.key, d]));
  const out: CustomDimension[] = [];

  // Approved rows keep their identity. The agent may re-weight them —
  // that is the same authority it has over the core five — but the key,
  // label, definition and approval are the human's, not its.
  for (const dim of approved) {
    const reproposed = proposals.find((p) => p.key === dim.key);
    out.push(
      reproposed ? { ...dim, weight: clampWeight(reproposed.weight) } : dim
    );
  }

  for (const p of proposals) {
    if (out.length >= CUSTOM_DIMENSIONS_MAX) break;
    if (!isValidCustomKey(p.key)) continue;
    if (byKey.has(p.key)) continue;
    const label = str(p.label, CUSTOM_LABEL_MAX);
    const definition = str(p.definition, CUSTOM_DEFINITION_MAX);
    if (!label || !definition) continue;
    if (out.some((d) => d.key === p.key)) continue;

    out.push({
      key: p.key,
      label,
      definition,
      rationale: str(p.rationale, CUSTOM_RATIONALE_MAX),
      weight: clampWeight(p.weight),
      status: "proposed",
      origin,
    });
  }

  return out;
}
