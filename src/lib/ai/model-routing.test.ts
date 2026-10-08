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
 *     product knows about. It is a bare string handed to the provider.
 *
 * Verified against production on 2026-10-08:
 *   capability_assignments ... 0 rows, so the code map governs every
 *                              call today; there is no override layer
 *                              quietly rerouting anything.
 *   provider_models .......... claude-haiku-4-5, claude-sonnet-4-6,
 *                              claude-sonnet-5
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
 * The models `provider_models` actually held in production on
 * 2026-10-08. Kept separate from KNOWN_MODELS on purpose: the gap
 * between the two sets is a finding, not an oversight.
 */
const REGISTERED_IN_PRODUCTION = new Set([
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

  it("routes every capability to a model registered in production", () => {
    // capability_assignments.model_id has a FK onto provider_models, so
    // a founder cannot OVERRIDE a capability to a model that is not
    // registered. The code default is under no such constraint. If a
    // default ever names an unregistered model, the UI will show a
    // capability pointing at a model the registry does not list.
    for (const c of capabilities) {
      const model = modelForCapability(c);
      expect(
        REGISTERED_IN_PRODUCTION.has(model),
        `${c} defaults to ${model}, which is not in provider_models`
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

  it("FLAGS that an escalation target is not registered in provider_models", () => {
    // This is a finding, pinned so it cannot be forgotten.
    //
    // generate_evaluation is armed and escalates to claude-opus-5, but
    // provider_models held only haiku-4-5, sonnet-4-6 and sonnet-5 on
    // 2026-10-08. Nothing breaks at call time — the escalation hands
    // the id straight to the provider and does not consult the table —
    // but three things follow:
    //
    //   1. the model picker cannot offer opus-5, because
    //      capability_assignments.model_id has a FK onto provider_models
    //   2. an inference_runs row will record a model the registry does
    //      not list, so cost reporting by model has a hole in it
    //   3. the first time this fires will be the first time opus-5 is
    //      called in production -- and escalation has fired 0 times ever
    //
    // The fix is a one-row insert into provider_models. It is listed in
    // the launch tracker rather than done here, because adding a row to
    // a production table is a production change.
    const targets = Object.values(ESCALATION_PAIRS)
      .filter(Boolean)
      .map((p) => p!.to);
    const unregistered = targets.filter((m) => !REGISTERED_IN_PRODUCTION.has(m));
    expect(unregistered).toEqual(["claude-opus-5"]);
  });
});
