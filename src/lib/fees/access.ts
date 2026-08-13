/**
 * Who may see a placement's money.
 *
 * `fees:read` answers it for the revenue book as a whole — see the note
 * on it in `src/lib/auth/roles.ts`. This file answers it for one
 * placement, because the rule has an exception the capability model
 * cannot express: whoever owns or sourced a placement sees that
 * placement's fee whatever their role. A researcher who found the
 * candidate can check their own credit; they still see nothing on
 * anybody else's.
 *
 * This is the UI half. The boundary is `is_placement_credited` in
 * migration 050, which is the same predicate written as SQL — a
 * researcher who calls PostgREST directly gets the same two answers.
 * Keep the two in step; there is a test that walks the same cases.
 */

import { can, type Role } from "@/lib/auth/roles";
import type { PlacementRow } from "./types";

/** The parts of a placement that decide credit. */
export type CreditedOn = Pick<PlacementRow, "owner_user_id" | "sourced_by_user_id">;

/**
 * Whether `userId` is credited on this placement.
 *
 * Null-safe on both sides: a placement whose owner has been deleted has
 * `owner_user_id` null, and null must not match a null `userId` — that
 * would hand every orphaned placement to every signed-out request.
 */
export function isCreditedOn(placement: CreditedOn, userId: string | null): boolean {
  if (!userId) return false;
  return placement.owner_user_id === userId || placement.sourced_by_user_id === userId;
}

/**
 * Whether this caller may see this placement's fee.
 *
 * Takes the role and id rather than an `Access` so it can be called from
 * a client component that was handed both, and so the test does not need
 * to build a session.
 */
export function canReadPlacementFees(
  role: Role | null | undefined,
  userId: string | null,
  placement: CreditedOn
): boolean {
  return can(role, "fees:read") || isCreditedOn(placement, userId);
}

/**
 * What to show where a fee would be.
 *
 * A viewer should be told the number exists and is not theirs, rather
 * than shown a blank cell that reads as "no fee recorded" — the same
 * reasoning as the no-access page in 046 existing at all. The two states
 * are genuinely different and a recruiter chasing an unrecorded fee needs
 * to tell them apart.
 */
export const FEE_WITHHELD_LABEL = "Restricted";
