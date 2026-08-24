/**
 * The D3 rule of the HM override selector (NEXT-hm-override.md): the
 * action receives a stakeholder name ONLY when the recruiter's
 * selection differs from the default (the first stakeholder), so the
 * trail's `stakeholder_override: true` keeps meaning "the recruiter
 * chose" — the default run keeps the false face §49's drive recorded.
 *
 * Matching mirrors the seam's own resolution (trimmed,
 * case-insensitive; `run-hiring-manager-research.ts`). A selection
 * that is not on the list is passed through untouched — validation is
 * the server's, which refuses unknown names by sentence.
 *
 * In its own module without `server-only` so the harness reaches it.
 */
export function overrideFor(
  selected: string | null | undefined,
  stakeholders: Array<{ name: string }>
): string | undefined {
  const chosen = selected?.trim();
  if (!chosen) return undefined;
  const first = stakeholders[0]?.name.trim();
  if (!first) return undefined;
  if (chosen.toLowerCase() === first.toLowerCase()) return undefined;
  return chosen;
}
