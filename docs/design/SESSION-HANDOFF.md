# Session handoff — Mandate marketing surface

**Written:** 2026-08-11 · **Updated:** 2026-08-11 (four product pages) · **Repo state at handoff:** `main` @ `8502bab` plus uncommitted work for the four pages.

---

## 1. Environment gotchas — read these first

| Gotcha | Detail |
|---|---|
| **Two clones exist** | Work in **`~/Projects/mandate`** (current). `~/Mandate Recruiting/mandate` is a STALE clone at `ce4e7a5`. The Playwright MCP is rooted at the stale one, so its **screenshots land in the wrong tree** — the browser itself is fine, only file paths are wrong. |
| **Screenshots land at the stale clone's ROOT** | Not in its `.playwright-mcp/`. A capture named `foo.png` appears at `~/Mandate Recruiting/mandate/foo.png`. Find it there and move it before reading. |
| 🔴 **ALWAYS use `git -C <path>`** | The Bash working directory **persists between calls**, and moving screenshots requires `cd`-ing into the stale clone. This has already caused one real incident — see §1a. Never rely on cwd for a git command: `git -C /Users/vladbreygin/Projects/mandate <cmd>`. |
| **Reveal state corrupts measurements** | See §5. This produced two separate classes of false finding across two critiques. Read it before measuring anything in the browser. |
| **Never mutate `<html>` className before hydration** | An inline script adding a class to `document.documentElement` triggers a React hydration mismatch. The scroll-reveal gate uses `@media (scripting: enabled)` instead — no script, no mismatch. Don't "fix" it back to a class toggle. |
| **`tsc` false errors** | If tsc reports `" 2"`-suffixed duplicate identifiers (`cache-life.d 2.ts`), run `rm -rf .next` first. Also: after moving a route, a stale `.next/types/validator.ts` will reference the old path — same fix. |
| **Never `rm -rf .next` while `npm run dev` is running** | It strips the manifests and every route 500s. Kill the dev server first. |
| **Supabase auto-pauses** | Free tier, ~7 days idle. Project ref `xipyqnltkbtywxqyxupf`. Restore via MCP `restore_project`; takes minutes and reports `COMING_UP` with an empty `public` schema mid-restore — that is NOT data loss, wait for `ACTIVE_HEALTHY`. |
| **Working rules** | In `CLAUDE.md`: never commit or push without explicit approval, conventional commits, **no attribution footer**, green gate (`npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`) before any commit. |

---

## 1a. 🔴 The wrong-repo incident, and an outstanding cleanup

**What happened.** A screenshot-move command ran `cd "~/Mandate Recruiting/mandate" && mv …`. The Bash tool keeps its working directory between calls, so the next `git add -A && git commit` executed **in the stale clone**, staging 162 files of Playwright debris on top of `ce4e7a5`. The push was rejected only because that branch was 7 commits behind `origin/main`. On a fast-forwardable branch it would have pushed junk to `main`.

**Recovery was clean:** `git reset --mixed HEAD~1` in the stale clone returned every file to untracked without deleting anything, restoring its exact prior state. The real work was still uncommitted in the working repo and committed normally afterwards.

**The rule that prevents it:** use `git -C /Users/vladbreygin/Projects/mandate <cmd>` for every git command. It removes the failure mode rather than relying on remembering to `cd` back.

### Outstanding cleanup — ✅ done 2026-08-11

The three debris files (`simulator-failed-state.png`, `skip-link-focused.png`, `sim-error-state.png`) were deleted from the stale clone. `.playwright-mcp/`, `hero-1440.png`, `mandate-landing-1440.png` and `status` were left alone, as instructed.

**Still true, and still the rule:** the Playwright MCP writes screenshots to the stale clone's root. This session moved each capture to the session scratchpad immediately after taking it, and never `cd`-ed into that clone — every git command used `git -C /Users/vladbreygin/Projects/mandate`.

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
2f70b4d  mobile simulator input; FAQ rebuilt on native <details>
529a5bb  remove traffic-light scoring from the alignment diagram
f32056b  handoff refresh
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
- ~~**P2 — traffic-light scoring.**~~ Closed in `529a5bb`. `TONE` deleted; one accent hue with ring opacity tracking magnitude; caveat governs both columns plus a caption under the diagram; `aria-label` leads with "Illustrative example". Also fixed the diagram's four labels, which were `#6b6b7e` — **the trap worth knowing: `--fg-muted` measures 5.10:1 on `--bg` but only 2.85:1 composited over the translucent circle fills.** They use `--fg-soft` (worst case 5.59:1); the docstring records why.
- ~~**P2 — mobile.**~~ Closed in `2f70b4d`. Analyze button no longer wraps (`white-space: nowrap`, trimmed padding below 480px); the animated placeholder now sits in a `.m-sim__field` wrapper — an earlier "fix" clamped it to the input ROW, which includes the button, so it stopped overflowing the page and started running underneath the control. **The FAQ is rebuilt on native `<details>`/`<summary>`** — zero client JS, all 8 answers reachable without JavaScript, 0 `inert`, exclusive accordion via `name`. The chevron, which drew an ✕ in both states, is now a real chevron.
- **Structural, needs a direction decision before code.** Sections 03→08 are five consecutive card grids with the same container, track and gap; the "Roman clause / *italic blue clause*" h2 mould is used ten times without variation; the page numbers itself 00–10 and then makes those numerals `aria-hidden`, `pointer-events: none` decoration rather than navigation. The single largest missed opportunity: the page never shows a Mandate **artifact** — no shortlist, no ranked slate, no versioned spec diff — for a product whose noun is "a slate that defends itself in the minutes".

### Token-level finding worth acting on once

`--fg-muted` (`#7f7f93`) is on **51 elements** and measures **4.47–4.59:1** depending on the panel beneath it. Three instances genuinely fail; five more pass by under 0.1. One step darker on any panel flips more of those 51 into failure. Treat it as a token decision, not five spot fixes.

### Re-running it

Requires **two isolated sub-agents** (A: design review, B: detector + browser evidence). Start a dev server on `:3001` first.

**Orchestration note:** the Playwright MCP exposes a *single shared browser*. Running A and B concurrently against it corrupts both — B's overlay injection lands in A's screenshots. Capture the frames in the parent, hand the file paths to A, give B exclusive browser control. Both still run isolated and in parallel.

**Keep A's prompt stable between runs.** Run 3 used a prompt byte-identical to run 2 apart from image paths, which is what makes 24 → 26 a real comparison rather than an artifact of a different brief. Do not tell A what was fixed; its design-specificity verdict has to be unanchored.

**The overlay pollutes its own measurements.** B's first contrast sweep returned 29 failures, **17 of which were the overlay's own badges**. Kill the live server and reload clean before measuring anything.

---

## 7. The four remaining marketing pages — ✅ built 2026-08-11

Imported from Claude Design project `f6c4031e-c28e-450f-8ef1-353834d79b78` via `DesignSync`.

| Comp | Route as built |
|---|---|
| `02 Platform.dc.html` | `/platform` |
| `03 Executive Intelligence.dc.html` | `/executive-intelligence` — see below |
| `04 Solutions.dc.html` | `/solutions` |
| `05 Pricing.dc.html` | `/pricing` |

### 🔴 The whole product moved behind `/app`

`/executive-intelligence` was taken by the authenticated EI workspace, so the marketing page shipped at `/intelligence` first. On the founder's instruction the dashboard was then relocated and marketing took the plain noun.

**Every authenticated route now lives under `/app`** — `/app/home`, `/app/projects/[id]/…`, `/app/executive-intelligence/…`. This was not only about one URL: all six product trees sat at the root in the same space as marketing, so `/candidates` and `/analytics` were the next two collisions waiting. The two namespaces can no longer touch.

```
PRODUCT                          MARKETING
/app/home                        /
/app/projects/[id]/…             /platform
/app/candidates/…                /solutions
/app/analytics                   /pricing
/app/settings/…                  /executive-intelligence
/app/executive-intelligence/…    /request-access
```

Old URLs are kept alive by `redirects()` in `next.config.ts`. **The one trap:** the `/executive-intelligence` entry uses `:path+` (one *or more* segments), not the `:path*` the others use — because the bare path is now the marketing page, and `:path*` would swallow it and send every reader to a sign-in wall. Do not "tidy" that inconsistency.

**Every unlisted route redirects to sign-in.** `src/proxy.ts` `PUBLIC_PAGES` gates this. A new marketing route that is not added to that set 302s to `/auth/signin` and looks, from the outside, like it was never deployed.

### 🔒 Open redirect found and fixed while moving the auth flow

`/auth/callback` did `NextResponse.redirect(`${origin}${next}`)` with `next` straight from the query string. `next=//evil.com` produces `https://host//evil.com`, which the browser resolves as **protocol-relative** — off-origin. It needs a valid auth code to reach, so it is a phishing chain rather than a drive-by: craft a sign-in link carrying the hostile `next`, let the victim authenticate for real, land them on a lookalike with a live session behind them.

`safeNextPath()` in `src/lib/routes.ts` now validates it — same-origin absolute paths only, rejecting `//`, `/\`, absolute URLs, and control characters that could split the redirect header. 8 unit tests in `routes.test.ts` pin the vectors. **Never interpolate a `next` parameter into a redirect without it.**

The same fix closed a live bug: `signInAction` ended with an unconditional `redirect("/")` and the sign-in form never carried `next` at all, so the proxy would preserve your destination through the redirect chain and then password sign-in discarded it. Deep links now survive end to end.

### Decisions settled with the founder before building

| Question | Decision |
|---|---|
| Homepage vs new pages | **Homepage untouched.** Sections 04–08 stay full; the nav simply stopped addressing them. Content is duplicated between `/` and the new pages by choice. |
| Nav | Platform · Executive Intelligence · Solutions · Pricing · Live demo. **No `/security`** — the comps show it, but nothing evidences those claims yet (§6). |
| Starter tier | **Shipped wording wins**: 1 user, 3 active searches. The comp's "unlimited mandates" was wrong and was corrected. |

### What the comps got wrong, and what was done instead

The comps are art direction, not truth. Three concrete corrections:

- **The Platform agent grid did not reconcile.** It invented `Client Psychology`, `Skills` and `Triangulation` (none are agents), omitted real ones, and badged its `EVALUATE` column **6** above a list of **4** — headers summing to 17, rows summing to 15. Rebuilt from `AGENTS.md` into `_data/agents.ts`; the grouping is the comp's, the roster and every count are derived from the array.
- **The Pricing comp contradicted the homepage** on Starter. Both surfaces now render from `_data/pricing.ts`.
- **The Boolean panel drew `Copy` and `Version history` buttons.** Rendering dead controls on a marketing page spends exactly the credibility that section is trying to earn. They are `<li>`s now — a legend, offering no click.

### Reconciliation guards added

`_nav-links.ts` (nav + mobile panel + footer), `_data/agents.ts` (`AGENT_COUNT = AGENTS.length`), `_data/pricing.ts` (tiers + matrix + billing FAQ), and a shared `PriceTierCard`. The homepage and `/pricing` cannot quote different numbers because they read the same module.

### Two defects found in passing

- **Layout metadata was leaking.** The route-group layout carried the homepage's `title`, `description`, `canonical: "/"` and OG card. Layout metadata is inherited, so `/request-access` was already declaring itself canonical to `/`, and all four new pages would have too. Page metadata now lives on each page; the layout exports none. `/request-access` also had a doubled title suffix (`"Request Access · Mandate"` under a `"%s · Mandate"` template) and is now `noindex`.
- **The root layout still said "14 intelligent agents".** Only the marketing layout had been corrected, so every non-marketing route still shipped the wrong count. Now derived from `AGENT_COUNT`.

### The nav breakpoint, and why it moved to 1240px

A fifth destination pushed the row to 1123px of content, which needs a 1203px viewport once gutters are paid. At the old 1120px breakpoint nothing reported an overflow — **`.m-nav__link` had no `white-space`, so "Executive Intelligence" and "Live demo" wrapped to two 11px lines that still fit inside the 40px `min-height`.** The box never grew, `scrollWidth` never exceeded `clientWidth`, and every geometric check passed while the nav visibly rendered as two ragged rows. `white-space: nowrap` makes that failure measurable; the breakpoint is set from the measurement. **Both media queries (`.m-nav__links` show, `.m-mnav` hide) must stay on the same value** or some width gets no navigation at all.

Worth generalising: **a passing geometry assertion is not a passing render.** The screenshot caught this; three separate numeric checks did not.

**Put every page at `src/app/(marketing)/<route>/page.tsx`.** Being inside the route group is what supplies `marketing.css` and the three `next/font` variables — `/request-access` was moved there for exactly this reason after shipping in a different design system.

**Do not invent a second visual language.** The homepage is the reference: the `m-*` classes and `--accent` / `--fg-soft` / `--bg-elev-*` tokens; counts and numerals derive from `_constants.ts` and are never retyped; illustrative data is labelled illustrative (`_components/simulator-fixtures.ts` is the standard); no traffic-light colour on anything describing a person; no animated numbers that are not being computed; reveal hiding stays gated on `@media (scripting: enabled)`.

### What this leaves open

The IA decision (homepage untouched) was made deliberately and with the trade-offs stated, but it does not close the two structural findings in §6 — it defers them:

- **The homepage is still ~13,500px** (~16 viewports on mobile). `/platform` is 7.3, `/executive-intelligence` 6.3, `/pricing` 6.0, `/solutions` 4.8.
- **Sections 04–08 now duplicate content** that also has a dedicated page. Nothing renders stale — both surfaces read the same modules — but a crawler sees the same pitch twice and a reader who follows the nav sees it twice too.

If that becomes a problem, the fix is the option that was not taken: collapse homepage 04–08 to teasers that link out. It is a smaller job now than it was before this session, because the depth already exists on its own pages.

**`CLAUDE.md` corrected** — it claimed DesignSync had no Mandate comps. It has 14.

---

## 8. Broader project context

Other design docs in this folder, all committed:

- `MANDATE_COMPANY_BRIEF.md` — what Mandate is, voice, what must never be claimed. **Section 8 (goals/ambitions) is deliberately blank and needs the founders.**
- `MANDATE_DESIGN_HANDOFF.md` — full product/design dossier, 750 lines.
- `MANDATE_SCREEN_INVENTORY.md` — 73 screens + 15 states with status and dependencies.

**Blocked on business input:** the Executive Intelligence add-on price (blocks the whole billing build, spec'd in `docs/superpowers/specs/2026-08-10-billing-design.md`), and the positioning brief.

**Two claims now published that nothing backs yet.** Both came from the comps, both are on `/pricing`, and both are commercial promises rather than descriptions of built behaviour:

1. *"Agent runs are not metered."* Coherent with flat pricing and the per-tier search caps, but billing is not built — Stripe is still on the pre-launch checklist. If metering ever appears, this line has to go first.
2. *"Access is removed; your records are retained and remain readable."* A retention commitment with no policy page, no DPA and no stated period behind it — the same category as the FAQ's security claims in §6.

Neither is dishonest, but neither has been signed off. They are in `_data/pricing.ts` (`BILLING_FAQ`) and change in one place.

**Two marketing claims were removed on the founder's instruction** in `c67c969` — a "three days" manual-effort comparison and "the feature no other platform has". If either was load-bearing in sales conversations, they need deliberate replacements rather than the current absence.

**The 13 other Claude Design mockups** live in project `f6c4031e-c28e-450f-8ef1-353834d79b78` (read via the `DesignSync` MCP). `06 App Shell.dc.html` is the one that unblocks the other 38 app screens.
