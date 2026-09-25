import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { requireCapability } from "@/lib/auth/access";
import { SetBreadcrumbs } from "@/components/dashboard/breadcrumbs";
import { PageShell } from "@/components/ui/page-shell";
import { MastHead } from "@/components/ui/mast-head";
import { RolePicker } from "./role-picker";
import { DeskPicker, type DeskHead } from "./desk-picker";
import { MemberStatusButtons } from "./member-status-buttons";
import { StaffInvitePanel, type OpenInvitationRow } from "./invite-panel";
import { PendingGrantsPanel, type PendingGrantRow } from "./pending-grants-panel";
import {
  CAPABILITIES,
  CAPABILITY_LABELS,
  HUMAN_ROLES,
  ROLE_LABELS,
  ROLE_SUMMARIES,
  can,
  parseRole,
} from "@/lib/auth/roles";

/**
 * Member administration — the screen that makes `users.role` operable.
 *
 * The proxy already refuses this route to anyone without `org:manage`;
 * `requireCapability` runs anyway, because a route table is a list someone
 * has to remember to update and this page reads and writes the permission
 * system itself. Two cheap checks, one of which cannot be forgotten.
 *
 * The matrix at the bottom is not decoration. An admin choosing between
 * "researcher" and "recruiter" for a new joiner has no way to know what
 * either word buys without it, and the honest place to answer that is next
 * to the control that applies it.
 */

type MemberRow = {
  id: string;
  email: string;
  full_name: string | null;
  role: string | null;
  status: string;
  is_founder: boolean;
  organization_id: string | null;
  created_at: string | null;
  /** §200 — whose desk they sit on. Scopes the reuse agent's trawl only. */
  manager_id: string | null;
};

const STATUS_TONE: Record<string, string> = {
  active: "text-primary",
  pending: "text-tertiary",
  suspended: "text-error",
};

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default async function MembersPage() {
  const access = await requireCapability("org:manage");
  const supabase = await createServerSupabaseClient();

  // Org-scoped by the `users_see_own_org_users` policy. A founder's read
  // reaches every org, so the filter is explicit rather than implied — this
  // page administers one organisation, not the platform.
  const { data } = await supabase
    .from("users")
    .select(
      "id, email, full_name, role, status, is_founder, organization_id, created_at, manager_id"
    )
    .eq("organization_id", access.organizationId ?? "")
    .order("created_at", { ascending: true });

  const members = (data ?? []) as MemberRow[];

  // §200 — who may head a desk. The database refuses anyone else (140),
  // so offering a wider list would be a control that cannot work.
  const deskHeads: DeskHead[] = members
    .filter(
      (m) =>
        m.status === "active" &&
        (parseRole(m.role) === "manager" || parseRole(m.role) === "admin")
    )
    .map((m) => ({ id: m.id, label: m.full_name?.trim() || m.email }));

  const activeAdmins = members.filter(
    (m) => m.status === "active" && parseRole(m.role) === "admin"
  ).length;

  // Open staff invitations (§134). Org-scoped and admin-gated by RLS; the
  // filters restate what "open" means rather than trusting a view.
  const { data: invitationData } = await supabase
    .from("staff_invitations")
    .select("id, email, full_name, role, invited_by_label, expires_at")
    .eq("organization_id", access.organizationId ?? "")
    .is("revoked_at", null)
    .is("accepted_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });
  const openInvitations = (invitationData ?? []) as OpenInvitationRow[];

  // 129 — admin grants parked for a second admin.
  //
  // Scalar columns ONLY, and the labels resolved from `members` above.
  // The first cut embedded `users` twice (target and proposer) with
  // named FKs; the query failed, the error was destructured away, and
  // the panel rendered as "nothing pending" while a request sat in the
  // table — a silent-empty exactly like the one 111/112 warned about.
  // This table has THREE foreign keys to `users`, so the safest embed
  // here is no embed: the page already holds every member.
  const { data: grantData, error: grantError } = await supabase
    .from("admin_grant_requests")
    .select(
      "id, kind, target_user_id, target_email, target_full_name, expires_at, proposed_by"
    )
    .eq("organization_id", access.organizationId ?? "")
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });

  if (grantError) {
    // Never silently. A pending admin grant that does not render is a
    // two-person control nobody can complete.
    console.error("[members] pending admin grants unreadable", grantError);
  }

  const labelOf = (id: string | null): string | null => {
    if (!id) return null;
    const m = members.find((x) => x.id === id);
    return m ? m.full_name?.trim() || m.email : null;
  };

  const pendingGrants: PendingGrantRow[] = (
    (grantData ?? []) as Array<{
      id: string;
      kind: "promotion" | "invitation";
      target_user_id: string | null;
      target_email: string | null;
      target_full_name: string | null;
      expires_at: string;
      proposed_by: string;
    }>
  ).map((g) => ({
    id: g.id,
    kind: g.kind,
    target:
      labelOf(g.target_user_id) ??
      g.target_full_name?.trim() ??
      g.target_email ??
      "Unknown",
    proposedByLabel: labelOf(g.proposed_by) ?? "another admin",
    mine: g.proposed_by === access.userId,
    expiresAt: g.expires_at,
  }));

  return (
    <PageShell className="space-y-6">
      <SetBreadcrumbs
        crumbs={[{ label: "Settings", href: "/app/settings" }, { label: "Members" }]}
      />

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-h1 text-h1 text-primary">MEMBERS</h1>
          <p className="mt-1 font-mono-label text-mono-label uppercase tracking-widest text-outline tabular-nums">
            {members.length} {members.length === 1 ? "ACCOUNT" : "ACCOUNTS"}
            {" // "}
            {activeAdmins} {activeAdmins === 1 ? "ADMIN" : "ADMINS"}
          </p>
        </div>
        <nav className="flex flex-wrap items-center gap-2">
          <Link
            href="/app/settings"
            prefetch={false}
            className="flex items-center gap-2 border border-outline-variant px-3 py-1.5 font-mono-label text-mono-label uppercase tracking-widest text-on-surface-variant transition-colors hover:border-primary hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {"←"} Settings
          </Link>
        </nav>
      </header>

      <section className="space-y-3">
        <MastHead
          tone="primary"
          label="ROSTER"
          meta={activeAdmins === 1 ? "ONE ADMIN — CANNOT BE DEMOTED" : undefined}
        />

        {/*
          `relative` is load-bearing, not decoration. The cells below carry
          `sr-only` spans, and `sr-only` is `position: absolute`. With no
          positioned ancestor their containing block is the root, so although
          each is 1px wide it is *placed* at its static position — out at
          x≈700 inside this 720px table — and extends the document's
          scrollable width straight past the scroll container that should
          have clipped it. The whole page then scrolled sideways on a phone
          while nothing visible was over-wide. Positioning the wrapper makes
          it their containing block, so the clip applies.
        */}
        <div className="relative min-w-0 max-w-full overflow-x-auto border border-outline-variant bg-surface-container-low">
          <table className="w-full border-collapse sm:min-w-[860px]">
            <thead>
              <tr className="border-b border-outline-variant">
                {["Name", "Email", "Status", "Joined", "Desk", "Role"].map((h, i) => (
                  <th
                    key={h}
                    scope="col"
                    className={`px-4 py-2.5 font-mono-label text-mono-label uppercase tracking-widest text-outline ${
                      i === 5 ? "text-right" : "text-left"
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {members.map((member) => {
                const role = parseRole(member.role);
                const isSelf = member.id === access.userId;
                // A founder's role is Mandate's to set; the action refuses it
                // too, and the picker says why rather than failing on Apply.
                // An agent principal's role moves only by founder hand (074's
                // guard) and is administered from /ops, so its picker locks
                // for the same reason with its own sentence.
                const isAgent = role === "agent";
                const locked = member.is_founder || isAgent;

                return (
                  <tr
                    key={member.id}
                    className="border-b border-outline-variant/60 last:border-b-0"
                  >
                    <td className="px-4 py-3 text-body-main text-on-surface">
                      {member.full_name?.trim() || "—"}
                      {isSelf && (
                        <span className="ml-2 font-mono-label text-mono-label uppercase tracking-wider text-outline">
                          (you)
                        </span>
                      )}
                      {member.is_founder && (
                        <span className="ml-2 font-mono-label text-mono-label uppercase tracking-wider text-tertiary">
                          founder
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono-data text-on-surface-variant">
                      {member.email}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`font-mono-label text-mono-label uppercase tracking-wider ${
                          STATUS_TONE[member.status] ?? "text-outline"
                        }`}
                      >
                        {member.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono-data text-on-surface-variant tabular-nums">
                      {formatDate(member.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <DeskPicker
                        userId={member.id}
                        displayName={member.full_name?.trim() || member.email}
                        currentManagerId={member.manager_id}
                        heads={deskHeads}
                        disabled={locked}
                        disabledReason={
                          isAgent
                            ? "Agent principals are managed from Platform ops"
                            : locked
                              ? "Founder accounts are managed by Mandate"
                              : undefined
                        }
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <RolePicker
                          userId={member.id}
                          displayName={member.full_name?.trim() || member.email}
                          currentRole={role}
                          disabled={locked}
                          disabledReason={
                            isAgent
                              ? "Agent principals are managed from Platform ops"
                              : locked
                                ? "Founder accounts are managed by Mandate"
                                : undefined
                          }
                        />
                        <MemberStatusButtons
                          userId={member.id}
                          displayName={member.full_name?.trim() || member.email}
                          status={member.status}
                          locked={locked}
                          isSelf={isSelf}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/*
          Pending accounts land here too, at `viewer`, because approving an
          account and granting it power are two decisions. The approval still
          belongs to a founder — it assigns the organisation — and lives on
          the Settings page.
        */}
        <p className="font-mono-label text-mono-label uppercase tracking-widest text-outline">
          NEW ACCOUNTS JOIN AS VIEWER{" // "}PROMOTE THEM HERE
        </p>
      </section>

      <section className="space-y-3">
        <MastHead
          tone="neutral"
          label="INVITATIONS"
          meta={
            openInvitations.length > 0
              ? `${openInvitations.length} OPEN`
              : undefined
          }
        />
        <StaffInvitePanel invitations={openInvitations} />
      </section>

      {/* Placed directly under the invite panel: both are "people who are
          not yet what they will be", and the approver needs to meet this
          list without hunting for it. */}
      <PendingGrantsPanel rows={pendingGrants} />

      <section className="space-y-3">
        <MastHead tone="neutral" label="WHAT EACH ROLE CARRIES" />

        {/*
          `relative` is load-bearing, not decoration. The cells below carry
          `sr-only` spans, and `sr-only` is `position: absolute`. With no
          positioned ancestor their containing block is the root, so although
          each is 1px wide it is *placed* at its static position — out at
          x≈700 inside this 720px table — and extends the document's
          scrollable width straight past the scroll container that should
          have clipped it. The whole page then scrolled sideways on a phone
          while nothing visible was over-wide. Positioning the wrapper makes
          it their containing block, so the clip applies.
        */}
        <div className="relative min-w-0 max-w-full overflow-x-auto border border-outline-variant bg-surface-container-low">
          <table className="w-full border-collapse sm:min-w-[720px]">
            <thead>
              <tr className="border-b border-outline-variant">
                <th
                  scope="col"
                  className="px-4 py-2.5 text-left font-mono-label text-mono-label uppercase tracking-widest text-outline"
                >
                  Capability
                </th>
                {HUMAN_ROLES.map((role) => (
                  <th
                    key={role}
                    scope="col"
                    className="px-4 py-2.5 text-center font-mono-label text-mono-label uppercase tracking-widest text-outline"
                  >
                    {ROLE_LABELS[role]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CAPABILITIES.map((capability) => (
                <tr
                  key={capability}
                  className="border-b border-outline-variant/60 last:border-b-0"
                >
                  <th
                    scope="row"
                    className="px-4 py-2.5 text-left text-body-main font-normal text-on-surface"
                  >
                    {CAPABILITY_LABELS[capability]}
                  </th>
                  {HUMAN_ROLES.map((role) => {
                    const held = can(role, capability);
                    return (
                      <td key={role} className="px-4 py-2.5 text-center">
                        <span
                          className={held ? "text-primary" : "text-outline"}
                          aria-hidden="true"
                        >
                          {held ? "■" : "□"}
                        </span>
                        <span className="sr-only">
                          {held ? "yes" : "no"}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <dl className="space-y-1.5">
          {HUMAN_ROLES.map((role) => (
            <div key={role} className="flex flex-wrap gap-x-3 text-body-main">
              <dt className="font-mono-label text-mono-label uppercase tracking-widest text-on-surface">
                {ROLE_LABELS[role]}
              </dt>
              <dd className="flex-1 text-on-surface-variant">
                {ROLE_SUMMARIES[role]}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </PageShell>
  );
}
