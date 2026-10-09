import type { MetadataRoute } from "next";

/**
 * `/sitemap.xml` — the public marketing surface, and nothing else.
 *
 * Like `/robots.txt`, this path used to 307 to sign-in (see `robots.ts`).
 *
 * ## The list is explicit, for the same reason the proxy's is
 *
 * `proxy.ts` says it keeps `PUBLIC_PAGES` hand-written rather than derived
 * from the nav because it is an authentication boundary that should be
 * readable in one place. This list is the same decision for the same
 * reason, one layer out: a sitemap is a public declaration of what exists,
 * so it should be something a person chose, not something a glob produced.
 *
 * **If you add a marketing route, add it here and to `PUBLIC_PAGES`.** A
 * route missing from the proxy list is invisible (it redirects to
 * sign-in); a route missing from here is merely undiscovered. Both are
 * quiet, which is why they are worth stating twice.
 *
 * ## Deliberately absent
 *
 * - `/legal/*` — unreviewed drafts. `robots.ts` explains why indexing them
 *   would be a liability.
 * - `/status` — operational, not content. It should be reachable and is
 *   (it is on the proxy's public list); it does not need to rank.
 * - `/auth/*` — a sign-in form is not a landing page.
 * - Every token door — the credential is in the URL.
 *
 * `lastModified` is intentionally omitted rather than stamped with
 * `new Date()`. A build-time timestamp would tell crawlers every page
 * changed on every deploy, which is false and trains them to ignore the
 * field. Absent is more honest than wrong.
 */

const PUBLIC_MARKETING_ROUTES = [
  { path: "/", priority: 1.0, changeFrequency: "weekly" as const },
  { path: "/platform", priority: 0.9, changeFrequency: "monthly" as const },
  { path: "/solutions", priority: 0.8, changeFrequency: "monthly" as const },
  { path: "/pricing", priority: 0.8, changeFrequency: "monthly" as const },
  {
    path: "/executive-intelligence",
    priority: 0.7,
    changeFrequency: "monthly" as const,
  },
  { path: "/handbook", priority: 0.6, changeFrequency: "monthly" as const },
  // The conversion page. Lower priority than the content it follows,
  // but it is the point of the funnel, so it belongs here.
  { path: "/request-access", priority: 0.5, changeFrequency: "yearly" as const },
];

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_MARKETING_ROUTES.map((r) => ({
    url: `https://getmandate.io${r.path}`,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }));
}
