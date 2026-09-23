import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * EVERY JSON schema this app sends to Anthropic must use only the
 * keywords Anthropic's structured-output subset supports.
 *
 * This guard exists because the subset is NARROWER than JSON Schema and
 * a violation is invisible to everything else we run. `maxItems` on an
 * array is rejected with:
 *
 *   400 invalid_request_error
 *   "output_config.format.schema: For 'array' type, property 'maxItems'
 *    is not supported"
 *
 * — a rejection of the WHOLE REQUEST. The capability does not degrade,
 * it stops working. tsc passes, vitest passes, next build passes,
 * because none of them sends a schema to the API.
 *
 * It has now happened twice. `candidate-evaluation.ts` documented the
 * constraint in a comment in 2026; §196 then shipped `maxItems` in
 * CALIBRATION_WEIGHTS_SCHEMA anyway and broke `derive_calibration`
 * outright in production — every onboarding submission failed to
 * calibrate until drive 128 found it. The same sweep found
 * COVERAGE_ANALYSIS_SCHEMA carrying it too, pre-existing and never
 * caught. A comment is not a guard.
 *
 * Deliberately a SOURCE-TEXT scan rather than an object walk. Half of
 * these modules carry `server-only`, several build their schema through
 * helper functions, and one (`buildCandidateProfileSchema`) is assembled
 * per call — importing them all to walk the objects would test less and
 * break more. What we need to catch is a forbidden keyword being TYPED
 * into a schema file, and that is exactly what the text shows.
 * [[source-text-guards]] applies: it is paired with the probe below.
 */

const ROOT = path.resolve(__dirname, "../../..");
const AI_DIR = path.join(ROOT, "src/lib/ai");

/**
 * Keywords Anthropic's structured-output subset rejects. Each one has
 * been confirmed against the live API, not inferred from the docs.
 */
const FORBIDDEN = [
  "maxItems",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "uniqueItems",
  "patternProperties",
  "oneOf",
  "allOf",
  "not",
];

/**
 * `minItems` is the one that is only PARTIALLY unsupported: 0 and 1 are
 * accepted, anything higher is not. Flagged separately so the message
 * can say which case is in front of you.
 */
const MIN_ITEMS = /minItems:\s*(\d+)/g;

/** Comments out, so the prose documenting these rules is not a hit. */
function code(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/**
 * The text of every `*_SCHEMA = { … }` literal in a file, brace-matched.
 *
 * Scanning whole FILES was the first draft and it cried wolf twice:
 * `job-spec-analysis.ts` has a section-descriptor type with its own
 * `minItems`/`maxItems` fields that never go near the API, and
 * `executive-risk-synthesis-agent.ts` has a property that matched `not`.
 * A guard that fires on innocent code gets deleted, so it has to look
 * exactly where schemas are and nowhere else.
 */
function schemaBodies(src: string): string[] {
  const body = code(src);
  const out: string[] = [];
  const decl = /\b\w*_SCHEMA\b[^=]*=\s*\{/g;
  for (const m of body.matchAll(decl)) {
    let depth = 0;
    const start = m.index + m[0].length - 1;
    for (let i = start; i < body.length; i++) {
      if (body[i] === "{") depth++;
      else if (body[i] === "}") {
        depth--;
        if (depth === 0) {
          out.push(body.slice(start, i + 1));
          break;
        }
      }
    }
  }
  return out;
}

function schemaFiles(): Array<{ name: string; bodies: string[] }> {
  return fs
    .readdirSync(AI_DIR)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
    .map((f) => ({
      name: f,
      bodies: schemaBodies(fs.readFileSync(path.join(AI_DIR, f), "utf8")),
    }))
    .filter((f) => f.bodies.length > 0);
}

describe("Anthropic structured-output schema keywords", () => {
  const files = schemaFiles();

  it("finds the schema modules (the scan is not vacuous)", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it("no schema uses a keyword the API rejects", () => {
    const offenders: string[] = [];
    for (const f of files) {
      for (const body of f.bodies) {
        for (const kw of FORBIDDEN) {
          // As an object KEY — `maxItems:` — not a mention in a string.
          const re = new RegExp(`(^|[{,\\s])${kw}\\s*:`, "m");
          if (re.test(body)) offenders.push(`${f.name} → ${kw}`);
        }
      }
    }
    expect(
      offenders,
      `These keywords are rejected by Anthropic with a 400 on the whole ` +
        `request, so the capability stops working entirely:\n` +
        offenders.join("\n") +
        `\nEnforce the bound in the system prompt and in code instead.`
    ).toEqual([]);
  });

  it("no schema uses minItems above 1", () => {
    const offenders: string[] = [];
    for (const f of files) {
      for (const body of f.bodies) {
        for (const m of body.matchAll(MIN_ITEMS)) {
          if (Number(m[1]) > 1) offenders.push(`${f.name} → minItems: ${m[1]}`);
        }
      }
    }
    expect(
      offenders,
      `Anthropic accepts minItems of 0 or 1 only:\n${offenders.join("\n")}`
    ).toEqual([]);
  });
});
