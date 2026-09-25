/**
 * The mandate, restated as the question the Candidate Search Agent
 * already knows how to answer (§200 slice 3).
 *
 * The agent has taken a recruiter's typed sentence since 096. Rather than
 * teach it a second input shape — a second prompt, a second schema, a
 * second thing to drift — the mandate is rendered INTO that sentence.
 * The agent's judgment, its bounds and its trail are untouched.
 *
 * Deliberately built from the CALIBRATION MODEL, not the job spec:
 * calibration is what every other scoring agent in the product reads
 * (§177/§178 made that law), so a suggestion is drawn against the same
 * description of the role as the score that follows it. Drawing from the
 * spec while everything else scores from the calibration is exactly the
 * seam §177 closed.
 *
 * Returns `null` when there is no role to search against. That is a
 * refusal, not an empty string: a query built from an empty calibration
 * would return whoever the model happened to like, presented as a
 * recommendation.
 */
import { type CalibrationModel } from "@/lib/ai/role-analysis";
import { approvedCustomDimensions } from "@/lib/calibration/custom-dimensions";

export function buildPoolQuery(
  calibration: Partial<CalibrationModel> | null | undefined
): string | null {
  if (!calibration) return null;

  const title = calibration.role_title?.trim();
  if (!title) return null;

  const parts: string[] = [
    `Find people in the pool who could be credible candidates for: ${title}.`,
  ];

  const seniority = calibration.role_structure?.seniority?.trim();
  const fn = calibration.role_structure?.function?.trim();
  if (seniority || fn) {
    parts.push(
      `Level and function: ${[seniority, fn].filter(Boolean).join(", ")}.`
    );
  }

  const scope = calibration.inferred_scope?.trim();
  if (scope) parts.push(`Scope of the role: ${scope}`);

  // The weights say what this search actually cares about. Sending the
  // top few keeps the question pointed without turning it into a rubric
  // the retrieval model would try to score against — scoring is the
  // Evaluation Agent's job, and this one is only choosing who to look at.
  const weights = calibration.dimension_weights;
  if (weights) {
    const ranked = Object.entries(weights)
      .filter((e): e is [string, number] => typeof e[1] === "number")
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([dimension]) => dimension.replace(/_/g, " "));
    if (ranked.length > 0) {
      parts.push(`Weighted most heavily on: ${ranked.join(", ")}.`);
    }
  }

  // §196's custom axes, approved ones only — an unapproved dimension
  // scores nothing, and it must not steer retrieval either. The same
  // rule parse-cv applies when it strips them from the prompt context.
  const custom = approvedCustomDimensions(calibration);
  if (custom.length > 0) {
    parts.push(
      `This search also weighs: ${custom
        .map((d) => d.label)
        .join(", ")}.`
    );
  }

  const musts = (calibration.missing_information ?? []).length;
  if (musts > 0) {
    // Honest, and it changes how the reader should read the answer.
    parts.push(
      `Note: this mandate still has unanswered intake questions, so the ` +
        `description above is incomplete.`
    );
  }

  return parts.join(" ");
}
