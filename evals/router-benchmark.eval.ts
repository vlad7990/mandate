/**
 * The slice-3 benchmark matrix (gate 03bafc3, Part E) — real seam
 * functions, real fixtures from the live mandates, the ruled model
 * matrix. Runs ONLY via `npm run eval` with a live key; skips
 * honestly otherwise. parse_cv waits on founder CV files in
 * evals/fixtures/cvs/ (surfaced once, not nagged).
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, describe, it } from "vitest";
import {
  BASELINE,
  ECONOMY_MATRIX,
  EVAL_ON,
  SKIP_REASON,
  STANDARD_MATRIX,
  bench,
  writeResults,
} from "./helpers";
import {
  generateAllSourcingQueries,
  type GenerationContext,
} from "@/lib/ai/generate-sourcing";
import {
  runTargetCompanies,
  type RunTargetCompaniesInput,
} from "@/lib/ai/run-target-companies";
import {
  runSearchHealth,
  type SearchHealthInput,
} from "@/lib/ai/run-search-health";
import {
  generateRelationshipJudgment,
  type RelationshipInput,
} from "@/lib/ai/run-relationship";
import {
  generateCandidateEvaluation,
  type EvaluationInput,
} from "@/lib/ai/generate-evaluation";
import { parseCv, PDF_MIME, DOCX_MIME } from "@/lib/ai/parse-cv";

const FIX = (name: string) =>
  JSON.parse(
    readFileSync(path.join(process.cwd(), "evals", "fixtures", name), "utf8")
  ) as Array<{ name: string; [k: string]: unknown }>;

const d = describe.skipIf(!EVAL_ON);

if (!EVAL_ON) {
  // One honest line instead of a wall of silent skips.
  console.log(`[evals] skipped — ${SKIP_REASON}`);
}

d("router benchmark — economy tier", () => {
  it("generate_sourcing", { timeout: 600_000 }, async () => {
    for (const fx of FIX("generate-sourcing.json")) {
      for (const mv of ECONOMY_MATRIX) {
        await bench({
          capability: "generate_sourcing",
          fixture: fx.name,
          mv,
          run: () =>
            generateAllSourcingQueries(fx.context as GenerationContext),
          assess: (r) => {
            const q = r as Record<string, string>;
            const slots = Object.entries(q);
            if (slots.length < 6) return `only ${slots.length} slots`;
            const empty = slots.filter(([, v]) => !v || v.trim().length < 10);
            return empty.length
              ? `empty/thin slots: ${empty.map(([k]) => k).join(",")}`
              : null;
          },
          judge: {
            task: "Generate six sourcing query strings (4 LinkedIn boolean variants, 1 Google X-Ray, 1 ATS) for the role and calibration provided. Queries must be executable boolean strings targeting the calibrated bar.",
          },
        });
      }
    }
  });

  it("run_target_companies", { timeout: 600_000 }, async () => {
    for (const fx of FIX("run-target-companies.json")) {
      for (const mv of ECONOMY_MATRIX) {
        await bench({
          capability: "run_target_companies",
          fixture: fx.name,
          mv,
          run: () =>
            runTargetCompanies(fx.input as RunTargetCompaniesInput, {
              projectId: "00000000-0000-0000-0000-000000000000",
              organizationId: null,
            }),
          assess: (r) => {
            const rep = r as { thesis?: string; companies?: unknown[] };
            if (!rep.thesis || !rep.thesis.trim()) return "no thesis";
            if (!Array.isArray(rep.companies) || rep.companies.length < 8)
              return `companies: ${rep.companies?.length ?? 0} (< 8)`;
            return null;
          },
          judge: {
            task: "Produce a target-company sourcing report (thesis + 12-20 named feeder companies) for the given role/calibration. Companies must be real, relevant to the domain, and non-duplicative.",
          },
        });
      }
    }
  });

  it("run_search_health", { timeout: 600_000 }, async () => {
    for (const fx of FIX("run-search-health.json")) {
      for (const mv of ECONOMY_MATRIX) {
        await bench({
          capability: "run_search_health",
          fixture: fx.name,
          mv,
          run: () =>
            runSearchHealth(fx.input as SearchHealthInput, {
              projectId: "00000000-0000-0000-0000-000000000000",
              organizationId: null,
            }),
          assess: (r) => {
            const blob = r as { summary?: string; suggestions?: unknown[] };
            if (!blob.summary?.trim()) return "no summary";
            const n = blob.suggestions?.length ?? 0;
            return n >= 3 && n <= 5 ? null : `suggestions: ${n} (want 3-5)`;
          },
          judge: {
            task: "Given a stalled/at-risk search state, produce a 1-2 sentence summary and 3-5 concrete suggestions (boolean edits, calibration nudges, feedback follow-ups), each anchored on a concrete signal from the provided state — never invented data.",
          },
        });
      }
    }
  });

  it("run_relationship", { timeout: 600_000 }, async () => {
    for (const fx of FIX("run-relationship.json")) {
      for (const mv of ECONOMY_MATRIX) {
        await bench({
          capability: "run_relationship",
          fixture: fx.name,
          mv,
          run: () =>
            generateRelationshipJudgment(fx.input as RelationshipInput),
          assess: (r) => {
            const j = r as {
              relationship_state?: string;
              disposition?: unknown;
            };
            if (!j.relationship_state) return "no relationship_state";
            if (!j.disposition) return "no disposition";
            return null;
          },
          judge: {
            task: "Given a network profile with its contact history, judge the relationship state, disposition, and whether/when a follow-up is owed. With empty history, the honest judgment is conservative — no invented contact.",
          },
        });
      }
    }
  });

  it("parse_cv (waits on founder CV files)", { timeout: 600_000 }, async () => {
    const cvDir = path.join(process.cwd(), "evals", "fixtures", "cvs");
    const files = readdirSync(cvDir).filter((f) =>
      /\.(pdf|docx)$/i.test(f)
    );
    if (files.length === 0) {
      console.log(
        "[evals] parse_cv: no CV files in evals/fixtures/cvs/ — row stays empty (founder-only material, gate Part B.4)."
      );
      return;
    }
    const roleCtx = FIX("generate-evaluation.json")[0].input as {
      role: { calibration: object; company: object };
    };
    for (const file of files) {
      const bytes = new Uint8Array(readFileSync(path.join(cvDir, file)));
      const mime = file.toLowerCase().endsWith(".pdf") ? PDF_MIME : DOCX_MIME;
      for (const mv of ECONOMY_MATRIX) {
        await bench({
          capability: "parse_cv",
          fixture: file,
          mv,
          run: () =>
            parseCv(bytes, mime, {
              calibration: roleCtx.role.calibration,
              company: roleCtx.role.company,
            }),
          assess: (r) => {
            const p = r as { full_name?: string; roles?: unknown[] };
            return p && typeof p === "object" && Object.keys(p).length > 3
              ? null
              : "profile too thin";
          },
          judge: {
            task: "Parse the CV into the structured candidate profile (roles, domain, scale, tech, archetypes) against the role context. Fields must come from the document, never invented.",
          },
        });
      }
    }
  });
});

d("router benchmark — standard representative", () => {
  it("generate_evaluation", { timeout: 600_000 }, async () => {
    for (const fx of FIX("generate-evaluation.json")) {
      for (const mv of STANDARD_MATRIX) {
        await bench({
          capability: "generate_evaluation",
          fixture: fx.name,
          mv,
          run: () =>
            generateCandidateEvaluation(fx.input as EvaluationInput),
          assess: (r) => {
            const ev = r as {
              scoring_table?: unknown[];
              profile_summary?: unknown;
            };
            if (!Array.isArray(ev.scoring_table) || ev.scoring_table.length < 3)
              return `scoring_table: ${ev.scoring_table?.length ?? 0}`;
            if (!ev.profile_summary) return "no profile_summary";
            return null;
          },
          judge: {
            task: "Produce the executive evaluation report (dimension scoring table, profile summary, alignment test, strengths) for the candidate against the calibrated role. Scores must be justified from the CV content; gaps must be stated, not papered over.",
          },
        });
      }
    }
  });
});

afterAll(() => {
  if (EVAL_ON) writeResults(`Benchmark run ${new Date().toISOString()}`);
});

// Reference so the baseline constant is visibly part of the matrix
// even when everything is skipped.
void BASELINE;
