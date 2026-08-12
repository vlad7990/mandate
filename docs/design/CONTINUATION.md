# Continuation prompt — Mandate app redesign

**Purpose.** This file exists so work continues across a `/clear` or a
context reset without re-deriving anything. Paste the block in §1 into a
fresh session and it will pick up exactly where the last one stopped.

**Updated:** 2026-08-12 · `main` has five unpushed commits
(`b73e916..HEAD`). Working tree clean. **The ligature sweep is finished**
— §4 has no open items left.

**All seven app comps are on their real routes and the Material Symbols
sweep is done.** Everything left in this document needs the founder, not
an agent — see §6.

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

### 3a. The Material Symbols sweep — finished 2026-08-12

**All 260 ligatures are gone.** No `material-symbols-outlined` span, no
webfont `<link>` in `layout.tsx`, no `.material-symbols-outlined` rule in
`globals.css`. The only two mentions left in the tree are prose in the
`icons.tsx` header explaining what was removed.

`npm run lint` now reports **zero warnings**. The two that stood for
months — `google-font-display` and `no-page-custom-font` — were that
`<link>`, and they cleared when it went.

Five commits, `b73e916..HEAD`, **not yet pushed**:

| Commit | Module | Sites |
|---|---|---|
| `b73e916` | Spec, onboarding, shortlist, shared primitives, comparison, reports, feedback + HM, ranking | 126 |
| `39790ac` | Sourcing | 17 |
| `2812684` | Settings | 20 |
| `c484fbd` | Remaining project routes | 18 |
| *(head)* | Executive Intelligence, candidates, analytics, webfont removal | 79 |

`src/components/icons.tsx` carries **72** drawn icons, up from 31. Every
new glyph was rendered on a throwaway `/iconsheet-tmp` route at 32/16/12px
and read correctly at each size before use; the route and its
`PUBLIC_PAGES` entry were deleted each time. The final build was served
with `next start` and `/auth/signin` screenshotted to confirm nothing
renders as a raw ligature word now the font is gone.

**Component APIs that changed, not just glyphs:**

- **`MastHead` lost its `icon` prop.** In all 21 call sites the glyph sat
  beside an explicit uppercase label inside the same chip.
- **`StatusChip.icon` is a component**, not a ligature string:
  `icon?: (props: IconProps) => React.ReactElement`.
- **Seven `icon: string` fields were deleted outright** —
  `SectionDef` (`job-spec-analysis.ts`), `AgentTileDef`, `Perspective`,
  `SlotDef` (`sourcing-analysis.ts`), the section defs in
  `executive-role-architect-agent.ts` and
  `executive-interview-architect-agent.ts`, and `PrincipleBlock`. Each
  printed a glyph next to text that already named the thing.

**Two places where the sweep fixed something rather than translating it:**

- The **skill-type radio group** now draws `IconCheckCircle` /
  `IconCircle`. Its `<input>` is `sr-only`, so a recoloured type glyph
  had been the entire selected affordance.
- **"Encryption Active"** (onboarding) and **"Org-scoped storage"**
  (CV upload) draw `IconShield`. Both printed `verified` — an approval
  rosette on a statement about RLS.

`TierComparison` draws one `IconCompare` for both agree and disagree;
`swap_horiz` and `compare_arrows` drew nearly the same thing and the
tertiary colour already carries the disagreement.

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

*(Nothing open. The ligature sweep was the last item; see §3a.)*

### Done 2026-08-12

- [x] **All 260 Material Symbols ligatures converted to inline SVG**, and
      the webfont `<link>` and CSS rule removed with them. Five commits,
      `b73e916..HEAD`, unpushed. Details and the API changes in §3a.

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
