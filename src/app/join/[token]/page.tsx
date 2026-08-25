import { createServerSupabaseClient } from "@/lib/supabase-server";
import { ROLE_LABELS, parseRole } from "@/lib/auth/roles";
import { StaffRedemptionForm } from "./redemption-form";

/**
 * The staff invitation redemption page (§134 D2) — public, like
 * /invite/[token]: the visitor has no account yet by definition, and the
 * uuid in the URL is the only credential. `verify_staff_invitation` (113)
 * answers for anon callers and returns the invitation's face only while it
 * is live; every dead state collapses to one screen that does not say which
 * kind of dead.
 */

type VerifyRow = {
  email: string;
  full_name: string;
  role: string;
  organization_name: string;
  invited_by_label: string;
  expires_at: string;
};

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value
  );
}

export const metadata = { title: "Join your team" };

export default async function JoinPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  let invitation: VerifyRow | null = null;
  if (isUuid(token)) {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.rpc("verify_staff_invitation", {
      p_token: token,
    });
    if (error) {
      console.error("[join] verification failed", error);
    }
    invitation = ((data ?? []) as VerifyRow[])[0] ?? null;
  }

  if (!invitation) {
    return (
      <Shell>
        <p className="font-mono-label text-mono-label uppercase tracking-widest text-error">
          Invitation not available
        </p>
        <h1 className="font-h1 text-h1 tracking-tight text-on-surface">
          This link no longer works
        </h1>
        <p className="text-body-main text-on-surface-variant">
          The invitation may have expired, been withdrawn, or already been
          used. Ask the person who invited you to send a fresh one — links
          are personal and single-use.
        </p>
      </Shell>
    );
  }

  const role = parseRole(invitation.role);
  const roleLabel = role ? ROLE_LABELS[role] : invitation.role;

  return (
    <Shell>
      <p className="font-mono-label text-mono-label uppercase tracking-widest text-primary">
        Mandate{" // "}join your team
      </p>
      <h1 className="font-h1 text-h1 tracking-tight text-on-surface">
        You&apos;re invited to {invitation.organization_name}
      </h1>
      <p className="text-body-main text-on-surface-variant">
        {invitation.invited_by_label || invitation.organization_name} invited
        you as <span className="text-on-surface">{roleLabel}</span>. Set a
        password for <span className="text-on-surface">{invitation.email}</span>{" "}
        and you&apos;re in — clicking this link already confirmed your email.
      </p>
      <StaffRedemptionForm token={token} inviteeName={invitation.full_name} />
      <p className="font-mono-label text-mono-label uppercase tracking-widest text-outline">
        Link expires{" "}
        {new Date(invitation.expires_at).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "long",
          year: "numeric",
          timeZone: "UTC",
        })}
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background font-body-main text-on-background">
      <main className="mx-auto max-w-xl space-y-5 px-5 py-16">{children}</main>
    </div>
  );
}
