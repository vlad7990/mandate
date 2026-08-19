import Link from "next/link";
import { Toaster } from "@/components/ui/sonner";
import { requirePortalAccess } from "@/lib/auth/portal-access";
import { ROLE_LABELS } from "@/lib/auth/roles";

/**
 * The client portal shell — deliberately not the staff dashboard chrome.
 * An external sees their company's name, their own standing, and at most
 * three destinations. No sidebar, no copilot, no org rails: every element
 * removed here is one that cannot leak a surface it should not name.
 */
export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const access = await requirePortalAccess();

  return (
    <div className="min-h-screen bg-background font-body-main text-on-background">
      <header className="border-b border-outline-variant bg-surface-container">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4">
          <Link
            href="/portal"
            className="font-mono-label text-mono-label uppercase tracking-widest text-primary"
          >
            Mandate{" // "}Client portal
          </Link>
          <p className="font-mono-label text-mono-label uppercase tracking-widest text-outline">
            {access.clientName}
            <span className="px-2">·</span>
            {ROLE_LABELS[access.role]}
          </p>
          <nav className="ml-auto flex items-center gap-5">
            <Link
              href="/portal"
              className="font-mono-label text-mono-label uppercase tracking-wider text-on-surface-variant transition-colors hover:text-primary"
            >
              Searches
            </Link>
            {access.role === "client_admin" && (
              <Link
                href="/portal/people"
                className="font-mono-label text-mono-label uppercase tracking-wider text-on-surface-variant transition-colors hover:text-primary"
              >
                People
              </Link>
            )}
            <Link
              href="/portal/settings"
              className="font-mono-label text-mono-label uppercase tracking-wider text-on-surface-variant transition-colors hover:text-primary"
            >
              Account
            </Link>
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                className="font-mono-label text-mono-label uppercase tracking-wider text-outline transition-colors hover:text-error"
              >
                Sign out
              </button>
            </form>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-8">{children}</main>

      <footer className="mx-auto max-w-5xl px-5 pb-8">
        <p className="font-mono-label text-mono-label uppercase tracking-widest text-outline">
          Portal operated by {access.organizationName} via Mandate.
        </p>
      </footer>

      <Toaster richColors position="top-right" />
    </div>
  );
}
