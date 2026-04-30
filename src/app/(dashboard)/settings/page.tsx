import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { cn } from "@/lib/utils";
import { UserStatusActions } from "./user-actions";

type OrgRow = {
  id: string;
  name: string;
  slug: string;
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
  const [orgQ, usersQ] = await Promise.all([
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
  ]);

  const org = orgQ.data;
  const users = (usersQ.data ?? []) as UserRow[];

  const founders = users.filter((u) => u.is_founder);
  const pending = users.filter((u) => u.status === "pending");
  const activeMembers = users.filter(
    (u) =>
      u.status === "active" &&
      !u.is_founder &&
      u.organization_id === profile.organization_id
  );
  const suspended = users.filter((u) => u.status === "suspended");

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
          <Link
            href="/settings/skills"
            prefetch={false}
            className="px-3 py-1.5 border border-outline-variant text-on-surface-variant font-mono-label text-mono-label uppercase tracking-widest hover:border-primary hover:text-primary transition-colors flex items-center gap-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <span className="material-symbols-outlined text-[14px]" aria-hidden>
              neurology
            </span>
            Skills Studio
          </Link>
        </nav>
      </header>

      {!isFounder && (
        <Card>
          <CardContent className="py-4 text-body-main text-on-surface-variant">
            You&rsquo;re viewing this workspace as a{" "}
            <span className="text-on-surface">{profile.role ?? "member"}</span>.
            Only founders can approve pending users or change the
            organisation. Reach out to a founder if you need access changes.
          </CardContent>
        </Card>
      )}

      {/* Organisation */}
      <Card>
        <CardHeader>
          <CardTitle className="font-mono-label text-mono-label text-primary uppercase tracking-widest flex items-center gap-2">
            <span className="material-symbols-outlined text-[14px]">domain</span>
            Organisation
          </CardTitle>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>

      {/* Founders */}
      <Card>
        <CardHeader>
          <CardTitle className="font-mono-label text-mono-label text-primary uppercase tracking-widest flex items-center gap-2">
            <span className="material-symbols-outlined text-[14px]">verified_user</span>
            Founders ({founders.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {founders.length === 0 ? (
            <p className="text-body-main text-outline italic">
              No founders configured.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Joined</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {founders.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="text-on-surface">
                      {u.full_name?.trim() || "—"}
                    </TableCell>
                    <TableCell className="font-mono-data text-on-surface-variant">
                      {u.email}
                    </TableCell>
                    <TableCell>
                      <StatusChip status={u.status} />
                    </TableCell>
                    <TableCell className="font-mono-data text-on-surface-variant">
                      {u.created_at ? formatDate(u.created_at) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pending users — founder-only actions render inline */}
      <Card>
        <CardHeader>
          <CardTitle className="font-mono-label text-mono-label text-primary uppercase tracking-widest flex items-center gap-2">
            <span className="material-symbols-outlined text-[14px]">pending</span>
            Pending users ({pending.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {pending.length === 0 ? (
            <p className="text-body-main text-outline italic">
              No pending users in your view.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Requested</TableHead>
                  {isFounder && (
                    <TableHead className="text-right">Action</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {pending.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="text-on-surface">
                      {u.full_name?.trim() || "—"}
                    </TableCell>
                    <TableCell className="font-mono-data text-on-surface-variant">
                      {u.email}
                    </TableCell>
                    <TableCell className="font-mono-data text-on-surface-variant">
                      {u.created_at ? formatDate(u.created_at) : "—"}
                    </TableCell>
                    {isFounder && (
                      <TableCell className="text-right">
                        <UserStatusActions
                          userId={u.id}
                          fullName={u.full_name?.trim() || u.email}
                        />
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Active members — only meaningful to founders / org admins */}
      {activeMembers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="font-mono-label text-mono-label text-primary uppercase tracking-widest flex items-center gap-2">
              <span className="material-symbols-outlined text-[14px]">groups</span>
              Active members ({activeMembers.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Joined</TableHead>
                  {isFounder && (
                    <TableHead className="text-right">Action</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeMembers.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="text-on-surface">
                      {u.full_name?.trim() || "—"}
                    </TableCell>
                    <TableCell className="font-mono-data text-on-surface-variant">
                      {u.email}
                    </TableCell>
                    <TableCell>
                      <span className="font-mono-label text-mono-label text-outline uppercase tracking-wider">
                        {u.role ?? "—"}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono-data text-on-surface-variant">
                      {u.created_at ? formatDate(u.created_at) : "—"}
                    </TableCell>
                    {isFounder && (
                      <TableCell className="text-right">
                        <UserStatusActions
                          userId={u.id}
                          fullName={u.full_name?.trim() || u.email}
                        />
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {isFounder && suspended.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="font-mono-label text-mono-label text-error uppercase tracking-widest flex items-center gap-2">
              <span className="material-symbols-outlined text-[14px]">block</span>
              Suspended ({suspended.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {suspended.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="text-on-surface">
                      {u.full_name?.trim() || "—"}
                    </TableCell>
                    <TableCell className="font-mono-data text-on-surface-variant">
                      {u.email}
                    </TableCell>
                    <TableCell className="text-right">
                      <UserStatusActions
                        userId={u.id}
                        fullName={u.full_name?.trim() || u.email}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <footer className="pt-2 font-mono-label text-mono-label text-outline uppercase tracking-wider">
        Need a teammate added? Send them to{" "}
        <Link
          href="/auth/signup"
          prefetch={false}
          className="text-primary hover:underline"
        >
          /auth/signup
        </Link>{" "}
        and approve their request here.
      </footer>
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
