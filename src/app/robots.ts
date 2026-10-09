import type { MetadataRoute } from "next";

/**
 * `/robots.txt`.
 *
 * ## Why this file exists
 *
 * It did not, and the consequence was not "no robots.txt" — it was worse
 * than that. `src/proxy.ts` redirects anything not on its public list to
 * sign-in, so `GET /robots.txt` answered **307 → /auth/signin?next=%2Frobots.txt**
 * and a crawler asking the standard question got a login page. Same for
 * `/sitemap.xml`. Found by a Lighthouse run on 2026-10-09, which reported
 * `robots.txt is not valid` because what came back was HTML.
 *
 * Both paths are now on the proxy's always-public list, next to
 * `/api/health`, for the same reason: they are machine endpoints that must
 * answer before any notion of a session exists.
 *
 * ## What is disallowed, and why each one
 *
 * The private application trees (`/app`, `/ops`, `/portal`) are behind auth
 * anyway — listing them is belt-and-braces, and it keeps them out of a
 * crawler's queue rather than relying on the redirect.
 *
 * **The token doors are the ones that matter.** `/hm`, `/invite`,
 * `/candidate`, `/join` and `/apply` carry the credential IN THE URL — that
 * is their whole trust model (see `proxy.ts`). A crawled URL can end up in
 * an index, a referrer header, or a toolbar's telemetry, so these must never
 * be fetched by a bot. Disallowing them is not an SEO preference; it is part
 * of keeping a share link a share link.
 *
 * `/legal` is excluded deliberately. Every document there renders a
 * placeholder saying it is unreviewed and must not be relied on
 * (`legal/_registry.ts` — no document has a `reviewed` block, and the build
 * fails if one is published without one). An indexed draft privacy policy
 * is a liability, not a page. Add `/legal` to the sitemap when counsel has
 * signed off, and not before.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/app/",
          "/ops/",
          "/portal/",
          "/api/",
          "/auth/",
          // Credential-in-URL doors. Never crawl these.
          "/hm/",
          "/invite/",
          "/candidate/",
          "/join/",
          "/apply/",
          // Unreviewed drafts — see the note above.
          "/legal/",
        ],
      },
    ],
    sitemap: "https://getmandate.io/sitemap.xml",
    host: "https://getmandate.io",
  };
}
