// The handbook's markdown, as a pure rule (§137 D2).
//
// The handbook is authored as markdown in docs/handbook/ — the repo stays
// the source of truth and the product serves it. Rather than take a
// rendering dependency for a surface this small, the subset the handbook
// actually uses is parsed here, where it is unit-testable: one H1 per file
// (the section title), H2/H3, paragraphs, flat bulleted and numbered
// lists, and inline strong / emphasis / code / links. Anything outside
// the subset renders as plain paragraph text rather than silently
// disappearing.

export type HandbookInline =
  | { kind: "text"; text: string }
  | { kind: "strong"; text: string }
  | { kind: "em"; text: string }
  | { kind: "code"; text: string }
  | { kind: "link"; text: string; href: string };

export type HandbookBlock =
  | { kind: "heading"; level: 2 | 3; text: string }
  | { kind: "paragraph"; inline: HandbookInline[] }
  | { kind: "list"; ordered: boolean; items: HandbookInline[][] };

export type HandbookSection = {
  slug: string;
  title: string;
  blocks: HandbookBlock[];
};

const INLINE_PATTERN =
  /(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(`([^`]+)`)|(\[([^\]]+)\]\(([^)]+)\))/g;

export function parseInline(text: string): HandbookInline[] {
  const out: HandbookInline[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE_PATTERN)) {
    const index = m.index ?? 0;
    if (index > last) {
      out.push({ kind: "text", text: text.slice(last, index) });
    }
    if (m[2] !== undefined) {
      out.push({ kind: "strong", text: m[2] });
    } else if (m[4] !== undefined) {
      out.push({ kind: "em", text: m[4] });
    } else if (m[6] !== undefined) {
      out.push({ kind: "code", text: m[6] });
    } else if (m[8] !== undefined) {
      out.push({ kind: "link", text: m[8], href: m[9] });
    }
    last = index + m[0].length;
  }
  if (last < text.length) {
    out.push({ kind: "text", text: text.slice(last) });
  }
  return out;
}

export function parseHandbookMarkdown(
  slug: string,
  markdown: string
): HandbookSection {
  const lines = markdown.split(/\r?\n/);
  let title = slug;
  const blocks: HandbookBlock[] = [];

  let paragraph: string[] = [];
  let list: { ordered: boolean; items: HandbookInline[][] } | null = null;

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push({
        kind: "paragraph",
        inline: parseInline(paragraph.join(" ")),
      });
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list) {
      blocks.push({ kind: "list", ordered: list.ordered, items: list.items });
      list = null;
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const trimmed = line.trim();

    if (trimmed === "") {
      flushParagraph();
      flushList();
      continue;
    }

    const h1 = /^#\s+(.*)$/.exec(trimmed);
    if (h1) {
      flushParagraph();
      flushList();
      title = h1[1].trim();
      continue;
    }
    const h2 = /^##\s+(.*)$/.exec(trimmed);
    if (h2) {
      flushParagraph();
      flushList();
      blocks.push({ kind: "heading", level: 2, text: h2[1].trim() });
      continue;
    }
    const h3 = /^###\s+(.*)$/.exec(trimmed);
    if (h3) {
      flushParagraph();
      flushList();
      blocks.push({ kind: "heading", level: 3, text: h3[1].trim() });
      continue;
    }

    const bullet = /^[-*]\s+(.*)$/.exec(trimmed);
    const numbered = /^\d+[.)]\s+(.*)$/.exec(trimmed);
    if (bullet || numbered) {
      flushParagraph();
      const ordered = Boolean(numbered);
      const item = (bullet ?? numbered)![1];
      if (!list || list.ordered !== ordered) {
        flushList();
        list = { ordered, items: [] };
      }
      list.items.push(parseInline(item));
      continue;
    }

    flushList();
    paragraph.push(trimmed);
  }

  flushParagraph();
  flushList();

  return { slug, title, blocks };
}
