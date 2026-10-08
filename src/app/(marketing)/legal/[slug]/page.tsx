import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteNav } from "../../_components/site-nav";
import { SiteFooter } from "../../_components/site-footer";
import {
  LEGAL_DOCUMENTS,
  isPublished,
  legalDocument,
  type LegalDocument,
} from "../_registry";

export const dynamic = "force-static";

/**
 * One legal document.
 *
 * The route exists; the content does not. Every document in the
 * registry is an unreviewed draft, so every one of these pages renders
 * the placeholder below rather than any legal text. That is the point:
 * when counsel signs off, publishing is adding `body` and `review` to
 * the registry, with the page, the metadata, the navigation and the
 * gate already built and tested.
 *
 * ## Why a placeholder rather than a 404
 *
 * A 404 says the page does not exist. The honest answer is that the
 * document exists, is not finished, and nobody may rely on it — and a
 * visitor looking for terms before signing something deserves to be
 * told that plainly rather than be left guessing whether they missed a
 * link. The placeholder carries no legal text of any kind.
 */

export function generateStaticParams() {
  return LEGAL_DOCUMENTS.map((d) => ({ slug: d.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const doc = legalDocument(slug);
  if (!doc) return {};

  const live = isPublished(doc);
  return {
    title: doc.title,
    description: doc.summary,
    alternates: { canonical: `/legal/${doc.slug}` },
    // An unpublished document must not be indexed. A search result
    // pointing at a placeholder that says "not yet published" is a
    // worse answer than no search result.
    robots: live ? undefined : { index: false, follow: false },
    openGraph: {
      title: `${doc.title} · Mandate`,
      description: doc.summary,
      url: `/legal/${doc.slug}`,
      siteName: "Mandate",
      type: "article",
    },
  };
}

function Placeholder({ doc }: { doc: LegalDocument }) {
  return (
    <div className="m-legal__pending">
      <p className="m-legal__pending-label">Not yet published</p>
      <p className="m-legal__pending-body">
        This document is drafted but has not been reviewed by a qualified
        lawyer, so it is not published and nothing may be relied on it.
      </p>
      {doc.blockedBy && (
        <p className="m-legal__pending-body">{doc.blockedBy}</p>
      )}
      <p className="m-legal__pending-body">
        If you need these terms before they are published, ask us directly at{" "}
        <a className="m-legal__link" href="mailto:hello@getmandate.io">
          hello@getmandate.io
        </a>{" "}
        and you will get a straight answer about what exists today.
      </p>
    </div>
  );
}

export default async function LegalPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const doc = legalDocument(slug);
  if (!doc) notFound();

  const live = isPublished(doc);

  return (
    <>
      <SiteNav />
      <main className="m-legal" id="main">
        <header className="m-legal__head">
          <p className="m-legal__eyebrow">Legal</p>
          <h1 className="m-legal__title">{doc.title}</h1>
          <p className="m-legal__summary">{doc.summary}</p>
          {live && (
            <p className="m-legal__meta">
              Reviewed {doc.review!.reviewedAt} · {doc.review!.reviewedBy}
            </p>
          )}
        </header>

        {live ? (
          // Published bodies are authored markdown held in the registry.
          // Rendering is deliberately deferred until there is something
          // to render: picking a renderer now would be designing around
          // text nobody has written or approved.
          <article className="m-legal__body">{doc.body}</article>
        ) : (
          <Placeholder doc={doc} />
        )}
      </main>
      <SiteFooter />
    </>
  );
}
