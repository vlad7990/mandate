# Continuation prompt — Mandate app redesign

**Purpose.** This file exists so work continues across a `/clear` or a
context reset without re-deriving anything. Paste the block in §1 into a
fresh session and it will pick up exactly where the last one stopped.

**Updated:** 2026-08-12 · `main` @ `2835366`, pushed. **Working tree is
NOT clean** — 35 modified files from the ligature sweep are staged for a
commit the founder has not yet approved. See §3a.

**All seven app comps are now on their real routes.** What is left is
one mechanical item (§4) and two things only the founder can do (§6).

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
| 10 Candidate Detail | `/app/projects/[id]/candidates/[candidateId]` | ✅ done — tabs, cards and panels |
| 11 EI Workspace | `/app/executive-intelligence/searches/[id]` | ✅ real page restyled |
| 12 EI Report | `…/searches/[id]/candidates/[cid]/report` | ✅ compiles for real searches |

Marketing (`/`, `/platform`, `/executive-intelligence`, `/solutions`,
`/pricing`) is complete and live.

### What shipped on 2026-08-11

Eleven commits, `b634b21..2835366`, all pushed:

| Commit | What |
|---|---|
| `31d35b3` | EI report compiles from three approved records |
| `eb60bc8` | EI workspace restyled to comp 11 |
| `eb967b3` | Project Detail page chrome to comp 08 |
| `7527178` | Shared `Panel` shell + first two Project Detail panels |
| `6f40454` | Remaining four Project Detail panels |
| `4707a12` | Candidate dossier → five tabs + decision rail |
| `de22ed2` | Candidate dossier's cards onto the shell |
| `b643d44` | Candidate route's seven client panels onto the shell |
| `709a77d` | Ligatures out of the candidate route and both auth pages |
| `2835366` | Ligatures out of the copilot panel |

Two pieces of shared infrastructure came out of it and both are worth
knowing about before touching any screen:

- **`src/components/projects/panel.tsx`** — `Panel` / `PanelLink` /
  `PanelMeta`, plus `PANEL_BUTTON`, `PANEL_BUTTON_QUIET` and
  `PANEL_BODY`. No `"use client"`, so a server-rendered card and a
  stateful agent panel render from the same shell. Every panel on
  Project Detail and Candidate Detail is on it. Put new ones on it too.
- **The view/page split.** Each restyled screen is `page.tsx` (queries
  only, assembles a view model) plus a `*-view.tsx` that takes props.
  That is what makes an authenticated screen verifiable at all — see
  below.

### 3a. Uncommitted: the ligature sweep, 2026-08-12

**126 of 260 ligatures converted. 134 remain. Nothing is committed.**
The green gate passes on the working tree as it stands: `npm test` (66),
`npx tsc --noEmit`, `npm run lint` (2 pre-existing warnings, both the
Material Symbols `<link>` in `layout.tsx` — they clear when the last
ligature goes), `npm run build`.

Modules converted, in the order they were done:

| Module | Files | Sites |
|---|---|---|
| Spec | editor, empty, error, generating, diff panel | 29 |
| Onboarding | `onboarding-wizard.tsx` | 14 |
| Shortlist | `shortlist-builder.tsx` | 12 |
| Shared primitives | `MastHead`, `StatusChip`, `KpiTile`, `TierComparison`, `agent-tiles` + every call site | ~30 |
| Comparison | export-actions, master-table, page | 15 |
| Reports | report-actions-client, page | 11 |
| Feedback + HM | feedback page/form, HM form, portal, share-link | 15 |
| Ranking | page, leaderboard, movement, refresh, compare page + picker | 24 |

`src/components/icons.tsx` now carries **60** drawn icons, up from 31.
All 29 new ones were rendered on a throwaway `/iconsheet-tmp` route at
32/16/12px and read correctly at every size; the route and the
`PUBLIC_PAGES` entry were deleted afterwards.

**Three deletions worth knowing about, because they changed component
APIs rather than swapping a glyph:**

- **`MastHead` lost its `icon` prop entirely.** In all 21 call sites the
  glyph sat immediately beside an explicit uppercase label in the same
  chip — "Profile Summary" next to a person, "Final Verdict" next to a
  gavel. The label was already the whole message. Removing the prop also
  deleted `SKILL_TYPE_META.icon` and the `icon` pass-through on the local
  `Section` wrapper in `comparison/page.tsx`.
- **`StatusChip.icon` is now a component**, not a ligature string:
  `icon?: (props: IconProps) => React.ReactElement`. Its glyphs carry
  direction (ahead / behind / even), so they stayed.
- **`SectionDef.icon`, `AgentTileDef.icon` and `Perspective.icon` are
  gone** from `job-spec-analysis.ts`, `agent-tiles.tsx` and
  `perspective-leaderboard.tsx` — each printed a glyph next to
  `# OVERVIEW`, `INTAKE`, `CALIBRATED` and so on.

Two glyph choices deviate from a literal translation, both commented at
the site: `TierComparison` now draws one `IconCompare` for both the
agree and disagree states (the two ligatures drew nearly the same thing;
disagreement is carried by the tertiary colour), and the onboarding
"Encryption Active" notice uses `IconShield` rather than the approval
rosette `verified` printed.

### Visual verification: what has been seen, and what has not

**No authenticated screen has been seen behind a login.** The agent has
no session. Twelve screens have been verified another way: mount the
presentation component on a throwaway public route with fixture data,
add the path to `PUBLIC_PAGES` in `src/proxy.ts`, screenshot at 1440 and
390, then delete the route and `git checkout -- src/proxy.ts`.

That technique works and found nine real defects this session. **Use it
for every screen you restyle.** Three things about it:

- `npm run dev` on :3001 did **not** pick up `globals.css` changes at
  all — stale CSS chunk, unchanged hash. Anything touching global CSS
  has to be checked against `npm run build && npx next start`.
- Deleting the throwaway route leaves a stale `.next/types/validator.ts`
  that fails `tsc` until the next build. Run the build, then `tsc`.
- It proves the components render. It does **not** prove the dashboard
  shell behaves around them, which is why §6 still asks for a sign-in.

The defects it caught, as a list of what to look for:

1. `truncate` inside a flex row sets `white-space: nowrap`, so the row's
   min-content becomes the full untruncated string — one candidate list
   forced the whole page to 621px inside a 375px viewport.
2. A fixed-width chip (`80px`) printing on top of the text beside it.
3. `bg-primary` still printing blue after a scoped theme override,
   because `.dark` declares `--primary: var(--accent)` and CSS
   substitutes a `var()` at the element that *declares* it.
4. Header actions marked `shrink-0` pushing the page into horizontal
   scroll at 390.
5. Nine stage-rail segments truncating to two letters each at 390.
6. Emoji and ✓/✗ standing in for icons, in four separate places.
7. Coloured 2px left borders as a panel's whole visual treatment, in
   five places.
8. A 2px square with a ring offset reading as a checkbox.
9. Three accent borders competing in one chain, pointing nowhere.

---

## 4. Task list, in order

### Open

- [ ] **134 Material Symbols ligatures left** → inline SVG from
      `src/components/icons.tsx`. Each currently puts literal text like
      `folder_open` in the DOM and depends on a blocking Google webfont.
      Recipe unchanged: match the ligature to an existing icon, drop it
      entirely when the label beside it already says the same thing, and
      delete the now-unused `icon` props the components carried. With 60
      drawn icons in place, nearly every remaining ligature maps to one
      that already exists.

      Already done: app shell + copilot panel, EI report, every
      `/app/projects/[id]` route at page level, the candidate detail
      route, both auth pages (all committed) — plus spec, onboarding,
      shortlist, shared primitives, comparison, reports, feedback + HM
      and ranking (**uncommitted, see §3a**).

      What is left, largest first:

      | Module | Sites |
      |---|---|
      | EI success-profile (editor 8, error 3, empty 3, generating 2) | 16 |
      | EI interview-plan (editor 6, gate 3, error 3, empty 3, generating 1) | 16 |
      | Settings (page 6, skills page 4, skill-form 4, skill-row 3, user-actions 2, waitlist 1) | 20 |
      | Sourcing (editor 6, strategy 5, empty 3, version-history 3) | 17 |
      | Projects misc (candidates page 6, upload-form 4, metrics 4, new 3, restore-button 1) | 18 |
      | Candidates top-level (search 5, add-to-search 4, network-table 2) | 11 |
      | EI assessment (editor 4, gate 3, empty 3) | 10 |
      | EI index pages (searches 3, page 3, new 2+2, templates 2, link-controls 2, competencies 1) | 15 |
      | Long tail (analytics 3, hm/[token] 1, auth/pending 1, company-context-controls 1) | 6 |

      **The last two steps, once the count reaches zero:** delete the
      Material Symbols `<link>` in `src/app/layout.tsx` (line ~101 — it
      is the sole cause of the two standing lint warnings) and drop the
      `.material-symbols-outlined` rule in `src/app/globals.css`. Do not
      do either before the count is zero; the remaining ligatures would
      render as raw words.

### Done 2026-08-11 — details in §3

- [x] EI report compiles from approved records (`31d35b3`). Coverage is
      recomputed in `src/lib/executive/report.ts`, never read from the
      rollup stored on the assessment; weight drift since approval is
      stated in the document rather than resolved silently; section 04
      is assembled from the same rollup so the gaps cannot fall out.
      13 unit tests in `report.test.ts`. **Needs a founder pass against
      a real search — see §6.**
- [x] EI workspace restyled to comp 11 (`eb60bc8`). Comp's "Risk review"
      panel is deliberately absent: it describes a capability that does
      not exist.
- [x] Project Detail — page chrome and all six client panels
      (`eb967b3`, `7527178`, `6f40454`). Stage rail is computed from
      `job_specs`, `boolean_queries`, `candidate_scores`,
      `shortlists.submitted_at` and pipeline stages.
- [x] Candidate Detail — five tabs, decision rail, cards and all seven
      client panels (`4707a12`, `de22ed2`, `b643d44`). Reading material
      is tabbed; stage and feedback never move.

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
- **A `_`-prefixed folder under `src/app/` is not a route.** Next.js
  treats it as a private folder. The throwaway verification route has to
  be named something like `iconsheet-tmp`, not `__iconsheet`, or it 404s
  after a clean build and looks like a proxy problem.
- **`redirects()` in `next.config.ts`**: the `/executive-intelligence`
  entry uses `:path+` not `:path*` on purpose — the bare path is the
  marketing page. Do not "tidy" that asymmetry.

---

## 6. Open items that need the founder, not an agent

The first two block trusting the work; the rest block launch.

- 🔴 **Walk one real search end to end and read the compiled EI report.**
  Profile → interview plan → assessment, all three approved, then open
  `…/candidates/[cid]/report`. The compiler is unit-tested and the
  render is verified against fixtures, but no real approved chain has
  been through it and **this document goes to a client**.
- 🔴 **Sign in and look at the app.** Twelve screens are verified from
  fixtures at 1440 and 390; none has been seen inside the real
  dashboard shell, with real data, behind a login. Start at `/app/home`,
  `/app/projects/sample-larkspur`, then a real mandate and a real
  candidate. This is the largest untested surface in the project.
- **`redirect(next)` in `signInAction`** — the last hop of the deep-link
  flow. Verified by unit test, never executed; needs a real account.
- **Two unbacked claims live on `/pricing`** — "agent runs are not
  metered" and the cancellation retention promise. Both came from the
  comps; neither has a billing system or a policy behind it.
- **The EI add-on price** — still blocks the billing build.
