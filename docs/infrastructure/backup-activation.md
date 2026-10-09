# Storage backup — state, scheduling analysis, and activation steps

**Nothing in this document has been activated.** No production transfer has
run, no environment variable has been set, and no cron has been scheduled.
Everything below is prepared and waiting on an explicit decision.

**Updated 2026-10-09:** migration **161 is applied** (2026-10-08), so the
"also blocking" note at the end of §1 is closed — the advisory lock exists.
What remains is a destination bucket and its credentials, both founder
actions. The storage backup still has **never run against real S3 or real
candidate data.**

---

## 1. Where this actually stands

The distinction between these five states is the point of the table. A route
existing is not a backup.

| State | Status | Evidence |
|---|---|---|
| **Implemented** | ✅ yes | `src/lib/backup/` — 11 modules, ~3,900 lines; covers all three buckets, AES encryption, manifests, SHA-256 integrity, incremental copy, suppression-aware pruning, partial-failure reporting, budget-bounded runs, bounded retries |
| **Tested** | ✅ yes | 5 test files, 1,350+ lines. Byte-identical restore of synthetic files across all three buckets; tamper detection; wrong-key refusal; interrupted-run resumption; lock contention |
| **Configured** | ❌ no | No `BACKUP_*` variable exists in any Vercel environment. The route answers 503 `"BACKUP_DESTINATION is not set"` |
| **Scheduled** | ❌ no | `vercel.json` has one cron, `/api/cron/maintenance`. The backup entry is drafted in §4 and deliberately not applied |
| **Executed** | ❌ never | No production run has occurred |
| **Restore-verified** | ⚠️ synthetic only | Round-tripped against a local filesystem destination with synthetic files. **Never against real S3 and never against real candidate data.** This is condition 3 of the pilot gate and it is not met |

~~Also blocking: **migration 161 is unapplied**~~ — **applied 2026-10-08.**
`backup_try_lock` exists, so a run would now acquire its advisory lock
rather than refusing for want of one.

---

## 2. Measured volume

Read from `storage.objects` on 2026-10-08:

| bucket | objects | bytes | largest |
|---|---|---|---|
| `cvs` | 4 | 1,100,864 (1.05 MB) | 582,147 |
| `call-audio` | 0 | 0 | — |
| `invoice-assets` | 0 | 0 | — |
| **total** | **4** | **1.05 MB** | |

Average object 268.8 KB. Oldest 2026-04-30, newest 2026-09-23.

This is a pre-first-client database. Every number below scales from it.

---

## 3. Does the scheduler fit the volume?

**Limits in play**

| | value | source |
|---|---|---|
| Vercel function `maxDuration` | 60 s | set in the route |
| Run budget before clean stop | 45 s | `DEFAULT_BUDGET_MS` |
| Headroom for the manifest write | 15 s | the difference |
| Cron entries allowed | 100 per project, all plans | Vercel |
| Retry on failed cron | none | Vercel does not retry |
| Worst-case retry cost per object | 600 ms | `DEFAULT_RETRY_POLICY`, unhappy path only |

**Today.** Four objects totalling 1.05 MB. A full run is comfortably inside
one invocation with the budget essentially untouched. There is no scheduling
problem at current volume and the daily cadence in §4 is more than sufficient.

**The threshold that matters.** Per object the run does: list, download from
Supabase, SHA-256, encrypt, PUT to the destination, append to the manifest.
Round-trip latency dominates for small objects. At an **estimated** 200–500 ms
per object, a 45 s budget copies roughly **90–220 objects per invocation**.

That estimate is not measured — no run has touched real S3 — so treat it as
the shape of the answer, not the answer. The first real run is what replaces it.

**Consequences, which are mild because the design already handles them:**

- The run is **incremental**: after the first pass only new or changed objects
  are copied, so steady state is a handful of objects per day, not the whole
  corpus.
- The run is **resumable**: it stops cleanly at the budget with work
  outstanding and the next invocation continues. A backlog converges over
  several runs rather than failing.
- Therefore the only real exposure is the **initial seed**. At ~100 objects per
  run and a daily cron, a corpus of 1,000 objects takes about ten days to
  reach first full coverage — which is ten days of partial protection.

**Recommendation.** Run the initial seed manually, back-to-back, until the
report says `complete`, rather than letting the daily cron grind through it.
The route is callable with `CRON_SECRET`; each call picks up where the last
stopped. Then let the daily schedule maintain it.

**Re-evaluate the cadence if any of these become true:** the corpus passes
~2,000 objects, a single object exceeds ~50 MB (one object must fit in one
budget), or a run reports `partial` on consecutive days without the backlog
shrinking.

---

## 4. Prepared configuration — NOT applied

### 4.1 The cron entry

This is the exact change to `vercel.json`. It is **not** in the file, because
adding it activates the job on the next deploy.

```diff
 {
   "crons": [
     {
       "path": "/api/cron/maintenance",
       "schedule": "0 6 * * *"
+    },
+    {
+      "path": "/api/cron/backup",
+      "schedule": "0 3 * * *"
     }
   ]
 }
```

03:00 UTC: off the maintenance job at 06:00 so the two never contend for the
same minute, and in the quiet part of the day for a US-East database.

### 4.2 Environment variables

Names only. **Do not paste values into a chat, a commit, or this file.**

| variable | purpose |
|---|---|
| `BACKUP_DESTINATION` | must be `s3` |
| `BACKUP_S3_ENDPOINT` | provider endpoint URL |
| `BACKUP_S3_REGION` | region string |
| `BACKUP_S3_BUCKET` | destination bucket |
| `BACKUP_S3_ACCESS_KEY_ID` | write-scoped key |
| `BACKUP_S3_SECRET_ACCESS_KEY` | its secret |
| `BACKUP_S3_PREFIX` | optional path prefix |
| `BACKUP_ENCRYPTION_KEY` | base64 AES key — **see §5** |

Set in **Production only**, matching `SUPABASE_SERVICE_ROLE_KEY`'s scope.
Preview deployments should not hold credentials that can write to the backup.

### 4.3 Destination independence

The whole point is that the backup survives losing the Supabase account, so
the destination must not be inside it. Any S3-compatible provider on a
**separate account with separate credentials** satisfies this. The destination
key should be write-and-list only where the provider supports it; the restore
path needs read, but the cron does not.

---

## 5. The encryption key is the restore

`BACKUP_ENCRYPTION_KEY` is not an environment variable like the others. **If it
is lost, every backup is unreadable** — `restoreEntry` returns
`decrypt_failed` and there is no recovery from that.

- Generate with `generateKeyBase64()` from `src/lib/backup/crypto.ts`.
- Store it somewhere that is **not** Vercel and **not** Supabase, because
  those are the two things the backup exists to survive.
- A password manager entry or a sealed offline copy both qualify. Two copies
  in different places is not paranoid here.

---

## 6. Activation order

Each step is reversible until step 6.

1. **Provision the destination** — bucket on a separate provider account,
   write-scoped credentials.
2. **Generate and store the encryption key** off-platform, per §5.
3. **Apply migration 161** (`161_the_backup_can_hold_a_lock.sql`) via MCP
   `apply_migration`. Until this lands every run refuses.
4. **Set the `BACKUP_*` variables** in Production.
5. **Seed manually** — call `/api/cron/backup` with `CRON_SECRET` repeatedly
   until the report says `complete`. Watch the first call closely: it is the
   first time this code touches a real destination.
6. **Add the cron entry** from §4.1 and deploy. *This is the activation.*
7. **Rehearse a restore** — pilot gate condition 3. Recover to a scratch
   location, compare checksums, and **record the elapsed time**: an untested
   backup is a hypothesis, and without a timed rehearsal the RTO is a guess.
8. **Confirm the heartbeat** — `/api/health` should show the `storage_backup`
   row stamping `last_ok_at` daily.

---

## 7. What this still does not give you

- **No database backup.** This covers storage objects only. The database has
  no backup of any kind while the Supabase organisation is on the free plan.
  Pilot gate condition 1.
- **No tested recovery of real data.** Synthetic files only, local destination
  only.
- **No monitoring of absence.** The heartbeat exists and `/api/health` reads
  it, but nothing external polls that endpoint, so a backup that quietly stops
  is still found by a human noticing.
- **No retention policy decision.** The code prunes suppressed objects and
  keeps previous versions of changed ones; how long old versions should live
  is an unanswered question tied to the undecided retention policy (legal
  items L4/L5).
