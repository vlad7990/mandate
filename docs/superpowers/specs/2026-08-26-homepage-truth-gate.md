# GATE — THE HOMEPAGE SAYS LESS THAN THE PRODUCT DOES — 2026-08-26

**Status: DRAFT. Awaiting the founder's written word. Nothing is built.**

Ledger last entry §168. Next migration 129 (likely none — this is a
frontend slice); next § 169; next drive 116; vitest 1105.

---

## 1. The finding

The site undersells the product, in two measurable ways.

### 1.1 The agent roster is wrong, not just stale

`src/app/(marketing)/_data/agents.ts` lists **17**. The platform runs
**25** (`public.users where role='agent'`). The lists disagree by NAME,
not only by count.

**Marketed but not a platform principal (5):** Company Research,
Onboarding, Executive Role Architect, Interview Architect, Candidate
Review.

**Live but never marketed (12):** Candidate Engagement, Candidate
Relationship, Candidate Research, Candidate Search, Company
Intelligence, Culture, Desk Digest, Evaluation, Executive Intelligence,
Interviewer, Outreach Strategy, Pre-Screen.

`AGENT_COUNT` derives from the marketing file, so the hero rail, the
meta description, the OG card and `/platform`'s phase map are all
mutually consistent and all wrong — the site says 17 while 25 run.

This is precisely the failure `_constants.ts` was written to end. Its
own header says a homepage that fails to reconcile is "a category
refutation, not a typo". That file closed the drift *inside* marketing;
nothing ties marketing to the platform, so the same class of error came
back one level up.

### 1.2 Whole products have no marketing presence

Homepage occurrences: `invoice` **0**, `placement` **0**, `OKR` **0**,
`portal` **1**, `interview` **2**.

The homepage arc is: problem → live simulator → guardrails → how it
works → stack → fusion layer → Executive Intelligence → pricing → FAQ.
It ends where the product used to end: at a slate. Built since, and
absent from the story —

- **The client portal.** Clients sign in to review the slate, answer
  the search team's questions (which recalibrates the mandate), and
  now read and print their invoices. §163–§166.
- **Invoicing, fees and placements.** Templates, issue, send, delivery
  tracking, the frozen document. §158–§162.
- **Interview plans** — per candidate, and the client interview that
  closes calibration gaps. §143–§145.
- **Call logging**, **OKRs / desk objectives**, the **model registry**,
  **skills vocabulary**, **network / relationship intelligence**, the
  **status page**.

A prospect sees a candidate-pipeline tool. They do not see that it runs
their hiring managers' portal, interviews their own team, or bills them.

The `<title>` already claims "AI Executive Search **Operating
System**". The title is ahead of the body.

---

## 2. DECISIONS

### D1 — Does the marketed roster derive from the platform, or stay curated behind a guard?

This is the decision that determines whether we are back here in two
months.

- **(a) Derive.** One shared source; marketed names ARE platform names.
  Drift becomes impossible. The cost is real: internal names like
  "Desk Digest Agent", "Feedback Interpreter" and "Pre-Screen Agent"
  become public marketing copy, and the desk loses the freedom to name
  things for itself.
- **(b) Curated copy + a structural guard.** *(recommended)* The
  marketing file keeps its own names and ordering, but gains an
  explicit map to platform agent keys plus a `notMarketed` list with a
  reason each. A test fails when the platform roster gains or loses an
  agent that the map does not account for. Same shape as
  `describe.test.ts` pinning the CHECK count — the house's existing
  answer to exactly this problem.
- **(c) Just fix the numbers.** Cheapest today, and it drifts again the
  next time an agent is added — which has happened eight times since
  the file was written.

I recommend (b). (c) is how we got here.

### D2 — What do we claim the count is?

- **(a) The true count, with a curated selection shown.** *(recommended)*
  `/platform` lists all 25 by name; the homepage states the honest total
  and shows a representative subset. No number anywhere disagrees.
- **(b) List all 25 everywhere.** Complete, but the homepage rail
  becomes a wall.
- **(c) Keep marketing a subset and never state a total.** Avoids the
  problem by saying less; loses the strongest single proof point.

### D3 — Which absent surfaces earn homepage presence?

My recommendation is **one new section, not five**: the story's real
hole is that it stops at the slate. One section carrying **the client
portal → placement → invoice** arc closes it. Interviewing folds into
the existing pipeline narrative as a line, not a section. Call logging,
OKRs, the model registry and skills are desk-internal machinery with
low prospect value — I would name them nowhere on the homepage and let
`/platform` carry them.

Tell me if you want any of those promoted; this is a positioning call
and the list above is my judgment, not a fact.

### D4 — Does the pitch change?

Today the arc ends "a slate you defend in the room." The product now
runs the client relationship and the money.

- **(a) Extend the arc** to: one-line brief → slate → the client's own
  portal → placement → invoice. *(recommended)* The `<title>` already
  makes this claim; the body would catch up.
- **(b) Keep the search-tool pitch** and treat portal/billing as
  secondary detail lower down.

(a) is a genuine repositioning and therefore yours, not mine.

### D5 — Scope

- **(a) Homepage + `/platform`.** *(recommended)* They share the
  roster; changing one without the other re-creates the drift.
- **(b) Homepage only** — leaves `/platform`'s phase map claiming 17.
- **(c) Add `/solutions` and `/pricing`.** Wider; no evidence either is
  wrong today.

### D6 — Two house rules that bind this slice

- Any illustrative figure added must be **labelled at the point of
  display** (standing rule). If a new section shows a sample invoice or
  portal view, it says it is a sample.
- Section numerals are a derived sequence (`SECTIONS`, 00–10).
  Inserting a section **renumbers everything after it** — the numerals
  and eyebrows must keep coming from `_constants.ts`, never be retyped.
  That file exists because they drifted once already.

### D7 — Verification

The perf slice (§168) landed hours ago. New sections, images or copy
can regress it.

Recommended: **`node scripts/perf-probe.mjs` must stay green** (CLS <
0.05 at 360 and 390) as part of the drive, alongside a visual check of
the homepage at 390 / 412 / 1440. Any new imagery goes through
`next/image` with explicit dimensions, or it reopens exactly the
layout-shift class we just closed.

---

## 3. What this slice will NOT do

Rewrite `/solutions`, `/pricing` or `/executive-intelligence`; change
pricing; add screenshots of real client data (the portal and invoice
surfaces contain real names — anything shown is sample and labelled);
touch the app; or add a new font (§168).

## 4. Green gate and drive

tsc / vitest / eslint / build → commit → `vercel deploy --prod --yes
--force` → **verify the served CSS chunk** (§160/§167) → **drive 116**:
perf probe green at four widths, the roster count identical on the
homepage, `/platform`, the meta description and the OG card, and the
new section read at 390 and 1440.

## 5. What I need from you

A word on **D1–D5** (D6 and D7 are house rules and verification, not
choices). My recommendations: **D1(b) curated + a drift guard · D2(a)
true count, curated selection · D3 one section covering portal →
placement → invoice · D4(a) extend the arc · D5(a) homepage +
/platform.**

"Confirm the recommendations" is enough if you agree with all five.
