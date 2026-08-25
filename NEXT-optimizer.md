# NEXT — the Optimizer (product-pass slice four). Phase 0 COMPLETE
# 2026-08-25; this file is the D-gate. BUILD GATED on the founder's
# written confirmation of D1–D8. Expected ZERO migration. Drive 0f4.
# Next § 110.

## Phase 0 findings (code inventory, 2026-08-25)

1. **The seam was pre-drawn.** `HealthSuggestion.applicable_payload`
   (search-health-agent.ts) documents BOTH apply contracts — sourcing
   `{replacement}` and calibration `{delta}` — but only sourcing was
   ever wired (`applySourcingSuggestionAction`, the codebase's one
   true one-click apply). Calibration/feedback/outreach/other render
   as text with a Dismiss button. Closing that gap is finishing an
   intended seam, not inventing one.
2. **Reusable one-click acts already exist**: apply-sourcing (direct
   insert, no AI spend), coverage "Create vN from this"
   (`createSourcingRunAction` — a BRANCH with prose rationale, not a
   Boolean rewrite; the label must stay honest about that),
   `generateAllAction` (refuses if rows exist), target-companies
   append, and `requestRegenerate(projectId)` for the spec (NEVER
   from a render path; async, idempotent, "regenerating" is the
   honest state).
3. **The one genuinely new act** (§103 allowed "at most one new
   judgment"): applying a CALIBRATION suggestion. `applyRecalibration`
   exists but demands a `FeedbackInterpretation` + real feedbackId;
   a health suggestion carries `{applicable_dimension, delta}`.
   Bridging is new — and it is the FIRST DESTRUCTIVE IN-PLACE WRITE
   in the apply family (weights change + every candidate re-scores).
   Every other apply is append-only or overlay-only. That asymmetry
   is the slice's real design decision.
4. Rule-based `HealthAlert[]` (no_activity_7d etc.) are honest
   signal rows with nothing to click — advisory by nature.
   `regenerateOneAction` needs a human-authored feedback string —
   synthesizing one would be a new judgment; NOT taken. Positioning
   stays fully advisory (its artifact IS the deliverable; the
   `positioning_kit` overlay never touches CV facts). The coverage
   dimension enum is deliberately CLOSED (no demographic aperture) —
   the Optimizer re-renders findings verbatim, never widens it.
   The Copilot already reads the suggestions blob — the Optimizer is
   the acting surface, Mandy stays the talking one.

## The D-gate

**D1 — scope.** A per-mandate OPTIMIZE surface:
`/app/projects/[id]/optimize`, module strip entry after Metrics.
One page, terminal grammar, three bands: (a) the health-suggestions
panel (same component, all five categories, gate-honest); (b) the
latest executed run's coverage findings + suggested next version
with the existing branch act; (c) quick acts that already exist
(spec regenerate where lawful, generate-all where empty). NOT a
principal; NO new event vocabulary — every applied act records
through its own existing machinery under its own name.

**D2 — the one new act.** `applyCalibrationSuggestionAction(
projectId, suggestionId)`: validates the suggestion is
calibration-category with a bounded integer delta on a known
dimension; adjusts `calibration_model.dimension_weights` within
[0,10]; re-runs `computeAndStoreScores`; writes the
calibration_history snapshot; auto-dismisses the suggestion.
PROVENANCE RULING FOR THE FOUNDER: the click is the HUMAN's
decision — the snapshot and the trail face are the recruiter's
(the suggestion is advisory input, named in the rationale with its
id and delta); NO synthetic feedback row is minted. NEVER
one-click-blind: a preview (before → after weights, the panel's
existing `<details>` precedent) plus a confirm that SAYS "re-scores
every candidate in this search". The pure bridge
(suggestion → bounded weight change) lives in a lib module with
unit proofs: zero/oversized delta refused, unknown dimension
refused, bounds clamp, no-baseline refusal mirrors
applyRecalibration's skip.

**D3 — zero migration expected.** Weights live on
`projects.calibration_model` (human-writable today);
calibration_history's human write path is verified against LIVE
pg_policies at build start — if RLS refuses the human snapshot,
STOP and re-gate (no silent migration rides this slice).

**D4 — boundaries restated.** The record is never rewritten; the
no-verdict doctrine untouched; suggestions never auto-apply; a
HEALTHY mandate gets the honest healthy state on the Optimize page
(the page exists, says the search is healthy, offers Refresh —
never a bare empty state), matching the agent's own
refuse-before-spend gate.

**D5 — refusal honesty.** `throwUnlessReady`'s states surface
verbatim (no_final_spec, already_generated); the spec act shows
"regenerating" and polls nothing new; every action crosses as an
ActionResult value through `unwrap`.

**D6 — no demolition.** The hub and metrics panels stay exactly
where they are; the Optimize page composes, it does not relocate.

**D7 — sample.** New module route → `SAMPLE_MODULES_PENDING` +
`isSampleId` → `SampleNotBuilt` (the pipeline precedent; the
enumerate-the-routes test forces both).

**D8 — proofs.** No new SQL doors → no new DB harness; the control
weight sits in vitest on the bridge function (the refusal faces)
plus the drive. Drive 0f4 (scratch operator, all standing traps):
seed a STALLED mandate (spec final, queries, stale candidates) →
generate suggestions → apply a SOURCING one (existing act: new
query version lands, suggestion dismissed) → apply a CALIBRATION
one (preview shown → confirm → weights changed within bounds +
re-score ran + history snapshot under the HUMAN + dismissed) →
advisory categories show Dismiss only → coverage branch act labelled
as a branch → healthy-mandate face honest → teardown by ids/values
(the §108 traps: the intake auto-context event does not apply here —
no executive rows; name-only candidates mint network_profiles —
sweep them). §110 verdicts DRAFTED at slice end; no completion
declaration; this file and NEXT-product-pass.md edited/deleted only
on the founder's written word.

Numbers: NO migration expected (106 stays next), next § 110, next
drive 0f4, vitest 893 + this slice's bridge tests. After this
slice: Kanban (b) the task domain, then the pre-launch checklist.
