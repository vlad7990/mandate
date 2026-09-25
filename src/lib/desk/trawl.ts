/**
 * WHOSE CVs THE REUSE AGENT MAY TRAWL (§200, migration 140).
 *
 * The founder's rule: a recruiter's suggestions are drawn from their own
 * CVs; a manager's from their own plus those of the people who report to
 * them. This module is that sentence, and nothing else in the product
 * decides it.
 *
 * **This is a SCOPE, not a security boundary — and the distinction is
 * load-bearing.** Candidate visibility stays organisation-wide (D1): the
 * same recruiter can open every candidate in the org through the
 * Candidates list, Pool search or a shared mandate, and RLS still admits
 * them. What this narrows is which CVs the agent *draws on when it
 * proposes*, so that a recruiter's suggestions come from their own book
 * rather than the whole firm's. Enforcing it in the action rather than in
 * RLS is therefore correct, not a shortcut — but it must never be quoted
 * as a privacy guarantee, because it is not one.
 *
 * ONE LEVEL DEEP, deliberately. A manager sees their reports' CVs, not
 * their reports' reports'. Deeper would need a recursive walk and a
 * cycle story; the database refuses a two-cycle (140) but nothing models
 * a hierarchy, and inventing one here would be a claim the product
 * cannot back.
 */
import { type Role } from "@/lib/auth/roles";

export type TrawlScope =
  /** Everything the org holds — admins, who already administer it. */
  | { kind: "org" }
  /** Own CVs plus every report's, and the unowned. */
  | { kind: "desk"; ownerIds: string[] }
  /** Own CVs and the unowned. */
  | { kind: "own"; ownerIds: string[] };

export type DeskMember = {
  id: string;
  /** Who this member reports to. */
  managerId: string | null;
  status: string;
};

/**
 * The scope for `userId`, given the org's members.
 *
 * Suspended reports are excluded: a suspended account cannot act, and
 * their book reverting to the desk head would be a quiet transfer of
 * material nobody authorised. Their CVs stay reachable the way every
 * other candidate is — through the Candidates list.
 */
export function trawlScopeFor(
  role: Role | null | undefined,
  userId: string,
  members: readonly DeskMember[]
): TrawlScope {
  if (role === "admin") return { kind: "org" };

  if (role === "manager") {
    const reports = members
      .filter((m) => m.managerId === userId && m.status === "active")
      .map((m) => m.id);
    return { kind: "desk", ownerIds: [userId, ...reports] };
  }

  return { kind: "own", ownerIds: [userId] };
}

/**
 * Does a candidate row fall in scope?
 *
 * **An unowned row (`created_by === null`) is in EVERY scope.** That is
 * the ruled backfill: every candidate that predates migration 140 has no
 * owner, and so does one whose owner's account was deleted. Treating
 * unowned as nobody's would have emptied every trawl on the day this
 * shipped.
 */
export function inTrawl(
  scope: TrawlScope,
  createdBy: string | null | undefined
): boolean {
  if (scope.kind === "org") return true;
  if (!createdBy) return true;
  return scope.ownerIds.includes(createdBy);
}

/**
 * The sentence shown above the suggestions, so the reader always knows
 * what the agent was allowed to look at before they judge what it found.
 * An agent that quietly searched less than you assumed is the §175
 * defect class with a friendlier face.
 */
export function describeTrawl(scope: TrawlScope, poolSize: number): string {
  const people = `${poolSize} ${poolSize === 1 ? "person" : "people"}`;
  if (scope.kind === "org") return `every CV this organisation holds · ${people}`;
  if (scope.kind === "desk") {
    const reports = scope.ownerIds.length - 1;
    const desk =
      reports === 0
        ? "your own CVs (nobody reports to you yet)"
        : `your desk — you and ${reports} ${reports === 1 ? "person" : "people"}`;
    return `${desk}, plus unowned CVs · ${people}`;
  }
  return `your own CVs, plus unowned CVs · ${people}`;
}
