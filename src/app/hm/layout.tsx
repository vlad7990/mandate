import { Toaster } from "@/components/ui/sonner";

// Minimal layout for the public hiring-manager portal route. No
// sidebar, no auth gate, no dashboard chrome — the recipient is an
// unauthenticated visitor with only a token. Wraps the page in a
// content-only chrome so the brand still reads but the surface is
// dedicated to the portal content.

export default function HiringManagerPublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background text-on-background flex flex-col">
      <header className="px-6 py-4 border-b border-outline-variant flex items-center justify-between">
        <div className="flex items-baseline gap-3">
          <span className="font-black text-primary-container tracking-widest text-lg">
            M
          </span>
          <span className="font-mono uppercase tracking-tighter text-[10px] text-outline">
            MANDATE · HIRING MANAGER PORTAL
          </span>
        </div>
        <span className="font-mono uppercase tracking-tighter text-[10px] text-outline">
          V.02.HM
        </span>
      </header>
      <main className="flex-1 px-6 py-6 max-w-[1100px] w-full mx-auto">
        {children}
      </main>
      <footer className="px-6 py-3 border-t border-outline-variant text-center font-mono-label text-mono-label text-outline uppercase tracking-widest">
        Powered by Mandate · Executive Search Intelligence
      </footer>
      <Toaster richColors position="top-right" />
    </div>
  );
}
