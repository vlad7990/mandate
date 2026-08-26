"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { IconArrowLeft, IconSave } from "@/components/icons";
import { unwrap } from "@/lib/actions/result";
import {
  DEFAULT_PAYMENT_TERMS_DAYS,
  formatInvoiceNumber,
  LOGO_ACCEPT,
  validateLogoFile,
} from "@/lib/invoices/types";
import { createTemplateAction, updateTemplateAction } from "./actions";

export type TemplateFormInitial = {
  id: string | null;
  name: string;
  billing_name: string;
  address_lines: string;
  company_number: string;
  vat_number: string;
  payment_instructions: string;
  header_text: string;
  footer_text: string;
  from_email: string;
  reply_to: string;
  numbering_prefix: string;
  default_payment_terms_days: number;
  numbering_next: number;
  /** Signed URL for the stored logo, minted by the server page. */
  logo_url: string | null;
};

export function TemplateForm({ initial }: { initial: TemplateFormInitial }) {
  const [isPending, startTransition] = useTransition();

  const [name, setName] = useState(initial.name);
  const [billingName, setBillingName] = useState(initial.billing_name);
  const [addressLines, setAddressLines] = useState(initial.address_lines);
  const [companyNumber, setCompanyNumber] = useState(initial.company_number);
  const [vatNumber, setVatNumber] = useState(initial.vat_number);
  const [paymentInstructions, setPaymentInstructions] = useState(
    initial.payment_instructions
  );
  const [headerText, setHeaderText] = useState(initial.header_text);
  const [footerText, setFooterText] = useState(initial.footer_text);
  const [fromEmail, setFromEmail] = useState(initial.from_email);
  const [replyTo, setReplyTo] = useState(initial.reply_to);
  const [prefix, setPrefix] = useState(initial.numbering_prefix);
  const [terms, setTerms] = useState(String(initial.default_payment_terms_days));
  const [logo, setLogo] = useState<File | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);

  const submitDisabled = isPending || name.trim().length === 0;

  const handleLogoPick = (file: File | null) => {
    if (!file) {
      setLogo(null);
      return;
    }
    const verdict = validateLogoFile(file);
    if (!verdict.ok) {
      toast.error(verdict.reason);
      return;
    }
    setLogo(file);
    setRemoveLogo(false);
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitDisabled) return;

    const formData = new FormData();
    formData.set("name", name.trim());
    formData.set("billing_name", billingName.trim());
    formData.set("address_lines", addressLines);
    formData.set("company_number", companyNumber.trim());
    formData.set("vat_number", vatNumber.trim());
    formData.set("payment_instructions", paymentInstructions.trim());
    formData.set("from_email", fromEmail.trim());
    formData.set("reply_to", replyTo.trim());
    formData.set("header_text", headerText.trim());
    formData.set("footer_text", footerText.trim());
    formData.set("numbering_prefix", prefix.trim());
    formData.set("default_payment_terms_days", terms.trim());
    if (logo) formData.set("logo", logo);
    if (removeLogo) formData.set("remove_logo", "1");

    startTransition(async () => {
      try {
        if (initial.id) {
          unwrap(await updateTemplateAction(initial.id, formData));
        } else {
          unwrap(await createTemplateAction(formData));
        }
      } catch (err) {
        // The action calls redirect() on success — re-throw its signal.
        if (
          err &&
          typeof err === "object" &&
          "digest" in err &&
          typeof (err as { digest?: unknown }).digest === "string" &&
          (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
        ) {
          throw err;
        }
        toast.error(err instanceof Error ? err.message : "Save failed.");
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-5">
          <Field label="Template name" hint="Internal — never printed.">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={INPUT}
              placeholder="Standard letterhead"
              required
            />
          </Field>

          <Field
            label="Billing name"
            hint="The legal name that bills. Falls back to the org name if blank."
          >
            <input
              type="text"
              value={billingName}
              onChange={(e) => setBillingName(e.target.value)}
              className={INPUT}
            />
          </Field>

          <Field label="Billing address" hint="One line per row, printed as given.">
            <textarea
              value={addressLines}
              onChange={(e) => setAddressLines(e.target.value)}
              rows={3}
              className={INPUT}
            />
          </Field>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field label="Company number" hint="">
              <input
                type="text"
                value={companyNumber}
                onChange={(e) => setCompanyNumber(e.target.value)}
                className={INPUT}
              />
            </Field>
            <Field label="VAT number" hint="">
              <input
                type="text"
                value={vatNumber}
                onChange={(e) => setVatNumber(e.target.value)}
                className={INPUT}
              />
            </Field>
          </div>

          <Field
            label="Billing email address"
            hint="Invoices send FROM this address. Must be on a domain verified with the email provider — leave blank and this template cannot send, only print."
          >
            <input
              type="email"
              value={fromEmail}
              onChange={(e) => setFromEmail(e.target.value)}
              className={INPUT}
              placeholder="billing@youragency.com"
            />
          </Field>

          <Field
            label="Reply-to address"
            hint="Where client replies land. Defaults to the billing address."
          >
            <input
              type="email"
              value={replyTo}
              onChange={(e) => setReplyTo(e.target.value)}
              className={INPUT}
            />
          </Field>

          <Field
            label="Payment instructions"
            hint="Bank details and remittance wording, printed verbatim under the total."
          >
            <textarea
              value={paymentInstructions}
              onChange={(e) => setPaymentInstructions(e.target.value)}
              rows={4}
              className={INPUT}
            />
          </Field>
        </div>

        <div className="space-y-5">
          <Field
            label="Logo"
            hint="PNG, JPEG or WebP up to 2MB. Printed top-left of the document."
          >
            <div className="space-y-2">
              {initial.logo_url && !removeLogo && !logo && (
                <div className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element -- signed URL, short-lived */}
                  <img
                    src={initial.logo_url}
                    alt="Current logo"
                    className="h-12 w-auto border border-outline-variant bg-white object-contain p-1"
                  />
                  <button
                    type="button"
                    onClick={() => setRemoveLogo(true)}
                    className="font-mono-label text-mono-label uppercase tracking-widest text-outline transition-colors hover:text-tertiary"
                  >
                    Remove
                  </button>
                </div>
              )}
              {removeLogo && (
                <p className="font-mono-label text-mono-label uppercase tracking-widest text-tertiary">
                  Logo will be removed on save
                </p>
              )}
              <input
                type="file"
                accept={LOGO_ACCEPT}
                onChange={(e) => handleLogoPick(e.target.files?.[0] ?? null)}
                className="block w-full text-body-s text-on-surface-variant file:mr-3 file:border file:border-outline-variant file:bg-surface-container-low file:px-3 file:py-1.5 file:font-mono-label file:text-mono-label file:uppercase file:tracking-widest file:text-on-surface-variant"
              />
            </div>
          </Field>

          <Field label="Header text" hint="Printed under the logo, above the parties.">
            <textarea
              value={headerText}
              onChange={(e) => setHeaderText(e.target.value)}
              rows={2}
              className={INPUT}
            />
          </Field>

          <Field label="Footer text" hint="The document's last line.">
            <textarea
              value={footerText}
              onChange={(e) => setFooterText(e.target.value)}
              rows={2}
              className={INPUT}
            />
          </Field>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field
              label="Numbering prefix"
              hint={`Next issue mints ${formatInvoiceNumber(prefix.trim(), initial.numbering_next)}.`}
            >
              <input
                type="text"
                value={prefix}
                onChange={(e) => setPrefix(e.target.value)}
                className={INPUT}
                placeholder="INV-"
              />
            </Field>
            <Field label="Default payment terms" hint="Days from issue to due.">
              <input
                type="number"
                min={0}
                max={365}
                value={terms}
                onChange={(e) => setTerms(e.target.value)}
                onBlur={() => {
                  if (terms.trim() === "") setTerms(String(DEFAULT_PAYMENT_TERMS_DAYS));
                }}
                className={INPUT}
              />
            </Field>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 border-t border-outline-variant pt-4">
        <Link
          href="/app/settings/invoice-templates"
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
          <IconSave size={14} />
          {isPending ? "Saving…" : initial.id ? "Save template" : "Create template"}
        </button>
      </div>
    </form>
  );
}

const INPUT =
  "w-full border border-outline-variant bg-surface-container-low px-3 py-2 text-body-s text-on-surface placeholder:text-outline focus:border-primary focus:outline-none";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="font-mono-label text-mono-label uppercase tracking-widest text-primary">
        {label}
      </span>
      {children}
      {hint ? (
        <span className="block text-[12px] leading-snug text-on-surface-variant">{hint}</span>
      ) : null}
    </label>
  );
}
