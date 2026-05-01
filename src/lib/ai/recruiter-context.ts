// Shared helper that prepends recruiter-supplied context to an
// agent's base system prompt. Used by run-psychology, run-company-
// culture, and any future "regenerate with context" flow.
//
// The recruiter context lives in the same prompt so the agent treats
// it as authoritative. We frame it as INFORMED PRIOR knowledge (not
// instructions) so the model still grounds every reading in CV /
// company evidence — it shouldn't rubber-stamp the recruiter's
// claim if the underlying data contradicts it.

export function wrapWithRecruiterContext(
  basePrompt: string,
  recruiterContext: string | undefined | null
): string {
  const trimmed = recruiterContext?.trim() ?? "";
  if (trimmed.length === 0) return basePrompt;
  return `${basePrompt.trimEnd()}

---

<recruiter_context>
The recruiter who knows this case has supplied the following observations. Treat them as informed prior knowledge: weight them when calibrating your readings, but every value you emit must still be grounded in the underlying evidence (CV, evaluation, feedback rows, company context). If the evidence contradicts the recruiter's claim, surface the gap explicitly in the relevant evidence string — do not rubber-stamp.

${trimmed}
</recruiter_context>`;
}
