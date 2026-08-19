import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { requirePortalAccess } from "@/lib/auth/portal-access";
import { ROLE_LABELS, parseRole, isExternalRole } from "@/lib/auth/roles";
import {
  InviteColleagueForm,
  InvitationRow,
  ColleagueRow,
  type SharedMandate,
} from "./people-client";

/**
 * The client_admin's People view: their company's roster on the portal,
 * live invitations, and which hiring managers hold which shared
 * searches. Everything on this screen is scoped to the caller's own
 * company by the database — the roster by the 067 users policy, the
 * invitations by list_client_invitations, the grants by
 * portal_list_grants — so the page assembles, it does not decide.
 */

type RosterRow = {
  id: string;
  full_name: string | null;
  email: string;
  role: string;
  status: string;
};

type InvitationListRow = {
  id: string;
  email: string;
  full_name: string;
  role: string;
  invited_by_label: string;
  mandate_count: number;
  expires_at: string;
  revoked_at: string | null;
  accepted_at: string | null;
  created_at: string;
};

type GrantRow = {
  project_id: string;
  project_title: string;
  user_id: string;
  member_name: string;
  member_email: string;
  granted_at: string;
};

type MandateRow = {
  project_id: string;
  title: string;
};

export default async function PortalPeoplePage() {
  const access = await requirePortalAccess();
  if (access.role !== "client_admin") {
    // The proxy already refuses this route on capability; a direct hit
    // from an HM session still lands here, and their home says why.
    redirect("/portal");
  }

  const supabase = await createServerSupabaseClient();
  const [rosterQ, invitationsQ, grantsQ, mandatesQ] = await Promise.all([
    supabase
      .from("users")
      .select("id, full_name, email, role, status")
      .eq("client_id", access.clientId)
      .order("created_at", { ascending: true }),
    supabase.rpc("list_client_invitations", { p_client_id: access.clientId }),
    supabase.rpc("portal_list_grants"),
    supabase.rpc("portal_list_mandates"),
  ]);

  const roster = (rosterQ.data ?? []) as RosterRow[];
  const invitations = ((invitationsQ.data ?? []) as InvitationListRow[]).filter(
    (i) => !i.accepted_at
  );
  const grants = (grantsQ.data ?? []) as GrantRow[];
  const shared: SharedMandate[] = ((mandatesQ.data ?? []) as MandateRow[]).map(
    (m) => ({ projectId: m.project_id, title: m.title })
  );

  const grantsByUser = new Map<string, GrantRow[]>();
  for (const g of grants) {
    const list = grantsByUser.get(g.user_id) ?? [];
    list.push(g);
    grantsByUser.set(g.user_id, list);
  }

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <p className="font-mono-label text-mono-label uppercase tracking-widest text-outline">
          {access.clientName}{" // "}people
        </p>
        <h1 className="font-h1 text-h1 tracking-tight text-on-surface">
          Your company on the portal
        </h1>
        <p className="text-body-main text-on-surface-variant">
          Invite colleagues, manage their access, and see who can open which
          shared search. Roles are set by the invitation; ask{" "}
          {access.organizationName} to change one.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="font-mono-label text-mono-label uppercase tracking-widest text-outline">
          Invite a colleague
        </h2>
        <InviteColleagueForm sharedMandates={shared} />
      </section>

      {invitations.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-mono-label text-mono-label uppercase tracking-widest text-outline">
            Open invitations
          </h2>
          <ul className="divide-y divide-outline-variant border border-outline-variant bg-surface-container">
            {invitations.map((inv) => (
              <InvitationRow
                key={inv.id}
                invitation={{
                  id: inv.id,
                  email: inv.email,
                  fullName: inv.full_name,
                  roleLabel:
                    ROLE_LABELS[parseRole(inv.role) ?? "hiring_manager"],
                  invitedByLabel: inv.invited_by_label,
                  expiresAt: inv.expires_at,
                  revoked: inv.revoked_at != null,
                }}
              />
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="font-mono-label text-mono-label uppercase tracking-widest text-outline">
          People
        </h2>
        <ul className="divide-y divide-outline-variant border border-outline-variant bg-surface-container">
          {roster.map((person) => {
            const role = parseRole(person.role);
            return (
              <ColleagueRow
                key={person.id}
                person={{
                  id: person.id,
                  name: person.full_name?.trim() || person.email,
                  email: person.email,
                  roleLabel: isExternalRole(role) ? ROLE_LABELS[role] : person.role,
                  isHiringManager: role === "hiring_manager",
                  status: person.status,
                  isSelf: person.id === access.userId,
                  grantedProjectIds: (grantsByUser.get(person.id) ?? []).map(
                    (g) => g.project_id
                  ),
                }}
                sharedMandates={shared}
              />
            );
          })}
        </ul>
      </section>
    </div>
  );
}
