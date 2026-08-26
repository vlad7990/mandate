/**
 * Eval harness helpers (LLM router slice 3, gate 03bafc3).
 *
 * Paid calls live behind TWO conditions: MANDATE_EVAL=1 AND a live
 * ANTHROPIC_API_KEY. `npm test` never runs these files (vitest's
 * default include is src/**); `npm run eval` runs them with the flag
 * set. Absent the key, every eval skips with an honest message.
 *
 * Results are collected in memory and written to
 * evals/results/<date>.md by the eval file's afterAll — eval
 * telemetry never lands in the production inference_runs table (the
 * seam records to __evalRecordedRuns behind the fence instead).
 */
import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { getAnthropic } from "@/lib/anthropic";
import {
  __evalRecordedRuns,
  __setEvalOverrides,
} from "@/lib/ai/inference";

export const EVAL_ON =
  process.env.MANDATE_EVAL === "1" && !!process.env.ANTHROPIC_API_KEY;

export const SKIP_REASON =
  process.env.MANDATE_EVAL !== "1"
    ? "MANDATE_EVAL is not set — run via `npm run eval`."
    : "ANTHROPIC_API_KEY is absent — evals spend real API calls and refuse to fake it.";

export type ModelVariant = {
  model: string;
  variant: string;
  thinkingOverride?: { type: "adaptive" | "disabled" };
};

/** The ruled matrix (gate Part E): baseline, Sonnet 5 both ways,
 * Haiku for the economy tier only. */
export const BASELINE: ModelVariant = {
  model: "claude-sonnet-4-6",
  variant: "baseline",
};
export const SONNET5_OFF: ModelVariant = {
  model: "claude-sonnet-5",
  variant: "thinking-off",
  thinkingOverride: { type: "disabled" },
};
export const SONNET5_ADAPTIVE: ModelVariant = {
  model: "claude-sonnet-5",
  variant: "adaptive",
};
export const HAIKU: ModelVariant = {
  model: "claude-haiku-4-5",
  variant: "no-thinking",
};
export const ECONOMY_MATRIX = [BASELINE, SONNET5_OFF, SONNET5_ADAPTIVE, HAIKU];
export const STANDARD_MATRIX = [BASELINE, SONNET5_OFF, SONNET5_ADAPTIVE];

export type BenchRow = {
  capability: string;
  fixture: string;
  model: string;
  variant: string;
  ok: boolean;
  /** Deterministic failure description (thrown error or failed assertion). */
  fail: string | null;
  rubric: number | null;
  rubricNote: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number | null;
};

export const RESULTS: BenchRow[] = [];

/**
 * Run one (capability × fixture × model-variant) cell: set the
 * fenced override, call the real seam function, read honest
 * tokens/latency from the seam's own recorded runs, grade
 * deterministically, then (on success) ask the judge.
 */
export async function bench(opts: {
  capability: string;
  fixture: string;
  mv: ModelVariant;
  run: () => Promise<unknown>;
  /** Deterministic grader — return a failure description or null. */
  assess: (result: unknown) => string | null;
  /** Rubric grader inputs; omitted = deterministic-only. */
  judge?: { task: string };
}): Promise<void> {
  const before = __evalRecordedRuns.length;
  __setEvalOverrides({
    modelOverride: opts.mv.model,
    thinkingOverride: opts.mv.thinkingOverride,
  });

  let result: unknown = null;
  let fail: string | null = null;
  try {
    result = await opts.run();
    fail = opts.assess(result);
  } catch (err) {
    fail = `threw: ${err instanceof Error ? err.message : String(err)}`;
  } finally {
    __setEvalOverrides(null);
  }

  const runs = __evalRecordedRuns.slice(before);
  const sum = (k: "input_tokens" | "output_tokens") =>
    runs.length ? runs.reduce((n, r) => n + (r[k] ?? 0), 0) : null;

  let rubric: number | null = null;
  let rubricNote: string | null = null;
  if (!fail && opts.judge && result !== null) {
    try {
      const j = await judgeResult(opts.judge.task, result);
      rubric = j.score;
      rubricNote = j.reason;
    } catch (err) {
      rubricNote = `judge failed: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  RESULTS.push({
    capability: opts.capability,
    fixture: opts.fixture,
    model: opts.mv.model,
    variant: opts.mv.variant,
    ok: !fail,
    fail,
    rubric,
    rubricNote,
    inputTokens: sum("input_tokens"),
    outputTokens: sum("output_tokens"),
    latencyMs: runs.length
      ? runs.reduce((n, r) => n + (r.latency_ms ?? 0), 0)
      : null,
  });
}

/** Rubric grader — Sonnet 4.6 as judge this slice (gate Part C),
 * called directly against the SDK so no capability slug is spent. */
async function judgeResult(
  task: string,
  result: unknown
): Promise<{ score: number; reason: string }> {
  const anthropic = getAnthropic();
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 300,
    system:
      "You are grading another model's structured output for an executive-search product. Score instruction adherence and usefulness 1-5 (5 = a recruiter could act on this without edits; 1 = unusable or off-instruction). Be strict about invented facts.",
    messages: [
      {
        role: "user",
        content: `TASK THE MODEL WAS GIVEN:\n${task}\n\nMODEL OUTPUT (JSON):\n${JSON.stringify(result).slice(0, 12000)}`,
      },
    ],
    output_config: {
      format: {
        type: "json_schema",
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["score", "reason"],
          properties: {
            score: { type: "integer" },
            reason: { type: "string" },
          },
        },
      },
    },
  });
  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") throw new Error("judge returned no text");
  return JSON.parse(text.text) as { score: number; reason: string };
}

/** Write the collected rows as a markdown section. */
export function writeResults(section: string): void {
  const dir = path.join(process.cwd(), "evals", "results");
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "2026-08-25.md");
  const lines = [
    `\n## ${section}\n`,
    "| capability | fixture | model | variant | ok | rubric | in | out | ms | failure |",
    "|---|---|---|---|---|---|---|---|---|---|",
    ...RESULTS.map(
      (r) =>
        `| ${r.capability} | ${r.fixture} | ${r.model} | ${r.variant} | ${r.ok ? "✓" : "✗"} | ${r.rubric ?? "—"} | ${r.inputTokens ?? "—"} | ${r.outputTokens ?? "—"} | ${r.latencyMs ?? "—"} | ${r.fail ?? r.rubricNote ?? ""} |`
    ),
  ];
  appendFileSync(file, lines.join("\n") + "\n");
}
