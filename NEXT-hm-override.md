# NEXT — the HM override selector

The §49/§50 standing gap, picked by the founder 2026-08-24 after §69.
**Phase 0 complete 2026-08-24. D1–D8 DRAFTED below — the build is
GATED on the founder's written confirmation. Nothing past Phase 0 has
been touched.**

## The gap, as recorded

§49 (confirmed §50): `researchHiringManagerAction` accepts a
stakeholder-name override the UI never passes — the first stakeholder
is always researched. A mandate with three stakeholders can never get
a dossier on the second or third.

## Phase 0 — what reconnaissance found (read-only)

1. **The seam already decided the shape.** The override validates BY
   NAME against the project's own stakeholders, case-insensitively; a
   name not on the list refuses with an authored sentence
   ("Stakeholder "X" not found in this project") — free text was
   never the design (`run-hiring-manager-research.ts:215–229`). The
   trail already carries `stakeholder_override` (boolean, name never
   in the trail); §49's drive proved only its FALSE face — the true
   face has never run live.
2. **The panel receives one name.** `page.tsx` computes
   `primaryStakeholder` and hands the panel `hmName`/`hmRole` — the
   first valid stakeholder only. The panel's meta line shows that
   name even when the STORED report covers someone else.
3. **The report knows its subject.** `hm_name` sits on
   `HiringManagerIntelligenceReport` with a comment saying it exists
   precisely to keep the report attributable when stakeholders
   change — currently rendered nowhere.
4. **One report slot.** `hm_intelligence` is one key on the
   company-context merge-write: a run for another stakeholder
   REPLACES the report. That is the §49-era design, unchanged here.
5. **Stakeholders come from onboarding** (`onboarding_responses.
   stakeholders`: name/role/focus), already filtered for validity in
   the seam and reusable as-is for the selector's options.

## D1–D8 — drafted, for the founder to confirm

- **D1 — A UI-threading slice, nothing deeper.** No migration
  (counter stays 091), no grants, no seam change, no new vocabulary:
  the server boundary is already built and proven refusing; this
  slice gives it the surface it was built for.
- **D2 — The selector appears only when there is a choice.** The
  page threads the FULL valid stakeholder list (name + role) into
  the panel. With 2+ stakeholders, a house-styled select sits beside
  the Research button, defaulting to the stored report's subject
  when it matches a stakeholder, else the first. With 0 or 1, the
  panel renders byte-identical to today.
- **D3 — The trail's `stakeholder_override` keeps its meaning.** The
  action receives the name ONLY when the selection differs from the
  first stakeholder — override:true stays "the recruiter chose",
  the default run keeps its recorded false face.
- **D4 — The one-slot report stands; legibility instead of
  storage.** The panel's meta line names the REPORT's subject
  (`report.hm_name` — rendered at last), and the empty-state
  sentence names the SELECTED target, so a replacement is a legible
  act, not a surprise. No dossier-per-stakeholder storage in this
  slice.
- **D5 — Sentences unchanged, nothing destroyed.** A selected name
  that has since been renamed in onboarding surfaces the seam's
  existing "not found" sentence in the existing toast; the
  suspension refusal sentence and the merge-write's
  sibling-preserving shape stay untouched.
- **D6 — Surfaces: the HM panel and its page threading only.**
  `primaryStakeholder` remains for the default; no other panel
  changes.
- **D7 — Removable.** No principal, no kill switch, no env; dropping
  the selector prop restores today's behaviour exactly.
- **D8 — Deferred, recorded.** Per-stakeholder dossier STORAGE
  (multiple slots, a picker over stored reports) waits on usage;
  today's one-slot replace with a named subject is honest and cheap.

## The phases

- **Phase 0** — this document. ✓ 2026-08-24, read-only.
- **Phase 1** — build: thread stakeholders through the vm; the
  selector; the meta line's subject; a small pure helper
  (`overrideFor(selected, stakeholders)`) carrying the D3 rule.
- **Phase 2** — test: the D3 rule pinned (default → undefined,
  chosen → name, single-stakeholder → undefined); green gate (tsc /
  vitest 815 baseline / eslint / build).
- **Phase 3** — deploy; drive 0e4 live: a scratch project with TWO
  stakeholders — research the default (trail: override false),
  select the second and research (trail: override TRUE — the face
  §49 never drove; the report's subject flips on the panel), and the
  stale-name refusal by sentence. ~2 web-research runs (~140s,
  the product's longest — §49 precedent). Teardown on scratch keys.
- **Phase 4** — §71 verdicts drafted; completion declaration and
  this file's deletion ONLY on the founder's written confirmation.

## Numbers

Migration counter stays **091** (no migration). Next drive prefix
**0e4**. Next handoff § is **71** (70 records §69's confirmation).
