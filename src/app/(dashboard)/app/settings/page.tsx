import Link from "next/link";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { MastHead } from "@/components/ui/mast-head";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { can, parseRole } from "@/lib/auth/roles";
import { cn } from "@/lib/utils";
import { NameForm, PasswordForm } from "@/components/account/account-forms";
import {
  IconBuilding,
  IconGroup,
  IconIntelligence,
  IconShield,
} from "@/components/icons";

type OrgRow = {
  id: string;
  name: string;
  slug: string;
  created_at: string | null;
};

type ErasureRequestRow = {
  id: string;
  requester_label: string;
  note: string | null;
  created_at: string | null;
};

type UserRow = {
  id: string;
  email: string;
  full_name: string | null;
  role: string | null;
  status: string;
  is_founder: boolean;
  organization_id: string | null;
  created_at: string | null;
};

const STATUS_TONE: Record<string, string> = {
  active: "border-secondary-fixed-dim/60 text-secondary-fixed-dim",
  pending: "border-tertiary/60 text-tertiary",
  suspended: "border-error/60 text-error",
};

export default async function SettingsPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/signin");

  // Caller's profile drives both the org context and the founder gate
  // for the pending-users actions.
  const { data: profile } = await supabase
    .from("users")
    .select("id, organization_id, role, full_name, email, is_founder, status")
    .eq("id", user.id)
    .single<{
      id: string;
      organization_id: string | null;
      role: string | null;
      full_name: string | null;
      email: string;
      is_founder: boolean;
      status: string;
    }>();

  if (!profile) {
    redirect("/auth/signin");
  }

  const isFounder = profile.is_founder;

  // Founders can read every user across orgs (founders_can_read_all_users
  // policy from migration 002). Non-founders only see themselves; for
  // those callers the page mostly shows their own membership info.
  const [orgQ, usersQ, erasureQ] = await Promise.all([
    profile.organization_id
      ? supabase
          .from("organizations")
          .select("id, name, slug, created_at")
          .eq("id", profile.organization_id)
          .maybeSingle<OrgRow>()
      : Promise.resolve({ data: null as OrgRow | null }),
    supabase
      .from("users")
      .select(
        "id, email, full_name, role, status, is_founder, organization_id, created_at"
      )
      .order("created_at", { ascending: false }),
    // Open erasure requests filed by candidates from their portal (073).
    // RLS scopes this to the caller's own organisation; the card below
    // renders only when there is something to act on.
    profile.organization_id
      ? supabase
          .from("candidate_erasure_requests")
          .select("id, requester_label, note, created_at")
          .eq("organization_id", profile.organization_id)
          .eq("status", "open")
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [] as ErasureRequestRow[] }),
  ]);

  const org = orgQ.data;
  const users = (usersQ.data ?? []) as UserRow[];
  const erasureRequests = (erasureQ.data ?? []) as ErasureRequestRow[];

  const founders = users.filter((u) => u.is_founder);
  const activeMembers = users.filter(
    (u) =>
      u.status === "active" &&
      !u.is_founder &&
      u.organization_id === profile.organization_id
  );

  return (
    <div className="p-6 space-y-6">
      <header className="flex justify-between items-end gap-4 flex-wrap">
        <div>
          <h1 className="font-h1 text-h1 text-primary">WORKSPACE SETTINGS</h1>
          <p className="font-mono-label text-mono-label text-outline uppercase tracking-widest mt-1">
            {profile.email}
            {isFounder ? " · founder" : profile.role ? ` · ${profile.role}` : ""}
          </p>
        </div>
        <nav className="flex items-center gap-2 flex-wrap">
          {/*
            Only shown to admins: the route itself refuses anyone else, and a
            link that bounces reads as a broken product rather than a
            restricted one.
          */}
          {can(parseRole(profile.role), "org:manage") && (
            <Link
              href="/app/settings/members"
              prefetch={false}
              className="px-3 py-1.5 border border-outline-variant text-on-surface-variant font-mono-label text-mono-label uppercase tracking-widest hover:border-primary hover:text-primary transition-colors flex items-center gap-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <IconGroup size={14} />
              Members
            </Link>
          )}
          {/* The operator's door. Approvals, the waitlist and cross-org
              administration moved to /ops — the platform hat and the
              org-admin hat stopped sharing this screen. */}
          {isFounder && (
            <Link
              href="/ops"
              prefetch={false}
              className="px-3 py-1.5 border border-outline-variant text-on-surface-variant font-mono-label text-mono-label uppercase tracking-widest hover:border-tertiary hover:text-tertiary transition-colors flex items-center gap-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tertiary"
            >
              <IconShield size={14} />
              Platform ops
            </Link>
          )}
          <Link
            href="/app/settings/skills"
            prefetch={false}
            className="px-3 py-1.5 border border-outline-variant text-on-surface-variant font-mono-label text-mono-label uppercase tracking-widest hover:border-primary hover:text-primary transition-colors flex items-center gap-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <IconIntelligence size={14} />
            Skills Studio
          </Link>
        </nav>
      </header>

      {/* Account — the caller's own profile, editable (071). Every staff
          role sees this, viewer included: the two self-service edits are
          not a privilege. */}
      <section className="space-y-3">
        <MastHead
          tone="primary"
          label={
            <>
              <IconShield size={14} />
              Account
            </>
          }
        />
        <div className="border border-outline-variant bg-surface-container-low p-4">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="space-y-2">
              <p className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
                Name
              </p>
              <div className="max-w-md">
                <NameForm initialName={profile.full_name?.trim() || ""} />
              </div>
              <p className="text-sm text-on-surface-variant">
                Signed in as{" "}
                <span className="font-mono-data">{profile.email}</span>. Email
                changes are handled by Mandate — ask a founder.
              </p>
            </div>
            <div className="space-y-2">
              <p className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
                Password
              </p>
              <div className="max-w-md">
                <PasswordForm />
              </div>
            </div>
          </div>
        </div>
      </section>

      {!isFounder && (
        <div className="border border-outline-variant bg-surface-container-low px-4 py-4 text-body-main text-on-surface-variant">
          You&rsquo;re viewing this workspace as a{" "}
          <span className="text-on-surface">{profile.role ?? "member"}</span>.
          Only founders can approve pending users or change the
          organisation. Reach out to a founder if you need access changes.
        </div>
      )}

      {/* Erasure requests — candidates asking, from their portal, that
          this organisation's data about them be removed. Rendered only
          when there is something to act on; execution is Mandate's hand
          per the retention verdict, and the search team's part is to
          stop working the person meanwhile. */}
      {erasureRequests.length > 0 && (
        <section className="space-y-3">
          <MastHead
            tone="error"
            label={
              <>
                <IconShield size={14} />
                Erasure requests
              </>
            }
            meta={<span className="tabular-nums">{erasureRequests.length}</span>}
          />
          <div className="space-y-3 border border-outline-variant bg-surface-container-low p-4">
            <ul className="divide-y divide-outline-variant border border-outline-variant">
              {erasureRequests.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-4 py-3"
                >
                  <span className="text-on-surface">{r.requester_label}</span>
                  {r.note && (
                    <span className="text-body-main text-on-surface-variant">
                      &ldquo;{r.note}&rdquo;
                    </span>
                  )}
                  <span className="ml-auto font-mono-data text-on-surface-variant">
                    {r.created_at ? formatDate(r.created_at) : "—"}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-body-main text-on-surface-variant">
              This person asked for their data to be erased. Stop working
              them; Mandate reviews and executes the request.
            </p>
          </div>
        </section>
      )}

      {/* Organisation */}
      <section className="space-y-3">
        <MastHead
          tone="primary"
          label={
            <>
              <IconBuilding size={14} />
              Organisation
            </>
          }
        />
        <div className="border border-outline-variant bg-surface-container-low p-4">
          {org ? (
            <dl className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="Name" value={org.name} />
              <Field label="Slug" value={org.slug} mono />
              <Field
                label="Created"
                value={org.created_at ? formatDate(org.created_at) : "—"}
                mono
              />
            </dl>
          ) : (
            <p className="text-body-main text-outline italic">
              You aren&rsquo;t attached to an organisation yet. A founder
              needs to approve your access.
            </p>
          )}
        </div>
      </section>

      {/* Founders */}
      <section className="space-y-3">
        <MastHead
          tone="primary"
          label={
            <>
              <IconShield size={14} />
              Founders
            </>
          }
          meta={<span className="tabular-nums">{founders.length}</span>}
        />
        {founders.length === 0 ? (
          <p className="text-body-main text-outline italic">
            No founders configured.
          </p>
        ) : (
          <MemberTable
            columns={["Name", "Email", "Status", "Joined"]}
            rows={founders.map((u) => (
              <tr
                key={u.id}
                className="border-b border-outline-variant/60 last:border-b-0"
              >
                <td className="px-4 py-3 text-body-main text-on-surface">
                  {u.full_name?.trim() || "—"}
                </td>
                <td className="px-4 py-3 font-mono-data text-body-main text-on-surface-variant">
                  {u.email}
                </td>
                <td className="px-4 py-3">
                  <StatusChip status={u.status} />
                </td>
                <td className="px-4 py-3 font-mono-data text-body-main text-on-surface-variant">
                  {u.created_at ? formatDate(u.created_at) : "—"}
                </td>
              </tr>
            ))}
          />
        )}
      </section>

      {/* Active members — only meaningful to founders / org admins.
          Approvals and suspensions moved to /ops: they are platform
          acts, and this screen is the organisation's. */}
      {activeMembers.length > 0 && (
        <section className="space-y-3">
          <MastHead
            tone="primary"
            label={
              <>
                <IconGroup size={14} />
                Active members
              </>
            }
            meta={<span className="tabular-nums">{activeMembers.length}</span>}
          />
          <MemberTable
            columns={["Name", "Email", "Role", "Joined"]}
            rows={activeMembers.map((u) => (
              <tr
                key={u.id}
                className="border-b border-outline-variant/60 last:border-b-0"
              >
                <td className="px-4 py-3 text-body-main text-on-surface">
                  {u.full_name?.trim() || "—"}
                </td>
                <td className="px-4 py-3 font-mono-data text-body-main text-on-surface-variant">
                  {u.email}
                </td>
                <td className="px-4 py-3">
                  <span className="font-mono-label text-mono-label text-outline uppercase tracking-wider">
                    {u.role ?? "—"}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono-data text-body-main text-on-surface-variant">
                  {u.created_at ? formatDate(u.created_at) : "—"}
                </td>
              </tr>
            ))}
          />
        </section>
      )}

      <footer className="pt-2 font-mono-label text-mono-label text-outline uppercase tracking-wider">
        Need a teammate added? Send them to{" "}
        <Link
          href="/auth/signup"
          prefetch={false}
          className="text-primary hover:underline"
        >
          /auth/signup
        </Link>
        {" — "}Mandate approves their request from platform operations.
      </footer>
    </div>
  );
}

/**
 * The members-page table idiom: bordered scroll container (the wrapper's
 * `relative` is load-bearing — sr-only cells position against it, see
 * /app/settings/members), collapse-bordered table, mono uppercase heads.
 */
function MemberTable({
  columns,
  rows,
}: {
  columns: string[];
  rows: ReactNode;
}) {
  return (
    <div className="relative min-w-0 max-w-full overflow-x-auto border border-outline-variant bg-surface-container-low">
      <table className="w-full border-collapse sm:min-w-[720px]">
        <thead>
          <tr className="border-b border-outline-variant">
            {columns.map((h) => (
              <th
                key={h}
                scope="col"
                className="px-4 py-2.5 text-left font-mono-label text-mono-label uppercase tracking-widest text-outline"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{rows}</tbody>
      </table>
    </div>
  );
}

function Field({
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
      <dt className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
        {label}
      </dt>
      <dd
        className={cn(
          "text-on-surface mt-1",
          mono ? "font-mono-data text-body-main" : "text-body-main"
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function StatusChip({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "px-2 py-0.5 border font-mono-label text-mono-label uppercase tracking-wider",
        STATUS_TONE[status] ?? "border-outline-variant text-outline"
      )}
    >
      {status}
    </span>
  );
}

function formatDate(value: string): string {
  return new Date(value)
    .toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "2-digit",
    })
    .toUpperCase();
}
