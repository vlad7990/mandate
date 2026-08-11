/**
 * Sample-mode plumbing.
 *
 * A screen shows the sample workspace when it has nothing real to show
 * and the user has not dismissed it. Once a recruiter has their own
 * mandates, the sample never appears again on that screen — a live
 * account must never mix invented rows with real ones.
 */

export * from "./data";

/** Cookie that records dismissal. Read on the server, set on the client. */
export const SAMPLE_DISMISSED_COOKIE = "mandate_sample_dismissed";

/**
 * Whether an id belongs to the sample workspace.
 *
 * This is the whole routing contract: `/app/projects/sample-larkspur`
 * serves the fixture, anything else queries Supabase. Safe because a
 * uuid never has letters before its first hyphen — so a real project id
 * cannot be mistaken for a sample one, and a crafted `sample-` id
 * cannot reach a database query.
 */
export function isSampleId(id: string | null | undefined): boolean {
  return typeof id === "string" && id.startsWith("sample-");
}

/**
 * Should this screen render the sample?
 *
 * Both conditions matter. `hasRealData` alone would keep showing the
 * sample to someone who deliberately dismissed it; `dismissed` alone
 * would show it over the top of a working account.
 */
export function shouldShowSample({
  hasRealData,
  dismissed,
}: {
  hasRealData: boolean;
  dismissed: boolean;
}): boolean {
  return !hasRealData && !dismissed;
}
