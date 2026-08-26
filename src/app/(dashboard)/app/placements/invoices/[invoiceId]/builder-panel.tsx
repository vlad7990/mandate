"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { IconPlus } from "@/components/icons";
import { PrintReportButton } from "@/components/ui/print-report-button";
import { unwrap } from "@/lib/actions/result";
import { openMailDraft } from "@/lib/mail-draft";
import { formatMoney } from "@/lib/fees/compute";
import { invoiceMailDraft } from "@/lib/invoices/compute";
import type { InvoiceStatus } from "@/lib/invoices/types";
import {
  addFeeLineAction,
  addFreeLineAction,
  deleteDraftAction,
  issueInvoiceAction,
  moveLineAction,
  removeLineAction,
  updateDraftAction,
  updateLineLabelAction,
  voidInvoiceAction,
} from "../actions";

export type PanelLine = {
  id: string;
  label: string;
  amount: number;
  currency: string;
};

export type AvailableFeeLine = {
  id: string;
  label: string;
  amount: number;
  currency: string;
  candidate: string;
  mandate: string;
  billed: boolean;
};

export type PanelInvoice = {
  id: string;
  status: InvoiceStatus;
  invoice_number: string | null;
  currency: string;
  total_amount: number;
  payment_terms_days: number;
  issue_date: string | null;
  due_date: string | null;
  notes: string;
  bill_to_name: string;
  bill_to_address: string;
};

/**
 * The builder — everything that is chrome, not document. The whole
 * panel is `print:hidden` from the parent, so the printed page is the
 * invoice alone.
 */
export function BuilderPanel({
  invoice,
  lines,
  available,
  billingName,
  paymentInstructions,
  clientName,
}: {
  invoice: PanelInvoice;
  lines: PanelLine[];
  available: AvailableFeeLine[];
  billingName: string;
  paymentInstructions: string;
  clientName: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Every thunk passed here inlines `unwrap(await xAction(...))` — the
  // call-sites test reads the literal shape, so the unwrap cannot live
  // in this helper.
  const run = (work: () => Promise<unknown>, done?: string) => {
    startTransition(async () => {
      try {
        await work();
        if (done) toast.success(done);
        router.refresh();
      } catch (err) {
        if (
          err &&
          typeof err === "object" &&
          "digest" in err &&
          typeof (err as { digest?: unknown }).digest === "string" &&
          (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
        ) {
          throw err;
        }
        toast.error(err instanceof Error ? err.message : "That did not save.");
      }
    });
  };

  if (invoice.status !== "draft") {
    return (
      <IssuedPanel
        invoice={invoice}
        billingName={billingName}
        paymentInstructions={paymentInstructions}
        clientName={clientName}
        isPending={isPending}
        onVoid={() => {
          if (
            window.confirm(
              `Void ${invoice.invoice_number}? The document stays on file as void and its fee lines become billable again.`
            )
          ) {
            run(async () => unwrap(await voidInvoiceAction(invoice.id)), "Invoice voided.");
          }
        }}
      />
    );
  }

  return (
    <div className="space-y-5">
      <BillToSection invoice={invoice} isPending={isPending} run={run} />

      <Section title="Earned, un-invoiced fee lines">
        {available.length === 0 ? (
          <p className="px-4 py-3 text-[12px] leading-snug text-on-surface-variant">
            Nothing to bill: the client has no earned fee lines off an invoice.
            Lines are earned on the placement&apos;s fee ledger first — this
            builder only selects, it never invents an amount.
          </p>
        ) : (
          <ul className="divide-y divide-outline-variant/40">
            {available.map((line) => (
              <li key={line.id} className="flex items-center gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body-s text-on-surface">{line.label}</p>
                  <p className="truncate font-mono-label text-[11px] uppercase tracking-[0.08em] text-outline">
                    {line.candidate} · {line.mandate}
                  </p>
                </div>
                <span className="font-mono-label text-mono-label tabular-nums text-on-surface-variant">
                  {formatMoney(line.amount, line.currency)}
                </span>
                {line.billed ? (
                  <span className="font-mono-label text-[11px] uppercase tracking-[0.08em] text-outline">
                    Billed
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => run(async () => unwrap(await addFeeLineAction(invoice.id, line.id)))}
                    className={GHOST_BTN}
                  >
                    Add
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Lines on this draft">
        {lines.length === 0 ? (
          <p className="px-4 py-3 font-mono-label text-mono-label uppercase tracking-widest text-outline">
            Empty draft
          </p>
        ) : (
          <ul className="divide-y divide-outline-variant/40">
            {lines.map((line, index) => (
              <DraftLine
                key={line.id}
                line={line}
                first={index === 0}
                last={index === lines.length - 1}
                isPending={isPending}
                onRename={(label) =>
                  run(async () => unwrap(await updateLineLabelAction(invoice.id, line.id, label)))
                }
                onMove={(direction) =>
                  run(async () => unwrap(await moveLineAction(invoice.id, line.id, direction)))
                }
                onRemove={() => run(async () => unwrap(await removeLineAction(invoice.id, line.id)))}
              />
            ))}
          </ul>
        )}
        <FreeLineForm
          currency={invoice.currency}
          isPending={isPending}
          onAdd={(formData) => run(async () => unwrap(await addFreeLineAction(invoice.id, formData)))}
        />
      </Section>

      <div className="space-y-2">
        <button
          type="button"
          disabled={isPending || lines.length === 0}
          onClick={() => {
            if (
              window.confirm(
                "Issue this invoice? The number is minted and the document freezes — the only path past a mistake afterwards is void and reissue."
              )
            ) {
              run(async () => unwrap(await issueInvoiceAction(invoice.id)), "Invoice issued.");
            }
          }}
          className="w-full btn-notch bg-primary-container px-4 py-2.5 font-mono-label text-mono-label uppercase tracking-widest text-on-primary-container transition-[filter,transform] hover:brightness-110 active:scale-[0.98] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {isPending ? "Working…" : "Issue invoice"}
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => {
            if (window.confirm("Delete this draft? Nothing was numbered or sent.")) {
              run(async () => unwrap(await deleteDraftAction(invoice.id)));
            }
          }}
          className="w-full border border-outline-variant px-4 py-2 font-mono-label text-[11px] uppercase tracking-widest text-outline transition-colors hover:text-tertiary"
        >
          Delete draft
        </button>
      </div>
    </div>
  );
}

function BillToSection({
  invoice,
  isPending,
  run,
}: {
  invoice: PanelInvoice;
  isPending: boolean;
  run: (work: () => Promise<unknown>, done?: string) => void;
}) {
  const [name, setName] = useState(invoice.bill_to_name);
  const [address, setAddress] = useState(invoice.bill_to_address);
  const [terms, setTerms] = useState(String(invoice.payment_terms_days));
  const [notes, setNotes] = useState(invoice.notes);

  const save = () => {
    const formData = new FormData();
    formData.set("bill_to_name", name);
    formData.set("bill_to_address", address);
    formData.set("payment_terms_days", terms);
    formData.set("notes", notes);
    run(async () => unwrap(await updateDraftAction(invoice.id, formData)), "Draft saved.");
  };

  return (
    <Section title="Document details">
      <div className="space-y-3 px-4 py-3">
        <SmallField label="Bill-to name">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={INPUT}
          />
        </SmallField>
        <SmallField label="Bill-to address (one line per row)">
          <textarea
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            rows={3}
            className={INPUT}
          />
        </SmallField>
        <SmallField label="Payment terms (days)">
          <input
            type="number"
            min={0}
            max={365}
            value={terms}
            onChange={(e) => setTerms(e.target.value)}
            className={INPUT}
          />
        </SmallField>
        <SmallField label="Notes (printed above payment instructions)">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className={INPUT}
          />
        </SmallField>
        <button type="button" disabled={isPending} onClick={save} className={GHOST_BTN}>
          Save details
        </button>
      </div>
    </Section>
  );
}

function DraftLine({
  line,
  first,
  last,
  isPending,
  onRename,
  onMove,
  onRemove,
}: {
  line: PanelLine;
  first: boolean;
  last: boolean;
  isPending: boolean;
  onRename: (label: string) => void;
  onMove: (direction: "up" | "down") => void;
  onRemove: () => void;
}) {
  const [label, setLabel] = useState(line.label);

  return (
    <li className="space-y-1.5 px-4 py-2.5">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={() => {
            const next = label.trim();
            if (next && next !== line.label) onRename(next);
            else setLabel(line.label);
          }}
          className={INPUT}
          aria-label="Line label"
        />
        <span className="shrink-0 font-mono-label text-mono-label tabular-nums text-on-surface">
          {formatMoney(line.amount, line.currency)}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={isPending || first}
          onClick={() => onMove("up")}
          className={TINY_BTN}
        >
          Up
        </button>
        <button
          type="button"
          disabled={isPending || last}
          onClick={() => onMove("down")}
          className={TINY_BTN}
        >
          Down
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={onRemove}
          className={`${TINY_BTN} hover:text-tertiary`}
        >
          Remove
        </button>
      </div>
    </li>
  );
}

function FreeLineForm({
  currency,
  isPending,
  onAdd,
}: {
  currency: string;
  isPending: boolean;
  onAdd: (formData: FormData) => void;
}) {
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");

  return (
    <div className="border-t border-outline-variant/60 px-4 py-3">
      <p className="font-mono-label text-[11px] uppercase tracking-[0.08em] text-outline">
        Free line ({currency}) — expenses, adjustments
      </p>
      <div className="mt-2 flex items-center gap-2">
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Label"
          className={INPUT}
        />
        <input
          type="number"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          className={`${INPUT} w-28 shrink-0 text-right`}
        />
        <button
          type="button"
          disabled={isPending || !label.trim() || amount.trim() === ""}
          onClick={() => {
            const formData = new FormData();
            formData.set("label", label.trim());
            formData.set("amount", amount.trim());
            onAdd(formData);
            setLabel("");
            setAmount("");
          }}
          className={GHOST_BTN}
          aria-label="Add free line"
        >
          <IconPlus size={12} />
        </button>
      </div>
    </div>
  );
}

function IssuedPanel({
  invoice,
  billingName,
  paymentInstructions,
  clientName,
  isPending,
  onVoid,
}: {
  invoice: PanelInvoice;
  billingName: string;
  paymentInstructions: string;
  clientName: string;
  isPending: boolean;
  onVoid: () => void;
}) {
  const handleMail = async () => {
    if (!invoice.invoice_number || !invoice.issue_date || !invoice.due_date) return;
    const draft = invoiceMailDraft({
      invoiceNumber: invoice.invoice_number,
      billingName,
      clientName: invoice.bill_to_name || clientName,
      totalLabel: formatMoney(invoice.total_amount, invoice.currency),
      issueDate: invoice.issue_date,
      dueDate: invoice.due_date,
      paymentInstructions,
    });
    const outcome = await openMailDraft(draft);
    if (outcome === "opened_body_on_clipboard") {
      toast.info("The draft was too long for a mail link — the body is on your clipboard, paste it in.");
    } else if (outcome === "too_long_clipboard_unavailable") {
      toast.error("The draft could not be handed to your mail client — print the PDF and attach it by hand.");
    } else {
      toast.info("Attach the PDF from Print or save as PDF — a mail link cannot carry it.");
    }
  };

  return (
    <div className="space-y-3">
      {/* No scopeId: the invoice page IS the document and the dashboard
          shell is already `print:hidden` — proven exact in drive 110. */}
      <PrintReportButton />

      {invoice.status === "issued" && (
        <>
          <button
            type="button"
            onClick={handleMail}
            className="w-full border border-outline-variant px-4 py-2.5 font-mono-label text-[11px] uppercase tracking-[0.1em] text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
          >
            Draft email to client
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={onVoid}
            className="w-full border border-outline-variant px-4 py-2 font-mono-label text-[11px] uppercase tracking-widest text-outline transition-colors hover:text-tertiary disabled:opacity-50"
          >
            {isPending ? "Working…" : "Void invoice"}
          </button>
          <p className="text-[12px] leading-snug text-on-surface-variant">
            Issued documents are frozen — the only path past a mistake is void
            and reissue. Voiding releases its fee lines for rebilling.
          </p>
        </>
      )}

      {invoice.status === "void" && (
        <p className="text-[12px] leading-snug text-on-surface-variant">
          This document is void. It stays on file — its number is never reused —
          and the fee lines it billed are billable again.
        </p>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border border-outline-variant bg-surface-container-low">
      <div className="border-b border-outline-variant px-4 py-2.5">
        <h2 className="font-mono-label text-mono-label uppercase tracking-widest text-primary">
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}

function SmallField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="font-mono-label text-[11px] uppercase tracking-[0.08em] text-outline">
        {label}
      </span>
      {children}
    </label>
  );
}

const INPUT =
  "w-full border border-outline-variant bg-surface px-2.5 py-1.5 text-body-s text-on-surface placeholder:text-outline focus:border-primary focus:outline-none";

const GHOST_BTN =
  "shrink-0 border border-outline-variant px-2.5 py-1.5 font-mono-label text-[11px] uppercase tracking-widest text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface disabled:opacity-50";

const TINY_BTN =
  "font-mono-label text-[11px] uppercase tracking-widest text-outline transition-colors hover:text-on-surface disabled:opacity-30";
