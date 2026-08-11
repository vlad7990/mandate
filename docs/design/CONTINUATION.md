# Continuation prompt — Mandate app redesign

**Purpose.** This file exists so work continues across a `/clear` or a
context reset without re-deriving anything. Paste the block in §1 into a
fresh session and it will pick up exactly where the last one stopped.

**Updated:** 2026-08-11 · `main` @ `0d94879`, pushed. Plus uncommitted
work on Project Detail (page chrome restyled to comp 08) awaiting
approval to commit.

---

## 1. The prompt to paste after `/clear`

Copy everything between the fences.

```
Continue the Mandate app redesign.

Working directory: ~/Documents/Projects/mandate
NOT ~/Mandate Recruiting/mandate — that is a stale clone and committing
there has already caused one real incident. Use
`git -C /Users/vladbreygin/Documents/Projects/mandate <cmd>` for every
git command; the Bash cwd persists between calls.

Read these first, in order:
1. docs/design/CONTINUATION.md — current state and the ordered task list
2. CLAUDE.md — working rules
3. docs/design/SESSION-HANDOFF.md §1 and §5 — environment traps and the
   browser measurement protocol

Then pick up the first unchecked item in CONTINUATION.md §4 and work
through as many as your context allows.

Rules for the session:
- Load the `impeccable` skill before any UI work.
- Green gate before proposing any commit:
  npm test && npx tsc --noEmit && npm run lint && npm run build
- Do NOT commit or push without my explicit approval. Propose the
  message first. This rule is unchanged and applies even when working
  autonomously.
- The comps are art direction, not truth. Counts, prices, agent names
  and limits come from the code and the live schema, never from a comp.
  Where a comp's label outruns the data, use the honest label and say so
  in a comment.
- Sample data is shown only in empty workspaces, always labelled, and is
  never written to the database.

When you reach ~20% remaining context: stop starting new work, update
CONTINUATION.md §3 and §4 with what changed, and tell me where you got
to. Do not begin a screen you cannot finish.

Note: there may be unpushed commits on main. Check with
`git -C /Users/vladbreygin/Documents/Projects/mandate status -sb` before
assuming production reflects the code.
```

---

## 2. What this project is doing

Importing 14 Claude Design comps from project
`f6c4031e-c28e-450f-8ef1-353834d79b78` (read with the `DesignSync` MCP)
into a live Next.js product. Marketing surface is done and deployed. The
authenticated app is partly done.

**Two rules that govern every screen:**

1. **Sample data, not empty states.** Founder decision. Every screen
   renders a worked example when it has nothing real, so a prospect or a
   new user can see how the product works. Implementation:
   `src/lib/sample/`. Ids are prefixed `sample-`; that prefix is the whole
   routing contract, checked *before* any Supabase client is constructed.
   Nothing is ever written to the database.
2. **Non-real data is always labelled.** `SampleBanner` at the top of the
   content region. This is the same discipline the marketing surface
   follows — see `SESSION-HANDOFF.md`.

**The comps do not reconcile with the product.** They are art direction.
Counts, prices, agent names and limits come from `_constants.ts`,
`_data/agents.ts`, `_data/pricing.ts` and the live schema — never from a
comp. Where a comp's label outruns the data, use the honest label and
record why in a comment.

---

## 3. State

| Comp | Route | State |
|---|---|---|
| 06 App Shell | `(dashboard)/layout.tsx` + sidebar/topbar | ✅ done, deployed |
| 07 Executive Dashboard | `/app/home` | ✅ done, deployed |
| 09 Candidate Portfolio | `/app/candidates` | ✅ done, deployed |
| 08 Project Detail | `/app/projects/[id]` | ✅ done — page + all six panels |
| 10 Candidate Detail | `/app/projects/[id]/candidates/[candidateId]` | ✅ tabbed shell · inner cards left |
| 11 EI Workspace | `/app/executive-intelligence/searches/[id]` | ✅ real page restyled |
| 12 EI Report | `…/searches/[id]/candidates/[cid]/report` | ✅ compiles for real searches |

Marketing (`/`, `/platform`, `/executive-intelligence`, `/solutions`,
`/pricing`) is complete and live.

**Almost nothing in the app has been visually verified.** Every
authenticated screen is behind a login the agent does not have. The
build, types and tests are green; nobody has looked at the pixels. This
is the single largest risk in the project right now — the shell is
inherited by every screen, so a mistake in it propagates.

Six screens are exceptions: the EI report, the EI workspace, Project
Detail (page and all six panels) and the Candidate Detail shell. All
were verified at 1440 and 390 — the report also under print emulation —
by temporarily mounting their components on a public route with fixture
data, screenshotting, then deleting the route and reverting
`src/proxy.ts`. **That technique works and is the pattern for the
remaining restyles**: render the presentation component from fixtures
outside `(dashboard)` at a throwaway path, add the path to
`PUBLIC_PAGES`, screenshot, then remove both. Two things to know —
`npm run dev` on :3001 did not pick up `globals.css` changes at all
(stale CSS chunk, unchanged hash), so anything touching global CSS has
to be checked against `npm run build && npx next start`; and deleting
the throwaway route leaves a stale `.next/types/validator.ts` that fails
`tsc` until the next build.

---

## 4. Task list, in order

- [x] **Compile the EI report for real searches.** ✅ 2026-08-11.
      `src/lib/executive/report.ts` compiles the document from the three
      approved records (success profile, interview plan, human-authored
      assessment) joined to the search's current competency weights;
      coverage is recomputed there and a stored rollup is never trusted
      for display. Where the weights have moved since the assessment was
      approved the document says so rather than resolving it silently.
      Section 04 is assembled from the same rollup, so the gaps cannot
      fall out of the document. 13 unit tests in `report.test.ts`.
      Without all three approvals the page shows a gate naming the
      outstanding record. Print is real: `.m-report-doc` rebinds the dark
      theme to ink on paper and the shell hides itself
      (`@media print` at the end of `globals.css`).
      **Still needs a founder pass against a real search** — the
      compilation is tested and the render is verified against fixtures,
      but no real approved chain has been through it.
- [x] **Restyle the real EI Workspace** to comp 11. ✅ 2026-08-11.
      **This established the pattern for the other two restyles:** the
      page splits into `page.tsx` (queries only, assembles a
      `WorkspaceVm`) and `workspace-view.tsx` (presentation, props in).
      That split is what makes an authenticated screen verifiable —
      render the view from fixtures on a throwaway public route, look at
      it, delete the route. Do the same for Project Detail and Candidate
      Detail.
      Departures from the comp, both recorded in the file header: the
      comp's "Risk review" panel describes a capability that does not
      exist, so it is not rendered; every chain count is computed from
      the linked candidates and their plan and assessment rows. Two
      fixes came out of looking at it — weight bars scale to the heaviest
      competency (six weights summing to 100 read as underlines against a
      100% track) and exactly one chain step carries the accent border.
- [x] **Restyle the real Project Detail** to comp 08. ✅ 2026-08-11 —
      **page chrome done; the six client panels are not.** `page.tsx`
      dropped from 1017 to 245 lines and now only queries and assembles a
      `ProjectVm`; `project-view.tsx` owns the pixels. Verified at 1440
      and 390 from fixtures.
      The stage rail is real: nine segments computed from `job_specs`,
      `boolean_queries`, `candidate_scores`, `shortlists.submitted_at`
      and pipeline stages. Three fixes came from looking at it — the
      header actions were `shrink-0` and pushed the page into horizontal
      scroll at 390; nine rail segments truncate to two letters each at
      that width, so narrow screens get the current stage in words and a
      position instead; and "Information required" moved to the left
      column, which balanced the two columns.
      **Still open:** `CandidateSearchPanel` and the four intelligence
      panels render full-width below the grid in the older idiom. Restyle
      them one at a time — they are the rest of this task.

- [x] **Restyle the six client panels on Project Detail.** ✅ 2026-08-11.
      All six sit on `src/components/projects/panel.tsx` (`Panel` /
      `PanelLink` / `PanelMeta` + `PANEL_BUTTON`, `PANEL_BUTTON_QUIET`,
      `PANEL_BODY`). **The whole `/app/projects/[id]` page level is now
      free of Material Symbols ligatures** — `page.tsx`,
      `project-view.tsx` and all six panels. The candidate detail routes
      below it are not; see the ligature task.
      Four defects came out of looking at the bodies, not the shells:
      a fixed 80px topic chip that printed over the detail text next to
      it (client intelligence); `truncate` inside a flex row, whose
      `white-space: nowrap` made the row's min-content the full
      untruncated string and dragged the page into horizontal scroll at
      390 (candidate search); a 🚩 emoji standing in for an icon, which
      renders in the system font and reads aloud as "triangular flag on
      post" (culture); and a `projectTitle` prop that only existed to
      repeat the page's own h1.

- [x] **Restyle the real Candidate Detail** to comp 10. ✅ 2026-08-11 —
      **the shell is done; the inner cards are not.** The page was one
      1336-line scroll with eleven stacked panels. It is now the comp's
      information architecture: `candidate-view.tsx` ("use client", tab
      state only) takes an identity block, a decision rail and five tabs
      as slots — Overview, Evaluation, Triangulation, Positioning, Notes
      & activity — and `page.tsx` still runs every query and renders the
      tab contents server-side. Verified at 1440 and 390.
      The rule from the comp that drove it: reading material is tabbed,
      the write actions never move. Stage and feedback live in a rail
      that is present on every tab; the fit figure sits beside them
      rather than heading the page, because it is a reading of evidence
      and not a verdict.
      The old `TriangulationTabRail` — two anchor links pretending to be
      tabs — is gone; real tabs replace it. Every Material Symbols
      ligature on this page is gone too.
      The cards inside the tabs followed on the same day: every one of
      them — archetype, synthesis, signals, fit, career, domain/scale,
      chips, evaluation-pending — is on the shared `Panel` shell, and
      `page.tsx` has no `<article>` shells and no ligatures left. Two
      more fixes from looking: the career-timeline marker was a 2px
      square with a ring offset and read as a checkbox, and the three
      signal columns each carried a coloured 2px left rule — three
      accent bars competing inside one panel, now carried by the column
      headings.
      **Still open:** the six client panels under this route
      (`recruiter-assessment-panel`, `candidate-intelligence-panel`,
      `triangulation-panel`, `evaluation-report`, `positioning-panel`,
      `psychology-panel`, `candidate-notes-panel`) still carry the older
      idiom. Same shell, same recipe as Project Detail's six.

- [ ] **342 Material Symbols ligatures** → inline SVG from
      `src/components/icons.tsx`. Each currently puts literal text like
      `folder_open` in the DOM and depends on a blocking Google webfont.
      The shell, the EI report and every route under
      `/app/projects/[id]` at page level are converted; the candidate
      detail routes and the other modules are not. Mechanical, safe,
      good filler work when context is short.

---

## 5. Traps that have already cost time

- **`git -C /Users/vladbreygin/Documents/Projects/mandate <cmd>` always.**
  The Bash cwd persists between calls and a stale second clone exists.
  This caused a real wrong-repo commit once.
- **Playwright screenshots land in the stale clone's root**, not this
  repo. Move them to the scratchpad before reading.
- **A passing geometry assertion is not a passing render.** The nav
  breakpoint bug passed three numeric checks — `scrollWidth`,
  `clientWidth`, element height — while visibly rendering as two ragged
  rows, because the labels wrapped inside a fixed `min-height`.
  Screenshot it.
- **`tsc` false errors after moving a route** — stale `.next/types`, and
  `" 2"`-suffixed duplicate files. `find .next -name "* [0-9].*" -delete`
  fixes the latter without killing a running dev server.
- **`setState` inside a `setOpen` updater** — React may run an updater
  twice. Let unmount reset child state instead.
- **JSX strips whitespace containing a newline** between a text node and
  an adjacent expression. Put the trailing space inside the literal.
- **New marketing routes must be added to `PUBLIC_PAGES` in
  `src/proxy.ts`** or they 302 to sign-in and look undeployed.
- **`npm run dev` served a stale `globals.css`** — the CSS chunk hash
  never changed after an edit and a new `@media print` block simply was
  not in the served stylesheet, while the same block was present in the
  production build. Verify anything touching global CSS against
  `npm run build && npx next start`, not the dev server.
- **Rebinding `--accent` does not repaint `bg-primary`.** `.dark`
  declares `--primary: var(--accent)`, and CSS substitutes a `var()` at
  the element that *declares* it — so the indirection resolves to the
  dark accent at `:root` and inherits down as a fixed colour. A scoped
  theme override has to set both. The `@theme inline` aliases
  (`--color-on-surface` → `var(--fg)`) do not have this problem.
- **`redirects()` in `next.config.ts`**: the `/executive-intelligence`
  entry uses `:path+` not `:path*` on purpose — the bare path is the
  marketing page. Do not "tidy" that asymmetry.

---

## 6. Open items that need the founder, not an agent

- **Visual review of the app.** Sign in and look at `/app/home` and
  `/app/projects/sample-larkspur`.
- **`redirect(next)` in `signInAction`** — the last hop of the deep-link
  flow. Verified by unit test, never executed; needs a real account.
- **Two unbacked claims live on `/pricing`** — "agent runs are not
  metered" and the cancellation retention promise. Both came from the
  comps; neither has a billing system or a policy behind it.
- **The EI add-on price** — still blocks the billing build.
