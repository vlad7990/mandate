# NEXT — client contacts and notes

Paste the block below as the first message of a fresh session.

This file is the continuation prompt, not a handoff. The handoff is
`2026-08-13-roles-reskin-clients-placements.md`; this just points a new
session at it with the task and the guardrails attached. Delete this file
once the work is done and the handoff records it.

---

```
Read docs/handoffs/2026-08-13-roles-reskin-clients-placements.md in
/Users/vladbreygin/Projects/mandate first. It is the current state of the
world and explains the conventions below. §5 is the client entity, §5a the
placement record, §5b the activity trail, §10 the fee visibility rule.

Work in /Users/vladbreygin/Projects/mandate — bash cwd resets to a stale
iCloud clone at "/Users/vladbreygin/Mandate Recruiting/mandate" between
calls, so always cd first or use git -C. Supabase project
xipyqnltkbtywxqyxupf.

main is clean, pushed and deployed at 47882cc, plus the commit that added
this continuation file on top of it. Migrations 046–053 applied; next is
054. 523 tests, tsc / lint / build green.

## The task: client contacts and notes

The last piece of the client entity. 049 built clients as identity plus
company profile and deliberately excluded contacts and notes; 050 added the
commercial terms half. Contacts are what is left, and the placement record
wants them too — "who signed off" has no answer today.

## Ask me before you write schema

Four of these are mine to decide and the shapes differ materially.

1. Is a contact a person who can outlive the client? A hiring manager who
   moves from one bank to another is either a new row or the same person
   with a new employer, and that is the difference between `client_contacts`
   with a client_id and a people entity with employment history. The
   Network page already folds candidate rows by identity — decide whether
   contacts get the same treatment or deliberately do not.
2. Do contacts connect to the hiring-manager portal? `hiring_manager_tokens`
   already exists and externals stay token-only with no login. The question
   is whether issuing a token becomes "invite this contact" — i.e. whether
   the contact record is what a token points at, or stays separate CRM data.
3. Should a placement record who signed it off? The handoff says both halves
   want this. If yes it is a nullable contact FK on `placements`, and it
   should be decided now rather than bolted on.
4. Note visibility. Some client notes are commercially sensitive ("they are
   squeezing us on the rate"). 053 established a per-row visibility tier and
   the machinery is already there — decide whether client notes use it or
   are org-readable like candidate notes.

Also flag to me, as your own judgement calls:

- Whether contact and note changes belong on the activity trail. Adding
  event types means a migration that redefines the CHECK in 053, so it is
  cheaper to decide before than after. My instinct: contacts yes (they are
  the "who signed off" record), notes no (too chatty to be worth reading
  back).
- Art. 14. Candidates carry a statutory notification duty (043/044) because
  they are sourced without consent. A client contact is an ordinary B2B
  business relationship and almost certainly does not, but say so
  explicitly rather than leaving it unconsidered.

## Constraints already decided — do not reopen

- Terminal visual language, product-wide. Rules at the top of PageHeader in
  src/components/ui/page-shell.tsx; TerminalTitle for screaming-snake
  headings; nothing rounded.
- Four roles (admin / recruiter / researcher / viewer) plus fees:read, with
  capability tiers; is_founder is orthogonal. Enforce in three layers —
  proxy route guard, assertCapability in the action, RLS. Only RLS is a
  boundary.
- Externals (hiring managers, clients) stay on the token portal with no
  login.
- Clients are identity, company profile and commercial terms. Contacts and
  notes are the remaining gap.

## Precedent worth reading before designing

`candidate_notes` (migration 020, re-policied into the role model by 046 at
the candidates tier) is the same problem solved once already, with a working
UI in notes-panel.tsx / notes-actions.ts / notes-constants.ts. Reuse the
shape unless there is a reason not to; if client notes need a visibility
tier, that is the reason.

## How to verify — this project expects it

- Prove RLS by impersonating each role against the live DB with real inserts
  and updates, not by reading policy text. Recipe in §6 of the handoff.
  Follow it with a control run that has one assertion deliberately wrong: a
  rolled-back script that passes silently proves only that nothing threw.
- Drive every new screen in a browser. Dashboard routes 307 without a
  session and there is no service-role key locally, so use the temporary
  account recipe in §6 — including the GoTrue trap where hand-inserted
  auth.users rows need '' rather than NULL in the token columns. Delete the
  account afterwards and check row counts.
- Sweep new screens at 360 / 390 / 768 / 1024 / 1440 for horizontal
  overflow.

## Traps that cost time in the last two sessions

- A `"use server"` module may only export async functions. Exporting a const
  invalidates the whole page's action manifest, so *every* server action on
  that page fails — and it only fires when one is invoked, so it ships. All
  31 such files are clean as of 47882cc; keep them that way by putting
  shared constants in a `*-constants.ts` beside them.
- React resets a form once its action returns, including when the action
  threw. Anything with server-side validation must use onSubmit +
  preventDefault, or a rejected submit wipes what the user typed and
  silently reverts controlled fields to their state values.
- ON CONFLICT cannot use a partial unique index. A plain unique index
  already allows any number of NULLs, so the WHERE clause is usually
  unnecessary anyway (051).
- A LANGUAGE sql function body is parsed at creation, so a helper that reads
  a table must be created after it (050 failed on this first).
- Writing an invariants script: `max(jsonb)` does not exist; `INSERT ...
  RETURNING INTO` raises on a multi-row insert; and since 053 the member
  audit trigger fires on a seed that uses `on conflict do update`, so clear
  `activity_events` after seeding or every count measures the fixture.
- The founder's org is the live one. Anything written while testing is real
  data — delete it and check counts before finishing.

## Blocked, founder-owned, do not start

Resend (marketplace resource still Onboarding, DNS half-done) and anything
needing ANTHROPIC_API_KEY (no credit). Details in §7.

## Conventions

Commit on a branch, fast-forward to main, push. Migrations numbered and
applied via the Supabase MCP. One handoff doc per session in docs/handoffs/
— update the existing one rather than starting a new file, and rename it if
its name stops describing its contents. Delete this NEXT- file when the work
lands.
```
