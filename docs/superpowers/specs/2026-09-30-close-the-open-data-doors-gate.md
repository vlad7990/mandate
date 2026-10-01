# CLOSE THE OPEN DATA DOORS — THE GATE — 2026-09-30 — DRAFT

**Awaiting the founder's word. Six rulings. D1 is the crux and load-bearing:
it decides who may still call the two functions. The vulnerability assessment
(commit 56a2d10) found both, and its central theme is the thing this slice
closes.**

The finding, restated: webhook/cron **authenticity is enforced at the Next
route** (Svix signature, `CRON_SECRET`) while the **underlying RPC is granted
to `anon` and `authenticated`**. So the route's control is bypassable — anyone
can call the RPC directly and skip the signature. This is the same principle
§210 established for the whole anon surface, one layer deeper: the *reachable*
surface must equal the *intended* surface.

Two functions:

- **`record_email_delivery_event`** (Finding 1, Medium). SECURITY DEFINER,
  granted `anon, authenticated`. Inserts into `email_suppressions` — a table
  whose only write policy is `_admin_insert` — so the definer function is a
  **confused deputy**: a caller writes a suppression they are forbidden to
  write directly. The address is caller-supplied; the precondition (a valid
  `provider_message_id`) is met by normal org membership
  (`candidate_outreach._role_select` + column priv, confirmed live). Net: a
  low-privilege member can suppress arbitrary addresses in their org, reversal
  privileged.
- **`run_guarantee_maintenance`** (Finding 2, Low). SECURITY DEFINER, granted
  `anon, authenticated`, no guard, writes `placement_fee_lines`. Low impact
  (idempotent, only earns what's due, no trusted input; the code acknowledges
  it), but the same open-door class.

---

## Part 1 — The rulings

### D1 — who may call these two functions after the fix? *(load-bearing)*

**Recommended: only `service_role`. REVOKE from BOTH `anon` AND
`authenticated`.**

Revoking only `anon` does **not** close Finding 1 — its *primary* vector is
the insider, an ordinary `authenticated` org member who can read a
`provider_message_id` and then call the RPC. Both functions are currently
granted `TO anon, authenticated` (confirmed: 062, 099, 126). Only
`service_role` — the role the routes use *after* their own auth check — should
retain EXECUTE.

*Alternative: revoke anon only.* Rejected: leaves the insider confused-deputy
open, which is the substance of the Medium finding.

*Alternative: add an in-function shared-secret argument.* Rejected: duplicates
the route's secret into the DB and is weaker than removing the grant.

### D2 — how do the routes call the RPC once it's service_role-only?

**Recommended: the existing `getServiceRoleSupabaseClient()`**
(`src/lib/supabase-service-role.ts`, `SUPABASE_SERVICE_ROLE_KEY`). It already
serves the public HM portal route in production, so **no new secret is
introduced** and the key is known-present. Its own doc names "scheduled job,
internal RPC" as intended uses. The webhook calls it *after* Svix
verification; the cron *after* the `CRON_SECRET` check — each route remains
the authenticity boundary, now a real one because the door behind it is shut.

### D3 — Finding 1 defence-in-depth: take the address from the matched row?

**Recommended: NO, and say why.** Once the function is service_role-only, its
only caller is the Svix-verified webhook, whose `to` field is the actual
bounced recipient reported by Resend — a **trusted** source. The
attacker-chosen-address amplification is closed by D1 alone. `candidate_outreach`
does not store the recipient address (only a channel), so address-from-row
would need a join plus a separate path for `invoice_deliveries` — cost with no
benefit once the door is shut. `p_address` stays; it is trusted again.

*Alternative: do it anyway.* Rejected: complexity for a vector D1 already closes.

### D4 — the 0/1 return (a message-id validity oracle)?

**Recommended: leave it.** It only ever leaked "is this a live message-id" to
an *untrusted* caller; once only `service_role` can call, there is no untrusted
caller to receive it. Not worth a signature change (which would force a DROP).

### D5 — the anon-surface pin, and the §210 guard's model

**Recommended: drop `RULED_ANON_SURFACE` 14 → 12** (remove both names), and
**fix the guard's model**: a `REVOKE ... FROM anon` must remove the name from
the *effective* anon set. Today `readSurface()` adds to `revoked` but never
removes from `grantedToAnon` (line 63-65) — so a bare revoke would leave the
name counted. This slice exposes that gap; the fix is one line plus a test
that the model itself drops a revoked name.

**Doctrine update, stated plainly:** 110's comments named *three* load-bearing
anon grants — limiter / webhook / cron. After this slice only the **limiter
(`check_rate_limit`) remains anon**, because it alone runs *before a session
exists*. The webhook and cron carry their own route secrets and now use
`service_role`. That is the correct end state; this tightens 110's doctrine
rather than contradicting it.

### D6 — Finding 4: the anon table-SELECT grant on `email_suppressions`?

**Recommended: fold in — REVOKE it.** Rows were already RLS-gated (anon has no
org, so no rows), so nothing leaked, but a bare `anon` SELECT grant on a
suppression list is needless surface. One line, same migration. Leave the
`authenticated` / org-scoped read as is.

---

## Part 2 — What must keep working

- The **real Resend webhook** still records deliveries and suppresses genuine
  bounces — now via `service_role` after Svix.
- The **cron** still earns guarantee instalments — via `service_role` after
  `CRON_SECRET`.
- `evaluateSendPolicy` still reads `email_suppressions` unchanged; the send
  ladder is untouched.
- §210's first guard (every function revoked from PUBLIC) still holds — the
  migration REVOKEs, it does not grant anything new to public/anon.

## Part 3 — As it would be built, under the recommended rulings

**Migration 159.**

- `REVOKE EXECUTE ON FUNCTION public.record_email_delivery_event(text,text,text,text) FROM anon, authenticated;`
  and `... run_guarantee_maintenance() FROM anon, authenticated;` — each with
  `GRANT ... TO service_role;` retained/explicit.
- `REVOKE SELECT ON public.email_suppressions FROM anon;` (D6).
- No function body change (D3/D4 decline).

**Routes.**

- `src/app/api/webhooks/resend/route.ts` — after `verifySvix`, call the RPC
  through `getServiceRoleSupabaseClient()` instead of the anon client.
- `src/app/api/cron/maintenance/route.ts` — after the `CRON_SECRET` check,
  call `run_guarantee_maintenance` through `getServiceRoleSupabaseClient()`
  instead of `createServerSupabaseClient()`.

**Guards, mutation-tested.**

- `anon-surface.test.ts`: pin 12; both names gone; **model fixed** so
  `REVOKE FROM anon` removes from the effective set, with a test proving the
  model drops a revoked name (so a future bare-revoke is counted correctly).
- New assertions: migration 159 revokes BOTH functions from `anon` AND
  `authenticated`; both routes call the RPC via `getServiceRoleSupabaseClient`,
  not the anon/user client.

**Drive 144, live in production.**

- **Before/after, as §210 did:** `record_email_delivery_event` called with the
  publishable key (anon) — 200 before is already known; after, expect **401
  permission denied**. Same for a signed-in non-service caller (authenticated).
- **The happy path still works:** call the RPC with the **service_role** key
  directly and confirm it still records a delivery / creates a suppression on a
  seeded outreach row — proving the route's new path works. (Full Svix-over-HTTP
  needs `RESEND_WEBHOOK_SECRET`, which may be absent; the service_role RPC call
  proves the data door end.)
- `run_guarantee_maintenance`: anon 401 after; service_role still runs.
- Teardown exact against the twelve counts + `email_suppressions` starting count.

## Part 4 — What this does NOT do

- It does not change `check_rate_limit` — that grant to anon is correct (runs
  before a session).
- It does not alter `email_suppressions` clearing (still privileged) or the
  send ladder.
- It does not add server-side Svix to the RPC — authenticity stays at the
  route, which is now the real boundary because the door is shut.
- It does not touch the other portal token doors (they legitimately take a
  token and are the intended anon surface).
