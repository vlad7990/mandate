import { describe, expect, it } from "vitest";
import { parseHandbookMarkdown, parseInline } from "./markdown";

describe("parseInline", () => {
  it("passes plain text through as one run", () => {
    expect(parseInline("plain words")).toEqual([
      { kind: "text", text: "plain words" },
    ]);
  });

  it("tokenizes strong, em, code, and links in place", () => {
    expect(
      parseInline("a **bold** and *soft* `code` [door](/join) end")
    ).toEqual([
      { kind: "text", text: "a " },
      { kind: "strong", text: "bold" },
      { kind: "text", text: " and " },
      { kind: "em", text: "soft" },
      { kind: "text", text: " " },
      { kind: "code", text: "code" },
      { kind: "text", text: " " },
      { kind: "link", text: "door", href: "/join" },
      { kind: "text", text: " end" },
    ]);
  });

  it("returns empty for empty input", () => {
    expect(parseInline("")).toEqual([]);
  });
});

describe("parseHandbookMarkdown", () => {
  it("lifts the H1 as the section title, not a block", () => {
    const s = parseHandbookMarkdown("s", "# The Door\n\nBody here.");
    expect(s.title).toBe("The Door");
    expect(s.blocks).toEqual([
      { kind: "paragraph", inline: [{ kind: "text", text: "Body here." }] },
    ]);
  });

  it("falls back to the slug when no H1 exists", () => {
    expect(parseHandbookMarkdown("requesting-access", "Just prose.").title).toBe(
      "requesting-access"
    );
  });

  it("joins wrapped lines into one paragraph", () => {
    const s = parseHandbookMarkdown("s", "one line\nwrapped onto two.");
    expect(s.blocks).toHaveLength(1);
    expect(s.blocks[0]).toMatchObject({ kind: "paragraph" });
  });

  it("separates paragraphs on blank lines", () => {
    const s = parseHandbookMarkdown("s", "first.\n\nsecond.");
    expect(s.blocks).toHaveLength(2);
  });

  it("parses H2 and H3 as heading blocks", () => {
    const s = parseHandbookMarkdown("s", "## Two\n\n### Three");
    expect(s.blocks).toEqual([
      { kind: "heading", level: 2, text: "Two" },
      { kind: "heading", level: 3, text: "Three" },
    ]);
  });

  it("collects contiguous bullets into one list", () => {
    const s = parseHandbookMarkdown("s", "- a\n- b\n\n- c");
    expect(s.blocks).toHaveLength(2);
    expect(s.blocks[0]).toMatchObject({ kind: "list", ordered: false });
    expect(
      (s.blocks[0] as { items: unknown[] }).items
    ).toHaveLength(2);
  });

  it("keeps numbered lists ordered and separate from bullets", () => {
    const s = parseHandbookMarkdown("s", "1. one\n2. two\n- bullet");
    expect(s.blocks).toEqual([
      {
        kind: "list",
        ordered: true,
        items: [
          [{ kind: "text", text: "one" }],
          [{ kind: "text", text: "two" }],
        ],
      },
      {
        kind: "list",
        ordered: false,
        items: [[{ kind: "text", text: "bullet" }]],
      },
    ]);
  });

  it("ends an open list at a paragraph", () => {
    const s = parseHandbookMarkdown("s", "- a\nprose after");
    expect(s.blocks[0]).toMatchObject({ kind: "list" });
    expect(s.blocks[1]).toMatchObject({ kind: "paragraph" });
  });

  it("parses inline marks inside list items", () => {
    const s = parseHandbookMarkdown("s", "- go to [join](/join)");
    expect(s.blocks[0]).toEqual({
      kind: "list",
      ordered: false,
      items: [
        [
          { kind: "text", text: "go to " },
          { kind: "link", text: "join", href: "/join" },
        ],
      ],
    });
  });
});
