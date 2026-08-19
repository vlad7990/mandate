import { requirePortalAccess } from "@/lib/auth/portal-access";
import { ROLE_LABELS } from "@/lib/auth/roles";
import { NameForm, PasswordForm } from "@/components/account/account-forms";

/**
 * The external's account page (D1): who the portal believes they are, and
 * the two self-service edits — name and password. Everything else on the
 * identity card is deliberately read-only, and says by whom it is set:
 * email is identity (founder/re-invite territory), role and access are
 * the search team's and the client admin's to manage.
 */
export default async function PortalSettingsPage() {
  const access = await requirePortalAccess();

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="font-mono-label text-mono-label uppercase tracking-widest text-outline">
          {access.clientName}{" // "}account
        </p>
        <h1 className="font-h1 text-h1 tracking-tight text-on-surface">
          Your account
        </h1>
        <p className="text-body-main text-on-surface-variant">
          Your name and password are yours to change. Everything else here is
          managed by {access.organizationName} or your company&apos;s admin.
        </p>
      </header>

      <section className="border border-outline-variant bg-surface-container px-5 py-5">
        <h2 className="font-mono-label text-mono-label uppercase tracking-widest text-primary">
          Identity
        </h2>
        <dl className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <IdentityField label="Name" value={access.fullName} />
          <IdentityField label="Email" value={access.email} mono />
          <IdentityField label="Role" value={ROLE_LABELS[access.role]} />
          <IdentityField label="Company" value={access.clientName} />
        </dl>
        <p className="mt-4 font-mono-label text-mono-label uppercase tracking-widest text-outline">
          Portal operated by {access.organizationName} via Mandate. To change
          your email address, ask the search team to re-invite you.
        </p>
      </section>

      <section className="border border-outline-variant bg-surface-container px-5 py-5">
        <h2 className="font-mono-label text-mono-label uppercase tracking-widest text-primary">
          Name
        </h2>
        <div className="mt-4 max-w-md">
          <NameForm initialName={access.fullName} />
        </div>
      </section>

      <section className="border border-outline-variant bg-surface-container px-5 py-5">
        <h2 className="font-mono-label text-mono-label uppercase tracking-widest text-primary">
          Password
        </h2>
        <p className="mt-2 text-body-main text-on-surface-variant">
          Changing your password asks for the current one first. Forgotten it?
          Sign out and use the recovery link on the sign-in page.
        </p>
        <div className="mt-4 max-w-md">
          <PasswordForm />
        </div>
      </section>
    </div>
  );
}

function IdentityField({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="font-mono-label text-mono-label uppercase tracking-widest text-outline">
        {label}
      </dt>
      <dd
        className={
          mono
            ? "mt-1 font-mono-data text-body-main text-on-surface"
            : "mt-1 text-body-main text-on-surface"
        }
      >
        {value}
      </dd>
    </div>
  );
}
