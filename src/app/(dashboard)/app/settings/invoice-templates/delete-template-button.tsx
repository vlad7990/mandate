"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { unwrap } from "@/lib/actions/result";
import type { ActionResult } from "@/lib/actions/result";

/**
 * Delete with an explicit confirm — a template is the org's letterhead
 * and its number sequence, and the sequence does not come back.
 * Issued invoices are safe regardless: their FK is SET NULL and the
 * identity lives in from_snapshot.
 */
export function DeleteTemplateButton({
  templateId,
  templateName,
  action,
}: {
  templateId: string;
  templateName: string;
  action: (templateId: string) => Promise<ActionResult>;
}) {
  const [isPending, startTransition] = useTransition();

  const handleDelete = () => {
    if (
      !window.confirm(
        `Delete the template "${templateName}"? Drafts pointing at it will need another template before they can issue.`
      )
    ) {
      return;
    }
    startTransition(async () => {
      try {
        unwrap(await action(templateId));
        toast.success("Template deleted.");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Delete failed.");
      }
    });
  };

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={isPending}
      className="font-mono-label text-mono-label uppercase tracking-widest text-outline transition-colors hover:text-tertiary disabled:opacity-50"
    >
      {isPending ? "Deleting…" : "Delete"}
    </button>
  );
}
