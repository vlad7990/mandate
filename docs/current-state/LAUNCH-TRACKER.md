# LAUNCH TRACKER — first client

**The one tracker.** Supersedes the scattered checkboxes in `CLAUDE.md` and the
condition table in `2026-10-07-go-no-go.md` as the place to look for *state*.
Those two remain the record of the original assessment and its reasoning.

**§A–C are STATE** — what is true, with its evidence. **§D is the SEQUENCE** — the
order to do the remaining work in, and who owns each step. One of each; a second
ordering anywhere is drift and should be deleted rather than reconciled.

Last updated **2026-10-09**: migrations 161–165 (the C9 escalation gate, the C10 hop
ceiling, the C11 spend ceiling with `/ops` cost visibility), the schema-rebuild replay
fix, robots/sitemap, and §D rewritten as a two-owner sequence.

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

### A1 · Supabase Pro 🟢 *(spend cap unconfirmed)*

- **Evidence** Organisation `Stratum` (`bfomdugfdcxxcneocihl`) returns **`plan: pro` / `tier_pro`**, read from the management API **2026-10-09**. It returned `plan: free` the day before. **The database now has daily backups with 7-day retention — the first restore point that has ever existed for this project.**
- **Work completed** The purchase. Steps and costs were written up in `credential-rotation-and-dashboard.md` §6; PITR was deliberately **not** enabled (it is $100/mo per 7 days, it *replaces* daily backups rather than supplementing them, and needs a compute add-on — a 24-hour RPO was the agreed position).
- **Verification** Plan read directly from the API, not inferred, and not taken from the dashboard. **A false start is worth recording:** the first report of "Pro" was Vercel, not Supabase — both vendors sell a "Pro" tier at a similar price, and only the Supabase one buys backups. Checking the API rather than accepting the word is what caught it.
- **Remaining dependency** **The spend cap has NOT been verified.** It is not exposed by the management API, so it cannot be confirmed from here — Pro's usage overage is otherwise unbounded, and the upgrade flow completes without setting it. **Confirm by eye:** Supabase → org `Stratum` → Billing → spend cap ON.
- **Owner** Founder, for the spend cap only.
- **Next action** Eyeball the spend cap. Then A1 is fully closed and 2.3 (leaked-password protection, Pro-gated) is unlocked.

> **Adjacent finding, 2026-10-09: Vercel Hobby is non-commercial only.** The team
> `vn-mn-product-group` is now on **Vercel Pro**, which is a genuine launch requirement for a
> paying client and **was never on this checklist**. It is closed, but the omission is the
> point — the pack costed Supabase and R2 and silently assumed the host was free to use
> commercially. **Total recurring cost of launch is therefore two subscriptions plus
> storage, not one.**

### A2 · File backup for the three buckets 🟢 *(running; A3 rehearsal still outstanding)*

> **ACTIVATED 2026-10-09.** Cloudflare R2 bucket `mandate-backups` (WNAM — deliberately
> away from Supabase's `us-east-1`), token scoped to Object Read & Write on that one
> bucket, all seven `BACKUP_*` variables set, encryption key generated and escrowed.
>
> **First real run against real S3 and real candidate data: `outcome: complete`,
> 4 objects, 1,100,864 bytes, 0 failures, 8.8 s.** The hand-rolled SigV4 — the one risk
> `destination.ts` names in its own header ("hand-rolled signing fails in obscure ways
> against a specific vendor") — signs correctly against R2.
>
> **And the first run found a real defect, which is what first runs are for.** 161's
> `backup_try_lock` used `pg_try_advisory_lock`, which is SESSION-scoped, and argued that
> "a dropped connection releases it". True of a dedicated connection, **false behind
> PostgREST's pool**: acquire landed on session A, release landed on session B where
> `pg_advisory_unlock` returned false without erroring, and `.catch(() => {})` swallowed
> it. Observed with the run already finished —
> `pid 1783026 | advisory 8427301 | granted | PostgREST 14.5 | idle` — and the next call
> answered `"another backup run holds the lock"`. **Had the cron been scheduled first,
> the backup would have stopped after exactly one good day while the heartbeat still
> looked plausible.** Fixed by migration **166**: a lease held by value with a 120 s
> expiry (above the route's 60 s `maxDuration`, so a live run cannot lose its lease;
> short enough that a killed run self-heals). Proven in production by three back-to-back
> runs, all `complete`, lease table empty after. Three new tests pin the contract and
> were verified to FAIL against 161's shape — the old tests passed through the bug
> because the fake's `rpc(fn)` ignored its arguments.
>
> **Still outstanding: the cron is NOT scheduled** (`vercel.json` unchanged) and **A3's
> timed restore rehearsal has not run.** Scheduling waits on the rehearsal, not the
> other way round.

### A2 (original assessment, 2026-10-07) 🟡

- **Evidence** `src/lib/backup/` — 12 modules, ~4,000 lines, covering all three buckets (`cvs`, `call-audio`, `invoice-assets`), AES encryption, manifests, SHA-256 integrity, incremental copy, suppression-aware pruning, partial-failure reporting, budget-bounded resumable runs, and bounded retries. `vercel.json` still has **one** cron and **no** `BACKUP_*` variable exists in any environment.
- **Work completed** Added bounded retries (`retry.ts`, 16 tests) and a byte-identical restore proof (`restore.test.ts`, 6 tests) round-tripping 7 synthetic objects across all three buckets — binary, zero-byte, 300 KB, unicode keys — plus tamper detection. Volume measured: 4 objects, 1.05 MB, all in `cvs`. Scheduling analysed in `backup-activation.md`.
- **Verification** 1,713 tests pass. Restore compares SHA-256 against originals, not just "verified". **Never run against real S3 or real data.**
- **Remaining dependency** A3 and A1; a destination bucket on a separate provider account; the encryption key generated and escrowed off-platform. **Migration 161 is now applied** (2026-10-08) — the advisory lock exists and was verified acquiring, appearing in `pg_locks` and releasing to zero, so the run no longer refuses for want of a lock.
- **Owner** Founder provisions; I implement and activate on approval.
- **Next action** Provision the destination, then say go — steps 1–6 of `backup-activation.md` §6.

### A3 · One rehearsed restore, timed 🟢 *(files)*

- **Evidence** Run 2026-10-09 against the real Cloudflare R2 bucket with the real encryption key and **real candidate CVs**: **4 of 4 restored, 0 failures, 1,100,864 bytes, 1.74 s**, every object decrypted and SHA-256-matched against the manifest. Manifest v1, run #4.
- **Work completed** `scripts/backup-rehearsal.mjs`. **It did not exist** — `restore.ts` had cited it in its own header (*"it is used by the rehearsal (scripts/backup-rehearsal.mjs)"*) since the module was written, and the file was never created. A documented procedure that cannot be run is not a procedure.
- **Deliberately standalone.** The script re-implements SigV4 and the decrypt envelope rather than importing them, so it runs from a laptop with nothing but Node, the credentials and the escrowed key — no repo build, no TypeScript, no `node_modules`. That is the situation a restore is actually for. It writes nothing, anywhere.
- **One trap recorded for whoever reads it next:** the envelope is `MAGIC("MBK1") || nonce(12) || tag(16) || body` — the GCM tag sits **before** the ciphertext, not appended after it as most AES-GCM envelopes do. Writing the decrypt from habit produces failures on every object that look exactly like a corrupt backup. The first draft of the script did precisely this.
- **Remaining dependency** **This is the FILE half only.** A real recovery also restores the database from Supabase's daily backup, and that side has **not** been rehearsed. The manifest's `recoveryPoint` states how to pair them and warns that neither direction of skew is corruption. **Expect the database restore to dominate the RTO — 1.74 s is not the recovery time for an incident.**
- **Owner** Founder provisions the scratch project; I verify and time it.
- **Next action** Founder: Supabase → Database → Backups → **"Restore to a New Project"** (the in-place "Restore" is destructive — never on production), then hand over the new project ref. Everything on this side is already built and tested; see below.

#### A3-db · The database half — prepared and tested, awaiting one paid clone *(2026-10-10)*

The rehearsal itself needs a second project, which costs money and is the founder's call. The work that does *not* need one was done first, because discovering a broken verification script while a paid clone meters is exactly the mistake the file half already taught.

- **`supabase/bootstrap/restore-verify.sql`** — the whole clone-vs-production comparison as **one read-only statement**, so verification is a single round trip rather than ten. Returns `metric / expected / actual / verdict`, differences sorted first. Self-tested against production: 12 of 13 PASS, and the one `DIFFERS` is `storage_objects_cvs` (4 on production, expected 0 on a clone), which also proves the comparison is not trivially passing everything.
  - One row is *supposed* to disagree with intuition: `storage_objects_cvs` expects **0** — Supabase does not include Storage API objects in database backups, which is the entire reason A2's R2 backup exists; 0 confirms the documented behaviour rather than failing. The row that tells a restore from a rebuild is **the data** (`candidates`, `auth_users`, `organizations`: 0 on a rebuild), not any schema object — a rebuild restores shape, only a backup restores rows.
- **`supabase/bootstrap/isolation-check-restored.sql`** — the nine isolation checks, for a restored project rather than a bootstrap-built one. **`isolation-check.sql` cannot run on a clone**, and not cosmetically; both reasons were verified, not guessed:
  1. it does `CREATE OR REPLACE FUNCTION auth.uid()`, but on a real project that function is owned by `supabase_auth_admin`, so `postgres` gets *must be owner of function uid*. It also does not need replacing — Supabase's own `auth.uid()` already reads `request.jwt.claim.sub`, the exact shape the bootstrap installs. The **stub** is the odd one out, returning `NULL::uuid`.
  2. real `auth.users` carries `on_auth_user_created`, which inserts the matching `public.users` row for you — so the bootstrap script's own `INSERT INTO users` is a duplicate key. **Demonstrated**, by simulating a clone locally: it dies on `users_pkey` at line 57, before reaching check 1.
  - The variant adds a **preflight** that refuses to run on the wrong shape in either direction (stub `auth.uid()`, or missing trigger) with a message naming the other file. Both guards were tested firing.
  - It is **one statement with no psql metacommands**, so it runs over Supabase MCP `execute_sql` against a project ref alone. "Restore to a New Project" returns a ref, not a database password; waiting on a credential while a second project meters is avoidable.
  - It **tolerates a clone that already holds real rows**, which an empty-database checker would not: every assertion is a count scoped by RLS to a synthetic org. Check 2 is the one that matters — it asserts a member of org A sees **0** candidates belonging to any other org, which on a clone includes all four real production candidates.
  - It **leaves nothing behind and proves it**: counts taken before and after, with a tenth assertion that fails on any residue. Verified over three consecutive runs — `0` SMOKE rows, all four counts back to their pre-run values.
- **Tested without provisioning anything.** A bootstrap database was built locally and then made to resemble a restored clone in the three ways that matter — real settable `auth.uid()`, the `on_auth_user_created` trigger, and pre-existing rows (1 org, 4 candidates). All nine checks plus the residue check pass there.
- **The baseline in `apply.sh` was stale and would have failed the rehearsal.** It read `tables=74 … rls_on=74`, labelled "after migration 165". Production reads **75 / 75**: migration `166` added `backup_lock` (RLS on, no policies — the sixth deny-all table) and did not update the block, though the comment directly above it says to, in the same commit. A correct restore would have been compared against the wrong pair and reported as a mismatch. Corrected to `tables=75 functions=161 policies=261 triggers=75 rls_on=75 fks=328`, and confirmed by rebuilding from empty locally, which now reproduces exactly that.
- **Still not measured: the elapsed restore time**, which is the actual point of the exercise. It cannot be measured without the clone. The RTO remains measured for files (1.74 s) and unknown overall.

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
- **Eighth defect found, 2026-10-09 — the baseline alone was not the whole database.** `apply.sh` stopped at the snapshot, which is current only to migration 162, so a rebuild silently omitted every later migration. By the morning of 2026-10-09 that was 163–165: a rebuilt database had no `ai_budget_policy` and none of the four AI cost functions, and because an unreadable budget deliberately fails OPEN, **it would have run with no spend ceiling while reporting itself healthy.** Same silent-wrongness class as the generated columns and the PUBLIC EXECUTE grants. Fixed by replaying every migration above `BASELINE_MIGRATION` after the baseline sections, so future drift self-heals rather than waiting on someone to regenerate.
- **Re-verified 2026-10-09** by rebuilding twice from empty: baseline alone `tables=73 functions=157 rls_on=73`; with replay `tables=74 functions=161 policies=261 triggers=75 rls_on=74 fks=328` — matching production read the same day. Behaviour checked, not only counts: `ai_budget_verdict()` returns `enabled/30d/$50/$250`, `ai_run_cost_usd` gives `18.00` priced and **NULL** unpriced, both hop ceilings present, `anon` holds EXECUTE on none of the four. All nine isolation checks still pass.
- **Ninth defect found, 2026-10-10 — the snapshot stops at the `public` schema, and one trigger that matters lives outside it.** `on_auth_user_created` sits on `auth.users` and calls `handle_new_auth_user()`, which is what creates the `public.users` row for a new signup. `generate-schema-reference.sql` filters **every** section to `nspname = 'public'`, so the snapshot carries the function but not the trigger that fires it, and migration `002` which created it is far below `BASELINE_MIGRATION` so the replay does not restore it either. **Verified in both directions:** production has 1 trigger in the `auth` schema; a freshly rebuilt database has **0**. The practical effect is the same silent-wrongness class as the generated columns, the PUBLIC EXECUTE grants and the missing 163–165 — a rebuilt database starts, passes its counts, and then **never creates an application user for anyone who signs up**, because the only thing that did has nothing calling it. The 75-trigger count matches production precisely because both sides count `public` only, so the count cannot reveal this.
  - **Fixed 2026-10-10.** The scoping rule is the **trigger function's** schema, not the table's: a trigger on a non-`public` table is ours if it calls a `public` function. That selects exactly 76 — the 75 public-table triggers plus `on_auth_user_created` — and excludes Supabase's own 8 non-public triggers (7 on `storage.*`, 1 on `realtime.subscription`), which call `storage.*` / `realtime.*` functions no bootstrap database has; emitting those would have broken the rebuild rather than completing it. Public-table triggers keep the old unconditional rule, so one calling e.g. `extensions.moddatetime` is still captured.
  - **Three consequences, all handled.** (1) The stub `auth.users` was `(id, email)` and `handle_new_auth_user()` reads `NEW.raw_user_meta_data` — so creating the trigger without widening the stub gives a database that throws `record "new" has no field "raw_user_meta_data"` on the first signup, which is *worse* than the missing trigger because it breaks loudly on a database that passed its counts. Column added. (2) `apply.sh`'s verify counts `public` triggers only — which is precisely how this hid — so it now prints `auth_signup_trigger=` separately. (3) **`isolation-check.sql` broke**, and correctly: a rebuilt database now creates the `public.users` row itself, so the script's own `INSERT INTO users` became a duplicate key on `users_pkey`. Changed to an UPDATE, matching the restored variant. A rebuild behaving like production is the whole point.
  - **Only the TRIGGERS section was regenerated**, not the whole file, so `BASELINE_MIGRATION` stays 162 and no drift is introduced: no migration between 163 and 166 contains a `CREATE TRIGGER`, so that section is identical to production at tip 166 while the rest remains current to 162.
  - **Verified from empty.** Rebuild reads `tables=75 functions=161 policies=261 triggers=75 rls_on=75 fks=328 auth_signup_trigger=1`. Behaviour checked, not just presence: a non-founder insert into `auth.users` yields `viewer/pending/org=NULL`, and a founder insert yields `admin/active/is_founder=true` with `full_name` read out of `raw_user_meta_data` and `Mandate HQ` auto-created — so the new stub column is load-bearing, not decorative. All nine isolation checks pass again, `isolation-check-restored.sql` correctly refuses on a bootstrap database, and residue is zero.
- **Remaining dependency** **It is SCHEMA, not DATA** — this rebuilds an empty database of the right shape and restores not one candidate. The data half is A1, now purchased; the rehearsal of it is A3.
- **Owner** —
- **Next action** Regenerate the snapshot after significant schema change, and **bump `BASELINE_MIGRATION` in the same commit**. Until then the replay keeps a rebuild current.

### B2 · Tenant isolation proved in both directions 🟢

- **Evidence** `supabase/bootstrap/isolation-check.sql` — nine checks, all passing: members see exactly their own rows; cross-org read, update, delete and insert all refused; anon sees nothing; a **suspended** member loses their own org too.
- **Work completed** Installs the settable `auth.uid()` Supabase uses, because the NULL stub makes everything deny and `USING (false)` would pass a one-directional test.
- **Verification** Run against the bootstrapped database 2026-10-08. One transaction, ends in `ROLLBACK`.
- **Remaining dependency** Proves the database boundary. Does **not** prove the PostgREST layer, GoTrue JWT handling, or storage enforcement on a real Supabase deployment.
- **Owner** —
- **Next action** Run it after any migration that adds a table or policy.

### B3 · Model routing verified, not just the registry 🟢

- **Evidence** `capability_assignments` has **0 rows**, so the code map governs every call — there is no override layer rerouting anything. `provider_models` holds `claude-haiku-4-5`, `claude-sonnet-4-6`, `claude-sonnet-5` (all `active`) and `claude-opus-5` (`benchmarking`, migration 162). Escalation has fired **0 times ever**.
- **Work completed** `model-routing.test.ts` derives escalation arming from the map rather than restating it: `generate_evaluation` is ARMED, `parse_cv` is DORMANT, and flipping the map arms or disarms a pair as a visible failing change. **C9 closed 2026-10-08:** `escalateInference` now reads `provider_models` through `modelActivation` (`src/lib/ai/registry.ts`, same 60 s TTL cache as the assignment read) and refuses a `to` model that is not `active`, so the escalation path is held to the same evidence standard `capability_assignments_active_gate` applies to an assignment.
- **Verification** `npm test` 1,724 passing. 10 routing tests plus six in `inference.test.ts` ("the activation gate (C9)") whose mocked `provider_models` **defaults to this exact row of production** — `benchmarking`, `retired`, absent and unreadable each skip the hop; a dormant pair never queries the table at all; the warning fires once per reason, not once per failure. Four more in `registry.test.ts` pin the read itself.
- **Remaining dependency** The direction of the fallback is deliberate and is stated where the code is: an **unreadable** registry also skips the hop. That is the opposite of `resolveOverrides`, where a failed read falls back to the code map and the call proceeds — the registry doctrine protects the *primary* call, and escalation is an optional retry whose skip returns the caller to its pre-escalation behaviour. **Consequence to be honest about:** `generate_evaluation`'s escalation is now inert until opus-5 is benchmarked and activated, so a deterministic schema failure there surfaces the original error instead of retrying. With 0 hops ever recorded, that is what was already happening in practice — but it is now by rule rather than by luck.
- **Owner** Founder decides whether to benchmark opus-5.
- **Next action** None required. To arm the hop for real: run the judgment harness against opus-5 (C2), then activate it on `/app/settings/models` naming the results as `benchmark_ref`. The activation is live within 60 s with no deploy, and it inverts the `ACTIVE_IN_PRODUCTION` assertion in `model-routing.test.ts` — a visible change, not a silent one. **C10's ceiling is now in place, so that click is no longer the one that removes every safeguard at once:** the worst day it can buy is 50 premium calls.

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
| ~~C7~~ | ~~**Two unexplained production credentials**~~ — **CLOSED 2026-10-09: identified, then deleted** | Traced through git history. **`WEBCLAW_API_KEY`**: `@webclaw/sdk@^0.1.0`, a web-research provider for the Company Intelligence Agent, **added and removed on the same day (2026-05-01**, `a372736` → `009a9f3`) when it switched to Anthropic `web_search`. Its only call shape was a `"${companyName} official website"` search — **public company data, never a candidate or a CV** — and the client fell back to a placeholder `"wc-local"` when the key was absent, so it is not established the production key ever authenticated anything. **`STITCH_API_KEY`**: Google Stitch, a UI design tool whose output is frozen as HTML in `stitch-designs/`; **never in the runtime data path**, yet set in Preview *and* Production. Neither appears in `src/`, `package.json` or the build output. **Neither is a subprocessor, so the subprocessor list is not incomplete.** **Both deleted from Vercel 2026-10-09** on founder authorisation — `WEBCLAW_API_KEY` from Production, `STITCH_API_KEY` from Production **and** Preview. Verified absent from every environment; all eight critical vars (service role, Anthropic, `CRON_SECRET`, Resend, rate-limit salt, Sentry, Turnstile, Supabase URL) intact and `/api/health` green. No redeploy triggered — nothing read either key, so the running deployment was unaffected | — | **One thing is NOT done, and the Vercel CLI says so on removal: *"Removing this variable from Vercel does not revoke the credential. Rotate or disable it at its provider."*** Both keys are presumably still valid at Google Stitch and at webclaw. Deletion shrinks the blast radius of a Vercel compromise and nothing more; if either value ever leaked it is still live. **Revoke both at the vendor** — two minutes each, and it is the half that actually kills the credential |
| C8 | **38 product surfaces never verified in a browser** | No signed-in session has ever been driven | Founder | A throwaway staff account would close it |
| ~~C9~~ | ~~**Escalation bypasses the model-activation gate**~~ — **closed 2026-10-08** | `escalateInference` now reads `provider_models` via `modelActivation` and refuses a `to` model that is not `active`; unknown or unreadable status skips the hop too. Proven by "the activation gate (C9)" in `inference.test.ts`, whose default mock state is production's own. See B3 | — | None. Arming the hop for real needs an opus-5 benchmark (C2) then activation on `/app/settings/models` |
| ~~C10~~ | ~~**No ceiling on escalation hops**~~ — **closed 2026-10-08** | Migration 163 applied (D1/D2 ruled: keep the pair, 5/hr/project, 50/day global). `escalateInference` consults `limitClosedServiceRole` after the activation check, so an inert pair spends no counter write. Caps are data — both numbers move without a deploy. Verified against the live function: from a count of 1, four more allowed then refused with `reason = 'key'`, exactly `per_key_limit = 5`; smoke rows deleted, **0 remain**. See B3 | — | None for escalation. **Non-escalation AI spend is still uncapped** (C11) |
| ~~C11~~ | ~~**No ceiling on ordinary AI spend, and no cost visibility**~~ — **closed 2026-10-08** | Migrations 164 + 165. **Cost visibility:** `ai_run_cost_usd` is the formula in one place and returns NULL (never 0) for an unpriced model; `/ops` shows 30-day spend by model, token volumes, the ceiling as a bar, and an explicit unpriced-calls count. Founder-only and global, because `inference_runs` has no `organization_id` — a global figure on an org screen would disclose one client's spend to another. **The cap:** dollar-denominated, 30 rolling days, soft $50 / hard $250, caps as data. One cached read per 60 s, never a counter write per call. Verified live: $3.83 of $250, `unpriced_runs 0`; the formula returns 18.00 for 1M in + 1M out at $3/$15 and NULL unpriced | — | D4 only: the eval harness's own dollar budget, which is deliberately a separate instrument (the budget is behind the eval fence, so a benchmark is still reproducible) |
| C13 | **`/api/demo` spends money outside the C11 ceiling** | The marketing simulator calls `getAnthropic()` directly (`route.ts:194`) rather than through the inference seam — deliberate since §142 — so it writes no `inference_runs` row. Verified 2026-10-09: a real production call produced **0** rows. Consequences: its spend is invisible to `ai_budget_verdict()`, so the $250 ceiling can never see it, and it is absent from the `/ops` cost page. It is the **only** AI endpoint an anonymous stranger can trigger, and it uses the billed `web_search` tool (up to 3 searches/call, 200 calls/day globally = up to 600 billed searches/day on top of tokens — confirm the current per-search rate before sizing this) | Founder | Bounded by COUNT today (10/hr/IP, 200/day, fails closed), which is real but is not a dollar bound. The honest fix gives it a capability slug so it records telemetry and is covered — that edits `CAPABILITY_MODEL`, which a pinned tripwire fixes at 36 entries, so it is a ruled change needing a gate rather than something to slip in |
| C12 | **Org-scoped AI spend has no surface** | `/ops` shows global spend to the founder. An org admin cannot see their own, because the honest version needs a join through `projects.organization_id` (71 of 76 runs can do it; 5 carry no project). Not a defect — the alternative was showing a global figure on an org screen, which is a cross-tenant leak at client #2 | — | Build when a second org exists, or when a client asks what their searches cost. The SQL is a scoped sibling of `ai_spend_by_model` |

---

## D. The sequence to launch — who does what, in order

**Added 2026-10-09**, replacing the founder-only "shortest path" list that stood here.
That list was right about order and silent about half the work: it named what the
founder does and not what follows, so nothing said who picks the task up or what it
unblocks. This is the same items with both owners and the real dependencies. **It is
the only ordering; if a second one appears, delete it.**

**Target is the CONTROLLED PILOT** — one direct-pay client — not public launch.
That scope is what makes Stripe (C5), entitlements, and public-launch SEO
out of scope rather than outstanding. The go/no-go's per-segment verdict stands.

### Phase 0 — Start now; these block nothing while they run

| # | Action | Owner | Why first |
|---|---|---|---|
| 0.1 | Send the legal pack to counsel (**A4**) | Founder | Weeks of lead time. It blocks the contract; nothing blocks it. Every day unsent is a day added to launch |
| ~~0.2~~ | ~~Identify or remove `STITCH_API_KEY` / `WEBCLAW_API_KEY`~~ — **DONE 2026-10-09 (C7)** | — | Both traced and **both deleted from Vercel**. Neither was a subprocessor, so **this never blocked 0.1 after all** — send the legal pack. One residue: the keys are presumably still valid at their vendors, so **revoke them at Google Stitch and webclaw** next time you are in those accounts |
| ~~0.3~~ | ~~Supabase **Pro**~~ — **DONE 2026-10-09 (A1)**, `plan: pro` confirmed via API | — | **Spend cap still unverified** — not exposed by the API, so confirm it by eye in Billing. Also closed: **Vercel Pro**, which Hobby's non-commercial terms require for a paying client and which this checklist never listed |

### Phase 1 — Make the data survivable. THE GATE.

> **No client data enters the system before 1.6 — not 1.5.** A backup that has never
> been restored is a hypothesis, not a backup.

| # | Action | Owner | Needs |
|---|---|---|---|
| 1.1 | Pro gives daily DB backups, 7-day retention → 24-hour RPO | — | 0.3 |
| 1.2 | Create the R2 bucket + token scoped to **that bucket**, 5 permissions only | Founder | — |
| 1.2a | **Which Cloudflare account:** one already exists — Turnstile has been live on `/request-access` since ~2026-08-27 and Cloudflare is already a named subprocessor in the legal drafts (bot defence, visitor IPs). **Recommended: use that same account**, because L3 (an executed DPA per vendor) is the only remaining blocker on the subprocessor list, and R2 extends an existing vendor instead of adding one. Enable **2FA** on it and **object versioning** on the bucket — a scoped token bounds the *application*, not an account-holder. ⚠️ **Which account owns Turnstile is recorded nowhere** — the same gap as C7. Write it down this time. ⚠️ **And tell counsel:** R2 expands Cloudflare from *sees a visitor IP* to *stores encrypted candidate CVs*, so the approved privacy notice and subprocessor list need that line changed — true of any storage vendor, not an argument against this one | Founder | — |
| 1.3 | Generate the encryption key and **escrow it off-platform** | Founder | — |
| ~~1.4~~ | ~~Set the seven `BACKUP_*` vars~~ — **DONE 2026-10-09** | — | Encryption key never entered the transcript; escrowed to a 600-mode file on the founder's Desktop. **`CRON_SECRET` was rotated** because Vercel "sensitive" variables are write-only — unreadable by anyone, including the founder — so the route could not otherwise be invoked by hand |
| ~~1.5~~ | ~~Run the seed~~ — **DONE 2026-10-09: `complete`, 4 objects, 1,100,864 bytes, 0 failures** | — | **The cron is deliberately NOT yet added to `vercel.json`.** Scheduling waits on 1.6: a job that silently skips is worse than no job, and this one did exactly that until migration 166 |
| ~~1.6~~ | ~~Timed restore rehearsal~~ — **DONE 2026-10-09 (A3): 4/4 restored, 0 failures, 1,100,864 bytes, 1.74 s** | — | Every object decrypted and SHA-256-matched against the manifest. `scripts/backup-rehearsal.mjs` — which `restore.ts` had cited in its header since it was written and **which did not exist** until now |
| ~~1.7~~ | ~~Add the cron~~ — **DONE: `/api/cron/backup` daily at 04:00 UTC**, two hours before maintenance so the two never contend | — | Takes effect on the next deploy |
| 1.8 | **Roll the R2 token.** Its secret passed through the assistant transcript during setup | Founder | after 1.6 |

### Phase 2 — Credentials and auth hardening

| # | Action | Owner | Note |
|---|---|---|---|
| 2.1 | Create a Supabase **personal access token** | Founder | **One PAT unlocks 2.2 and 2.3** — both are Management API calls, neither needs the dashboard |
| 2.2 | Password floor → 12 chars, four classes | **Me** | The app already enforces this; the *provider* floor is 6, so `signUp()` walks past it |
| 2.3 | Leaked-password protection on | **Me** | Pro-gated (1.1) |
| 2.4 | Create the new **secret key**; revoke the old one after I confirm the swap | Founder | ⚠️ **Never rotate the legacy JWT secret** — it changes the anon key and signs out every user |
| 2.5 | Swap in Vercel, deploy, verify, hold a rollback | **Me** | 2.4 |

### Phase 3 — Prove it on real data. THE UNKNOWN.

**38 product surfaces have never been opened by a signed-in user** (C8). This phase
produces the remaining engineering work, and that work cannot be sized before it runs.

| # | Action | Owner |
|---|---|---|
| 3.1 | Throwaway staff account | Founder |
| 3.2 | Drive all 38 surfaces; fix what breaks (**C8**) | **Me** |
| 3.3 | Supply 8–10 real CVs (anonymised is fine) | Founder |
| 3.4 | Full loop: intake → onboarding → calibration → spec → sourcing → rank → shortlist | **Me** runs; **founder judges output quality** — that half cannot be delegated |
| 3.5 | Triangulation report, every PDF export, email drafts in a real mail client | **Me**, founder for the mail client |
| 3.6 | HM portal end-to-end | Founder — needs a hiring manager who is not us |

### Phase 4 — Operations

| # | Action | Owner |
|---|---|---|
| 4.1 | Uptime monitor on `/api/health`, keyword `"ok":true` not just HTTP 200 (**C3**) | Founder, ~5 min |
| 4.2 | `SENTRY_AUTH_TOKEN` — un-minifies every production stack trace (**C4**) | Founder, one env var |
| 4.3 | Fill U1–U8 in the incident runbook (**A5**) | Founder |
| 4.4 | `RESEND_WEBHOOK_SECRET` — without it, bounces are silent | Founder |

> **Hard rule on 4.3:** do not sign a notification window in any contract until U1
> (incident commander) and U7 (contractual window) are filled. A 72-hour commitment
> with no named owner is a commitment nobody holds.

### Phase 5 — Commercial close

| # | Action | Owner |
|---|---|---|
| 5.1 | Decide "Unlimited users + searches" and "Dedicated success partner" (**A7**) | Founder |
| 5.2 | Counsel returns the pack; publish the notices | Founder + counsel |
| 5.3 | Contract, then onboard the client | Founder |

### Critical path

`0.1 → counsel runs in background → 1.x → 3.x → 5.3`

Phase 1 is days once the purchases are made. **Phase 3 is the unknown** and the only
honest answer about total time is that it depends on what 3.2 and 3.4 find.

**Minimum to start today:** send the legal pack, resolve the two credentials, buy Pro,
create the R2 bucket. Everything in Phase 1 unblocks within an hour of those four.

### Settled, kept so it is not re-litigated

- ~~Approve the two small production writes~~ — **done 2026-10-08.** Migrations 161
  (lock verified) and 162 (opus-5 registered at `benchmarking`).
- ~~Decide C9~~ — **done 2026-10-08.** Escalation refuses a non-active target, which
  disarms the `generate_evaluation` pair until opus-5 is benchmarked.
- ~~Decide C10/C11~~ — **done 2026-10-08.** Hop ceiling (163) and dollar spend ceiling
  with `/ops` cost visibility (164/165).
- **Stripe is deliberately deferred.** The first client pays directly, so billing is not
  on this path. It returns as a blocker for client #2 or any self-serve signup.
