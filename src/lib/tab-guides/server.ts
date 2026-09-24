import fs from "node:fs";
import path from "node:path";
import {
  parseHandbookMarkdown,
  type HandbookSection,
} from "@/lib/handbook/markdown";
import { NAV } from "@/components/dashboard/nav-model";
import { guideSlugForHref, TAB_GUIDE_SLUGS } from "./index";

/**
 * Reading the guides off disk (§198). Server only — `docs/tab-guides/`
 * is the source of truth and the product serves it, exactly as
 * `/handbook` already serves `docs/handbook/`. No new parser: the
 * handbook's tested subset is the one the guides are written in.
 */

const DIR = path.join(process.cwd(), "docs", "tab-guides");

/**
 * A guide by slug, or null.
 *
 * The slug is checked against `TAB_GUIDE_SLUGS` — a closed list derived
 * from the nav model — BEFORE it touches a path. That is the whole
 * defence against a crafted `../../.env`: no sanitising, no normalising,
 * just a membership test against names this product minted itself.
 */
export function loadTabGuide(slug: string): HandbookSection | null {
  if (!TAB_GUIDE_SLUGS.includes(slug)) return null;
  const file = path.join(DIR, `${slug}.md`);
  if (!fs.existsSync(file)) return null;
  return parseHandbookMarkdown(slug, fs.readFileSync(file, "utf8"));
}

/**
 * Every guide, in RAIL order rather than alphabetical — the handbook
 * section reads as the product's own shape that way, Workspace first.
 * A missing file is skipped rather than thrown: the guard test is what
 * makes a missing file a build failure, and a public page should not
 * 500 because a doc was deleted.
 */
export function loadAllTabGuides(): HandbookSection[] {
  const out: HandbookSection[] = [];
  for (const item of NAV) {
    const section = loadTabGuide(guideSlugForHref(item.href));
    if (section) out.push(section);
  }
  return out;
}
