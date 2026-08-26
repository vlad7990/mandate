# GATE — MARKETING PERFORMANCE — 2026-08-26

**Status: DRAFT. Awaiting the founder's written word. Nothing is built.**

Ledger `docs/handoffs/2026-08-13-roles-clients-placements-advisor-action-errors.md`,
last entry §166. Next migration 129; next § 167; next drive 115;
vitest 1105.

---

## 1. The residue this was opened on is STALE, and the real finding is different

§141 closed the Lighthouse + mobile audits with: CLS fixed 0.197 →
0.009, and a residual **mobile LCP of 3.5s** named as "fonts + bundle
under throttle, NOT animations — later perf slice candidate". That
sentence is what option A was offered on.

Measuring before drafting changed the picture twice, and the second
time it changed my own framing, so both corrections are stated here
rather than buried.

**Correction 1 — I first measured a warm cache.** The opening run
reused the browser context this session had been driving all day and
reported LCP 1.5s. Discarded. Every number below is a cold context
with `Network.setCacheDisabled`.

**Correction 2 — I called this a CLS regression. It is not
established as one.** `.m-hero-trust` landed 2026-08-10 (009250e), two
weeks BEFORE §141's fix (335b57d, 2026-08-25), so the element was
already present when §141 measured 0.009. Nothing regressed. What
follows is a blind spot in how §141 measured, which is a different and
more useful fact.

## 2. What the measurements actually say

Production `https://getmandate.io/`, cold, Slow-4G (1.6 Mbps /
150 ms RTT) + 4× CPU, three runs per figure.

### 2.1 The two methods disagree in BOTH directions

| | Lighthouse 12 (simulated / Lantern) | Applied throttling, 390px |
|---|---|---|
| LCP | **5.1 s** (score 0.25 — failing) | 2.2 s |
| CLS | 0.011 (score 1.00) | **0.116** |
| FCP | 1.2 s | 2.2 s |
| TBT | 100 ms | — |
| perf score | 79 | — |

Each method calls the other's headline a non-issue. **We cannot manage
a number we measure two ways, and that is D1.**

### 2.2 The CLS cliff — the finding worth having

CLS by viewport width, applied throttling, cold:

| width | CLS | worst single shift | device |
|---|---|---|---|
| 360 | 0.1203 | 0.0558 | common Android |
| 390 | 0.1157 | **0.1002** | iPhone 12–16 |
| 412 | 0.0111 | 0.0017 | **Lighthouse's default** |
| 430 | 0.0107 | 0.0017 | iPhone Pro Max |

There is a cliff between 390 and 412. Below it the page is in the
"needs improvement" band; at and above it, it is perfect.

**Lighthouse's default mobile emulation is a 412px Moto G — exactly on
the good side of the cliff.** So §141's "mobile CLS 0.009" was
TRUE, and simultaneously blind to every iPhone-width visitor. Desktop
at 1440 is 0.016, also fine. The defect exists only where we never
looked.

### 2.3 The mechanism

At 390px the single worst shift is **0.1002 at t≈2.8s** — after LCP,
i.e. when the webfont swaps. Its sources:

- `P.m-hero-trust` — height 14 → 45, y 830 → 771
- `P.m-lede.m-hero-sub` — moved up 551 → 492
- `SPAN.m-section__numeral` — moved up 596 → 567

`.m-hero-trust` is `max-width: 46ch` (marketing.css:2552). **`ch` is a
font-relative unit**: when the fallback swaps to Inter, `1ch` changes
and the measure changes with it. Computed `max-width` is 361px at every
tested width — so at a 390px viewport minus padding the cap sits within
a pixel or two of the content box, and a small metric change flips the
wrap; at 412+ the container clears 361px and the line count is stable.

There are **ten `ch` max-widths**, all in
`src/app/(marketing)/marketing.css` (lines 415, 1104, 2552, 2744, 3864,
3870, 3894, 3918, 3923, 4704). Only the above-the-fold ones can cost
CLS, but every one of them is a re-wrap waiting for a font swap.

A residual ~0.015 comes from `.m-typewriter-cursor` moving as it
animates — many small shifts, none over 0.007.

### 2.4 Bytes

Cold, 390px: **fonts 235 KB across 6 files**, JS 246 KB, CSS 38 KB,
images 33 KB. Fonts are within 5% of the entire JS payload. Three
Google families are loaded in `src/app/layout.tsx` — Inter (variable),
Space Grotesk (500/600/700), JetBrains Mono (500/700) — none with an
explicit `display`.

---

## 3. DECISIONS — the founder's word is needed on each

### D1 — Which number governs?

Two methods, two contradictory headlines. Pick the authority before
building, or the slice will optimise whichever number it happens to
look at.

- **(a) Both, each where it is strongest.** *(recommended)* The
  applied-throttle harness at **360/390** is the CLS authority,
  because it is the only one that sees the cliff. Lighthouse stays the
  LCP/TBT authority, because Lantern is the industry-comparable model
  and CrUX-aligned. Neither is discarded.
- **(b) Lighthouse only**, with its emulation widened to 390. One
  tool, one number — but Lantern's LCP is a simulation we cannot
  attribute to a cause as precisely.
- **(c) Applied throttling only.** Real observation, but our numbers
  would stop being comparable to anything external.

I recommend (a), and note that whichever is chosen, **the widths must
include 390** or the defect is invisible again.

### D2 — How do we kill the sub-412 shift?

- **(a) Make above-the-fold measures font-independent** — replace the
  `ch` caps on hero text with `rem`/`px` equivalents chosen to match
  today's rendered width. *(recommended)* Surgical, changes nothing
  about how the loaded page looks, keeps `display: swap`.
  ⚠️ Honest limit: this removes the *guaranteed* re-wrap, but a font
  swap also changes glyph metrics, so whether it lands under target
  must be MEASURED, not promised.
- **(b) `display: 'optional'` on the three families.** Kills
  font-driven CLS outright and globally. The cost is real: a
  first-time visitor on a slow connection may see the whole page in
  the fallback font and never the brand face on that load. **This is
  an aesthetic decision, not a technical one, and it is yours.**
- **(c) Reserve space** (`min-height`) on the shifting hero blocks.
  Treats the symptom; the next copy edit re-breaks it silently.
- **(d) Accept it.** Defensible only if you judge sub-412 traffic
  unimportant — which, given iPhone 12–16 are all 390/393, I do not.

I recommend (a), measured, with (c) on the hero only as belt-and-braces
if (a) alone misses the target.

### D3 — The 235 KB of fonts, and the 5.1s Lighthouse LCP

Fonts are ~equal to all JS. Options are cumulative, and all three
carry aesthetic weight:

- Trim weights (Space Grotesk 500/600/700 → two; JetBrains 500/700 →
  one) — cheapest, smallest visual cost.
- Preload only the face the LCP text uses, let the rest arrive late.
- Drop a family outright — the largest saving and the largest change
  to the terminal look.

**I have no recommendation here and will not invent one**: which of
three faces the brand can lose is not a call I should make. If you
want the byte win without an aesthetic decision, say "weights only"
and I will take just that.

### D4 — Scope

- **(a) The homepage hero only.** *(recommended)* That is where the
  0.10 shift is. Smallest diff, clearest proof.
- **(b) All ten `ch` measures across marketing.** Consistent, but nine
  of them are below the fold and cost nothing today.
- **(c) Marketing + the app shell.** The app is behind auth and not
  CrUX-visible; out of scope on this evidence.

### D5 — Does the measurement become a committed harness?

§141's number was correct and still left a hole for six weeks, because
nothing re-ran it at a width that mattered.

- **(a) Commit the harness** as a script (`scripts/perf-probe.mjs`),
  pinned to 360/390/412/1440, run on demand, numbers recorded in the
  §-entry. *(recommended)* Not in CI — it needs the network and would
  be flaky as a gate.
- **(b) Measure ad hoc and record in the ledger only.**

### D6 — The target, and what counts as done

Recommended: **mobile CLS < 0.05 at 360 AND 390**, cold, three runs,
with LCP not regressed against today's figures on either method. The
typewriter residual (~0.015) fixed only if it is cheap.

---

## 4. What this slice will NOT do

Touch the app or portal bundles; change any animation's behaviour
(§141 ruled animations are not the problem and this gate does not
reopen it); add a CI performance gate; introduce a font host other
than `next/font`; or change copy to make text fit.

## 5. Green gate and drive

tsc / vitest / eslint / build → commit → `vercel deploy --prod --yes`
— **`--force`, and verify the rule reached the served stylesheet by
curling the built CSS and grepping**, per §160's standing lesson that
Vercel can ship new JS against cached CSS, which is exactly the failure
mode a CSS-only slice invites. Then **drive 115**: re-measure cold at
all four widths on both methods, before/after in the same table as §2,
and confirm the hero renders unchanged at 390, 412 and 1440.

## 6. What I need from you

A word on **D1, D2, D3, D4, D5, D6**. My recommendations: **D1(a) both,
widths must include 390 · D2(a) font-independent measures, measured ·
D3 YOURS — no recommendation offered · D4(a) hero only · D5(a) commit
the harness · D6 CLS < 0.05 at 360 and 390 with no LCP regression.**

"Confirm the recommendations, weights only" would settle D3 as the
minimum-aesthetic option if you want the byte win without choosing
between faces.
