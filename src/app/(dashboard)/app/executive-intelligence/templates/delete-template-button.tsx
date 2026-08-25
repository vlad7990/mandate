"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { unwrap } from "@/lib/actions/result";
import { deleteTemplateAction } from "./actions";

export function DeleteTemplateButton({
  templateId,
  title,
}: {
  templateId: string;
  title: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleDelete = () => {
    if (
      !window.confirm(
        `Delete the template "${title}"? A template that seeded a search refuses on its own.`
      )
    ) {
      return;
    }
    startTransition(async () => {
      try {
        unwrap(await deleteTemplateAction(templateId));
        toast.success(`Deleted "${title}"`);
        router.refresh();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Delete failed.";
        console.error("[ei/templates] delete failed:", err);
        toast.error(msg);
      }
    });
  };

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={isPending}
      className="font-mono-label text-mono-label uppercase tracking-widest text-outline transition-colors hover:text-error disabled:opacity-60"
    >
      {isPending ? "Deleting…" : "Delete"}
    </button>
  );
}
