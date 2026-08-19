# NEXT — The External Identity Programme

Hiring Manager login + Hiring Company HR + Hiring Company Admin, built as
one programme: shared invitations, an external boundary in RLS, and the
first real Resend sends. Third persona programme, same phased shape as
the Recruiter (§14–§17) and Recruiting Manager (§19–§20) programmes.
Delete this file when the programme's completion is declared.

**Gate: no build work past Phase 0 until the founder confirms D1–D6.**
No completion declaration until the founder confirms the Phase 4
verdicts.

---

## Where this starts from (2026-08-19, HEAD `1cca082`)

- Externals today are **tokens, not people**: `/hm/[token]` verifies via
  the `verify_hm_token` definer RPC, then reads and writes with the
  service-role client scoped to the one project (023, 063). Contacts are
  explicitly not accounts (054). The 3 service-role call sites in the
  app are all this portal.
- Five staff roles (`admin, manager, recruiter, researcher, viewer`) in
  `users.role`, mirrored in `src/lib/auth/roles.ts`; capability
  predicates in DB (046/064), three enforcement layers (proxy → action
  → RLS) with **RLS as the only boundary** (access.ts:19–33).
- `handle_new_auth_user` gives every non-founder signup
  `viewer/pending/org NULL`; a founder manually approves and attaches
  to an org. There is no invitation system.
- Resend: `RESEND_API_KEY` + `RESEND_FROM` live in Vercel production
  (110 days old); the only sender is the waitlist founder-notify raw
  fetch (`src/lib/waitlist/notify.ts`). Domain verification for
  getmandate.io is unproven — no customer-facing email has ever sent.
- Auth floor (§18): 12-char/4-class passwords, email confirmation on.
  Applies to externals automatically.
- Next migration: **067**. 721 tests green. Baseline DB counts in §19.

## The fail-open trap this programme must not spring

`can_read_org()` is `current_user_role() IS NOT NULL`. If external
roles join the same vocabulary and an external ever carries an
`organization_id`, every org-scoped SELECT policy in the product opens
to them. Both halves get closed:

1. **Externals never hold `organization_id`.** Their boundary is a new
   `users.client_id`; a CHECK enforces the XOR (staff ⇒ client_id NULL;
   external ⇒ organization_id NULL AND client_id NOT NULL).
2. **`can_read_org()` stops meaning "any role" and enumerates the five
   staff roles** — as do any other predicates that test broadly. The
   046 "one function" design makes this a handful of function bodies.

Either half alone would hold; both are cheap; §19's invariant-11 lesson
says belt and braces.

---

## Phase 0 — Decisions for the founder (D1–D6)

### D1 — Externals are principals in `public.users`, not a second table
Three new roles join the vocabulary: `hiring_manager`, `client_hr`,
`client_admin`. Same auth stack, same password floor, same status
lifecycle, same `parseRole` fail-closed behaviour. New nullable
`users.client_id → clients(id)` is the external boundary (see trap
above). Rationale: the persona model already says AI agents and every
human are credentialed principals under one role model; a parallel
table would fork auth, invariants, and the members machinery.
Consequence to accept: **one email = one account = one client
relationship**. If two recruiting orgs both work with Acme and both
invite jane@acme.com, the second invitation is refused with an honest
message (multi-relationship externals become a written verdict, not a
silent behaviour).

### D2 — Nothing leaves the building without a share; two scope tiers
- A mandate becomes visible to the client side only by an explicit
  **share** act (staff-side, `clients:share` tier — the 046 "anything
  that leaves the building" tier). Confidential searches (e.g.
  replacing an executive the client's own HR doesn't know about) stay
  invisible by default.
- **`client_hr` and `client_admin` are client-scoped**: they see all
  *shared* mandates of their client.
- **`hiring_manager` is mandate-scoped**: they see only the shared
  mandates they are individually granted. The HM on the Head of
  Engineering search does not see the CFO search.

### D3 — What externals see and do
Read surface = today's token portal, per shared mandate: the slate
(shortlist candidates with evidence), progress, and their own past
feedback submissions. Never: fees, calibration internals, sourcing, the
non-slate candidate pool, other clients, org settings. Write surface =
feedback submission (same ratings vocabulary, same recalibration
pipeline), now **attributed**: `hiring_manager_reviews` gains a
nullable `submitted_by_user_id`; the token path stays label-only.
All three external roles can submit feedback on slates they can see.
Portal reads go through SECURITY DEFINER RPCs that verify the caller's
grant in-database (the `verify_hm_token` pattern, upgraded to session
identity) — the slate is a computed shape ("shortlist ids, else top-5
by rank"), which base-table RLS cannot express without exposing the
whole pool; external base-table RLS therefore stays deny-all and the
RPCs are the boundary, provable by invariants.

### D4 — One invitations table, both directions, invite-only
`invitations`: org, client_id, email, role, optional mandate grants,
optional link to a `client_contacts` row (auto-created when absent so
the CRM stays coherent), token, expiry (14 days), revocable,
single-use. Two issuers: staff holding `clients:share` invite any
external role to any of their clients; a `client_admin` invites
colleagues **at their own client only**, granting at most what they can
see (shared mandates). Redemption at `/invite/[token]`: set a
policy-compliant password, account created active with the invitation's
role and client_id. **The invitation click is the email confirmation**
— the invite proved ownership; no second confirmation loop. There is
no open signup path that attaches to a client.

### D5 — The token portal stays
`/hm/[token]` remains the zero-friction path — a one-off HM who will
never create an account is a real persona state. Login is the durable
relationship. Retiring tokens is a future verdict once real usage
shows which path clients actually take.

### D6 — Resend scope: invitations now, auth SMTP in the same pass
Invitation emails send via Resend (the waitlist notifier's pattern,
promoted to a proper `src/lib/email` module with the delivery-honesty
rule: a send failure is surfaced to the inviter, never swallowed).
Recommended in the same pass: point Supabase auth SMTP at Resend, which
removes the built-in sender's a-handful-per-hour limit before external
password resets start riding it. Dependency to verify first:
getmandate.io domain verification in Resend (DNS records are
founder-owned if missing; exact values will be prepared).

---

## Phase 1 — Model (migrations 067+, invariants, tests)

- **067 — external roles and the boundary.** Role CHECK grows to eight;
  `users.client_id` + XOR CHECK + FK + index; `can_read_org()` and any
  broad predicates narrowed to enumerate staff roles; new predicates
  `current_user_client_id()`, `is_client_admin()` (coalesced — read
  negated by triggers, §19 invariant-11 lesson); signup trigger
  untouched (externals never arrive through open signup);
  `guard_user_privilege_changes` extended: client_id changes
  founder-only, external roles can't be granted org_id and vice versa;
  last-active-client_admin rule deliberately NOT enforced (a client
  with no admin falls back to staff-side management — unlike an org,
  the recruiting firm is always there).
- **068 — invitations.** Table + RLS (staff: org-scoped at
  `clients:share`; client_admin: own-client rows via definer
  predicates), issuance/validation/redemption RPCs (redemption is
  service-role from the action after password set), activity events
  (`external_invited`, `external_joined`, vocabulary via 053's
  allowlist + CHECK).
- **069 — shares, grants, portal reads.** `mandate_shares` (project ↔
  client visibility, the D2 share act) and `mandate_grants` (project ↔
  external HM user); attribution column on `hiring_manager_reviews`;
  SECURITY DEFINER portal-read RPCs (`portal_list_mandates`,
  `portal_get_slate`, …) that verify session + grant in-database;
  external deny-all confirmed on every base table.
- **`external_identity_invariants.sql`** + control run, diff verified:
  XOR holds; external reads nothing org-scoped; HM sees only granted
  shared mandates; HR/admin see only shared mandates of their client;
  cross-client probes fail; suspended external fails closed (coalesce
  checks); revoked/expired/reused invitations refuse; client_admin
  cannot touch staff, other clients, or exceed their own visibility;
  token portal unaffected. Refusal kinds explicit (RLS filter vs
  trigger raise vs RPC empty), per the §19 house style.
- roles.ts: three roles + external capabilities (`portal:read`,
  `client:manage-people`), grants matrix, labels; `parseRole` etc.
  covered by the roles matrix tests.

## Phase 2 — Surfaces

- **Staff side**: client detail page gains a People & Portal panel
  (invite external, list/revoke invitations, list/suspend externals,
  share/unshare mandates); the mandate hiring-manager tab gains
  "invite to portal" beside the token card. Sample data, labelled.
- **External side**: `/invite/[token]` redemption; `/portal` route tree
  with its own chrome (not the staff dashboard): mandate list (HR/admin
  see client-wide, HM sees granted), mandate view reusing
  `PortalContent` with attributed submission, own feedback history;
  client_admin additionally gets a People view (invite/suspend at own
  client). Proxy: externals bounce from `/app`, staff bounce from
  `/portal`, both to honest no-access screens.
- **Email**: `src/lib/email` (Resend) + invitation template; Supabase
  SMTP switch per D6; delivery honesty on every panel (what sends,
  what doesn't).

## Phase 3 — Verification (live, production build, scratch data)

Full drive: staff invites HM + HR + client_admin (real inboxes) →
emails deliver → redemption with policy-compliant password →
each portal renders per its scope → HM submits attributed feedback →
recruiter sees it + pipeline fires → client_admin invites a colleague
→ revocation and suspension take effect live. Probe matrix: every
refusal in the invariants file exercised from the app layer too
(external → /app, staff → /portal, cross-client, revoked/expired/
reused invite, suspended external, unshared mandate invisible to HR,
ungranted mandate invisible to HM, token portal regression). Scratch
recipes: §6 auth.users notes + §18 pre-confirmation + no `.test`
domains; delete everything after and verify baseline counts.

## Phase 4 — Verdict candidates (drafted here, written properly then)

Multi-org externals (one email, two recruiting firms); retiring the
token portal; candidate persona (out of scope, stays unbuilt); Mandate
app Admin persona (out of scope); external notification emails beyond
the invitation (new-slate alerts etc. — likely "lands with the
notifications programme"); SSO/SAML for client companies; external
data erasure (joins the §14 retention verdict); client-side branding
of the portal.

## Traps carried forward

All of the §19 handoff-header traps apply, plus: the proxy's
`ALWAYS_PUBLIC_PREFIXES` must keep `/hm/` public while `/portal` is
session-gated — do not let the new rules reorder around the wildcard
table without re-running the route-access tests; GoTrue rejects
`.test` recipient domains at signup (§18); Supabase built-in sender
stays live until the SMTP switch is verified — never assume which
sender a given email rode.
