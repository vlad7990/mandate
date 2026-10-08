# LAUNCH OFFER, PROMISE AUDIT, AND ENTITLEMENTS — 2026-10-07

**Purpose.** Define what Mandate is actually selling, to whom, at each stage; audit every
published pricing and feature promise against the implementation; and separate payment
collection from entitlement enforcement.

**Nothing in this document changes the commercial offer.** The corrected copy in §3 is a
proposal for review. `src/app/(marketing)/_data/pricing.ts` is untouched.

**Standing rule this document applies:** Executive Intelligence is a **premium module**, not
an enterprise-readiness tier. The two are independent and are treated independently
throughout. EI is fully built and has never been used; enterprise readiness is a separate
set of requirements in `docs/enterprise/2026-10-07-buyer-requirements-matrix.md`.

---

## 1. The four launch stages

These are sequential gates, not parallel products. Each names what must be true before it
opens.

### Stage 1 — Controlled design-partner pilot · **OPEN NOW, with conditions**

| | |
|---|---|
| **Who** | One named recruiting firm, 1–3 users, known to the founder, contracted by signature |
| **Price** | Deliberately set, manually invoiced. Not a published tier |
| **What they get** | §4's defined feature set — a narrower set than any published tier |
| **Why this is viable** | The proven path (intake → calibration → spec → sourcing queries → CV parse → evaluate) has real production runs. Everything downstream is explicitly labelled as being proven *with* the partner, not sold to them as finished |
| **Entitlements needed** | **None.** Scope is contractual (Schedule A), enforced by it being one known customer |
| **Payment needed** | **None in product.** Manual invoice is appropriate and honest at n=1 |
| **Gates before opening** | Supabase Pro + file backup implemented · legal pack reviewed · incident process written · service-role key rotated · Supabase password floor raised |

### Stage 2 — Solo / small-team commercial offering · **NOT OPEN**

| | |
|---|---|
| **Who** | Independent recruiters and small firms, self-service or light-touch sales |
| **Blocks** | Payment collection (no Stripe, no code) · seat and search entitlement enforcement · the "30-day evaluation history" promise must be defined or withdrawn (§2.3) · a published, reviewed legal pack · a working rights-request intake |
| **Realistic trigger** | Stage 1 completes a full search end to end, *and* billing + entitlements ship |

### Stage 3 — Mid-market offering · **NOT OPEN**

| | |
|---|---|
| **Who** | Multi-recruiter agencies, 5–30 seats, desk/manager oversight, client portal in real use |
| **Blocks** | Everything in Stage 2, plus: the hiring-manager portal has **never been opened by a real external user** (zero external users have ever existed) · the desk/task layer has zero production rows · the two-person admin rule cannot even be exercised below three admins · "SLA" cannot be offered — the hosting plan has none and nothing measures uptime |
| **Realistic trigger** | A Stage 1/2 customer uses the portal and the desk in anger, for a quarter |

### Stage 4 — Enterprise offering · **NOT OPEN, AND FURTHEST**

| | |
|---|---|
| **Who** | Large agencies or in-house search functions with procurement and security review |
| **Blocks** | SSO (a disabled "coming soon" button today) · MFA · SCIM · audit tamper-evidence · certification or assessment evidence · a real support commitment · multi-tenant isolation that has been tested with more than one organisation (there is one) |
| **Note** | **Selling Executive Intelligence does not constitute entering this stage.** EI is a feature module an SMB can buy; enterprise is a procurement posture |
| **Realistic trigger** | A specific enterprise prospect's actual security questionnaire. Do not pre-build |

---

## 2. Promise audit — every published claim

Source: `src/app/(marketing)/_data/pricing.ts` (tier cards and the comparison table).
**Status** = implementation reality. **Verified** = has it been exercised in production.

### 2.1 Summary of findings

| Severity | Count | Claims |
|---|---|---|
| 🔴 **Inaccurate or misleading** | 2 | "Global Executive Network", "Custom skills + **agents**" |
| 🟠 **Unsupportable commitment** | 2 | "SLA", "Dedicated success partner" |
| 🟡 **Undefined — needs a definition before it can be sold** | 2 | "30-day evaluation history", "Unlimited users + searches" |
| 🔵 **Real but unenforced** | 5 | seats, active searches, HM Portal gating, Global-Network gating, custom-skills gating |
| 🟢 **Accurate and verified in code** | 4 | append-only audit trail, immutable approved records, calibration history + restore, versioned success profiles |
| ⚪ **Built but never used in production** | 3 | HM Portal, Triangulation reports, the whole EI chain |

### 2.2 Full table

| # | Claim | Tier | Status | Verified? | Finding |
|---|---|---|---|---|---|
| 1 | "1 user, 3 active searches" | Starter | **Not enforced** — no plan/seat/quota column exists in 72 tables | n/a | 🔵 Contractual only. Over-use is neither prevented nor detected |
| 2 | "5 users, 10 active searches" | Growth | Same | n/a | 🔵 As above |
| 3 | "Unlimited users + searches" | Agency | Technically true *because nothing is limited anywhere* | n/a | 🟡 "Unlimited" is accidentally accurate. See §2.4 |
| 4 | "Full intelligence stack" | Starter | Vague but defensible — all capabilities are reachable | Partly: 14 of 37 capabilities have ever run | 🟡 Reword to something checkable |
| 5 | "Ranking, comparison and shortlists" | Starter | Implemented | **No** — comparison and shortlist-report seams have never executed; zero shortlists exist | ⚪ Honest only if the pilot proves it |
| 6 | **"30-day evaluation history"** | Starter | **No implementation whatsoever.** Grep finds the phrase only in `pricing.ts`. The only "30 day" mechanics in the codebase are HM-token expiry and the Art. 14 notice clock | n/a | 🟡 **See §2.3 — do not implement as deletion** |
| 7 | "Email support" | Starter | No defined response time, no ticketing, no process | n/a | 🟠 Define or soften |
| 8 | "Hiring Manager Portal" | Growth gate | Implemented and substantial | **No** — zero external users have ever existed | 🔵⚪ Not gated by tier; also unproven |
| 9 | "Triangulation reports" | Growth | Implemented | **No** — `run_triangulation` has never executed in production | ⚪ |
| 10 | "Calibration history + restore" | Growth | **Implemented and real** — `restoreCalibrationSnapshotAction`, and the restore is itself recorded as a snapshot | Partly | 🟢 Accurate |
| 11 | "Priority support" | Growth | Undefined | n/a | 🟠 |
| 12 | **"Global Executive Network"** | Agency | **MISLEADING.** The feature so named is `/app/candidates/network`, and `network_profiles` is strictly org-scoped: primary key `(organization_id, identity_key)`, RLS `organization_id = current_user_org_id()`. It is the agency's **own** candidate pool folded by person — not access to a cross-organisation executive database | Partly | 🔴 **Highest-priority fix.** Listed as an Agency-exclusive ("agency: yes", all others "no"), which invites a buyer to read "Global" as shared data. It is also not gated — every tier can open the page today |
| 13 | **"Custom skills + agents"** | Agency | **Half true.** Skills Studio is real: admin-authored, versioned, append-only `skill_versions`, 5 live skills. **"Custom agents" does not exist** — agents are fixed database principals created by migration; no user can author one | Skills: partly | 🔴 Drop "+ agents" |
| 14 | **"Dedicated success partner"** | Agency | A staffing promise with 2 active humans in the company | n/a | 🟠 Only sellable if the founder *is* that partner, deliberately |
| 15 | **"SLA + onboarding workshop"** | Agency | **Unsupportable.** Verified 2026-10-07: current Supabase Free has no SLA, and **Pro at $25/mo has no uptime SLA either** — SLAs first appear on Team at $599/mo. Separately nothing polls `/api/health`, so Mandate could not measure an SLA it agreed to | n/a | 🟠 **Withdraw "SLA" until infra and monitoring both change.** "Onboarding workshop" is fine — it is a human act |
| 16 | "Gated diligence chain" | EI | Implemented — approval gates enforced by database triggers | **No** — zero executive searches exist | 🟢⚪ Accurate claim, unproven feature |
| 17 | "Versioned success profiles" | EI | Implemented and verified in code | No | 🟢 |
| 18 | **"Immutable approved records"** | EI | **Verified true.** Migration 034: `RAISE EXCEPTION 'Profile % is % and immutable. Create a new version instead.'`, and approval is only possible through `approve_success_profile()`, not a direct status update. Guard triggers on 5 EI/interview tables | No | 🟢 Genuine and defensible |
| 19 | **"Append-only audit trail"** | EI | **True at the policy layer** — `executive_audit_events` has only INSERT and SELECT policies; no UPDATE, no DELETE | No | 🟢 with one caveat: a user can insert **self-attributed** rows via the REST API, so it is append-only but **not tamper-evident**. If sold as evidence, close item S4 first |
| 20 | "Per-candidate interview plans" | EI | Implemented | Once, in production (core variant); the EI variant never | ⚪ |
| 21 | "Add-on to any plan" | EI | **Not enforced** — no entitlement layer | n/a | 🔵 |

### 2.3 "30-day evaluation history" — what it must *not* mean

This is the most dangerous promise in the table, because the obvious implementation is
destructive.

**Current reality:** the phrase has no implementation. **Mandate has no automatic deletion
mechanism of any kind** — verified across all 159 migrations. Evaluations, calibration
history, rank-change history and reports are retained indefinitely.

**The wrong reading:** "on Starter, delete evaluations after 30 days." That would build a
data-destroying job to satisfy a marketing line, destroy the agency's own work product, and
collide directly with the retention position the legal pack still has to settle (Annex L4).
A recruiter who loses an assessment of a candidate they are about to present has lost
something irreplaceable.

**Three defensible readings, for the founder to choose:**

| Option | Meaning | Build cost | Recommendation |
|---|---|---|---|
| **A — Visibility window** | All evaluations are retained; the Starter UI *surfaces* the last 30 days, with older ones reachable on a higher tier | Moderate: a filtered view plus an entitlement check | **Recommended.** Non-destructive, honest, and a real tier difference |
| **B — Withdraw the claim** | Remove the line; make no history promise at any tier | Zero | **Recommended as the immediate step**, with A later |
| **C — Actual deletion** | Hard-delete after 30 days on Starter | Moderate, and irreversible | **Reject.** Destroys customer work product to enforce a price tier |

**Immediate action: take option B now, option A later if tier differentiation needs it.**

### 2.3.1 ⚠️ A visibility window is NOT a retention policy — keep these separate

*Added 2026-10-07 after review, because option A and the retention question are easy to
conflate and the consequences of conflating them run in opposite directions.*

| | **Evaluation-history visibility (option A)** | **Retention / deletion policy** |
|---|---|---|
| What it is | A **commercial packaging** feature — which records a given tier *displays* | A **data-governance** commitment — how long records are *kept*, and when they are destroyed |
| Who decides | Founder, as a pricing decision | Founder **and counsel**, as a legal and contractual decision |
| Where it lives | Entitlement check + a filtered query | Privacy notices, DPA clause 9, and an implemented control |
| Destroys data? | **No. Never.** Nothing is deleted; a view is narrowed | **Yes, by definition** — that is what a retention schedule does |
| Reversible? | Yes — change the entitlement and the records are there | **No.** Deleted is deleted |
| Current status | **Not built.** Zero implementation | **Not decided and not built.** Annex M.1 items **L4** (retention) and **L5** (deletion). The product has **no automatic deletion anywhere** |

**Three rules that follow, and they are load-bearing:**

1. **Shipping option A must not be recorded, described or sold as a retention policy.** A
   customer told "30-day history" who later asks "so you delete after 30 days?" must be
   answered *no* — and the drafts, the notices and the DPA must all be able to say so
   consistently.
2. **Option A must never be implemented by deleting.** The temptation at build time is to
   enforce the window with a cleanup job because it is less code than an entitlement check.
   That converts a pricing feature into irreversible data destruction. **If the
   implementation contains a `DELETE`, it is the wrong implementation.**
3. **The retention policy must be settled on its own merits**, by L4/L5, for *all* tiers at
   once — not derived from whatever number the Starter card happens to carry. The pricing
   page is not a governance document, and the current honest answer to "how long do you
   keep this?" is *"for as long as the account exists"*, which is a position to confirm or
   change deliberately.

**Sequencing:** B now (withdraw the claim) → L4/L5 settle retention with counsel → only then
consider A, and build it as an entitlement, never as a cleanup job.

### 2.4 "Unlimited" — define it honestly

"Unlimited users + searches" is currently true by accident: nothing is limited on any tier.

Two things to be deliberate about before it is sold:

1. **There are no hidden limits today, and that should be stated plainly rather than
   hedged.** No seat cap, no search cap, no rate cap on authenticated use. The only limits
   anywhere are rate limits on public/unauthenticated endpoints (`/api/demo`: 10/hour/IP and
   200/day globally; `/request-access`), which exist to bound spend from strangers and do
   not touch a paying customer.
2. **But AI usage carries real marginal cost**, and nothing currently measures it per
   customer. Measured production AI spend: 891,400 input and 95,353 output tokens across 76
   calls, with two capabilities responsible for 52% of input tokens and **zero cache hits
   ever recorded**. An "unlimited" agency running hundreds of searches is an unbounded cost
   exposure against a fixed $1,899/month.

**Recommendation:** keep "unlimited" for seats and searches — it is true and a genuine
selling point — and add a plainly-worded fair-use clause covering AI operation volume, with
a commitment to discuss rather than throttle. **Do not add a hidden limit.** Build the cost
read-path (recommendation R3 of the main assessment) before this tier is sold, so the
exposure is measured rather than discovered.

---

## 3. Corrected copy — FOR REVIEW, NOT APPLIED

`src/app/(marketing)/_data/pricing.ts` is unchanged. Proposed edits:

| Current | Proposed | Why |
|---|---|---|
| "Global Executive Network" | **"Your network, folded by person"** | Removes the implication of shared cross-agency data. Describes what it is: the agency's own pool, deduplicated into people across mandates |
| "Custom skills + agents" | **"Custom skills"** | Custom agents do not exist |
| "SLA + onboarding workshop" | **"Onboarding workshop"** | Withdraw the SLA until the hosting plan has one and monitoring can measure it |
| "Dedicated success partner" | **"Named point of contact"** | Honest at current headcount; keeps the intent |
| "30-day evaluation history" | **remove the line** | §2.3 option B |
| "Full intelligence stack" | **"Every agent and report, no feature gates"** | Checkable, and currently true |
| "Email support" | **"Email support, next business day"** *(if the founder commits)* | A response time or nothing |
| "Priority support" | **"Priority email support, same business day"** *(if committed)* | As above |
| "Append-only audit trail" | **keep** | Verified true |
| "Immutable approved records" | **keep** | Verified true |

**Two structural recommendations beyond wording:**

1. **Add a visible pre-launch state to the pricing page.** The tiers describe a product that
   cannot yet be purchased. A short honest line — access is by request, pricing is being
   set with early partners — costs nothing and prevents the page being read as a live
   storefront.
2. **Mark the three never-used features.** HM Portal, Triangulation and the EI chain are
   built but unproven. Selling them as finished before one real use is the fastest route to
   a refund conversation.

---

## 4. The first client — defined offer

To be transcribed into Schedule A of the subscription agreement.

### 4.1 Supported feature set — what we stand behind

**Fully supported** (production-proven, telemetry-backed):
mandate intake · company research · onboarding questionnaire · calibration model and weights
· job spec generation and versioning · boolean/sourcing query generation · CV upload, parsing
and dedupe · candidate evaluation with the adversarial verification pass · candidate pool Q&A
· network folded by person · activity trail · PDF export of evaluations

**Supported, being proven with this client — explicitly labelled as such:**
ranking and leaderboard · comparison · shortlist and publish · hiring-manager portal ·
feedback interpretation and recalibration · outreach drafting (human-approved) · placements
and fees · invoicing

**Not in scope for the first client:**
Executive Intelligence module · call transcription (no provider credential) · delivery and
bounce feedback (no webhook secret) · sourcing-run web execution · SSO/MFA · any
self-service billing

### 4.2 Access scope

1 organisation · `[DECISION: 1–3]` named users · roles from the standard model · **no
external portal users in month 1** (introduce the hiring-manager portal deliberately, in
week `[DECISION]`, with the founder watching) · no multi-tenant exposure, since there is only
one real tenant.

### 4.3 Usage boundaries

No seat or search limit is enforced in software, so the boundary is the agreement plus
founder observation. For the pilot: `[DECISION: expected mandate count]` concurrent
mandates and `[DECISION: expected candidate count]` candidates — stated as expectations to
calibrate cost and attention, not as throttles.

**AI cost must be watched from day one.** `inference_runs` captures every call; the read
path does not exist yet (main assessment R3). For the pilot, a weekly manual query is
sufficient and should be a standing task.

### 4.4 Support arrangement

Founder-direct, named channel, `[DECISION: response-time commitment]`. **No uptime
commitment** — §2.2 #15. Known-dark features disclosed in writing at signature so nothing
is discovered.

### 4.5 Success criteria — what makes this pilot a success

| # | Criterion | Why it is the right measure |
|---|---|---|
| 1 | **One search completed end to end**: intake → placed or presented shortlist | The whole point. The downstream half of the funnel has zero production rows |
| 2 | **A real hiring manager opens the portal and submits feedback** | Zero external users have ever existed; this is the Growth tier's entire justification |
| 3 | **The recruiter agrees with the AI ranking**, or articulates where it is wrong | First independent test of judgment rather than plumbing. The judgment harness has never been run |
| 4 | **8–10 real CVs parsed correctly**, errors catalogued | Unblocks the `parse_cv` benchmark and arms the dormant escalation pair |
| 5 | **Measured AI cost per mandate** | Converts "unlimited" from an exposure into a priced decision |
| 6 | **A rights request exercised once** — access or deletion, end to end | Proves the privacy workflow before a stranger tests it |
| 7 | **Zero data-loss incidents**, and one successful restore rehearsal | The recovery plan must be proven, not assumed |
| 8 | **The client would pay**, and says what for | The only real validation of the tier structure |

---

## 5. Billing and entitlements — two separate requirements

The brief is right that these are distinct, and conflating them is why the pricing page is
currently undeliverable.

| | **Payment collection** | **Entitlement enforcement** |
|---|---|---|
| Question | Can money move? | Does the product know what a customer bought? |
| Today | **No.** No Stripe, no provider code | **No.** No plan, seat or quota concept in 72 tables |
| Pilot (Stage 1) | **Manual invoice is sufficient and appropriate** | **Not needed** — Schedule A plus one known customer |
| Stage 2+ | **Required** — self-service cannot take money by hand | **Required** — tiers are meaningless without it |
| Build note | Adapt `orravia-health`'s `src/lib/billing/{stripe,plans}.ts` and `/api/stripe/{webhook,checkout}` — same stack, same layout. Do not greenfield | Smaller than it looks: a `plan` on `organizations`, a capability-style entitlement check, and gates on the four or five features that actually differ |

**Sequencing recommendation:** entitlements before billing. Entitlements make the tier
structure *true*; billing makes it *collectable*. Shipping billing first would start charging
for differences the product does not enforce — which is the current pricing page's problem,
with a payment rail attached.

**Entitlement design note.** Do not invent a new mechanism. The capability vocabulary in
`src/lib/auth/roles.ts` is already the right shape — named, checked in one place, enforced
server-side. An entitlement is the same idea keyed on the organisation's plan rather than the
user's role, and the two compose: a user needs the capability *and* the org needs the
entitlement.

---

## 6. What this document decides, and what it does not

**Decided, on evidence:**
- Stage 1 is viable now, behind named gates; Stages 2–4 are not
- Two published claims are misleading and two are unsupportable
- "30-day evaluation history" must not become a deletion job
- "Unlimited" is honest and should stay, with fair use and measured cost
- Manual invoicing is correct for the pilot; entitlements precede billing
- EI is a module, not an enterprise tier

**Left to the founder:**
- Every `[DECISION: …]` marker above
- Whether to apply §3's corrected copy, and when
- Pilot price
- Whether to be the "named point of contact" personally
