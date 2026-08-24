import Link from "next/link";
import { signInAction } from "./actions";
import {
  IconArrowRight,
  IconAtSign,
  IconLock,
  IconNetwork,
} from "@/components/icons";

type SearchParams = Promise<{
  error?: string;
  check_email?: string;
  email?: string;
  next?: string;
}>;

export default async function SignInPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const error = sp.error;
  const checkEmail = sp.check_email === "1";
  const prefilledEmail = sp.email ?? "";

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden bg-background text-on-surface font-body-main">
      <div className="fixed inset-0 neural-bg opacity-40 z-0" />
      <div className="fixed inset-0 bg-gradient-to-tr from-surface-container-lowest via-background to-surface-container-low opacity-90 z-0" />

      <nav className="fixed top-0 left-0 w-full flex justify-between items-center h-12 px-6 bg-transparent z-50">
        <Link
          href="/"
          aria-label="Mandate home"
          className="flex items-center gap-2.5 text-lg font-bold tracking-tighter text-on-surface uppercase font-h1 hover:text-primary transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/mark.png" alt="" aria-hidden className="h-[22px] w-[22px]" />
          Mandate
        </Link>
      </nav>

      <main className="z-10 w-full max-w-[420px] px-6">
        <div className="bg-surface-container-low border border-outline-variant p-8 relative">
          <div className="absolute -top-px left-0 w-full h-px bg-gradient-to-r from-transparent via-primary to-transparent opacity-50" />

          <header className="mb-8">
            <h1 className="font-h2 text-h2 text-on-surface mb-2">Access Intelligence</h1>
            <p className="text-on-surface-variant font-body-main">
              Secure gateway to Mandate Neural Analytics.
            </p>
          </header>

          {checkEmail && (
            <div className="mb-6 border border-primary/40 bg-primary/10 px-4 py-3 text-on-surface text-body-main">
              Check your inbox to confirm your email before signing in.
            </div>
          )}

          {error && (
            <div className="mb-6 border border-error/40 bg-error-container/30 px-4 py-3 text-error text-body-main">
              {error}
            </div>
          )}

          <form action={signInAction} className="space-y-6">
            {/* The proxy puts the originally requested path here as
                `?next=`. Without this field the action never saw it, so
                following a deep link and signing in always dumped you on
                the dashboard root. The action validates it before use. */}
            {sp.next && <input type="hidden" name="next" value={sp.next} />}
            <div className="space-y-2">
              <label
                htmlFor="email"
                className="block font-mono-label text-mono-label uppercase text-on-surface-variant tracking-wider"
              >
                Email Address
              </label>
              <div className="relative">
                <IconAtSign
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant"
                />
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  defaultValue={prefilledEmail}
                  placeholder="name@enterprise.com"
                  className="w-full bg-surface-container-lowest border border-outline-variant p-3 pl-10 text-on-surface focus:border-primary-container focus:ring-1 focus:ring-primary-container transition-all outline-none placeholder:text-surface-container-highest"
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label
                  htmlFor="password"
                  className="block font-mono-label text-mono-label uppercase text-on-surface-variant tracking-wider"
                >
                  Password
                </label>
                <Link
                  href="/auth/recover"
                  className="font-mono-label text-mono-label text-on-surface-variant transition-colors hover:text-primary"
                >
                  Forgot Security Key?
                </Link>
              </div>
              <div className="relative">
                <IconLock
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant"
                />
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="w-full bg-surface-container-lowest border border-outline-variant p-3 pl-10 text-on-surface focus:border-primary-container focus:ring-1 focus:ring-primary-container transition-all outline-none placeholder:text-surface-container-highest"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full btn-notch bg-primary-container text-on-primary-container py-3 hover:brightness-110 active:scale-[0.98] transition-all flex justify-center items-center gap-2 group font-h2 text-body-main"
            >
              Sign In
              <IconArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
            </button>
          </form>

          <div className="relative my-8">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-outline-variant opacity-30" />
            </div>
            <div className="relative flex justify-center text-mono-label uppercase font-mono-label text-on-surface-variant bg-surface-container-low px-4">
              Enterprise Protocol
            </div>
          </div>

          <button
            type="button"
            disabled
            className="w-full bg-surface-container-lowest border border-outline-variant text-on-surface py-3 transition-colors flex justify-center items-center gap-2 group opacity-60 cursor-not-allowed font-body-main"
            title="Enterprise SSO is coming soon."
          >
            <IconNetwork size={17} className="text-primary" />
            Continue with Enterprise SSO
          </button>

          <footer className="mt-8 text-center">
            <p className="text-on-surface-variant text-mono-label uppercase font-mono-label">
              Authorized Personnel Only
            </p>
            <p className="mt-4 text-on-surface-variant text-body-main">
              New operator?{" "}
              <Link
                href="/auth/signup"
                className="text-primary font-semibold hover:underline"
              >
                Apply for Provisioning
              </Link>
            </p>
          </footer>
        </div>
      </main>

      <footer className="fixed bottom-0 w-full flex justify-between items-center py-4 px-8 bg-transparent">
        <span className="font-mono-label text-mono-label uppercase tracking-widest text-on-surface-variant opacity-50">
          © 2026 Mandate Intelligence. All rights reserved.
        </span>
        <div className="flex items-center gap-4 text-mono-label text-on-surface-variant font-mono-label uppercase tracking-widest">
          <span className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-emerald-500 animate-pulse" />
            Node Status: Active
          </span>
          <span className="opacity-30">|</span>
          <span className="flex items-center gap-2">
            V2.4.0-STABLE
          </span>
        </div>
      </footer>
    </div>
  );
}
