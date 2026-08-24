"use client";

import { useState, useTransition } from "react";
import Script from "next/script";
import { toast } from "sonner";
import { submitAccessRequestAction } from "./actions";
import { unwrap } from "@/lib/actions/result";

// Rendered only when the founder has provisioned the site key
// (NEXT-rate-limiting D4). Inlined at build time; remember it must be
// added `--no-sensitive` or it never reaches this bundle (§59's trap).
const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

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
      // The widget posts its token under this fixed field name.
      turnstile_token:
        String(fd.get("cf-turnstile-response") ?? "") || undefined,
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
        unwrap(await submitAccessRequestAction(payload));
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
      <div role="status" className="m-access__done">
        <span className="m-access__done-mark" aria-hidden>
          ✓
        </span>
        <h2 className="m-h3">Request received</h2>
        <p>
          We&rsquo;ll be in touch within 48 hours. If we approve, you&rsquo;ll
          receive a sign-up link at the email you provided.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="m-form">
      <div className="m-form__grid">
        <Field label="Full name" name="full_name" required />
        <Field label="Email" name="email" type="email" required />
        <Field label="Company" name="company" />
        <Field label="Role / title" name="role" />
      </div>
      <Field label="How did you hear about us?" name="referral_source" />
      <Field label="What are you trying to solve?" name="use_case" rows={4} />
      {TURNSTILE_SITE_KEY && (
        <>
          <Script
            src="https://challenges.cloudflare.com/turnstile/v0/api.js"
            strategy="lazyOnload"
          />
          <div
            className="cf-turnstile"
            data-sitekey={TURNSTILE_SITE_KEY}
            data-theme="dark"
          />
        </>
      )}
      <button
        type="submit"
        disabled={pending}
        className="m-btn m-btn--primary m-form__submit"
      >
        <span>{pending ? "Submitting…" : "Submit request"}</span>
        {!pending && <span aria-hidden>→</span>}
      </button>
      <p className="m-form__note">
        No credit card, no trial. Access is granted by approval.
      </p>
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
    <div className="m-field">
      <label htmlFor={id} className="m-field__label">
        {label}
        {required && (
          <span className="m-field__req" aria-hidden>
            *
          </span>
        )}
        {required && <span className="m-sr-only">(required)</span>}
      </label>
      {rows ? (
        <textarea
          id={id}
          name={name}
          required={required}
          rows={rows}
          className="m-field__control m-field__control--area"
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
          className="m-field__control"
        />
      )}
    </div>
  );
}
