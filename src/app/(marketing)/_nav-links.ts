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
  | "intelligence"
  | "solutions"
  | "pricing";

export type NavLink = {
  readonly key: NavKey | "simulator";
  readonly href: string;
  readonly label: string;
};

export const NAV_LINKS: readonly NavLink[] = [
  { key: "platform", href: "/platform", label: "Platform" },
  // NOT `/executive-intelligence`. That path is the authenticated
  // Executive Intelligence workspace — `(dashboard)/executive-intelligence`
  // with searches, success profiles, interview plans, assessments and a
  // competency library beneath it. Next resolves route groups to the
  // same URL space, so a marketing page there is a hard build error, and
  // relocating a live product area to free up a marketing URL is the
  // wrong trade. The label still reads "Executive Intelligence".
  {
    key: "intelligence",
    href: "/intelligence",
    label: "Executive Intelligence",
  },
  { key: "solutions", href: "/solutions", label: "Solutions" },
  { key: "pricing", href: "/pricing", label: "Pricing" },
  // The simulator is the only thing on the site a visitor can operate,
  // so it stays one click away from every page. It is a section of the
  // homepage rather than a route, hence the absolute path + hash.
  { key: "simulator", href: "/#simulator", label: "Live demo" },
];
