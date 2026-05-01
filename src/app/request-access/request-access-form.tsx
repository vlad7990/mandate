"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { submitAccessRequestAction } from "./actions";

export function RequestAccessForm() {
  const [pending, start] = useTransition();
  const [submitted, setSubmitted] = useState(false);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (pending) return;

    const fd = new FormData(e.currentTarget);
    const payload = {
      full_name: String(fd.get("full_name") ?? "").trim(),
      email: String(fd.get("email") ?? "").trim(),
      company: String(fd.get("company") ?? "").trim(),
      role: String(fd.get("role") ?? "").trim(),
      referral_source: String(fd.get("referral_source") ?? "").trim(),
      use_case: String(fd.get("use_case") ?? "").trim(),
    };

    if (!payload.full_name || !payload.email) {
      toast.error("Name and email are required");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
      toast.error("Enter a valid email");
      return;
    }

    start(async () => {
      try {
        await submitAccessRequestAction(payload);
        setSubmitted(true);
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Submission failed."
        );
      }
    });
  };

  if (submitted) {
    return (
      <div
        role="status"
        className="bg-secondary-fixed-dim/5 border border-secondary-fixed-dim/40 px-4 py-6 text-center space-y-2"
      >
        <span
          className="material-symbols-outlined text-secondary-fixed-dim text-[28px]"
          style={{ fontVariationSettings: "'FILL' 1" }}
          aria-hidden
        >
          check_circle
        </span>
        <h2 className="font-h2 text-h2 text-on-surface">Request received</h2>
        <p className="text-body-main text-on-surface-variant max-w-md mx-auto">
          We&rsquo;ll be in touch within 48 hours. If we approve, you&rsquo;ll
          receive a sign-up link at the email you provided.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Full name" name="full_name" required />
        <Field label="Email" name="email" type="email" required />
        <Field label="Company" name="company" />
        <Field label="Role / title" name="role" />
      </div>
      <Field label="How did you hear about us?" name="referral_source" />
      <Field
        label="What are you trying to solve?"
        name="use_case"
        rows={4}
      />
      <button
        type="submit"
        disabled={pending}
        className="w-full px-4 py-2.5 bg-primary-container text-on-primary-container font-mono-label text-mono-label uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-[filter,transform] flex items-center justify-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <span
          className={cn(
            "material-symbols-outlined text-[14px]",
            pending && "animate-spin"
          )}
          aria-hidden
        >
          {pending ? "progress_activity" : "send"}
        </span>
        {pending ? "Submitting" : "Submit request"}
      </button>
    </form>
  );
}

function Field({
  label,
  name,
  type = "text",
  required = false,
  rows,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  rows?: number;
}) {
  const id = `field-${name}`;
  return (
    <label htmlFor={id} className="block space-y-1">
      <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
        {label} {required && <span className="text-tertiary">*</span>}
      </span>
      {rows ? (
        <textarea
          id={id}
          name={name}
          required={required}
          rows={rows}
          className="w-full bg-surface-container-lowest border border-outline-variant px-3 py-2 font-mono-data text-body-main text-on-surface focus:border-primary focus:outline-none transition-colors resize-y"
        />
      ) : (
        <input
          id={id}
          name={name}
          type={type}
          required={required}
          autoComplete={
            name === "email" ? "email" : name === "full_name" ? "name" : "off"
          }
          className="w-full bg-surface-container-lowest border border-outline-variant px-3 py-2 font-mono-data text-body-main text-on-surface focus:border-primary focus:outline-none transition-colors"
        />
      )}
    </label>
  );
}
