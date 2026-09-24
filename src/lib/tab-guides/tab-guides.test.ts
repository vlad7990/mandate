import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { NAV, navFor } from "@/components/dashboard/nav-model";
import { parseHandbookMarkdown } from "@/lib/handbook/markdown";
import {
  TAB_GUIDES_SEEN_COOKIE,
  TAB_GUIDE_SECTIONS,
  TAB_GUIDE_SLUGS,
  guideSlugForHref,
  parseSeenGuides,
  tabGuideFor,
  withSeenGuide,
} from "./index";

/**
 * §198's guard. `nav-model.ts` is a single source of truth, and the
 * standing lesson is that one only ends drift BELOW it — here the seam
 * above is the WORDS. Add a tab without a guide, or leave a guide behind
 * after deleting a tab, and this fails.
 *
 * It asserts behaviour rather than source text: the files are parsed
 * with the same parser the product serves them through, so a guide that
 * passes here is a guide that renders.
 */

const DIR = path.join(process.cwd(), "docs", "tab-guides");

function readGuide(slug: string) {
  return parseHandbookMarkdown(
    slug,
    fs.readFileSync(path.join(DIR, `${slug}.md`), "utf8")
  );
}

describe("every tab has words", () => {
  it("maps each nav item to a guide file", () => {
    for (const item of NAV) {
      const slug = guideSlugForHref(item.href);
      expect(
        fs.existsSync(path.join(DIR, `${slug}.md`)),
        `${item.label} (${item.href}) has no docs/tab-guides/${slug}.md`
      ).toBe(true);
    }
  });

  it("leaves no orphaned guide behind a deleted tab", () => {
    const onDisk = fs
      .readdirSync(DIR)
      .filter((f) => f.endsWith(".md"))
      .map((f) => f.replace(/\.md$/, ""));
    for (const slug of onDisk) {
      expect(
        TAB_GUIDE_SLUGS.includes(slug),
        `docs/tab-guides/${slug}.md belongs to no nav item`
      ).toBe(true);
    }
    // Both directions, so the pair can never be satisfied by an empty set.
    expect(onDisk.length).toBe(NAV.length);
  });
});

describe("every guide keeps the shape", () => {
  it("parses, and carries a title and a lede", () => {
    for (const slug of TAB_GUIDE_SLUGS) {
      const guide = readGuide(slug);
      expect(guide.title, `${slug} has no H1`).not.toBe(slug);
      const first = guide.blocks[0];
      expect(first?.kind, `${slug} does not open with a sentence`).toBe(
        "paragraph"
      );
    }
  });

  it("carries all four sections, in order", () => {
    for (const slug of TAB_GUIDE_SLUGS) {
      const headings = readGuide(slug)
        .blocks.filter((b) => b.kind === "heading")
        .map((b) => (b.kind === "heading" ? b.text : ""));
      expect(headings, `${slug} is missing a section`).toEqual([
        ...TAB_GUIDE_SECTIONS,
      ]);
    }
  });

  it("says something under every section", () => {
    for (const slug of TAB_GUIDE_SLUGS) {
      const blocks = readGuide(slug).blocks;
      blocks.forEach((b, i) => {
        if (b.kind !== "heading") return;
        const next = blocks[i + 1];
        expect(
          next && next.kind !== "heading",
          `${slug} has an empty "${b.text}"`
        ).toBe(true);
      });
    }
  });
});

describe("guideSlugForHref", () => {
  it("keys a guide off its href", () => {
    expect(guideSlugForHref("/app/home")).toBe("home");
    expect(guideSlugForHref("/app/candidates/network")).toBe("candidates-network");
    expect(guideSlugForHref("/app/placements/invoices")).toBe("placements-invoices");
    expect(guideSlugForHref("/app/settings/members")).toBe("settings-members");
  });
});

describe("tabGuideFor", () => {
  it("finds the guide for the tab you are standing on", () => {
    expect(tabGuideFor("/app/activity", "recruiter")?.slug).toBe("activity");
    // matchPrefix tabs answer for their children.
    expect(tabGuideFor("/app/analytics/anything", "recruiter")?.slug).toBe(
      "analytics"
    );
    // Mandates owns the project tree.
    expect(tabGuideFor("/app/projects/abc-123", "recruiter")?.slug).toBe(
      "projects"
    );
  });

  it("offers no guide for a tab this role cannot reach", () => {
    // Members is org:manage — an admin's tab, and the rail hides it from
    // a recruiter, so describing it would describe work they cannot do.
    expect(tabGuideFor("/app/settings/members", "admin")?.slug).toBe(
      "settings-members"
    );
    expect(tabGuideFor("/app/settings/members", "recruiter")).toBeNull();
    expect(navFor("recruiter").some((i) => i.href === "/app/settings/members")).toBe(
      false
    );
  });

  it("stays silent off the nav model — D4's scope, not an omission", () => {
    expect(tabGuideFor("/app/projects/abc/candidates/def", "recruiter")).toBeTruthy();
    expect(tabGuideFor("/ops/waitlist", "admin")).toBeNull();
    expect(tabGuideFor("/portal/invoices", "client_admin")).toBeNull();
  });
});

describe("the unread dot's memory", () => {
  it("starts empty and tolerates junk", () => {
    expect(parseSeenGuides(undefined).size).toBe(0);
    expect(parseSeenGuides("").size).toBe(0);
    expect(parseSeenGuides(" , ,").size).toBe(0);
    expect([...parseSeenGuides("home, activity")].sort()).toEqual([
      "activity",
      "home",
    ]);
  });

  it("is stable, so opening a read guide does not rewrite the cookie", () => {
    const once = withSeenGuide("", "home");
    expect(withSeenGuide(once, "home")).toBe(once);
    expect(withSeenGuide("activity,home", "home")).toBe(
      withSeenGuide("home,activity", "home")
    );
  });

  it("drops a slug no tab owns any more", () => {
    expect(withSeenGuide("a-deleted-tab,home", "activity")).toBe(
      "activity,home"
    );
  });

  it("names its cookie once", () => {
    expect(TAB_GUIDES_SEEN_COOKIE).toBe("mandate_tab_guides_seen");
  });
});
