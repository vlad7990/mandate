# NEXT — Agents as principals

The founder's 2026-08-12 statement, deferred by confirmed verdict twice
(§27, §29), comes due: AI agents authenticate as principals under the
same role model, not ambient service-role trust. This file plans the
first slice — one agent, credentialed, attributed, suspendable — and
names the shape the other thirteen follow. Same phased ladder as every
programme since §17: Phase 0 decisions → model → seam → verification →
verdicts → founder sign-off. Delete this file when the completion is
declared.

**Gate: no build work past Phase 0 until the founder confirms D1–D9.**

**STATUS 2026-08-20: D1–D9 CONFIRMED by the founder as drafted.** The
gate is open; execution starts at Phase 1 (migration 074, the
interpreter slice).

---

## Where this starts from (2026-08-20, HEAD `65fc3d8`)

- Next migration: **074.** 778 tests, tsc/lint/build green. All seven
  human personas served (§29).
- **The sharpest ambient trust is live today:** the feedback
  interpretation pipeline — a real agent making judgments — runs on the
  SERVICE ROLE inside the HM submit routes' `after()` (hm-portal/
  submit.ts:233; recalibrate.ts takes "an optional client for
  unauthenticated callers" — that client is the key that bypasses every
  policy in the product). A bug there can write anything, and the trail
  cannot say an agent acted at all.
- **User-triggered agent work wears the user's face.** CV parsing,
  ranking, digests run inside the triggering human's session: right
  reach, wrong attribution — the trail says the recruiter did what the
  agent did, indistinguishably.
- **Cron maintenance is a third shape:** anon client + CRON_SECRET +
  one SECURITY DEFINER RPC (`run_guarantee_maintenance`). Mechanical,
  judgment-free, self-contained.
- The 14 agents of AGENTS.md are stateless application-layer calls; no
  agent authenticates as anything. `users.role` vocabulary is the eight
  values of 067; the XOR admits staff (org-carried) and externals
  (client-carried). The operator programme (§27) proved a principal
  tier can exist outside the role matrix; the external programme
  (§21) proved a new principal CLASS can join `users` without leaking
  into the old enumerations.

## Phase 0 — Decisions for the founder (D1–D9)

### D1 — An agent is a users row: role `agent`, org-carried
The same move as the externals, on the staff side of the XOR: agents
work FOR the firm, so they carry `organization_id` (NOT NULL — an
unattached agent is meaningless) and never `client_id`. One role, not
fourteen: the agent KIND (interpreter, ranker, parser…) is attribution
detail carried on every event, not authority — authority is the role's
capability set, identical across kinds, per D6. Rejected: a separate
agents table with minted claims (new principal plumbing through every
predicate) and per-kind roles (a fourteen-row matrix nobody audits).

### D2 — `agent` joins no existing enumeration
The 067 lesson applied at authoring time: `can_read_org()` and every
staff predicate enumerate their roles by name, and `agent` appears in
NONE of them — not STAFF_ROLES, not the members screen, not
`can_read_org`. The role's reach is exactly the named grants of D6,
and the invariants pin the negatives (an agent session reads no fees,
no roster, no clients, opens no portal). The role CHECK and the XOR
staff branch grow the one value; everything else refuses by never
having heard of it.

### D3 — Credentials: GoTrue accounts, env-held secrets, short sessions
Each agent principal is an auth.users row with a long random password
held as one env secret per agent (slice one: one secret). The pipeline
signs in at run start (password grant, throwaway client — the
changePasswordAction shape), works under the agent's RLS for ≤1 hour,
and persists nothing. Kill switch for free: `status = 'suspended'` on
the agent's row kills new sign-ins immediately and in-flight JWTs at
the predicate layer (`current_user_role()` is active-only, the same
mechanics every suspension proof has ridden since §18). Rejected:
minting JWTs with the project signing secret — a bigger trust root in
app code than a rotatable password, and it bypasses GoTrue's session
ledger.

### D4 — Attribution: the agent is the actor, the trigger is named
Events written by agent-session work carry the agent principal as
`actor_id` (guard_author_in_org passes: the agent is an org member) and
`detail` names the agent kind and what triggered it (the review, the
upload, the schedule). The trail finally distinguishes "the recruiter
wrote this" from "the interpreter acted on the recruiter's submission"
— which is the entire point of the programme.

### D5 — Suspension fails soft, and honestly
When the agent is suspended, the human act that triggered it must not
break: the HM's feedback still lands; the interpretation is SKIPPED
with the reason in the server log and the review row left in its
uninterpreted state, exactly as delivery honesty carries a refused
email. An agent outage degrades the product; it never eats a person's
work.

### D6 — Slice one converts ONE agent: the feedback interpreter
The service-role `after()` pipeline is the ambient trust the statement
named, so it goes first. Its grants are enumerated from what the
pipeline actually touches — read the review and its mandate context,
write the interpretation and recalibration columns — expressed as RLS
policies naming the `agent` role on exactly those tables and nothing
else. Slice one changes ATTRIBUTION and AUTHORITY-SHAPE, not behavior:
same pipeline, same outputs, a principal instead of a master key.
Narrowing further (or widening for the next agent) is each later
slice's own enumeration.

### D7 — Agents never navigate
An agent session is a database credential, not a user: the proxy
bounces role `agent` off every route tree (no dashboard, no portal, no
/ops), the members screen never offers the role, and password recovery
for agent addresses is founder-rotation territory, not a flow. The
agent's face in the product is one place only: /ops accounts, labelled,
with suspend/restore — the operator's kill switch (§27's house).

### D8 — Cron maintenance stays an RPC, stated
`run_guarantee_maintenance` makes no judgments — it is a database chore
behind CRON_SECRET, SECURITY DEFINER like every 069 portal read, and
converting it to an agent principal would be ceremony without a threat
model. It stays as is, recorded here as deliberate; if a future cron
job ever makes an AI judgment, it enters through this programme's door.

### D9 — Out of scope, stated
The other thirteen agents (each converts by this slice's pattern, in an
order the Phase 4 verdicts set); per-agent cost/rate budgets; per-kind
authority tiers; automated per-org agent provisioning (slice one's
agent account is created by operator hand for the one real org, like
every scratch principal recipe — automation waits for the second
customer org); agent-to-agent calls (AGENTS.md forbids them in MVP and
nothing changes that here).

## Phase 1 — Model (074)

- **074** — `agent` joins `users_role_check` and the XOR staff branch
  with `organization_id NOT NULL` enforced for the role; RLS policies
  naming `agent` on exactly the interpreter's tables (D6's enumeration,
  written from the pipeline's reads and writes, not from memory — the
  §5h rule); the privilege guard refuses role changes INTO and OUT OF
  `agent` for non-founders (an agent cannot be promoted to admin, an
  admin cannot become an agent — the boundary moves by founder hand
  like org moves). App side: `agent` in the role vocabulary with an
  EMPTY capability grant in `can()` (D2 — capabilities are for humans;
  agent reach lives in the named RLS policies), parseRole admitting it,
  labels/summaries honest ("Autonomous agent. Signs in to work, never
  to look.").
- **`agent_principal_invariants.sql`** + control run: the agent session
  reads and writes exactly the D6 tables (positive), reads zero fees /
  users-roster / clients / portal RPCs (the negatives, each by name); a
  suspended agent's session reads nothing (active-only predicates); the
  guard refuses the role transitions; events written under the agent
  carry it as actor and pass the author guard. Control run: simulate
  the enumeration regression — `agent` slipped into `can_read_org()` —
  and the fees/roster negative must trip.

## Phase 2 — The seam

- `src/lib/agents/session.ts`: sign in an agent principal from env
  credentials, return the scoped client, refuse loudly when the secret
  is absent (no silent service-role fallback — the fallback IS the bug
  this programme exists to remove).
- `hm-portal/submit.ts` + `recalibrate.ts`: the `after()` pipeline
  takes the interpreter's session instead of the service-role client;
  the D5 fail-soft wraps it.
- `/ops` accounts: agent principals labelled as such, suspend/restore
  working (they are users rows — §27's machinery carries them free).
- The agent account for the live org, created by operator hand,
  recipe recorded in the handoff.

## Phase 3 — Verification (production, scratch data)

Scratch org, recruiter, mandate, candidate, HM token. Drive: HM submits
feedback → the interpretation lands with the AGENT as trail actor and
the review named in detail; suspend the agent from /ops → a second
submission lands, its interpretation honestly skipped (review intact,
reason logged) → restore → a third interprets again. Probe matrix with
the agent's real JWT via PostgREST: the D6 tables answer; fees, users
roster, clients, portal RPCs refuse by name. Teardown to baseline
exactly (agent scratch rows included).

## Phase 4 — Verdict candidates

Conversion order for the remaining thirteen agents (draft: ranker and
CV parser next — the highest-volume writers wearing human faces);
per-agent budgets and rate ceilings; secret rotation cadence for agent
credentials; automated agent provisioning at org onboarding; whether
scheduled metrics work (the one agent with no trigger human) arrives as
the first cron-shaped agent principal.

## Who else this waits on

Nothing external. The env secret for the interpreter is minted at
build time by the operator; no email, no DNS, no third party.
