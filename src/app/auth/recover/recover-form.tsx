"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { unwrap } from "@/lib/actions/result";
import { requestRecoveryAction } from "./actions";

export function RecoverForm() {
  const [pending, start] = useTransition();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (pending) return;
    start(async () => {
      try {
        unwrap(await requestRecoveryAction(email));
        // The one answer, whoever asked (D2).
        setSent(true);
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "The request failed. Try again."
        );
      }
    });
  };

  if (sent) {
    return (
      <div className="border border-outline-variant bg-surface-container px-5 py-5">
        <p className="font-mono-label text-mono-label uppercase tracking-widest text-primary">
          Check your inbox
        </p>
        <p className="mt-2 text-body-main text-on-surface-variant">
          If <span className="text-on-surface">{email.trim()}</span> has an
          account, a recovery email is on its way. The link inside brings
          you back here to set a new password. Nothing arrived after a few
          minutes? Check spam, or ask the person who set up your access.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4 border border-outline-variant bg-surface-container px-5 py-5">
      <label className="block space-y-1">
        <span className="font-mono-label text-mono-label uppercase tracking-wider text-outline">
          Email address
        </span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
          placeholder="you@company.com"
          className="w-full border border-outline-variant bg-surface-container-low px-3 py-2 text-body-main text-on-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        />
      </label>
      <button
        type="submit"
        disabled={pending || !email.trim()}
        aria-busy={pending ? true : undefined}
        className="border border-primary px-4 py-2 font-mono-label text-mono-label uppercase tracking-widest text-primary transition-colors hover:bg-primary hover:text-on-primary disabled:cursor-not-allowed disabled:opacity-40"
      >
        {pending ? "Requesting…" : "Send recovery email"}
      </button>
      <Toaster richColors position="top-right" />
    </form>
  );
}
