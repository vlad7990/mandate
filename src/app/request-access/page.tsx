import Link from "next/link";
import { RequestAccessForm } from "./request-access-form";

export const metadata = {
  title: "Request Access · Mandate",
  description:
    "Apply for access to Mandate, the AI-driven executive search platform.",
};

export default function RequestAccessPage() {
  return (
    <div className="min-h-screen bg-background text-on-background font-body-main flex items-center justify-center px-4 py-10">
      <main className="w-full max-w-xl bg-surface-container border border-outline-variant relative">
        <header className="bg-surface-container-high px-6 py-4 border-b border-outline-variant flex items-center justify-between gap-2">
          <Link
            href="/"
            prefetch={false}
            className="font-mono-label text-mono-label text-primary uppercase tracking-widest flex items-center gap-2 hover:text-on-surface transition-colors"
          >
            <span
              className="material-symbols-outlined text-[14px]"
              style={{ fontVariationSettings: "'FILL' 1" }}
              aria-hidden
            >
              command_line
            </span>
            MANDATE
          </Link>
          <Link
            href="/auth/signin"
            prefetch={false}
            className="font-mono-label text-mono-label text-on-surface-variant uppercase tracking-widest hover:text-primary transition-colors"
          >
            Sign in
          </Link>
        </header>
        <div className="px-6 py-6 space-y-4">
          <div className="space-y-2">
            <h1 className="font-h1 text-h1 text-on-surface tracking-tight">
              Request access
            </h1>
            <p className="text-body-main text-on-surface-variant leading-relaxed">
              Mandate is in closed beta with a hand-picked group of executive
              search firms. Tell us about you and what you&rsquo;re trying to
              solve — we review every application and reply within 48 hours.
            </p>
          </div>
          <RequestAccessForm />
        </div>
      </main>
    </div>
  );
}
