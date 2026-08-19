"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { unwrap } from "@/lib/actions/result";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth/password-policy";
import { redeemInvitationAction } from "./actions";

export function RedemptionForm({
  token,
  inviteeName,
}: {
  token: string;
  inviteeName: string;
}) {
  const [pending, start] = useTransition();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (pending) return;
    if (password !== confirm) {
      toast.error("The two passwords don't match.");
      return;
    }
    start(async () => {
      try {
        unwrap(await redeemInvitationAction({ token, password }));
        // Success redirects server-side; nothing to do here.
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "The invitation could not be redeemed."
        );
      }
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4 border border-outline-variant bg-surface-container px-5 py-5">
      <label className="block space-y-1">
        <span className="font-mono-label text-mono-label uppercase tracking-wider text-outline">
          Choose a password
        </span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          minLength={PASSWORD_MIN_LENGTH}
          required
          className="w-full border border-outline-variant bg-surface-container-low px-3 py-2 text-body-main text-on-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        />
        <span className="block text-sm text-on-surface-variant">
          At least {PASSWORD_MIN_LENGTH} characters, with upper and lower
          case, a digit and a symbol.
        </span>
      </label>

      <label className="block space-y-1">
        <span className="font-mono-label text-mono-label uppercase tracking-wider text-outline">
          Repeat it
        </span>
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          minLength={PASSWORD_MIN_LENGTH}
          required
          className="w-full border border-outline-variant bg-surface-container-low px-3 py-2 text-body-main text-on-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        />
      </label>

      <button
        type="submit"
        disabled={pending || !password || !confirm}
        aria-busy={pending ? true : undefined}
        className="border border-primary px-4 py-2 font-mono-label text-mono-label uppercase tracking-widest text-primary transition-colors hover:bg-primary hover:text-on-primary disabled:cursor-not-allowed disabled:opacity-40"
      >
        {pending ? "Setting up…" : `Join as ${inviteeName}`}
      </button>

      <Toaster richColors position="top-right" />
    </form>
  );
}
