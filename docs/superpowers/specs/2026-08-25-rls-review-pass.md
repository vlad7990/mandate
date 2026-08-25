# The pre-launch checklist, slice three — THE RLS REVIEW PASS — Phase 0 + THE D-GATE — 2026-08-25 — DRAFT

**Status: DRAFT. Nothing here is confirmed. The checklist item
closes only on the founder's written word against THIS document.
This pass is READ-ONLY — every fact below is a live read of
pg_policies / pg_class / the security advisor, never files — and its
verdict is a NULL RESULT: nothing needs to move.**

Scope: the §122 checklist's "Review all RLS policies on
pre-existing tables," widened to every table because a sweep that
skips the new domains cannot prove the old ones are the odd ones
out.

---

## Part 1 — What Phase 0 found, live

### F1 — Coverage is total; deny-by-default holds

All FIFTY-SEVEN public tables carry `rowsecurity = true`. No naked
table exists. Three tables hold a single SELECT policy and take
writes ONLY through named SECURITY DEFINER doors — the house
pattern, not a gap: `activity_events` (the intent doors),
`skill_versions` (the 103 trigger), `invitations` (the invitation
RPCs). Two tables hold ZERO policies by design: `rate_limit` and
`rate_limit_policy` are deny-all to every session role; the limiter
(`check_rate_limit`, SECURITY DEFINER) is their only door — caps as
data (088), unreadable and unwritable from any browser.

### F2 — Exactly ONE anon-writable surface exists

`waitlist_anon_insert` — INSERT, roles {anon, authenticated},
`WITH CHECK (true)`. This is /request-access's front door and is
intentional: the table is write-only to the public (SELECT/UPDATE
are founder-gated), the limiter fronts it (proven live in 0f9), and
Turnstile is the founder-owned second lock still pending. The
structural sweep found NO other policy in the schema — read or
write — reachable by anon.

### F3 — The only unconfined predicates are the founder's console,
by name

Four policy families pass rows without an org match, every one
gated `is_current_user_founder()`: `organizations_founder_select`,
`clients_founder_select`, `waitlist_founder_select/_update`,
`candidate_erasure_requests_update`. Cross-org BY DESIGN — the
founder's support console. Every other SELECT/DELETE predicate in
the schema carries org confinement, an identity pin (`auth.uid()`),
or the external client scope (`current_user_client_id`/
`client_org`); every other INSERT/UPDATE WITH CHECK does the same.
The sweep that proves it: policies filtered for predicates lacking
ALL of those anchors returned the founder set and the waitlist door,
nothing else.

### F4 — The money boundary is intact where it was born

The fee tables (`fee_terms`, `placement_fees`,
`placement_fee_lines`): reads gated
`can_read_fees() OR is_placement_credited(placement_id)` — the 050
per-placement exception, exactly as ruled — writes gated
`can_write_mandates()`, all org-confined. `activity_events` visibility
CASE (org/fees/admin) matches the doctrine; `mandate_grants`/
`mandate_shares` write on `can_share_clients()`, read on
`can_read_org()`.

### F5 — The advisor holds nothing new

Four lint families, all previously dispositioned: 11 anon
SECURITY DEFINER functions = §123's ruled load-bearing set; 33
authenticated SECURITY DEFINER functions = the RLS mechanism and the
session doors (the count FELL from 42 — migration 110's revokes are
visible in the advisor); `auth_leaked_password_protection` =
founder-owned, Pro-gated, on the standing list; 2×
`rls_enabled_no_policy` INFO = the deny-all limiter pair of F1.

### F6 — `relforcerowsecurity` is false everywhere

Standard: the table owner is postgres and service_role bypasses via
role attribute regardless. Forcing RLS would change nothing for any
session role and is not the house pattern. No change.

---

## Part 2 — THE D-GATE (drafted, awaiting the founder's word)

### D1 — The checklist item closes with NOTHING MOVED

No migration. No policy edit. No new machinery. The review's whole
product is this record: coverage total, one deliberate anon door,
founder console named, money boundary proven, advisor empty. The
CLAUDE.md checklist line "Review all RLS policies on pre-existing
tables" is satisfied by inspection, and migration 111 stays
unclaimed for the next slice that needs it.

**Recommend: close the item. A read-only pass needs no drive — no
behaviour changed, so there is nothing to smoke-test that 0f9 and
the harnesses have not already proven this week.**

### D2 — Two residues ride existing lists, not this gate

- Turnstile on the waitlist door: already founder-owned, already on
  the standing list — F2 simply re-confirms it is the door's second
  lock, not its first (the limiter is live).
- Leaked-password protection: already founder-owned, Pro-gated.

**Recommend: no action here; the standing list carries both.**

## Part 3 — Named rulings

- **R1 — null results are results.** The review is closed by
  evidence, not by fatigue: the sweeps were structural (every
  policy's predicate tested for confinement anchors), not sampled.
- **R2 — the founder console stays named.** The four
  `is_current_user_founder` families are the ONLY legal cross-org
  predicates; any future policy without an org/identity/client
  anchor that is not founder-gated is a defect by definition.
- **R3 — the deny-all pair stays deny-all.** No session-role policy
  is ever added to `rate_limit`/`rate_limit_policy`; the limiter is
  the only door.

Numbers at drafting: next migration 111 (UNCLAIMED — this pass takes
none), next § 126, next drive 0fa (UNTAKEN — read-only pass); vitest
929; activity CHECK 80; intent door 14; agent allowlist 29; durable
baseline 25/24/74/5/5/1/1/2/2/1/1 + tasks 0 + objectives 0 +
key_results 0.
