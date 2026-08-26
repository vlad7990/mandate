"use client";

import { IconPrint } from "@/components/icons";

/**
 * The product's one print control — §133's rule, made shareable by the
 * print pass (slice 3 of the invoicing + print programme).
 *
 * The rule it enforces: **a document prints as itself.** There is no
 * second renderer, so an exported copy cannot disagree with the one on
 * screen. The browser's own dialog produces the PDF.
 *
 * ## Two shapes, because the product has two kinds of document
 *
 * **A page that IS a document** — the Executive Intelligence report,
 * an invoice. The dashboard shell is already `print:hidden`, so
 * `window.print()` alone leaves exactly the document on the paper.
 * Those callers pass no `scopeId` and get the original behaviour,
 * unchanged.
 *
 * **A panel inside a busy page** — the triangulation, company, culture
 * and evaluation reports live on workspaces with a dozen other panels
 * and a tab bar; the client-interview set and the shortlist slate sit
 * beside their own working chrome. For those, `window.print()` alone
 * would spool the entire workspace. `scopeId` narrows the paper to the
 * one document without cloning it into a second renderer: the element
 * is marked, the body is put into scoped-print mode, and CSS hides
 * everything else (see `globals.css`).
 *
 * The marks are removed again on `afterprint`, and also if the dialog
 * is dismissed — browsers fire `afterprint` on cancel too. A print
 * that leaves the page in print mode would be a worse bug than no
 * print button at all, so the cleanup is unconditional rather than
 * conditional on the user actually printing.
 */
export function PrintReportButton({
  scopeId,
  label = "Print or save as PDF",
  className,
}: {
  /**
   * The id of the element to print. Omit when the page itself is the
   * document — the dashboard shell is already hidden at print time.
   */
  scopeId?: string;
  label?: string;
  className?: string;
}) {
  const handlePrint = () => {
    if (!scopeId) {
      window.print();
      return;
    }

    const target = document.getElementById(scopeId);
    if (!target) {
      // The document is not on screen — printing the whole workspace
      // instead would be worse than doing nothing.
      return;
    }

    const body = document.body;
    target.classList.add("m-print-scope");
    body.classList.add("m-printing-scoped");

    const cleanup = () => {
      target.classList.remove("m-print-scope");
      body.classList.remove("m-printing-scoped");
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);

    window.print();

    // Safari has historically not fired `afterprint`. A timeout is the
    // belt to that braces — it runs after the dialog has taken its
    // snapshot, so it cannot strip the marks mid-print.
    window.setTimeout(cleanup, 1000);
  };

  return (
    <button
      type="button"
      onClick={handlePrint}
      className={
        className ??
        "flex w-full items-center justify-center gap-2 border border-outline-variant bg-surface-container-low px-4 py-2.5 font-mono-label text-[11px] font-bold uppercase tracking-[0.1em] text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      }
    >
      <IconPrint size={15} />
      {label}
    </button>
  );
}

/**
 * The panel-header variant: same control, sized for a `Panel`'s action
 * slot rather than a document sidebar.
 */
export function PrintPanelButton({
  scopeId,
  label = "Print",
}: {
  scopeId: string;
  label?: string;
}) {
  return (
    <PrintReportButton
      scopeId={scopeId}
      label={label}
      className="flex items-center gap-2 border border-outline-variant px-3 py-1.5 font-mono-label text-mono-label uppercase tracking-widest text-on-surface-variant transition-colors hover:border-primary hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary print:hidden"
    />
  );
}
