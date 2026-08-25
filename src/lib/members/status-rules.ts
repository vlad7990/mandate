// The member-status refusals, as a pure rule (§134 D3).
//
// Kept out of the server action so the lockout invariants are unit-testable:
// an organisation must never be able to admin itself to zero. The action
// layer surfaces these sentences verbatim; RLS would permit the write, which
// is exactly why the rule is stated here in words.

import { parseRole } from "@/lib/auth/roles";

export type MemberStatusTarget = {
  id: string;
  is_founder: boolean;
  role: string | null;
  status: string;
};

export function memberStatusRefusal(args: {
  actorId: string;
  target: MemberStatusTarget;
  nextStatus: "active" | "suspended";
  /** Count of ACTIVE admins in the org, including the target when it is one. */
  activeAdminCount: number;
}): string | null {
  const { actorId, target, nextStatus, activeAdminCount } = args;

  if (target.is_founder) {
    return "Founder accounts are managed by Mandate and cannot be changed here.";
  }
  const role = parseRole(target.role);
  if (role === "agent") {
    return "Agent principals are managed from the operator console, not the members screen.";
  }
  if (nextStatus === "suspended") {
    if (target.id === actorId) {
      return "You cannot suspend your own account.";
    }
    if (role === "admin" && target.status === "active" && activeAdminCount <= 1) {
      return "This is the organisation's last active admin — suspending them would lock the organisation.";
    }
  }
  return null;
}
