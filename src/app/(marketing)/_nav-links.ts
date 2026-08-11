/**
 * The marketing surface's primary navigation, in one place.
 *
 * Why this file exists: the desktop nav, the mobile disclosure panel
 * and the footer previously each carried their own hand-typed copy of
 * the destination list, and they had already drifted — the desktop row
 * had four links, the mobile panel five, and the footer pointed at an
 * anchor (`#executive-intelligence`) the desktop row did not offer.
 * Three lists, three answers to "what is this product made of".
 *
 * These are real routes, not in-page anchors. Until the four pages
 * existed the nav pointed at homepage sections; `#pricing` then
 * collided with `/pricing`. The homepage keeps its sections and its
 * ids — the nav simply stopped being the thing that addressed them.
 */

export type NavKey =
  | "home"
  | "platform"
  | "executive-intelligence"
  | "solutions"
  | "pricing";

export type NavLink = {
  readonly key: NavKey | "simulator";
  readonly href: string;
  readonly label: string;
};

export const NAV_LINKS: readonly NavLink[] = [
  { key: "platform", href: "/platform", label: "Platform" },
  // This path was briefly `/intelligence`, because the authenticated
  // Executive Intelligence workspace occupied `/executive-intelligence`
  // and route groups share one URL space. The whole dashboard has since
  // moved behind `/app`, so marketing owns the plain noun again.
  {
    key: "executive-intelligence",
    href: "/executive-intelligence",
    label: "Executive Intelligence",
  },
  { key: "solutions", href: "/solutions", label: "Solutions" },
  { key: "pricing", href: "/pricing", label: "Pricing" },
  // The simulator is the only thing on the site a visitor can operate,
  // so it stays one click away from every page. It is a section of the
  // homepage rather than a route, hence the absolute path + hash.
  { key: "simulator", href: "/#simulator", label: "Live demo" },
];
