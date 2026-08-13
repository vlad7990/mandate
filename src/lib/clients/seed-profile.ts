import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClientProfileFields } from "./types";

/**
 * Fill in the client profile fields the client does not have yet, from an
 * executive-search intake.
 *
 * Fill-the-gaps rather than overwrite, and deliberately in the app rather
 * than as a SQL `coalesce` update: the rule is "the client's own record
 * wins", so a profile someone has corrected by hand is never clobbered by
 * the next search that happens to state something different. A SQL
 * `coalesce(c.col, new.col)` would express the same thing, but the read
 * makes the *reason* visible in the diff a reviewer sees.
 *
 * Best-effort. A client whose profile is half-filled is the state the
 * product was in before 049 anyway, and this must not fail an intake.
 */
export async function seedClientProfileFromIntake(
  supabase: SupabaseClient,
  clientId: string,
  intake: Partial<ClientProfileFields>
): Promise<void> {
  const { data: existing, error: readError } = await supabase
    .from("clients")
    .select(
      "industry, business_model, revenue_range, employee_count, funding_stage, ownership_structure, geographic_footprint, regulatory_environment"
    )
    .eq("id", clientId)
    .maybeSingle<ClientProfileFields>();

  if (readError || !existing) return;

  const updates: Partial<ClientProfileFields> = {};
  for (const [key, incoming] of Object.entries(intake) as Array<
    [keyof ClientProfileFields, string | null | undefined]
  >) {
    const value = (incoming ?? "").trim();
    if (!value) continue;
    if (existing[key]) continue; // the client already says something here
    updates[key] = value;
  }

  if (Object.keys(updates).length === 0) return;

  const { error } = await supabase
    .from("clients")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", clientId);

  if (error) {
    console.error("[clients] failed to seed profile from intake:", error.message);
  }
}
