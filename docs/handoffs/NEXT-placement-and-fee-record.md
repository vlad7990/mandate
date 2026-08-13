# NEXT — placement and fee record

Paste the block below as the first message of a fresh session.

This file is the continuation prompt, not a handoff. The handoff is
`2026-08-13-roles-reskin-clients.md`; this just points a new session at it
with the task and the guardrails attached. Delete this file once the work is
done and the handoff records it.

---

```
Read docs/handoffs/2026-08-13-roles-reskin-clients.md in
/Users/vladbreygin/Projects/mandate first. It is the current state of the
world and explains the conventions below.

Work in /Users/vladbreygin/Projects/mandate — bash cwd resets to a stale
iCloud clone at "/Users/vladbreygin/Mandate Recruiting/mandate" between
calls, so always cd first or use git -C. Supabase project
xipyqnltkbtywxqyxupf.

main is clean, pushed and deployed at 1b8dcd4. Migrations 046–049 applied;
next is 050. 451 tests, tsc / lint / build green.

## The task: placement and fee record (priority #4, the last big gap)

pipeline_stage has `offer` and `hired` and nothing else — no offer date,
salary, fee, start date, guarantee period, or fallthrough. The acceptance
test is that the product can answer "what did we bill this quarter". Until
it can, this is a sourcing tool rather than a recruiting one.

## Ask me before you write schema

This is a commercial-model decision and the shapes differ materially. At
minimum:

1. Fee model — contingent percentage, retained in stages, fixed amount, or
   several per client? This drives whether a placement has one fee row or
   many.
2. Where terms live. `clients` exists as of 049 but deliberately has no
   commercial columns: terms belong to the client, amounts to the
   placement. Confirm that split before building either.
3. Guarantee and fallthrough — what happens to a booked fee when a
   placement falls through inside the guarantee period? Clawback,
   credit note, or just a status change?
4. Currency. Single or multi, and if multi, rate at booking or at invoice.
5. Scope edge: is invoicing / payment tracking in, or does this stop at
   "fee earned"?

Also flag to me, as your own judgement call: **fee data may be the first
thing that needs read-level segregation.** Today `org:read` means every
active role sees everything, and a researcher or viewer would see the whole
revenue book. That may want a new capability rather than reusing
`clients:share`.

## Constraints already decided — do not reopen

- Terminal visual language, product-wide. The rules are written at the top
  of PageHeader in src/components/ui/page-shell.tsx; TerminalTitle for
  screaming-snake headings; nothing rounded.
- Four roles (admin / recruiter / researcher / viewer) with capability
  tiers; `is_founder` is orthogonal. Enforce in three layers — proxy route
  guard, assertCapability in the action, RLS. Only RLS is a boundary.
- Externals (hiring managers, clients) stay on the token portal with no
  login.
- Clients are identity + company profile only. Contacts and notes were
  scoped out and are better done alongside this work than before it.

## How to verify — this project expects it

- Prove RLS by impersonating each role against the live DB with real
  inserts and updates, not by reading policy text. Recipe in §6 of the
  handoff.
- Drive every new screen in a browser. Dashboard routes 307 without a
  session and there is no service-role key locally, so use the temporary
  account recipe in §6 — including the GoTrue trap where hand-inserted
  auth.users rows need '' rather than NULL in the token columns. Delete
  the account afterwards and check row counts.
- Sweep new screens at 360 / 390 / 768 / 1024 / 1440 for horizontal
  overflow. Watch for `flex-1` with no `flex-basis` in a `flex-wrap` row —
  that single pattern caused five of the nine layout bugs fixed this
  session.

## Blocked, founder-owned, do not start

Resend (marketplace resource still Onboarding, DNS half-done) and anything
needing ANTHROPIC_API_KEY (no credit). Details in §7.

## Conventions

Commit on a branch, fast-forward to main, push. Migrations numbered and
applied via the Supabase MCP. One handoff doc per session in
docs/handoffs/ — update the existing one rather than starting a new file,
and rename it if its name stops describing its contents.
```
