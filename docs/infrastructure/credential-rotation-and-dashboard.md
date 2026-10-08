# Credential rotation and dashboard actions

Pilot gate condition 6, plus the Supabase upgrade that conditions 1–3 depend on.

**No credential value appears in this document and none should be pasted into a
chat, a commit, or an issue.** Everything below refers to credentials by name.

---

## 1. What is genuinely blocked, and what only looks blocked

Worth separating, because "dashboard work" has been treated as uniformly
founder-only and it is not.

| Action | Who can do it | Why |
|---|---|---|
| Create a Supabase secret key | **Founder only** | Dashboard or Management API. The Supabase MCP exposes no key-creation tool |
| Upgrade the organisation to Pro | **Founder only** | A purchase |
| Enable leaked-password protection | **Founder only, and plan-gated** | Pro feature; the toggle is locked on Free |
| Raise the password floor to 12 + four classes | **Founder, *or* anyone with a Supabase personal access token** | `PATCH /v1/projects/{ref}/config/auth`. Not plan-gated. Only founder-only because no PAT exists in this environment — see §5 |
| Set / change Vercel environment variables | **I can, with approval** | The Vercel CLI is authenticated here as `veltrixcpo-7194`. This is a production change, so it waits for an explicit go |
| Redeploy | **I can, with approval** | Same |
| Verify the result | **I can, unprompted** | `/api/health` is public and unauthenticated |
| Apply migration 161 | **I can, with approval** | MCP `apply_migration` |
| Insert `claude-opus-5` into `provider_models` | **I can, with approval** | One row; production write |

The Vercel MCP is **not** authorised for the `vn-mn-product-group` scope — it
returns 403. The CLI is, and that is what the steps below use.

---

## 2. Consumer inventory for `SUPABASE_SERVICE_ROLE_KEY`

**16 modules** read the service-role client. Every one of them breaks the
moment the key stops working, so the swap has to be atomic from their point of
view: new key set, then redeploy, then revoke the old one. Never revoke first.

| Area | Files | What breaks |
|---|---|---|
| AI pipeline | `lib/ai/inference.ts`, `lib/ai/registry.ts` | **Every model call in the product** |
| Token portals | `hm/[token]/page.tsx` + 2 API routes, `candidate/[token]/actions.ts`, `apply/[token]/api/submit`, `invite/[token]/actions.ts`, `join/[token]/actions.ts` | Hiring managers, candidates, applicants and invitees — all the unauthenticated doors |
| Client portal | `portal/invoices/[id]/page.tsx`, `portal/api/mandates/[id]/submit`, `portal/api/mandates/[id]/interview-answers` | Client-facing portal |
| Scheduled | `api/cron/maintenance`, `api/cron/backup` | Guarantee maintenance, Monday sweep, backup |
| Webhooks | `api/webhooks/resend` | Bounce and delivery feedback |
| Health | `lib/status/checks.ts` | `/api/health` and `/status` |

Environment scope: **Production only**, age **160 days**. Not set in Preview,
which is why preview deployments already run without these routes working.

The key is read in exactly one place — `src/lib/supabase-service-role.ts:25`
— so there is no second code path to update.

---

## 3. Replacement key type: compatible, verified

Do **not** rotate the legacy JWT secret. Legacy `anon` and `service_role` are
both signed by it, so rotating invalidates the anon key too **and signs out
every logged-in user**, with a broken-production window in between.

The modern key system is already enabled on this project. Checked 2026-10-08:

```
anon                     legacy        disabled: false
sb_publishable_FmFy1m…   publishable   disabled: false
```

A publishable key already exists, and `@supabase/supabase-js` is **2.104.1**,
well past the version that accepts `sb_secret_…`. The code hands the key
straight to `createClient` and never inspects its shape, so a secret key is a
drop-in replacement.

---

## 4. The rotation, in order

Each step is reversible until step 7.

1. **Founder:** Supabase dashboard → Settings → API Keys → create a **secret
   key** (`sb_secret_…`). Additive; nothing changes yet.
2. **Me, on approval:** add it as `SUPABASE_SERVICE_ROLE_KEY` to **Preview**.
   Preview does not currently hold this variable at all, so this is purely
   additive and tests the new key against the real database without touching
   production.
3. **Me:** deploy a preview and verify — `/api/health` on the preview URL
   should return `{"ok":true,...,"cron":"ok"}`. `checks.cron` goes through the
   service-role client, so a bad key shows up as `cron: degraded` rather than
   as silence.
4. **Me, on approval:** replace `SUPABASE_SERVICE_ROLE_KEY` in **Production**.
5. **Me:** redeploy production.
6. **Me:** verify. `/api/health` → all `ok`. Then exercise one token portal and
   confirm one AI call succeeds, because health only proves the client
   connects.
7. **Founder:** disable the legacy keys in the dashboard. **This is the
   revocation** — the point at which the 160-day-old exposed key stops working.

### Rollback

Before step 7 the old key still works, so rollback is: put the previous value
back in Vercel and redeploy. **Keep the old key retrievable until step 6 has
passed**, and do not let step 7 happen on the same day as steps 4–6.

After step 7 there is no rollback to the old key — it is dead by design. The
only path back is creating another secret key and repeating from step 1.

### One thing to confirm at step 7

I could not establish whether Supabase disables the legacy `service_role` key
**independently** of the legacy `anon` key, or whether it is a single switch
for both. If it is combined, step 7 also requires moving
`NEXT_PUBLIC_SUPABASE_ANON_KEY` to the existing `sb_publishable_FmFy1m…` and
redeploying **first** — otherwise the app loses both keys at once. The anon key
is public by design and already in the browser bundle, so that swap is safe;
it just has to happen before, not after. The dashboard will show which case
this is.

---

## 5. Password policy — exact steps

The app already enforces 12 characters and all four character classes at
signup (`src/lib/auth/password-policy.ts:31`). **That is not the boundary.**
Anyone with the anon key can call `supabase.auth.signUp()` directly and bypass
it, so until the dashboard matches, the real floor is the default 6 with no
class requirement.

**Not plan-gated.** Either route works:

- **Dashboard:** Authentication → Providers → Email → set minimum length `12`
  and require lowercase, uppercase, digits and symbols.
- **API**, for anyone holding a Supabase personal access token:

  ```
  PATCH https://api.supabase.com/v1/projects/xipyqnltkbtywxqyxupf/config/auth
  Authorization: Bearer <personal access token>
  Content-Type: application/json

  { "password_min_length": 12,
    "password_required_characters": "abcdefghijklmnopqrstuvwxyz:ABCDEFGHIJKLMNOPQRSTUVWXYZ:0123456789:!@#$%^&*()_+-=[]{};'\\:\"|<>?,./`~" }
  ```

  I can run this the moment a PAT exists in the environment. It is listed as
  founder-only today solely because one does not.

**Leaked-password protection is a separate toggle and *is* plan-gated**
(Authentication → Providers → Email → "Prevent use of leaked passwords"). It
requires Pro. HIBP is checked when a password is **set**, so enabling it later
disrupts nobody who has already signed up and delaying it costs nothing
retroactively.

---

## 6. Supabase Pro upgrade — exact steps

This is pilot gate condition 1 and conditions 2 and 3 depend on it.

1. Supabase dashboard → Organisation `Stratum` (`bfomdugfdcxxcneocihl`) →
   Billing → upgrade to **Pro**, $25/month.
2. **Turn the spend cap ON in the same visit.** Pro without a cap converts a
   traffic spike into an unbounded bill. This is the one step most easily
   forgotten because the upgrade flow completes without it.
3. Confirm afterwards: daily backups enabled, log retention now 7 days,
   project no longer pauses when idle.

What Pro does **not** buy, verified against Supabase's own documentation:

- **No uptime SLA.** Those start at Team, $599/month.
- **No PITR.** A separate $100/month add-on that *replaces* daily backups and
  needs a compute add-on.
- **No storage backup.** *"Database backups do not include objects you store
  via the Storage API."* No plan at any price backs up the `cvs` bucket, which
  is the entire reason `api/cron/backup` exists.

---

## 7. Related production writes, prepared and unapproved

Not credentials, but same class of change and same approval gate.

| Change | Why | Risk |
|---|---|---|
| Apply migration `161_the_backup_can_hold_a_lock.sql` | The backup refuses without the advisory lock | Low — two wrapper functions, no data touched |
| Insert `claude-opus-5` into `provider_models` | The armed `generate_evaluation` escalation targets a model the registry does not list | Low — one row. Without it the hop still works but cost reporting has a hole and the picker cannot offer the model |
| Add the backup cron to `vercel.json` | Activates the daily backup | Medium — first production transfer. See `backup-activation.md` |
