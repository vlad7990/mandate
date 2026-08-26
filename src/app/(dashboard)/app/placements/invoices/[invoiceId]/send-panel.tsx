"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { unwrap } from "@/lib/actions/result";
import {
  DELIVERY_STATUS_LABELS,
  type DeliveryStatus,
} from "@/lib/invoices/types";
import { StatusChip, type ChipTone } from "@/components/ui/status-chip";
import { sendInvoiceAction } from "../actions";

export type ContactOption = {
  id: string;
  name: string;
  email: string;
  title: string | null;
};

export type DeliveryLine = {
  id: string;
  to_address: string;
  to_label: string | null;
  delivery_status: DeliveryStatus;
  failure_detail: string | null;
  created_at: string;
};

const STATUS_TONE: Record<DeliveryStatus, ChipTone> = {
  sent: "secondary",
  delivered: "primary",
  bounced: "danger",
  complained: "danger",
  failed: "warn",
};

/**
 * Sending an issued invoice from the app (126, slice 2).
 *
 * Absent by design when the template it was issued under carries no
 * billing address: the identity lives on the template (gate D.1) and
 * sending as the product would put Mandate's name on the agency's
 * invoice. The panel says so rather than offering a button that
 * refuses — the §155 honest-absence pattern.
 */
export function SendPanel({
  invoiceId,
  canSend,
  fromAddress,
  contacts,
  deliveries,
  billToName,
}: {
  invoiceId: string;
  canSend: boolean;
  fromAddress: string | null;
  contacts: ContactOption[];
  deliveries: DeliveryLine[];
  billToName: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [choice, setChoice] = useState<string>(contacts[0]?.email ?? "");
  const [typed, setTyped] = useState("");

  const usingTyped = choice === "__typed__" || contacts.length === 0;
  const address = usingTyped ? typed.trim() : choice;
  const label = usingTyped
    ? null
    : contacts.find((c) => c.email === choice)?.name ?? null;

  const handleSend = () => {
    if (!address) {
      toast.error("Choose a contact or type an address.");
      return;
    }
    if (
      !window.confirm(
        `Send invoice to ${address}? This leaves the building — it is recorded either way.`
      )
    ) {
      return;
    }

    const formData = new FormData();
    formData.set("to_address", address);
    if (label) formData.set("to_label", label);

    startTransition(async () => {
      try {
        unwrap(await sendInvoiceAction(invoiceId, formData));
        toast.success(`Invoice sent to ${address}.`);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "The invoice was not sent.");
        // A refused send is recorded too, so the history below changes.
        router.refresh();
      }
    });
  };

  if (!canSend) {
    return (
      <section className="border border-outline-variant bg-surface-container-low px-4 py-3">
        <h2 className="font-mono-label text-mono-label uppercase tracking-widest text-primary">
          Send
        </h2>
        <p className="mt-2 text-[12px] leading-snug text-on-surface-variant">
          This invoice was issued under a template with no billing email
          address, so the app has nothing to send it from — and sending it as
          Mandate would put the wrong name on your invoice. Add a billing
          address to the template under Settings → Invoice templates. It must
          be on a domain verified with the email provider.
        </p>
        <p className="mt-2 text-[12px] leading-snug text-outline">
          Draft email to client still works — it hands the message to your own
          mail client instead.
        </p>
      </section>
    );
  }

  return (
    <section className="border border-outline-variant bg-surface-container-low">
      <div className="border-b border-outline-variant px-4 py-2.5">
        <h2 className="font-mono-label text-mono-label uppercase tracking-widest text-primary">
          Send to {billToName || "the client"}
        </h2>
      </div>

      <div className="space-y-3 px-4 py-3">
        <label className="block space-y-1">
          <span className="font-mono-label text-[11px] uppercase tracking-[0.08em] text-outline">
            Recipient
          </span>
          {contacts.length > 0 ? (
            <select
              value={choice}
              onChange={(e) => setChoice(e.target.value)}
              className={INPUT}
            >
              {contacts.map((c) => (
                <option key={c.id} value={c.email}>
                  {c.name}
                  {c.title ? ` · ${c.title}` : ""} — {c.email}
                </option>
              ))}
              <option value="__typed__">Another address…</option>
            </select>
          ) : (
            <p className="text-[12px] leading-snug text-on-surface-variant">
              This client has no contacts with an email address on file — type
              one below.
            </p>
          )}
        </label>

        {usingTyped && (
          <label className="block space-y-1">
            <span className="font-mono-label text-[11px] uppercase tracking-[0.08em] text-outline">
              Address
            </span>
            <input
              type="email"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="accounts@client.com"
              className={INPUT}
            />
          </label>
        )}

        <p className="text-[12px] leading-snug text-outline">
          Sends from {fromAddress}. The email carries the invoice in full; a
          PDF is available from Print or save as PDF.
        </p>

        <button
          type="button"
          disabled={isPending || !address}
          onClick={handleSend}
          className="w-full btn-notch bg-primary-container px-4 py-2.5 font-mono-label text-mono-label uppercase tracking-widest text-on-primary-container transition-[filter,transform] hover:brightness-110 active:scale-[0.98] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {isPending ? "Sending…" : deliveries.length > 0 ? "Send again" : "Send invoice"}
        </button>
      </div>

      {deliveries.length > 0 && (
        <div className="border-t border-outline-variant">
          <p className="px-4 pt-2.5 font-mono-label text-[11px] uppercase tracking-[0.08em] text-outline">
            Delivery history
          </p>
          <ul className="divide-y divide-outline-variant/40">
            {deliveries.map((d) => (
              <li key={d.id} className="px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <StatusChip tone={STATUS_TONE[d.delivery_status]} dot>
                    {DELIVERY_STATUS_LABELS[d.delivery_status]}
                  </StatusChip>
                  <span className="min-w-0 flex-1 truncate text-[12px] text-on-surface-variant">
                    {d.to_label ? `${d.to_label} · ` : ""}
                    {d.to_address}
                  </span>
                  <span className="shrink-0 font-mono-label text-[11px] tabular-nums text-outline">
                    {d.created_at.slice(0, 10)}
                  </span>
                </div>
                {d.failure_detail && (
                  <p className="mt-1 text-[11px] leading-snug text-tertiary">
                    {d.failure_detail}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

const INPUT =
  "w-full border border-outline-variant bg-surface px-2.5 py-1.5 text-body-s text-on-surface placeholder:text-outline focus:border-primary focus:outline-none";
