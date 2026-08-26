# CONTINUATION PROMPT — after §162, 2026-08-26

Paste the block below into a fresh session after `/clear`. Everything
above the "NEXT" heading is state restore; the NEXT section is the only
part to edit when the work changes.

---

State: the INVOICING + PRINT programme is COMPLETE (§162, 090e16e) —
all three slices of gate 5f2820d are law. Nothing is pending
confirmation, nothing is half-built, the tree is clean and deployed
(mandate-6cmz93wxf). Every agent-runnable line of the pre-launch
checklist is closed; what remains there is founder-owned, plus Stripe
which is parked LAST by standing order.

Programme frame: ledger = docs/handoffs/2026-08-13-roles-clients-
placements-advisor-action-errors.md, last entry §162. House pattern
unchanged: gate DRAFT first → founder's written word → build → green
gate (tsc / vitest / eslint / build) → commit → `vercel deploy --prod
--yes` → drive N live in prod with EXACT teardown → §-entry DRAFTED,
no completion declared → founder confirms → law.

Work in /Users/vladbreygin/Projects/mandate — NOT the iCloud clone at
"~/Mandate Recruiting/mandate" (a convincing stale copy). Check `pwd`
EVERY session; a Bash cwd reset mid-session lands in the clone — it
happened repeatedly this session, so re-cd on absolute paths.
Supabase MCP project xipyqnltkbtywxqyxupf.

Numbers (verified at §162, 2026-08-26): next migration 127; next §
163; next drive 113; vitest 1096; activity CHECK 93; intent door 26;
agent allowlist 29 (ruled); anon roster TWELVE named grants (ruled —
verified exactly 12 after migration 125 closed 11 that had drifted in).

Durable baseline (all fresh-statement at §162): 26 users / 25 agents /
77 events / 5 skills / 5 skill_versions / 1 network_profile / 2
projects / 2 clients / 1 candidate (stage 'found') / 1 job_spec
(is_final FALSE) / auth 26 / orgs 1 / ops_heartbeats 1 /
inference_runs 0 / model_providers 1 / provider_models 3 /
capability_assignments 0 / boolean_queries 0 / interview_plans 0 /
client_interviews 0 / staff_invitations 0 / rate_limit 0 / call-audio
objects 0 / invoices 0 / invoice_lines 0 / invoice_templates 0 /
invoice_deliveries 0 / invoice-assets objects 0 / client_contacts 0 /
email_suppressions 0. candidate_notes/client_notes are PINNED
PER-DRIVE (3 / 0 at last pin), never baseline members.

STRUCTURAL GUARDS that now fail the build if broken — do not "fix"
them by loosening them: embed-ambiguity.test.ts (**regenerate its
AMBIGUOUS_PAIRS list, using the SQL in its own header, after ANY
migration that adds a foreign key**); print-report-button.test.ts
(window.print() may be called from exactly ONE file); call-sites.test.ts
(every server action called as the literal `unwrap(await x(...))`);
routes.test.ts (isSampleId on every dynamic dashboard route);
describe.test.ts (pins the CHECK count and the app-recordable list —
bump both when a migration adds an event type).

TRAPS (all §-recorded, all cost real time):
· **Bare PostgREST embeds on tables with a composite `_in_org` twin
  (111/112) silently return NOTHING — NAME THE FK.** `!inner`/`!left`
  are JOIN-TYPE modifiers and do NOT disambiguate. This shipped two
  live defects (a sample workspace over a real placement; a financial
  KR reading zero).
· **Vercel can ship new JS against CACHED CSS.** After any
  globals.css change deploy with `--force` AND verify the rule reached
  the served stylesheet (`curl` the /_next/static/immutable/chunks/*.css
  and grep) — the JS looked shipped while the CSS silently was not.
· **ON DELETE SET NULL is an UPDATE** and fires the row's own
  immutability trigger (migration 124 exists only because of this).
· Deleting a placement mints `placement_deleted` — the TEARDOWN's own
  trail rows need sweeping too.
· `client_contacts.contact_type` admits only hiring_manager | hr |
  executive | procurement | finance | other; `email_key` is GENERATED
  and cannot be updated.
· Browser autofills the founder's real credentials — founder sessions
  ride it, everyone else OVERWRITE.
· clearCookies ≠ localStorage — clear BOTH.
· Direct SQL UPDATE on public.users fires member-audit (three member_*
  events, sweep by name); public.users before auth.users; hand-minted
  auth.users need the EIGHT token/change columns set to '' not NULL.
· Fresh-statement counts (a sibling CTE reads the pre-delete snapshot).
· rate_limit sweeps whole per its zero baseline; sign_in_ip buckets
  come from browser sign-ins; sweep drive inference_runs rows.
· Storage deletes are API-only (SQL is trigger-blocked).
· Playwright file uploads only from the repo or .playwright-mcp dirs;
  a `page.on('dialog')` handler conflicts with the MCP's own dialog
  state — register it once, per action.
· `git commit -m` with backticks in the message gets shell-interpreted
  — use `git commit -F -` with a quoted heredoc.

FOUNDER-OWNED RESIDUE (surface ONCE, do not nag): agency sending
domain verified with Resend (else invoices send from getmandate.io) ·
RESEND_WEBHOOK_SECRET (delivery feedback is dark until it lands) ·
Deep Infra provisioning (`vercel integration add deepinfra` → the
transcribe buttons appear, no deploy; then one live endpoint-shape
verification) · parse_cv benchmark waits on founder CVs, which ALSO
arms the dormant escalation pair · first real escalation hop announces
itself in inference_runs · judge debts (max_tokens 600 + fixture
digest) · Q4 cross-provider spike deferred · Twilio parked WITH its
needs-checklist in memory · §128 real-CV testing half (8–10 CVs, real
HM, mail-client check, real erasure exercise, D2 disposition ruling) ·
D4 UptimeRobot · Turnstile keys · service-role key rotation ·
leaked-password protection (Supabase dashboard toggle, still WARN) ·
"Capital Markets Investment Bank" rename · stale-poll §82 · /portal
client-interview ruling (portal_get_mandate). **Stripe parked LAST.**

## NEXT

<< replace this section with the work — and remember the house rule:
if it is a new programme or slice, DRAFT THE GATE FIRST and wait for
my word before building. If you want a recommendation on what to pick
up, say so and give me options rather than starting. >>
