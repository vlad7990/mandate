# Continuation prompt — Mandate app redesign

**Purpose.** This file exists so work continues across a `/clear` or a
context reset without re-deriving anything. Paste the block in §1 into a
fresh session and it will pick up exactly where the last one stopped.

**Updated:** 2026-08-11 · `main` @ `8328dda` committed; one further
commit of EI report work on top. All seven app comps now have their
design rendered somewhere.

---

## 1. The prompt to paste after `/clear`

```
Continue the Mandate app redesign.

Working directory: ~/Documents/Projects/mandate (NOT ~/Mandate Recruiting/mandate).

Read docs/design/CONTINUATION.md first — it is the current state and the
task list. Then read CLAUDE.md for working rules and
docs/design/SESSION-HANDOFF.md §1 and §5 for environment gotchas and the
measurement protocol.

Pick up the first unchecked item in §4. Work through as many as the
context allows. When you reach ~20% remaining context, stop adding new
work, update §3 and §4 of this file with what changed, and say so.

Use /impeccable for UI work. Green gate before any commit:
npm test && npx tsc --noEmit && npm run lint && npm run build.

Do not commit or push without explicit approval — propose the message
first. This rule is unchanged.
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
| 08 Project Detail | `/app/projects/[id]` | ⚠️ sample route only |
| 10 Candidate Detail | `/app/projects/[id]/candidates/[candidateId]` | ⚠️ sample route only |
| 11 EI Workspace | `/app/executive-intelligence/searches/[id]` | ⚠️ sample route only |
| 12 EI Report | `…/searches/[id]/candidates/[cid]/report` | ⚠️ sample route only |

Marketing (`/`, `/platform`, `/executive-intelligence`, `/solutions`,
`/pricing`) is complete and live.

**Nothing in the app has been visually verified.** Every authenticated
screen is behind a login the agent does not have. The build, types and
tests are green; nobody has looked at the pixels. This is the single
largest risk in the project right now — the shell is inherited by every
screen, so a mistake in it propagates.

---

## 4. Task list, in order

- [ ] **Compile the EI report for real searches.** The route exists and
      the sample renders in full; a real search gets a gate that names
      what is missing. Needs the approved success profile, interview plan
      and assessment joined, with coverage recomputed server-side. This
      document goes to a client — verify it against a real search before
      trusting it.
- [ ] **Restyle the real EI Workspace** (420 lines) to comp 11. Target
      design: `src/components/sample/sample-ei-workspace.tsx`. Smallest
      of the three real-page restyles — do this one first to establish
      the pattern.
- [ ] **Restyle the real Project Detail** (1006 lines) to comp 08. The
      sample route at `src/components/sample/sample-project-detail.tsx`
      is the target design — this is a comparison, not a guess. Do it
      incrementally; the page carries live server actions.
- [ ] **Restyle the real Candidate Detail** (1326 lines) to comp 10.
      Target: `sample-candidate-detail.tsx`.
- [ ] **~425 Material Symbols ligatures** → inline SVG from
      `src/components/icons.tsx`. Each currently puts literal text like
      `folder_open` in the DOM and depends on a blocking Google webfont.
      The shell is converted; the pages are not. Mechanical, safe,
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
