# The pre-launch checklist, slice two — THE GRANTS PASS — Phase 0 + THE D-GATE — 2026-08-25 — DRAFT

**Status: DRAFT. Nothing here is confirmed. Migration 110 waits on
the founder's written word against THIS document. Grants are
behaviour: this gate exists because three of the flagged grants
turned out to be load-bearing, and revoking them would have broken
the product quietly.**

Scope: the §122 sweep's one real follow-up — EXECUTE grants on
SECURITY DEFINER functions flagged by the advisor (15 anon-executable,
42 authenticated-executable).

---

## Part 1 — What Phase 0 verified, in code

### The anon grants that are LOAD-BEARING (stay, all eleven)

| Function | Verified caller | Why anon |
|---|---|---|
| `verify_hm_token`, `verify_invitation` | token pages | the token path has no session — that IS the design |
| `candidate_portal_*` (six) | candidate portal | same token path (073) |
| `check_rate_limit` | `src/lib/rate-limit/server.ts:49`, cookie client | `/request-access` is signed-out; the limiter must answer anon — and it FAILS CLOSED, so a revoked grant reads as "everything refused", silently |
| `record_email_delivery_event` | `api/webhooks/resend/route.ts` | the webhook client is built with the ANON key; svix signature is the auth, at the app layer |
| `run_guarantee_maintenance` | `api/cron/maintenance/route.ts` | Vercel cron carries no session; CRON_SECRET is the auth, at the app layer |

### The functions that need no caller at all (revoke everything)

Seven TRIGGER functions — Postgres does not check the invoking
session's EXECUTE when a trigger fires, and the house precedent is
already live (`guard_author_in_org` 057, every `audit_*` 068 carry
`REVOKE ... FROM public, anon, authenticated`):

`guard_task_assignee_changes` (106), `guard_objective_owner_changes`
(107), `guard_financial_key_results` (108),
`guard_lead_recruiter_changes` (064), `handle_new_auth_user`,
`record_skill_version` (103), `candidates_link_network_profile`
(098). The 107/108 guards were revoked public+anon at birth; they
appear on the list because Supabase's DEFAULT PRIVILEGES grant
authenticated separately — the miss is the platform default, not the
migrations.

### Everything else on the authenticated list is the mechanism

RLS predicates (`current_user_role`, `current_user_org_id`,
`client_org`, `can_view_portal_mandate`, `is_current_user_founder`,
`current_user_client_id`) execute as the querying role — authenticated
EXECUTE is how RLS works. The doors (`record_activity_event`,
`record_agent_event`, `portal_*`, the invitation/grant/token RPCs,
`set/clear_network_dnc`, `resolve_network_profile`) are called by
signed-in sessions — that is their job. No change.

---

## Part 2 — THE D-GATE (drafted, awaiting the founder's word)

### D1 — Migration 110: the seven trigger functions lose every session grant

`REVOKE ALL ... FROM public, anon, authenticated` on the seven —
completing the 057/068 pattern where 064/103/098/106 predate it and
107/108 were beaten by the platform default. service_role untouched.

**Recommend: as stated.**

### D2 — The two machine doors lose their surplus AUTHENTICATED grant only

`record_email_delivery_event` and `run_guarantee_maintenance` keep
anon (the verified callers) and drop authenticated — a signed-in
browser session has no business at a webhook or a cron door, and the
app-layer secrets (svix, CRON_SECRET) already refuse before the RPC.
`check_rate_limit` keeps BOTH: signed-in flows are rate-limited
through the same cookie-client helper.

**Recommend: as stated.**

### D3 — Verification before, during, after

- A privilege-matrix read (`has_function_privilege`, live, read-only)
  BEFORE and AFTER the migration, recorded in § 124 — the diff must
  be exactly the planned rows and nothing else.
- BEHAVIOURAL smoke after: /request-access still renders and its
  limiter still answers (an anon REST probe of `check_rate_limit`
  returns a verdict, not a privilege error); a skill edit still
  writes a version row (the trigger fires under the revoke); the
  task/objective guards still refuse their named negatives (the okr
  and task harnesses re-run live — fourteen + eight invariants
  already cover every guard by name).
- Drive 0f9 (light): the anon probe + one authenticated surface
  touch; no scratch principals needed beyond what the harnesses
  forge.

**Recommend: as stated.**

### D4 — The ladder on confirmation

Privilege matrix (before) · migration 110 · matrix (after, exact
diff) · okr + task harnesses re-run live · anon `check_rate_limit`
probe + /request-access load · § 124 DRAFTED, no completion
declared.

## Part 3 — Named rulings

- **R1 — nothing load-bearing moves.** The eleven anon grants stay;
  the three code-verified machine paths (limiter, webhook, cron) are
  named in the migration's comments so no future sweep "fixes" them.
- **R2 — the diff is closed-form.** Exactly nine functions change
  (seven full revokes, two authenticated-only); the matrix diff
  proves it.
- **R3 — fails-closed stays fails-closed.** The rate limiter's
  refuse-on-unavailable doctrine (088) is why this gate exists: a
  broken grant would present as safety, not as breakage.

Numbers at drafting: next migration 110, next § 124, next drive 0f9;
vitest 929; durable baseline 25/24/74/5/5/1/1/2/2/1/1 + tasks 0 +
objectives 0 + key_results 0.
