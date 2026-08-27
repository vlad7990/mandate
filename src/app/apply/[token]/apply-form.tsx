"use client";

import { useState } from "react";
import Script from "next/script";

/**
 * §190 — the applicant's half of the door. Plain multipart POST to the
 * token route; the Turnstile widget is always rendered here because the
 * server component only mounts this form when the keys exist.
 *
 * The notice block below IS the Art.13 moment — it is why
 * submit_application may stamp subject_notified_at at insert. Change
 * the flow and that stamp stops being true; change the words with care.
 */
export function ApplyForm({ token }: { token: string }) {
  const [state, setState] = useState<
    | { phase: "form"; error?: string }
    | { phase: "submitting" }
    | { phase: "done" }
  >({ phase: "form" });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setState({ phase: "submitting" });
    try {
      const res = await fetch(`/apply/${token}/api/submit`, {
        method: "POST",
        body: fd,
      });
      const body = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;
      if (!res.ok || !body?.ok) {
        setState({
          phase: "form",
          error: body?.error ?? "Submission failed — try again.",
        });
        return;
      }
      setState({ phase: "done" });
    } catch {
      setState({ phase: "form", error: "Network error — try again." });
    }
  }

  if (state.phase === "done") {
    return (
      <div className="border border-secondary-fixed-dim/40 bg-secondary-fixed-dim/5 p-4 space-y-2">
        <p className="font-mono-label text-mono-label text-secondary-fixed-dim uppercase tracking-widest">
          Application received
        </p>
        <p className="text-body-main text-on-surface leading-relaxed">
          Your CV has been submitted to the search team. It will be reviewed
          against this role&apos;s requirements; if there is a fit, the
          recruiter will contact you directly. You will not receive an
          automated verdict — a person decides what happens next.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="space-y-1.5">
        <label
          htmlFor="apply-name"
          className="font-mono-label text-mono-label text-outline uppercase tracking-widest"
        >
          Full name
        </label>
        <input
          id="apply-name"
          name="full_name"
          required
          maxLength={200}
          className="w-full bg-surface-container-lowest border border-outline-variant px-3 py-2 text-on-surface outline-none focus:border-primary"
        />
      </div>
      <div className="space-y-1.5">
        <label
          htmlFor="apply-email"
          className="font-mono-label text-mono-label text-outline uppercase tracking-widest"
        >
          Email
        </label>
        <input
          id="apply-email"
          name="email"
          type="email"
          required
          maxLength={200}
          className="w-full bg-surface-container-lowest border border-outline-variant px-3 py-2 text-on-surface outline-none focus:border-primary"
        />
      </div>
      <div className="space-y-1.5">
        <label
          htmlFor="apply-cv"
          className="font-mono-label text-mono-label text-outline uppercase tracking-widest"
        >
          CV (PDF or DOCX, 10 MB max)
        </label>
        <input
          id="apply-cv"
          name="cv"
          type="file"
          required
          accept=".pdf,.docx"
          className="w-full text-body-main text-on-surface-variant file:mr-3 file:border file:border-outline-variant file:bg-surface-container file:px-3 file:py-1.5 file:text-on-surface file:font-mono-label file:text-mono-label file:uppercase"
        />
      </div>

      {/* The Art.13 notice — the reason subject_notified_at stamps at insert. */}
      <div className="border border-outline-variant bg-surface-container-low p-3">
        <p className="text-[13px] leading-relaxed text-on-surface-variant">
          By submitting, your CV and contact details are stored by the search
          firm running this role and analysed — including by AI tooling — to
          assess fit against the role&apos;s requirements. They are not shared
          beyond the search team and their client for this role. You can
          request access to, correction of, or deletion of your data at any
          time by contacting the recruiter who published this link.
        </p>
      </div>

      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js"
        strategy="lazyOnload"
      />
      <div
        className="cf-turnstile"
        data-sitekey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
        data-theme="dark"
      />

      {state.phase === "form" && state.error && (
        <p className="text-body-main text-error">{state.error}</p>
      )}

      <button
        type="submit"
        disabled={state.phase === "submitting"}
        className="border border-primary bg-primary/10 px-4 py-2 font-mono-label text-mono-label uppercase tracking-widest text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
      >
        {state.phase === "submitting" ? "Submitting…" : "Submit application"}
      </button>
    </form>
  );
}
