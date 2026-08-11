---
target: src/app/(marketing)/page.tsx
total_score: 26
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 3
timestamp: 2026-08-11T12-53-18Z
slug: src-app-marketing-page-tsx
---
Method: dual-agent (A: design review, isolated · B: detector + browser evidence, isolated)

Parent-captured frames were handed to A and exclusive browser control to B, because the Playwright MCP exposes a single shared browser. A's prompt was byte-identical to the previous run apart from image paths, so the score is a like-for-like comparison. A was not told what had been fixed.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Four progress steps advance on a hardcoded 2200ms `setInterval` unrelated to request state (`live-simulator.tsx:406-409`). The nav's "System online" pip (`page.tsx:82-85`) is a static span, not a health check — and it is displayed while `/api/demo` is down. |
| 2 | Match System / Real World | 3 | Vocabulary is exactly the buyer's — "mandate", "slate", "the room", "board minute". But the hero rail counts the vendor's own architecture (AGENTS 17, MODULES 12), not search outcomes. |
| 3 | User Control and Freedom | 2 | Nothing ever clears `result`, so after a successful run there is no path back to the worked example and no way to run a second brief (`live-simulator.tsx:277`). FAQ is single-open. The mobile panel moves focus in but does not trap it (`mobile-nav.tsx:62-64`). |
| 4 | Consistency and Standards | 3 | Desktop nav carries 4 links, the mobile panel 5 — including Executive Intelligence, a paid add-on absent from the desktop nav. Triangulation hardcodes `#22c55e`/`#f59e0b` in a file otherwise meticulous about routing colour through tokens. |
| 5 | Error Prevention | 2 | The three example chips are the highest-intent, lowest-effort action on the page and all three route to the one known-broken endpoint. Nothing prevents a visitor walking into it; the chips invite it. |
| 6 | Recognition Rather Than Recall | 3 | The idle worked example is the best recognition decision on the page. Pricing's "Everything in Starter"/"Everything in Growth" forces upward re-reading across four columns with no comparison table. |
| 7 | Flexibility and Efficiency | 2 | **No `scroll-margin-top` anywhere in `marketing.css`** — one inline instance on `#simulator`. With a sticky nav at ~64–72px, every wayfinding link in the nav, mobile panel and footer lands with its target eyebrow tucked under the bar. `scroll-behavior: smooth` sits on `.marketing-root`, a non-scrolling div, so it does nothing. |
| 8 | Aesthetic and Minimalist Design | 3 | 8,343px desktop, **13,278px mobile**. Five consecutive card grids (03→08); the "Roman clause / *italic blue clause*" h2 mould used ten times without variation. The restraint pass worked — what remains is structural excess, not decorative. |
| 9 | Error Recovery | 2 | The failure copy says "Below is a worked example of **the same output**". It is not the same output — it is an unrelated hardcoded healthcare IT-operations panel. The `mailto:` escape with the brief prefilled is genuinely good and rescues this from a 1. |
| 10 | Help and Documentation | 3 | The 8-item FAQ answers this buyer's real objections. But the security answer makes database-layer claims with no DPA, no security page, no sub-processor list, and the only human channel before commitment is a raw `mailto:`. |
| **Total** | | **26/40** | **Acceptable — upper-middle of the real band** |

Applicable maximum **40**; heuristics 7 and 10 both genuinely apply.

**Trend: 15 → 24 → 26.**

## Design Specificity Verdict

**LLM assessment: authored, with a template spine running down the middle.** A generic B2B SaaS could not swap its logo into the hero, the simulator, or Principles without the page collapsing. It could swap into sections 04–08 tomorrow and nobody would notice.

Genuinely authored: the 00–10 section numeral system, which comes from the product's own thesis of versioned addressable artifacts; the simulator as the hero of the argument, with `/api/demo` printed in its chrome bar telling a technical buyer this is a real call and not a video; Principles at 03 with falsifiable claims; the EI gated chain, where the locked step is flat and unfilled rather than greyed with a padlock; and Fraunces at `opsz 144` with the SOFT axis lit only on italics.

Category-interchangeable: **sections 03→08 are five consecutive card grids** with the same container, the same `minmax(220–280px, 1fr)` auto-fit and the same 1.25rem gap. The h2 mould is used ten times without variation — superb once, invisible by "Common *questions.*" The hero data rail is the SaaS stat bar with a terminal skin: a search principal measures time-to-slate and client acceptance rate, not how many agents you wrote.

**The biggest missed opportunity:** the page numbers its sections 00–10 and then makes those numerals `aria-hidden`, `pointer-events: none`, `user-select: none`. The most authored idea on the page is inert decoration. A fixed left rail showing `00 01 02 ●03 04…` with the current section lit would be wayfinding, product metaphor and structure in one element. Instead the page ships a generic hamburger below 1120px.

**Second missed opportunity:** the page never shows what a Mandate *artifact* looks like — no shortlist, no ranked slate, no versioned spec diff. For a product whose noun is "a slate that defends itself in the minutes", not showing the minutes is a strange omission.

**Deterministic scan.** The JSX is **clean**: `page.tsx`, `_components/` (11 files) and `layout.tsx` each returned **0 findings, exit 0**. B validated this rather than trusting it — a canary TSX with bounce easing and tiny type returned exit 2 with the expected rule, and `.impeccable/` contains no `config.json`, so no rules are suppressed. B's own caveat is worth carrying: static regex mode missed the canary's 9px text, `#ccc`-on-`#fff` and 20×20 button, so read this as "no slop patterns in markup", not "no defects".

**In-page overlay: 33 findings** (down from 37), identical on the scroll-top pass and the fully-settled re-scan: `numbered-section-labels` ×9, `layout-transition` ×8, `all-caps-body` ×6, `undersized-ui-text` ×3, `low-contrast` ×3, plus `ai-color-palette`, `hero-eyebrow-chip`, `radial-spotlight-glow`, `em-dash-overuse` ×1 each.

**Overlay server** started on port 8400 and **stopped**, verified dead; dev server on :3001 confirmed still serving 200.

## What's Working

1. **Every round-2 P0 is verifiably closed, measured under the conditions that would expose it.** With JavaScript genuinely disabled (`javaScriptEnabled: false`, `matchMedia('(scripting: enabled)').matches === false`), **24 of 24 reveal wrappers render at opacity 1**, all 11 sections are visible and 8,572 characters of body text are present. The SSR `<h1>` is byte-identical to the hydrated one and its computed accessible name is `"One line in. A defensible shortlist out."` — correct, despite `textContent` reading the phrase twice, because the sr-only/aria-hidden pair is wired properly. Zero invalid list nestings, zero single-child stagger wrappers, and no width leaves a pricing tier alone on a row.

2. **The accessibility layer is now genuinely solid, not nominally so.** 28 headings, exactly one `h1`, **zero skipped levels**. The skip link is the first tab stop with a target that exists, and animates to a 164×44 target with a branded ring. All 7 collapsed FAQ panels carry `inert` *and* `max-height: 0`, so no answer text leaks to assistive tech. All 8 `role="region"` panels are named via `aria-labelledby` pointing at real ids. Zero controls without an accessible name. The mobile nav is textbook: Escape closes it, reapplies `hidden`, and returns focus to the trigger. Under `prefers-reduced-motion`, **0 animations and 0 stranded wrappers**. 0 console errors and no hydration mismatch.

3. **The failure path contains the outage completely.** B probed `document.body.innerText` for `credit balance`, `anthropic`, `req_[A-Za-z0-9]{10,}`, `invalid_request_error`, `Plans & Billing` and bare status codes — **all absent**. The worked example survives at **791 characters before and after**, byte-identical, and the `mailto:` escape prefills the body with the visitor's typed mandate so the founder's inbox sorts by intent.

## Priority Issues

### [P0] The failure path still claims to show the visitor's output, and shows someone else's

The error strip reads *"The live simulator is offline right now. Below is a worked example of **the same output** — we'll run your actual mandate with you instead."* What renders below is `SimulatorIdle` — a hardcoded Director-of-IT-Operations, private-healthcare panel, the same one that was on screen before the visitor typed. There is no per-brief fallback anywhere in the component.

Today **100% of visitors who engage with the simulator reach this string.** To a search principal, "the same output" applied to an unrelated example is the page's own auditability claim failing live, in the one place they were told to check it. It also discards a strong signal: the visitor just told you the exact mandate they are running.

**Fix.** Ship pre-computed `DemoResult` fixtures — one per `TYPING_EXAMPLES` entry, generated by the real pipeline and committed as JSON. Make the three chips resolve from fixtures instantly and locally, so the zero-typing path works forever at zero cost and shows the *full* result view rather than the idle summary. Reserve `/api/demo` for free text; on failure render the nearest fixture inside `SimulatorResult` behind a header strip reading `PRE-COMPUTED RUN · NOT YOUR BRIEF — <role>`, and change the copy to *"We can't run your brief live right now. Here is a complete pre-computed run for a comparable mandate, and we'll run yours with you."*

**Suggested command:** `/impeccable harden`

### [P1] Every wayfinding link lands under the sticky nav

`scroll-margin-top` appears exactly once in the entire surface — inline on `#simulator`. A grep of `marketing.css` returns **zero** `scroll-margin` declarations. With `.m-nav` sticky at ~64–72px, `#how`, `#intelligence`, `#pricing` and `#executive-intelligence` — reached from the desktop nav, the mobile panel and the footer — all land with the section eyebrow at or under the translucent bar. Separately `scroll-behavior: smooth` is declared on `.marketing-root`, a non-scrolling `<div>`, so it does nothing.

On a 13,278px mobile page the nav *is* the navigability argument, and ten mis-registered links read as sloppiness on a page selling precision.

**Fix.** `html { scroll-behavior: smooth; scroll-padding-top: 5.5rem; }`, wrapped in `@media (prefers-reduced-motion: no-preference)`. Delete the `.marketing-root` declaration and the inline `scrollMarginTop`. Share a `--nav-h` custom property between the nav, the mobile panel's hardcoded `top: 64px`, and the new scroll padding.

**Suggested command:** `/impeccable polish`

### [P1] Three manufactured-liveness signals survive on a page selling auditability

- `"System online"` with a live dot is a **static span**, `aria-hidden`, backed by nothing — a health claim shown only to sighted users while `/api/demo` is down.
- `SimulatorProgress` advances "Reading brief → Researching company → Calibrating model → Generating queries" on a fixed 2200ms interval, decoupled from the request.
- The hero rail animates 17, 12, 5, 4 up from zero via `CountUp` — static architecture facts rendered as live meters.

The codebase already articulates the exact principle at stake, in a comment written when `CountUp` was removed from the Triangulation scores: *"animating them as though they were being computed is the one thing a page arguing for auditable numbers must not do."* That correction was never propagated. Three surviving instances mean the page applies its own standard inconsistently — which is precisely what a skeptic pattern-matches on.

Worse, it is discoverable: Riley opens devtools, sees `[simulator] upstream failure: …` logged during the request, and learns the four progress steps were theatre while the call was in flight. **That same console line also leaks the billing state and a `request_id`** to anyone with devtools open — the DOM is clean, the console is not.

**Fix.** Delete the `m-nav__live` block, or wire it to a real `GET /api/demo/health` and let a degraded state be a proof point. Replace the four fake steps with an honest indeterminate state — one line reading `ANALYSING · 00:07` with a real elapsed counter — and keep named steps only if you stream real server events. Drop `CountUp` from the hero rail. Downgrade the client `console.error` to the status code only.

**Suggested command:** `/impeccable clarify`

### [P1] Nobody is home: a zero-customer page with no human provenance

No founder name, no background, no company registration, no "why we built this". The single human reference is "A founder reads every request" at ~95% scroll depth, and the only pre-commitment channel is a raw `mailto:`. Meanwhile the FAQ makes hard infrastructure claims — row-level security, private storage, signed URLs, "we never train models on your data" — with nothing a buyer's counsel can be handed.

With no logos and no testimonials, the founder's track record is the *only* remaining credibility instrument, and it is unused. A search principal evaluating a tool that threatens their model asks "who is this person and have they ever run a search?" before they ask about features.

**Fix.** Add a provenance block between Principles (03) and How It Works (04) — deliberately **not** a card grid, since five already run consecutively: a two-column editorial block, one column a named founder statement with search background, the other three verifiable operating facts each linking to a real document. Add `/security` and `/dpa` routes even if thin.

**Suggested command:** `/impeccable shape`

### [P2] Traffic-light scoring contradicts Principles three sections earlier

Triangulation hardcodes `#22c55e` (91) and `#f59e0b` (83), and `three-circle-alignment.tsx` formalises it: ≥70 good, ≥45 warn, <45 risk, applied to the medallion stroke and both pills. Green/amber/red is the universal grammar of pass/caution/fail, so the colour is doing evaluative work the copy explicitly disclaims — an amber caution light next to a named human being, three sections after "No hire or no-hire verdict is produced anywhere in the product."

The caveat that was added — "Illustrative shape of the output — not live data" — governs the score list only. The `ThreeCircleAlignment` diagram sits in a separate `Reveal` in the adjacent column with no caveat near it, carrying the largest number on the page (an **87** in a medallion), and its `aria-label` states the scores as fact. On mobile the caveat and the diagram are separated by the entire three-row score list.

**Fix.** Remove the `TONE` mapping; render all three magnitudes in `var(--accent)` at varying opacity or bar length — alignment is a magnitude, not a judgement. Move the caveat under the h2 so it governs both columns, and prefix the SVG's `aria-label` with "Illustrative example." Route the hardcoded `#6b6b7e` SVG labels through `var(--fg-muted)`; at 9–10px with 0.2em tracking they measure **3.92:1**, the worst contrast on the page.

**Suggested command:** `/impeccable colorize`

### [P2] Mobile defects at the two places that matter most

- **The Analyze button wraps to two lines at 390** — `ANALYZE` and `→` break because `.m-sim__submit` has `padding-inline: 1.625rem` with no `white-space: nowrap` and no stacking rule below 420px. The primary proof control is visibly broken at the most common phone width.
- **`.m-chip { min-height: 40px }`** — 4px under the 44px floor the rest of the file enforces deliberately. At 390 each chip stretches near-full-width with its label wrapping to two centred lines while the accent dot stays pinned far left, so the three chips read as a ragged stack rather than a row.
- **`a.m-nav__brand` is 26×44 at 390** — height passes, width fails.
- **7 of 8 FAQ answers are unreachable without JavaScript.** The text is in the DOM at `max-height: 0`, but the panels cannot be opened. The no-JS fix made the page *readable*; the FAQ is the one section where it did not make it *usable*.

**Suggested command:** `/impeccable adapt`

## Corrections to the deterministic evidence

Three findings in this run were measurement artifacts, and B caught two of them itself before reporting:

- **The overlay polluted its own contrast sweep.** After injecting `detect.js`, the first sweep returned 29 failures, **17 of which were the overlay's own badges** (`#00005f` on `#010050`). B killed the server and reloaded clean before every measurement. Uncontrolled, this run would have reported 17 phantom contrast failures against the page.
- **The skip link measured off-screen** because the Tab walk sampled during its `top: -64 → 8` slide. Re-measured after a 500ms settle it is correctly on screen. Uncontrolled, this would have been reported as a broken skip link.
- **B's one claimed accessibility gap does not reproduce.** It reported the loading state as "visual-only and never announced" from a sample at +400ms. Re-tested here: the `role="status"` region reads *"Analysing the mandate. This takes about thirty seconds."* at **150ms**, and is empty by 400ms — because with credits exhausted the request 502s in under 300ms. The region works; the in-flight window is simply shorter than the sample. With a working API it holds for the full run.

Correctly identified as non-defects: the disabled Analyze button at 2.22:1 (WCAG exempts disabled controls), the 11 section numerals at 1.03–1.05:1 (all `aria-hidden`, `rgba(...,0.024)` watermarks), and the "duplicated" `h1` text (an artifact of reading `textContent` rather than the accessibility tree).

## Minor Observations

- **The muted token sits on the pass/fail line.** `#7f7f93` is applied to **51 elements** and measures between **4.47:1 and 4.59:1** depending on which panel it lands on. Three instances genuinely fail at 4.47:1 on `#0f192e`. Five more pass by less than 0.1 — including the Note badge at 4.52:1. One step darker on any panel flips more of those 51 into failure. This is a token-level decision, not five spot fixes.
- **13 of 45 interactive elements fall back to the UA focus ring** — `a.m-nav__brand`, the 3 chips and all 8 FAQ buttons render `outline: auto 1px` instead of the branded `solid 2px`. Visible, so not a failure; inconsistent, so a craft gap. There is no global `:focus-visible` fallback rule.
- **`.m-reveal-scale` defines exactly 4 delays and both consumers have exactly 4 children.** Zero headroom: a fifth pricing tier or chain step silently drops out of the stagger.
- **Pricing CTAs discard the visitor's chosen intent** — all four link to bare `/request-access`. Use `?plan=agency` and echo it back in the form header.
- **The 4th pricing tier breaks the baseline grid** — "Contact sales" renders at a different size and weight than the `$399 / $999 / $1,899` amounts, so the four headline rows do not align.
- **The three example chips look like status tags, not buttons** — same `.m-chip` class as the 12 non-interactive Stack chips, distinguished only by an inline `cursor: pointer`. The one-click path into the demo is camouflaged as decoration.
- **The Analyze button ships `disabled` at `opacity: 0.45`** while the typewriter animates a full brief inside the input — a first-timer sees text in the field and a dead button and concludes the demo is broken before touching it.
- **`ScrollProgress` attaches a non-throttled `scroll` listener** that reads `scrollHeight` inside the handler — a forced layout read per scroll event on a 13,000px document.
- **`.m-sim__body { min-height: 460px }`** is tuned to the idle example; a short result will float in dead space.
- **The FAQ default-opens item 0**, so the section opens with a wall of security prose rather than eight scannable questions. Opening "Does it replace my judgment?" instead would meet the question this audience actually arrived with.

## Questions to Consider

1. **The page numbers itself 00–10 and then makes the numbers untouchable.** What if the numeral system *were* the navigation — a fixed left rail, current section lit, click to jump? One element that is simultaneously wayfinding, product metaphor and structure, and that no competitor can copy without looking derivative.
2. **The product's noun is "a slate that defends itself in the minutes." Where are the minutes?** What if section 06 were a real redacted shortlist with its trade-off paragraph, version stamp and approver, at full editorial width? That is the only asset on this page a competitor cannot fake.
3. **Would the page be stronger if the simulator's failure were designed as a feature rather than patched as an error?** "Live runs are metered — here are four complete pre-computed runs, and here is the button to run yours with a human" is *more* credible than an always-on demo, costs nothing, never breaks, and matches the approval-first positioning the rest of the page already argues.
4. **Five card grids in a row.** What if only one section were allowed to be a grid — Principles as full-width editorial statements, HowItWorks as a single continuous instrument, EI as a document mock? The page loses nothing in content and gains a shape.
5. **The page has no author.** For a product whose entire argument is "a human is accountable for every decision", is an anonymous page not a live refutation of its own thesis?
