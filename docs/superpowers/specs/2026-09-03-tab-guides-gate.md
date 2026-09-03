# TAB GUIDES — "WHAT DO I DO ON THIS SCREEN?" — THE GATE — 2026-09-03 — DRAFT

**Awaiting the founder's word.** Five rulings below.

The ask: a training guide for every tab, so a user understands what they
need to do on that specific tab.

---

## Part 1 — What already exists, and why this is not a duplicate

Three assets this stands on rather than reinvents:

1. **`nav-model.ts` is a real single source of truth.** `NAV_ITEMS` —
   **19 tabs** in four groups (Workspace 7, Search 5, Intelligence 3,
   System 4), three of them capability-gated (`Desk`/`desk:manage`,
   `Invoices`/`fees:read`, `Members`/`org:manage`). The sidebar and the
   command palette both read it. A guide keyed off the same list
   inherits that truth.
2. **`lib/handbook/markdown.ts`** — an existing, tested markdown parser
   serving `/handbook` from `docs/handbook/`. No new parser, no new
   rendering path, no MDX.
3. **The dismissal-cookie pattern** from `SampleBanner`
   (`SAMPLE_DISMISSED_COOKIE`) — read on the server, set on the client,
   already solved.

**What exists and does NOT cover this.** `/handbook` is eight chapters
describing the *journey* — requesting access, joining, the mandate loop,
sharing with an HM, what the agents do and never do. It is public,
static, and marketing-side. It answers *"how does an engagement work"*.
It does not answer *"I am standing on Network, what am I supposed to do
here"*, and a user cannot get to the answer without leaving the screen
they are confused by.

Sample data is the other half already built: every screen shows what a
populated version looks like, behind a labelled banner. **A guide should
say what to DO; the sample already shows what it LOOKS like.** They
should not repeat each other.

## Part 2 — The one architectural fact that decides the build

**`PageHeader` is on three screens only** (Portfolio, Mandates,
Candidates) — its own header says so. So a per-page help affordance
means touching ~19 pages and missing the next one somebody adds.

**`Topbar` is in the dashboard layout, on every `/app` page.** One
insertion point, keyed on `usePathname()` → matched to `NAV_ITEMS` →
renders that tab's guide. A tab added to `nav-model.ts` tomorrow gets
the affordance for free, and the guard below forces someone to write its
words.

That makes the whole build: **19 markdown files + one panel component +
one guard test.** No migration, no schema, no new dependency, no
per-page edits.

## Part 3 — What every guide contains (the fixed shape)

Nineteen guides written to one skeleton, so they read as one product and
none of them wanders:

1. **What this screen is for** — one sentence.
2. **What you do here** — two to four concrete actions, in the order a
   real user does them.
3. **What "done" looks like** — how you know you can leave.
4. **What this screen will not do** — the honest section, and the one
   most worth having. §175's defect class is the system asserting what
   it does not know; a training guide that oversells a screen is the
   same defect wearing a friendlier face. Every agent-touching guide
   carries the no-verdict sentence the handbook already uses.
5. **Where this leads** — the next screen in the loop, so nineteen tabs
   read as one workflow rather than nineteen destinations.

**Docs law (handbook D3) applies: the guides describe the product AS
BUILT.** Drafted from the code, and any claim not checkable in the code
does not go in.

## Part 4 — THE GATE (five rulings)

### D1 — Where the guide appears

*Recommendation: a slide-over panel from a `?` in the Topbar, contextual
to the current tab.* It works identically on all 19 tabs from one
insertion point, costs no vertical space on screens that are already
dense, and is dismissible. The alternatives: an inline block at the top
of each page (permanent tax on every visit, forever, on tables that are
already tight at 360px), or a separate `/app/guide` route (which is
`/handbook` again — the user still has to leave the screen).

### D2 — Whether it interrupts

*Recommendation: an unread dot on the `?`, and it never auto-opens.* The
dot clears once that tab's guide has been opened, stored in one cookie.
The user is told help exists without being interrupted nineteen times,
which matches the restraint the terminal voice is built on.

The alternative — auto-open on first visit per tab — teaches faster and
costs nineteen interruptions across the first weeks, each landing on
someone mid-task.

### D3 — Whether the words vary by role

*Recommendation: one guide per tab, written for the person who can act.*
The three role-gated tabs are only rendered to holders of the
capability, so the hardest case is already handled by the nav. Per-role
variants multiply 19 into 60+ and put four near-identical texts out of
sync the first time a screen changes.

Where a screen genuinely differs by role (a viewer cannot write), the
guide says so in one line rather than forking.

### D4 — Scope

*Recommendation: the 19 `/app` tabs only.* The client and HM portals are
a different surface for different people, are only a few screens, and
already carry their own explanatory copy — §144 and §166 wrote it. If
they need this, it is a second slice with its own words.

### D5 — Whether the guides are also public

*Recommendation: yes — the same markdown also rendered as a `/handbook`
section.* Near-free once the files exist, gives a prospect a real look
at the product's surface before requesting access, and gives a user one
page to read end to end rather than nineteen panels to hunt. Single
source of truth, two surfaces, and the guard below watches both.

## Part 5 — The guard

`nav-model.ts` is a single source of truth, and the standing lesson is
that **a single source of truth only ends drift below it — ask what
watches the seam above.** Here the seam above is the words.

`tab-guides.test.ts`, asserting **behaviour**, not source text:

- Every `NAV_ITEM` has a guide file. Add a tab without words and the
  build fails.
- Every guide file maps to a live `NAV_ITEM`. Delete a tab and its
  orphaned guide fails the build.
- Every guide parses with the existing handbook parser and carries all
  five required sections — so none ships with the honest section
  missing, which is the one most likely to be dropped under time
  pressure.

To be **mutation-tested before it is trusted**, per house rule.

## Part 6 — What this is NOT

Not a tour or a coach-mark overlay. Not video. Not per-component
tooltips — that is a third labelling mechanism, and §D3-2026-08-17
already ruled: *do not invent a third one.* Not a change to any screen's
behaviour. No migration, no schema, no new dependency.

---

Numbers if this passes: no migration (**137 stays unclaimed**); vitest
1159 + the new guard; CHECK 99; door 26; allowlist 31; anon roster 14;
capability map 36. One deploy.
