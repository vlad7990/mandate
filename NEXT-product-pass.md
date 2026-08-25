# NEXT — the product pass: five founder items, analyzed 2026-08-25
# (§103). Each cluster below gets its own Phase 0 / D-gate before
# building; the analysis verdicts here are the starting point, not
# the confirmation.

## Where things stand (2026-08-25, all committed/deployed)

Main at `3d2f787`; prod deploy `mandate-c5uhdotuo` (= `bc21e96`).
TWENTY-FOUR principals; Engage arc COMPLETE (§99); Skills Studio
repairs CONFIRMED (§101); Skill Creator hardening CONFIRMED (§102 →
§103): skill_versions append-only trigger-fed history (survives
deletion, v1 backfilled), injector fails loud (captureSeamError) with
10 unit proofs, AGENTS.md carries the five-concept vocabulary
(Agent / Capability / Skill / Deterministic Policy / Workflow — name
which one it is before writing code). Deferred to Scout-era:
run-provenance, token budgets, targeting, CAPABILITY.md.

Numbers: next migration 104, next handoff § 104, next drive 0f1.
Durable baseline: 25 users / 24 agents / 74 events / 5 skills / 5
skill_versions / 1 network_profile / 1 org_comms_policy / 2 projects
/ 2 clients / 1 candidate / 1 job_spec; agent allowlist TWENTY-NINE,
CHECK 75; founder's session only. Green gate before every commit:
tsc / vitest 891 / eslint / next build. Deploys: `vercel --prod
--yes` from the live repo (git push does NOT deploy). Work in
/Users/vladbreygin/Projects/mandate — NOT the iCloud clone; Bash cwd
resets to the clone (check pwd, absolute paths). All standing traps
live in memory (mandate-personas.md and siblings).

## The five items — analysis verdicts (founder's direction 2026-08-25)

**1. De-AI the names.** Founder's word: stop naming surfaces "AI x" —
"you are as much human as I am, except much smarter." Surfaces found:
nav "AI search" (`nav-model.ts:150`), breadcrumb "AI Search"
(`candidates/search/page.tsx:199`), the agents-registry sentence
naming "the AI Search page", the marketing title "AI Executive
Search Operating System", Skills page "every AI agent run", agents
page "Every AI judgment…". VERDICT: rename the PRODUCT surfaces
(e.g. "AI search" → "Search" or "Pool search"; registry/skills copy
to "agent" language); the marketing title is the founder's own call.
ONE HARD BOUNDARY: the EXTERNAL disclosure machinery is not naming —
the pre-screen invitation's AI-disclosure block and the §12.1
always-disclose pre-commitment (EU AI Act / bot-disclosure) STAY
verbatim. Internal names may drop "AI"; what candidates are told
never does. Small slice: copy + nav + breadcrumb + registry prose;
no migration; visual check.

**2. Role-template creator.** Today `executive_role_templates` is a
read-only GLOBAL grounding library (~25 durable global rows; surface
at /app/executive-intelligence/templates; consumed by the intake at
searches/new). VERDICT: real slice — org-authored templates beside
the global ones: migration 104 (org-scoped rows in the same table —
nullable organization_id already distinguishes global vs org, VERIFY
live schema first — RLS admin/skills:write INSERT+UPDATE on org rows
only, global rows immutable to tenants), creator UI on the templates
page, the executive intake offering both sets, harness (org
boundary; global rows untouchable; agent reads both lawfully).
Needs its own D-gate. Check whether non-executive "role templates"
are wanted too — today the library is executive-only.

**3. The Optimizer.** VERDICT per the AGENTS.md §20 test: NOT a new
principal — a UI FEATURE unifying existing capabilities plus at most
one new judgment on existing principals. Already built and reusable:
Search Health suggestions (#14, gate-honest), coverage analysis
`suggested_next_version` (sourcing), Boolean query regeneration,
positioning narrative improvement (#12 Positioning). A first slice
worth gating: an "Optimize" surface (per-mandate) that fans the
EXISTING suggestion machinery into one panel with one-click apply
where a human act already exists (regenerate queries, redraft spec…).
HARD BOUNDARY for "CV rewriting": presentation polish is the
Positioning Agent's lane and stays ADVISORY — the record (parsed CV,
transcripts, evidence) is never rewritten; no fabrication; the
no-verdict doctrine untouched. Phase 0 should enumerate exactly
which optimizations exist vs which need new judgments.

**4. The copilot — alive, and nameless-ish.** NOT removed: Copilot
Agent is principal #18 (Assist chapter, floating panel
`copilot-panel.tsx`, project-scoped). VERDICT: give the persona a
name — founder suggested "Lulu" or something Mandate-derived
("Mandy" / "Emm" are the obvious M-family candidates). FOUNDER
PICKS THE NAME. Then: UI labels + panel copy (small), and the
founder's call on whether the PRINCIPAL renames too (users.full_name
is the registry join key AND the trail label — a one-statement
rename + registry entry edit + §30-style member event residue;
env vars unchanged). Trail history keeps old actor_label snapshots —
honest, but the feed will show both names across time; say so in
the D-gate.

**5. Kanban board.** VERDICT: split in two, gate separately.
(a) CANDIDATE PIPELINE BOARD — the data exists (candidates.
pipeline_stage, 12-stage CHECK): a per-mandate board with columns =
stages, drag = stage change under the human's session (evented via
existing machinery); moderate UI slice, no migration. (b) WORK
ASSIGNMENT (Agile tasks: assign work, manager view) — a NEW DOMAIN:
tasks table, assignees, status, RLS (org S / assignee+desk U),
desk-page integration, member-facing views; its own migration +
harness + D-gate; do NOT smuggle it into (a). Recommended order:
(a) first — visible value, near-zero risk.

## Recommended order (for the founder to confirm at each gate)

1. **Naming pass (#1 + #4 UI half)** — small, copy-level, one slice,
   one visual drive. Founder must pick the copilot name first.
2. **Kanban (a)** — the pipeline board.
3. **Role-template creator (#2)** — migration 104, D-gated.
4. **Optimizer (#3)** — Phase 0 enumeration first, then its gate.
5. **Kanban (b)** — the task domain, its own gate.
6. Then back to the standing order: THE PRE-LAUNCH CHECKLIST
   (CLAUDE.md — advisor sweep, Turnstile, key rotation, RLS review,
   FK indexes).

Open founder items (surface once, don't nag): Resend dashboard
webhook + RESEND_WEBHOOK_SECRET (+ redeploy); the four Engage
`.env.local` pairs (in prior job reports); exposed Supabase access
token; leaked-password protection (Pro-gated); Turnstile keys (§61);
Stripe parked (LAST); "Capital Markets Investment Bank" rename;
stale-poll refresh on long executive surfaces (§82).

§-drafting doctrine unchanged: verdicts drafted at slice end; NO
completion declaration and NO deletion of this file until the
founder's written confirmation of each slice's §.
