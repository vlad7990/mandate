import fs from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import { SiteNav } from "../_components/site-nav";
import { SiteFooter } from "../_components/site-footer";
import { PageHero, PageCta } from "../_components/page-hero";
import {
  parseHandbookMarkdown,
  type HandbookBlock,
  type HandbookInline,
  type HandbookSection,
} from "@/lib/handbook/markdown";

export const dynamic = "force-static";

const TITLE = "Handbook";
const DESCRIPTION =
  "How a Mandate engagement works, start to finish — requesting access, joining, running a search, sharing with a hiring manager, and what the agents do and never do.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/handbook" },
  openGraph: {
    title: `${TITLE} · Mandate`,
    description: DESCRIPTION,
    url: "/handbook",
    siteName: "Mandate",
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: `${TITLE} · Mandate` }],
  },
  twitter: {
    card: "summary_large_image",
    title: `${TITLE} · Mandate`,
    description: DESCRIPTION,
    images: ["/og.png"],
  },
};

/**
 * The handbook (§137 D2). Authored as markdown in docs/handbook/ — the
 * repo stays the source of truth, this route serves it — and rendered
 * statically at build time. Docs law (D3): the handbook describes the
 * product AS BUILT, and every agent description carries the no-verdict
 * sentence. Public deliberately: a prospect should be able to read the
 * whole journey before requesting access.
 */
function loadSections(): HandbookSection[] {
  const dir = path.join(process.cwd(), "docs", "handbook");
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((file) => {
      const slug = file.replace(/^\d+-/, "").replace(/\.md$/, "");
      return parseHandbookMarkdown(
        slug,
        fs.readFileSync(path.join(dir, file), "utf8")
      );
    });
}

export default function HandbookPage() {
  const sections = loadSections();

  return (
    <>
      <SiteNav />
      <main id="main">
        <PageHero
          label="Handbook"
          heading={
            <>
              The whole journey, <em>written down.</em>
            </>
          }
          lede="How Mandate works from the first access request to a running search — every step as it is built today, nothing promised. Read it before you ask for a seat."
          actions={[
            { href: "/request-access", label: "Request access", primary: true },
            { href: "/#simulator", label: "Run the live simulator" },
          ]}
        />

        <section className="m-section m-section--gap-tight-top">
          <div className="m-container">
            <div className="m-handbook">
              <nav className="m-handbook__index" aria-label="Handbook contents">
                {sections.map((s, i) => (
                  <a
                    key={s.slug}
                    href={`#${s.slug}`}
                    className="m-handbook__index-link"
                  >
                    <span className="m-handbook__index-num" aria-hidden>
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    {s.title}
                  </a>
                ))}
              </nav>

              {sections.map((s) => (
                <section
                  key={s.slug}
                  id={s.slug}
                  className="m-handbook__section"
                  aria-labelledby={`${s.slug}-title`}
                >
                  <h2 id={`${s.slug}-title`} className="m-handbook__title">
                    {s.title}
                  </h2>
                  {s.blocks.map((b, i) => (
                    <Block key={i} block={b} />
                  ))}
                </section>
              ))}
            </div>
          </div>
        </section>

        <PageCta
          heading={<>Read it all? Ask for a seat.</>}
          body="Access requests are reviewed by a person, and approval arrives as a single-use invitation link — the handbook's first two chapters, in practice."
          action={{ href: "/request-access", label: "Request access" }}
        />
      </main>
      <SiteFooter />
    </>
  );
}

function Block({ block }: { block: HandbookBlock }) {
  if (block.kind === "heading") {
    return block.level === 2 ? (
      <h3>{block.text}</h3>
    ) : (
      <h4>{block.text}</h4>
    );
  }
  if (block.kind === "list") {
    const items = block.items.map((item, i) => (
      <li key={i}>
        <Inline runs={item} />
      </li>
    ));
    return block.ordered ? <ol>{items}</ol> : <ul>{items}</ul>;
  }
  return (
    <p>
      <Inline runs={block.inline} />
    </p>
  );
}

function Inline({ runs }: { runs: HandbookInline[] }) {
  return (
    <>
      {runs.map((run, i) => {
        switch (run.kind) {
          case "strong":
            return <strong key={i}>{run.text}</strong>;
          case "em":
            return <em key={i}>{run.text}</em>;
          case "code":
            return <code key={i}>{run.text}</code>;
          case "link":
            return (
              <a key={i} href={run.href}>
                {run.text}
              </a>
            );
          default:
            return <span key={i}>{run.text}</span>;
        }
      })}
    </>
  );
}
