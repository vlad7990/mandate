import { createClient } from "@supabase/supabase-js";
import { PortalClient, type ContextRow, type SearchRow } from "./portal-client";

export const metadata = {
  title: "Your data · Candidate portal",
};

/**
 * The candidate's window (D7/D8): what this search firm holds about
 * them, which of its searches they are in, and the four acts that are
 * theirs — correct contact details, submit a newer CV, withdraw, and
 * request erasure. Hard-public like /invite/[token]: the token in the
 * URL is the only credential, and every read and write lands in a 073
 * RPC that validates it. One dead screen for every dead-link state.
 */
export default async function CandidatePortalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const [ctxQ, searchesQ] = await Promise.all([
    anon.rpc("candidate_portal_context", { p_token: token }),
    anon.rpc("candidate_portal_list_searches", { p_token: token }),
  ]);

  const ctx = ((ctxQ.data ?? []) as ContextRow[])[0];
  if (ctxQ.error || !ctx) {
    return <DeadLink />;
  }
  const searches = (searchesQ.data ?? []) as SearchRow[];

  return (
    <div className="min-h-screen bg-background font-body-main text-on-background">
      <header className="border-b border-outline-variant bg-surface-container">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4">
          <span className="font-mono-label text-mono-label uppercase tracking-widest text-primary">
            Mandate{" // "}Candidate portal
          </span>
          <span className="font-mono-label text-mono-label uppercase tracking-widest text-outline">
            {ctx.organization_name}
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-8">
        <PortalClient token={token} ctx={ctx} searches={searches} />
      </main>

      <footer className="mx-auto max-w-3xl px-5 pb-8">
        <p className="font-mono-label text-mono-label uppercase tracking-widest text-outline">
          This page is operated by {ctx.organization_name} via Mandate. It
          shows everything the search team holds about you.
        </p>
      </footer>
    </div>
  );
}

function DeadLink() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-5 font-body-main">
      <div className="max-w-md space-y-3 border border-outline-variant bg-surface-container px-6 py-6">
        <p className="font-mono-label text-mono-label uppercase tracking-widest text-error">
          This link is not valid
        </p>
        <p className="text-body-main text-on-surface-variant">
          It may have expired or been replaced. Ask the search team that
          contacted you for a fresh link.
        </p>
      </div>
    </div>
  );
}
