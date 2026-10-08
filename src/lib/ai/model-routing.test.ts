import { describe, expect, it } from "vitest";
import {
  CAPABILITY_MODEL,
  CAPABILITY_THINKING,
  ESCALATION_PAIRS,
  modelForCapability,
  type Capability,
} from "./model-map";

/**
 * What model actually runs, as opposed to what a table says.
 *
 * `inference.test.ts` already pins the contents of `CAPABILITY_MODEL`
 * and `ESCALATION_PAIRS`. That catches an edited value. It does not
 * catch the thing that actually goes wrong here, which is a change in
 * one structure silently changing the BEHAVIOUR of another:
 *
 *   * An escalation pair is armed only when the capability's code
 *     default equals the pair's `from`. Edit the map and a dormant
 *     pair arms itself, or an armed pair goes dark — with no edit to
 *     ESCALATION_PAIRS at all, and nothing failing.
 *   * An escalation `to` model is never checked against the models the
 *     product knows about — it WAS a bare string handed to the provider
 *     until C9 (2026-10-08) made escalateInference refuse a target that
 *     is not `active` in provider_models. The runtime gate lives in
 *     inference.ts and is proven in inference.test.ts; what this file
 *     pins is the static pairing the gate then has to catch.
 *
 * Verified against production on 2026-10-08, after migration 162:
 *   capability_assignments ... 0 rows, so the code map governs every
 *                              call today; there is no override layer
 *                              quietly rerouting anything.
 *   provider_models .......... claude-haiku-4-5, claude-sonnet-4-6,
 *                              claude-sonnet-5  (all active)
 *                              claude-opus-5    (benchmarking, added
 *                              by 162 as the armed escalation target)
 *   inference_runs ........... sonnet-4-6 x61, sonnet-5 x14, haiku x1
 *   escalation hops .......... 0, ever
 */

/**
 * Model ids this product is allowed to name. `claude-opus-5` is here
 * because an escalation pair targets it — see the test that says so,
 * and the warning attached to it.
 */
const KNOWN_MODELS = new Set([
  "claude-haiku-4-5",
  "claude-sonnet-4-6",
  "claude-sonnet-5",
  "claude-opus-5",
]);

/**
 * What `provider_models` holds in production, as of migration 162.
 *
 * `claude-opus-5` was added by 162 at status `benchmarking` because the
 * armed generate_evaluation escalation targets it and it was in no
 * table at all. Registered is not the same as usable — see
 * ACTIVE_IN_PRODUCTION below, and the test that depends on the
 * difference.
 */
const REGISTERED_IN_PRODUCTION = new Set([
  "claude-haiku-4-5",
  "claude-sonnet-4-6",
  "claude-sonnet-5",
  "claude-opus-5",
]);

/**
 * The subset at status `active`. A capability may only be ASSIGNED to
 * one of these — `capability_assignments_active_gate` refuses the rest
 * with "benchmark and activate it first", and activation needs a
 * `benchmark_ref`.
 *
 * opus-5 is deliberately absent: it has never been benchmarked.
 */
const ACTIVE_IN_PRODUCTION = new Set([
  "claude-haiku-4-5",
  "claude-sonnet-4-6",
  "claude-sonnet-5",
]);

const capabilities = Object.keys(CAPABILITY_MODEL) as Capability[];

describe("the code default is the live route", () => {
  it("gives every capability a model, and only known models", () => {
    expect(capabilities.length).toBeGreaterThan(30);
    for (const c of capabilities) {
      const model = modelForCapability(c);
      expect(model, `${c} has no model`).toBeTruthy();
      expect(KNOWN_MODELS.has(model), `${c} -> unknown model ${model}`).toBe(true);
    }
  });

  it("routes every capability to a model that is ACTIVE in production", () => {
    // Stronger than "registered". A capability's default is what every
    // call uses; it must point at a model the product has benchmarked
    // and activated, not merely one it has heard of. opus-5 is
    // registered but not active, so a default naming it would fail
    // here -- which is the intended behaviour.
    for (const c of capabilities) {
      const model = modelForCapability(c);
      expect(
        ACTIVE_IN_PRODUCTION.has(model),
        `${c} defaults to ${model}, which is not an active model`
      ).toBe(true);
    }
  });

  it("names a thinking config only for real capabilities", () => {
    for (const key of Object.keys(CAPABILITY_THINKING)) {
      expect(capabilities, `${key} is not a capability`).toContain(key);
    }
  });

  it("keeps thinking disabled on the two judgment seams", () => {
    // Not cosmetic: bare Sonnet 5 runs adaptive thinking by default,
    // which truncated 5/8 benchmark cells inside the seams' max_tokens.
    expect(CAPABILITY_THINKING.generate_evaluation).toEqual({ type: "disabled" });
    expect(CAPABILITY_THINKING.verify_evaluation).toEqual({ type: "disabled" });
  });

  it("audits evaluation with a model at least as strong as the one it audits", () => {
    // Auditing sonnet-5 with a weaker model inverts the point of the
    // refuter.
    expect(modelForCapability("verify_evaluation")).toBe(
      modelForCapability("generate_evaluation")
    );
  });
});

describe("escalation pairs — armed or dormant, derived not asserted", () => {
  /**
   * A pair fires only if the model that ACTUALLY ran equals `from`
   * (`escalateInference`'s arming pin). With no registry overrides in
   * production, the model that runs is the code default — so arming is
   * computable from the map alone.
   */
  function armed(capability: Capability): boolean {
    const pair = ESCALATION_PAIRS[capability];
    if (!pair) return false;
    return modelForCapability(capability) === pair.from;
  }

  it("has exactly the two ruled pairs", () => {
    expect(Object.keys(ESCALATION_PAIRS).sort()).toEqual([
      "generate_evaluation",
      "parse_cv",
    ]);
  });

  it("generate_evaluation is ARMED", () => {
    // Default is sonnet-5 and the pair's from is sonnet-5, so a schema
    // failure here really does retry on opus-5.
    expect(modelForCapability("generate_evaluation")).toBe("claude-sonnet-5");
    expect(ESCALATION_PAIRS.generate_evaluation).toEqual({
      from: "claude-sonnet-5",
      to: "claude-opus-5",
    });
    expect(armed("generate_evaluation")).toBe(true);
  });

  it("parse_cv is DORMANT until its Haiku flip lands", () => {
    // The pair exists but can never fire: the default is sonnet-4-6 and
    // the pair's from is haiku-4-5. This is deliberate and documented —
    // the test exists so that flipping parse_cv to Haiku ARMS a
    // previously dead escalation path as a visible, failing change
    // rather than a silent one.
    expect(modelForCapability("parse_cv")).toBe("claude-sonnet-4-6");
    expect(ESCALATION_PAIRS.parse_cv?.from).toBe("claude-haiku-4-5");
    expect(armed("parse_cv")).toBe(false);
  });

  it("never escalates to a weaker or equal model", () => {
    // An escalation that lands on the same tier is a retry wearing a
    // costume; one that lands lower is a downgrade.
    const RANK: Record<string, number> = {
      "claude-haiku-4-5": 1,
      "claude-sonnet-4-6": 2,
      "claude-sonnet-5": 3,
      "claude-opus-5": 4,
    };
    for (const [capability, pair] of Object.entries(ESCALATION_PAIRS)) {
      if (!pair) continue;
      expect(
        RANK[pair.to],
        `${capability}: ${pair.from} -> ${pair.to} is not an escalation`
      ).toBeGreaterThan(RANK[pair.from]);
    }
  });

  it("escalates only to a model the registry knows about", () => {
    // Was a FLAGGED finding: generate_evaluation escalates to
    // claude-opus-5, which was in no table at all. Migration 162 added
    // it at status `benchmarking`.
    const targets = Object.values(ESCALATION_PAIRS)
      .filter(Boolean)
      .map((p) => p!.to);
    for (const t of targets) {
      expect(REGISTERED_IN_PRODUCTION.has(t), `${t} is not in provider_models`).toBe(true);
    }
  });

  it("the armed escalation target is not active — so the hop is gated SHUT at runtime (C9, closed)", () => {
    // History, because the shape of the fix matters more than the fix.
    //
    // Registering opus-5 (migration 162) fixed the reporting hole: an
    // inference_runs row can now be joined to a model the registry can
    // name. It did NOT make opus-5 usable, and it did not change what
    // escalation does — `capability_assignments_active_gate` refused an
    // ASSIGNMENT to any non-active model with "benchmark and activate it
    // first", while escalateInference consulted neither the registry nor
    // that gate. The `to` model was a code constant handed straight to
    // the provider, so the one path that could reach an unbenchmarked
    // model was the one path that did not check.
    //
    // Resolution taken (C9, 2026-10-08): escalateInference now reads
    // provider_models and refuses a `to` model that is not `active`,
    // which disarms this pair until opus-5 is benchmarked and activated.
    // An unreadable registry also skips the hop — the conservative
    // direction, reasoned about where the code is.
    //
    // This test keeps the STATIC half of the fact: the pair is armed in
    // the code map and its target is not active in production, so the
    // runtime gate is the only thing standing between a schema failure
    // and an unevidenced opus-5 call. The gate's own behaviour is pinned
    // in inference.test.ts ("the activation gate (C9)"), against a mock
    // whose default state is this exact row of production.
    //
    // Activating opus-5 arms a real hop. When that happens, move
    // claude-opus-5 into ACTIVE_IN_PRODUCTION and this test inverts —
    // which is the point: it becomes a visible change, not a silent one.
    const armedTargets = Object.entries(ESCALATION_PAIRS)
      .filter(([c, p]) => p && modelForCapability(c as Capability) === p.from)
      .map(([, p]) => p!.to);
    expect(armedTargets).toEqual(["claude-opus-5"]);
    expect(ACTIVE_IN_PRODUCTION.has("claude-opus-5")).toBe(false);
  });
});
