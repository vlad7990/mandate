# Mandate — Design Handoff Dossier

**Version:** 1.0 · **Date:** 2026-08-10 · **Source commit:** `dd5deca`
**Purpose:** Everything a visual/product design system needs to reconstruct Mandate without reading the repository.

**Provenance of this document.** Every route, status value, role, and constraint below was read from the live codebase, the live Supabase schema, or a rendered browser session — not inferred from filenames. Where something is *not* built, it is labelled **PLANNED** or **RECOMMENDED**. Where something needs a business decision, it is labelled **NEEDS BUSINESS INPUT**. Nothing here is invented.

---

# 1. Product Overview

## What Mandate is

Mandate is an **AI operating system for executive search**. A recruiter types one line — *"Head of IT Operations for RBC Capital Markets"* — and the system decomposes it into a structured mandate, researches the company, generates a role specification, builds a weighted scoring model, writes sourcing queries, parses CVs, evaluates candidates against the calibrated model, ranks them into tiers, and produces a defensible shortlist.

It is not a chatbot with a recruiting theme. It is a **pipeline of 17 specialist AI agents**, each with a defined trigger and output, writing into a shared database that the application orchestrates. The recruiter reviews, edits, and approves at every meaningful step.

## Who it is for

Boutique and mid-size **executive search firms** and **in-house talent teams** running senior/executive mandates — roles where a bad hire costs seven figures and the process must be defensible to a board.

## The core problem

Executive search is judgment work performed under bad conditions: dozens of CVs, a hiring manager whose stated requirements drift from their revealed preferences, no consistent scoring, and no audit trail. Decisions get made on recency and charisma, then rationalised afterwards.

Mandate makes the judgment **explicit, weighted, versioned, and traceable** — while keeping a human accountable for every decision.

## What makes it different

1. **Calibration before evaluation.** The scoring model is derived from a structured intake and approved *before* any candidate is scored, so the bar is set before the faces appear.
2. **Triangulation.** Candidate research, hiring-manager research, and role requirements are fused into a single view of fit — not just "does the CV match the JD".
3. **Executive Intelligence** (below) — structured, auditable executive due diligence.
4. **Decision support, never decisions.** No hire/no-hire verdicts anywhere.

## What Executive Intelligence is

**Executive Intelligence (EI)** is the premium module. It answers one question:

> Has this candidate *demonstrated* the experience, judgment, leadership capability, operating scale, and company-stage fit required to succeed in **this** executive role — not "did they interview well."

It works as a **gated chain**, each step requiring human approval of the previous one:

```
Executive Search (intake + company context)
   └─ Success Profile          — AI-drafted, human-approved  → competency weights become operational
        └─ Linked Candidate    — from the organisation pool
             └─ Interview Plan — AI-drafted per candidate, human-approved
                  └─ Assessment — HUMAN-AUTHORED. No AI. Evidence + 4-level ratings
                       └─ Risk Review (PLANNED)
```

**Why EI is not a generic AI surface — this is the most important thing for a designer to internalise:**

- **Approved artifacts are immutable at the database layer.** A trigger rejects any edit to an approved record, for every role including the service account. Changes create a *new version*; the old one is archived, never overwritten.
- **Approval identity cannot be forged.** The approving user is derived from the session inside a database function, not passed in by the client.
- **The audit trail is append-only.** 23 defined event types, no UPDATE or DELETE permitted.
- **The app computes the facts; the AI only words them.** Competency coverage and evidence strength are calculated server-side from the approved data. The agent proposes; the application reports truthfully. Hallucinated competency keys are dropped in post-processing.
- **The Assessment has no AI at all.** The recruiter records evidence themselves.

The interface must therefore feel like a **system of record for a regulated decision**, not a conversation. Versions, approvals, timestamps, and provenance are the primary content, not chrome.

## How AI is used, and where humans stay in control

17 agents. Every one produces **decision support**. Hard prohibitions enforced in the prompts and repeated in the UI:

- No hire/no-hire verdicts
- No psychological or mental-health labels
- No inference of protected characteristics
- No deception detection
- No audio/video/facial/voice analysis
- Evidence-based statements only

Humans approve every artifact. Generation alone never becomes operational truth — competency weights only take effect when a human approves the profile.

## Main business workflows

1. **Core recruiting** — mandate → calibration → sourcing → candidates → ranking → shortlist → hiring-manager feedback → report
2. **Executive Intelligence** — search → success profile → linked candidates → interview plans → assessments → (risk reviews, planned)
3. **Network** — cross-project candidate pool, de-duplicated into people
4. **Admin** — access approval, skills authoring, waitlist triage
5. **Billing** — PLANNED (spec complete, not built)

---

# 2. Personas

**Roles implemented in code** (`users.role` check constraint): `admin`, `recruiter`, `hiring_manager`, `viewer`.
**Account states** (`users.status`): `active`, `pending`, `suspended`.

Everything below is mapped to those four. Personas marked *(inferred)* describe a real human who uses the product but has no distinct role value yet.

## 2.1 Recruiter / Executive Search Consultant — `recruiter` — PRIMARY

The product is built for this person. They live in it daily.

- **Goals:** fill the mandate with a defensible slate; avoid wasting weeks on the wrong profile
- **First thing they need:** which of my searches is stalling, and what is the next action
- **Frequent tasks:** create mandate, run onboarding intake, review/edit job spec, upload CVs, read evaluations, adjust ranking, build shortlist, log notes, send HM portal link
- **Decisions:** who advances, how the model recalibrates after feedback, what the client sees
- **Concerns:** defensibility, speed, not looking foolish in front of the client
- **Dashboard should answer:** what needs me today

## 2.2 Organisation Administrator — `admin`

- **Goals:** keep the workspace running; control access
- **Reality today:** an `admin` can view workspace settings but **cannot edit anything** — the settings screen has zero inputs and states *"Only founders can approve pending users or change the organisation."* **NEEDS BUSINESS INPUT** (§9.6)
- **Needs:** member list, pending approvals, role changes, plan/usage, audit visibility

## 2.3 Hiring Manager — `hiring_manager` + the token portal

Two distinct surfaces:
- **In-app** (`hiring_manager` role) — not yet a distinct experience; sees the recruiter UI
- **Token portal** (`/hm/[token]`) — **public, unauthenticated, no account**. A hiring manager opens a link, reviews the slate, submits structured feedback. This is the only external-facing product surface and the only one a client ever sees. It must be flawless and must never leak internal or billing state.

- **Goals:** see the slate, react, be heard
- **Concerns:** time. They will give you 4 minutes on a phone.

## 2.4 Viewer — `viewer`

Read-only participant (analyst, coordinator, partner reviewing a colleague's search). No write surfaces designed yet. **RECOMMENDED:** a genuine read-only treatment (§9.5).

## 2.5 Founder / Operator *(inferred — hardcoded allowlist, not a role)*

Three founder emails are hardcoded in a database function. Founders auto-provision into the `Mandate HQ` workspace as `admin`/`active`; everyone else lands `pending` with no organisation and must be approved.

- **Exclusive tasks:** approve waitlist requests, approve pending users
- **Screens:** `/app/settings/waitlist`
- **Note:** "founder" is a boolean flag plus an email allowlist, *not* a role value. Any UI implying a founder tier must reflect that.

## 2.6 Assessor / Interviewer *(inferred — no role value)*

The human who runs an interview and records evidence in an EI Assessment. Today this is the recruiter. If assessments are ever delegated to panel members, this becomes a real role and needs its own scoped screen. **PLANNED / product decision.**

## 2.7 Billing Administrator *(inferred — PLANNED)*

No billing exists. The spec assumes billing is managed by an `admin`. **NEEDS BUSINESS INPUT:** whether billing is a separate permission.

---

# 3. Information Architecture

## 3.1 Public website

### Exists today (6)

| Page | Route | Notes |
|---|---|---|
| Home | `/` | Single long-scroll: hero, ticker, problem, live simulator, how-it-works, agent stack, triangulation, features, pricing, FAQ, CTA footer |
| Sign in | `/auth/signin` | Password reset and SSO are visible but disabled ("coming soon") |
| Sign up | `/auth/signup` | Creates a `pending` account |
| Pending approval | `/auth/pending` | Post-signup holding screen |
| Request access | `/request-access` | Waitlist form → notifies founders |
| HM portal | `/hm/[token]` | Public, tokenised, unauthenticated |

Nav currently: Platform · Intelligence · Live Demo · Pricing (anchors into the single page) + Log In + Request Access. Links show ≥900px only; **no mobile menu exists**.

### Recommended (see §15 for rationale)

Platform · Executive Intelligence · Pricing (standalone) · Security · Trust Center · Solutions · Enterprise · Resources/Blog · Docs · About · Contact · Changelog · Legal (Privacy, Terms, DPA) · Careers

**Do not build:** Customers, Case Studies, Success Stories, or any logo wall — there are **zero customers** in the database. Fabricated social proof is the fastest way to destroy the executive trust this product sells. Design the *slots*; leave them unpopulated.

## 3.2 Authenticated application — actual route hierarchy

```
/app/home                                   Portfolio command (dashboard)

/app/projects/new                           Create mandate (one-line input)
/app/projects/[id]                          Project workspace — agent tiles + intelligence panels
  /onboarding                           Calibration intake wizard
  /spec                                 Job spec editor (versioned) + diff panel
  /sourcing                             Boolean/X-Ray/ATS queries + version history
  /app/candidates                           Candidate list for the mandate
    /new                                CV upload
    /[candidateId]                      Candidate detail (largest screen in product)
  /ranking                              Leaderboard + tiers
    /compare                            Head-to-head picker
  /comparison                           Master comparison table + export
  /shortlist                            Shortlist builder + trade-off report
  /feedback                             Recruiter feedback → recalibration
  /hiring-manager                       HM portal share-link management
  /calibration-history                  Calibration versions + restore
  /reports                              Weekly report generation
  /metrics                              Search health

/app/candidates                             Candidate portfolio (all mandates)
  /network                              Global Executive Network (person-deduped)
  /search                               Natural-language candidate search

/app/executive-intelligence                 EI module overview / map
  /searches                             Executive searches list
    /new                                Executive intake
    /[id]                               Search workspace
      /success-profile                  Generate → edit → approve
      /app/candidates                       Link candidates from org pool
        /[candidateId]/interview-plan   Generate → edit → approve
        /[candidateId]/assessment       Human scorecard → approve
  /templates                            Role templates
  /competencies                         Competency library

/app/analytics                              Portfolio analytics
/app/settings                               Workspace settings (read-only today)
  /skills                               Skills studio (custom evaluation lenses)
    /new · /[skillId]
  /waitlist                             Access requests (founder-only)
```

**38 application page routes.** Plus a persistent **Copilot panel** available on every authenticated screen.

### Recommended app hierarchy changes

- **Billing** under Settings — PLANNED
- **Team / Members** under Settings — MISSING
- **Profile / Account** — MISSING
- **Global search / command palette** — the sidebar and topbar both show a disabled `terminal` control implying one exists. Build it or remove the affordance.

---

# 4. Screen Inventory

The full checklist lives in `MANDATE_SCREEN_INVENTORY.md`. This section gives the depth for the screens that carry the product.

> **Universal rules for every authenticated screen**
> - App shell: sidebar + topbar + content. Copilot panel floats.
> - Every screen needs: populated · empty · loading · error · no-permission · mobile
> - Breadcrumb rail on all nested routes
> - Exactly one `h1` per screen (three screens currently violate this)

---

### S-01 · Dashboard — `/app/home` — *recruiter, admin*

- **Purpose:** answer "what needs me today" in under five seconds
- **Primary action:** open the mandate that needs attention · **Secondary:** new mandate
- **Shows today:** `PORTFOLIO COMMAND` heading, mandate list, counts
- **Empty state (exists):** *"No active mandates yet."*
- **Needs (§12):** at-risk searches, candidates awaiting review, recent changes, next-best-action, agent activity
- **Components:** KPI tiles, project cards, activity feed, priority list
- **Responsive:** KPI row 4→2→1; project cards → stacked list

### S-04 · Project Workspace — `/app/projects/[id]` — *recruiter*

The hub of the whole product.

- **Purpose:** show mandate state and what to do next
- **Distinctive element — the Agent Stack.** Live tiles per agent with four states: `IDLE / STAND-BY`, `ACTIVE`, `QUEUED`, `COMPLETE`. Currently reads e.g. `ACTIVE INTAKE` · `ACTIVE RESEARCH` · `QUEUED SPEC` · `AWAITING CALIBRATION`. **This is the most distinctive interface idea in the product — preserve and elevate it.** It communicates that a pipeline is genuinely running.
- **Intelligence panels:** Company Context · Client Psychology · Culture · HM Intelligence · Health Suggestions
- **Known defects:** **no `h1`** (outline is `H3, H3`); **3 of 5 buttons disabled**
- **States:** analysis-in-progress (polling), generation-failed, awaiting-calibration gate
- **Responsive:** agent tiles 4-up → 2-up → 1-up; panels stack

### S-08 · Candidate Detail — `/app/projects/[id]/app/candidates/[candidateId]` — *recruiter*

Largest and most overloaded screen: **1,326 lines, 39 buttons, 6 disabled.**

- **Panels:** identity + editable fields, archetype selector (Builder/Operator/Transformer/Infrastructure), evaluation report, psychology, positioning, triangulation, recruiter assessment, notes, contact, pipeline stage
- **Known defects:** heading outline runs `H1 → H4×7 → H3×4`; `h1` contains an edit button so it announces as *"…Alpha edit"*; icon ligatures leak into headings (*"domainDomain"*, *"trending_upScale"*)
- **Mobile — worst screen in the product:** 32 elements clipped, worst extending to `right: 604px` on a 390px viewport; 36 of 43 interactive elements under 40px
- **Design imperative:** needs tabs or progressive disclosure. 39 buttons on one page is not a hierarchy.

### S-10 · Ranking Leaderboard — `/app/projects/[id]/ranking` — *recruiter*

- **Shows:** ranked candidates, multi-dimension scores, tier bands (`tier_1`…`tier_4`), rank movement history
- **Empty state (good, exists):** *"Nothing to rank yet · 00 RANKED · 04 PENDING PARSE"* — states the count *and* the reason
- **Actions:** Feedback · Refresh Scores · Compare · Full Comparison · Build Shortlist
- **Responsive:** the leaderboard is a dense table — needs a card-per-candidate mobile form, not a squeezed table

### S-13 · Shortlist Builder — `/app/projects/[id]/shortlist`

Select a slate (top 3/5/custom), generate a trade-off report. Drag/select interaction, side-by-side trade-offs, export.

### S-14 · Comparison Table — `/app/projects/[id]/comparison`

Master table, all candidates × all dimensions. **The densest surface in the product** — the primary test of the table system. Needs frozen first column, horizontal scroll with visible affordance, and a genuine mobile strategy (one candidate at a time with a switcher).

### S-20 · EI Search Workspace — `/app/executive-intelligence/searches/[id]`

**The best-executed screen in the product today.** Its empty states explain the mechanism rather than announcing absence:

> *"Not yet generated. The Role Architect drafts it from this intake and the company research; you review and approve."*
> *"No candidates linked yet. Attach candidates from the organization pool to begin due diligence."*

- **Shows:** search header with `DRAFT`/`STANDARD` chips, success-profile card, candidates card, intake brief, company context
- **Use this copy standard everywhere else.**

### S-21 · Success Profile — `.../success-profile`

Generate → edit → approve. 15 sections: mission, mandate, outcomes, capabilities, scale, derailers, non-negotiable gaps, competency weights, interview stages.
**States:** gate (no company context) · empty · generating (polling) · generation-failed · draft-editable · **approved = read-only forever** · superseded/archived.
**On approval,** recommended competency weights are written into the operational table. Generation alone changes nothing. Show that consequence in the approval confirmation.

### S-23 · Interview Plan — `.../[candidateId]/interview-plan`

Per-candidate, versioned. Stages with objective, interviewer *role*, duration, assigned competencies, core/follow-up/candidate-specific questions, evidence to listen for, weak-answer indicators, red flags.
**Server-computed competency coverage panel** — covered vs uncovered against operational weights. The app computes this; the agent cannot influence it. Design it as a factual meter, not a score.
**Gate:** requires an approved Success Profile **and** a linked candidate.

### S-24 · Assessment — `.../[candidateId]/assessment`

**Human-authored. There is no AI on this screen.** Pre-structured from the approved interview plan: one row per competency in weight order, `source_stages` pre-filled.
- **4-level evidence rating:** Strong · Moderate · Limited · No evidence observed
- Free-text evidence per competency
- **Server-computed weighted evidence strength**, recalculated on every save, never trusted from the client

**Labelling is a compliance requirement, not copy polish.** It must read as *evidence coverage / strength — how much of the role's weighted competencies have supporting evidence recorded*. It is explicitly **not** a score of the candidate and **not** a hiring recommendation. Design must make that unmistakable — no letter grades, no percentile framing, no green-to-red "quality" gradient.
**Gate:** requires an approved Interview Plan. **Approved = read-only.**

### S-31 · HM Portal — `/hm/[token]` — *public, unauthenticated*

The only client-facing surface. Shows the slate and collects structured feedback.
**Rules:** no internal state, no billing state, no other mandates. If the org loses entitlement (once billing ships) it must return a neutral *"link unavailable"* — **never** a billing message, which would leak the customer's payment status to their client.
**Mobile-first.** Assume a phone.

### S-33 · Settings — `/app/settings`

Today: `WORKSPACE SETTINGS`, org name/slug/created, role display. **Zero inputs.** Copy bug: *"You're viewing this workspace as a admin."*
**Needs:** editable org profile, members, roles, billing entry, danger zone.

### S-36 · Waitlist — `/app/settings/waitlist` — *founder only*

Access-request triage: approve/reject. Needs a genuine no-permission state for non-founders.

---

# 5. Workflows

## 5.1 New customer

```
Marketing home → Request Access (waitlist form)
   → founders notified → manual approval
   → Sign up → account created `pending`, no organisation
   → /auth/pending  ("waiting for approval")
   → founder approves → status `active`, organisation attached
   → /app/home  (empty portfolio)
   → New mandate → onboarding wizard → first candidates
```

**Design gap:** there is **no product onboarding**. A newly approved user lands on an empty dashboard with no tour, no checklist, no sample mandate. **RECOMMENDED** (§15).

## 5.2 Mandate (core recruiting)

```
One-line input  ("Head of IT Ops for RBC Capital Markets")
 → Intake Agent decomposes → project created optimistically
 → Company Research Agent (web-search grounded)
 → Onboarding wizard: Mandate Origin → Must-Haves → Anti-Patterns → Stakeholders → Priorities
 → Role Spec Agent → versioned job spec → recruiter edits → finalise
 → Calibration Agent → weighted scoring model
 → Boolean Search Agent → LinkedIn / Google X-Ray / ATS queries
      (exact · broad · adjacent · competitor)
 → Recruiter sources externally, uploads CVs        ← MANUAL. No import integration exists.
 → CV Parsing Agent → structured profile
 → Candidate Review Agent → strengths, risks, fit
 → Ranking Agent → scores + tier_1..tier_4
 → Shortlist Agent → slate + trade-offs
 → HM portal → structured feedback
 → Feedback Agent → interprets → recalibration → re-rank
 → Weekly report / comparison export
```

**Critical for design:** sourcing produces *text to paste elsewhere*. Candidates arrive by manual CV upload. The funnel has no automated front end — the UI should not imply one.

## 5.3 Candidate

```
Uploaded (CV) → parsing (async, polling, placeholder row)
 → parsed → evaluated → scored → tiered
 → pipeline stage advances:
    found → reviewed → matched → shortlisted → submitted
      → interviewed → passed_rounds → finalist → offer → hired
      (or rejected at any point)
 → positioning (submission narrative) → comparison → shortlist
```

11 pipeline stages. The UI must make stage changes cheap and legible — this is the recruiter's most frequent write action.

## 5.4 Executive Intelligence — the gated chain

```
Create Executive Search  (intake: company context 9 fields, role 8, mandate/outcomes 5, service tier)
 → Company Context Agent (web-grounded) → status: none → generating → ready | failed
 → GENERATE SUCCESS PROFILE  (explicit click; never automatic)
      → draft (version n) → recruiter edits → APPROVE
      → approval archives previous, writes competency weights operational, stamps approver from session
 → LINK CANDIDATES from organisation pool
      → link stage: identified → in_diligence → advanced | on_hold | declined
 → GENERATE INTERVIEW PLAN (per candidate; requires approved profile + link)
      → draft → edit → APPROVE
      → server computes competency coverage
 → CREATE ASSESSMENT (requires approved plan)
      → human records evidence + 4-level ratings
      → server computes weighted evidence strength on every save
      → APPROVE → read-only
 → Risk Review (PLANNED — spec exists, migration 040)
 → Final report (PLANNED)
```

**Every step writes an audit event.** 23 types, append-only.
**Every approval is irreversible in place** — corrections create a new version.

**Design implications:**
- Show the chain as a visible progression with locked/unlocked steps. Users should *see* the path, not discover gates by hitting walls.
- Approval is a serious, deliberate action — confirmation with consequences stated.
- Version history and provenance (`prompt_version`, `model_version`, approver, timestamp) are first-class content.
- Never present AI output as conclusion. Frame as draft-for-review until approved.

## 5.5 Billing — **PLANNED, not built**

Spec complete (`docs/superpowers/specs/2026-08-10-billing-design.md`). Decisions locked:

- Flat per-account subscription: **Starter $399 · Growth $999 · Agency $1,899**, monthly only
- **Executive Intelligence sold as a separate add-on** (price **NEEDS BUSINESS INPUT**)
- **No free trial** — access is waitlist + founder-approved
- Seat limits stored but **not enforced** (no membership model exists)
- Five features gated: HM Portal · Triangulation · Calibration history · Global Network · Custom skills

```
/app/settings/billing → Subscribe → Stripe Checkout → return
   → "Activating…" (polls; grants nothing on redirect)
   → webhook confirms → entitlements written
Manage → Stripe Customer Portal (plan change, cancel, payment method, invoices)
```

**States to design:** no subscription (wall) · active · past_due (grace + banner) · canceled (read-only retention) · activating.
**Rule:** gates remove *access*, never *data*.

---

# 6. Component Inventory

## Exists (23 primitives + 6 composed)

| Component | Purpose | Variants | Notes |
|---|---|---|---|
| `MastHead` | Page header | — | Domain-specific; the `h1` carrier. **Not used consistently** |
| `BreadcrumbRail` | Nested-route trail | — | Terminal-style |
| `StatusChip` | Status vocabulary | 6 tones × 3 intensities, dot/icon/pulse | **`danger` tone is broken** — uses undefined `text-error`; repaired at token level in `dd5deca` |
| `KpiTile` | Metric display | — | Dashboard |
| `TierComparison` | Tier bands | — | Ranking |
| `LiveTick` | Live activity pulse | — | |
| `Card`, `Table`, `Dialog`, `Sheet`, `Tabs`, `Select`, `Input`, `Textarea`, `Label`, `Button`, `Badge`, `Avatar`, `Progress`, `Separator`, `DropdownMenu`, `Sonner` | shadcn primitives | | |
| `Chart` / `mandate-charts` | Recharts wrappers | | |
| `Sidebar` / `Topbar` / `UserMenu` | App shell | | See defects below |
| `AgentTiles` | Agent pipeline state | 4 states | **Signature component** |
| `CopilotPanel` | Persistent assistant | | Floats over every screen |

## Shell defects to fix in redesign

- **Sidebar:** fixed 80px, no responsive variant, no mobile drawer; labels at **8px**; icons missing `aria-hidden` so nav announces as *"folder_openProjects"*
- **Topbar:** 40px tall; **all three controls disabled** (`COMMAND_LINE`, `EXPORT_RECAP`, `notifications_paused`); static `MANDATE_CORE // PORTFOLIO`; no page context, breadcrumb, search, or account access
- **Layout:** hardcoded `margin-left: 80px` with `overflow-hidden` — on mobile this *silently clips* content rather than scrolling it

## Recommended new components

Page header (one `h1` pattern) · Mobile nav drawer · Command palette · Empty-state primitive · Skeleton loader set · Error-state primitive · Gate/locked-state (EI chain + plan gating) · Approval dialog (consequences stated) · Version-history timeline · Provenance stamp (model, prompt version, approver, time) · Evidence panel · Competency matrix · Coverage meter (factual, not score-like) · Comparison table with frozen column · Data-density toggle · Upgrade prompt · Toast/notification centre · Confirmation dialog for destructive actions

---

# 7. Data Relationships for Designers

```
Organization  (the tenant — everything is scoped to it)
├── Users                     role: admin | recruiter | hiring_manager | viewer
│                             status: active | pending | suspended
├── Skills                    custom evaluation lenses, injected into agent prompts
│                             type: role_skill | client_skill | search_skill
├── Projects (Mandates)       status: active | paused | closed | filled
│   ├── Onboarding responses  must_haves, anti_patterns, stakeholders, priorities
│   ├── Job Specs             VERSIONED · one final per project
│   ├── Boolean Queries       type: linkedin | google_xray | ats
│   │                         search: exact | broad | adjacent | competitor
│   ├── Calibration History   versioned, restorable
│   ├── Candidates            pipeline_stage: 11 values (found → hired | rejected)
│   │   ├── CV + parsed profile   archetype: Builder | Operator | Transformer | Infrastructure
│   │   ├── Candidate Scores      tier_1 | tier_2 | tier_3 | tier_4
│   │   ├── Notes                 general | call | meeting | email | interview
│   │   └── Rank change history
│   ├── Shortlists
│   ├── Feedback              recruiter_note | hiring_manager | interview_outcome | hm_portal
│   ├── HM Tokens → HM Reviews    (public portal)
│   └── Project Reports
└── Executive Searches        status: draft | active | on_hold | closed
    │                         service_tier: standard | premium | enterprise
    │                         company_context_status: none | generating | ready | failed
    ├── Success Profiles      draft | approved | archived   (VERSIONED, immutable when approved)
    ├── Search Competencies   source: template | ai | manual   ← OPERATIONAL source of truth
    ├── Linked Candidates     → public.candidates
    │                         stage: identified | in_diligence | advanced | on_hold | declined
    │   ├── Interview Plans   draft | approved | archived  (VERSIONED, immutable)
    │   └── Assessments       draft | approved | archived  (VERSIONED, immutable)
    └── Audit Events          APPEND-ONLY · 23 event types
```

**Cross-cutting:** the **Global Executive Network** collapses project-scoped candidate rows into *people*, de-duplicated by email → LinkedIn → name+company. One person, many mandate appearances. This is a distinct mental model from the project-scoped candidate list and deserves a distinct visual treatment.

**Competency weights — the subtle one.** `executive_search_competencies` is operational truth. Success-profile `content_json` holds the per-version *recommendation*. Approving a profile writes recommendations into the operational table; manually-added competencies survive. **Generation alone changes nothing.**

---

# 8. Business Rules Affecting UI

## Access
- Non-founder signups land `pending` with **no organisation** → `/auth/pending`
- Only founders (hardcoded email allowlist) approve users and waitlist requests
- `suspended` → forced sign-out with message
- All data is organisation-scoped by row-level security

## Executive Intelligence — hard rules
1. **Approved artifacts are immutable.** Enforced by database trigger for every role. Editing requires a new version.
2. **One approved artifact per scope** — one approved profile per search; one approved plan and assessment per candidate.
3. **Approval identity is derived from the session**, never client-supplied.
4. **Gate chain:** company context → profile → link → plan → assessment. Each gate is a real DB constraint, not a UI convention.
5. **Audit is append-only.** No edit, no delete.
6. **Server-computed values** (coverage, evidence strength) are recalculated on save and never trusted from the client.
7. **Evidence strength is not a candidate score.** Label accordingly. This is compliance, not copy.

## AI output — non-negotiable
No hire/no-hire · no psychological labels · no protected-characteristic inference · no deception detection · no audio/video/facial analysis · evidence-based only. **Every AI panel must be visibly labelled decision support requiring human judgment.**

## Destructive / confirm-required
Approving (irreversible in place) · unlinking a candidate · restoring old calibration (changes scoring) · rejecting a candidate · revoking an HM token (breaks a live client link) · cancelling a subscription (PLANNED)

## Disabled-state rules
Buttons must be disabled — with the reason visible — when: gate unmet, generation in flight, artifact approved (read-only), user lacks permission, plan lacks entitlement (PLANNED).
**Today the product ships four permanently-disabled controls with no path to enablement. Remove rather than ship dead affordances.**

---

# 9. Visual Direction (current, approved — preserve)

## Personality
**Executive · Editorial · Intelligent · Serious · Premium · Trustworthy.** High information density without hostility. The reference point is a Bloomberg terminal crossed with an editorial newsroom — not a consumer SaaS dashboard, not an AI startup.

**Explicitly rejected:** AI gradients, glassmorphism, neon glow, decorative clutter, playful illustration, emoji-as-iconography.

## Token system (unified in `dd5deca` — single semantic source of truth)

```
Elevation   --bg-sunken #0c0e16 · --bg #11131b · --bg-elev-1 #191b23
            --bg-elev-2 #1d1f27 · --bg-elev-3 #282a32 · --bg-elev-4 #32343d
            --surface · --surface-hover
Text        --fg #e1e2ed · --fg-soft #c3c6d7 · --fg-muted #8d90a0
            --fg-faint #434655   ← DECORATIVE ONLY, fails AA on every surface
Lines       --border #434655 · --border-strong #8d90a0
Accent      --accent #b4c5ff        interactive text/icons on dark
            --accent-fill #2563eb   solid fill under WHITE text (5.17:1)
            --accent-hover #3b82f6 · --fg-on-accent #eeefff
States      --positive #bec6e0 · --info #b9c7e0 · --warning #f59e0b
            --danger #ffb4ab · --danger-surface #93000a · --fg-on-danger #ffdad6
System      --focus-ring (= accent) · --radius 0.625rem
```

**Two accent roles, deliberately.** `--accent` for text/icons on dark; `--accent-fill` for solid fills carrying white text. White on `#3b82f6` is only 3.68:1 and fails AA — `#2563eb` gives 5.17:1. Never swap them.

**Marketing surface** overrides the background ramp one stop deeper (`--bg #08080d`) for editorial contrast. Same vocabulary, documented surface theme — not a second system.

## Typography
- **App:** Inter (UI) · Space Grotesk (mono labels/data) · JetBrains Mono (data)
- **Marketing:** Fraunces (display, SOFT axis on italics) · Hanken Grotesk (body) · JetBrains Mono
- **Recommendation:** bring Fraunces into the product for report and success-profile titles — it is what makes EI read as an executive document
- **Hard floor: 12px.** The product currently ships **8px** nav labels and ~9 sub-11px elements per screen. Density must come from spacing and weight, never from shrinking type below legibility.

## Dark mode
**Dark only.** `<html class="dark">` is hardcoded; no theme provider is mounted. The light palette was dead code and has been removed. Do not design a light mode without a product decision.

## Density — two registers, one system
- **Terminal** — compact, tabular, mono numerics: leaderboards, comparison tables, network, pipelines
- **Editorial** — generous measure, serif headings, real leading: EI, success profiles, assessments, reports

Same tokens, different spacing scale. **This is what makes EI feel like a different class of artifact without becoming a different product.**

## Motion
Restrained. 160–280ms, transform + opacity only. Suppressed under `prefers-reduced-motion` and damped below 640px. Marketing already implements this discipline — extend it into the app rather than inventing new motion.

## Icons
Currently **two systems**: Material Symbols webfont (427 usages / 101 files, render-blocking, ligature text leaking into accessible names) **and** `lucide-react` (5 files). **Consolidate on lucide.** This fixes accessibility, removes a render-blocking third-party font, and drops a duplicate dependency.

## Accessibility requirements
- WCAG **AA minimum**: 4.5:1 body, 3:1 large
- Touch targets ≥44px (inline text links exempt)
- Type floor 12px
- One `h1`, logical heading order (three screens currently violate this)
- All decorative icons `aria-hidden`
- Visible focus ring on every interactive element
- Disabled controls are not focusable — never the only route to information

**Current measured state:** marketing **0 failures** at 1440/1024/390. App shell still fails: 3 on `/app/home`, 7 on project detail; `//` and `·` separators at **1.84:1**.

## Breakpoints
**Desktop 1440+ · Tablet ~1024 · Mobile ~390.**

---

# 10. Website Messaging Architecture

**Universal prohibition:** no fabricated customers, testimonials, statistics, certifications, logos, or case studies. The database contains **one organisation and one user**. Every claim must be traceable to something real.

| Page | Purpose | Audience | Key message | Primary CTA | Proof available |
|---|---|---|---|---|---|
| **Home** (exists) | Explain and convert | Search principals, heads of talent | 17 agents turn one line into a defensible slate | Request Access | **Live simulator** — real API, real output |
| **Platform** (rec.) | How the pipeline works | Evaluators | Calibration before evaluation | Request Access | Real product screens |
| **Executive Intelligence** (rec.) | Sell the premium module | Executive search leaders | Structured, auditable executive due diligence | Request Access | Real EI screens, audit model, immutability |
| **Pricing** (standalone, rec.) | Convert | Buyers | Three flat monthly plans + EI add-on | Request Access | Real prices |
| **Security** (rec.) | De-risk | Enterprise buyers | RLS, immutability, append-only audit | Contact | **NEEDS BUSINESS INPUT** — see below |
| **Solutions / Enterprise** (rec.) | Segment | Firms vs in-house | — | Contact | **NEEDS BUSINESS INPUT** |
| **About / Contact / Legal** (rec.) | Trust basics | All | — | Contact | Real |

**The strongest asset on the site is the live simulator.** It runs a real Claude call with web search against a real endpoint and returns real structured output. That is genuine, demonstrable proof and should anchor the homepage and the Platform page.

**Security/Trust page — hard constraint.** You may describe **architecture that exists**: row-level security on every table, database-enforced immutability of approved records, append-only audit, session-derived approver identity, no audio/video/biometric analysis, explicit AI-safety prohibitions. You may **not** claim SOC 2, ISO, GDPR compliance, pen tests, uptime SLAs, or encryption certifications — none are substantiated, and the project's own checklist still lists an unrotated service-role key, no rate limiting on `/request-access`, and no error monitoring. **NEEDS BUSINESS INPUT.**

---

# 11. Dashboard Requirements

**The five-second test.** Within five seconds of landing, a recruiter must know: *what needs me, what changed, what is at risk, what to do next.*

### Recruiter dashboard (`/app/home`) — primary
- **KPIs:** active mandates · candidates awaiting review · shortlists pending client feedback · at-risk searches
- **Priorities:** "3 candidates parsed and unreviewed on RBC" · "Shortlist sent 6 days ago, no HM response"
- **Risk:** stalled searches (Search Health Agent already computes this — surface it)
- **Recommendations:** next-best-action per mandate, from the Copilot/Health agents
- **Activity:** what the agents did while you were away — this makes the system feel alive and accountable
- **Entry points:** new mandate · upload CVs · open the search needing attention

### Admin — *needs building*
Members, pending approvals, plan/usage, audit. Today an admin sees a read-only page and can act on nothing.

### Founder
Adds waitlist queue and cross-organisation visibility.

### Hiring Manager (portal)
Not a dashboard. One question: *here is the slate — what do you think?* Optimised for four minutes on a phone.

---

# 12. State Coverage

Design **every** state for every screen. Current quality is inconsistent — EI and ranking are good, most screens have nothing.

| State | Requirement |
|---|---|
| **Populated** | Realistic density: 12+ candidates, long names, missing fields |
| **Empty** | Explain *why* and give the next action. Gold standard already in product: *"Nothing to rank yet · 00 RANKED · 04 PENDING PARSE"* |
| **First-use** | Distinct from empty — a brand-new workspace needs orientation, not just "no data" |
| **Loading** | Skeletons matching final layout. Agent work is genuinely slow (web-grounded, 10s–2min) — show *what* is running and let the user leave |
| **Partial data** | Very common: CV parsed but not evaluated; profile generated but not approved |
| **Error** | Distinguish generation-failed (retry) from system error (support). `generation_error` is a real terminal state in the schema |
| **No permission** | Explain who can act, not just "denied" |
| **Read-only / approved** | EI approved artifacts are permanently read-only — must look deliberate and authoritative, not broken |
| **Archived / superseded** | Old versions viewable with clear "superseded by v4" affordance |
| **Canceled plan** | PLANNED — data retained, read-only |
| **No results** | Search/filter with zero matches ≠ empty collection |
| **Success** | Confirm approvals and destructive actions explicitly |

---

# 13. Responsive Expectations

| Surface | 1440+ | ~1024 | ~390 |
|---|---|---|---|
| **Sidebar** | Expanded rail with labels | Icon rail, tooltips | **Drawer behind a hamburger — must not consume layout** |
| **Topbar** | Context + breadcrumb + actions + account | Condensed | Title + menu + one primary action |
| **Dashboard KPIs** | 4-up | 2-up | 1-up stacked |
| **Tables** | Full | Prioritised columns, horizontal scroll with affordance | **Card per row.** Never a squeezed table |
| **Comparison** | Full matrix, frozen first column | Frozen column + scroll | One candidate at a time with switcher |
| **Candidate detail** | Multi-column | Two-column | Single column, tabbed/accordion. **39 controls cannot stack** |
| **Agent tiles** | 4-up | 2-up | 1-up or horizontal scroll |
| **Forms** | Two-column where paired | Single | Single, 44px targets, native inputs |
| **Modals** | Centered | Centered | **Full-screen sheet** |
| **Copilot** | Side panel | Side panel | Full-screen overlay |
| **Reports** | Editorial two-column | Single | Single, generous leading |

**Current mobile reality (measured):** the 80px rail consumes **20.5%** of a 390px viewport leaving 310px; candidate detail clips **32 elements** with content extending to `right: 604px`; `overflow-hidden` means clipped content is **unreachable, not scrollable**. Mobile is a rebuild, not an adjustment.

---

# 14. Missing But Recommended

| # | Item | Why | Type |
|---|---|---|---|
| 1 | **Mobile navigation** | No mobile nav exists; product unusable below ~900px | Design + engineering |
| 2 | **Team / Members management** | `organizations` has no write UI — no members, invites, or role changes. Blocks multi-user | Product + engineering |
| 3 | **Profile / Account screen** | No way to change your own name, email, or password | Design + engineering |
| 4 | **Billing surfaces** | Spec complete, unbuilt | Engineering (spec'd) |
| 5 | **Product onboarding** | Approved users land on an empty dashboard with no guidance | Design |
| 6 | **Global search / command palette** | Two disabled `terminal` controls already imply it exists | Design + engineering |
| 7 | **Notification centre** | `notifications_paused` icon is decorative | Product decision |
| 8 | **Public Platform / EI / Pricing / Security pages** | Everything lives on one scroll page; no linkable destinations for sales | Design + content |
| 9 | **Legal pages** (Privacy, Terms, DPA) | Required before paid customers | Business + legal |
| 10 | **Read-only `viewer` experience** | Role exists in schema, no treatment designed | Design |
| 11 | **Candidate import** | CVs are uploaded one at a time; no bulk/ATS/LinkedIn import | Engineering |
| 12 | **Risk Reviews (EI 2d)** | Spec'd, migration 040 | Engineering (spec'd) |
| 13 | **Final EI report** | Chain ends at Assessment; no export artifact | Design + engineering |
| 14 | **Error monitoring / status page** | On pre-launch checklist | Engineering |

**Do not build without real inputs:** Customers · Case Studies · Testimonials · Logo walls · Compliance certifications.

---

# 15. Claude Design Generation Plan

Ordered by real dependency — each batch consumes the previous one.

### Batch 1 — Design System *(blocks everything)*
Tokens (semantic set above) · type scale with 12px floor · two density registers · buttons · forms · cards · tables · status chips · badges · icon set (lucide) · focus/hover/disabled states · skeletons · empty/error primitives · motion tokens

### Batch 2 — App Shell *(blocks every app screen)*
Sidebar (desktop rail / tablet icons / **mobile drawer**) · topbar with real context + breadcrumb + account · page-header primitive (one `h1`) · content containers · Copilot panel · responsive behaviour at all three breakpoints

> Shell before screens. Every current shell defect — 8px labels, dead controls, hardcoded margin, silent mobile clipping — is inherited by all 38 screens.

### Batch 3 — Core Recruiting
Dashboard · project workspace + agent tiles · onboarding wizard · job spec editor · sourcing · candidate list · **candidate detail (needs restructure)** · ranking · comparison · shortlist · feedback

### Batch 4 — Executive Intelligence
EI overview · searches list · executive intake · search workspace · success profile (all states) · candidate linking · interview plan + coverage panel · assessment + evidence strength · approval dialogs · version history · audit trail · gate/locked states

> EI carries the premium positioning. It needs the editorial register and the strongest state design in the product.

### Batch 5 — Reports & Client-Facing
Weekly report · comparison export · shortlist trade-off report · **HM portal (mobile-first)** · PDF layouts

### Batch 6 — Settings, Admin, Billing
Workspace settings (editable) · **members/roles (new)** · **profile/account (new)** · skills studio · waitlist triage · **billing surfaces (planned)** · upgrade/gated states

### Batch 7 — Public Website
Home (refine) · Platform · Executive Intelligence · Pricing · Security · Solutions · About · Contact · Legal · mobile nav

### Batch 8 — State Sweep
Every screen × empty · first-use · loading · partial · error · no-permission · read-only · no-results · success · mobile

---

# 16. Open Questions — Business Input Required

1. **Executive Intelligence add-on price** — blocks the billing build entirely
2. **Positioning** — what Mandate claims, against whom, for which buyer. Blocks all marketing pages beyond Home
3. **Security/Trust claims** — which, if any, are substantiated
4. **Admin permissions** — should an `admin` be able to edit the organisation and approve users, or is that permanently founder-only? Today admins can do nothing
5. **Canceled-plan behaviour** — read-only retention (assumed) or hard block
6. **Seat enforcement** — advertised as 1/5/unlimited users but unenforceable until multi-tenancy exists
7. **Light mode** — currently dark-only by construction
8. **Assessor delegation** — do panel members get accounts, or does the recruiter record all evidence
9. **Notifications** — is there a real notification model, or should the affordance be removed

---

**End of dossier.** Companion checklist: `docs/design/MANDATE_SCREEN_INVENTORY.md`
