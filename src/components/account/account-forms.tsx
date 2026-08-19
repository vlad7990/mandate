"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { unwrap } from "@/lib/actions/result";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth/password-policy";
import {
  renameSelfAction,
  changePasswordAction,
} from "@/lib/account/actions";

/**
 * The two self-service forms, shared by /portal/settings and the Account
 * section of /app/settings — one implementation, both personas, like the
 * hm-portal submit pipeline. Enforcement is the database's (071 policy +
 * guard) and GoTrue's; these forms exist to make the two edits ordinary.
 */

const inputClass =
  "w-full border border-outline-variant bg-surface-container-low px-3 py-2 text-body-main text-on-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
const labelClass =
  "font-mono-label text-mono-label uppercase tracking-wider text-outline";
const buttonClass =
  "border border-primary px-4 py-2 font-mono-label text-mono-label uppercase tracking-widest text-primary transition-colors hover:bg-primary hover:text-on-primary disabled:cursor-not-allowed disabled:opacity-40";

export function NameForm({ initialName }: { initialName: string }) {
  const [pending, start] = useTransition();
  const [name, setName] = useState(initialName);
  const [savedName, setSavedName] = useState(initialName);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (pending) return;
    start(async () => {
      try {
        const { fullName } = unwrap(await renameSelfAction(name));
        setName(fullName);
        setSavedName(fullName);
        toast.success("Name updated.");
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "The name change failed. Try again."
        );
      }
    });
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="block space-y-1">
        <span className={labelClass}>Full name</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
          maxLength={120}
          required
          className={inputClass}
        />
      </label>
      <button
        type="submit"
        disabled={pending || !name.trim() || name.trim() === savedName}
        aria-busy={pending ? true : undefined}
        className={buttonClass}
      >
        {pending ? "Saving…" : "Save name"}
      </button>
    </form>
  );
}

export function PasswordForm() {
  const [pending, start] = useTransition();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (pending) return;
    if (next !== confirm) {
      toast.error("The two new passwords don't match.");
      return;
    }
    start(async () => {
      try {
        unwrap(
          await changePasswordAction({ currentPassword: current, newPassword: next })
        );
        setCurrent("");
        setNext("");
        setConfirm("");
        toast.success("Password changed. Other signed-in sessions stay active.");
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "The password change failed. Try again."
        );
      }
    });
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="block space-y-1">
        <span className={labelClass}>Current password</span>
        <input
          type="password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          autoComplete="current-password"
          required
          className={inputClass}
        />
      </label>
      <label className="block space-y-1">
        <span className={labelClass}>New password</span>
        <input
          type="password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          autoComplete="new-password"
          minLength={PASSWORD_MIN_LENGTH}
          required
          className={inputClass}
        />
        <span className="block text-sm text-on-surface-variant">
          At least {PASSWORD_MIN_LENGTH} characters, with upper and lower case,
          a digit and a symbol.
        </span>
      </label>
      <label className="block space-y-1">
        <span className={labelClass}>Repeat it</span>
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          minLength={PASSWORD_MIN_LENGTH}
          required
          className={inputClass}
        />
      </label>
      <button
        type="submit"
        disabled={pending || !current || !next || !confirm}
        aria-busy={pending ? true : undefined}
        className={buttonClass}
      >
        {pending ? "Changing…" : "Change password"}
      </button>
    </form>
  );
}
