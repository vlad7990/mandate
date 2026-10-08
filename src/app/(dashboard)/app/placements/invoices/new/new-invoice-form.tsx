"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { IconArrowLeft, IconPlus } from "@/components/icons";
import { unwrap } from "@/lib/actions/result";
import { createInvoiceAction } from "../actions";
import { SelectField } from "@/components/ui/select";

export function NewInvoiceForm({
  clients,
  templates,
}: {
  clients: { id: string; name: string }[];
  templates: { id: string; name: string }[];
}) {
  const [isPending, startTransition] = useTransition();
  const [clientId, setClientId] = useState("");
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");

  const submitDisabled = isPending || !clientId || !templateId;

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitDisabled) return;

    const formData = new FormData();
    formData.set("client_id", clientId);
    formData.set("template_id", templateId);

    startTransition(async () => {
      try {
        unwrap(await createInvoiceAction(formData));
      } catch (err) {
        // The action redirects to the draft on success — re-throw its signal.
        if (
          err &&
          typeof err === "object" &&
          "digest" in err &&
          typeof (err as { digest?: unknown }).digest === "string" &&
          (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
        ) {
          throw err;
        }
        toast.error(err instanceof Error ? err.message : "Create failed.");
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-lg space-y-5">
      <label className="block space-y-1.5">
        <span className="font-mono-label text-mono-label uppercase tracking-widest text-primary">
          Client
        </span>
        {/* No `required`: this form builds its own FormData and already
            refuses to submit while `submitDisabled` holds, so the
            attribute never did any work here — and native validation on a
            visually hidden control is a trap, not a safety net. */}
        <SelectField
          aria-label="Client"
          tone="text"
          value={clientId}
          onValueChange={setClientId}
          options={[
            { value: "", label: "Pick a client…" },
            ...clients.map((c) => ({ value: c.id, label: c.name })),
          ]}
          className={SELECT_FIELD}
        />
      </label>

      <label className="block space-y-1.5">
        <span className="font-mono-label text-mono-label uppercase tracking-widest text-primary">
          Template
        </span>
        <SelectField
          aria-label="Template"
          tone="text"
          value={templateId}
          onValueChange={setTemplateId}
          options={templates.map((t) => ({ value: t.id, label: t.name }))}
          className={SELECT_FIELD}
        />
      </label>

      <div className="flex items-center justify-between gap-4 border-t border-outline-variant pt-4">
        <Link
          href="/app/placements/invoices"
          prefetch={false}
          className="flex items-center gap-2 font-mono-label text-mono-label uppercase tracking-widest text-outline transition-colors hover:text-on-surface"
        >
          <IconArrowLeft size={14} />
          Back
        </Link>
        <button
          type="submit"
          disabled={submitDisabled}
          className="flex items-center gap-2 btn-notch bg-primary-container px-4 py-2 font-mono-label text-mono-label uppercase tracking-widest text-on-primary-container transition-[filter,transform] hover:brightness-110 active:scale-[0.98] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <IconPlus size={14} />
          {isPending ? "Creating…" : "Start draft"}
        </button>
      </div>
    </form>
  );
}

const SELECT_FIELD =
  "h-auto w-full bg-surface-container-low px-3 py-2 text-body-s";
