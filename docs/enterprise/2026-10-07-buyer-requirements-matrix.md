# ENTERPRISE BUYER REQUIREMENTS MATRIX — 2026-10-07

**Purpose.** A single place to answer an enterprise security questionnaire honestly, and to
separate what an enterprise buyer requires from what the **actual first client** requires.

**Two rules this document follows:**

1. **Executive Intelligence is not enterprise readiness.** EI is a premium feature module
   that a two-person firm could buy. Enterprise readiness is a procurement posture — SSO,
   audit integrity, certifications, contractual commitments. They are independent, and the
   EI tier's "Contact sales" label has made them look like the same thing.
2. **Nothing is marked absent merely because the repository does not contain it.**
   Certifications, insurance and assessments live outside a codebase. Those rows are
   **UNKNOWN** until confirmed.

**Status vocabulary:** **IMPLEMENTED & VERIFIED** (exists; exercised or proven) ·
**IMPLEMENTED, UNVERIFIED** (exists; never exercised in production) · **PARTIAL** ·
**ABSENT** (confirmed not to exist) · **UNKNOWN** (cannot be determined from available
evidence — needs founder or external input).

---

## 1. ⚠️ Four rows are UNKNOWN because the answer was internally inconsistent

Asked on 2026-10-07 whether compliance evidence exists outside the repository, the founder's
multi-select answer included **"None of these exist yet"** *together with* **ICO /
data-protection registration**, **cyber / professional indemnity insurance**, and **pen test
or SOC 2 in progress**. Those four options are mutually exclusive.

**I have therefore not recorded any of them.** Guessing would put a false statement into a
security questionnaire — the one document where a wrong answer is actively damaging. A
one-line clarification resolves all four.

| Row | Status | Needed |
|---|---|---|
| Data-protection / supervisory authority registration | **UNKNOWN** | Yes/no, and the registration number if yes |
| Cyber / professional indemnity insurance | **UNKNOWN** | Yes/no, carrier and limit if yes. **Interacts with the liability cap in the subscription terms** |
| Penetration test | **UNKNOWN** | Never / booked / in progress / complete, and by whom |
| SOC 2 (or ISO 27001) | **UNKNOWN** | Never / in progress / Type I / Type II, and the observation window |

---

## 2. The matrix

### 2.1 Identity and access

| Requirement | Status | Evidence | Gap / note |
|---|---|---|---|
| **SSO / SAML** | **ABSENT** | `src/app/auth/signin/page.tsx:152` renders a **disabled** control titled *"Enterprise SSO is coming soon."* | Visible to every prospect at the login screen. Usually a hard procurement gate |
| **SCIM provisioning** | **ABSENT** | No reference anywhere in `src/` | Manual invite/role management only |
| **MFA enforcement** | **ABSENT** | No TOTP/MFA implementation found | Email + password only. Should be disclosed in the subscription terms |
| **Password policy** | **PARTIAL** | App enforces 12 chars + four classes (`src/lib/auth/password-policy.ts`); **the identity provider's own floor is still the default 6 with no class requirement** | Anon key bypasses the app policy. One dashboard change — recovery plan §4.5 step 2 |
| **Leaked-password protection** | **ABSENT** | Appears as WARN in every advisor run | Pro-gated. Recovery plan step 3 |
| **Role-based access control** | **IMPLEMENTED & VERIFIED** | 5 staff + 3 external + 1 agent role; 13 named capabilities; route table + server-action layer + **capability-aware RLS**, verified role-aware on every human write policy sampled | **Stronger than most vendors at any size.** Lead with it |
| **Tenant isolation** | **IMPLEMENTED, UNVERIFIED** | Enforced in Postgres via `organization_id` RLS; external principals constrained by an XOR column rule and hold no org capability | **One organisation has ever existed.** The first enterprise client is also the first isolation test |
| **Session/account suspension** | **IMPLEMENTED & VERIFIED** | Enforced in the database; `suspended_account_invariants.sql` loops every RLS-enabled table so new tables inherit it | — |
| **Privileged-change control** | **IMPLEMENTED, UNVERIFIED** | Two-person propose/approve for admin elevation (migration 129) | Cannot be exercised below three admins; there are two humans |

### 2.2 Audit and evidence

| Requirement | Status | Evidence | Gap / note |
|---|---|---|---|
| **Activity audit trail** | **IMPLEMENTED & VERIFIED** | `activity_events`, 89-value controlled vocabulary, 22 gated intents, 142 production rows | — |
| **Append-only diligence trail** | **IMPLEMENTED & VERIFIED** | `executive_audit_events` carries **only INSERT and SELECT policies** — no UPDATE, no DELETE | The EI tier's claim is accurate |
| **Audit tamper-evidence** | **PARTIAL — the gap behind the claim** | A user can insert **self-attributed** rows directly via the REST API (`docs/FOLLOW-UPS.md`) | Append-only but not tamper-evident. **If the trail is sold as evidence, close this first** — move writes behind a SECURITY DEFINER RPC and drop the direct INSERT policy |
| **Immutable approved records** | **IMPLEMENTED & VERIFIED** | Migration 034: `RAISE EXCEPTION 'Profile % is % and immutable. Create a new version instead.'`; approval only via `approve_success_profile()`; guard triggers on 5 tables | Genuine and defensible |
| **Audit export** | **ABSENT** | No CSV/API export of the trail | Readable in-product only |
| **Customer-facing access logs** | **ABSENT** | No "who viewed this candidate" surface | Commonly requested in enterprise RFPs |

### 2.3 Certification and assurance

| Requirement | Status |
|---|---|
| SOC 2 Type I / II | **UNKNOWN** — §1 |
| ISO 27001 | **UNKNOWN** — §1 |
| Penetration test | **UNKNOWN** — §1 |
| Vulnerability management | **PARTIAL** — a code-led assessment was run (commits §211/§212 closed findings); Supabase advisors are swept and now carry three reasoned standing exemptions (migration 160). **No external scanning, no dependency-scanning in CI, no CI at all** |
| Secure development | **PARTIAL** — 1,571 tests, typecheck, lint and build all green; structural guard tests prevent whole defect classes. **No CI, so the gate is manual** |
| Dependency scanning | **ABSENT** — no Dependabot/Renovate/audit step found |
| Data-protection registration | **UNKNOWN** — §1 |

### 2.4 Operational commitments

| Requirement | Status | Evidence | Gap / note |
|---|---|---|---|
| **Uptime SLA** | **ABSENT, and currently impossible to offer** | Verified 2026-10-07: Supabase Free has no SLA and **Pro has no uptime SLA either** — SLAs first appear on Team at $599/mo. Separately **nothing polls `/api/health`**, so an SLA could not be measured | **The published Agency tier promises an "SLA".** Withdraw it — see the promise audit |
| **Backup / recovery** | **ABSENT today** | Free plan = **no backups of any kind** | Pro + independent file backup is approved in principle and **not yet implemented**. See the recovery plan |
| **Storage-file recovery** | **ABSENT on every plan** | *"Database backups do not include objects you store via the Storage API"* | Must be solved independently. The `cvs` bucket is the agency's primary material |
| **Incident response** | **ABSENT** | No runbook, severity definitions, notification timetable, named owner, or customer template | **Blocks the DPA's breach clause.** Detection exists; process does not |
| **Breach notification commitment** | **ABSENT** | — | Do not sign a 24/72-hour window until the process above exists |
| **Status page** | **IMPLEMENTED & VERIFIED** | `/status` + `GET /api/health`, verified `200` with per-subsystem checks | No external monitor and no incident history |
| **Support commitment** | **ABSENT** | Pricing promises "Email support", "Priority support", "Dedicated success partner" — **none has a defined response time or process** | 2 active humans. Define or soften |
| **Error monitoring** | **PARTIAL** | Sentry fully wired with a tested PII scrubber | **`SENTRY_AUTH_TOKEN` unset → production stack traces are minified** |
| **Change notification to customers** | **ABSENT** | No announcement list, in-product notice or changelog feed | Blocks the DPA's subprocessor-notice clause |

### 2.5 Data protection and contractual

| Requirement | Status | Note |
|---|---|---|
| **DPA offered to customers** | **PARTIAL** | Review draft exists (`docs/legal/drafts/04-…`); unreviewed, several clauses deliberately blank |
| **Upstream DPAs executed with vendors** | **UNKNOWN** | Not confirmed for any of the six operational vendors. **Blocks the flow-down clause** |
| **Subprocessor list** | **PARTIAL — blocked** | Draft exists but **cannot be published**: two production credentials (`STITCH_API_KEY`, `WEBCLAW_API_KEY`) are unexplained, so the list may be incomplete |
| **Privacy notices** | **ABSENT (published)** | Three review drafts exist. **No legal page of any kind is live** — the marketing footer links only to `/handbook`, `/request-access`, `/status` |
| **No-model-training commitment** | **IMPLEMENTED & VERIFIABLE** | Verified against Anthropic's current docs: *"Retained data is never used for model training without your express permission."* Mandate has not opted in. Draft DPA clause 3(e) additionally commits Mandate itself not to train, benchmark or evaluate on customer data | **A genuine differentiator — and a training claim only.** Must not be stated together with a retention claim (corrected 2026-10-07, Annex G) |
| **AI provider retention** | **UP TO 30 DAYS — a disclosure, not a control** | Provider's commercial policy: *"automatically delete inputs and outputs on our backend within 30 days of receipt or generation."* Flagged content may be held **up to 2 years**; longer where required by law | Prompt content includes CV text and recruiter notes. Belongs in the subprocessor list and privacy notices |
| **Zero data retention (AI)** | **ABSENT — not held by Mandate** | ZDR is a separately negotiated per-organisation arrangement. **Mandate has not requested or enabled it** | **Excluding retention-mandated models is NOT evidence of ZDR** and must never be cited as such. If pursued, first confirm whether `web_search` (used by 5 capabilities) is covered |
| **Data residency choice** | **ABSENT** | Fixed at AWS `us-east-1` | Fine for the agreed US scope; a hard gate for an EU buyer |
| **Data export on termination** | **ABSENT** | PDF export of individual documents only; no bulk export, no account-deletion routine | Satisfiable today only by hand |
| **Right-to-audit substitute** | **ABSENT** | No SOC 2 report to offer in lieu | Expect a questionnaire instead |

---

## 3. What the actual first client requires

The first client is a **US solo/small recruiting firm under a signed pilot** — not an
enterprise buyer. Most of §2 is irrelevant to them and should not be built speculatively.

### 3.1 Genuinely required before the pilot

| # | Item | Why |
|---|---|---|
| 1 | **Backups** (Pro) + **file backup** + **one rehearsed restore** | Holding a client's candidate data with no restore point is indefensible |
| 2 | **Reviewed privacy notice and DPA** | They will ask, and a candidate could ask |
| 3 | **Incident-response process** | Needed before any breach commitment is signed |
| 4 | **Service-role key rotated** | Known prior exposure |
| 5 | **Password floor raised** at the identity provider | The app policy is currently bypassable |
| 6 | **Corrected pricing copy** | Two claims are misleading; one is unsupportable |
| 7 | **Rights-request intake** (an email address will do) | A candidate with no portal link has no route in |

### 3.2 Explicitly NOT required for the first client

SSO · SCIM · MFA · SOC 2 · ISO 27001 · penetration test · audit export · customer access
logs · data-residency choice · uptime SLA · dependency scanning · CI · audit tamper-evidence
(unless the EI trail is sold as evidence) · bulk export on termination (do it by hand for one
client).

**This is the point of the document.** Building any of §3.2 now would be speculative work
for a buyer who does not exist, while items 1–7 are what stands between the product and a
defensible first engagement.

### 3.3 The honest sales position for an enterprise prospect who appears anyway

Lead with what is verified and unusual: **tenant isolation enforced in Postgres, not just the
app** · **13 named capabilities with role-aware write policies** · **AI agents as individual
database principals with their own credentials and kill switches** · **a contractual
no-model-training commitment, backed by the provider's own published terms** · **approval
gates and immutability enforced by database triggers** · **a tested PII scrubber on error
telemetry**.

Then be straightforward about the gaps: no SSO yet, no SOC 2, no uptime SLA, a recovery
posture being upgraded this month, and **AI prompt content held by the provider for up to 30
days with no zero-retention agreement in place**. That last one will be asked; saying it
first is worth more than being caught conflating it with the no-training commitment. An enterprise buyer will discover all four in
week one of diligence; saying them first is worth more than the delay buys.

---

## 4. Open questions

1. **The four UNKNOWN rows in §1** — one line resolves them.
2. **Is the EI audit trail being sold as evidence?** If yes, audit tamper-evidence (§2.2)
   moves from "later" to "before the EI tier is sold", because "append-only" and
   "tamper-evident" are different claims and a buyer will not distinguish them.
3. **Is there a specific enterprise prospect?** If so, their questionnaire replaces §2 as the
   requirements list. If not, §3.2 stays unbuilt.
