# BACKUP COVERAGE INVENTORY AND DESIGN DECISION — 2026-10-07

Requirement 1 (inventory) and the pre-implementation assessment the brief required before
choosing a host for the job.

---

## 1. Actual coverage inventory

### 1.1 Database

| Property | Value | Source |
|---|---|---|
| Plan | **`free`** | `get_organization` (live) |
| Automated backups | **NONE** | Supabase published pricing |
| PITR | Not available on Free | Supabase published pricing |
| Log retention | 1 day | Supabase published pricing |
| **Manual backups taken to date** | **NONE FOUND.** Searched the repo, `~/Downloads`, `~/Desktop` for `*.dump`, `*.sql.gz`, `*backup*`, `*.bak` — no database artefact exists | filesystem search |
| Schema reproducible from repo? | **NO** — `001_core_schema.sql` is 0 bytes, so the base schema exists only in the live database | `ls -la` |

> The one file the search surfaced, `~/Downloads/stripe_backup_code.txt`, is a Stripe
> two-factor recovery code and unrelated to database backup. It was not opened.

**Current database recovery capability: zero. There is no restore point of any kind.**

### 1.2 Storage — measured, not estimated

| Bucket | Objects | Total bytes | Largest object | Oldest | Newest | Covered by any Supabase backup? |
|---|---|---|---|---|---|---|
| `cvs` | **4** | **1,100,864** (1.05 MB) | 582,147 | 2026-04-30 | 2026-09-23 | **No — on any plan** |
| `call-audio` | 0 | 0 | — | — | — | No |
| `invoice-assets` | 0 | 0 | — | — | — | No |

Supabase, verbatim: *"Database backups do not include objects you store via the Storage
API, as the database only includes metadata about these objects."*

**Current storage recovery capability: zero.**

### 1.3 Coverage summary

| Asset | Backed up today | Recoverable today |
|---|---|---|
| Postgres data | ❌ | ❌ |
| Postgres schema | ❌ (repo cannot rebuild it) | ❌ |
| Storage objects | ❌ | ❌ |
| Bucket configuration | ❌ | Partially — derivable from migrations |
| RLS policies | ✅ in migrations | ✅ provided base schema is recovered |
| Auth users | ❌ | ❌ |
| Agent credentials | ✅ held in Vercel env | ✅ |

---

## 2. Growth model — what the design must survive

Today's 4 objects are irrelevant to the design; the ceilings are what matter.

| Bucket | Per-object limit | Plausible 12-month volume | Bytes |
|---|---|---|---|
| `cvs` | 10 MB | 2,000 candidates × ~1 MB observed average (measured: 275 KB mean, 582 KB max) | ~0.5–2 GB |
| `call-audio` | **50 MB** | 500 calls × ~20 MB | **~10 GB — this dominates** |
| `invoice-assets` | 2 MB | ~20 logos | ~5 MB |

**Design consequence:** `call-audio` is the volume risk, not `cvs`. A design that only works
at 1 MB is not a design. The job must handle an object set that cannot be copied inside one
function invocation.

---

## 3. Execution-environment constraints — verified against Vercel's documentation

Fetched 2026-10-07 from `vercel.com/docs/cron-jobs/manage-cron-jobs`:

| Constraint | Verbatim / verified | Design consequence |
|---|---|---|
| **No retry** | *"Vercel will not retry an invocation if a cron job fails."* | A failed run must be **self-healing on the next run**. Fire-and-forget is unacceptable |
| **Best-effort delivery** | *"Cron job delivery is best effort… occasional transient network errors can prevent a request from reaching your function."* | **Missed runs must be survivable.** The job cannot plan from "what changed yesterday" |
| **Duplicate delivery** | *"Cron delivery can also occasionally invoke the same scheduled run more than once."* | **Must be idempotent** |
| **Concurrency** | *"If your cron job runs longer than the interval… Vercel can trigger a second instance while the first is still running."* Vercel recommends a lock | **Must hold a mutual-exclusion lock** |
| **Duration** | Same limits as Vercel Functions; `maxDuration` applies | **Must be time-budgeted and resumable** |
| **Vercel's own prescription** | *"Use both locks… and idempotent reconciliation… Query and process all work since the last successful run"* | Reconciliation-based planning, not delta-based |

---

## 4. Restore requirements that constrain the backup format

Working backwards from requirements 5, 7, 11 and 13:

1. **Path reconstruction** — `candidates.cv_url` and `candidate_notes.audio_path` reference
   objects by path. The backup must preserve the exact `bucket/key` so a restore re-creates
   references that already exist in the database.
2. **Bucket configuration** — a restore into a fresh project must re-create buckets with the
   same privacy, size limit and MIME allowlist, or uploads silently change behaviour.
3. **Access controls** — the storage RLS policies are in migrations, but the backup should
   capture a snapshot so a restore can be verified rather than assumed.
4. **Recovery-point coordination** — a file backup at 06:00 and a database backup at 02:00
   produce a 4-hour window where the database references objects the file backup lacks, or
   vice versa. **Every manifest must record a database recovery point** so the pairing is
   explicit rather than inferred.
5. **Integrity** — a restore must be able to prove each object is byte-identical, not merely
   present.
6. **Encryption at rest in the destination**, because the destination holds candidate CVs
   outside Supabase's own controls.
7. **Erasure safety** — a restore must not resurrect a candidate whose data was erased after
   the backup was taken. This is the requirement most likely to be forgotten and the one with
   a regulator attached.

---

## 5. Host options assessed

| Option | Duration | Retry | Credential blast radius | New infra | Verdict |
|---|---|---|---|---|---|
| **A — extend the existing `/api/cron/maintenance`** | Shared with guarantee maintenance **and the Monday AI sweep**, which makes one model call per active mandate | None | Reuses `CRON_SECRET` | None | **Rejected.** Couples backup to the AI sweep's duration; a slow sweep starves the backup and one failure takes both. Measured sweep latency is ~25–32s per capability per mandate — it will grow |
| **B — a separate cron entry → dedicated `/api/cron/backup`** | Its own budget | None (mitigated by reconciliation) | Reuses `CRON_SECRET`, same auth pattern | None — Vercel allows 100 crons per project on every plan | ✅ **SELECTED** |
| C — GitHub Actions scheduled workflow | 6 h, built-in retry | Yes | **Adds a second home for a service-role-grade key**, in a repo with no CI today | New CI surface | Rejected for now. Genuinely better for very large volumes; revisit if `call-audio` approaches 10 GB |
| D — Supabase pg_cron | n/a | n/a | In-database | `pg_cron` **not installed** (verified) | Rejected |
| E — Supabase Edge Function + scheduler | Own limits | Varies | New deploy target | New runtime | Rejected — a second deployment surface for one job |

### 5.1 The selected design, and why it is the smallest *reliable* one

**A separate daily cron hitting a dedicated route, made reliable by four properties rather
than by infrastructure:**

| Property | Mechanism | Answers which constraint |
|---|---|---|
| **Reconciliation-based** | Each run diffs *source truth* against the *destination manifest*. It never asks "what changed since yesterday" | Missed runs self-heal (§3) |
| **Idempotent** | Objects are matched by `sha256`; an already-present, checksum-matching object is skipped | Duplicate delivery (§3) |
| **Mutually exclusive** | Postgres `pg_try_advisory_lock` — no Redis, no new vendor; the database is already there | Concurrency (§3) |
| **Time-budgeted and resumable** | Stops cleanly at a configured budget well under `maxDuration`, records progress in the manifest, resumes next run | Duration ceiling (§3), 10 GB volume (§2) |

**Nothing new is introduced except one route and one object-storage bucket at the
destination.** No scheduler, no queue, no CI, no Redis, no second credential store.

**Honest limitation, stated rather than hidden:** a once-daily reconciliation means the
worst-case file RPO is ~24 hours plus however many runs convergence takes after a very large
upload. At current volume convergence is one run. If `call-audio` grows past a few GB, option
C becomes the right answer and this decision should be revisited — the module's destination
and planner are deliberately host-agnostic so that move is a wiring change, not a rewrite.

### 5.2 What is deliberately NOT in scope

- **Database backup automation.** On Pro, Supabase takes daily backups; building a second
  mechanism would duplicate a managed feature. What *is* in scope is the **schema reference
  snapshot** (closing the 0-byte `001` gap) and **recovery-point coordination** between the
  managed database backup and this file backup.
- **Triggering a production backup.** Requires approval.
- **Adding the cron entry to `vercel.json`.** That would activate the job on next deploy,
  which is a production configuration change. It is listed as an activation step instead.

---

## 6. Destination: independently recoverable

Requirement 3 is explicit that another bucket in the same project does not count. The
destination must survive the loss of the Supabase project **and** of the Supabase account.

| Candidate | Independent of Supabase? | Cost at ~2 GB | Verdict |
|---|---|---|---|
| **Cloudflare R2** | Yes — separate vendor, separate account | ~$0.03/mo storage, **$0 egress** | ✅ **Recommended.** Zero egress matters precisely when restoring |
| AWS S3 | Yes | ~$0.05/mo + egress on restore | ✅ Acceptable |
| Backblaze B2 | Yes | ~$0.01/mo | Acceptable |
| Vercel Blob | Partially — same vendor as the app host | Low | ⚠️ Correlated failure with the application |
| Second Supabase bucket | **No** | — | ❌ **Excluded by requirement 3** |

**Implementation is S3-compatible**, so R2, S3 and B2 are all reachable through one adapter
with different endpoints. A `local` filesystem adapter exists for tests and rehearsal only.

**No destination is provisioned.** Without `BACKUP_*` environment variables the feature is
inert and says so — the same honest-absence pattern as call transcription.
