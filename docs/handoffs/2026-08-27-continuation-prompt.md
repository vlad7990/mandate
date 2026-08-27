# CONTINUATION PROMPT — 2026-08-27

Paste everything below the line into a fresh session.

---

## ⚠️ FIRST: PRODUCTION HAS UNTORN-DOWN DRIVE STATE. Clean it before anything else.

Drive 125 ran the apply link end to end and the session ended mid-drive. The
following is live in prod RIGHT NOW and must be removed in this order:

1. **Storage object first, via the API, as the persona** (SQL leaves the bytes;
   the persona must still exist to hold `cvs_org_delete`). Reuse the pattern in
   `/Users/vladbreygin/.claude/jobs/*/tmp/teardown-storage.mjs` if that job dir
   survives, else write it fresh: sign in as
   `rae.drive125@example.com` / `Drive125!Recruiter` with the anon key, then
   `DELETE {url}/storage/v1/object/cvs` with body
   `{"prefixes":["<cv_url of candidate 2d281517-bc08-4d37-9f8d-0d8f5578a192>"]}`.
2. `delete from public.candidates where id = '2d281517-bc08-4d37-9f8d-0d8f5578a192';`
   (cascades any `verdict_ledger` row — assert ledger back to 0 in a FRESH statement)
3. `update public.projects set apply_token = null where id = 'b076b20b-b0c2-43c7-9c92-a040faf12421';`
   — **the public apply door is OPEN on the RBC mandate until you do this**
4. `delete from public.users where id = '00000000-0000-4128-8128-000000000128';`
   then `delete from auth.users where id = '00000000-0000-4128-8128-000000000128';`
5. `delete from public.activity_events where created_at > '2026-08-27T15:40:00Z';`
6. `delete from public.rate_limit;` (the apply scope minted buckets)
7. `rm -f "/Users/vladbreygin/Mandate Recruiting/mandate/.playwright-mcp/drive125-cv.pdf"`

**Then verify against DURABLE BASELINE below with a fresh statement.**

## STATE

**§190 IS CONFIRMED BY THE FOUNDER** ("I confirm §190") but **§192 is NOT
WRITTEN** — the confirmation and drive 125's result both still owe a ledger
entry. Write it after teardown. Tree was clean at `c0af3b3` before the drive;
deployed `mandate-fia28n0qh` plus the founder's own post-Turnstile redeploy.

LAW: §174 (two-person admin grants) · §179 (role seam) · §189 (confirms §181
education/no-phone, §183 skeptic+advisory, §184 evidence grades, §186 harness,
§188 verdict ledger). The judgment programme opened by §175's audit is closed
end to end.

## WHAT DRIVE 125 PROVED (write this into §192)

The founder added Turnstile keys and redeployed. The door **opened**:

- Recruiter panel minted the link; the dark warning **disappeared**
- Public page rendered form + Art.13 notice + Turnstile widget; widget
  auto-solved; submission **accepted**; applicant saw *"Application received…
  a person decides what happens next"*
- Row landed `source='apply'` with `subject_notified_at` **stamped**
- Parse completed carrying **§181's education fields** and **§176's graded
  risks** — an applicant gets the identical judgment chain to a recruiter upload
- Trail: `candidate_cv_submitted` + `candidate_parsed`

**MEASURED AFTER THE WAIT — the full chain fired.** It was still running, not
cut off. Verified in prod before teardown: evaluation present
(**tier_3 / do_not_include**), refuter ran and **concurred**, and **one
`verdict_ledger` row** written with `refuter: 'concurred'`. So an applicant who
submitted their own CV through a public link was parsed, evaluated,
second-opinioned and **scored into the ledger automatically, with no recruiter
involved** — §190 and §188 composing exactly as designed. That is §192's
headline. (Latency note worth recording: the `after()` chain took materially
longer than the ~90s the earlier drives led me to expect — budget for it.)

## THE FINDING DRIVE 125 SURFACED (needs a founder ruling)

The applicant typed **"Drive 125 Applicant" / drive125.applicant@example.com**.
The stored row reads **"Vladimir Breygin" / vlad@flexcpo.com** — the parser
overwrote BOTH identity columns from the CV (`runCvParseAndPersist` persists
"the identity columns it overwrites" by design).

Existing parser behaviour, not new code — but it lands differently on an apply
form: the applicant's SELF-DECLARED contact details are the ones they consented
to give, and the CV's may be stale. Sits directly beside §190's D.3 ruling
(don't mine a phone number from a CV) — the same logic arguably says don't
overwrite a typed email either. **Draft a gate; do not fix unilaterally.**

## NUMBERS (verify at teardown)

next migration **135** · next § **192** · next drive **126** · vitest **1146** ·
CHECK **99** · intent doors **26** · agent-event allowlist **31** · anon roster
**14 (ruled: +verify_apply_token, +submit_application)** · capability map **36**

## DURABLE BASELINE (post-teardown target)

26 users / 25 agents / 26 auth / **77 events** / 5 skills / 5 skill_versions /
1 network_profile / **2 projects** / 2 clients / **1 candidate** (the §175
exhibit, `78c0bff0-…`, stage 'found') / 1 job_spec (**is_final FALSE**) / orgs 1
/ **advisory_mode false** / ops_heartbeats 1 / **verdict_ledger 0** /
**rate_limit 0** / **cvs objects 1** / **apply_token NULL** / active_admins 1 /
inference_runs 0 / model_providers 1 / provider_models 3 /
capability_assignments 0 / boolean_queries 0 / interview_plans 0 /
client_interviews 0 / staff_invitations 0 / mandate_shares 1 / mandate_grants 0
/ admin_grant_requests 0 / feedback 3 / hm_reviews 4 / invoices 0 /
invoice_lines 0 / invoice_templates 0 / invoice_deliveries 0 / client_contacts 0
/ email_suppressions 0. candidate_notes/client_notes are PINNED PER-DRIVE.

**PROTECT THE §175 EXHIBIT:** candidate `78c0bff0-…`'s evaluation
(`generated_at 2026-04-30T21:25:13.543Z`) is the audit's evidence. Never
force-regenerate it; upload a fresh candidate instead and tear that down.

## HOUSE PATTERN (unchanged)

Work in `/Users/vladbreygin/Projects/mandate` — **NOT** the iCloud clone at
`~/Mandate Recruiting/mandate`. **Check `pwd` every session; the cwd defaults to
the clone.** Supabase MCP project `xipyqnltkbtywxqyxupf`.

New programme or slice → **DRAFT THE GATE FIRST** and wait for the founder's
word → build → green gate (tsc / vitest / eslint / clean build) → commit →
`vercel deploy --prod --yes` → drive N live in prod with EXACT teardown →
§-entry DRAFTED, no completion declared → founder confirms → law.

Ledger: `docs/handoffs/2026-08-13-roles-clients-placements-advisor-action-errors.md`
(last entries §190, §191). Findings doc: `docs/handoffs/2026-08-26-first-judgment-audit.md`.

## STRUCTURAL GUARDS — never loosen; they have all caught real defects

`embed-ambiguity.test.ts` (REGENERATE AMBIGUOUS_PAIRS via the SQL in its own
header after ANY migration adding an FK) · `describe.test.ts` (pins CHECK count
= 99 + the app-recordable list) · `door-sites.test.ts` (§177's door at every
scoring call site, BY SOURCE TEXT — **it caught the missing TS door on §190, the
very next slice**) · `apply-door.test.ts` (fail-closed, gate-before-body,
money-tier limit, proxy entry, Art.13 notice) · `evidence-grades.test.ts`
(§176 schemas + prompt rules, asserted on EXPORTED strings) ·
`profile-fields.test.ts` (§181 education/certs + no-phone) ·
`verify-evaluation.test.ts` (§182 refuter trigger + skills-not-injected) ·
`spec-drift.test.ts` · `print-report-button.test.ts` · `call-sites.test.ts` ·
`routes.test.ts` · `portal-doors.test.ts` · `_data/agent-roster.test.ts` ·
`inference.test.ts` (capability map = 36 + the ruled mapping tripwire).

## TRAPS (all §-recorded, all cost real time)

- **A GREEN DATABASE DRIVE IS NOT A DRIVE.** Drive 117 found a toast lying over
  a pending request and a panel rendering nothing while a row existed. Drive the
  surface.
- **NEVER TRUST A FIRE-AND-FORGET WRITE — READ THE TRAIL BACK.** §177 claimed
  "allowlist stays 29"; that 29 is the allowlist INSIDE `record_agent_event`,
  not the agent principal count. The event silently never landed. Now 31.
- **`{cond && <ClientComponent/>}` DESTROYS CLIENT STATE** when cond flips. The
  §177 diff receipt was unreachable code in production; dropping
  `router.refresh()` did NOT fix it (the action's own `revalidatePath`
  re-renders). Always mount; gate inside on `→ null`.
- **Sonner toasts auto-dismiss between MCP tool calls.** Click and observe
  inside ONE `browser_evaluate`, or you will report a defect that isn't there.
- **`innerText` reflects CSS `text-transform`** — match case-insensitively.
  (Third sighting across drives 117–119.)
- **Playwright MCP is rooted at the iCloud CLONE.** Files to upload must be
  staged there — and removed at teardown, or personal data sits in a stale copy.
- **A NEW/REPLACED FUNCTION INHERITS PUBLIC EXECUTE** and silently joins the
  anon roster. Revoke it, and COUNT THE ROSTER after every apply.
- **A SOURCE-TEXT GUARD ONLY GUARDS SOURCE TEXT.** Write the literal, comment
  that the duplication IS the check, MUTATION-TEST before trusting.
- **A SINGLE SOURCE OF TRUTH ONLY ENDS DRIFT BELOW IT.** Ask what watches the
  seam above.
- **Bare PostgREST embeds on a table with a composite `_in_org` twin return
  NOTHING — NAME THE FK.** `!inner`/`!left` do NOT disambiguate.
- **A backtick inside a template literal breaks the build** (the evaluation
  prompt). Same family as the git-commit backtick trap — use `git commit -F -`
  with a quoted heredoc.
- **A new public route is NOT public until `src/proxy.ts`'s allowlist knows it**
  (§138's `/join` defect).
- Hand-minted personas: **auth.users FIRST** (public.users FKs to it), eight
  token columns `''` not NULL; a trigger auto-creates the public row as
  `viewer`/org NULL with `status` `'pending'` → set role/org/status or you land
  on `/auth/pending`. Direct SQL UPDATE on `public.users` fires member-audit.
- `apply_migration` takes the NUMBERED name, or `schema_migrations` stops
  agreeing with `supabase/migrations/`.
- Browser autofills the founder's real credentials — OVERWRITE for everyone
  else; `clearCookies` ≠ `localStorage`, clear BOTH.
- Issued/void invoices refuse deletion (`mandate.allow_invoice_transition`).
  Storage deletes are API-only. Feedback outranks its author on delete.

## FOUNDER-OWNED RESIDUE (surface ONCE, do not nag)

**Turnstile keys are DONE** (added this session — that's what opened the apply
door). Remaining: agency sending domain verified with Resend ·
`RESEND_WEBHOOK_SECRET` (bounce feedback dark) · service-role key rotation ·
leaked-password protection (Supabase toggle, still WARN) · D4 UptimeRobot ·
`DEEPINFRA_API_KEY` (transcripts dark) · parse_cv benchmark + dormant escalation
pair · judge debts (max_tokens 600 + fixture digest) · Q4 cross-provider spike ·
Twilio parked · "Capital Markets Investment Bank" rename · stale-poll §82.
**Stripe parked LAST.**

## WHERE THE PRODUCT STANDS

The development queue is **empty**. The judgment roadmap is fully built and
confirmed; the apply link is built and now live. §128's bench test was **CLOSED
BY THE FOUNDER'S RULING** ("consider the 8-10 CVs test completed") — production
is the test, §183/§184 are the safety net, and §188's ledger is the instrument
that scores it. **Do not re-litigate that ruling; do not record it as
"ran and passed".**

**STANDING JUDGMENT (recorded, not a task):** the site is accurate on CAPABILITY
and empty on PROOF and FIT — no case study, customer, outcome number, named
buyer, switching story or guarantee. That cannot honestly be built without
clients, so it is DOWNSTREAM of real usage. Keep call logging / OKRs / model
registry / skills OFF the homepage.

The honest next step is not a feature — it is **running a real search**: the
apply link fills the pipeline, the ledger keeps score, and the next real
requirement comes from a real mandate.

## NEXT

<< replace with the work — house rule: if it's a new programme or slice, DRAFT
THE GATE FIRST and wait for my word before building. If you want a
recommendation, say so and give me options rather than starting.
Note: teardown above is owed FIRST, then §192. >>
