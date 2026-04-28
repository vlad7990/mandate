// Source-of-truth founder allowlist. Mirrored in supabase/migrations/002_auth_status_and_founders.sql
// (handle_new_auth_user trigger). Keep both lists in sync when adding/removing founders.
export const FOUNDER_EMAILS = [
  "vbreygin@gmail.com",
  "v.breygin7990@gmail.com",
  "filmreecon@gmail.com",
] as const;

export function isFounderEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return (FOUNDER_EMAILS as readonly string[]).includes(email.toLowerCase());
}
