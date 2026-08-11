---
target: src/app/(marketing)/page.tsx
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 3
timestamp: 2026-08-11T02-57-26Z
slug: src-app-marketing-page-tsx
---
Method: dual-agent (A: design review, isolated · B: detector + browser evidence, isolated)

Browser note: the Playwright MCP exposes a single shared browser, so parent-captured frames (1440/390, hero + full) were handed to A and exclusive browser control was given to B. Both assessments ran in parallel and neither saw the other's output. A's design-specificity verdict was formed before any detector data existed.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | The 4-step progress tracker advances on a fixed 2200ms timer (`live-simulator.tsx:371-376`), not on real work — "Researching company" lights up for a request that already 502'd. B measured `aria-live: 0` and `role="status": 0` site-wide. |
| 2 | Match System / Real World | 3 | Prose is practitioner-fluent ("mandate", "slate", "anti-patterns"). But the hero rail's `MODULES 31 / DIMENSIONS 5 / PERSPECTIVES 4` (`page.tsx:206-211`) are internal units with no buyer referent. |
| 3 | User Control and Freedom | 2 | No cancel during a pending run (`live-simulator.tsx:205`); no dismiss on the error strip; no way to clear a result. "Try again" re-fires an identical request with no backoff — B confirmed it fires exactly 1 request and fails identically. |
| 4 | Consistency and Standards | 2 | Numerals skip **02 and 06**, use **03 twice**; watermarks run a different sequence entirely (`00,02,04,05,06,07,08,09,10`). Agent count is **17** on-page, **14** in the meta description/OG card, **12** modules in prose, **31** in the hero rail. |
| 5 | Error Prevention | 2 | The simulator fires a known-to-fail request with no pre-emption and no client-side length validation; a 1-char input round-trips to a 400. |
| 6 | Recognition Rather Than Recall | 3 | Strong: the idle example teaches the output shape before you act; chips prefill. Weak: pricing requires recalling "HM Portal"/"Triangulation" from ~6,000px earlier with no link back. |
| 7 | Flexibility and Efficiency | 2 | Applicable — there is a real tool. Enter submits and chips prefill, but the generated Boolean queries (the one artifact a recruiter would take away) have no copy button, no permalink, no export. |
| 8 | Aesthetic and Minimalist Design | 3 | The type system is genuinely excellent and disciplined. Against it: 11 sections, 9 instances of "Request Access", 6 undefined stat readouts, ghost numerals rendering behind the mobile CTA. |
| 9 | Error Recovery | 2 | Architecture is right — upstream body withheld (B confirmed **zero** billing-text leak into the DOM), `role="alert"` present, worked example survives byte-identical (761 chars before and after). Undone by copy that asserts a falsehood (see P1-c). |
| 10 | Help and Documentation | 2 | The FAQ is the best-written content on the site, but there is no docs link, no security page, no human contact beyond a `mailto:`, and panels hard-cap at `max-height: 480px; overflow: hidden`. |
| **Total** | | **24/40** | **Acceptable — significant improvements needed** |

Applicable maximum: **40**. Heuristics 7 and 10 were *not* marked n/a: this Persuade surface carries a genuinely interactive tool and a substantive FAQ, so both apply.

One contested score: B's evidence (no `aria-live` anywhere, plus a progress tracker provably decoupled from request state) argues heuristic 1 down to **2**, which would make the total 23. Kept at 3 because the idle/worked-example state does communicate system shape well.

## Design Specificity Verdict

**LLM assessment (formed before detector output): authored skin, template skeleton.** Roughly 3 of 11 sections could not be swapped into another company; the other 8 could be, in an afternoon.

Genuinely authored:
- **The simulator's idle state** (`live-simulator.tsx:265-363`) — three columns mirroring the exact shape of the live result, weight bars at 26/22/18%, and "A draft. In the product you edit and approve it before anyone is scored against it." It ships an intentionally *unfinished* artifact as its hero proof, which is the argument rendered as an object. No template does this.
- **The `m-chain` gated sequence** (`page.tsx:982-1029`) — four links with `approved`/`current`/`locked` states, version metadata, and a step reading "Assessment — Human-authored." The single best-authored component on the page; it *demonstrates* the guardrails everything else merely asserts.
- **Principles** (`page.tsx:1040-1086`) — a full section of negatives at the same weight as the feature sections. Almost no SaaS page has the nerve.

Category-interchangeable: Pricing (four-across cards + ribbon + ✓ bullets), Stack (feature-trio), How It Works (four numbered step-cards), Triangulation (score-bar dashboard trope), the hero composition, the FAQ accordion, and the CTA footer.

The character lives **entirely in the skin**. Underneath is an 11-section vertical scroll in the standard beat order. The visual language itself is coherent and disciplined — near-black `--bg: #08080d`, hairline rules, mono uppercase labels, one accent blue, ghost numerals — but a visitor's spatial memory of this page will match every other AI B2B page they saw this week.

**The biggest missed opportunity:** the page never once puts a *human approving something* on screen. Human-approval is the product's non-negotiable thesis and it is asserted in prose four separate times (`page.tsx:158`, `398`, `319-320`, `961`) and never shown. `m-chain` is 80% of the way there.

**Deterministic scan.** The JSX is **clean**: `page.tsx`, `_components/`, and `layout.tsx` each scanned **exit 0, zero findings**. All **8** CLI findings resolve to a single file, `marketing.css` (3,187 lines), reached via `layout.tsx`:

| Rule | Severity | Line(s) |
|---|---|---|
| `gradient-text` ×2 | warning/slop | 1641, 1649 |
| `bounce-easing` ×3 | warning/slop | 1947, 2015, 2015 |
| `layout-transition` ×2 | warning/quality | 984, 1297 |
| `codex-grid-background` ×1 | advisory/slop | 140 |

**In-page overlay** (injection succeeded): **37 findings across 10 rules** — `undersized-ui-text` ×9 (10px functional text: AGENTS, MODULES, DIMENSIONS, PERSPECTIVES, INTELLIGENCE, CALIBRATION…, below an 11px floor), `layout-transition` ×8, `numbered-section-labels` ×8, `all-caps-body` ×5 (up to 44 chars of uppercased body text), `low-contrast` ×2, `ai-color-palette` ×1, `hero-eyebrow-chip` ×1, `line-length` ×1 (~96 chars/line), `radial-spotlight-glow` ×1, `em-dash-overuse` ×1 (18 em-dashes).

**What the detector caught that the design review missed:** the 10px functional-text floor violations (9 of them, all in the hero rail — the same section the review independently called the weakest content, for different reasons); the 18 em-dashes; the ~96-char line length; and the fact that the restraint pass left `gradient-text` and `bounce-easing` rules *in the stylesheet* even though the page no longer triggers most of them.

**Confirmed false positives:** `gradient-text` ×2 — a live DOM scan for `background-clip: text` returns **0 elements**; the rules are dead CSS. `bounce-easing` at line 2015 (`icon-bounce`) has no matching element (hover-only). The other two bounce findings are real: **12 live elements** run `chip-pop` with the `cubic-bezier(0.34, 1.56, 0.64, 1)` overshoot. Separately, an initial contrast sweep flagged 34 items at ~1.0:1 — an artifact of `.m-reveal { opacity: 0 }` collapsing foreground onto background; re-measured with reveal state normalized, the real count is 2.

**Visual overlays** are live in the **[Human]** browser tab. The overlay server (port 8400, pid 70023) was started for this and has been **stopped and verified dead**; the dev server on :3001 is untouched and still running.

## Overall Impression

This is a page whose *craft* now clearly exceeds its *coherence*. The restraint pass worked — 0 console errors, no horizontal overflow at any of 390/768/1152/1440, `prefers-reduced-motion` properly honored (with reduced motion emulated, `getAnimations()` returns 0 **and** all 24 reveal wrappers settle at opacity 1), a correct keyboard disclosure implementation on the mobile nav with Escape returning focus to the trigger, and a simulator failure path that contains the upstream error perfectly. Those are real engineering wins and several of them are better than most shipped marketing sites.

What holds it at 24 is not decoration any more. It is **three structural facts**: the page does not exist without JavaScript, the page contradicts itself about its own size, and the page's honest content sits 7,000px below its overclaiming content.

The single biggest opportunity: **the product's thesis is human approval, and there is nothing on this page a human can approve.** Make the visitor press one Approve button inside the simulator and the differentiator stops being a paragraph.

## What's Working

1. **The simulator's failure architecture is senior work, and B's measurements prove it.** The error strip is inserted *above* the worked example rather than replacing it — `.m-simout` measured **761 characters before the request and 761 after the failure**, byte-identical. The upstream billing message, the `request_id`, and the 502 appear **nowhere in the DOM** (verified across every `[class*="err"], [role="alert"], [aria-live]` node). Retry fires exactly one request and preserves the input value. The decision to keep proof on screen through a failure is the difference between a broken demo that costs you the sale and one that costs you nothing.

2. **The typographic system carries real voice and somebody actually computed the contrast.** Fraunces at `opsz 60` for display, JetBrains Mono at 0.16–0.2em tracking for labels and numerals, Hanken for body — three roles, no drift. `--fg-muted` was chosen to clear 4.5:1 and the CSS comment records the measurement (`marketing.css:56-57`); `--accent-fill` exists specifically because white on `#3b82f6` measures 3.68:1 (`marketing.css:1191`). B's independent measurement confirms the scale: `#7f7f93` gives 5.10:1 on page background, 4.82:1 on cards.

3. **Reduced-motion is handled properly, which is rarer than it should be.** With `prefers-reduced-motion: reduce`, animations drop to 0, infinite animations drop to 0, and — critically — **no reveal wrapper is stranded invisible**. The team clearly thought about this failure mode. Which makes the JS-disabled failure mode below all the more conspicuous: the same content is protected in one scenario and lost in the other.

## Priority Issues

### [P0] The page does not exist without JavaScript, and the `<h1>` is half-empty to every crawler

**What.** `.m-reveal { opacity: 0 }` (`marketing.css:517`) is cleared only when `Reveal`'s IntersectionObserver adds `is-visible`. B measured the raw SSR HTML: **48 `m-reveal` occurrences, 0 `is-visible`, and no `<noscript>` anywhere.** The page is `export const dynamic = "force-static"` (`page.tsx:12`), so it ships as static HTML whose entire body below the hero is invisible until hydration.

Same root cause, separate symptom — the served `<h1>` is:
```html
<h1 class="m-display"><span class="m-hero-headline-1">One line in.</span><br/>
<em><span style="display:inline"><span aria-label="A defensible shortlist out."></span></span></em></h1>
```
The second clause is an **empty span carrying only an `aria-label`** — and ARIA prohibits naming `role="generic"`, so that label is dropped. Measured hydration timeline: t=0 `"One line in."` → 800ms `"One line in.A▌"` → **4000ms** full string. The LCP text element is not final for four seconds.

**Why it matters.** Google, LinkedIn unfurls, in-app webviews, Reader mode, print, and any slow-hydration visitor get a black rectangle under a headline reading "One line in." — which says nothing about what Mandate does. This is a total conversion loss in every one of those cases, and it silently caps SEO.

**Fix.** Invert the default: ship visible, and have a tiny inline `<head>` script add a `js-reveal` class to `<html>` that *applies* the hidden state, so the failure mode is "no animation" rather than "no page." Minimum viable stopgap: add `<noscript><style>.m-reveal,.m-reveal-stagger>*,.m-reveal-cascade>*,.m-reveal-scale>*{opacity:1!important;transform:none!important}</style></noscript>` to `(marketing)/layout.tsx`. For the headline, render the full string server-side and animate a clip/mask over it instead of building text character-by-character in state — this also deletes the prohibited span `aria-label`.

**Suggested command:** `/impeccable harden`

### [P0] The page contradicts its own counts, and the share card contradicts the page

**What.** Four incompatible numbers describe one system: `17_SPECIALIST_AGENTS` (`page.tsx:131`) and "All 17 AI agents" (`page.tsx:739`); **"14 intelligent agents"** in `PAGE_DESCRIPTION` (`layout.tsx:29`) — which is what renders in Google results and LinkedIn previews; "Twelve specialised modules" (`page.tsx:523`); `MODULES 31` (`page.tsx:207`). B independently confirmed the meta/body split.

Section numbering is separately broken. Eyebrows in DOM order: `01 / The problem`, `03 / Live`, `03 / How it works`, `04 / Stack`, `05 / The fusion layer`, `07 / Guardrails`, `08 / Pricing`, `09 / Questions`, `10 / Get started` — **02 and 06 absent, 03 used twice.** The decorative watermarks run a *different* sequence entirely: `00, 02, 04, 05, 06, 07, 08, 09, 10`.

**Why it matters.** This product's only differentiator is that its outputs reconcile and its records are auditable. The homepage is the first record the buyer audits and it does not reconcile — and the buyer is an executive-search principal whose actual professional skill is catching documents that contradict themselves. For this brand this is not a typo class of error; it is a category refutation. It is also free to fix.

**Fix.** Export `AGENT_COUNT = 17` and `MODULE_COUNT = 12` from one module and consume them at `page.tsx:131`, `207`, `523`, `739` and `layout.tsx:29`. Delete the `MODULES 31` tile or relabel it with a unit a buyer understands. Drive numerals and eyebrows from a single ordered array so each index appears exactly once in both. Reconcile `AGENTS.md`, which still says 14 and is the origin of the drift.

**Suggested command:** `/impeccable clarify`

### [P1] The conversion destination is a visibly different product

**What.** `/request-access` (`request-access/page.tsx:11-50`) uses Material 3 tokens (`bg-surface-container`, `text-on-surface-variant`), a Material Symbols icon font, and `font-h1`/`text-body-main` utilities. None of the `m-*` system, none of the three fonts loaded in `(marketing)/layout.tsx`, none of the terminal register.

**Why it matters.** Peak-end rule. On a Persuade surface with zero customers, craft *is* the credibility instrument — and the instrument is dropped at the precise instant the visitor commits. The last impression becomes "the polished part was the brochure." Compounding it: "we reply within 48 hours" exists only *after* the click (`request-access:44-47`), so the one reassurance that reduces the fear of submitting your name arrives too late to do any work.

**Fix.** Move `/request-access` inside the `(marketing)` route group so it inherits `marketing.css` and the font variables. Re-skin with `m-card`, `m-btn m-btn--primary`, `m-mono--label`. Move the 48-hour promise up to the landing CTA (`page.tsx:1160-1162`).

**Suggested command:** `/impeccable polish`

### [P1] Below 719px there is no visible CTA anywhere on a very long page

**What.** `.m-nav__actions { display: none }` below 719px removes both Log In and Request Access from the sticky bar; the desktop link row is already gone below 1120px. B confirmed at 390 that the nav is a wordmark plus a 44×44 hamburger, and that the mobile menu places its two CTAs at the *bottom* of a seven-item list. The mobile page runs to roughly 16 viewport heights.

**Why it matters.** On the one surface mode where the visitor must *act*, a mobile visitor can act only in the hero or by opening a menu — then scrolls thousands of pixels with nothing on screen to convert into.

**Fix.** Keep Request Access in the sticky nav at all widths; drop the wordmark to the existing `M` mark below 480px to buy room (`page.tsx:50-52`). Add a bottom-anchored sticky CTA below 719px that appears once the hero scrolls out and hides when the CTA footer enters view. Cut length by collapsing How It Works' four step-cards into the `m-pipeline-row` beneath them (`page.tsx:448-464`), which states the same thing better and is currently rendered *smaller* than the generic thing above it.

**Suggested command:** `/impeccable adapt`

### [P1] The simulator's failure copy asserts something untrue, on the page that sells honesty

**What.** The on-screen string, quoted exactly from the live DOM, is:

> **"The simulator is briefly unavailable. The example below is real output from an earlier run."**

The example below is **hardcoded marketing copy** about a private-healthcare IT Operations role (`live-simulator.tsx:274-320`), not a captured run. Two related defects: "Try again" re-submits an identical payload with no backoff or attempt counter, and against an exhausted key it will fail identically forever; and the four progress steps advance on a fixed 2200ms interval regardless of request state.

**Why it matters.** This is the only proof a zero-customer prospect can verify, and its failure path currently makes a false factual claim — on the page whose entire pitch is verifiability. The containment engineering is excellent; the sentence undoes it. (The exhausted credits themselves are a known business fact and are not scored as a design defect.)

**Fix.** Change the copy to what is true and useful: *"The live simulator is offline right now. Below is a worked example of the same output — and we'll run your actual mandate live on a call."* Put a booking or mailto link **inside** the error strip so the failure has an exit. On a second consecutive failure, replace "Try again" with that escalation. Stop advancing the progress steps once the fetch settles.

**Suggested command:** `/impeccable clarify`

### [P2] A cluster of accessibility defects that enterprise procurement will find

Every item below is a **measured** finding, not an inference:

- **No `<main>` landmark** — `document.querySelectorAll('main').length === 0`, and 0 `<main` in raw SSR HTML. All content sits in 11 bare `<section>`s. **No skip link** — first Tab lands on `a.m-nav__brand`. On a page this long, keyboard and screen-reader users have no route past the nav.
- **The primary interactive control has zero focus indication.** `input.m-sim__input` while `:focus-visible` matches: `outline: none 0px`, `border: 0px none`, `box-shadow: none`; ancestors are byte-identical focused vs blurred. **WCAG 2.4.7 failure on the page's most important control.**
- **2 invalid `ul > ul` nestings** confirmed in the live DOM — pricing (`page.tsx:815-816`) and guardrails (`page.tsx:1073-1074`), both from `<Reveal as="ul">` wrapping a `<ul>`.
- **`as="ol"` is silently ignored** — `reveal.tsx` branches only on `div|section|ul`, so `page.tsx:435` renders a `<div>`. Knock-on: the stagger selectors `.m-reveal-stagger.is-visible > *:nth-child(n)` now target **one** child, so the 50ms-per-item stagger never fires on the cards it was written for.
- **Collapsed FAQ panels remain in the accessibility tree** — measured with `aria-expanded="false"`: `display: block`, `visibility: visible`, `max-height: 0`, no `hidden` attribute. A screen reader reads all 8 answers regardless of state. The `role="region"` panels also have no accessible name.
- **8 FAQ questions are absent from the heading outline** — they are bare `<button>`s, so heading navigation skips the entire section.
- **2 real contrast failures**, both `#7f7f93` on blue-tinted surfaces: **4.47:1** on `#0f192e` and **4.24:1** on `#111e37` (the Note callout). The muted scale is engineered to sit within 0.6 of threshold; these two tip under.
- **9 pieces of functional text at 10px** (the hero rail labels), below an 11px legibility floor.
- **8 touch targets under 44×44 at 390** — all footer links at 156×**40**.
- **`span.m-sim__placeholder` overflows by 46px at 390** (`width: 378` against `clientWidth: 375`); the parent clips it so there is no page scrollbar, but the animated placeholder text is cut.
- **No `aria-live` or `role="status"` anywhere** for the loading/success path. The failure path does get `role="alert"` — though it is inserted rather than pre-existing, which some screen readers do not announce.

*Not confirmed:* A flagged `--fg-faint` at ~1.9:1 on the Q1/Q2/Q3 query labels, and an `h4`-under-`h2` skip from `SectionTitle`. B's live outline found **20 headings, one `h1`, no skipped levels** — because both live only in the simulator's *success* state, which never renders while credits are exhausted. Latent, not currently shipping.

**Suggested command:** `/impeccable audit`

### [P2] The pricing grid orphans a tier at 1152px — and argues against the page's own copy

**What.** Measured `.m-price` positions: at 1152 the grid is `339px 339px 339px` and the fourth tier lands **438px below**, alone on row two. (390 → 4 rows; 768 → balanced 2+2; 1440 → single row. No horizontal overflow at any width.)

The deeper problem is structural: this is a four-across self-serve pricing grid with a featured ribbon and identical "Request Access" CTAs on all four tiers — on a page whose hero says "**No trial, no self-serve tier**" (`page.tsx:184-186`) and whose own pricing lede repeats "there is no self-serve signup" (`page.tsx:809-811`). One tier is priced "Contact sales" but its button still says "Request Access." The four tiers are not a decision; they are decoration.

**Fix.** Add a 2×2 breakpoint between 1024 and 1280 to kill the orphan. Then consider whether the grid should exist at all — a single sentence ("Between $X and $Y a month depending on seats and searches; billing starts after your workspace is approved") would remove the largest template block on the page and stop the layout from contradicting the copy.

**Suggested command:** `/impeccable layout`

## Persona Red Flags

**Jordan (first-timer)** — The first content in the hero is `17_SPECIALIST_AGENTS · ONE_ACCOUNTABLE_HUMAN`: snake-case, all caps, no verb. The headline never names the category, so Jordan must reach the third line of the sub-lede to learn this is recruiting software — and the typewriter is still animating the punchline 4 seconds in. The hero rail offers five undefined units. Jordan presses "Run the live simulator", types a real role, gets an amber strip, and has no second proof route. Jordan leaves.

**Riley (stress tester)** — Submits one character: round-trips to a 400 to discover a client-side rule. Presses "Try again" five times: five identical failures, no attempt counter, no backoff. Tabs into the simulator: the input has *no* focus ring and the shell looks identical whether the input or the Analyze button holds focus. Opens the FAQ with a screen reader: hears all eight answers regardless of which is expanded. Disables JS: black rectangle, headline reads "One line in." Opens the four pricing tiers: all four CTAs, same label, same URL, including the "Contact sales" tier.

**Casey (distracted mobile)** — Viewport shows a wordmark and a hamburger; no CTA. The headline breaks over four lines with the payoff word **"out."** orphaned on line four. A ghost numeral renders directly behind the Request Access button, softening the one element that must read as solid. Footer links are 40px tall — 4px under target. The animated placeholder in the simulator is clipped by 46px. If Casey opens the menu, both CTAs sit at the bottom of a seven-item list, below the fold on a small phone.

**Project persona — the executive-search principal whose fees this threatens.** This is the buyer, and they are hunting for overclaiming. In scroll order they find: (1) "Manually, the same decomposition takes a senior recruiter **three days**" (`page.tsx:376-377`) — they *are* the senior recruiter, it takes them ninety minutes, and this inflated claim is presented in the most authoritative-looking container on the page, so everything after it is discounted; (2) "**The feature no other platform has**" (`page.tsx:621`) — an absolute competitive claim from a product wearing a `BETA` chip in its own nav; (3) **fabricated scores** — "Sample Candidate ↔ Sample Company: 91" animated by `CountUp` so it *ticks up like a live readout*, sitting directly beneath a section arguing that Mandate's numbers are defensible; (4) **17 vs 14** between the LinkedIn preview and the page; (5) a **self-serve pricing grid** on a page that twice denies self-serve.

What would actually convert them — Principles, `m-chain`, and FAQ items 3/5/6 — sits **below** all five, behind roughly 7,000px of the claims that already cost the page its credibility. **The honest content is buried under the overclaiming content.** That inversion is the highest-leverage structural fix available and it costs nothing but reordering.

## Minor Observations

- 18 em-dashes in body text; ~96 chars/line at the widest measure (aim <80); 5 instances of uppercased body text up to 44 characters.
- `HeroDataRail` (`page.tsx:196-259`) is 60 lines of inline styles for six tiles — the only section that bypasses the token system wholesale, and the section with the weakest content.
- `TerminalCursor` (`page.tsx:331`) fires a second blinking caret 2,000px below the hero's. The motif reads as a tic on reuse.
- The `--warn` amber on the simulator error border is the same hue as the "Candidate ↔ HM: 83" score bar — amber means "caution" in one place and "second-best" in another.
- `Reveal` uses `threshold` values from 0.05 to 0.2 across ten call sites with no discernible rule.
- `.m-faq__panel { max-height: 480px }` is a magic number; the security answer at 390px is close to clipping.
- Footer column headings are `<h2>`, level-equal to the page's argument sections.
- Two dead component slots (`StatsTicker`, `Features`) remain as comment blocks; `gradient-text` rules remain in CSS with zero matching elements.
- The external LinkedIn link has `rel="noreferrer"` without `noopener` (modern browsers imply it).
- `PAGE_DESCRIPTION` also references "shortlist submission," a phase the page never mentions.

## Questions to Consider

1. **What if the simulator's failure state were the design, not the fallback?** If pressing Analyze *always* returned a real, complete, previously-captured run — labelled honestly ("Run #47 · 12 March · 31s") — and the live path became an upgrade gated behind an email, you would ship proof that never breaks and turn provenance honesty into a feature instead of a false sentence.
2. **Why can't the visitor approve something?** The thesis is human approval and the page has zero approval affordances. An editable weight and an "Approve this bar" button in the simulator's third column is thirty seconds of interaction no competitor can copy, and it teaches the differentiator by muscle memory rather than paragraph.
3. **If you deleted the Pricing section entirely, what would you lose?** Zero customers, no self-serve tier, approval-gated access, one tier already priced on enquiry. The grid tells the buyer you are a subscription tool at the moment you want them thinking partner.
4. **What is the shortest version of this page that still converts?** Hero → simulator → Principles → CTA is four sections. What are 04, 05, 06, 08 and 09 earning against their scroll cost?
5. **The visitor's real fear is "will this make me look stupid in front of my client?"** The page answers accurate, secure, auditable. It never answers the fear. "Set the bar before you see the faces" is the closest — and it's the last headline instead of the first.
6. **What would this page look like with exactly one number on it?** A terminal is credible because every figure has a source and a unit. What if the only quantity were one the visitor could verify themselves, inside the simulator?
