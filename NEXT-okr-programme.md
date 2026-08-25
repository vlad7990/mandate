# NEXT — the OKR/KPI programme (founder's brief, tabled 2026-08-25
# at §113; takes the slot AHEAD of the pre-launch checklist).
# This is the BRIEF, not the gate: Phase 0 analyzes, the D-gate is
# drafted with named rulings, and BUILD waits on the founder's
# written confirmation of the DRAFTED gate (§112's process
# precedent: no pre-draft confirmations attach).
#
# SLICE ONE (Recruiter/Manager) DONE — §114 confirmed 2026-08-25
# (migration 107, /app/objectives, Analytics + Placements, drive
# 0f6; gate: docs/superpowers/specs/2026-08-25-okr-kpi-design.md).
# SLICE TWO (Researcher) DONE — §116 confirmed 2026-08-25
# (migration 108, the D3 double refusal, placements_sourced, drive
# 0f7; gate: docs/superpowers/specs/2026-08-25-okr-researcher-gate.md).
# SLICE THREE (Viewer) DONE — §118 confirmed 2026-08-25
# (verification-only: the read positive pinned, drive 0f8's boundary
# probe; gate: docs/superpowers/specs/2026-08-25-okr-viewer-gate.md).
# NEXT: the EXTERNALS slice — the programme's LAST gate. This file
# stands until the whole programme closes.

## The founder's words (2026-08-25)

A component allowing RECRUITERS and MANAGERS to set up OKRs and
KPIs — financial, quantitative and qualitative — to measure
performance and delivery. Tied to the Kanban board (the pipeline
data), with metrics created for tracking. Financial metrics join
the PLACEMENTS page; the other metrics enhance the current
ANALYTICS page. The whole enables STRATEGY creation. Then the same
for EACH persona we have created EXCEPT the Admin(s), whose role is
technical support only.

## Phase 0 must map (next session)

1. The persona roster and their surfaces (memory: seven persona-
   scoped surfaces §-history; externals are token/portal-scoped —
   what an OKR means for HM/client/candidate personas is a REAL
   D-question, not an assumption).
2. The metrics machinery that already exists: computePortfolioMetrics
   / computeProjectHealth / computePipelineMetrics, the Analytics
   page structure, the Placements/fees domain (fees:read gating!),
   the desk rollup, candidate_stage_changed (106-era) as the
   pipeline-movement event stream the Kanban ties to.
3. The task domain (106) as the nearest new-domain precedent
   (RLS shapes, guard triggers, vocabulary riders).
4. What "qualitative" metrics can honestly be in this product
   (no-verdict doctrine: nothing scores a PERSON as an OKR).

## Known boundaries to carry into the gate

- fees:read gates money today — financial OKRs on Placements must
  not widen who sees fees.
- The no-verdict doctrine is untouchable: OKRs measure searches,
  desks and delivery, never candidates as people.
- Admins excluded BY THE BRIEF; agents excluded by doctrine
  (principals hold no goals; they are judged by the trail).
- Per-persona rollout is SLICED — one persona per gate, the
  Recruiter/Manager slice first.

Numbers at tabling: next migration 107, next § 114, next drive 0f6,
vitest 904; durable baseline 25 users / 24 agents / 74 events / 5
skills / 5 skill_versions / 1 network_profile / 1 org_comms_policy
/ 2 projects / 2 clients / 1 candidate / 1 job_spec / 0 tasks;
agent allowlist 29, activity CHECK 78, intent door 12. After this
programme: THE PRE-LAUNCH CHECKLIST (standing order, CLAUDE.md).
