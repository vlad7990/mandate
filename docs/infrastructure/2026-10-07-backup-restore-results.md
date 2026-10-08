# BACKUP AND RESTORE — TEST AND REHEARSAL RESULTS — 2026-10-07

Evidence for requirements 10–13. Everything here was executed locally against synthetic
data. **No production backup was taken and no production restore was performed** — both
require approval.

Reproduce with `npm test` (unit) and `npm run rehearse` (restore rehearsal).

---

## 1. Automated tests — 92 new, all passing

Suite total went **1,571 → 1,663**. `tsc --noEmit` clean, `eslint` clean, `next build`
succeeds with `/api/cron/backup` emitted.

| File | Tests | Covers |
|---|---|---|
| `src/lib/backup/plan.test.ts` | 22 | Reconciliation, erasure safeguards, manifest bookkeeping |
| `src/lib/backup/crypto.test.ts` | 37 | Encryption, key handling, integrity, report sanitisation, manifest version gate, SigV4 |
| `src/lib/backup/run.test.ts` | 33 | End-to-end runs against a real filesystem destination |

### 1.1 Requirement 10's named cases

| Case | Test | Result |
|---|---|---|
| **Interrupted run** | Clock advanced 20 s per read against a 45 s budget | Stops cleanly mid-plan, `budgetExhausted: true`, outcome `partial`, reason *"the next run resumes"*. Second run copies exactly the remainder |
| **Changed file** | Same key, new size / new timestamp | Re-copied; **both versions retained** at the destination because paths are content-addressed, so a corrupt upload cannot overwrite the only good copy |
| **Changed file, same size** | Timestamp moved, size identical | Re-copied — the realistic "CV replaced with a revision of the same length" case |
| **Missing file** | Listed but download fails | Reported `source_missing`; the objects that succeeded are still recorded, so progress is durable |
| **Deleted file** | In manifest, gone from source | `forget` — but **only when the bucket listed cleanly** |
| **Failed transfer** | Destination PUT throws 503 | `upload_failed`, object not recorded, next run retries |
| **Corrupting destination** | Returns altered bytes on read-back | Caught — GCM authentication fails before the checksum is even reached |
| **Wholly unusable destination** | Even the manifest cannot be written | Outcome `failed`, not `partial` — no progress is durable, so it must not claim partial success |
| **Transient failure then recovery** | Fails once, succeeds next run | `partial` → `complete`. This is the whole reliability story, because **Vercel never retries** |
| **Duplicate invocation** | Two identical runs | Second copies nothing; one object at the destination, not two |
| **Missed runs** | Three objects accumulate, no run fires | Next run plans all three — reconciliation, not a delta window |
| **Concurrent invocation** | Lock already held | `skipped`, cleanly |
| **Lock unavailable** | Wrapper function absent (migration 161 unapplied) | `failed` — refuses rather than running without exclusivity |

### 1.2 Two real defects the tests caught

Both were in source, not in the tests, and both would have been silent in production:

1. **`digestsMatch` reported two malformed digests as equal.** `Buffer.from("zz","hex")`
   does not throw — it stops at the first invalid character and returns an **empty** buffer,
   so two different corrupt digests both became zero-length and `timingSafeEqual` said
   "match". A caller comparing corrupt digests would have been told the object verified.
   Fixed by validating hex shape before comparing.
2. **The credential scrubber leaked bearer tokens.** `Authorization: Bearer <token>` has two
   words before the secret; the pattern consumed `Bearer` and left the token in the message —
   which would then have been written to logs and the heartbeat. Fixed to consume the scheme
   and the token together.

### 1.3 Requirement 9 — no CV content, no secrets

Verified by test: URL userinfo, AWS-style key ids, long opaque secrets, self-labelled
credentials and AWS signatures are all redacted **by shape, not by a name denylist**;
newlines are collapsed so nothing hides below a log line; reasons are capped at 200
characters so unanticipated content cannot leak; the failure sample is capped at 10 so a
systemic failure writes a small row. Object **keys are kept** — an operator cannot restore
without them. A test asserts a CV string never appears in a restore report.

---

## 2. Restore rehearsal — executed

`npm run rehearse`, 8 sequential phases, all passing.

### 2.1 ⚠️ Environment caveat, stated plainly

The rehearsal was **designed** to run against a `postgres:17` container to match
production's 17.6. **The local Docker daemon was unresponsive on 2026-10-07** — every call,
including `docker ps`, died on `_ping` — so it was retargeted at a throwaway database on the
local **PostgreSQL 14.19** cluster, created and dropped by the harness.

**What this does and does not prove.** Everything exercised — RLS, plain SQL functions,
advisory locks, `pg_dump` custom format, `pg_restore --clean` — behaves identically across
14 and 17, so the **restore logic is genuinely proven**. What is *not* proven is
17.6-specific behaviour. **Activation step 11, a restore rehearsal against a real Supabase
backup, remains required, and the RTO below is not a production figure.**

The container-based harness is preserved in git history and should be preferred whenever
Docker is healthy.

### 2.2 Measured results

| | |
|---|---|
| Ran at | 2026-10-07T20:55:35Z |
| Database engine | PostgreSQL 14.19 local (production 17.6 — gap disclosed) |
| Objects | 4 (2 tenants, 3 CVs + 1 call audio), 398,336 synthetic bytes |
| Backup elapsed | **227 ms** |
| **Restore elapsed** | **55 ms** ← measured RTO at this volume |
| Objects verified byte-identical | **4 / 4** |
| Path reconstruction | **3/3 `cv_url` + 1/1 `audio_path` resolved** |
| Tenant isolation after restore | **held** — 2 / 1 / 0 rows for tenant A / tenant B / no-claims |
| Erasure guard | suppressed object pruned, key recorded |

Raw output: `evals/backup-rehearsal/last-run.json`.

### 2.3 The eight phases

1. **Backup** — `pg_dump -Fc` plus the real `runBackup`. 4 objects copied, no failures,
   manifest records bucket config and a database recovery point
2. **Total loss** — `drop schema public cascade` **and** deletion of every source file.
   Asserted: zero tables, source directory gone
3. **Restore** — `pg_restore`, then `verifyBackup()` decrypting and verifying every object
   before writing. 4/4 verified, 0 failed
4. **Reference resolution** — every `cv_url` from the restored database resolves to a
   restored file, and so does the `audio_path`. This is the check that fails when a backup
   stores content-addressed blobs and forgets the original key
5. **Tenant isolation** — signed in as two different organisations under `SET ROLE
   authenticated` with JWT claims: tenant A sees 2, tenant B sees 1, **no claims sees 0**,
   and `relrowsecurity` is still true. A restore that defaulted to open would be the worst
   possible outcome of a recovery
6. **Recovery-point coordination** — `describeRecoveryCoordination()` reports *"Counts
   agree"*
7. **Erasure guard** — a suppression added **after** the backup. The post-restore check
   surfaces the resurrected row (the dump predates the request, so the row comes back), and
   the next backup run prunes the object and records the key
8. **Results** — written to `last-run.json`

### 2.4 Phase 7 is the finding worth reading twice

The database dump predates the erasure request, so **restoring the database brings an erased
candidate's row back**. The file backup correctly lacks their CV, but the row returns. No
backup design prevents this — the dump is a point in time, and that point is before the
request existed.

What closes it is a **mandatory post-restore step**: run `restoreSuppressionCheckSql()`
before reopening access. It is asserted here and is a required step in the runbook, not
advice.

---

## 3. RPO and maximum potential data loss — requirement 12

| Scenario | Maximum loss | Why |
|---|---|---|
| **Today, before activation** | **EVERYTHING** | Free plan: no database backups of any kind; no file backup running |
| After activation, database | **Up to 24 hours** | Supabase Pro daily backups, 7-day retention. No PITR by decision |
| After activation, files | **Up to 24 hours**, plus convergence | Daily cron at 06:30 UTC. At present volume one run converges; a very large upload may take more than one |
| Coordination gap | **Up to ~4.5 hours of mismatch** | Supabase's nightly backup and the 06:30 file run are independent. Recorded in each manifest's `recoveryPoint`; `describeRecoveryCoordination()` states which side is ahead |
| Time to recover (RTO) | **Unknown for production** | 55 ms at 398 KB locally. Dominated in production by the Supabase restore, which has never been timed. Activation step 11 produces the real number |

**The honest sentence for a customer:** *in the worst case you lose up to one day of work,
and we can tell you exactly which day.* Not "we have backups".

---

## 4. What is proven, and what is not

**Proven:** reconciliation converges after missed runs · idempotent under duplicate delivery
· partial progress is durable and resumable · objects are encrypted at rest and verified on
read-back · tampering is detected · the manifest version gate refuses an unreadable manifest
rather than starting fresh · suppressed objects are never copied and already-stored ones are
pruned · a failed suppression read refuses the run · reports carry no CV content and no
credentials · a restore reconstructs paths, preserves tenant isolation, and surfaces
resurrected erasures.

**Not proven, and listed so it is not assumed:**

1. **The S3 adapter against a real bucket.** SigV4 is hand-rolled (a deliberate trade against
   a multi-megabyte SDK for five operations) and unit-tested for determinism, but **never run
   against R2 or S3**. Activation step 7 is the proof, and `verifyAccess()` exists for it. If
   it fails, the fallback is `@aws-sdk/client-s3` behind the same `Destination` interface —
   about an hour.
2. **Production-scale volume.** Tested at 4 objects. The budget-and-resume path is tested
   with a manipulated clock, not with 10,000 objects.
3. **PostgreSQL 17.6 specifically** — §2.1.
4. **Supabase's own restore.** Never performed. Step 11.
5. **Whether `auth` users are included in a Supabase project restore.** Not verified. Losing
   sign-ins while keeping data is its own incident.
6. **Monthly automated verification.** `verifyBackup()` is the right tool and is not yet
   scheduled.
