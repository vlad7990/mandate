"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  comparisonToEmail,
  comparisonToHtml,
  comparisonToMarkdown,
  type ComparisonContext,
  type ComparisonRow,
  type DimensionWeights,
  type MarketInsight,
} from "@/lib/comparison/comparison-export";

type Props = {
  rows: ComparisonRow[];
  weights: DimensionWeights | null;
  insight: MarketInsight;
  context: ComparisonContext;
};

export function ComparisonExportActions(props: Props) {
  const [emailOpen, setEmailOpen] = useState(false);
  const [pdfPending, startPdf] = useTransition();

  const handleDownloadMarkdown = () => {
    try {
      const md = comparisonToMarkdown(props);
      downloadBlob(md, "text/markdown;charset=utf-8", buildFilename(props.context, "md"));
      toast.success("Markdown downloaded");
    } catch (err) {
      console.error("[comparison] markdown export failed:", err);
      toast.error("Could not export markdown.");
    }
  };

  const handleDownloadHtml = () => {
    try {
      const html = comparisonToHtml(props);
      downloadBlob(html, "text/html;charset=utf-8", buildFilename(props.context, "html"));
      toast.success("HTML downloaded — open in browser to print");
    } catch (err) {
      console.error("[comparison] html export failed:", err);
      toast.error("Could not export HTML.");
    }
  };

  const handleDownloadPdf = () => {
    if (pdfPending) return;
    startPdf(async () => {
      try {
        const [{ pdf }, { ComparisonPdfDocument }] = await Promise.all([
          import("@react-pdf/renderer"),
          import("@/lib/pdf/comparison-document"),
        ]);
        const blob = await pdf(
          <ComparisonPdfDocument
            rows={props.rows}
            weights={props.weights}
            insight={props.insight}
            context={props.context}
          />
        ).toBlob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = buildFilename(props.context, "pdf");
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        toast.success("PDF downloaded");
      } catch (err) {
        console.error("[comparison] pdf export failed:", err);
        toast.error("Could not export PDF.");
      }
    });
  };

  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={handleDownloadMarkdown}
          className="px-3 py-1.5 border border-outline-variant text-on-surface-variant font-mono-label text-mono-label uppercase tracking-widest hover:border-primary hover:text-primary transition-colors flex items-center gap-1.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <span className="material-symbols-outlined text-[14px]" aria-hidden>
            description
          </span>
          Download Markdown
        </button>
        <button
          type="button"
          onClick={handleDownloadHtml}
          className="px-3 py-1.5 border border-outline-variant text-on-surface-variant font-mono-label text-mono-label uppercase tracking-widest hover:border-primary hover:text-primary transition-colors flex items-center gap-1.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <span className="material-symbols-outlined text-[14px]" aria-hidden>
            print
          </span>
          Download HTML
        </button>
        <button
          type="button"
          onClick={handleDownloadPdf}
          disabled={pdfPending}
          aria-busy={pdfPending ? true : undefined}
          className="px-3 py-1.5 border border-outline-variant text-on-surface-variant font-mono-label text-mono-label uppercase tracking-widest hover:border-primary hover:text-primary transition-colors flex items-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <span
            className={cn(
              "material-symbols-outlined text-[14px]",
              pdfPending && "animate-spin"
            )}
            aria-hidden
          >
            {pdfPending ? "progress_activity" : "picture_as_pdf"}
          </span>
          {pdfPending ? "Building" : "Download PDF"}
        </button>
        <button
          type="button"
          onClick={() => setEmailOpen(true)}
          className="px-3 py-1.5 bg-primary-container text-on-primary-container font-mono-label text-mono-label uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-[filter,transform] flex items-center gap-1.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <span className="material-symbols-outlined text-[14px]" aria-hidden>
            outgoing_mail
          </span>
          Draft Client Email
        </button>
      </div>

      {emailOpen && (
        <EmailDraftDialog {...props} onClose={() => setEmailOpen(false)} />
      )}
    </>
  );
}

function EmailDraftDialog({
  rows,
  insight,
  context,
  onClose,
}: Props & { onClose: () => void }) {
  const draft = comparisonToEmail({ rows, insight, context });
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.body);

  const handleCopySubject = async () => {
    try {
      await navigator.clipboard.writeText(subject);
      toast.success("Subject copied");
    } catch {
      toast.error("Clipboard unavailable.");
    }
  };

  const handleCopyBody = async () => {
    try {
      await navigator.clipboard.writeText(body);
      toast.success("Email body copied");
    } catch {
      toast.error("Clipboard unavailable.");
    }
  };

  const handleCopyAll = async () => {
    try {
      await navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`);
      toast.success("Subject + body copied");
    } catch {
      toast.error("Clipboard unavailable.");
    }
  };

  const handleMailto = () => {
    const url = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = url;
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="comparison-email-title"
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-surface/80 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-2xl bg-surface-container border border-outline-variant max-h-[90vh] flex flex-col overflow-hidden">
        <header className="px-5 py-3 border-b border-outline-variant bg-surface-container-high flex items-center justify-between gap-3">
          <h3
            id="comparison-email-title"
            className="font-mono-label text-mono-label text-primary uppercase tracking-widest flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-[14px]" aria-hidden>
              outgoing_mail
            </span>
            Draft Client Email · Comparative Slate
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close email draft"
            className="w-7 h-7 border border-outline-variant text-outline hover:text-error hover:border-error transition-colors flex items-center justify-center focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-error"
          >
            <span className="material-symbols-outlined text-[14px]" aria-hidden>
              close
            </span>
          </button>
        </header>

        <div className="px-5 py-4 space-y-3 overflow-auto">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="comparison-email-subject"
                className="font-mono-label text-mono-label text-outline uppercase tracking-widest"
              >
                Subject
              </label>
              <button
                type="button"
                onClick={handleCopySubject}
                className="font-mono-label text-mono-label text-primary uppercase tracking-widest hover:brightness-110 transition-colors flex items-center gap-1 focus-visible:outline-none focus-visible:underline focus-visible:underline-offset-2"
              >
                <span
                  className="material-symbols-outlined text-[12px]"
                  aria-hidden
                >
                  content_copy
                </span>
                Copy
              </button>
            </div>
            <input
              id="comparison-email-subject"
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full bg-surface-container-lowest border border-outline-variant px-3 py-2 font-mono-data text-body-main text-on-surface focus:border-primary focus:outline-none transition-colors"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="comparison-email-body"
                className="font-mono-label text-mono-label text-outline uppercase tracking-widest"
              >
                Body
              </label>
              <button
                type="button"
                onClick={handleCopyBody}
                className="font-mono-label text-mono-label text-primary uppercase tracking-widest hover:brightness-110 transition-colors flex items-center gap-1 focus-visible:outline-none focus-visible:underline focus-visible:underline-offset-2"
              >
                <span
                  className="material-symbols-outlined text-[12px]"
                  aria-hidden
                >
                  content_copy
                </span>
                Copy
              </button>
            </div>
            <textarea
              id="comparison-email-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={20}
              className="w-full bg-surface-container-lowest border border-outline-variant px-3 py-2 font-mono-data text-body-main text-on-surface focus:border-primary focus:outline-none transition-colors resize-y leading-relaxed"
            />
          </div>
        </div>

        <footer className="px-5 py-3 border-t border-outline-variant bg-surface-container-low flex items-center justify-between gap-2 flex-wrap">
          <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
            Edit freely before sending — these texts are starter prose.
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyAll}
              className="px-3 py-1.5 border border-outline-variant text-on-surface-variant font-mono-label text-mono-label uppercase tracking-widest hover:border-primary hover:text-primary transition-colors flex items-center gap-1.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <span
                className="material-symbols-outlined text-[14px]"
                aria-hidden
              >
                content_copy
              </span>
              Copy Both
            </button>
            <button
              type="button"
              onClick={handleMailto}
              className="px-3 py-1.5 bg-primary-container text-on-primary-container font-mono-label text-mono-label uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-[filter,transform] flex items-center gap-1.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <span
                className="material-symbols-outlined text-[14px]"
                aria-hidden
              >
                send
              </span>
              Open in Mail
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function downloadBlob(content: string, mime: string, filename: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function buildFilename(ctx: ComparisonContext, ext: string): string {
  const slug = ctx.project_title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const date = ctx.generated_at.slice(0, 10);
  return `comparison-${slug || "project"}-${date}.${ext}`;
}
