import Link from "next/link";
import { Toaster } from "@/components/ui/sonner";
import { requirePlatformOperate } from "@/lib/auth/access";
import { DASHBOARD_HOME } from "@/lib/routes";

/**
 * The platform operator's shell (D3) — deliberately neither the staff
 * dashboard nor the client portal. Before this route tree existed, the
 * operator hat and the Mandate-HQ-admin hat shared /app/settings with
 * nothing on screen saying which hat was acting; here everything on
 * screen is a platform act. The proxy gates the whole tree on
 * platform:operate (resolved from is_founder — held by no role), and
 * this layout re-checks per the house belt-and-braces.
 */
export default async function OpsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const access = await requirePlatformOperate();

  return (
    <div className="min-h-screen bg-background font-body-main text-on-background">
      <header className="border-b border-outline-variant bg-surface-container">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4">
          <Link
            href="/ops"
            className="font-mono-label text-mono-label uppercase tracking-widest text-tertiary"
          >
            Mandate{" // "}Platform operations
          </Link>
          <p className="font-mono-label text-mono-label uppercase tracking-widest text-outline">
            {access.email}
            <span className="px-2">·</span>
            Operator
          </p>
          <nav className="ml-auto flex items-center gap-5">
            <Link
              href="/ops"
              className="font-mono-label text-mono-label uppercase tracking-wider text-on-surface-variant transition-colors hover:text-tertiary"
            >
              Overview
            </Link>
            <Link
              href="/ops/accounts"
              className="font-mono-label text-mono-label uppercase tracking-wider text-on-surface-variant transition-colors hover:text-tertiary"
            >
              Accounts
            </Link>
            <Link
              href="/ops/waitlist"
              className="font-mono-label text-mono-label uppercase tracking-wider text-on-surface-variant transition-colors hover:text-tertiary"
            >
              Waitlist
            </Link>
            <Link
              href={DASHBOARD_HOME}
              className="font-mono-label text-mono-label uppercase tracking-wider text-outline transition-colors hover:text-primary"
            >
              Back to app
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-8">{children}</main>

      <footer className="mx-auto max-w-6xl px-5 pb-8">
        <p className="font-mono-label text-mono-label uppercase tracking-widest text-outline">
          Platform operations. Every act here lands in the affected
          organisation&apos;s trail with you as actor.
        </p>
      </footer>

      <Toaster richColors position="top-right" />
    </div>
  );
}
