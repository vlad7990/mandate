# INFRASTRUCTURE, BACKUP AND RECOVERY PLAN — 2026-10-07

**Status: RECOMMENDATION FOR APPROVAL. Nothing has been purchased and no production setting
has been changed.** Every step in §6 requires explicit authorisation before it is run.

**Founder decision applied (2026-10-07):** *Supabase Pro + separate CV-file backup.*
This document specifies exactly what that means, what it costs, what it does **not** cover,
and the one part of it that no Supabase plan provides.

---

## 1. Verified current state

All read live on 2026-10-07. No setting was altered.

| Item | Value | Source |
|---|---|---|
| Supabase organisation | `Stratum` (`bfomdugfdcxxcneocihl`) | `get_organization` |
| **Plan** | **`free` / `tier_free`** | `get_organization` |
| Project | `Mandate` (`xipyqnltkbtywxqyxupf`), created 2026-04-26 | `get_project` |
| **Region** | **`us-east-1`** (AWS, N. Virginia, USA) | `get_project` |
| Postgres | 17.6.1.111, release channel `ga` | `get_project` |
| Status | `ACTIVE_HEALTHY` | `get_project` |
| Storage buckets | 3, all **private**: `cvs` (10 MB limit, PDF/DOCX), `call-audio` (50 MB, 7 audio MIME types), `invoice-assets` (2 MB, 3 image types) | `storage.buckets` |
| Application host | Vercel, project `prj_tB0GXtbyHjSV7UBhCWWycS3W6tvZ`, Node 24.x, region **not pinned** | Vercel CLI |
| Last production deploy | 6 days ago, `● Ready` | Vercel CLI |
| Production health | `200 {"ok":true,"checks":{"db":"ok","auth":"ok","cron":"ok"}}` | `GET /api/health` |
| Scheduled job | 1 — daily `0 6 * * *`, authenticated by `CRON_SECRET` | `vercel.json` |

### 1.1 What the Free plan actually gives — verified against Supabase's published pricing

| Property | Free |
|---|---|
| **Backups** | **None** |
| PITR | Not available |
| Uptime SLA | None |
| Log retention | **1 day** |
| Project pausing | **After 1 week of inactivity** |
| Support | Community |

Supabase's own guidance for this plan: *"We recommend that free tier plan projects regularly
export their data using the Supabase CLI `db dump` command and maintain off-site backups."*

**The position today, stated plainly: if the database were lost this afternoon, there is no
restore point.** With 4 candidates that is an inconvenience. With a client's live search in
it, it is the end of the engagement. This is the single most serious item in the entire
readiness assessment, and it costs $25/month to move off.

---

## 2. The gap no plan closes

> **"Database backups do not include objects you store via the Storage API, as the database
> only includes metadata about these objects."**
>
> **"Restoring an old backup does not restore objects you deleted after that backup."**
>
> — Supabase backup documentation, fetched 2026-10-07

**Neither daily backups nor PITR cover the `cvs`, `call-audio` or `invoice-assets` buckets —
on Free, Pro, Team or Enterprise.** Candidate CV files are the agency's primary working
material, and they currently have no backup path on any plan that can be bought.

A database restore without the files produces a database full of `candidates.cv_url` values
pointing at objects that no longer exist — a silently broken dataset rather than an obvious
failure. **Independent file backup is a requirement, not an optimisation.**

Two further facts verified the same day, which matter for the plan choice:

- PITR is **$100/month per 7 days of retention**, available on Pro and above, and **requires
  at least a Small compute add-on** (an additional cost on top).
- Enabling PITR **replaces** daily backups: *"If you enable PITR, we will no longer take
  Daily Backups."* The two do not stack.
- Daily backups **do not store passwords for custom roles**.

---

## 3. Recovery objectives

The founder's plan choice implies these. They should be stated in writing before the first
client, because a DPA clause will eventually reference them.

| Objective | Value implied by the chosen plan | Comment |
|---|---|---|
| **RPO — database** (max data loss) | **Up to 24 hours** | A daily backup is a daily backup. The worst case is losing a full working day of a live search |
| **RPO — uploaded files** | **Up to 24 hours**, once §4.2 is implemented. **Currently: total loss** | Set by the chosen backup frequency |
| **RTO** (time to restore) | **Target `[DECISION]`; realistically 2–8 hours untested** | Cannot be claimed until a restore has been rehearsed (§5) |
| **Uptime** | **No commitment, and none available** | Pro has no SLA. Do not promise one |

**Is PITR needed?** On this evidence, **no — not for the first client.** PITR converts the
RPO from 24 hours to minutes, for $100/month plus compute. With one pilot client and a
founder who can tell them "we lost yesterday afternoon, let's redo it", a 24-hour RPO is
survivable and honest. PITR becomes the right purchase when (a) a client's work is
economically irreplaceable within a day, or (b) a contract states an RPO under 24 hours.
**Revisit at the first paying Stage 2 customer, not now.**

---

## 4. Recommended configuration

### 4.1 Supabase Pro — $25/month

| Setting | Value | Why |
|---|---|---|
| Plan | **Pro** | Daily backups (7-day retention), no inactivity pausing, 7-day logs, email support |
| **Spend cap** | **ON** | Pro's spend cap, left off, allows usage-based overage to bill without limit. **Turn it on before anything else.** This is the only purchase-side control that prevents a surprise invoice |
| PITR | **Off** | §3 — not justified yet |
| Region | **Keep `us-east-1`** | Matches the agreed US-only scope. Migrating regions later is costly; this is the right choice *for this client* and should be revisited if the scope changes |
| Compute | Default | No evidence of pressure: 13 connections, 4 candidates |
| **Leaked-password protection** | **ON** | Pro-gated, has been on the checklist since August, and appears in every advisor run until enabled. Checked only when a password is *set*, so enabling it disrupts nobody who has already signed up |
| **Minimum password length** | **12** | Match `src/lib/auth/password-policy.ts`. Until this is set the app policy is bypassable via the anon key |
| **Required character classes** | **All four** | As above. Founder's decision of 2026-08-14, still unapplied at the identity provider |

### 4.2 Independent file backup — the part Supabase does not do

**Requirement:** a scheduled copy of all three buckets to storage outside Supabase, with its
own retention, verified by a restore rehearsal.

**Recommended shape — reuse what exists rather than adding infrastructure:**

The product already has an authenticated daily scheduled job
(`src/app/api/cron/maintenance/route.ts`, `0 6 * * *`, `CRON_SECRET`-gated, writing a
heartbeat to `ops_heartbeats`). It is the natural host.

| Decision | Recommendation | Rationale |
|---|---|---|
| Trigger | Extend the existing daily cron with a second step | No new scheduler, no new secret, and the heartbeat already proves it ran |
| Destination | `[DECISION: DESTINATION]` — options below | |
| Scope | All three buckets; `cvs` is the one that matters | |
| Mode | Incremental by object key and `last_modified` | 4 candidates today; must still work at thousands |
| Retention | `[DECISION: 30 days suggested]` | Should be ≥ the database's 7 days |
| Verification | Record object count and total bytes in `ops_heartbeats.detail`, so a silent failure is visible on `/status` | The existing heartbeat pattern, reused |
| Rehearsal | Quarterly, logged | An unrehearsed backup is a hypothesis |

**Destination options:**

| Option | Cost | Notes |
|---|---|---|
| **AWS S3 / Cloudflare R2** | Cents per month at this volume | **Recommended.** Different vendor from Supabase, which is the point of a backup. R2 has no egress fee |
| Vercel Blob | Low | Simplest to wire; same vendor as the app host, so a Vercel-account incident hits both |
| A second Supabase project | $0–25 | **Not recommended** — same vendor, correlated failure |

**I have not built this.** It is application code, and the brief's instruction was to prepare
steps for approval. It is roughly a half-day: list objects per bucket, diff against the
destination, stream the new ones, stamp the heartbeat. Say the word and I will write it with
tests.

### 4.3 Monitoring and logs

| Item | Now | Recommended |
|---|---|---|
| Error monitoring | Sentry live, PII-scrubbed | **Set `SENTRY_AUTH_TOKEN`** — source-map upload is currently disabled, so every production stack trace is minified |
| Uptime monitoring | **None.** `/api/health` is live and correct; nothing polls it | **Add an external monitor** on `/api/health`, 1–5 min interval, alert to founder. Free tier of any provider suffices. Time-to-detection today is "until someone looks" |
| Cron liveness | `ops_heartbeats` + surfaced by the health check | Already good. Extend `detail` with the file-backup result (§4.2) |
| Database logs | 1 day (Free) → **7 days (Pro)** | Sufficient for a pilot |
| Vercel function logs | Platform default, not verified | Verify retention before any incident commitment |
| **AI spend** | **Captured, never read** — `inference_runs` has 76 rows and no read path | Main assessment R3. For the pilot, a standing weekly manual query is acceptable |

### 4.4 Capacity and spending controls

| Risk | Control | Status |
|---|---|---|
| Supabase usage overage | **Spend cap ON** | **Must be set with the upgrade** |
| Anthropic spend | No cap configured in the product | **Set a budget alert in the Anthropic console.** Two capabilities account for 52% of input tokens, caching has never once hit, and `run_candidate_search` averages ~36k input tokens per call |
| Vercel usage | Plan default | Review limits at upgrade |
| Public endpoint abuse | Already strong — `/api/demo` at 10/hour/IP and 200/day global, failing closed; `/request-access` rate-limited plus Turnstile | **No change needed** |
| Storage growth | 10 MB/CV, 50 MB/audio bucket limits | Adequate |

### 4.5 Authentication settings

| Setting | Now | Recommended |
|---|---|---|
| Min password length | **6 (default)** | **12** |
| Character classes | **None required** | **All four** |
| Leaked-password protection | **Off** (Pro-gated) | **On** |
| MFA | Not implemented | Stage 4. Not a pilot blocker |
| SSO | Not implemented (disabled "coming soon" button) | Stage 4 |
| Service-role key | **Known prior terminal exposure, unrotated** | **Rotate, then re-set in Vercel.** Do not hold a client's data behind a known-exposed master credential |

---

## 5. Recovery procedure — to be written and rehearsed

**There is no documented restore procedure today.** An untested backup is a hypothesis, and
the DPA cannot state an RTO until this has been run once. Draft outline for approval:

**Scenario A — database loss or corruption**
1. Confirm scope; stop writes if partial (pause the cron, consider Vercel maintenance)
2. Restore the most recent daily backup via the Supabase dashboard
3. **Re-check storage consistency** — the restore does *not* bring back files. Reconcile
   `candidates.cv_url` and `candidate_notes.audio_path` against the `cvs`/`call-audio`
   buckets, and restore missing objects from the §4.2 backup
4. Re-verify: `GET /api/health`, then a spot-check of candidate records against the audit
   trail
5. Note the gap between the backup timestamp and the incident, and tell the client what was
   lost. Do not estimate — state it

**Scenario B — storage loss only**
1. Restore from the §4.2 destination
2. Reconcile against the database's metadata, which survived
3. Record any object the database references and the backup lacks

**Scenario C — Supabase project loss**
1. New project in `us-east-1`
2. Apply all 160 migrations in order from the repository — **but note `001_core_schema.sql`
   is 0 bytes**, so the base schema exists *only* in the live database. **This is a recovery
   blocker: a full rebuild from the repo is not currently possible.**
3. Restore data, restore files, re-set every environment variable
4. Re-create the 24 agent principals and their credentials

> **⚠️ Scenario C exposes a real, separate problem.** `001_core_schema.sql` being empty means
> the repository cannot rebuild the database from scratch. A `pg_dump --schema-only` of the
> current database, committed as a reference snapshot, would close it for the cost of one
> command. **Recommended before the first client**, and it is independent of the plan upgrade.

**Rehearsal:** restore to a throwaway project, verify row counts and a sample of file
references, record the elapsed time — that number becomes the RTO. Repeat quarterly.

---

## 6. Steps for approval — nothing below has been done

**Costs: $25/month recurring, plus a few cents of object storage. No other recurring cost.**

| # | Step | Who | Cost | Risk |
|---|---|---|---|---|
| 1 | Upgrade org `Stratum` to **Pro**, and **turn the spend cap ON in the same session** | Founder | **$25/mo** | Low. Billing change only |
| 2 | Auth → set min length **12**, require **all four** character classes | Founder | $0 | Low. Affects new/changed passwords only |
| 3 | Auth → enable **leaked-password protection** | Founder | $0 (Pro-gated) | Low. Checked on password set |
| 4 | Set **`SENTRY_AUTH_TOKEN`** in Vercel | Founder | $0 | Low. Enables source maps |
| 5 | Point an **external uptime monitor** at `https://getmandate.io/api/health` | Founder | $0 | None |
| 6 | Set an **Anthropic console budget alert** | Founder | $0 | None |
| 7 | **Rotate `SUPABASE_SERVICE_ROLE_KEY`**, re-set in Vercel, redeploy | Founder | $0 | **Medium** — mis-sequencing causes a short outage. Do it deliberately, not alongside step 1 |
| 8 | Commit a **`pg_dump --schema-only` reference snapshot** (fixes the 0-byte `001`) | Me, on approval | $0 | None — additive file |
| 9 | Build the **file-backup step** in the existing cron, with tests | Me, on approval | ~cents/mo storage | Low — additive, behind the existing `CRON_SECRET` |
| 10 | Write the **restore procedure** and rehearse it once | Founder + me | $0 | None |
| 11 | Re-run the **Supabase advisor** after step 1 | Me | $0 | None — Pro may surface new lints |

**Suggested order:** 1 → 2 → 3 → 4 → 5 → 6 → 8 → 9 → 10 → 7 → 11.
Step 7 last among the founder items, on its own, because it is the only one that can cause an
outage if mis-sequenced.

**Gating rule:** steps 1, 9 and 10 are **blocking for the first client.** A client's
candidate data should not be held with no backups (1), no file recovery (9), and no proven
restore (10). Steps 2, 3, 4, 5, 6, 7 are strongly recommended and cheap. Step 8 is cheap
insurance against a problem that already exists.
