import Link from "next/link";
import { RecoverForm } from "./recover-form";

/**
 * Password recovery, step one: ask for the email. The answer is the
 * same whether or not the address has an account (D2) — this screen
 * exists to help the person locked out, not to confirm to anyone else
 * who holds an account here. Works identically for staff and externals
 * (D1): the flow doesn't know or care which side of the client boundary
 * the account lives on.
 */
export default function RecoverPage() {
  return (
    <div className="min-h-screen bg-background font-body-main text-on-background">
      <main className="mx-auto max-w-xl space-y-5 px-5 py-16">
        <p className="font-mono-label text-mono-label uppercase tracking-widest text-primary">
          Mandate{" // "}account recovery
        </p>
        <h1 className="font-h1 text-h1 tracking-tight text-on-surface">
          Reset your password
        </h1>
        <p className="text-body-main text-on-surface-variant">
          Enter the email address you sign in with. If it has an account,
          a recovery link is on its way — follow it to set a new password.
        </p>
        <RecoverForm />
        <p className="font-mono-label text-mono-label uppercase tracking-widest text-outline">
          <Link href="/auth/signin" className="transition-colors hover:text-primary">
            ← Back to sign in
          </Link>
        </p>
      </main>
    </div>
  );
}
