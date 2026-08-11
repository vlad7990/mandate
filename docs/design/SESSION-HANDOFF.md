# Session handoff — Mandate marketing homepage

**Written:** 2026-08-11 · **Repo state at handoff:** `main` @ `cd07a2e`, clean, pushed to `origin`.

---

## 1. Environment gotchas — read these first

| Gotcha | Detail |
|---|---|
| **Two clones exist** | Work in **`~/Documents/Projects/mandate`** (current). `~/Mandate Recruiting/mandate` is a STALE clone at `ce4e7a5`. The Playwright MCP is rooted at the stale one, so its screenshots land in the wrong tree — the browser itself is fine, only file paths are wrong. |
| **`tsc` false errors** | If tsc reports `" 2"`-suffixed duplicate identifiers (`cache-life.d 2.ts`), run `rm -rf .next` first. Documented in `CLAUDE.md`. |
| **Never `rm -rf .next` while `npm run dev` is running** | It strips the manifests and every route 500s. Kill the dev server first. |
| **Supabase auto-pauses** | Free tier, ~7 days idle. Project ref `xipyqnltkbtywxqyxupf`. Restore via MCP `restore_project`; takes minutes and reports `COMING_UP` with an empty `public` schema mid-restore — that is NOT data loss, wait for `ACTIVE_HEALTHY`. |
| **Working rules** | In `CLAUDE.md`: never commit or push without explicit approval, conventional commits, **no attribution footer**, green gate (`npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`) before any commit. |

---

## 2. 🔴 Open item that is NOT code

**Anthropic API credits are exhausted.** `POST https://getmandate.io/api/demo` returns:

> `Your credit balance is too low to access the Anthropic API.`

The live simulator is the homepage's centrepiece and the only proof a prospect can verify (the product has zero customers). It now **fails gracefully** — a plain message, the worked example stays on screen, a Try again button — but nobody sees the product actually think. **A top-up is worth more than any remaining design work.**

---

## 3. What was done

A dual-agent `/impeccable critique` scored the homepage **15/40** (Nielsen), 6 of 8 cognitive-load failures. Six commits closed every P0, P1 and P2:

```
cd07a2e  triangulation pills onto clear lens intersections
c820f0b  remove decorative motion and glow (43 animations → 3, 21 glows → 0)
1f26a4d  mobile navigation
fdaeb1d  section renumbering + single commercial story
8f87270  font identity, live simulator, consistency sweep
acd0707  homepage rebuilt on the imported Claude Design spine
```

**The three findings that would each have ended an evaluation:**

1. **Fonts never loaded.** `.marketing-root` redeclared `--font-display/-body/-mono` in terms of themselves on the same element carrying next/font's variable classes → CSS cycle → invalid → the whole page silently rendered in Inter across every prior deploy. Fixed by deleting the redeclaration; next/font already defines them.
2. **Simulator broken three ways** — chips poked `.value` on a React-controlled input (React wiped the field), errors printed the raw upstream payload including the billing message, and any failure unmounted the worked example.
3. **Final CTA** rendered a rotating unclipped conic-gradient slab across itself.

**Also fixed:** primary CTA clipped 900–1125px; section numerals (were `00,02,03,03,05,06,07,09,08,09,10`); agent count 14/12/31 → 17; `hello@mandate.ai` → `hello@getmandate.io`; LinkedIn homepage link; `MOST POPULAR` on a zero-customer tier; guardrail titles now negated ("Never decides for you"); "Psychology Module" renamed (it contradicted the stated ban on psychological labels — legal exposure); three conflicting commercial stories reduced to one; mobile nav added; triangulation pills moved off the medallion.

---

## 4. Known remaining issues (from the critique, unfixed)

- **Stagger wrappers are inert.** All five `.m-reveal-stagger` / `.m-reveal-scale` wrappers have exactly one child, so the 50/90/110ms delays never apply. `Reveal` only handles `div|section|ul`, so `as="ol"` silently falls back to a div.
- **Two invalid `ul > ul` nestings** (Principles, Pricing) — created by wrapping a `<ul>` in `<Reveal as="ul">`.
- **Dead CSS estate, now larger.** The restraint pass *disabled* rules rather than deleting them. Unused: `.m-pipeline`, `.m-pipeline-cascade`, `.m-ticker`, `.m-feature-card`, `.m-card--danger/--warn`, `.m-reveal-cascade`, `.m-display--shimmer`, plus the newly neutralised animations.
- **No `<main>` landmark and no skip link** on a long page with ~23 links.
- **`TypewriterReveal`** puts `aria-label` on a bare `<span>` (prohibited on `role=generic`) with no `aria-live`, so half the `<h1>` is invisible to assistive tech. It also renders `text.slice(0,0)` on the server, so first paint and crawlers see an `<h1>` reading only "One line in."
- **Hero animation order:** `.m-hero-trust` has no entrance animation while `.m-hero-ctas` is delayed 900ms — the disclaimer renders before the offer it disclaims.
- **FAQ chevron** renders as an ✕ when closed (reads as "dismiss", not "expand").
- **Footer brand mark** is an empty rounded blue square with no `M`.
- **4th pricing tier orphans** onto its own row at ~1152px.
- **`AGENTS.md`** is headed "The 14 Mandate Agents" with the 3 EI agents listed separately — the origin of the 14-vs-17 drift.

---

## 5. Next step

Re-run the critique. Three heuristics scored 0–1 (Consistency 0, Error recovery 0, User control 1) and all three were driven by things now fixed; the design-specificity verdict rested largely on the decorative layer that is now gone. A fresh score shows where the real ceiling is.

```
/impeccable critique src/app/(marketing)/page.tsx
```

It requires **two isolated sub-agents** (A: design review, B: detector + browser evidence). Start a dev server on `:3001` first. The skill's `SUBAGENT_AUTHORIZATION` directive treats invoking it as authorization to spawn them.

---

## 6. Broader project context

Other design docs in this folder, all committed:

- `MANDATE_COMPANY_BRIEF.md` — what Mandate is, voice, what must never be claimed. **Section 8 (goals/ambitions) is deliberately blank and needs the founders.**
- `MANDATE_DESIGN_HANDOFF.md` — full product/design dossier, 750 lines.
- `MANDATE_SCREEN_INVENTORY.md` — 73 screens + 15 states with status and dependencies.

**Blocked on business input:** the Executive Intelligence add-on price (blocks the whole billing build, spec'd in `docs/superpowers/specs/2026-08-10-billing-design.md`), and the positioning brief (blocks every marketing page beyond Home).

**The 13 other Claude Design mockups** live in project `f6c4031e-c28e-450f-8ef1-353834d79b78` (read via the `DesignSync` MCP). `06 App Shell.dc.html` is the one that unblocks the other 38 app screens.
