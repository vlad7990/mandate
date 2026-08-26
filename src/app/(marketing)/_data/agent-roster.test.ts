import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { AGENTS } from "./agents";

/**
 * The marketing roster may not drift from the platform's.
 *
 * §169 exists because it did. `_data/agents.ts` listed seventeen agents
 * while `src/lib/agents/session.ts` signed in twenty-five, and the two
 * disagreed by NAME as well as count — five marketed agents were not
 * platform principals at all, and twelve live ones had never been
 * mentioned. Nothing failed, because nothing compared them: every count
 * on the marketing site derives from `AGENTS.length`, so the hero rail,
 * the meta description, the OG card and the Platform phase map were
 * mutually consistent and all wrong.
 *
 * `_constants.ts` had already solved this INSIDE marketing. The same
 * class of error simply moved one level up, to the boundary nothing
 * watched. This is that watch.
 *
 * The gate's D1(b) ruling: the names and the one-line outputs stay
 * marketing's own — a client should read "Pre-Screen", not `prescreen`
 * — but the SET is the platform's. Adding an agent to session.ts now
 * forces a decision here: describe it, or say in NOT_MARKETED why not.
 */

const SESSION_FILE = path.resolve(
  __dirname,
  "../../../lib/agents/session.ts"
);

/**
 * Platform agents deliberately absent from the marketing roster, each
 * with the reason. An empty object is the honest state today; this
 * exists so that "we chose not to market it" is recorded as a decision
 * rather than looking identical to "we forgot".
 */
const NOT_MARKETED: Record<string, string> = {};

/** Every `kind:` literal in the agent sign-in module. */
function platformKinds(): string[] {
  const src = fs.readFileSync(SESSION_FILE, "utf8");
  const found = [...src.matchAll(/^\s*kind:\s*"([a-z_]+)"/gm)].map((m) => m[1]);
  return [...new Set(found)].sort();
}

describe("the marketed roster and the platform roster", () => {
  it("reads a non-trivial platform roster (the regex still matches)", () => {
    // A guard that silently matches nothing would pass forever. If the
    // shape of session.ts changes, this is what says so.
    expect(platformKinds().length).toBeGreaterThan(20);
  });

  it("markets every platform agent, or records why not", () => {
    const marketed = new Set(AGENTS.map((a) => a.kind));
    const unaccounted = platformKinds().filter(
      (k) => !marketed.has(k) && !(k in NOT_MARKETED)
    );
    expect(
      unaccounted,
      `The platform runs agents the site never mentions: ${unaccounted.join(", ")}. ` +
        "Describe them in _data/agents.ts, or add them to NOT_MARKETED with a reason."
    ).toEqual([]);
  });

  it("markets nothing the platform does not run", () => {
    const kinds = new Set(platformKinds());
    const phantom = AGENTS.map((a) => a.kind).filter((k) => !kinds.has(k));
    expect(
      phantom,
      `The site advertises agents that do not exist: ${phantom.join(", ")}. ` +
        "This is the failure mode that shipped for weeks — a roster nobody could run."
    ).toEqual([]);
  });

  it("describes each platform agent exactly once", () => {
    const seen = new Map<string, number>();
    for (const a of AGENTS) seen.set(a.kind, (seen.get(a.kind) ?? 0) + 1);
    const duplicated = [...seen.entries()].filter(([, n]) => n > 1).map(([k]) => k);
    expect(duplicated, `Described twice: ${duplicated.join(", ")}`).toEqual([]);
  });

  it("gives every marketed agent a name and an output line", () => {
    for (const a of AGENTS) {
      expect(a.name.trim().length, `${a.kind} has no name`).toBeGreaterThan(0);
      expect(a.output.trim().length, `${a.kind} has no output line`).toBeGreaterThan(0);
    }
  });
});
