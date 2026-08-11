"use client";

import { IconPrint } from "@/components/icons";

/**
 * The only export the report has, and deliberately so: the browser's own
 * print dialog, which also produces the PDF. The document column is already
 * the print layout (see the `@media print` block in globals.css), so there is
 * no second renderer to keep in sync — and therefore no way for an exported
 * copy to disagree with the one on screen.
 */
export function PrintReportButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="flex w-full items-center justify-center gap-2 rounded-md border border-outline-variant bg-surface-container-low px-4 py-2.5 font-mono-label text-[11px] font-bold uppercase tracking-[0.1em] text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <IconPrint size={15} />
      Print or save as PDF
    </button>
  );
}
