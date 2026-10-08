# LAUNCH TRACKER — first client

**The one tracker.** Supersedes the scattered checkboxes in `CLAUDE.md` and the
condition table in `2026-10-07-go-no-go.md` as the place to look for *state*.
Those two remain the record of the original assessment and its reasoning.

Last updated **2026-10-08**, after migrations 161 and 162.

**Nothing here is marked done because a route exists, a document was written, or
tests pass.** Every row names the evidence, and where evidence is absent the row
says so.

---

## Status key

| | meaning |
|---|---|
| 🔴 | not started, or blocked on someone else |
| 🟡 | prepared and verifiable, awaiting a decision or an external input |
| 🟢 | done **and** verified, with the evidence named |

---

## A. Pilot gate — the seven conditions

### A1 · Supabase Pro + spend cap 🔴

- **Evidence** Organisation `Stratum` (`bfomdugfdcxxcneocihl`) returns `plan: free`, queried 2026-10-08. On Free: no backups of any kind, 1-day log retention, project pauses when idle.
- **Work completed** Exact steps, costs, and what Pro does *not* include written up in `credential-rotation-and-dashboard.md` §6.
- **Verification** Plan read directly from the Supabase management API. Not inferred.
- **Remaining dependency** A $25/month purchase.
- **Owner** Founder.
- **Next action** Upgrade, **and turn the spend cap on in the same visit** — the upgrade flow completes without it.

### A2 · File backup for the three buckets 🟡

- **Evidence** `src/lib/backup/` — 12 modules, ~4,000 lines, covering all three buckets (`cvs`, `call-audio`, `invoice-assets`), AES encryption, manifests, SHA-256 integrity, incremental copy, suppression-aware pruning, partial-failure reporting, budget-bounded resumable runs, and bounded retries. `vercel.json` still has **one** cron and **no** `BACKUP_*` variable exists in any environment.
- **Work completed** Added bounded retries (`retry.ts`, 16 tests) and a byte-identical restore proof (`restore.test.ts`, 6 tests) round-tripping 7 synthetic objects across all three buckets — binary, zero-byte, 300 KB, unicode keys — plus tamper detection. Volume measured: 4 objects, 1.05 MB, all in `cvs`. Scheduling analysed in `backup-activation.md`.
- **Verification** 1,713 tests pass. Restore compares SHA-256 against originals, not just "verified". **Never run against real S3 or real data.**
- **Remaining dependency** A3 and A1; a destination bucket on a separate provider account; the encryption key generated and escrowed off-platform. **Migration 161 is now applied** (2026-10-08) — the advisory lock exists and was verified acquiring, appearing in `pg_locks` and releasing to zero, so the run no longer refuses for want of a lock.
- **Owner** Founder provisions; I implement and activate on approval.
- **Next action** Provision the destination, then say go — steps 1–6 of `backup-activation.md` §6.

### A3 · One rehearsed restore, timed 🔴

- **Evidence** No production run has ever occurred. The restore path is exercised only against a local filesystem destination with synthetic files.
- **Work completed** The rehearsal is step 7 of `backup-activation.md` §6. The deletion-aware step it must include is in the incident runbook §5.4.
- **Verification** None possible yet — this *is* the verification step for A2.
- **Remaining dependency** A1 and A2.
- **Owner** Both.
- **Next action** After A2 activates: recover to a scratch location, compare checksums, **record elapsed time**. Without a timed rehearsal the RTO is a guess.

### A4 · Legal pack reviewed and notices published 🔴

- **Evidence** Five drafts in `docs/legal/drafts/`, none reviewed. `/legal/*` now returns 200 with a placeholder stating the document is unreviewed; no legal text is served. Verified against a production build: no draft text leaks, `noindex` set, unknown slug 404s.
- **Work completed** Route, metadata, layout, CSS and a structural publication gate (`_registry.ts`, `legal-gate.test.ts`, 11 tests). Publication requires a named reviewer, a date and a reference — no boolean, no override. Prohibited-phrase checks encode the standing corrections, each with a mutation test proving it fires.
- **Verification** Build + 11 gate tests + live HTTP check of all five routes.
- **Remaining dependency** **A qualified lawyer.** Nothing substitutes. Nine blocking items in Annex M.1; `subprocessors` additionally blocked on two unexplained production credentials.
- **Owner** Founder + counsel.
- **Next action** Send the pack to counsel. Longest lead time of anything here — start it first, it blocks nothing else while it runs.

### A5 · Incident-response process 🟡

- **Evidence** `2026-10-07-incident-response-runbook.md`, 320 lines: severity levels, roles, detection, containment, recovery, evidence preservation, communication, post-incident. §0 lists eight unconfirmed fields (U1–U8) explicitly rather than inventing them.
- **Work completed** Updated §5.2 today — it claimed the repository could not rebuild the schema, which stopped being true (see B1).
- **Verification** Document reviewed against the current state of the system. The *process* has never been exercised.
- **Remaining dependency** U1–U8: incident commander, deputy, incident email, customer security contact, insurer and policy number, contractual notification window, Supabase support entitlement.
- **Owner** Founder.
- **Next action** Fill U1–U8. **Do not sign a notification window in any contract until U1 and U7 are filled** — a 72-hour commitment with an unnamed owner is a commitment nobody holds. The go/no-go's "incident response does not exist" is now stale; the document exists, the *operational* fields do not.

### A6 · Service-role key rotated; password floor raised 🟡

- **Evidence** `SUPABASE_SERVICE_ROLE_KEY` is **160 days old**, Production-only. 16 modules consume it, including the entire AI pipeline and every token portal. Password floor: the app enforces 12 + four classes at signup, but anyone with the anon key can call `signUp()` directly, so the real floor is the Supabase default 6.
- **Work completed** Full consumer inventory, replacement-key compatibility verified (modern key system already enabled on the project; `supabase-js` 2.104.1 accepts `sb_secret_…`), and an ordered deploy / verify / rollback / revoke procedure in `credential-rotation-and-dashboard.md`.
- **Verification** Key age and scope read from the Vercel CLI; key schemes read from the Supabase API; consumer list from the code. `/api/health` is the verification probe — `checks.cron` runs through the service-role client, so a bad key reads as `cron: degraded` rather than as silence.
- **Remaining dependency** Founder creates the secret key. **Do not rotate the legacy JWT secret** — it would change the anon key too and sign out every user.
- **Owner** Founder creates and revokes; I do the Vercel swap, deploy and verification on approval.
- **Next action** Create the secret key. Separately: raise the password floor — **this one is not actually founder-only**, it is a Management API call that only needs a personal access token (§5 of the runbook).

### A7 · Corrected pricing copy 🟢

- **Evidence** Four claims removed or corrected in `_data/pricing.ts`, each verified against the implementation first: "30-day evaluation history" (zero implementation across 161 migrations); "Global Executive Network" → "Executive Network" (`network_profiles` is `UNIQUE (organization_id, identity_key)`, RLS-scoped per org); "Custom skills + agents" → "Custom skills" (no agent-creation path exists anywhere; `/app/agents` is one read-only page); "SLA" removed from the tier card and the matrix (no plan below Team provides one, nothing measures uptime).
- **Work completed** Commit `363df5c`.
- **Verification** Each claim checked against the live catalogue or the code before editing. Build + 1,713 tests pass.
- **Remaining dependency** **Two founder decisions deliberately left alone**, because they are commercial rather than false: "Unlimited users + searches" (nothing enforces any tier limit in either direction, so it is not currently a lie — enforcement is the fix) and "Dedicated success partner" (a staffing promise, not a product claim).
- **Owner** Founder for the two above.
- **Next action** Decide on those two. The factual corrections need no further action.

---

## B. Recovery and verification work completed this session

### B1 · The repository can describe and rebuild its own schema 🟢

- **Evidence** `supabase/schema-reference.sql` (73 tables, 154 functions, 92 SECURITY DEFINER, 261 + 10 policies, 75 triggers, 481 indexes, 328 FKs, 191 CHECKs, 10 generated columns, 1,567 grants, 41 comments, 3 buckets), `supabase/bootstrap/apply.sh`, `supabase/bootstrap/00-prerequisites.sql`, `docs/infrastructure/schema-bootstrap.md`.
- **Work completed** Generated, then **applied to an empty PostgreSQL 14.19 database**, which found six defects in the first version — including ten generated columns emitted as `DEFAULT`, a silent error that would have produced a schema that worked and was wrong.
- **Verification** Every count matches production. RLS exercised: owner 2 rows, `authenticated` 0, `anon` 0, `service_role` 2. **Re-verified after migrations 161 and 162** — the baseline was regenerated and re-applied to an empty database: 157 functions, 93 SECURITY DEFINER, all nine isolation checks still passing.
- **Seventh defect found** A rebuild left **PUBLIC EXECUTE on all 157 functions**, because Postgres grants it on creation and the baseline emitted no `REVOKE`. Production has it revoked on 157/157. Silent, like the generated columns: nothing fails, the rebuild is just more permissive — including on 93 SECURITY DEFINER functions. Fixed; the rebuild now matches at 157/157 revoked.
- **Remaining dependency** None for the stated scope. It is schema, not data, and `001_core_schema.sql` stays 0 bytes on purpose.
- **Owner** —
- **Next action** Regenerate after significant schema change so it does not drift.

### B2 · Tenant isolation proved in both directions 🟢

- **Evidence** `supabase/bootstrap/isolation-check.sql` — nine checks, all passing: members see exactly their own rows; cross-org read, update, delete and insert all refused; anon sees nothing; a **suspended** member loses their own org too.
- **Work completed** Installs the settable `auth.uid()` Supabase uses, because the NULL stub makes everything deny and `USING (false)` would pass a one-directional test.
- **Verification** Run against the bootstrapped database 2026-10-08. One transaction, ends in `ROLLBACK`.
- **Remaining dependency** Proves the database boundary. Does **not** prove the PostgREST layer, GoTrue JWT handling, or storage enforcement on a real Supabase deployment.
- **Owner** —
- **Next action** Run it after any migration that adds a table or policy.

### B3 · Model routing verified, not just the registry 🟡

- **Evidence** `capability_assignments` has **0 rows**, so the code map governs every call — there is no override layer rerouting anything. `provider_models` holds `claude-haiku-4-5`, `claude-sonnet-4-6`, `claude-sonnet-5`. Escalation has fired **0 times ever**.
- **Work completed** `model-routing.test.ts` derives escalation arming from the map rather than restating it: `generate_evaluation` is ARMED, `parse_cv` is DORMANT, and flipping the map arms or disarms a pair as a visible failing change.
- **Verification** 10 tests; production registry state read directly.
- **Remaining dependency** **Half closed, and the remaining half is the interesting one.** Migration 162 registered `claude-opus-5` at status `benchmarking`, which fixes the reporting hole — an `inference_runs` row can now be joined to a model the registry names. It does **not** make opus-5 usable: `capability_assignments_active_gate` refuses assignment to any non-active model with *"benchmark and activate it first"*, and activation requires a `benchmark_ref` that does not exist. **But `escalateInference` consults neither the registry nor that gate** — `pair.to` is a code constant handed straight to the provider. So the one path that can reach an unbenchmarked model is the one path that does not check.
- **Owner** Founder decides.
- **Next action** Either benchmark and activate opus-5, or make `escalateInference` refuse a non-active target (which disarms the pair until it is). Pinned by a test so it cannot be forgotten.

---

## C. Known gaps not on the pilot gate

| # | Gap | Evidence | Owner | Next action |
|---|---|---|---|---|
| C1 | **No database backup** | Free plan. A2 covers storage only | Founder | A1 |
| C2 | **AI output quality unmeasured** | Judgment harness built, **never run**; 31 of 37 capabilities have no eval; 23 never executed in production | Founder | Authorise a spend ceiling for an eval run. Paid calls are required and none is authorised, so no run has been attempted |
| C3 | **Nothing polls `/api/health`** | Endpoint live and green; no external monitor | Founder | Any uptime monitor. Minutes of work, closes the "found by a customer" gap |
| C4 | **`SENTRY_AUTH_TOKEN` absent** | `next.config.ts` disables source-map upload; every production stack trace is minified | Founder | One env var |
| C5 | **No billing, no entitlements** | No Stripe; no plan/seat/quota column in 73 tables | Founder | Entitlements before billing — billing first would charge for differences nothing enforces |
| C6 | **`text-body-s` is dead** | Used 77 times, emits no CSS rule; as an unknown `text-*` it can also eat a live colour in `cn()` | — | Decide what those 77 sites should say |
| C7 | **Two unexplained production credentials** | `STITCH_API_KEY`, `WEBCLAW_API_KEY` set in production, referenced nowhere in code | Founder | Identify or remove. **Blocks A4's subprocessor list** |
| C8 | **38 product surfaces never verified in a browser** | No signed-in session has ever been driven | Founder | A throwaway staff account would close it |
| C9 | **Escalation bypasses the model-activation gate** | `escalateInference` hands `pair.to` to the provider without consulting `provider_models` or `capability_assignments_active_gate` | Founder | Benchmark and activate opus-5, or make escalation refuse a non-active target |

---

## D. Founder actions, shortest path

Ordered so nothing waits on something avoidable.

1. **Send the legal pack to counsel** (A4) — longest lead time, blocks nothing while it runs.
2. **Upgrade to Pro + spend cap** (A1) — $25/month, unblocks A2 and A3, closes the single largest risk.
3. **Create the Supabase secret key** (A6) — then I do the swap, verification and rollback plan the same session.
4. **Fill U1–U8 in the incident runbook** (A5) — and do not sign a notification window before U1 and U7 exist.
5. **Provision the backup destination** (A2) — separate provider account; generate and escrow the encryption key off-platform.
6. **Decide "Unlimited" and "Dedicated success partner"** (A7).
7. **Identify or remove `STITCH_API_KEY` and `WEBCLAW_API_KEY`** (C7).
8. ~~Approve the two small production writes~~ — **done 2026-10-08.** Migration 161 applied (lock verified), migration 162 applied (opus-5 registered at `benchmarking`). Decide C9: benchmark opus-5, or make escalation refuse a non-active target.
9. **Cheap and worth doing anyway**: an uptime monitor on `/api/health` (C3), `SENTRY_AUTH_TOKEN` (C4), an Anthropic budget alert.
