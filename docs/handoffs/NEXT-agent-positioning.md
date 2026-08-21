# NEXT — The Positioning Agent becomes a principal (slice five)

Status: **Phase 0 complete — D1–D8 drafted, awaiting the founder's
written D-confirmation. No build work past this file until then.**

Slice five of agents-as-principals, opening the candidate-intelligence
cluster per the confirmed §38 verdict. The judgment that writes what
the firm says ABOUT a person to a client — three pitch versions, three
client email templates — currently runs in the triggering recruiter's
session and lands under the recruiter's face. This slice gives it its
own name, credential, kill switch, and trail event, on the proven
four-slice ladder. Next migration: **078**.

---

## Phase 0 — enumeration from the code (the §5h rule)

Every claim below was read from the code this session, not from memory
or prior handoffs.

### The pipeline

`generatePositioningAction` (`src/app/(dashboard)/app/projects/[id]/candidates/[candidateId]/actions.ts:667`)
is the ONLY caller of `runPositioning`
(`src/lib/ai/run-positioning.ts:45`). The flow, in order:

1. **Gate** — `requireActiveUser()` → `requireActionContext("candidates:write")`,
   then `assertCandidateBelongsToProject`. The human trigger's gate;
   it stays human.
2. **Reads** (three parallel queries, actions.ts:682–718):
   - `projects` SELECT — `id, title, company_name, calibration_model,
     company_context, organization_id`, plus an org-match check against
     the caller.
   - `candidates` SELECT — `id, full_name, current_title,
     current_company, archetype, cv_structured, recruiter_assessment`.
     The input takes `cv_structured` wholesale as `profile` and pulls
     `cv_structured.evaluation` (the Evaluation Agent's report) as a
     head start.
   - `feedback` SELECT — `feedback_type, content, interpreted,
     created_at`, last 10 by project (client-preference adaptation).
3. **Skills** — `runPositioning` calls `applySkillsToPrompt`
   (`src/lib/skills/skill-injector.ts:231`), which reads `skills`
   (org + project scoped) and `projects.client_id` (one resolving
   read). Today this builds a cookie client — the recruiter's session.
   The action runs synchronously (no `after()`), so it never hit the
   cookie caveat; it simply runs as the wrong principal.
4. **Model call** — `claude-sonnet-4-6`, JSON-schema output
   (`POSITIONING_SCHEMA`), max 3000 tokens. **The `input` object is
   `JSON.stringify`'d into the prompt** (run-positioning.ts:50); the
   `ctx` second parameter is not. Any client handle the seam threads
   through must ride `ctx`/options, never `input` — the house trap,
   already shaped correctly here.
5. **Write** — `rpcSetCvField(candidateId, projectId,
   "positioning_kit", result)` → RPC `update_cv_structured_field`
   (migration 021). The RPC is **SECURITY INVOKER** and RLS-bound: for
   an agent session it resolves to a plain `candidates` UPDATE under
   `candidates_agent_update` (076). This is the first agent write that
   travels through an RPC — noted in D3's control run.
6. **Return + revalidate** — the kit returns to the panel for
   immediate render; `revalidatePath` refreshes the page.

### What it writes

One top-level key: `cv_structured.positioning_kit` — a
`PositioningResult` (`src/lib/ai/positioning-agent.ts:66`):
`positioning_summary`, `pitches[3]` (tone / opener / talking_points /
objection_handling), `emails[3]` (introduction / follow_up /
interview_prep), `generated_at`. Nothing else. No storage, no scores,
no calibration, no feedback mutation.

### Trigger surfaces

Exactly one: the Positioning panel's single button
(`positioning-panel.tsx:115` — "Generate kit" when absent,
"Regenerate" when present). No cache-miss auto-generation, no
`after()` path, no cron. Readers that are NOT triggers: the profile
page renders the kit (`page.tsx:662`), the Copilot's context includes
it read-only (`copilot-context.ts:211`), and the network-copy path
deliberately STRIPS it when copying a candidate
(`network/actions.ts:138`) — project-specific overlay, correctly
non-portable.

### Grant check against the pool

| Surface | Needed | Covered by |
|---|---|---|
| projects SELECT | read role/calibration/org + skills' client_id | `projects_agent_select` (074) |
| candidates SELECT | profile, evaluation, recruiter_assessment | `candidates_agent_select` (074) |
| candidates UPDATE | the kit write via the SECURITY INVOKER RPC | `candidates_agent_update` (076) |
| feedback SELECT | last-10 preference read | `feedback_agent_select` (074) |
| skills SELECT | Skills Studio injection | `skills_agent_select` (074) |

**Expectation confirmed by the code: vocabulary-only.** No table the
pipeline touches is outside the 074/076 pool. Migration 078 adds an
event type and nothing else.

---

## Decisions for confirmation

### D1 — The fifth principal

A users row with role `agent`, org-bound to Mandate HQ, full name
**"Positioning Agent"**, account `vbreygin+positioning@gmail.com`,
minted by the §30 operator-hand recipe ('' token columns,
`email_confirmed_at`, `auth.identities` row, `crypt`/`gen_salt('bf')`,
role + org flipped in ONE statement). Credentials held only as
`AGENT_POSITIONING_EMAIL` / `AGENT_POSITIONING_PASSWORD` in Vercel
production and `.env.local`, minted with `openssl rand`, never
committed. Its /ops row is its own independent kill switch — the fifth
— suspension killing sign-ins at GoTrue and in-flight reach at
`is_agent()`, proven independent of the other four in the invariants
and the drive.

### D2 — Grants: vocabulary-only

Zero new RLS policies. The enumeration table above is the whole reach;
the pool's authority is identical across agent kinds (slice one's D1),
and the positioner's identity lives in its credential and its
allowlist entry, not in table grants. If any Phase-1 test contradicts
this enumeration, work stops and this file is corrected first — the
§35 precedent (the code corrects the plan, before build).

### D3 — Migration 078 + invariants, with a novel control run

- `candidate_positioned` joins the `activity_events` CHECK — rebuilt
  carrying the LIVE list read from `pg_constraint` plus the new value
  (the standing trap), and joins `record_agent_event`'s allowlist
  (five event types).
- App vocabulary: `src/lib/activity/types.ts` (event list + category
  map, `mandates` like `candidate_evaluated`) and
  `src/lib/activity/describe.ts` (a sentence naming the candidate and
  trigger).
- **`agent_positioning_invariants.sql`** — the fifth principal's
  negative matrix, attribution with trigger named, the forgery
  boundary both directions, five-way kill-switch independence, and
  one invariant new to this slice: the positioner's write reach
  through the RPC is org-bound (a cross-org
  `update_cv_structured_field` call lands on zero rows / raises).
- **Control run (novel per slice):** re-create
  `update_cv_structured_field` as **SECURITY DEFINER** — the realistic
  regression for the first RPC-mediated agent write: a well-meaning
  "fix" that detaches the write from the caller's RLS. The harness
  must abort at INVARIANT-FAIL on the cross-org write landing, with
  the positives still passing; diff vs. clean pass is the one function
  body, rollback residue-free.

### D4 — The trail: one event per landed kit, trigger named

One `candidate_positioned` event per kit that actually persisted,
recorded via `record_agent_event` by the agent session that wrote it.
Trigger: `generate` (no prior kit) or `regenerate` (kit replaced) —
read from whether `cv_structured.positioning_kit` existed before the
write. Detail: candidate id + name, project id, trigger,
`replaced_existing`. A failed or refused run records nothing — a log
line, not history.

### D5 — Fail-soft: destroy nothing, no service-role fallback, ever

The seam returns a named refusal when the credential is absent or the
agent suspended; the action surfaces the §11 sentence: **"The
Positioning Agent could not run — an operator has suspended it or its
credentials are absent. The existing kit stands."** There is no
pre-clear today and none will be added — the RPC write is a single
atomic key replace, so the old kit stands untouched until the new one
lands. A genuine model/parse failure keeps the existing error
contract, authored by the agent that failed. No service-role fallback
in any branch — the fallback is the bug this programme removed.

### D6 — The seam shape

`runPositioningAndPersist` (name per the parser's precedent), splitting
at judgment: the recruiter's action keeps the gate and the candidate/
project assertion; the agent signs in
(`signInPositioningAgent` beside the four existing, shared core, own
env pair), performs the three input reads, the skill-injected model
call, the RPC write, and the event under ITS session, then signs out
persisting nothing (the evaluator's shape — the agent reads its own
inputs; every read is already in its pool). The skill client threads
through `RunPositioningContext` (options), never through
`PositioningInput` — the input is serialised wholesale into the
prompt. The kit still returns to the panel for immediate render.

### D7 — The kind boundary, stated

Pool authority is identical across agent kinds (slice one's D1): the
positioner can physically read feedback and update candidates because
the pool can. What separates the five principals is each one's
credential (its own sign-in, its own kill switch) and the allowlist
(the positioner records `candidate_positioned` and nothing else;
nobody else records it — no human, and no other agent identity is
distinguishable at the door beyond active-agent + event name, which is
the accepted boundary of record since slice two). Evaluation stays the
Evaluation Agent's act; positioning consumes the evaluation read-only
and never rewrites it — asserted by effect in the invariants (the
spread/RPC write touches only `positioning_kit`, the 077 D6 shape).

### D8 — Out of scope

- Candidate research (`runCandidateResearch`), triangulation
  (`runTriangulation`), psychology (`generatePsychologyAction`) —
  they follow in the cluster's own order, each with its own Phase 0.
- The desk digest writer waits behind the cluster (§38).
- The Copilot's read of `positioning_kit` is a human-session read and
  stays one.
- Observation, not scope: the positioning action is a Regenerate-class
  long action (~30–60s single model call). If drops are observed live,
  the f54f1e7 optimistic-toast/poll pattern extends naturally; not
  built unbidden.

---

## Phases 1–4 — the proven ladder (GATED)

**No build work past Phase 0 until the founder's written
D-confirmation.** Then:

1. **Migration 078 + invariants** — via MCP (project xipyqnltkbtywxqyxupf)
   AND the numbered file; the D3 control run verified with a diffed
   rollback; green gate (tsc / lint / 790+ tests / build) before commit.
2. **Seam + live account** — §30 recipe; credentials to Vercel
   production and `.env.local`; durable baseline moves to 6 users /
   6 auth users / 15 activity events (five creation trails).
3. **Production drive** — scratch world INSIDE Mandate HQ (scratch
   prefix `07800000`, drive prefix `0d4`), scratch is_founder operator
   (never real founder credentials; overwrite both autofilled fields):
   generate under the agent → suspend from /ops ("Reject") → refused
   with the D5 sentence, kit survives byte-identical → restore
   ("Approve") → regenerate lands with the second event. Probe matrix
   with the real JWT (pool answers; clients / reviews / organizations /
   events / fees / roster-beyond-self / DELETE / portal RPCs refuse).
4. **Teardown to baseline exactly** — residue filters keyed on SCRATCH
   IDS only, never time windows; teardown order users → identities/
   sessions/refresh_tokens (::uuid cast) → auth.users; storage via the
   Storage API as an org principal if the drive stores anything.
   Verdicts drafted for founder sign-off.

No completion declaration until the founder's written confirmation.
This file is deleted only after it.
