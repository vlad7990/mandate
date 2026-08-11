# Mandate — Screen Inventory Checklist

**Version:** 1.0 · **Date:** 2026-08-10 · **Source commit:** `dd5deca`
**Companion to:** `MANDATE_DESIGN_HANDOFF.md`

**Status key** — `EXISTING` built and rendering · `PLANNED` spec'd, not built · `MISSING` recommended, no spec
**Priority** — `P0` blocks the product · `P1` major value · `P2` polish/completeness
**Personas** — `REC` recruiter · `ADM` admin · `FND` founder · `HM` hiring manager · `VWR` viewer · `PUB` public

---

## A. Public Website

| ID | Screen | Route | Persona | Pri | Status | Desktop | Tablet | Mobile | Dependencies | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| P-01 | Home | `/` | PUB | P0 | EXISTING | ✓ | ✓ | ✓ | Batch 1 | Single long-scroll. Live simulator is the strongest proof asset. 0 contrast failures |
| P-02 | Platform | `/platform` | PUB | P1 | MISSING | ✓ | ✓ | ✓ | P-01, positioning | How the 17-agent pipeline works |
| P-03 | Executive Intelligence | `/app/executive-intelligence` | PUB | P1 | MISSING | ✓ | ✓ | ✓ | positioning | Sells the premium module + add-on |
| P-04 | Pricing (standalone) | `/pricing` | PUB | P1 | MISSING | ✓ | ✓ | ✓ | EI price | Currently only an anchor on Home |
| P-05 | Security | `/security` | PUB | P1 | MISSING | ✓ | ✓ | ✓ | **business input** | Architecture only. No certifications |
| P-06 | Solutions | `/solutions` | PUB | P2 | MISSING | ✓ | ✓ | ✓ | positioning | Firms vs in-house |
| P-07 | Enterprise | `/enterprise` | PUB | P2 | MISSING | ✓ | ✓ | ✓ | positioning | |
| P-08 | About | `/about` | PUB | P2 | MISSING | ✓ | ✓ | ✓ | — | |
| P-09 | Contact | `/contact` | PUB | P1 | MISSING | ✓ | ✓ | ✓ | — | |
| P-10 | Resources / Blog | `/resources` | PUB | P2 | MISSING | ✓ | ✓ | ✓ | content | |
| P-11 | Docs | `/docs` | PUB | P2 | MISSING | ✓ | ✓ | ✓ | content | |
| P-12 | Changelog | `/changelog` | PUB | P2 | MISSING | ✓ | ✓ | ✓ | — | |
| P-13 | Legal — Privacy | `/legal/privacy` | PUB | P1 | MISSING | ✓ | ✓ | ✓ | **legal** | Required before paid customers |
| P-14 | Legal — Terms | `/legal/terms` | PUB | P1 | MISSING | ✓ | ✓ | ✓ | **legal** | |
| P-15 | Legal — DPA | `/legal/dpa` | PUB | P2 | MISSING | ✓ | ✓ | ✓ | **legal** | |
| P-16 | Careers | `/careers` | PUB | P2 | MISSING | ✓ | ✓ | ✓ | — | |
| P-17 | Sign in | `/auth/signin` | PUB | P0 | EXISTING | ✓ | ✓ | ✓ | — | 0 contrast failures. Reset + SSO disabled |
| P-18 | Sign up | `/auth/signup` | PUB | P0 | EXISTING | ✓ | ✓ | ✓ | — | Creates `pending` account |
| P-19 | Pending approval | `/auth/pending` | PUB | P0 | EXISTING | ✓ | ✓ | ✓ | — | Holding screen |
| P-20 | Request access | `/request-access` | PUB | P0 | EXISTING | ✓ | ✓ | ✓ | — | 6 inputs, all labelled. No captcha |
| P-21 | Password reset | `/auth/reset` | PUB | P1 | MISSING | ✓ | ✓ | ✓ | — | Link exists but disabled |

**Public total: 21 (6 existing, 15 missing)**

> **Never build:** Customers · Case Studies · Testimonials · Logo walls — zero customers exist.

---

## B. Application — Shell & Dashboard

| ID | Screen | Route | Persona | Pri | Status | Desktop | Tablet | Mobile | Dependencies | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| S-00 | **App shell** | all | all | **P0** | EXISTING | ✓ | ✓ | ✓ | Batch 1 | **Blocks all 38 screens.** 8px labels; 4 dead controls; hardcoded 80px margin; no mobile nav; silent clipping |
| S-01 | Dashboard | `/app/home` | REC ADM | P0 | EXISTING | ✓ | ✓ | ✓ | S-00 | Needs KPIs, priorities, risk, activity, next-action |
| S-02 | Analytics | `/app/analytics` | REC ADM | P1 | EXISTING | ✓ | ✓ | ✓ | S-00 | Portfolio metrics + charts |

---

## C. Application — Core Recruiting

| ID | Screen | Route | Persona | Pri | Status | Desktop | Tablet | Mobile | Dependencies | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| S-03 | New mandate | `/app/projects/new` | REC | P0 | EXISTING | ✓ | ✓ | ✓ | S-00 | One-line input, optimistic create |
| S-04 | Project workspace | `/app/projects/[id]` | REC | **P0** | EXISTING | ✓ | ✓ | ✓ | S-03 | **Signature agent tiles.** No `h1`; 3/5 buttons disabled |
| S-05 | Onboarding wizard | `.../onboarding` | REC | P0 | EXISTING | ✓ | ✓ | ✓ | S-04 | 5 steps: Origin → Must-Haves → Anti-Patterns → Stakeholders → Priorities |
| S-06 | Job spec editor | `.../spec` | REC | P0 | EXISTING | ✓ | ✓ | — | S-05 | Versioned + diff panel. 1,227 lines |
| S-07 | Sourcing queries | `.../sourcing` | REC | P1 | EXISTING | ✓ | ✓ | ✓ | S-06 | LinkedIn/X-Ray/ATS × exact/broad/adjacent/competitor + versions |
| S-08 | Candidate list (project) | `.../app/candidates` | REC | P0 | EXISTING | ✓ | ✓ | ✓ | S-04 | |
| S-09 | CV upload | `.../app/candidates/new` | REC | P0 | EXISTING | ✓ | ✓ | ✓ | S-08 | PDF/DOCX. Async parse + polling |
| S-10 | **Candidate detail** | `.../app/candidates/[id]` | REC | **P0** | EXISTING | ✓ | ✓ | ✓ | S-09 | **Worst screen.** 39 buttons; outline `H1→H4×7→H3×4`; 32 clipped on mobile. Needs restructure |
| S-11 | Ranking leaderboard | `.../ranking` | REC | P0 | EXISTING | ✓ | ✓ | ✓ | S-10 | Tiers 1–4, rank history. Good empty state |
| S-12 | Head-to-head compare | `.../ranking/compare` | REC | P1 | EXISTING | ✓ | ✓ | — | S-11 | |
| S-13 | Comparison table | `.../comparison` | REC | P1 | EXISTING | ✓ | ✓ | ✓ | S-11 | **Densest surface.** Frozen column + mobile switcher required |
| S-14 | Shortlist builder | `.../shortlist` | REC | P0 | EXISTING | ✓ | ✓ | ✓ | S-11 | Slate + trade-off report |
| S-15 | Feedback / recalibration | `.../feedback` | REC | P1 | EXISTING | ✓ | ✓ | ✓ | S-11 | Drives re-ranking |
| S-16 | Calibration history | `.../calibration-history` | REC | P1 | EXISTING | ✓ | ✓ | — | S-05 | Restore = destructive, confirm |
| S-17 | HM share link | `.../hiring-manager` | REC | P1 | EXISTING | ✓ | ✓ | ✓ | S-14 | Token issue/revoke. Revoke breaks a live client link |
| S-18 | Search health | `.../metrics` | REC | P1 | EXISTING | ✓ | ✓ | ✓ | S-04 | Feeds dashboard risk |
| S-19 | Weekly report | `.../reports` | REC | P1 | EXISTING | ✓ | ✓ | — | S-11 | PDF export |

---

## D. Application — Candidate Portfolio

| ID | Screen | Route | Persona | Pri | Status | Desktop | Tablet | Mobile | Dependencies | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| S-20 | Candidate portfolio | `/app/candidates` | REC | P1 | EXISTING | ✓ | ✓ | ✓ | S-00 | Across all mandates. Clean single-`h1` |
| S-21 | Global Executive Network | `/app/candidates/network` | REC | P1 | EXISTING | ✓ | ✓ | ✓ | S-20 | **Person-deduped** — distinct mental model, needs distinct treatment |
| S-22 | AI candidate search | `/app/candidates/search` | REC | P1 | EXISTING | ✓ | ✓ | ✓ | S-20 | Natural-language query |

---

## E. Application — Executive Intelligence

| ID | Screen | Route | Persona | Pri | Status | Desktop | Tablet | Mobile | Dependencies | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| S-23 | EI overview | `/app/executive-intelligence` | REC | P1 | EXISTING | ✓ | ✓ | ✓ | S-00 | Module map. Good copy |
| S-24 | Searches list | `.../searches` | REC | P1 | EXISTING | ✓ | ✓ | ✓ | S-23 | |
| S-25 | Executive intake | `.../searches/new` | REC | P1 | EXISTING | ✓ | ✓ | ✓ | S-24 | 22 fields across 3 groups + service tier |
| S-26 | **Search workspace** | `.../searches/[id]` | REC | P1 | EXISTING | ✓ | ✓ | ✓ | S-25 | **Best screen in product.** Use its empty-state copy as the standard |
| S-27 | Success profile | `.../success-profile` | REC | P1 | EXISTING | ✓ | ✓ | — | S-26 | 15 sections. Approve → weights become operational. **Immutable when approved** |
| S-28 | Link candidates | `.../app/candidates` | REC | P1 | EXISTING | ✓ | ✓ | ✓ | S-27 | From org pool. 5 diligence stages |
| S-29 | Interview plan | `.../[cid]/interview-plan` | REC | P1 | EXISTING | ✓ | ✓ | — | S-28 | Server-computed coverage. **Immutable when approved** |
| S-30 | Assessment | `.../[cid]/assessment` | REC | P1 | EXISTING | ✓ | ✓ | ✓ | S-29 | **No AI.** 4-level evidence. Strength ≠ candidate score |
| S-31 | Role templates | `.../templates` | REC | P2 | EXISTING | ✓ | ✓ | — | S-23 | 8 seeded |
| S-32 | Competency library | `.../competencies` | REC | P2 | EXISTING | ✓ | ✓ | — | S-23 | Global + org. 4 categories |
| S-33 | Risk review | `.../[cid]/risk-review` | REC | P1 | **PLANNED** | ✓ | ✓ | — | S-30 | Spec'd, migration 040 |
| S-34 | EI final report | `.../[cid]/report` | REC | P1 | MISSING | ✓ | ✓ | — | S-30 | Chain currently ends at Assessment |
| S-35 | Audit trail view | `.../audit` | REC ADM | P2 | MISSING | ✓ | ✓ | — | S-26 | 23 event types exist, no UI |

---

## F. Application — Settings & Admin

| ID | Screen | Route | Persona | Pri | Status | Desktop | Tablet | Mobile | Dependencies | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| S-36 | Workspace settings | `/app/settings` | ADM | P0 | EXISTING | ✓ | ✓ | ✓ | S-00 | **0 inputs — read-only.** Copy bug: "as a admin" |
| S-37 | Skills studio | `/app/settings/skills` | REC ADM | P1 | EXISTING | ✓ | ✓ | — | S-36 | Custom evaluation lenses |
| S-38 | Skill editor | `.../skills/[id]`, `/new` | REC ADM | P1 | EXISTING | ✓ | ✓ | — | S-37 | Trigger conditions + instructions |
| S-39 | Waitlist triage | `/app/settings/waitlist` | FND | P1 | EXISTING | ✓ | ✓ | ✓ | S-36 | Founder-only. Needs no-permission state |
| S-40 | **Members / Team** | `/app/settings/members` | ADM | P0 | **MISSING** | ✓ | ✓ | ✓ | multi-tenancy | No members, invites, or role UI exists. Blocks multi-user |
| S-41 | **Profile / Account** | `/app/settings/profile` | all | P0 | **MISSING** | ✓ | ✓ | ✓ | — | No way to change own name/email/password |
| S-42 | Notification prefs | `/app/settings/notifications` | all | P2 | MISSING | ✓ | ✓ | ✓ | notif model | Icon is decorative today |

---

## G. Application — Billing *(all PLANNED — spec complete)*

| ID | Screen | Route | Persona | Pri | Status | Desktop | Tablet | Mobile | Dependencies | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| S-43 | Billing overview | `/app/settings/billing` | ADM | P1 | PLANNED | ✓ | ✓ | ✓ | Stripe | Plan, status, renewal, EI add-on |
| S-44 | Subscribe wall | `/app/settings/billing` | ADM | P1 | PLANNED | ✓ | ✓ | ✓ | S-43 | No subscription state |
| S-45 | Activating | `/app/settings/billing?success` | ADM | P1 | PLANNED | ✓ | ✓ | ✓ | S-43 | Polls; **grants nothing on redirect** |
| S-46 | Past-due banner | global | ADM | P1 | PLANNED | ✓ | ✓ | ✓ | S-43 | Grace window |
| S-47 | Canceled / read-only | global | all | P1 | PLANNED | ✓ | ✓ | ✓ | S-43 | Data retained, access removed |
| S-48 | Gated feature state | ×5 features | REC | P1 | PLANNED | ✓ | ✓ | ✓ | S-43 | HM portal · Triangulation · Calibration history · Network · Skills |

---

## H. Client-Facing (external)

| ID | Screen | Route | Persona | Pri | Status | Desktop | Tablet | Mobile | Dependencies | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| S-49 | **HM portal** | `/hm/[token]` | HM (PUB) | **P0** | EXISTING | ✓ | ✓ | **✓✓** | S-17 | **Only client-facing surface. Mobile-first.** Never leak internal or billing state |
| S-50 | HM feedback submitted | `/hm/[token]` | HM | P0 | EXISTING | ✓ | ✓ | ✓ | S-49 | Success confirmation |
| S-51 | HM link unavailable | `/hm/[token]` | HM | P1 | PLANNED | ✓ | ✓ | ✓ | S-48 | Neutral copy. **No billing message** |

---

## I. Cross-Cutting States *(design once, apply everywhere — Batch 8)*

| ID | State | Applies to | Pri | Status | Notes |
|---|---|---|---|---|---|
| X-01 | Empty | all collections | P0 | Partial | Gold standard exists on S-11 and S-26 |
| X-02 | First-use | dashboard, project, EI | P0 | MISSING | Distinct from empty |
| X-03 | Loading / skeleton | all async | P0 | Partial | Agent work runs 10s–2min |
| X-04 | Generating (agent) | spec, profile, plan, context | P0 | EXISTING | Polling + placeholder rows |
| X-05 | Generation failed | same | P0 | EXISTING | `generation_error` terminal state; retry |
| X-06 | Partial data | candidate, project | P1 | MISSING | Parsed-not-evaluated is common |
| X-07 | System error | all | P0 | MISSING | Distinct from generation failure |
| X-08 | No permission | admin, founder-only | P0 | MISSING | Explain who can act |
| X-09 | Read-only (approved) | all EI artifacts | P0 | Partial | Must look authoritative, not broken |
| X-10 | Archived / superseded | versioned artifacts | P1 | Partial | "Superseded by v4" |
| X-11 | No results | search, filter | P1 | MISSING | ≠ empty collection |
| X-12 | Success confirmation | approvals, destructive | P0 | Partial | |
| X-13 | Gate / locked | EI chain, plan gating | P0 | Partial | Show the path, don't hide it |
| X-14 | Mobile drawer nav | app shell | **P0** | **MISSING** | Blocks all mobile |
| X-15 | Offline / network fail | all | P2 | MISSING | |

---

## Totals

| Category | Existing | Planned | Missing | Total |
|---|---|---|---|---|
| Public website | 6 | 0 | 15 | **21** |
| App shell & dashboard | 3 | 0 | 0 | **3** |
| Core recruiting | 17 | 0 | 0 | **17** |
| Candidate portfolio | 3 | 0 | 0 | **3** |
| Executive Intelligence | 10 | 1 | 2 | **13** |
| Settings & admin | 4 | 0 | 3 | **7** |
| Billing | 0 | 6 | 0 | **6** |
| Client-facing | 2 | 1 | 0 | **3** |
| **Screens total** | **45** | **8** | **20** | **73** |
| Cross-cutting states | — | — | — | **15** |

**Authenticated app screens: 49 (39 existing, 7 planned, 3 missing)**
**Public pages: 21 (6 existing, 15 missing)**

---

## Build order

1. **X-14 + S-00** — mobile nav and app shell. Blocks all 38 app screens.
2. **Batch 1 design system** — blocks everything.
3. **S-10 candidate detail** — worst screen, highest daily use.
4. **S-04 project workspace** — the hub; signature agent tiles.
5. **S-26–S-30 EI chain** — the premium differentiator.
6. **S-49 HM portal** — only client-facing surface.
7. **S-40 / S-41** — members and profile; block real multi-user use.
8. **P-02–P-05** — public pages, once positioning is decided.
9. **S-43–S-48** — billing, once the EI add-on price is set.
