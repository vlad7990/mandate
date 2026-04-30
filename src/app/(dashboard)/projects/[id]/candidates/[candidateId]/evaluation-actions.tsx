"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { type CandidateEvaluation } from "@/lib/ai/candidate-evaluation";
import {
  evaluationToEmailDraft,
  evaluationToMarkdown,
} from "@/lib/ai/evaluation-export";
import { regenerateEvaluationAction } from "./actions";

type Props = {
  evaluation: CandidateEvaluation;
  candidateId: string;
  candidateName: string;
  projectId: string;
};

export function EvaluationActions({
  evaluation,
  candidateId,
  candidateName,
  projectId,
}: Props) {
  const router = useRouter();
  const [emailDraftOpen, setEmailDraftOpen] = useState(false);
  const [regenPending, startRegen] = useTransition();

  const handleDownload = () => {
    try {
      const md = evaluationToMarkdown(evaluation, {
        candidate_name: candidateName,
        candidate_title: null,
        candidate_company: null,
      });
      const filename = buildFilename(candidateName, evaluation, "md");
      const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
      triggerDownload(blob, filename);
      toast.success("Report downloaded");
    } catch (err) {
      console.error("[evaluation] download failed:", err);
      toast.error("Could not download report.");
    }
  };

  const [pdfPending, startPdf] = useTransition();
  const handleDownloadPdf = () => {
    if (pdfPending) return;
    startPdf(async () => {
      try {
        // PDF rendering pulls a ~150KB chunk via dynamic import so the
        // candidate page doesn't ship the renderer to every visitor.
        const [{ pdf }, { EvaluationPdfDocument }] = await Promise.all([
          import("@react-pdf/renderer"),
          import("@/lib/pdf/evaluation-document"),
        ]);
        const blob = await pdf(
          <EvaluationPdfDocument
            evaluation={evaluation}
            meta={{
              candidate_name: candidateName,
              candidate_title: null,
              candidate_company: null,
            }}
          />
        ).toBlob();
        triggerDownload(blob, buildFilename(candidateName, evaluation, "pdf"));
        toast.success("PDF downloaded");
      } catch (err) {
        console.error("[evaluation] pdf export failed:", err);
        toast.error("Could not export PDF.");
      }
    });
  };

  const handleDraftEmail = () => {
    setEmailDraftOpen(true);
  };

  const handleRegenerate = () => {
    if (regenPending) return;
    startRegen(async () => {
      try {
        await regenerateEvaluationAction(candidateId, projectId);
        toast.success("Evaluation regenerated");
        router.refresh();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Regenerate failed.";
        console.error("[evaluation] regenerate failed:", err);
        toast.error(msg);
      }
    });
  };

  return (
    <>
      <div className="flex items-center gap-2 flex-wrap shrink-0">
        <button
          type="button"
          onClick={handleDraftEmail}
          className="px-3 py-1.5 border border-outline-variant text-on-surface-variant font-mono-label text-mono-label uppercase tracking-widest hover:border-primary hover:text-primary transition-colors flex items-center gap-1.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <span className="material-symbols-outlined text-[14px]" aria-hidden>
            outgoing_mail
          </span>
          Draft Client Email
        </button>
        <button
          type="button"
          onClick={handleDownload}
          className="px-3 py-1.5 border border-outline-variant text-on-surface-variant font-mono-label text-mono-label uppercase tracking-widest hover:border-primary hover:text-primary transition-colors flex items-center gap-1.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <span className="material-symbols-outlined text-[14px]" aria-hidden>
            file_download
          </span>
          Markdown
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
          onClick={handleRegenerate}
          disabled={regenPending}
          aria-busy={regenPending ? true : undefined}
          className="px-3 py-1.5 bg-primary-container text-on-primary-container font-mono-label text-mono-label uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-[filter,transform] flex items-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <span
            className={cn(
              "material-symbols-outlined text-[14px]",
              regenPending && "animate-spin"
            )}
            aria-hidden
          >
            {regenPending ? "progress_activity" : "refresh"}
          </span>
          {regenPending ? "Regenerating" : "Regenerate"}
        </button>
      </div>

      {emailDraftOpen && (
        <EmailDraftDialog
          evaluation={evaluation}
          candidateName={candidateName}
          onClose={() => setEmailDraftOpen(false)}
        />
      )}
    </>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Email draft modal
// ────────────────────────────────────────────────────────────────────────

function EmailDraftDialog({
  evaluation,
  candidateName,
  onClose,
}: {
  evaluation: CandidateEvaluation;
  candidateName: string;
  onClose: () => void;
}) {
  const draft = evaluationToEmailDraft(evaluation, {
    candidate_name: candidateName,
    candidate_title: null,
    candidate_company: null,
  });

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
      aria-labelledby="evaluation-email-title"
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-surface/80 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-2xl bg-surface-container border border-outline-variant max-h-[90vh] flex flex-col overflow-hidden">
        <header className="px-5 py-3 border-b border-outline-variant bg-surface-container-high flex items-center justify-between gap-3">
          <h3
            id="evaluation-email-title"
            className="font-mono-label text-mono-label text-primary uppercase tracking-widest flex items-center gap-2"
          >
            <span
              className="material-symbols-outlined text-[14px]"
              aria-hidden
            >
              outgoing_mail
            </span>
            Draft Client Email · {candidateName}
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
                htmlFor="email-subject"
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
              id="email-subject"
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full bg-surface-container-lowest border border-outline-variant px-3 py-2 font-mono-data text-body-main text-on-surface focus:border-primary focus:outline-none transition-colors"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="email-body"
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
              id="email-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={16}
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

// ────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────

function buildFilename(
  name: string,
  evaluation: CandidateEvaluation,
  ext: "md" | "pdf"
): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const date = evaluation.generated_at.slice(0, 10);
  return `evaluation-${slug || "candidate"}-${date}.${ext}`;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke after a tick — Safari needs the URL alive when click fires.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
