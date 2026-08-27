import { createClient } from "@supabase/supabase-js";
import { turnstileConfigured } from "@/lib/turnstile";
import { ApplyForm } from "./apply-form";

/**
 * §190 — the public apply page. The token in the URL is the whole
 * credential (073's trust shape); the page's only read is the
 * anon-executable `verify_apply_token`, which returns the role's title,
 * the company, and whether the door is open — and not one byte more.
 *
 * FAIL-CLOSED: with the founder's Turnstile keys absent the page shows
 * the closed state even for a valid, open token. A public CV-upload
 * endpoint does not open without a bot challenge.
 */

export const dynamic = "force-dynamic";

type ApplyContext = {
  role_title: string;
  company_name: string;
  open: boolean;
};

function anonClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

export default async function ApplyPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  let ctx: ApplyContext | null = null;
  if (/^[0-9a-f-]{36}$/i.test(token)) {
    const { data } = await anonClient()
      .rpc("verify_apply_token", { p_token: token })
      .maybeSingle<ApplyContext>();
    ctx = data ?? null;
  }

  const doorOpen = Boolean(ctx?.open) && turnstileConfigured();

  return (
    <div className="min-h-screen bg-surface text-on-surface">
      <div className="max-w-xl mx-auto px-6 py-14 space-y-8">
        <header className="space-y-2">
          <div className="flex items-center gap-3">
            <span className="h-px w-8 bg-primary" />
            <span className="font-mono-label text-mono-label text-primary uppercase tracking-widest">
              Application
            </span>
          </div>
          {ctx ? (
            <>
              <h1 className="font-h1 text-h1 tracking-tight">{ctx.role_title}</h1>
              <p className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
                {ctx.company_name}
              </p>
            </>
          ) : (
            <h1 className="font-h1 text-h1 tracking-tight">
              This link is not valid
            </h1>
          )}
        </header>

        {ctx && doorOpen && <ApplyForm token={token} />}

        {ctx && !doorOpen && (
          <div className="border border-outline-variant bg-surface-container-low p-4">
            <p className="text-body-main text-on-surface-variant leading-relaxed">
              Applications for this role are not open right now. If you were
              given this link directly, check back shortly or contact the
              recruiter who sent it.
            </p>
          </div>
        )}

        {!ctx && (
          <p className="text-body-main text-on-surface-variant leading-relaxed">
            The application link you followed does not exist or has been
            closed. There is nothing to submit here.
          </p>
        )}
      </div>
    </div>
  );
}
