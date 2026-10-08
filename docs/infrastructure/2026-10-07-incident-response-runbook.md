# INCIDENT RESPONSE RUNBOOK — 2026-10-07

**Status: DRAFT FOR APPROVAL.** This closes legal item **L6**, which blocks the DPA's
breach-notification clause. **Do not sign a notification window in any contract until the
owner and contact fields below are filled in** — an agreed 24- or 72-hour commitment with an
unnamed owner is a commitment nobody holds.

**Scope.** Mandate's production service: the Vercel application, the Supabase database and
storage, and the vendors in `docs/legal/2026-10-07-factual-annexes.md` Annex F.

---

## 0. ⚠️ Unconfirmed fields — fill before this runbook is relied upon

Every item below is deliberately left blank rather than guessed. A runbook with invented
contacts is worse than none, because it will be followed.

| # | Field | Value | Needed for |
|---|---|---|---|
| U1 | **Incident Commander** (primary) | `[UNCONFIRMED]` — presumed the founder, as the only operator | Every severity |
| U2 | **Deputy / escalation** when the IC is unavailable | `[UNCONFIRMED — there is currently no second person]` | Sev-1 continuity |
| U3 | Mandate incident email address | `[UNCONFIRMED]` | Customer notification |
| U4 | Customer's security/privacy contact | `[UNCONFIRMED — set per contract at signature]` | Breach notification |
| U5 | Legal counsel | `[UNCONFIRMED]` | Sev-1, any personal-data exposure |
| U6 | Cyber / professional indemnity insurer + policy number + notification deadline | `[UNCONFIRMED]` — the 2026-10-07 answer on whether cover exists was internally inconsistent (enterprise matrix §1). **Most policies require notice within a stated period; missing it can void cover** | Sev-1, Sev-2 |
| U7 | Contractual breach-notification window | `[UNCONFIRMED — DPA clause 7 is blank by design]` | Legal exposure |
| U8 | Supabase support path and plan entitlement | `[UNCONFIRMED]` — Free plan is **community support only**; Pro is email | Sev-1/Sev-2 vendor escalation |
| U9 | Status-page update mechanism | `[UNCONFIRMED]` — `/status` reads live checks and has **no operator-authored message field** | Customer communication |

**U2 is the structural weakness and should be named as a risk rather than solved on paper.**
With two active staff and one real operator, Mandate has no on-call rotation and no
escalation path. For a pilot this is tolerable if disclosed; it is not tolerable for a
mid-market or enterprise customer, and the subscription terms should not imply otherwise.

---

## 1. Severity levels

Severity is set by **impact**, not by cause, and the IC may raise it at any time. When
uncertain, **start one level higher** and downgrade with evidence — the cost of
over-responding is an hour; the cost of under-responding is a notification deadline missed.

| Sev | Definition | Examples | Response | Customer told? |
|---|---|---|---|---|
| **Sev-1** | Personal data exposed, destroyed, or possibly accessed by an unauthorised party; or total service loss with no recovery path | Candidate data visible to the wrong tenant · database loss with no restore point · service-role key in use by a third party · backup destination credentials leaked | **Immediate.** IC assigned, containment before diagnosis | **Yes — and legal counsel engaged before the notification is sent** |
| **Sev-2** | Service unavailable or materially degraded; no data exposure | Supabase outage · deploy breaks sign-in · AI provider down so every agent fails · **backup silently not running for >7 days** | Within hours | Yes, if customer-visible or if it affects a contractual commitment |
| **Sev-3** | Single feature broken, workaround exists; or a security weakness with no evidence of exploitation | One agent failing · PDF export broken · an advisory finding | Next business day | On request, or if they reported it |
| **Sev-4** | Cosmetic or latent; no user impact | A log line, a stale document, an unused credential | Scheduled | No |

**Two classifications that are easy to get wrong:**

- **A backup that has stopped running is Sev-2, not Sev-3.** It is invisible, it compounds
  daily, and it converts the *next* incident into a Sev-1. The `storage_backup` heartbeat is
  what makes it detectable.
- **"Possibly accessed" is Sev-1.** Not "confirmed accessed". Most notification obligations
  attach to a reasonable belief, not to proof, and proof usually does not exist.

---

## 2. Roles

With one operator, these are **hats**, not people — but they must be worn deliberately and
in order, because the common single-operator failure is diagnosing for an hour while the
clock on notification runs.

| Role | Responsibility |
|---|---|
| **Incident Commander** | Owns the incident. Sets severity, decides containment, authorises recovery, owns the timeline. **Does not also do the deep debugging** on a Sev-1 — if it must be one person, the IC hat takes precedence and debugging waits |
| **Scribe** | Keeps the timeline: every observation, action, and decision with a UTC timestamp. On a one-person incident, the IC writes as they go. **This is evidence (§6), not admin** |
| **Communicator** | Customer, vendor and (where applicable) counsel and insurer contact |
| **Technical lead** | Diagnosis and remediation |

---

## 3. Detection

| Source | Covers | Gap |
|---|---|---|
| **Sentry** | Application exceptions, with PII scrubbed before transmission | **Stack traces are minified** — `SENTRY_AUTH_TOKEN` is unset, so source maps are not uploaded. This directly lengthens Sev-1 diagnosis |
| **`GET /api/health`** | Per-subsystem `db` / `auth` / `cron`, 30s cache | **Nothing polls it.** Time-to-detection for an outage is "until someone looks" |
| **`ops_heartbeats`** | Cron liveness — `maintenance`, and `storage_backup` once activated | Visible only to someone who checks |
| **Supabase advisors** | New RLS/function findings | Manual, and was last missed for six weeks (migrations 143–148) |
| **Customer report** | Everything else | Currently the most likely detector, which is the honest position |

**Highest-value detection fixes, both cheap:** point an external monitor at `/api/health`
(nothing else gives time-to-detection), and set `SENTRY_AUTH_TOKEN` (nothing else shortens
diagnosis as much for the cost).

---

## 4. Containment — before diagnosis

**Containment precedes root cause.** Resist the urge to understand first; stop the bleeding,
then understand. Preserve evidence while containing (§6) — containment that destroys the
logs you later need is a second incident.

### 4.1 Suspected credential compromise

Fastest-acting first:

1. **Rotate the credential.** Service role key → Supabase dashboard → re-set in Vercel →
   redeploy. Backup destination key → the object-storage provider → re-set `BACKUP_S3_*`.
   Agent credentials → the agent's own password, one at a time
2. **Do not delete the old key's audit trail** before capturing it
3. **Suspend affected accounts** — `/ops/accounts` has suspend/restore, enforced in the
   database and effective within one agent run
4. **Check for use**, do not assume absence: Supabase logs (**1 day on Free, 7 on Pro** —
   this retention limit is itself a containment constraint), Vercel runtime logs,
   `activity_events`, `inference_runs` for unexpected volume

### 4.2 Suspected cross-tenant data exposure

**This is the Sev-1 that matters most**, because tenant isolation is the product's central
security claim and it has never been tested with two real organisations.

1. **Capture evidence first** — the exact query, the responding row set, the user and
   organisation involved. The exposure is the evidence and it may not reproduce
2. Reproduce in a **throwaway environment**, never against production
3. If it is an RLS gap: a migration is the fix, and a migration is fast. If it is an
   application path bypassing RLS: disable the route
4. Assume disclosure to every tenant that could have reached it, not just the one that
   reported it

### 4.3 Data loss or corruption

1. **Stop writes before restoring.** Disable the cron jobs; consider taking the application
   down. A restore racing live writes produces a state that is neither
2. **Establish the recovery point before touching anything**: the newest Supabase daily
   backup, and the `storage_backup` manifest's `recoveryPoint`. §5 is the procedure
3. Do not delete the damaged state — snapshot it first (§6)

### 4.4 Third-party outage

Supabase, Vercel, Anthropic or Resend down is usually Sev-2 and usually not actionable
beyond communicating. Check the vendor's status page, record it in the timeline, tell the
customer what is degraded and what still works. **Do not fail silently** — the product's
honest-degradation design means most features disappear rather than break, which a customer
may read as data loss.

---

## 5. Recovery

> **⚠️ Production restore requires approval and has never been performed.** The procedure
> below was rehearsed end to end against an isolated Postgres 17 with synthetic data
> (`npm run rehearse`). The measured figures are in
> `2026-10-07-backup-restore-results.md`. **The RTO stated there is for the rehearsal's
> volume, not production's.**

### 5.1 Before you restore — three facts to establish

1. **What is the newest usable database backup?** On Free there is **none** — if the plan has
   not been upgraded at the time of the incident, there is no database recovery and the
   answer to the customer is that their data is gone. On Pro: daily, 7-day retention
2. **What does the file manifest say?** `manifest/manifest.json` at the backup destination,
   readable without the encryption key by design, with `recoveryPoint` recording the
   database state the file backup observed
3. **How far apart are the two?** `describeRecoveryCoordination()` answers this in words.
   Database ahead of files → rows reference objects that do not exist. Files ahead →
   harmless orphans. **Neither is corruption**; both must be told to the customer as the
   actual extent of loss

### 5.2 Database restore

1. Supabase dashboard → Database → Backups → restore the chosen point
2. **Use PG 17 client tools for any manual dump.** The local `pg_dump` is **14.19** and
   refuses to dump a 17.6 server — use `docker run --rm postgres:17 pg_dump …`. This bit the
   rehearsal and will bite an incident
3. **`001_core_schema.sql` is 0 bytes**, so the repository cannot rebuild the base schema.
   If the project itself is lost rather than the data, the schema must come from a dump —
   which is why committing a `pg_dump --schema-only` reference snapshot is an activation step
4. Re-create the 24 agent principals and their credentials if auth was lost

### 5.3 File restore

```
BACKUP_DESTINATION=s3 BACKUP_S3_... BACKUP_ENCRYPTION_KEY=... \
  node --input-type=module -e "…"   # or run verifyBackup() with onObject writing to storage
```

`verifyBackup()` decrypts and verifies **every** object against its manifest digest before
anything is written, and reports any object that is missing, undecryptable or altered. A
restore that writes unverified bytes is not a restore.

**The encryption key is a single point of failure.** Lose it and the backup is unreadable.
It must be escrowed somewhere other than Vercel before the first real run — an activation
step, not advice.

### 5.4 ⚠️ MANDATORY post-restore step — do not skip

**Re-apply suppressions.** A database restore rolls candidate rows back to a point that may
precede an erasure request, which means **the restore can resurrect a person who asked to be
deleted**. The file backup correctly lacks their CV, but the row returns.

Run the check in `restoreSuppressionCheckSql()` (`src/lib/backup/erasure.ts`) **before
reopening access**. Expected result: zero rows. A non-empty result is not a backup failure —
it is the restore reintroducing data the live system had suppressed, and it must be
re-suppressed first.

This step is rehearsed and asserted (rehearsal step 7).

### 5.5 Verify before reopening

| Check | How |
|---|---|
| Service up | `GET /api/health` → `200`, all subsystems `ok` |
| **Tenant isolation** | Sign in as two users in different organisations; confirm neither sees the other's candidates. **Rehearsed as step 5** — never assume RLS survived |
| File references resolve | Spot-check `candidates.cv_url` against the `cvs` bucket. Rehearsal step 4 |
| Suppressions re-applied | §5.4 returned zero rows |
| Extent of loss quantified | A number, from §5.1.3 — not "some data" |

---

## 6. Evidence preservation

Collect **before** remediation changes the system, because most of it expires.

| Evidence | Where | Expiry — the reason for urgency |
|---|---|---|
| Supabase platform logs | Dashboard / API | **1 day on Free, 7 on Pro.** The tightest clock in this table |
| Vercel runtime logs | Vercel dashboard | Platform default, unverified |
| Sentry events | Sentry | Account default, unverified |
| `activity_events` | Database | Indefinite — but a restore **overwrites it**. Export before restoring |
| `inference_runs` | Database | Indefinite; same restore caveat |
| `executive_audit_events` | Database | Append-only at the policy layer, **but a user can insert self-attributed rows**, so it is not tamper-evident. Say so if it is ever offered as evidence |
| The damaged state itself | — | Snapshot before restoring. A restore destroys the primary evidence of what went wrong |

**Practical rule: take a database dump of the damaged state before you restore over it.** It
is minutes of work and it is the only copy of what happened.

**Timeline discipline.** UTC timestamps, observations separated from inferences, and every
action recorded with who took it. If the incident becomes a notification, the timeline is the
document that gets scrutinised — and reconstructing one afterwards is both unreliable and
obvious.

---

## 7. Communication

### 7.1 Customer notification

**Decision to notify is the IC's, with counsel for anything touching personal data.** Do not
wait for certainty: most obligations attach to reasonable belief.

What a notification must contain:

1. What happened, plainly
2. **What data was or may have been affected** — categories and approximate volume
3. When it happened and when it was discovered
4. What has been done
5. What the customer should do
6. When the next update comes, and then **send it on time even if nothing has changed**

What it must not contain: speculation about cause, blame directed at a vendor, or a
reassurance not yet established. **"We are still determining the extent" is an acceptable
answer; a wrong extent is not.**

`[DECISION: U7 — the contractual window. Until DPA clause 7 is agreed, no window is
committed. That is the honest position and it is why the clause is blank.]`

### 7.2 Candidate notification

A candidate is a data subject but **not Mandate's customer** — Mandate is the processor. If
candidate personal data is affected, **the agency notifies its candidates**, and Mandate's
duty is to give the agency what it needs, promptly. Mandate should not contact an agency's
candidates directly without instruction.

### 7.3 Internal and vendor

Supabase/Vercel/Anthropic support per `[U8]`. Insurer per `[U6]` — **check the policy's
notification deadline the moment severity is set, not after remediation.**

### 7.4 Status page

`/status` is computed from live checks and has **no operator-authored message field**, so it
cannot carry an incident notice today. For a pilot, direct email to a single named customer
is sufficient and arguably better. Note the gap before any self-service tier.

---

## 8. After

Within five working days of a Sev-1 or Sev-2:

1. **Blameless post-mortem**: timeline, contributing factors, what detection missed, what the
   runbook got wrong
2. **Time-to-detect and time-to-recover as numbers.** They are the only measures that
   improve
3. **One durable fix** — a test, a guard, a monitor. The repository's pattern is a structural
   test that makes the defect class impossible rather than the instance unlikely; prefer that
4. **Update this runbook.** A runbook that survives an incident unchanged was not consulted
5. **Re-run the Supabase advisors** if anything schema-level changed

---

## 9. Quick reference

| | |
|---|---|
| Health | `curl -s https://getmandate.io/api/health` |
| Backup liveness | `select name, last_ok_at, detail from ops_heartbeats where name='storage_backup';` |
| Backup manifest | `manifest/manifest.json` at the destination — **readable without the key** |
| Verify a backup | `verifyBackup()` in `src/lib/backup/restore.ts` |
| Post-restore suppression check | `restoreSuppressionCheckSql()` in `src/lib/backup/erasure.ts` |
| Rehearse a restore | `npm run rehearse` (isolated, synthetic, no production contact) |
| Suspend an account | `/ops/accounts` |
| Kill an agent | `/ops/accounts` — suspension refuses at the agent's next sign-in |
| IC | `[U1]` · Deputy `[U2]` · Counsel `[U5]` · Insurer `[U6]` |
