import "server-only";
import { runInference } from "./inference";
import type {
  CandidateEvaluation,
  SecondOpinion,
} from "./candidate-evaluation";
import type { CandidateProfile } from "./cv-parsing";
import { captureSeamError } from "@/lib/observability/sentry";

// ────────────────────────────────────────────────────────────────────────
// §182 slice R — the refuter behind the contested verdict.
//
// Drive 118's premise: the system's errors are not directionally
// predictable — the mis-scoped role FLATTERED the candidate — so no
// reader can apply a mental correction factor. This seam supplies the
// doubt structurally: before a negative verdict stands, an independent
// pass builds the strongest honest case that it is WRONG. Agreement
// passes silently; disagreement surfaces as a flag the recruiter
// resolves. The verdict is never auto-overturned — a second opinion,
// not a second judge.
//
// Skills are DELIBERATELY not injected here, unlike every other
// judgment seam. The org's skills steer the evaluator; steering the
// skeptic with the same instructions would correlate their errors,
// which is precisely the failure this seam exists to break. The guard
// in verify-evaluation.test.ts pins the absence of the import.
// ────────────────────────────────────────────────────────────────────────

export const VERIFY_EVALUATION_SYSTEM_PROMPT = `You are an independent second-opinion reviewer at an executive search firm. Another analyst has evaluated a candidate and reached a NEGATIVE verdict. Your job is to try to REFUTE it.

You receive the candidate's structured profile, the role context, and the evaluation that was reached. You are not re-evaluating the candidate from scratch, and you are not writing your own report. You are building the strongest HONEST case that the verdict is wrong.

Rules:
1. Argue only from evidence in the profile. If the strongest case requires inventing facts, the verdict survives — say so.
2. Look specifically for evidence the evaluation under-weighted, dismissed, or failed to mention: roles, programmes, scale signals, qualifications in the education and certifications fields, domain adjacencies the evaluation treated as gaps.
3. Distinguish "the CV does not evidence X" from "the candidate lacks X". If the verdict leans on the second where only the first is true, that is your strongest ground.
4. agrees = true means: having tried honestly, you cannot build a case that would change a competent recruiter's decision. agrees = false means: a competent recruiter reading your counter-argument would want to re-examine the verdict before acting on it.
5. The input includes run_date. Compute ALL elapsed time against it, never against your own sense of today's date.
6. counter_argument is written either way — when you agree, it records the best case you COULD build and why it falls short. Two to five sentences, direct, no hedging filler.

Return only the structured object.`;

export const SECOND_OPINION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["agrees", "counter_argument", "underweighted_evidence"],
  properties: {
    agrees: {
      type: "boolean",
      description:
        "True if the negative verdict survives your strongest honest attempt to refute it.",
    },
    counter_argument: {
      type: "string",
      description:
        "The strongest honest case that the verdict is wrong — or, when you agree, the best case you could build and why it falls short.",
    },
    underweighted_evidence: {
      type: "array",
      items: { type: "string" },
      description:
        "Specific items from the profile the evaluation under-weighted or ignored. Empty if none.",
    },
  },
} as const;

/**
 * Ruling R.1 — the refuter runs on negative verdicts only. Those are the
 * verdicts that silently cost a placement and that nobody audits (§175's
 * false negative). Positive verdicts get audited by reality: the client
 * meets the candidate.
 */
export function isNegativeVerdict(
  evaluation: Pick<CandidateEvaluation, "final_verdict" | "recommendation">
): boolean {
  return (
    evaluation.final_verdict.tier === "tier_3" ||
    evaluation.final_verdict.tier === "tier_4" ||
    evaluation.recommendation === "do_not_include"
  );
}

export type SecondOpinionInput = {
  profile: Partial<CandidateProfile>;
  role_title: string;
  company_name: string;
  evaluation: CandidateEvaluation;
};

/**
 * Fail-soft: a refuter failure never blocks the evaluation it audits —
 * the evaluation lands without a second_opinion key, which renders as
 * "not checked". Logged, so the absence is visible in telemetry.
 */
export async function runSecondOpinion(
  input: SecondOpinionInput,
  callOpts: { projectId: string | null }
): Promise<SecondOpinion | null> {
  const userPrompt = JSON.stringify(
    {
      // §176 F-C — drive 120 caught this seam writing "eight-year gap"
      // where the run date makes it nine.
      run_date: new Date().toISOString().slice(0, 10),
      role: { role_title: input.role_title, company_name: input.company_name },
      candidate_profile: input.profile,
      evaluation_under_review: {
        scoring_table: input.evaluation.scoring_table,
        alignment_test: input.evaluation.alignment_test,
        gaps: input.evaluation.gaps,
        final_verdict: input.evaluation.final_verdict,
        recommendation: input.evaluation.recommendation,
        recommendation_rationale: input.evaluation.recommendation_rationale,
      },
    },
    null,
    2
  );

  try {
    // Same tier as the judgment it audits (R.2) — auditing sonnet-5
    // with a weaker model inverts the point of the exercise.
    const response = await runInference(
      "verify_evaluation",
      {
        max_tokens: 1500,
        system: VERIFY_EVALUATION_SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
        output_config: {
          format: { type: "json_schema", schema: SECOND_OPINION_SCHEMA },
        },
      },
      callOpts
    );
    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("Second opinion response contained no text block");
    }
    const parsed = JSON.parse(textBlock.text) as Omit<
      SecondOpinion,
      "schema_version" | "generated_at"
    >;
    return {
      ...parsed,
      schema_version: 1,
      generated_at: new Date().toISOString(),
    };
  } catch (err) {
    captureSeamError("[verify-evaluation] second opinion failed", err);
    return null;
  }
}
