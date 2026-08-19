import { createServerSupabaseClient } from "@/lib/supabase-server";
import { ROLE_LABELS, parseRole } from "@/lib/auth/roles";
import { cn } from "@/lib/utils";
import { UserStatusActions } from "../user-actions";

export const metadata = {
  title: "Accounts · Platform operations · Mandate",
};

/**
 * Every account on the platform, named to its organisation or client —
 * the read 072's founder policies exist for. Staff and externals are
 * two tables because they are two principal classes (the 067 XOR), not
 * one list with a column.
 */

type UserRow = {
  id: string;
  email: string;
  full_name: string | null;
  role: string | null;
  status: string;
  is_founder: boolean;
  organization_id: string | null;
  client_id: string | null;
  created_at: string | null;
};

const STATUS_TONE: Record<string, string> = {
  active: "border-secondary-fixed-dim/60 text-secondary-fixed-dim",
  pending: "border-tertiary/60 text-tertiary",
  suspended: "border-error/60 text-error",
};

export default async function OpsAccountsPage() {
  const supabase = await createServerSupabaseClient();

  const [usersQ, orgsQ, clientsQ] = await Promise.all([
    supabase
      .from("users")
      .select(
        "id, email, full_name, role, status, is_founder, organization_id, client_id, created_at"
      )
      .order("created_at", { ascending: false }),
    supabase.from("organizations").select("id, name"),
    supabase.from("clients").select("id, organization_id, name"),
  ]);

  const users = (usersQ.data ?? []) as UserRow[];
  const orgName = new Map(
    ((orgsQ.data ?? []) as { id: string; name: string }[]).map((o) => [o.id, o.name])
  );
  const clientById = new Map(
    ((clientsQ.data ?? []) as { id: string; organization_id: string; name: string }[]).map(
      (c) => [c.id, c]
    )
  );

  const staff = users.filter((u) => !u.client_id);
  const externals = users.filter((u) => u.client_id);

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <p className="font-mono-label text-mono-label uppercase tracking-widest text-outline">
          Mandate{" // "}accounts
        </p>
        <h1 className="font-h1 text-h1 tracking-tight text-on-surface">
          Every account on the platform
        </h1>
        <p className="text-body-main text-on-surface-variant">
          Role and status changes for a customer org&apos;s members belong to
          that org&apos;s admins; what the operator holds is approval,
          suspension and the organisation boundary — each act landing in the
          affected org&apos;s trail.
        </p>
      </header>

      <AccountTable
        title={`Staff (${staff.length})`}
        rows={staff}
        place={(u) =>
          u.organization_id
            ? orgName.get(u.organization_id) ?? "unknown org"
            : "no organisation"
        }
      />

      <AccountTable
        title={`Externals (${externals.length})`}
        rows={externals}
        place={(u) => {
          const client = u.client_id ? clientById.get(u.client_id) : null;
          if (!client) return "unknown client";
          const via = orgName.get(client.organization_id);
          return via ? `${client.name} · via ${via}` : client.name;
        }}
      />
    </div>
  );
}

function AccountTable({
  title,
  rows,
  place,
}: {
  title: string;
  rows: UserRow[];
  place: (u: UserRow) => string;
}) {
  return (
    <section className="space-y-3">
      <h2 className="font-mono-label text-mono-label uppercase tracking-widest text-tertiary">
        {title}
      </h2>
      {rows.length === 0 ? (
        <p className="border border-outline-variant bg-surface-container px-5 py-4 text-body-main text-on-surface-variant">
          None yet.
        </p>
      ) : (
        <ul className="divide-y divide-outline-variant border border-outline-variant bg-surface-container">
          {rows.map((u) => {
            const role = parseRole(u.role);
            return (
              <li
                key={u.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3"
              >
                <span className="text-on-surface">
                  {u.full_name?.trim() || "—"}
                  {u.is_founder && (
                    <span className="ml-2 font-mono-label text-mono-label uppercase tracking-wider text-tertiary">
                      founder
                    </span>
                  )}
                </span>
                <span className="font-mono-data text-body-main text-on-surface-variant">
                  {u.email}
                </span>
                <span className="font-mono-label text-mono-label uppercase tracking-wider text-outline">
                  {role ? ROLE_LABELS[role] : u.role ?? "—"}
                </span>
                <span className="font-mono-label text-mono-label uppercase tracking-wider text-outline">
                  {place(u)}
                </span>
                <span
                  className={cn(
                    "ml-auto border px-2 py-0.5 font-mono-label text-mono-label uppercase tracking-wider",
                    STATUS_TONE[u.status] ?? "border-outline-variant text-outline"
                  )}
                >
                  {u.status}
                </span>
                {!u.is_founder && u.status !== "pending" && (
                  <UserStatusActions
                    userId={u.id}
                    fullName={u.full_name?.trim() || u.email}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
