# PRODUCTION ACTIVATION STEPS — AWAITING APPROVAL — 2026-10-07

**Nothing in this document has been done.** No purchase, no production configuration change,
no production backup transfer, no production restore. Each step below is stated precisely
enough to be executed or refused.

**What HAS been done** (local and isolated only): the backup module is implemented and
tested (92 tests), `vercel.json` is **unchanged** so no cron is scheduled, and the restore
procedure was rehearsed against a throwaway Postgres 17 with synthetic data.

**Updated 2026-10-09.** Migration **161 is applied** (2026-10-08, lock verified), so gate C
below is closed — `backup_try_lock` exists and a run would no longer refuse for want of it.
**Three gates remain: A (no cron entry), B (no `BACKUP_*` variables), D (no destination
bucket).** B and D are founder actions; A is one line and is deliberately held until B and
D are done, so the schedule does not start logging a daily 503.

**Total recurring cost of everything below: $25/month, plus a few cents of object storage.**

---

## 1. Why the backup cannot run yet — four independent gates

All four are deliberate. Each one on its own makes the job refuse.

| Gate | State | What happens today |
|---|---|---|
| **A** — `vercel.json` has no cron entry for `/api/cron/backup` | Not added | The job is never invoked |
| **B** — `BACKUP_*` environment variables absent | Not set | The route answers `503 {outcome: "skipped", reason: "BACKUP_DESTINATION is not set…"}` |
| ~~**C** — Migration 161 unapplied~~ | **CLOSED 2026-10-08** | `backup_try_lock` exists and was verified against production. No longer a gate |
| **D** — No destination bucket exists | Not provisioned | Nowhere to write |

This is the honest-absence pattern the product already uses for call transcription: the
feature is present, inert, and says so.

---

## 2. Steps, in order

### Step 1 — Upgrade Supabase to Pro, and set the spend cap in the same session
**Cost: $25/month** · Risk: low (billing only) · **Owner: founder**

1. Supabase dashboard → Organisation `Stratum` → Billing → upgrade to **Pro**
2. **In the same session, turn the spend cap ON.** Pro's usage-based overage is otherwise
   unbounded; this is the only purchase-side control that prevents a surprise invoice
3. Do **not** enable PITR. It is $100/month per 7 days of retention, it *replaces* daily
   backups rather than supplementing them, it requires a compute add-on, and a 24-hour RPO
   was the agreed position

**Verification:** `get_organization` reports `plan: pro`; the dashboard shows daily backups
enabled with 7-day retention.

**This step alone moves the database from "no restore point exists" to "24-hour RPO". It is
the single highest-value action in this document.**

### Step 2 — Auth hardening
**Cost: $0** · Risk: low (affects new and changed passwords only) · **Owner: founder**

Supabase → Authentication → Providers → Email:
- Minimum password length → **12**
- Require **all four** character classes
- Enable **leaked-password protection** (Pro-gated, hence after step 1)

**Why:** `src/lib/auth/password-policy.ts` already enforces 12 + four classes, but the
identity provider's floor is the default 6 — so anyone with the anon key can call
`signUp()` straight past the application policy. Until this is set, "we enforce strong
passwords" is not accurate.

### Step 3 — Create the backup destination
**Cost: ~$0.03/month at 2 GB** · Risk: none · **Owner: founder**

**Cloudflare R2 recommended** — a different vendor from Supabase (which is the point of a
backup) and **zero egress fees**, which matter precisely when restoring.

1. Create a bucket, e.g. `mandate-backups`, in a separate Cloudflare account or a
   dedicated R2 namespace
2. **Enable versioning or object-lock if available**, so a compromised backup credential
   cannot destroy history
3. Create an API token scoped to **that bucket only**, with exactly:
   `PutObject`, `GetObject`, `HeadObject`, `ListBucket`, `DeleteObject`

   **Not** account-wide, **not** `DeleteBucket`, **not** anything that can touch another
   bucket. `DeleteObject` is required only because the suppression prune must be able to
   remove an erased candidate's object — requirement 8.

**Equally valid:** AWS S3 or Backblaze B2. The adapter is S3-compatible; only the endpoint
differs. **Not acceptable:** a second Supabase bucket (requirement 3 excludes it) or Vercel
Blob (same vendor as the application, so correlated failure).

### Step 4 — Generate and ESCROW the encryption key
**Cost: $0** · Risk: **this is the step that can silently destroy the backup** · **Owner: founder**

```
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

> **⚠️ If this key is lost, every backup is permanently unreadable.** It is not stored in
> the manifest, not sent to the destination, and not recoverable from anything.
>
> **Escrow it somewhere that is not Vercel** — a password manager, a sealed envelope, a
> second person. A key held only in the environment of the system being backed up is not a
> backup key; it is a single point of failure with extra steps.

### Step 5 — Set the environment variables
**Cost: $0** · Risk: low · **Owner: founder**

Vercel → project `mandate` → Settings → Environment Variables → **Production**:

| Name | Value |
|---|---|
| `BACKUP_DESTINATION` | `s3` |
| `BACKUP_S3_ENDPOINT` | the R2/S3 endpoint URL |
| `BACKUP_S3_REGION` | `auto` for R2; the region for S3 |
| `BACKUP_S3_BUCKET` | `mandate-backups` |
| `BACKUP_S3_ACCESS_KEY_ID` | from step 3 |
| `BACKUP_S3_SECRET_ACCESS_KEY` | from step 3 |
| `BACKUP_ENCRYPTION_KEY` | from step 4 |
| `BACKUP_S3_PREFIX` | optional, e.g. `prod/` |

### Step 6 — Apply migration 161
**Cost: $0** · Risk: low (adds three functions, grants to `service_role` only) · **Owner: me, on approval**

`supabase/migrations/161_the_backup_can_hold_a_lock.sql` adds:
- `backup_try_lock()` / `backup_release_lock()` — wrappers over Postgres advisory locks,
  needed because `pg_try_advisory_lock` lives in `pg_catalog` and PostgREST cannot reach it.
  The key is fixed inside the function, not a parameter, so it cannot be used as a
  denial-of-service primitive against other advisory locks
- `backup_storage_policy_snapshot()` — storage policy names/commands/roles for the manifest,
  so a restore can verify access controls rather than assume them. Returns no policy
  expressions

All three: `REVOKE` from `public`, `anon`, `authenticated`; `GRANT` to `service_role` only.
No activity-trail change — the CHECK stays at 89, the intent door at 22.

**Verification:** `select public.backup_try_lock();` returns `t` as service role and is
refused to `anon`. Re-run the security advisors afterwards (Pro may surface new lints).

### Step 7 — Prove the destination works, BEFORE scheduling
**Cost: $0** · Risk: none (writes and deletes one probe object) · **Owner: founder or me**

This step exists because the S3 signing is hand-rolled rather than imported from the AWS
SDK — a deliberate trade to avoid tens of megabytes of bundle for five operations, and the
reason `verifyAccess()` exists. **Hand-rolled SigV4 fails in vendor-specific ways, so it
must be proven against the real bucket, not assumed from unit tests.**

Trigger the route by hand with the cron secret:

```
curl -s -H "Authorization: Bearer $CRON_SECRET" \
  https://getmandate.io/api/cron/backup | jq
```

**Expected on success:** `outcome: "complete"`, `copied: 4`, `bytesCopied: 1100864`
(the measured current contents of `cvs`; the other two buckets are empty).

**If signing fails** it will fail here, visibly, with a status code and no credential in the
message. The fallback is to add `@aws-sdk/client-s3` and swap the adapter — about an hour,
and the `Destination` interface exists so nothing else changes.

> **⚠️ This step is a production backup transfer and therefore requires explicit approval**,
> separately from the configuration steps above.

### Step 8 — Schedule the cron
**Risk: low** · **Owner: me, on approval** — this is a code change that activates on deploy

Add to `vercel.json`:

```json
{ "path": "/api/cron/backup", "schedule": "30 6 * * *" }
```

**06:30 UTC, 30 minutes after the existing maintenance job at 06:00.** Deliberately staggered
rather than shared: the maintenance route also runs the Monday agent sweep, which makes a
model call per active mandate at a measured 25–32 seconds each. A shared invocation would let
a slow sweep starve the backup, and one failure would take both.

### Step 9 — Commit a schema reference snapshot
**Cost: $0** · Risk: none (additive file) · **Owner: me, on approval**

`001_core_schema.sql` is **0 bytes**, so the repository cannot rebuild the database from
scratch — a recovery blocker independent of backups.

```
docker run --rm postgres:17 pg_dump --schema-only "<connection-string>" \
  > supabase/schema-reference.sql
```

**Must use PG 17 client tools** — the local `pg_dump` is 14.19 and refuses to dump a 17.6
server. This bit the rehearsal and will bite an incident.

### Step 10 — Monitoring
**Cost: $0** · Risk: none · **Owner: founder**

1. **External uptime monitor** on `https://getmandate.io/api/health`, 1–5 min, alerting to
   the founder. Nothing currently polls it, so time-to-detection for an outage is "until
   someone looks"
2. **Set `SENTRY_AUTH_TOKEN`** in Vercel — source-map upload is disabled without it, so
   every production stack trace is minified. One variable, materially shorter incident
   diagnosis
3. **Anthropic console budget alert** — two capabilities account for 52% of input tokens and
   caching has never once hit
4. **Watch the backup heartbeat weekly:**
   ```sql
   select name, last_ok_at, detail from ops_heartbeats where name = 'storage_backup';
   ```
   `last_ok_at` is set **only** by a fully complete run. A partial run is honest progress but
   not "ok", and an operator should see the difference.

### Step 11 — First production restore rehearsal
**Risk: none if done into a throwaway project** · **Owner: founder + me**

The procedure is rehearsed with synthetic data; it has never been run against a real
Supabase backup. Restore into a **new throwaway Supabase project**, never over production,
then record the elapsed time — **that number, not the rehearsal's, is the production RTO.**

> **⚠️ A production restore requires approval** even into a throwaway project, because it
> involves transferring real candidate data to a new location.

### Step 12 — Rotate the service-role key
**Cost: $0** · Risk: **medium — can cause a short outage if mis-sequenced** · **Owner: founder**

Known prior terminal exposure. Rotate in Supabase, re-set `SUPABASE_SERVICE_ROLE_KEY` in
Vercel, redeploy. **Do this on its own, last, not alongside step 1** — it is the only step
here that can take the site down.

---

## 3. Suggested order and gating

**Order:** 1 → 2 → 3 → 4 → 5 → 6 → **7 (approval gate)** → 8 → 9 → 10 → **11 (approval
gate)** → 12

**Blocking for the first client** — a client's candidate data should not be accepted without
these:

| | Step | Because |
|---|---|---|
| ✅ | **1** — Pro | There is currently no database restore point at all |
| ✅ | **3–8** — file backup live | No Supabase plan backs up the `cvs` bucket, on any tier |
| ✅ | **11** — a real restore rehearsed | An untested backup is a hypothesis, and the RTO is otherwise a guess |

**Strongly recommended, cheap:** 2, 9, 10, 12.

---

## 4. What is still missing after all twelve steps

Stated so that completing this list is not mistaken for completing readiness:

1. **Recovery is coordinated, not atomic.** The database backup (Supabase, nightly) and the
   file backup (06:30) are independent. The manifest records a `recoveryPoint` and
   `describeRecoveryCoordination()` reports which side is ahead in words — but a restore can
   still land rows referencing objects that do not exist. That is disclosed, bounded, and
   explained in the runbook; it is not eliminated.
2. **RPO is ~24 hours**, both sides. PITR would reduce it to minutes for $100/month plus
   compute; judged unnecessary at this stage and worth revisiting at the first paying
   self-service customer.
3. **No automated restore verification.** `verifyBackup()` exists and is the right tool; a
   monthly scheduled verification is not wired. Recommended once the backup has run for a
   month.
4. **Auth users are not covered.** Supabase manages the `auth` schema; whether it is included
   in a project restore was **not verified** and should be, because losing sign-ins while
   keeping data is its own incident.
5. **Volume ceiling.** The design converges over multiple runs and handles the measured
   1.05 MB trivially. If `call-audio` approaches several GB, a scheduled worker with native
   retry becomes the right host — the `Destination` interface and the reconciliation planner
   are deliberately host-agnostic so that is a wiring change, not a rewrite.
6. **The nine `[UNCONFIRMED]` fields in the incident runbook**, most importantly the absence
   of any second responder.
