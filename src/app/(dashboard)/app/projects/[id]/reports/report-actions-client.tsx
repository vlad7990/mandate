"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { openMailDraft } from "@/lib/mail-draft";
import type { WeeklyReport } from "@/lib/ai/weekly-report-agent";
import {
  weeklyReportToEmail,
  weeklyReportToMarkdown,
} from "@/lib/reports/weekly-report-export";
import { generateWeeklyReportAction } from "./actions";
import {
  IconClose,
  IconCopy,
  IconDocument,
  IconDownload,
  IconMail,
  IconRefresh,
  IconSend,
  IconSpark,
} from "@/components/icons";
import { unwrap } from "@/lib/actions/result";

export function GenerateReportButton({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const handle = () => {
    if (pending) return;
    start(async () => {
      try {
        unwrap(await generateWeeklyReportAction(projectId));
        toast.success("Weekly report generated");
        router.refresh();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Generation failed.";
        toast.error(msg);
      }
    });
  };
  return (
    <button
      type="button"
      onClick={handle}
      disabled={pending}
      aria-busy={pending ? true : undefined}
      className="px-4 py-2 btn-notch bg-primary-container text-on-primary-container font-mono-label text-mono-label uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-[filter,transform] flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      {pending ? (
        <IconRefresh size={14} className="animate-spin" />
      ) : (
        <IconSpark size={14} />
      )}
      {pending ? "Generating" : "Generate Weekly Report"}
    </button>
  );
}

export type ReportExportProps = {
  report: WeeklyReport;
  projectTitle: string;
  companyName: string;
  generatedAt: string;
};

export function ReportExportActions(props: ReportExportProps) {
  const [emailOpen, setEmailOpen] = useState(false);
  const [pdfPending, startPdf] = useTransition();

  const ctx = {
    project_title: props.projectTitle,
    company_name: props.companyName,
    generated_at: props.generatedAt,
  };

  const handleMarkdown = () => {
    try {
      const md = weeklyReportToMarkdown(props.report, ctx);
      downloadBlob(md, "text/markdown;charset=utf-8", buildFilename(ctx, "md"));
      toast.success("Markdown downloaded");
    } catch (err) {
      console.error("[reports] markdown export failed:", err);
      toast.error("Could not export markdown.");
    }
  };

  const handleCopy = async () => {
    try {
      const md = weeklyReportToMarkdown(props.report, ctx);
      await navigator.clipboard.writeText(md);
      toast.success("Markdown copied");
    } catch {
      toast.error("Clipboard unavailable.");
    }
  };

  const handlePdf = () => {
    if (pdfPending) return;
    startPdf(async () => {
      try {
        const [{ pdf }, { WeeklyReportPdfDocument }] = await Promise.all([
          import("@react-pdf/renderer"),
          import("@/lib/pdf/weekly-report-document"),
        ]);
        const blob = await pdf(
          <WeeklyReportPdfDocument
            report={props.report}
            meta={ctx}
          />
        ).toBlob();
        downloadBlob(blob, "application/pdf", buildFilename(ctx, "pdf"));
        toast.success("PDF downloaded");
      } catch (err) {
        console.error("[reports] pdf export failed:", err);
        toast.error("Could not export PDF.");
      }
    });
  };

  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={handleCopy}
          className="px-3 py-1.5 border border-outline-variant text-on-surface-variant font-mono-label text-mono-label uppercase tracking-widest hover:border-primary hover:text-primary transition-colors flex items-center gap-1.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <IconCopy size={14} />
          Copy Markdown
        </button>
        <button
          type="button"
          onClick={handleMarkdown}
          className="px-3 py-1.5 border border-outline-variant text-on-surface-variant font-mono-label text-mono-label uppercase tracking-widest hover:border-primary hover:text-primary transition-colors flex items-center gap-1.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <IconDocument size={14} />
          Download .md
        </button>
        <button
          type="button"
          onClick={handlePdf}
          disabled={pdfPending}
          className="px-3 py-1.5 border border-outline-variant text-on-surface-variant font-mono-label text-mono-label uppercase tracking-widest hover:border-primary hover:text-primary transition-colors flex items-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {pdfPending ? (
            <IconRefresh size={14} className="animate-spin" />
          ) : (
            <IconDownload size={14} />
          )}
          {pdfPending ? "Building" : "Download PDF"}
        </button>
        <button
          type="button"
          onClick={() => setEmailOpen(true)}
          className="px-3 py-1.5 btn-notch bg-primary-container text-on-primary-container font-mono-label text-mono-label uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-[filter,transform] flex items-center gap-1.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <IconMail size={14} />
          Draft Client Email
        </button>
      </div>

      {emailOpen && (
        <EmailDraftDialog
          {...props}
          ctx={ctx}
          onClose={() => setEmailOpen(false)}
        />
      )}
    </>
  );
}

function EmailDraftDialog({
  report,
  ctx,
  onClose,
}: ReportExportProps & {
  ctx: { project_title: string; company_name: string; generated_at: string };
  onClose: () => void;
}) {
  const draft = weeklyReportToEmail(report, ctx);
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.body);

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Clipboard unavailable.");
    }
  };
  const mailto = async () => {
    const outcome = await openMailDraft({ subject, body });
    if (outcome === "opened_body_on_clipboard") {
      toast.success("Draft too long for a mail link — body copied, paste it into the email.");
    } else if (outcome === "too_long_clipboard_unavailable") {
      toast.error("Draft too long for a mail link and the clipboard is unavailable — use Copy instead.");
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-email-title"
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-surface/80 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-2xl bg-surface-container border border-outline-variant max-h-[90vh] flex flex-col overflow-hidden">
        <header className="px-5 py-3 border-b border-outline-variant bg-surface-container-high flex items-center justify-between gap-3">
          <h3
            id="report-email-title"
            className="font-mono-label text-mono-label text-primary uppercase tracking-widest flex items-center gap-2"
          >
            <IconMail size={14} />
            Draft Client Email · Weekly Report
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-7 h-7 border border-outline-variant text-outline hover:text-error hover:border-error transition-colors flex items-center justify-center focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-error"
          >
            <IconClose size={14} />
          </button>
        </header>
        <div className="px-5 py-4 space-y-3 overflow-auto">
          <label className="block space-y-1">
            <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
              Subject
            </span>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full bg-surface-container-lowest border border-outline-variant px-3 py-2 font-mono-data text-body-main text-on-surface focus:border-primary focus:outline-none transition-colors"
            />
          </label>
          <label className="block space-y-1">
            <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
              Body
            </span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={20}
              className="w-full bg-surface-container-lowest border border-outline-variant px-3 py-2 font-mono-data text-body-main text-on-surface focus:border-primary focus:outline-none transition-colors resize-y leading-relaxed"
            />
          </label>
        </div>
        <footer className="px-5 py-3 border-t border-outline-variant bg-surface-container-low flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => copy(`Subject: ${subject}\n\n${body}`, "Subject + body")}
            className="px-3 py-1.5 border border-outline-variant text-on-surface-variant font-mono-label text-mono-label uppercase tracking-widest hover:border-primary hover:text-primary transition-colors flex items-center gap-1.5"
          >
            <IconCopy size={14} />
            Copy Both
          </button>
          <button
            type="button"
            onClick={mailto}
            className="px-3 py-1.5 btn-notch bg-primary-container text-on-primary-container font-mono-label text-mono-label uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-[filter,transform] flex items-center gap-1.5"
          >
            <IconSend size={14} />
            Open in Mail
          </button>
        </footer>
      </div>
    </div>
  );
}

function downloadBlob(content: string | Blob, mime: string, filename: string) {
  const blob =
    content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function buildFilename(
  ctx: { project_title: string; generated_at: string },
  ext: string
): string {
  const slug = ctx.project_title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `weekly-report-${slug || "project"}-${ctx.generated_at.slice(0, 10)}.${ext}`;
}
