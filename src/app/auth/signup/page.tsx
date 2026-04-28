import Link from "next/link";
import { signUpAction } from "./actions";

type SearchParams = Promise<{ error?: string }>;

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { error } = await searchParams;

  return (
    <div className="bg-background text-on-surface font-body-main min-h-screen">
      <header className="fixed top-0 z-50 flex h-12 w-full items-center justify-between px-6 bg-surface-container-lowest/80 backdrop-blur border-b border-outline-variant tracking-tight">
        <div className="text-lg font-bold tracking-tighter text-on-surface uppercase font-h1">
          Mandate
        </div>
        <div className="flex items-center gap-2 px-2 py-1 bg-surface-container rounded border border-outline-variant">
          <span className="material-symbols-outlined text-[16px] text-primary">dark_mode</span>
          <span className="text-mono-label font-mono-label uppercase text-on-surface-variant">
            System Mode
          </span>
        </div>
      </header>

      <main className="min-h-screen pt-12 pb-16 flex flex-col md:flex-row overflow-hidden">
        <section className="hidden lg:flex w-1/3 bg-surface-container-lowest border-r border-outline-variant relative flex-col justify-between p-loose overflow-hidden">
          <div className="absolute inset-0 terminal-grid opacity-20" />
          <div className="relative z-10 space-y-gutter">
            <div className="inline-flex items-center px-2 py-1 bg-primary/10 border border-primary/20 rounded">
              <span
                className="material-symbols-outlined text-primary text-[14px] mr-2"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                verified_user
              </span>
              <span className="font-mono-label text-mono-label text-primary uppercase tracking-widest">
                Executive Intelligence
              </span>
            </div>
            <h1 className="font-h1 text-h1 text-on-surface max-w-md">
              The Standard for High-Stakes Decision Making.
            </h1>
            <p className="text-on-surface-variant font-body-main max-w-xs">
              Access real-time market signals, institutional network nodes, and predictive
              intelligence in a secure, terminal-grade environment.
            </p>
          </div>

          <div className="relative z-10">
            <div className="bg-surface-container p-gutter border border-outline-variant rounded-lg space-y-tight">
              <div className="flex justify-between items-center mb-unit">
                <span className="font-mono-label text-mono-label text-outline uppercase">
                  Network Integrity
                </span>
                <span className="font-data-point text-data-point text-primary">99.9%</span>
              </div>
              <div className="w-full bg-surface-container-highest h-1 rounded-full overflow-hidden">
                <div className="bg-primary h-full" style={{ width: "99.9%" }} />
              </div>
              <div className="flex gap-4 mt-gutter">
                <div className="flex-1 border-l-2 border-primary pl-tight">
                  <div className="font-mono-label text-mono-label text-outline uppercase">
                    Encrypted
                  </div>
                  <div className="font-data-point text-data-point">AES-256</div>
                </div>
                <div className="flex-1 border-l-2 border-tertiary pl-tight">
                  <div className="font-mono-label text-mono-label text-outline uppercase">
                    Uptime
                  </div>
                  <div className="font-data-point text-data-point">24/7/365</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="flex-1 flex items-center justify-center p-container-padding bg-background relative">
          <div className="w-full max-w-xl space-y-loose">
            <div className="space-y-tight">
              <div className="flex items-center gap-2">
                <span className="w-8 h-1 bg-primary rounded-full" />
                <span className="w-2 h-1 bg-surface-container-highest rounded-full" />
                <span className="w-2 h-1 bg-surface-container-highest rounded-full" />
                <span className="font-mono-label text-mono-label text-outline uppercase ml-2">
                  Step 1: Identity
                </span>
              </div>
              <h2 className="font-h2 text-h2 text-on-surface">Join the Intelligence Network</h2>
              <p className="text-on-surface-variant font-body-main">
                Initialize your executive credentials to begin onboarding.
              </p>
            </div>

            {error && (
              <div className="border border-error/40 bg-error-container/30 px-4 py-3 rounded text-error text-body-main">
                {error}
              </div>
            )}

            <form action={signUpAction} className="space-y-gutter">
              <div className="space-y-unit">
                <label
                  htmlFor="full_name"
                  className="font-mono-label text-mono-label text-on-surface-variant uppercase tracking-wider"
                >
                  Full Name
                </label>
                <input
                  id="full_name"
                  name="full_name"
                  type="text"
                  required
                  autoComplete="name"
                  placeholder="e.g. Marcus Thorne"
                  className="w-full bg-surface-container border border-outline-variant focus:border-primary focus:ring-0 text-on-surface p-3 font-body-main transition-colors placeholder:text-outline/50 outline-none rounded"
                />
              </div>

              <div className="space-y-unit">
                <label
                  htmlFor="email"
                  className="font-mono-label text-mono-label text-on-surface-variant uppercase tracking-wider"
                >
                  Organization Email
                </label>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[20px]">
                    alternate_email
                  </span>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="m.thorne@firm-mandate.com"
                    className="w-full bg-surface-container border border-outline-variant focus:border-primary focus:ring-0 text-on-surface pl-10 p-3 font-body-main transition-colors placeholder:text-outline/50 outline-none rounded"
                  />
                </div>
              </div>

              <div className="space-y-unit">
                <label
                  htmlFor="password"
                  className="font-mono-label text-mono-label text-on-surface-variant uppercase tracking-wider"
                >
                  Access Key (min 8 characters)
                </label>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[20px]">
                    lock
                  </span>
                  <input
                    id="password"
                    name="password"
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    placeholder="••••••••"
                    className="w-full bg-surface-container border border-outline-variant focus:border-primary focus:ring-0 text-on-surface pl-10 p-3 font-body-main transition-colors placeholder:text-outline/50 outline-none rounded"
                  />
                </div>
              </div>

              <div className="pt-gutter flex flex-col gap-gutter">
                <button
                  type="submit"
                  className="w-full bg-primary-container hover:brightness-110 text-on-primary-container py-4 transition-all flex justify-center items-center gap-2 group font-h2 text-body-main rounded"
                >
                  Initialize Onboarding
                  <span className="material-symbols-outlined transition-transform group-hover:translate-x-1">
                    arrow_forward
                  </span>
                </button>
                <div className="flex items-center justify-center gap-4 text-mono-label font-mono-label text-outline uppercase">
                  <span className="flex items-center gap-1">
                    <span
                      className="material-symbols-outlined text-[14px]"
                      style={{ fontVariationSettings: "'FILL' 1" }}
                    >
                      lock
                    </span>
                    SOC2 Type II Certified
                  </span>
                  <span className="w-1 h-1 bg-outline-variant rounded-full" />
                  <span className="flex items-center gap-1">
                    <span
                      className="material-symbols-outlined text-[14px]"
                      style={{ fontVariationSettings: "'FILL' 1" }}
                    >
                      shield
                    </span>
                    End-to-End Encrypted
                  </span>
                </div>
              </div>
            </form>

            <div className="border-t border-outline-variant pt-gutter flex justify-between items-center">
              <p className="text-on-surface-variant text-body-main">Already have an account?</p>
              <Link
                href="/auth/signin"
                className="text-primary font-mono-label text-mono-label uppercase hover:underline"
              >
                Sign In to Mandate
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="fixed bottom-0 z-40 flex w-full items-center justify-between border-t border-outline-variant bg-surface-container-lowest/80 backdrop-blur py-4 px-8">
        <div className="font-mono-label text-mono-label uppercase tracking-widest text-on-surface-variant opacity-60">
          © 2026 Mandate Intelligence. All rights reserved.
        </div>
        <div className="flex gap-6 text-mono-label font-mono-label uppercase tracking-widest text-on-surface-variant opacity-60">
          <span>Privacy</span>
          <span>Terms</span>
          <span>Compliance</span>
        </div>
      </footer>
    </div>
  );
}
