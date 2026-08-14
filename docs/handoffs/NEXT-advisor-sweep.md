# NEXT — the full Supabase advisor sweep

Paste the block below as the first message of a fresh session.

This file is the continuation prompt, not a handoff. The handoff is
`2026-08-13-roles-reskin-clients-placements-contacts.md`; this points a new
session at it with the task and the guardrails attached. Delete this file
once the work is done and the handoff records it.

---

```
Read docs/handoffs/2026-08-13-roles-reskin-clients-placements-contacts.md in
/Users/vladbreygin/Projects/mandate first. It is the current state of the
world and explains the conventions below. §2 is the role model and the two
SECURITY DEFINER helpers that must stay definer, §5b the activity trail,
§5d–§5f the three org-integrity migrations that added most of the schema
objects a sweep will now see.

Work in /Users/vladbreygin/Projects/mandate — bash cwd resets to a stale
iCloud clone at "/Users/vladbreygin/Mandate Recruiting/mandate" between
calls, so always cd first or use git -C. Supabase project
xipyqnltkbtywxqyxupf.

main is clean, pushed and deployed at 2a9d209. Migrations 046–057 applied;
next is 058. 544 tests, tsc / lint / build green.

## The task: run the full advisor sweep and clear what should be cleared

Both reports — mcp_supabase_get_advisors with type "security" AND type
"performance". This is the pre-launch checklist item in CLAUDE.md ("Run
Supabase advisor sweep and fix any new findings before public launch") plus
the one under it ("Fix unindexed FK warnings on older migrations").

The sweep has NOT been run since migration 054. 055 added 68 composite
foreign keys and ~84 indexes, 056 added two catalogue flags with four keys,
and 057 added one function and 28 triggers. None of that has been through
the advisor. Assume the output is long and trust it over this prompt.

Produce, in the handoff: what was fixed, what was left and why. A finding
that stays needs a reason written down, not silence.

## What is deliberate and must NOT be "fixed"

These will appear every run. They are load-bearing and 048/053 explain them
at length next to the code:

- current_user_role(), current_user_org_id(), is_current_user_founder() —
  SECURITY DEFINER and executable by authenticated. RLS predicates evaluate
  as the calling role, so revoking EXECUTE makes every read in the product
  return nothing. They stay.
- record_activity_event — SECURITY DEFINER, executable by authenticated. It
  is the application's only write path into activity_events, which
  authenticated has no INSERT policy on. It stays. Note it is deliberately
  narrower than the table: it refuses any event type outside the three
  intent events and stamps the actor from auth.uid() rather than taking it
  as a parameter.
- verify_hm_token — anon-executable on purpose. The hiring-manager portal is
  the token path with no session (023).
- handle_new_auth_user — the signup trigger.

Every other function added by 046–057 has SET search_path and EXECUTE
revoked from authenticated, so none of them should appear. If one does, that
is a real finding and probably my mistake — fix it.

## The trap that will cost you the most

**Do not drop "unused" indexes.** The performance advisor reports every
index that has never been scanned, and 055/056/057 added roughly ninety of
them days ago against tables holding fewer than thirty rows each. They are
unused because nothing has queried them yet, not because they are dead.
Several exist solely to cover a foreign key so that deleting a parent does
not sequential-scan the child — that work never shows up as an index scan in
pg_stat_user_indexes.

Dropping them would silently undo the covering-index half of 055 and put the
unindexed-FK findings straight back. Treat unused_index as informational for
anything created by 049 or later.

## What I expect is genuinely worth fixing

Verify each against the real output rather than taking this list on trust.

1. function_search_path_mutable — around two dozen older Executive
   Intelligence and sourcing functions (next_job_spec_version,
   finalize_job_spec, allocate_and_insert_*, approve_*, guard_*,
   promote_sourcing_results, log_candidate_outreach,
   record_notification_sent/failed and friends). ALTER FUNCTION ... SET
   search_path = public. Cheap and real. Check each body first for anything
   that resolves an unqualified name outside public.
2. auth_rls_initplan on users.users_can_read_self — auth.uid() re-evaluated
   per row; wrap it as (select auth.uid()). 046 already did this everywhere
   else, so this one is an oversight.
3. multiple_permissive_policies on users, for SELECT
   (founders_can_read_all_users, users_can_read_self, users_see_own_org_users)
   and for UPDATE. Consolidating is correct but this is the users table and
   every policy in the product resolves through it — if you touch it, prove
   all four roles plus a founder plus a pending account still read exactly
   what they read now, by impersonation, before and after.
4. unindexed_foreign_keys — 15 remain, down from 28. Most are created_by /
   submitted_by / generated_by, which 057 deliberately did not constrain.
   Decide whether an attribution column earns an index: the honest test is
   whether deleting a user is a thing that happens, since that is the only
   operation the index serves.

## A founder decision, not yours

auth_leaked_password_protection is disabled. Enabling it is a Supabase Auth
dashboard toggle (HaveIBeenPwned check on password set), not SQL, and it
changes what happens to a real person at signup. Surface it, do not enable
it.

## Constraints already decided — do not reopen

- Terminal visual language, product-wide. Rules at the top of PageHeader in
  src/components/ui/page-shell.tsx.
- Four roles (admin / recruiter / researcher / viewer) plus fees:read, with
  capability tiers; is_founder is orthogonal. Enforce in three layers —
  proxy route guard, assertCapability in the action, RLS. Only RLS is a
  boundary.
- Externals (hiring managers, clients) stay on the token portal with no
  login.
- The three org-integrity exclusions from 055 are all closed (056, 057) and
  the reasoning is in §5d–§5f. Do not re-litigate the users one: composite
  keys there were tried and measured, and they break founder org moves and
  is_founder toggles.

## How to verify — this project expects it

- Any policy or function change is proven by impersonating each role against
  the live DB with real inserts, updates and selects, not by reading policy
  text. Recipe in §6 of the handoff; worked examples in
  supabase/tests/*_invariants.sql (there are five).
- Follow it with a control run that has one assertion deliberately wrong —
  invert the LAST one, which also proves execution reached the end. A
  rolled-back script that passes silently proves only that nothing threw.
- If you touch the users policies, drive the app in a browser afterwards.
  Dashboard routes 307 without a session and there is no service-role key
  locally, so use the temporary account recipe in §6 — including the GoTrue
  trap where hand-inserted auth.users rows need '' rather than NULL in the
  token columns. Delete the account afterwards and check row counts.
- The founder's org is the live one. Anything written while testing is real
  data — delete it and check counts before finishing. Baseline is 1 org, 2
  projects, 1 candidate, 1 client, 0 contacts, 0 notes, 0 placements.

## Other traps worth knowing

- A "use server" module may only export async functions. Exporting a const
  invalidates the whole page's action manifest, so every server action on
  that page fails — and it only fires when one is invoked, so it ships. All
  33 such files are clean as of 2a9d209.
- React resets a form once its action returns, including when the action
  threw. Anything with server-side validation must use onSubmit +
  preventDefault.
- Since 053 the member audit trigger fires on a seed that uses "on conflict
  do update", so clear activity_events for your test orgs after seeding or
  every count measures the fixture. Scope the delete to the test orgs, never
  a bare DELETE.
- Postgres will not let you reference a generated column in ON DELETE SET
  NULL, and a composite SET NULL nulls every column in the key including
  organization_id — 055's header explains why that matters.

## Blocked, founder-owned, do not start

Resend (marketplace resource still Onboarding, DNS half-done) and anything
needing ANTHROPIC_API_KEY (no credit — the role-analysis agent fails, so a
new mandate stays "Analyzing…"). Details in §7.

## Conventions

Commit on a branch, fast-forward to main, push. Migrations numbered and
applied via the Supabase MCP. One handoff doc per session in docs/handoffs/
— update the existing one rather than starting a new file, and rename it if
its name stops describing its contents. Delete
docs/handoffs/NEXT-advisor-sweep.md when the work lands.
```
