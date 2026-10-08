# DATA PROCESSING ADDENDUM — REVIEW DRAFT

> **DRAFT — NOT APPROVED, NOT SIGNED, NOT LEGAL ADVICE.** Assembled 2026-10-07 from
> `../2026-10-07-factual-annexes.md`. Requires qualified legal review.
>
> **Posture:** Customer (the recruiting agency) is the **Business / Controller**; Mandate is
> the **Service Provider / Processor** (Annex D, founder decision 2026-10-07). Written to
> CCPA/CPRA service-provider requirements, which is the lead regime under the agreed
> US-only scope. **This is not a GDPR DPA** and does not contain Art. 28 clauses, SCCs or
> the UK IDTA — those are needed only if the scope changes (Annex M.3).
>
> **⚠️ Clause 7 (Security Incidents) must not be agreed in any form until an
> incident-response process exists. There is currently none (Annex I.2).**

---

**DATA PROCESSING ADDENDUM** to the Mandate Subscription Agreement between
**{{MANDATE_ENTITY}}** ("Mandate", "Service Provider") and **{{CUSTOMER_ENTITY}}**
("Customer", "Business"), effective {{DATE}}.

## 1. Definitions

Terms including **Business**, **Service Provider**, **Personal Information**, **Consumer**,
**Sell**, **Share**, and **Business Purpose** have the meanings given in the California
Consumer Privacy Act as amended by the CPRA, and comparable terms in other applicable US
state privacy laws. **Candidate Data** means Personal Information about individuals whom
Customer is considering, has considered, or may consider for employment or engagement, which
Customer or its users submit to or generate within the Service.

## 2. Roles

2.1 Customer is the Business. Customer determines the purposes and means of processing
Candidate Data, decides which individuals to source and assess, and is responsible for
providing any notices to, and handling any requests from, those individuals.

2.2 Mandate is a Service Provider. Mandate processes Candidate Data only as necessary to
provide the Service and only on Customer's documented instructions. **Customer's act of
invoking a feature of the Service constitutes a documented instruction** to perform the
processing that feature performs.

2.3 Mandate is an independent Business, not a Service Provider, with respect to: Customer's
user account records; prospect information submitted through Mandate's public website; and
Mandate's own operational telemetry, which records the volume, latency, cost and outcome of
model calls and **contains no Candidate Data content**.

> *Annex A.5 and Annex D support 2.3. `inference_runs` stores capability, model, token
> counts, latency and outcome — no prompt or response text.*

## 3. Service Provider obligations (CCPA § 1798.140(ag))

Mandate shall not:

(a) **Sell or Share** Personal Information;
(b) retain, use or disclose Personal Information for any purpose other than the Business
Purposes specified in this Addendum, including any commercial purpose of its own;
(c) retain, use or disclose Personal Information outside the direct business relationship
with Customer;
(d) **combine** Personal Information received from Customer with Personal Information
received from or on behalf of any other person, or collected from its own interactions with
a Consumer, except as permitted by applicable law;
(e) **use Personal Information to train, fine-tune, benchmark, evaluate or otherwise improve
any machine-learning or artificial-intelligence model**, whether Mandate's own or a third
party's.

> **⚠️ CORRECTED 2026-10-07.** This annotation previously read that Mandate's AI provider
> "does not train on API content by default and that no model requiring retention is
> reachable by the Service" — which fused a training commitment with a retention claim and
> implied non-retention. **Corrected position, per Annex G:**
>
> - **Clause (e) is a commitment by MANDATE**, about what Mandate does with Personal
>   Information. It is true today — model benchmarking uses founder-built fixtures, never
>   customer records (Annex D) — and the contract is what keeps it true.
> - **Separately**, Mandate's AI provider commits that retained data is *"never used for
>   model training without your express permission"*, and Mandate has not opted in
>   (Annex G.2). This is a **training** commitment and is the claim that is safe to make.
> - **Retention is a different matter and is NOT zero.** The provider's commercial policy
>   deletes inputs and outputs *"within 30 days of receipt or generation"*, with exceptions
>   up to 2 years for usage-policy flags and as required by law (Annex G.1).
>   **Mandate holds no zero-data-retention agreement** (Annex G.3).
> - **The absence of a retention-mandated model proves nothing about retention.** Do not
>   cite it here or anywhere.
>
> `[DECISION: PROVIDER-RETENTION-DISCLOSURE — the 30-day provider retention window is a fact
> about a subprocessor and should be disclosed, most likely in the subprocessor list and the
> privacy notices rather than as a clause here. A lawyer should decide where it lands and
> whether any customer-facing retention commitment should reference it.]`

Mandate shall comply with its obligations under applicable law and provide the same level of
privacy protection as required of Customer. Mandate shall notify Customer if it determines
it can no longer meet these obligations.

## 4. Permitted Business Purposes

Mandate may process Candidate Data only to: host and secure it; parse and structure uploaded
CVs; generate assessments, rankings, comparisons, reports, interview plans and draft
communications at Customer's direction; retrieve and summarise publicly available web
information about a candidate's professional background at Customer's direction; deliver
communications Customer has approved; provide the candidate self-service and
hiring-manager-review surfaces Customer enables; maintain audit and activity records; and
provide support to Customer.

## 5. Subprocessors

5.1 Customer authorises the subprocessors listed at `{{SUBPROCESSOR_URL}}`, as of the
Effective Date.

5.2 Mandate shall impose data-protection obligations on each subprocessor no less protective
than those in this Addendum.

> **⚠️ Annex F / item L3: Mandate has not yet confirmed an executed DPA with each
> operational vendor. 5.2 cannot be truthfully given until that is done — obligations cannot
> be flowed down before they are accepted upstream.**

5.3 Mandate shall give Customer at least `[DECISION: SUBPROC-NOTICE — 30 days is
conventional]` days' notice before adding or replacing a subprocessor, during which Customer
may object on reasonable data-protection grounds.

> **⚠️ There is no mechanism to notify customers of anything. No announcement list, no
> in-product notice, no changelog feed. Agreeing 5.3 creates an operational obligation that
> does not currently have a process behind it.**

## 6. Security

Mandate shall maintain reasonable technical and organisational measures appropriate to the
risk, including those described in **Schedule 1**.

## 7. Security Incidents

> **⚠️ DO NOT AGREE ANY VERSION OF THIS CLAUSE YET.** Annex I.2: Mandate has no documented
> incident-response process — no runbook, no severity definitions, no notification
> timetable, no named responsible person, no customer communication template. Detection
> exists (error monitoring, health endpoint, cron heartbeat) but **nothing external polls the
> health endpoint**, so time-to-detection is "until someone looks". Agreeing a 24- or
> 72-hour window commits Mandate to a process that does not exist. Item L6 must close first.

`[DECISION: BREACH-WINDOW — blank by design until L6 closes. Note production stack traces
are currently minified because SENTRY_AUTH_TOKEN is unset (item S5), which directly lengthens
incident diagnosis.]`

## 8. Consumer rights requests

8.1 Mandate shall provide Customer with the functionality to access, correct, delete,
suppress and export Candidate Data, and shall reasonably assist Customer in responding to
Consumer requests.

8.2 Where Mandate receives a request directly from a Consumer, it shall `[DECISION:
RIGHTS-ROUTING — forward to Customer, or action under Customer's standing instruction? The
product currently lets a candidate act directly through a token link, which is closer to
the second. The contract must match the code. Annex J.2]`.

8.3 **Deletion.** Customer acknowledges that, where a Consumer requests deletion, the
Service places the individual on a suppression list and **retains the minimal suppression
record** — identifier and the fact of objection — for the purpose of preventing
re-collection, and that a human reviews and resolves each request.

> *Annex H.2 — this is what the code does, verified. 8.3 must stay aligned with section 7 of
> the candidate privacy notice. Item L5 is the lawyer's call on sufficiency.*

## 9. Retention and deletion on termination

9.1 `[DECISION: RETENTION — blank by design. The Service has NO automatic deletion mechanism
of any kind (Annex H.1, verified across all 159 migrations). As built, data persists while
the account exists. Either state that, or build the control. Item L4.]`

9.2 On termination, Mandate shall delete or return Candidate Data within `[DECISION:
TERMINATION-WINDOW]` days, except where retention is required by law.

> **⚠️ There is no implemented account-deletion or data-export-on-termination routine.
> Agreeing 9.2 creates an obligation currently satisfiable only by hand.**

## 10. Audits

`[DECISION: AUDIT-RIGHTS — Mandate holds no SOC 2 or equivalent report (Annex M.1 / item L7
pending confirmation), so the usual "provide our current report in lieu of an on-site audit"
substitution is not available. Options: accept a reasonable written-questionnaire obligation;
accept a limited audit right; or commit to obtaining a report by a date.]`

## 11. Return of data, and no CCPA sale

Mandate confirms it does not and will not Sell or Share Personal Information, and that no
consideration is received for Personal Information.

---

## Schedule 1 — Technical and organisational measures

**Every item below is implemented and was verified on 2026-10-07. Nothing in this schedule is
aspirational — citations are in the annex named.**

| Measure | What is in place | Annex |
|---|---|---|
| Tenant isolation | Row-level security in Postgres scopes every record to the customer's organisation; enforced by the database, not only the application | I.1 |
| Authorization | Three independent layers: route-capability table, server-action wrapper, and capability-aware RLS write policies. Verified role-aware on every human write policy sampled | I.1 |
| Role model | 5 staff roles, 3 external roles, 13 named capabilities. External users hold no organisation capability and are constrained by an XOR column rule | I.1 |
| AI principal isolation | AI agents are individual database principals with their own credentials, RLS reach and kill switches. A missing agent credential refuses rather than escalating to a master key | I.1 |
| Model/data separation | The inference layer never holds a database client; a change of model or provider cannot widen data access | C |
| AI output constraints | Closed output schemas on all 38 model-calling paths; verdict vocabulary stripped recursively before persistence; human approval gates enforced by database triggers; approved records immutable | K.1, K.2 |
| Storage | All three buckets private, with MIME-type and size restrictions | I.1 |
| Encryption | In transit via TLS; at rest by the hosting provider | F |
| Access to production | Limited to the platform operator surface; agent credentials held as individual secrets outside the database | I.1 |
| Credential handling | Provider keys are held as environment secrets. The model registry stores the *name* of an environment variable and a column constraint prevents it holding a key | F |
| Password policy | Application enforces 12 characters and four character classes. **See item S1 — the identity provider's own floor is not yet raised to match** | I.1 |
| Suspension | Enforced in the database; a repository-wide invariant test covers every RLS-enabled table, so new tables inherit it | I.1 |
| Privileged change control | Admin elevation requires a two-person propose/approve flow | I.1 |
| Rate limiting | Database-backed, tiered: cost-bearing endpoints fail closed, identity endpoints fail open with alerting | I.1 |
| IP handling | IP addresses are **salted-hashed before storage**; the raw address never reaches a stored key | A.5 |
| Error telemetry | Personal-data keys redacted, bulk-content keys truncated, provider messages capped at 500 characters, with a test harness enforcing it | H.5 |
| Audit trail | Organisation-visible activity trail; the executive-diligence trail is append-only at the policy layer (**see item S4 on tamper-evidence**) | I.1, K.2 |
| Backups | **See Schedule 2 — this is currently a gap, not a measure** | H.3 |

## Schedule 2 — Backup and recovery: current state

> **This schedule is included because omitting it would make Schedule 1 misleading.**

As at 2026-10-07 the hosting plan is **Supabase Free**, which provides **no backups of any
kind**, 1-day log retention, and pauses projects after a week of inactivity (Annex H.3,
verified against Supabase's published pricing).

A separate recommendation at `docs/infrastructure/2026-10-07-recovery-plan.md` proposes
Supabase Pro plus independent file-bucket backup, approved in principle by the founder on
2026-10-07 and **not yet implemented**.

**A fact that survives any plan upgrade:** Supabase states that *"database backups do not
include objects you store via the Storage API"*. **No plan backs up the CV or call-audio
buckets.** Independent file backup is therefore a requirement, not an optimisation.

**No clause of this Addendum should state a recovery objective until the recovery plan is
implemented and tested.**

---

## Drafting notes for review — not part of the Addendum

1. **Clause 3(e) is the commercially valuable clause.** A no-model-training commitment,
   stated in the agreement body and true of both Mandate and its AI provider, is a real
   differentiator in a procurement conversation and costs nothing to give because it is
   already the case.
2. **Clause 7 and Schedule 2 are the two places this Addendum is deliberately weaker than a
   template.** Both reflect reality. Filling them with conventional numbers would convert a
   known gap into a contractual breach.
3. **Clause 5.2 and 5.3 both depend on work that has not happened** — upstream DPAs (L3) and
   a customer-notification mechanism (none exists).
4. **Schedule 1 is unusually strong and should be used in sales conversations.** Most
   seed-stage vendors cannot evidence tenant isolation at the database layer, per-agent AI
   credentials, or a tested PII scrubber on error telemetry.
