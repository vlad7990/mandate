# NEXT — the role-template creator (product-pass slice three) + the
# candidate_stage_changed rider. Phase 0 CONFIRMED 2026-08-25; this
# file is the D-gate. BUILD GATED on the founder's written
# confirmation of D1–D8. Migration 104. Drive 0f3. Next § 108.

## Phase 0 findings (live reads, 2026-08-25)

1. **The database already permits org-authored templates.** 046's
   live policies: SELECT = global (org IS NULL) + own org under
   can_read_org; INSERT/UPDATE/DELETE = is_org_admin AND
   organization_id NOT NULL — global rows are unwritable by ANYONE.
   056's coherence CHECK `is_global = (organization_id IS NULL)` and
   the tier-paired FKs from executive_searches (ON DELETE NO ACTION
   — a template referenced by any search CANNOT be deleted). Partial
   unique indexes make org-key SHADOWING legal: the same key once
   globally, once per org.
2. **The gap is entirely app-layer**: no creator UI, no server
   actions, no route guard. The templates page renders read-only
   cards; its empty-state copy ("They ship with Mandate… nothing to
   set up here") becomes a LIE the moment authoring lands.
3. **Live rows: 8 global templates / 0 org rows** (the analysis's
   "~25" was the competency library — 24). Seven role families.
   intake_defaults mirrors the executive intake form fields;
   competency_weights is a keyed array resolved against
   executive_competencies at search creation (source: "template",
   weight clamped 0–100, best-effort).
4. **The override rule lives in app code, twice**: searches/new
   page + action resolve by key with `.find(t => t.organization_id
   !== null) ?? candidates[0]` — an org row wins over the global row
   it shadows. The creator makes this rule REACHABLE; nothing new to
   build at the intake — both sets already flow.
5. **No agent reads the table.** Zero hits in src/lib/executive and
   src/lib/ai; templates are a pure human surface. No agent policy
   on the table (live pg_policies). D8 (agent lawfulness) is
   therefore vacuous for the creator half of this slice.
6. **The capability seam already exists**: skills:write's own doc
   comment names "skills, competencies and role templates — they
   change how every search scores" (roles.ts:134-135), held by
   ADMIN ONLY, pinned by tests. 046's header says the same. The
   Skills Studio (/app/settings/skills) is the pattern to mirror:
   page readable, authoring affordances behind CapabilityGate,
   actions behind requireActionContext("skills:write"), write
   routes in ROUTE_RULES.
7. **The name `candidate_stage_changed` already exists** — in the
   EXEC LEDGER's CHECK (executive_audit_events), for stage changes
   on executive candidate links. Different table, same act family.
   Noted as a vocabulary echo, not a conflict; the founder named
   the type in the §106 ruling and it stands.

## The D-gate

**D1 — scope.** Org-authored templates beside the global eight:
create / edit / delete from the templates surface, admin-only.
Global rows untouchable (RLS already refuses; the UI never offers).
No changes to the intake mechanism (finding 4). The Kanban eventing
rider (below) ships in the same migration per the §107 ruling.

**D2 — capability.** skills:write, exactly as the capability's doc
comment promises. Routes: /app/executive-intelligence/templates
stays UNGUARDED (read for every active role, like /candidates);
/templates/new and /templates/[id]/edit enter ROUTE_RULES under
skills:write (the /app/settings/skills/new precedent). Actions:
requireActionContext("skills:write"). The roles.ts LABEL for
skills:write ("Skills studio") starts covering templates — proposal:
label becomes "Skills & templates" (string only, no grant change).

**D3 — migration 104, three parts, one migration.**
  (a) *The rider (ruled §107)*: `candidate_stage_changed` into the
  activity_events CHECK — REBUILT FROM THE LIVE 75-value list
  (pg_constraint read at build time, never the file) + 1 = 76 — and
  into record_activity_event's allowlist, WITH a family gate inside
  the RPC: `IF p_event_type = 'candidate_stage_changed' AND NOT
  can_write_candidates() THEN RAISE insufficient_privilege` — the
  102 skill_% precedent; can_write_candidates() already exists in
  SQL. Grants re-declared (CREATE OR REPLACE resets them).
  (b) *Template trail — RECOMMENDATION, founder decides*: template
  authoring events go to the EXEC LEDGER, not activity_events:
  extend executive_audit_events' CHECK with `template_created /
  template_updated / template_deleted` (search_id is nullable — the
  ledger takes search-less events; recordExecutiveAuditEvent exists;
  the module's acts belong in the module's ledger, and the org-wide
  APP_RECORDABLE_EVENTS pin stays untouched). Detail: template key
  + title + whether it shadows a global key — never the defaults
  text. ALTERNATIVE if the founder prefers the org-wide feed:
  three activity_events types on the skill_* pattern (admin-gated in
  the RPC); costs CHECK 76→79 + the pinned describe.test literal.
  (c) *Authoring columns*: the table predates authoring — no
  created_by, no updated_at trigger (Phase-0 finding). 104 adds
  `created_by uuid REFERENCES public.users(id)` (nullable; the 8
  global seeds stay NULL; the creator action stamps it) and the
  house updated_at trigger. Uniqueness needs nothing — 032's
  partial indexes already enforce global-key and org-key.
**Numbers if (b)-as-recommended: activity CHECK 75→76, exec-ledger
CHECK 30→33, agent allowlist UNTOUCHED at 29.**

**D4 — the creator UI.** Mirror the Skills Studio idiom on the
templates page (terminal grammar; the members idiom for forms):
"New template" (CapabilityGate skills:write) → /templates/new; each
org card gains Edit → /templates/[id]/edit and Delete. Form fields:
title; key (slugified from title, editable; if it equals a global
key the form SAYS "overrides the global template of the same key" —
shadowing is a feature, surfaced, never silent); summary;
role_family (select over the live families + other); intake_defaults
(the executive intake's own fields, optional each); competency
weights (pick from the 24 global competencies, weight 0–100).
Length caps per the §100 precedent. Delete: in-use check first
(count of executive_searches referencing) → refuses with the count
sentence; the FK is the backstop. Update/delete carry .select()
zero-row honesty (§100). The dead empty-state copy and the
dashboard-tile comment are corrected in the same slice.

**D5 — refusal honesty.** No agent, no model call — D5 in its
agent sense is n/a. Server refusals cross as ActionResult values
(house pattern); RLS zero-row landings surface as the honest
sentence, never silent success.

**D6 — the Kanban seam change.** updatePipelineStage gains: read
the current stage first (it already reads nothing — one extra
select by id+project), then after a successful update, ONE
recordActivity call: eventType candidate_stage_changed, projectId,
candidateId, detail {from, to} — stages only, never free text.
describe.ts gains the sentence on the placement_status_changed
shape ("Moved the candidate from X to Y"); ACTIVITY_GROUP_OF maps
it to "mandates"; APP_RECORDABLE_EVENTS grows to 10; the pinned
literal in describe.test.ts is updated DELIBERATELY and its
group-ternary gains the third clause. The empty-detail sentence
must hold (the stage() helper tolerates missing from/to — verify).

**D7 — sample surface.** The templates page already renders for
real orgs only (EI tree). No sample work in this slice; the
pipeline module stays in SAMPLE_MODULES_PENDING.

**D8 — harness + control run.** Invariants (live-read, value-keyed
teardown): (1) recruiter INSERT on templates refused
(insufficient_privilege / zero rows); (2) admin UPDATE of a GLOBAL
row lands ZERO rows (immutability); (3) org insert with
is_global=true refused by the coherence CHECK; (4) delete of a
referenced template refused by FK; (5) the intent door: viewer
calling record_activity_event('candidate_stage_changed') refused by
the new gate; recruiter's call lands; agent door refuses the human
type (record_agent_event allowlist untouched); (6) §42
history-intact COUNT rides the CHECK rebuild (stale-list drift =
vanished events = abort). CONTROL RUN: rebuild the RPC with the
can_write_candidates gate DROPPED → a VIEWER records a forged
stage-change event → INVARIANT-FAIL, self-rolled-back.

## Drive 0f3 (scratch ADMIN operator; all standing traps)

Create an org template via the UI shadowing a global key (e.g. key
cto_seed_saas) → chip "Org", listed beside the eight; searches/new
?template=cto_seed_saas resolves the ORG row (override proven at
the surface); create a search from it → template_id + template_is_
global=false + competency rows source "template"; edit the template
(.select() honesty); delete refused with the in-use sentence; a
second, unreferenced template deletes clean; recruiter session sees
NO authoring affordances and the action refuses; exec ledger
carries template_created/updated/deleted (or the activity feed, per
the D3(b) choice). THE RIDER PROVEN ON THE BOARD: drag a card on
the pipeline Kanban → candidate_stage_changed lands in the trail
under the operator with {from, to}, and the activity feed renders
the sentence — the §106 silence closed. Teardown by ids/values to
the durable baseline (25/24/74/5/5/1/1/2/2/1/1; note the §106
seeding trap — name-only candidates mint network_profiles).

Green gate before commit: tsc / vitest (892 + this slice's tests) /
eslint / next build. Deploy: vercel --prod --yes from the live
repo. § 108 DRAFTED at slice end — no completion declaration;
NEXT-product-pass.md and this file edited/deleted only on the
founder's written confirmation.

Numbers: migration 104 (MCP + numbered file), next § 108, next
drive 0f3. After this slice: Optimizer Phase 0, then the task
domain, then the pre-launch checklist.
