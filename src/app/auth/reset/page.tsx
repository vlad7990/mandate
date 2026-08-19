import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { ResetForm } from "./reset-form";

/**
 * Password recovery, step two: the emailed link has been exchanged for
 * a session by /auth/callback, and this page sets the new password.
 * With no session there is nothing to reset against — back to step one,
 * which is also where an expired or reused link lands (the callback
 * bounces those to sign-in with GoTrue's own message).
 */
export default async function ResetPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/recover");
  }

  return (
    <div className="min-h-screen bg-background font-body-main text-on-background">
      <main className="mx-auto max-w-xl space-y-5 px-5 py-16">
        <p className="font-mono-label text-mono-label uppercase tracking-widest text-primary">
          Mandate{" // "}account recovery
        </p>
        <h1 className="font-h1 text-h1 tracking-tight text-on-surface">
          Set a new password
        </h1>
        <p className="text-body-main text-on-surface-variant">
          For <span className="text-on-surface">{user.email}</span>. Once
          it&apos;s set you&apos;ll land back in your workspace.
        </p>
        <ResetForm />
      </main>
    </div>
  );
}
