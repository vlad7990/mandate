/**
 * Sample-mode plumbing.
 *
 * A screen shows the sample workspace when it has nothing real to show
 * and the user has not dismissed it. Once a recruiter has their own
 * mandates, the sample never appears again on that screen — a live
 * account must never mix invented rows with real ones.
 *
 * ## How fabricated data is labelled — decided 2026-08-17, D3
 *
 * **Page level, two markers, and no per-row marker.** A screen in sample
 * mode carries `SampleBanner` as the first element in its content region,
 * and `// sample data` in its own subtitle or meta line. Nothing else.
 *
 * The alternative considered and rejected was a `SAMPLE` chip on every
 * fabricated row. It survives a cropped screenshot, which the banner does
 * not — but it costs a column on tables that are already tight at 360px,
 * repeats the same word up to twenty times a screen, and would have to be
 * invented separately by each of the twelve routes that still need sample
 * data. One mechanism that five screens already ship beats a second one
 * argued per page.
 *
 * The rule this satisfies is that illustrative data carries a visible
 * label at the point of display. The banner is *at* the display: it is the
 * first thing in the content region, so a screen reader meets it before
 * the invented figures rather than after, and it is not dismissible
 * without also dismissing the sample itself.
 *
 * **Do not invent a third mechanism.** If a screen seems to need one, the
 * question is whether it should be showing a sample at all.
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
