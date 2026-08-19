import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { UserStatusActions } from "./user-actions";

export const metadata = {
  title: "Platform operations",
};

/**
 * The operator's overview: what the platform holds, who is waiting at
 * the door, and the queue that will light up when the candidate slice
 * ships erasure requests (B9 of the final-personas plan). Reads resolve
 * through founder RLS — every users row (002), org and client names
 * (072) — and nothing here reads recruiting data, which is D5's
 * load-bearing negative made visible.
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

type OrgRow = { id: string; name: string; slug: string };

export default async function OpsOverviewPage() {
  const supabase = await createServerSupabaseClient();

  const [usersQ, orgsQ, clientsQ, waitlistQ] = await Promise.all([
    supabase
      .from("users")
      .select(
        "id, email, full_name, role, status, is_founder, organization_id, client_id, created_at"
      )
      .order("created_at", { ascending: false }),
    supabase.from("organizations").select("id, name, slug").order("name"),
    supabase.from("clients").select("id, organization_id, name"),
    supabase
      .from("waitlist")
      .select("id, status")
      .eq("status", "pending"),
  ]);

  const users = (usersQ.data ?? []) as UserRow[];
  const orgs = (orgsQ.data ?? []) as OrgRow[];
  const clients = (clientsQ.data ?? []) as { id: string; organization_id: string; name: string }[];
  const waitlistPending = (waitlistQ.data ?? []).length;

  const staff = users.filter((u) => !u.client_id);
  const externals = users.filter((u) => u.client_id);
  const pending = users.filter((u) => u.status === "pending");
  const orgName = new Map(orgs.map((o) => [o.id, o.name]));

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <p className="font-mono-label text-mono-label uppercase tracking-widest text-outline">
          Mandate{" // "}operator overview
        </p>
        <h1 className="font-h1 text-h1 tracking-tight text-on-surface">
          The platform
        </h1>
      </header>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Organisations" value={orgs.length} />
        <Stat label="Staff accounts" value={staff.length} />
        <Stat label="External accounts" value={externals.length} />
        <Stat label="Clients" value={clients.length} />
        <Stat label="Waitlist pending" value={waitlistPending} highlight={waitlistPending > 0} />
      </section>

      {/* Pending approvals — the act that was on /app/settings, now in
          the operator's own house. */}
      <section className="space-y-3">
        <h2 className="font-mono-label text-mono-label uppercase tracking-widest text-tertiary">
          Pending approvals ({pending.length})
        </h2>
        {pending.length === 0 ? (
          <p className="border border-outline-variant bg-surface-container px-5 py-4 text-body-main text-on-surface-variant">
            Nobody is waiting. New signups appear here for activation and
            an organisation.
          </p>
        ) : (
          <ul className="divide-y divide-outline-variant border border-outline-variant bg-surface-container">
            {pending.map((u) => (
              <li
                key={u.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3"
              >
                <span className="text-on-surface">
                  {u.full_name?.trim() || "—"}
                </span>
                <span className="font-mono-data text-body-main text-on-surface-variant">
                  {u.email}
                </span>
                <span className="font-mono-label text-mono-label uppercase tracking-wider text-outline">
                  {u.organization_id
                    ? orgName.get(u.organization_id) ?? "unknown org"
                    : "no organisation yet"}
                </span>
                <div className="ml-auto">
                  <UserStatusActions
                    userId={u.id}
                    fullName={u.full_name?.trim() || u.email}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Organisations */}
      <section className="space-y-3">
        <h2 className="font-mono-label text-mono-label uppercase tracking-widest text-tertiary">
          Organisations ({orgs.length})
        </h2>
        <ul className="divide-y divide-outline-variant border border-outline-variant bg-surface-container">
          {orgs.map((o) => {
            const members = staff.filter(
              (u) => u.organization_id === o.id && u.status === "active"
            ).length;
            const orgClients = clients.filter((c) => c.organization_id === o.id).length;
            return (
              <li
                key={o.id}
                className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-5 py-3"
              >
                <span className="text-on-surface">{o.name}</span>
                <span className="font-mono-data text-body-main text-outline">{o.slug}</span>
                <span className="ml-auto font-mono-label text-mono-label uppercase tracking-wider text-on-surface-variant">
                  {members} active {members === 1 ? "member" : "members"}
                  <span className="px-2 text-outline-variant">·</span>
                  {orgClients} {orgClients === 1 ? "client" : "clients"}
                </span>
              </li>
            );
          })}
        </ul>
        <p className="font-mono-label text-mono-label uppercase tracking-widest text-outline">
          Accounts across every organisation are on{" "}
          <Link href="/ops/accounts" className="text-tertiary hover:underline">
            Accounts
          </Link>
          .
        </p>
      </section>

      {/* Erasure requests — the queue exists before its first row so the
          operator surface is complete when the candidate slice ships it. */}
      <section className="space-y-3">
        <h2 className="font-mono-label text-mono-label uppercase tracking-widest text-tertiary">
          Erasure requests (0)
        </h2>
        <div className="border border-outline-variant bg-surface-container px-5 py-4">
          <p className="text-body-main text-on-surface-variant">
            No erasure requests. When the candidate portal ships, a
            candidate&apos;s request lands here and on the owning
            organisation&apos;s side; execution stays a deliberate founder
            act per the retention verdict.
          </p>
        </div>
        <div className="relative border border-dashed border-outline-variant">
          <p className="border-b border-dashed border-outline-variant px-5 py-2 font-mono-label text-mono-label uppercase tracking-widest text-tertiary">
            Sample data — how a request will appear
          </p>
          <ul className="divide-y divide-outline-variant opacity-60">
            <li className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-5 py-3">
              <span className="text-on-surface">Jordan Hale</span>
              <span className="font-mono-data text-body-main text-on-surface-variant">
                requested erasure from Halewick Search
              </span>
              <span className="ml-auto font-mono-label text-mono-label uppercase tracking-wider text-outline">
                12 AUG 2026 · awaiting founder review
              </span>
            </li>
          </ul>
        </div>
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div className="border border-outline-variant bg-surface-container px-4 py-3">
      <p className="font-mono-label text-mono-label uppercase tracking-widest text-outline">
        {label}
      </p>
      <p
        className={
          highlight
            ? "mt-1 font-mono-data text-h2 tabular-nums text-tertiary"
            : "mt-1 font-mono-data text-h2 tabular-nums text-on-surface"
        }
      >
        {String(value).padStart(2, "0")}
      </p>
    </div>
  );
}
