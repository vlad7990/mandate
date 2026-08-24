import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  IconClock,
} from "@/components/icons";

export default async function PendingPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/signin");
  }

  const { data: profile } = await supabase
    .from("users")
    .select("status, full_name, email")
    .eq("id", user.id)
    .single();

  if (profile?.status === "active") {
    redirect("/");
  }

  if (profile?.status === "suspended") {
    await supabase.auth.signOut();
    redirect(
      `/auth/signin?error=${encodeURIComponent("Your account is suspended. Contact a workspace admin.")}`
    );
  }

  const displayName = profile?.full_name || profile?.email || user.email;

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-background text-on-surface font-body-main overflow-hidden">
      <div className="fixed inset-0 neural-bg opacity-40 z-0" />
      <div className="fixed inset-0 bg-gradient-to-tr from-surface-container-lowest via-background to-surface-container-low opacity-90 z-0" />

      {/*
        Fixed top wordmark — mirrors the visual placement of signin/
        signup, but here clicking it submits a POST to /auth/signout
        rather than a plain link to /. A pending user IS authenticated,
        so a direct link to / would just bounce them back here via the
        proxy → dashboard-layout redirect chain. Signing out first
        gives them a clean exit to the marketing landing.
      */}
      <header className="fixed top-0 left-0 w-full flex items-start h-auto py-3 px-6 bg-transparent z-50">
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            aria-label="Sign out and return to the Mandate landing page"
            className="group flex flex-col items-start gap-0.5 text-left bg-transparent border-0 p-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
          >
            <span className="text-lg font-bold tracking-tighter text-on-surface uppercase font-h1 group-hover:text-primary transition-colors">
              Mandate
            </span>
            <span className="font-mono-label text-mono-label uppercase tracking-widest text-on-surface-variant group-hover:text-primary transition-colors flex items-center gap-1.5">
              <span aria-hidden>←</span> Sign out &amp; exit
            </span>
          </button>
        </form>
      </header>

      <main className="relative z-10 w-full max-w-[520px] px-6">
        <div className="bg-surface-container-low border border-outline-variant p-10 relative">
          <div className="absolute -top-px left-0 w-full h-px bg-gradient-to-r from-transparent via-tertiary to-transparent opacity-50" />

          <div className="inline-flex items-center px-2 py-1 bg-tertiary/10 border border-tertiary/20 mb-6">
            <IconClock size={14} className="text-tertiary mr-2 inline-block" />
            <span className="font-mono-label text-mono-label text-tertiary uppercase tracking-widest">
              Provisioning In Review
            </span>
          </div>

          <h1 className="font-h2 text-h2 text-on-surface mb-3">
            Your access request is queued.
          </h1>
          <p className="text-on-surface-variant font-body-main mb-8">
            Hi {displayName}. A Mandate workspace administrator will review your request and
            grant access shortly. You&rsquo;ll receive an email once your account is activated.
          </p>

          <div className="space-y-3 border-t border-outline-variant pt-6">
            <div className="flex justify-between text-body-main">
              <span className="text-on-surface-variant font-mono-label text-mono-label uppercase tracking-wider">
                Identity
              </span>
              <span className="text-on-surface">{user.email}</span>
            </div>
            <div className="flex justify-between text-body-main">
              <span className="text-on-surface-variant font-mono-label text-mono-label uppercase tracking-wider">
                Status
              </span>
              <span className="text-tertiary font-mono-label uppercase tracking-wider">
                {profile?.status ?? "pending"}
              </span>
            </div>
          </div>

          <form action="/auth/signout" method="post" className="mt-8">
            <button
              type="submit"
              className="w-full bg-surface-container-lowest border border-outline-variant text-on-surface py-3 hover:bg-surface-container-high transition-colors font-mono-label text-mono-label uppercase tracking-wider"
            >
              Sign Out
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
