# Session handoff — Mandate marketing homepage

**Written:** 2026-08-11 · **Repo state at handoff:** `main` @ `4fdd668`, clean, pushed to `origin`.

---

## 1. Environment gotchas — read these first

| Gotcha | Detail |
|---|---|
| **Two clones exist** | Work in **`~/Documents/Projects/mandate`** (current). `~/Mandate Recruiting/mandate` is a STALE clone at `ce4e7a5`. The Playwright MCP is rooted at the stale one, so its **screenshots land in the wrong tree** — the browser itself is fine, only file paths are wrong. |
| **Screenshots land at the stale clone's ROOT** | Not in its `.playwright-mcp/`. A capture named `foo.png` appears at `~/Mandate Recruiting/mandate/foo.png`. Find it there and move it before reading. |
| **Reveal state corrupts measurements** | See §5. This produced two separate classes of false finding across two critiques. Read it before measuring anything in the browser. |
| **Never mutate `<html>` className before hydration** | An inline script adding a class to `document.documentElement` triggers a React hydration mismatch. The scroll-reveal gate uses `@media (scripting: enabled)` instead — no script, no mismatch. Don't "fix" it back to a class toggle. |
| **`tsc` false errors** | If tsc reports `" 2"`-suffixed duplicate identifiers (`cache-life.d 2.ts`), run `rm -rf .next` first. Also: after moving a route, a stale `.next/types/validator.ts` will reference the old path — same fix. |
| **Never `rm -rf .next` while `npm run dev` is running** | It strips the manifests and every route 500s. Kill the dev server first. |
| **Supabase auto-pauses** | Free tier, ~7 days idle. Project ref `xipyqnltkbtywxqyxupf`. Restore via MCP `restore_project`; takes minutes and reports `COMING_UP` with an empty `public` schema mid-restore — that is NOT data loss, wait for `ACTIVE_HEALTHY`. |
| **Working rules** | In `CLAUDE.md`: never commit or push without explicit approval, conventional commits, **no attribution footer**, green gate (`npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`) before any commit. |

---

## 2. Open item that is NOT code

**Anthropic API credits are exhausted.** `POST /api/demo` returns a billing error.

**This is no longer a page problem.** As of `4fdd668` the simulator does not depend on the billing state: the three example chips resolve from committed fixtures with no network call, and a free-text brief that fails falls back to the closest fixture in the full result view behind an `ILLUSTRATIVE` banner. A visitor today gets a complete structured mandate — decomposition, inferred scope, five weighted dimensions — with nothing that can fail.

**It is still a product problem, and the honest limit is worth stating.** The fixtures are hand-written, labelled as such, and are therefore a demonstration of the output's *shape*, not evidence the model produces it. A search principal reading closely will notice the page's strongest proof is authored rather than generated. Only real runs fix that. When credits are restored:

1. Regenerate `src/app/(marketing)/_components/simulator-fixtures.ts` from the real pipeline, keeping the file shape.
2. Change `ILLUSTRATIVE_NOTICE` and the banner wording to say the run was **captured**, with a date.
3. Do **not** relabel hand-written content as captured output without regenerating it. The file's header comment says this too; it is the whole point of the file.

---

## 3. What was done

Three `/impeccable critique` runs: **15/40 → 24/40 → 26/40**. Rounds 1 and 2 were closing defects. Round 3's P0 and two of its three P1s are also closed; what remains is structural (§6).

```
4fdd668  illustrative simulator fixtures — the demo survives an outage
d272602  remove three manufactured-liveness signals
7de9799  scroll-padding-top — anchors land clear of the sticky nav
05cdb63  handoff doc + the "intelligence layers.Every" space regression
28ac072  accessibility cluster, pricing grid, two bugs found in passing
c67c969  trust-ordering, two overclaims, illustrative scores
fa6a362  no-JS visibility, SSR headline, count reconciliation, request-access, mobile CTA
bc9a66f  session handoff doc
cd07a2e  triangulation pills onto clear lens intersections
c820f0b  remove decorative motion and glow (43 animations → 3, 21 glows → 0)
1f26a4d  mobile navigation
fdaeb1d  section renumbering + single commercial story
8f87270  font identity, live simulator, consistency sweep
acd0707  homepage rebuilt on the imported Claude Design spine
```

### The findings that would each have ended an evaluation

1. **Fonts never loaded** (round 1). `.marketing-root` redeclared `--font-display/-body/-mono` in terms of themselves → CSS cycle → the whole page silently rendered in Inter across every prior deploy.
2. **The page did not exist without JavaScript** (round 2). Every `.m-reveal*` wrapper started at `opacity: 0`, cleared only by an IntersectionObserver. The static HTML shipped 48 invisible wrappers with no `<noscript>`. Crawlers, Reader mode, in-app webviews and any stalled hydration got a black rectangle.
3. **Half the `<h1>` did not exist server-side** (round 2). `TypewriterReveal` served `text.slice(0, 0)` — an empty span whose only content was an `aria-label`, which ARIA drops on `role=generic`. Google and LinkedIn saw a headline reading *"One line in."* and nothing else.
4. **The page contradicted its own counts** (round 2). 17 agents in the body, **14 in the meta description and OG card**, twelve modules in prose, 31 in the hero rail. On a product whose only differentiator is that its outputs reconcile.
5. **The conversion destination was a different product** (round 2). `/request-access` rendered in Material 3 tokens with a Material Symbols icon font — craft dropped at the exact moment of commitment.

6. **The page performed liveness while selling auditability** (round 3). A static "System online" pip shown while the API returned 502s; four progress steps advancing on a 2200ms timer decoupled from the request; the hero rail animating fixed architecture constants like meters. The codebase already argued against exactly this in a comment and had never propagated it.

### Also closed

Simulator failure copy no longer claims hardcoded copy is "real output from an earlier run"; primary CTA persists in the nav at every width; `<main>` + skip link; focus ring restored on the simulator input (WCAG 2.4.7); two invalid `ul > ul`; FAQ questions promoted to `<h3>` and closed panels made `inert`; scroll indicator no longer announces on every frame; simulator gained a live region; pricing grid orphan at 1152px; footer touch targets to 44px; hero rail labels off 10px; every in-page anchor lands clear of the sticky nav; the simulator can be reset and run a second time; the example chips are 44px targets that read as controls; the client console no longer logs the billing message or a provider `request_id`.

---

## 4. Known remaining issues

**The prioritised list from the third critique is in §6.** This section covers what that run did not surface.

**Two mistakes worth not repeating.** A JSX comment placed beside the root element inside `return ( … )` is a parse error — `{/* … */}` and `<section>` become two children with no fragment. I did this twice in one session; put the comment *above* the `return` instead. And: the green gate cannot catch a rendering defect. Both times something shipped wrong this session, tsc/lint/tests/build were all green.

**A regression worth learning from.** Commit `fa6a362` converted `"Twelve specialised modules across three intelligence layers."` into a template literal to derive the count from `MODULE_COUNT`. JSX strips whitespace containing a newline between an expression container and an adjacent text node, so it shipped rendering as **"intelligence layers.Every layer reads"** — live on production until the next commit. The green gate cannot catch this class of bug: it is neither a type error nor a lint error, only a rendering one. **When converting literal copy to an expression, put the trailing space inside the literal**, and diff the rendered text, not just the source.

**Structural / content**
- **Mobile page is 13,278px** — roughly 16 viewports. The sharpest open question from the critique: *what would the shortest version of this page look like?* Hero → simulator → Principles → CTA is four sections; 04–06 are elaboration a convinced buyer doesn't need and an unconvinced one won't read.
- **The pricing grid's premise.** The 1152px orphan is fixed; the contradiction is not. It is still a four-across grid with four identical "Request Access" CTAs on a page that twice states there is no self-serve tier, including one tier priced "Contact sales".
- **`AGENTS.md` is still headed "The 14 Mandate Agents"** with the 3 EI agents listed separately. That is the origin of the 14-vs-17 drift. The page now derives from `AGENT_COUNT = 17` in `src/app/(marketing)/_constants.ts`; the doc should say 17 too.

**Craft / polish**
- **Hero animation order.** `.m-hero-trust` has no entrance animation while `.m-hero-ctas` is delayed 900ms — the disclaimer renders before the offer it disclaims.
- **FAQ chevron** renders as an ✕ when closed (reads as "dismiss", not "expand").
- **Footer brand mark** is an empty rounded blue square with no `M`. (The *nav* mark is fine.)
- **Note badge contrast is 4.51:1** — a genuine pass, by 0.01. Any tint change breaks it. Fixing it means altering the brand accent on that label, which is a brand decision.
- **Dead CSS estate.** The round-1 restraint pass *disabled* rules rather than deleting them. Re-verified against the TSX at `4fdd668`: `.m-ticker`, `.m-feature-card`, `.m-card--danger`, `.m-card--warn`, `.m-display--shimmer`, `.m-reveal-cascade`, and the non-`-row` `.m-pipeline` / `.m-pipeline-cascade` rules are all unused — **but only the `.m-pipeline-row*` variants are actually used**, so don't delete the whole pipeline block. The two `gradient-text` rules match **zero elements** in the live DOM. Two dead component slots (`StatsTicker`, `Features`) remain as comment blocks in `page.tsx`. (`count-up.tsx` and the `.m-nav__live` rules were deleted in `d272602` and are already gone.)

---

## 5. ⚠️ Measuring the page correctly

**This has produced false findings in every critique so far. Control for it or your evidence is wrong.**

Scroll-reveal wrappers start hidden and scaled, inside `@media (scripting: enabled)`, and only settle when the IntersectionObserver adds `is-visible`:

```css
@media (scripting: enabled) {
  .m-reveal        { opacity: 0; transform: translateY(28px); }
  .m-reveal-scale > * { opacity: 0; transform: translateY(20px) scale(0.94); }
}
```

Two consequences:

| Measuring | Uncontrolled reading | Truth |
|---|---|---|
| **Contrast** | ~1.0:1 on dozens of elements — foreground composited onto background at opacity 0 | Sweep reported 34 failures; real count was 2 |
| **Touch targets** | 41.4px on 44px controls — `44 × 0.94`, mid-transition | Settles to exactly 44px |

**Before measuring contrast or geometry:** scroll the whole document, wait ~1s for the 720–800ms transitions, and assert `document.querySelectorAll('.m-reveal:not(.is-visible)').length === 0`.

**The same applies to full-page screenshots.** A `fullPage` capture without scrolling first shows below-fold sections as black voids — which looks identical to the (now fixed) no-JS bug.

Also worth knowing: a raw contrast sampler that reads `backgroundColor` off the nearest ancestor gets **1.0:1** on the Note badge because that background is a translucent `rgba` over the accent. Composite every translucent layer down to an opaque colour first; the real ratio is 4.51:1.

---

## 6. Critique trend and what the third run found

**15/40 → 24/40 → 26/40.** Snapshots in `.impeccable/critique/`; read the trend with:

```
node ~/.claude/skills/impeccable/scripts/critique-storage.mjs trend "src/app/(marketing)/page.tsx" 5
```

### Verified closed (measured under the conditions that would expose each)

With JavaScript genuinely disabled (`javaScriptEnabled: false`), **24/24 reveal wrappers render at opacity 1**, all 11 sections visible, 8,572 chars of body text. SSR `<h1>` is byte-identical to the hydrated one and its computed accessible name is correct. 28 headings, one `h1`, **zero skipped levels**. Zero invalid list nestings, zero single-child stagger wrappers. No pricing width leaves a tier alone on a row. All 7 collapsed FAQ panels carry `inert`. Under `prefers-reduced-motion`: 0 animations, 0 stranded wrappers. 0 console errors, no hydration mismatch. The simulator failure leaks nothing to the DOM and the worked example survives at 791 chars byte-identical.

### Closed since the run (`7de9799`, `d272602`, `4fdd668`)

- ~~**P0 — the failure copy overclaims.**~~ Four hand-written `DemoResult` fixtures now back the simulator. Chips resolve locally with **zero network calls** (verified by instrumenting `window.fetch`); a failed free-text brief falls back to the nearest fixture in the full result view behind an `ILLUSTRATIVE` banner. See §2 for what to do when credits return.
- ~~**P1 — no `scroll-margin-top`.**~~ `scroll-padding-top: calc(var(--nav-h) + 1.5rem)` on `html:has(.marketing-root)`. Anchors landed at 0px against a 73px nav; they now land at 97px. Scoped with `:has()` so it cannot leak into the app shell — verified on `/auth/signin`, where it resolves to `auto`.
- ~~**P1 — three manufactured-liveness tells.**~~ Pip deleted, progress steps replaced with a real elapsed counter and an indeterminate track, hero rail rendered statically, `count-up.tsx` removed, console logs the status code only.

### The remaining ceiling is structural, not defect-level

- **P1 — no human provenance.** Zero customers means the founder is the proof, and the founder appears once, unnamed, at ~95% scroll depth. Security claims in the FAQ have no DPA or security page behind them. **Blocked on the founders** — the block can be built in an hour, but nobody else can write the name and the track record.
- **P2 — traffic-light scoring contradicts Principles.** Green 91 / amber 83 is the grammar of pass/caution/fail next to a named human, three sections after "no hire or no-hire verdict is produced anywhere". The "illustrative" caveat governs the score list only — the diagram with the largest number on the page (87) sits in a separate column with no caveat and states the scores as fact in its `aria-label`. Fix: drop the `TONE` mapping in `three-circle-alignment.tsx`, render all magnitudes in `var(--accent)`, move the caveat under the h2 so it governs both columns.
- **P2 — mobile.** The Analyze button still wraps to two lines at 390 (`.m-sim__submit` has `padding-inline: 1.625rem`, no `white-space: nowrap`, no stacking rule below 420px). **7 of 8 FAQ answers remain unreachable without JS** — the text is in the DOM at `max-height: 0` but the panels cannot open. (`.m-chip` is still 40px, which is correct: the inert Stack label chips are not targets. The interactive `.m-chip--action` chips are 44px.)
- **Structural, needs a direction decision before code.** Sections 03→08 are five consecutive card grids with the same container, track and gap; the "Roman clause / *italic blue clause*" h2 mould is used ten times without variation; the page numbers itself 00–10 and then makes those numerals `aria-hidden`, `pointer-events: none` decoration rather than navigation. The single largest missed opportunity: the page never shows a Mandate **artifact** — no shortlist, no ranked slate, no versioned spec diff — for a product whose noun is "a slate that defends itself in the minutes".

### Token-level finding worth acting on once

`--fg-muted` (`#7f7f93`) is on **51 elements** and measures **4.47–4.59:1** depending on the panel beneath it. Three instances genuinely fail; five more pass by under 0.1. One step darker on any panel flips more of those 51 into failure. Treat it as a token decision, not five spot fixes.

### Re-running it

Requires **two isolated sub-agents** (A: design review, B: detector + browser evidence). Start a dev server on `:3001` first.

**Orchestration note:** the Playwright MCP exposes a *single shared browser*. Running A and B concurrently against it corrupts both — B's overlay injection lands in A's screenshots. Capture the frames in the parent, hand the file paths to A, give B exclusive browser control. Both still run isolated and in parallel.

**Keep A's prompt stable between runs.** Run 3 used a prompt byte-identical to run 2 apart from image paths, which is what makes 24 → 26 a real comparison rather than an artifact of a different brief. Do not tell A what was fixed; its design-specificity verdict has to be unanchored.

**The overlay pollutes its own measurements.** B's first contrast sweep returned 29 failures, **17 of which were the overlay's own badges**. Kill the live server and reload clean before measuring anything.

---

## 7. Broader project context

Other design docs in this folder, all committed:

- `MANDATE_COMPANY_BRIEF.md` — what Mandate is, voice, what must never be claimed. **Section 8 (goals/ambitions) is deliberately blank and needs the founders.**
- `MANDATE_DESIGN_HANDOFF.md` — full product/design dossier, 750 lines.
- `MANDATE_SCREEN_INVENTORY.md` — 73 screens + 15 states with status and dependencies.

**Blocked on business input:** the Executive Intelligence add-on price (blocks the whole billing build, spec'd in `docs/superpowers/specs/2026-08-10-billing-design.md`), and the positioning brief (blocks every marketing page beyond Home).

**Two marketing claims were removed on the founder's instruction** in `c67c969` — a "three days" manual-effort comparison and "the feature no other platform has". If either was load-bearing in sales conversations, they need deliberate replacements rather than the current absence.

**The 13 other Claude Design mockups** live in project `f6c4031e-c28e-450f-8ef1-353834d79b78` (read via the `DesignSync` MCP). `06 App Shell.dc.html` is the one that unblocks the other 38 app screens.
