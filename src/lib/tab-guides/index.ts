/**
 * TAB GUIDES (§198) — "what am I supposed to do on this screen?"
 *
 * The pure layer: which guide belongs to which tab, and which tabs a
 * reader has already opened. No filesystem, no React — the loader
 * (`server.ts`) and the panel both build on this, and it is unit-testable
 * on its own.
 *
 * The keying rule is the whole design. A guide is named for its nav
 * href with `/app/` dropped and the remaining slashes hyphenated, so
 * `/app/candidates/network` is `candidates-network.md`. That makes
 * `NAV` the single source of truth for the SET of guides as well as the
 * rail — and the standing lesson is that a single source of truth only
 * ends drift BELOW it, so `tab-guides.test.ts` watches the seam above:
 * a tab without words, or words without a tab, fails the build.
 *
 * Deliberately NOT derived from the filesystem at runtime. The slug list
 * comes from `NAV`; the files answer to it.
 */
import {
  NAV,
  isNavItemActive,
  navFor,
  type NavItem,
} from "@/components/dashboard/nav-model";
import { type Role } from "@/lib/auth/roles";

/**
 * Which tabs this reader has opened the guide for. One cookie, client-set,
 * so the unread dot survives a reload without a table behind it.
 */
export const TAB_GUIDES_SEEN_COOKIE = "mandate_tab_guides_seen";

/**
 * The four headings every guide carries, in order. The third one is the
 * reason this list is enforced rather than encouraged: a guide that
 * oversells its screen is §175's defect class wearing a friendlier face,
 * and "what this screen will not do" is the section most likely to be
 * dropped under time pressure.
 */
export const TAB_GUIDE_SECTIONS = [
  "What you do here",
  "What done looks like",
  "What this screen will not do",
  "Where this leads",
] as const;

export function guideSlugForHref(href: string): string {
  return href.replace(/^\/app\/?/, "").replace(/\//g, "-") || "home";
}

/** Every slug the nav model demands a guide for, in rail order. */
export const TAB_GUIDE_SLUGS: readonly string[] = NAV.map((item) =>
  guideSlugForHref(item.href)
);

export type TabGuideTarget = {
  slug: string;
  /** The tab's own label, so the panel names the screen you are on. */
  label: string;
  href: string;
};

/**
 * The guide for the screen this reader is standing on, or null.
 *
 * Role-filtered through `navFor` for one reason: a tab the rail hides is
 * a tab this person cannot reach, and offering its guide would describe
 * work they cannot do. Anything outside the nav model — a mandate's
 * inner pages, a candidate profile — returns null rather than guessing,
 * because D4 scoped this to the 19 tabs.
 */
export function tabGuideFor(
  pathname: string,
  role: Role | null | undefined
): TabGuideTarget | null {
  const item: NavItem | undefined = navFor(role).find((i) =>
    isNavItemActive(i, pathname)
  );
  if (!item) return null;
  return {
    slug: guideSlugForHref(item.href),
    label: item.label,
    href: item.href,
  };
}

export function parseSeenGuides(cookieValue: string | undefined | null): Set<string> {
  if (!cookieValue) return new Set();
  return new Set(
    cookieValue
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
  );
}

/**
 * The cookie value after `slug` has been read.
 *
 * Sorted and deduplicated so the same set of read guides always produces
 * the same string — an unstable value would rewrite the cookie on every
 * open. Unknown slugs are dropped, so a renamed tab cannot leave a stale
 * entry wedged in the cookie forever.
 */
export function withSeenGuide(
  cookieValue: string | undefined | null,
  slug: string
): string {
  const seen = parseSeenGuides(cookieValue);
  seen.add(slug);
  return [...seen]
    .filter((s) => TAB_GUIDE_SLUGS.includes(s))
    .sort()
    .join(",");
}
