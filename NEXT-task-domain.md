# NEXT — the task domain (product-pass slice five, Kanban (b)).
# Phase 0 COMPLETE 2026-08-25; this file is the D-gate. BUILD GATED
# on the founder's written confirmation of D1–D8 AND the four named
# rulings. Migration 106. Drive 0f5. Next § 112.

## Phase 0 findings (code + live reads, 2026-08-25)

1. **The desk is the natural home and the machinery is ready.** The
   desk page (desk:manage; per-recruiter rollup, mandates-by-lead
   with ReassignControl, digest panel) has no work concept beyond
   mandate count. `loadDeskRollup` is the SINGLE shared source for
   the page AND the digest ("the screen and the digest can never
   disagree about a count") — tasks slot in as a sixth query and
   land in both for free.
2. **The 064 lead-recruiter pattern is the template end to end**:
   nullable assignee ("an unassigned mandate is a real state, not
   an error"), a guard trigger enforcing what RLS cannot
   (column-level rules; the assignee must be an ACTIVE staff role),
   labels snapshotted at write time so the trail survives renames,
   and the app-recordable event (mandate_reassigned) with
   from/to ids + labels. `can_manage_desk()` exists in SQL and is
   COALESCED (the 064 comment: it is read negated by a trigger, and
   NOT NULL is NULL — any new predicate a trigger negates must be
   coalesced the same way).
3. **The RLS shape to mirror is 097** (org-wide SELECT on
   can_read_org; UPDATE with a user-column pin in WITH CHECK — "no
   human signs another's name"). The 087 actor-pin and the
   double-pinned-both-faces idiom cover the completion column.
4. **NEEDS_YOU is real and is the member-facing join point**
   (action-queue.ts): its two rules — every item is an ACTION, and
   legal obligations outrank convenience — a task row satisfies by
   construction. Constraint found: ActionItem is project-scoped
   (non-null project_id/title); a project-less task requires the
   type widened. The 053 precedent argues for nullable real FKs
   over polymorphic pairs.
5. **Vocabulary**: activity CHECK at 76 (rebuild from pg_constraint,
   never files — the 104 arithmetic note), intent-door allowlist at
   10, family gating inside the RPC is the idiom, CREATE OR REPLACE
   resets grants. manager_desk_invariants.sql (14 assertions incl.
   the predicate truth table that caught the coalesce bug) is the
   harness template. Read 057_author_in_org.sql before writing the
   migration (guard_author_in_org variadic attach).

## THE FOUR RULINGS (the founder's word, named)

**R1 — who can be assigned.** RECOMMEND admin | manager | recruiter
| researcher (= the can_write_candidates set; researchers do
sourcing and evaluation work). The narrower alternative mirrors
mandate leads (no researcher). Externals and agents never.

**R2 — project scoping.** RECOMMEND `project_id uuid NULL
REFERENCES projects(id) ON DELETE CASCADE` (the 053 nullable-real-
FK precedent; "chase the reference" and "renew the LinkedIn seat"
are real desk work), which obliges widening ActionItem to a
nullable project with a desk-facing href. The alternative (project
required) keeps ActionItem untouched and loses project-less work.
NO candidate_id in v1 — it drags erasure semantics into the domain
for no confirmed need.

**R3 — deletion.** RECOMMEND no DELETE policy for anyone:
`cancelled` is the human walk-away and a task row is a record of
work asked for (the append-only house instinct). Alternative: desk
hard-delete.

**R4 — who creates.** RECOMMEND desk-only in v1 (INSERT under
can_manage_desk; a member's self-created todo list is a different
feature, deferred with self-claim). Alternative: any staff
self-assign at birth (the 064 trigger's self-claim arm is the
model if wanted later).

## The D-gate

**D1 — scope.** Migration 106 = the `tasks` table + RLS + guard
trigger + vocabulary. Surfaces: the desk page gains a Tasks section
(create/assign/cancel/complete, per-member open counts in the
rollup table); /app/home gains a MY TASKS panel (open tasks
assigned to me, Complete button) and the action queue gains
task_overdue / task_due kinds under its own rules; the desk digest
input gains per-member open/overdue task counts through the shared
rollup. NO new principal; NO agent read of tasks in v1 (Scout-era
question); NO per-mandate task board (nothing smuggled from (a)).

**D2 — schema** (org conventions verbatim): id / organization_id
NOT NULL CASCADE / project_id per R2 / title NOT NULL (caps: 140) /
detail text ('' default, cap 1000) / status CHECK
('open','done','cancelled') DEFAULT 'open' / due_on date NULL /
assignee_id uuid NULL REFERENCES users (unassigned is a real
state) / created_by uuid NOT NULL REFERENCES users / completed_at
timestamptz NULL / completed_by uuid NULL REFERENCES users /
created_at, updated_at (app-stamped). COHERENCE CHECKs: (status =
'done') = (completed_at IS NOT NULL) AND (status = 'done') =
(completed_by IS NOT NULL). Indexes: (organization_id, assignee_id,
status), (organization_id, project_id).

**D3 — RLS + trigger.** SELECT: org + can_read_org (097 shape).
INSERT: org + can_manage_desk, created_by PINNED to auth.uid() in
WITH CHECK (087). UPDATE both faces: org + (can_manage_desk OR
assignee_id = auth.uid()); WITH CHECK additionally pins completed_by
— when set it must equal auth.uid() (no one signs another's
completion). NO DELETE per R3. `guard_task_assignee_changes()` on
the 064 model: the assignee, when set, must be an ACTIVE member of
the R1 set; only can_manage_desk may set or change assignee_id
(the completing assignee touches status/completed_*, never the
assignment); predicates coalesced (the 064 lesson). Agents: no
policies — invisible.

**D4 — vocabulary.** task_assigned + task_completed, app-recordable
(CHECK rebuilt from the LIVE 76 → 78; allowlist 10 → 12; grants
re-declared). RPC family gates: task_assigned requires
can_manage_desk; task_completed requires can_read_org (the actor
stamp carries identity; the RLS pin already proved the right).
Detail contracts: task_assigned {task_title, to_user_id, to_label,
project_id?} with labels snapshotted at write time (the 064
precedent); task_completed {task_title, project_id?} — titles are
operational, never candidate judgments. describe.ts cases,
ACTIVITY_GROUP_OF → "mandates", APP_RECORDABLE_EVENTS 10 → 12, the
pinned describe.test literal + its group ternary gain the task_
clause — all edited deliberately.

**D5 — refusal honesty.** ActionResult values throughout; .select()
zero-row honesty on update/complete/cancel; the trigger's refusal
sentences surface verbatim; a cancelled task's row says cancelled —
it does not vanish.

**D6 — the desk and the digest.** loadDeskRollup gains the tasks
query; MemberDesk gains openTasks/overdueTasks; the desk table gains
the column; DeskDigestInput gains open_tasks + overdue_tasks per
member (additive fields on the existing seam — the digest agent may
name idle-desk-with-overdue-work; no prompt rewrite in this slice).

**D7 — samples and routes.** No new routes (desk and home exist) —
the routes tests are untouched. The MY TASKS panel renders an
honest empty state ("Nothing assigned to you"); sample mode on
/app/home keeps its existing fallbacks.

**D8 — proofs.** Harness task_invariants.sql on the
manager_desk_invariants template (rolled back): (1) desk creates +
assigns — lands, created_by pinned, assignee validated; (2) a
recruiter's INSERT refused; (3) the assignee completes their own —
lands, completed_by pinned; (4) a NON-assignee non-desk recruiter's
update refused; (5) forged completed_by refused by WITH CHECK; (6)
assigning a viewer / suspended member / agent refused by the
trigger BY NAME; (7) the intent door: task_assigned refused for
non-desk, task_completed lands for the assignee, the agent door
refuses both; (8) §42 exact counts. CONTROL RUN: the
assignee-or-desk conjunct dropped from UPDATE USING → a third
recruiter completes someone else's task → INVARIANT-FAIL,
self-rolled-back. Drive 0f5 (scratch desk manager + scratch
recruiter): create/assign with the event + labels; MY TASKS shows
it; an overdue task enters NEEDS_YOU as an action row; the assignee
completes (event; desk counts move); a cancelled task stays
visible saying so; teardown by ids/values (member events ×2 sets,
the standing seeding traps). § 112 verdicts DRAFTED at slice end —
no completion declaration; this file and NEXT-product-pass.md
edited/deleted only on the founder's written word.

Numbers: migration 106 (MCP + numbered file), next § 112, next
drive 0f5, CHECK 76→78, allowlist 10→12, vitest 901 + this slice's
tests. After this slice: THE PRE-LAUNCH CHECKLIST (the standing
order).
