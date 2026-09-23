import { describe, expect, it } from "vitest";
import {
  AGENT_TILES,
  AGENT_TILE_STATE_LABEL,
  AGENT_TILE_STATE_PULSES,
  type AgentTileState,
} from "@/components/projects/agent-tiles";
import {
  agentStackMeta,
  agentStackStates,
  calibrationTileAction,
  hasOnboardingAnswers,
  specTileAction,
  type AgentStackFacts,
} from "./agent-stack";

const BASE: AgentStackFacts = {
  analysisReady: true,
  intakeFailed: false,
  calibrated: false,
  onboardingAnswered: false,
  spec: { hasAny: false, hasFinal: false, isGenerating: false },
};

type FactsOverride = Partial<Omit<AgentStackFacts, "spec">> & {
  spec?: Partial<AgentStackFacts["spec"]>;
};

function facts(over: FactsOverride = {}): AgentStackFacts {
  return { ...BASE, ...over, spec: { ...BASE.spec, ...(over.spec ?? {}) } };
}

/** Every combination of the boolean facts — 2^5 = 32 worlds. */
function allWorlds(): AgentStackFacts[] {
  const bits = [false, true];
  const out: AgentStackFacts[] = [];
  for (const analysisReady of bits)
    for (const intakeFailed of bits)
      for (const calibrated of bits)
        for (const onboardingAnswered of bits)
          for (const hasAny of bits)
            for (const hasFinal of bits)
              for (const isGenerating of bits)
                out.push({
                  analysisReady,
                  intakeFailed,
                  calibrated,
                  onboardingAnswered,
                  spec: { hasAny, hasFinal, isGenerating },
                });
  return out;
}

describe("agentStackStates — the rule", () => {
  // THE PROPERTY §197 EXISTS FOR. `active` is the product's claim that an
  // agent is running; the mandate page used to make it while the chain
  // waited on a human. Exhaustive, so a future branch cannot reintroduce
  // it quietly.
  it("only ever reports `active` where an agent is genuinely mid-run", () => {
    for (const f of allWorlds()) {
      const s = agentStackStates(f);
      const upstreamRunning = !f.analysisReady && !f.intakeFailed;
      expect(s.intake === "active").toBe(upstreamRunning);
      expect(s.company_research === "active").toBe(upstreamRunning);
      // Calibration derives synchronously inside one action — it is never
      // observably in flight on this page.
      expect(s.calibration).not.toBe("active");
      expect(s.role_spec === "active").toBe(
        !f.spec.hasFinal && f.spec.isGenerating
      );
    }
  });

  it("never leaves a blocked tile without an act on the page", () => {
    for (const f of allWorlds()) {
      const s = agentStackStates(f);
      // Both tiles that can be blocked carry a CTA unconditionally; intake
      // and research are blocked only when the failure banner (with its
      // Retry) is on the same screen, which is exactly `intakeFailed`.
      if (s.calibration === "blocked") {
        expect(calibrationTileAction("p", f).enabled).toBe(true);
      }
      if (s.intake === "blocked") expect(f.intakeFailed).toBe(true);
    }
  });

  it("the defect: analysed, uncalibrated, nobody has started onboarding", () => {
    const s = agentStackStates(facts());
    expect(s.calibration).toBe("blocked");
    expect(AGENT_TILE_STATE_LABEL[s.calibration]).toBe("NEEDS YOU");
    expect(AGENT_TILE_STATE_PULSES[s.calibration]).toBe(false);
    // SPEC waits on a step, not a person, and its hint names the remedy.
    expect(s.role_spec).toBe("queued");
    const action = specTileAction("p", facts());
    expect(action.enabled).toBe(false);
    expect(action.disabledHint).toBe("Calibrate first");
  });

  it("holds CALIBRATE queued until intake lands — a step, not a person", () => {
    const s = agentStackStates(facts({ analysisReady: false }));
    expect(s.calibration).toBe("queued");
    const action = calibrationTileAction("p", facts({ analysisReady: false }));
    expect(action.enabled).toBe(false);
    expect(action.disabledHint).toBe("Awaiting intake");
  });

  it("marks a failed intake blocked rather than pulsing forever", () => {
    const s = agentStackStates(
      facts({ analysisReady: false, intakeFailed: true })
    );
    expect(s.intake).toBe("blocked");
    expect(s.company_research).toBe("blocked");
  });

  it("walks the spec tile: queued → blocked → active → complete", () => {
    expect(agentStackStates(facts()).role_spec).toBe("queued");
    expect(agentStackStates(facts({ calibrated: true })).role_spec).toBe(
      "blocked"
    );
    expect(
      agentStackStates(facts({ calibrated: true, spec: { hasAny: true } }))
        .role_spec
    ).toBe("blocked");
    expect(
      agentStackStates(
        facts({ calibrated: true, spec: { hasAny: true, isGenerating: true } })
      ).role_spec
    ).toBe("active");
    expect(
      agentStackStates(
        facts({ calibrated: true, spec: { hasAny: true, hasFinal: true } })
      ).role_spec
    ).toBe("complete");
  });

  it("completes both upstream tiles together — one predicate, one answer", () => {
    const s = agentStackStates(facts({ analysisReady: true }));
    expect(s.intake).toBe("complete");
    expect(s.company_research).toBe("complete");
  });
});

describe("calibrationTileAction", () => {
  it("offers Start onboarding only when nothing has been answered", () => {
    expect(calibrationTileAction("p1", facts()).label).toBe("Start onboarding");
    expect(calibrationTileAction("p1", facts()).href).toBe(
      "/app/projects/p1/onboarding"
    );
  });

  // Drive 128's real production state: the answers saved, the derivation
  // 400'd. Calling that "Start onboarding" would deny the recruiter's own
  // work happened.
  it("offers a re-run when answers are saved but weights never landed", () => {
    const action = calibrationTileAction("p1", facts({ onboardingAnswered: true }));
    expect(action.label).toBe("Re-run calibration");
    expect(action.enabled).toBe(true);
  });

  it("offers a re-run once calibrated", () => {
    expect(calibrationTileAction("p1", facts({ calibrated: true })).label).toBe(
      "Re-run calibration"
    );
  });
});

describe("hasOnboardingAnswers", () => {
  it("treats null and {} as nothing answered", () => {
    expect(hasOnboardingAnswers(null)).toBe(false);
    expect(hasOnboardingAnswers(undefined)).toBe(false);
    expect(hasOnboardingAnswers({})).toBe(false);
  });

  it("treats any stored key as answered", () => {
    expect(hasOnboardingAnswers({ role_origin: "backfill" })).toBe(true);
  });
});

describe("agentStackMeta", () => {
  it("never says pending over work that is waiting on a person", () => {
    expect(agentStackMeta(facts(), 4)).toBe("4 agents · awaiting onboarding");
    expect(agentStackMeta(facts({ onboardingAnswered: true }), 4)).toBe(
      "4 agents · calibration incomplete — re-run"
    );
    expect(agentStackMeta(facts({ calibrated: true }), 4)).toBe(
      "4 agents · calibrated"
    );
  });

  it("speaks for the upstream agents while they run, and when they fail", () => {
    expect(agentStackMeta(facts({ analysisReady: false }), 4)).toBe(
      "Live analysis in progress"
    );
    expect(
      agentStackMeta(facts({ analysisReady: false, intakeFailed: true }), 4)
    ).toBe("Intake failed — retry to continue");
  });
});

describe("the grid itself", () => {
  // The founder's ruling (§197): CALIBRATE before SPEC, because the spec is
  // generated FROM the weights. Declaration order is rendered order.
  it("orders the tiles by the real dependency", () => {
    expect(AGENT_TILES.map((t) => t.key)).toEqual([
      "intake",
      "company_research",
      "calibration",
      "role_spec",
    ]);
  });

  it("gives every state a label and a pulse answer", () => {
    const states: AgentTileState[] = [
      "idle",
      "active",
      "complete",
      "queued",
      "blocked",
    ];
    for (const s of states) {
      expect(AGENT_TILE_STATE_LABEL[s]).toBeTruthy();
      expect(typeof AGENT_TILE_STATE_PULSES[s]).toBe("boolean");
    }
  });

  it("pulses for `active` and nothing else", () => {
    expect(
      Object.entries(AGENT_TILE_STATE_PULSES)
        .filter(([, pulses]) => pulses)
        .map(([state]) => state)
    ).toEqual(["active"]);
  });
});
