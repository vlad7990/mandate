import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Service-role Supabase client. Bypasses RLS — use sparingly and only
// from server-only code paths that have already authenticated the
// caller via some out-of-band mechanism (token verification,
// scheduled job, internal RPC).
//
// CURRENT USES
//   /hm/[token]  — public hiring-manager portal. The route verifies a
//                  share token via the verify_hm_token RPC, then uses
//                  this client to fetch the candidate slate for the
//                  verified project. Each query is scoped to the
//                  token's project_id; nothing else is exposed.
//
// CALLERS MUST scope every query by an authenticated identifier
// (project_id, organization_id) that they have themselves verified.
// This client provides no defence against a buggy caller.

let _client: SupabaseClient | null = null;

export function getServiceRoleSupabaseClient(): SupabaseClient {
  if (!_client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url) {
      throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
    }
    if (!key) {
      throw new Error(
        "SUPABASE_SERVICE_ROLE_KEY is not set — required for the public hiring-manager portal route."
      );
    }
    _client = createClient(url, key, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }
  return _client;
}
