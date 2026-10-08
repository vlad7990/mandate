# SUBSCRIPTION TERMS — REVIEW DRAFT

> **DRAFT — NOT APPROVED, NOT PUBLISHED, NOT LEGAL ADVICE.** Assembled 2026-10-07.
> Requires qualified legal review and founder decisions on every `[DECISION: …]` marker.
>
> **Written for the design-partner pilot shape** — a signed agreement with one named
> customer, invoiced manually. A self-service click-through version needs different
> mechanics (acceptance, auto-renewal, payment authority, unilateral amendment) and should
> not be derived from this by editing.
>
> **The commercial numbers in this draft are deliberately blank.** They depend on the offer
> definition in `docs/commercial/2026-10-07-launch-offer-and-promise-audit.md`, which found
> that several published promises are not currently enforceable.

---

**MANDATE SUBSCRIPTION AGREEMENT** between **{{MANDATE_ENTITY}}** ("Mandate") and
**{{CUSTOMER_ENTITY}}** ("Customer"), effective {{DATE}}.

## 1. The Service

Mandate provides a hosted recruitment-intelligence platform. The specific functionality
Customer is entitled to is set out in **Schedule A**.

> *Schedule A exists because the published pricing tiers are not currently enforced in the
> product (Annex-independent finding; see the promise audit). The agreement must define the
> entitlement in words, since the software does not define it in code.*

## 2. Access and users

2.1 Mandate grants Customer a non-exclusive, non-transferable right to access the Service
during the Term for its internal business purposes.

2.2 Customer may provision up to the number of users stated in Schedule A.

> **⚠️ Seat and usage limits are NOT technically enforced.** The product has no plan, seat
> or quota concept. Schedule A is the only limit; it is contractual, not technical.
> Over-provisioning would not be prevented and is not currently detectable without a manual
> check.

2.3 Customer is responsible for its users' acts and omissions, and for keeping credentials
secure.

2.4 **Multi-factor authentication and single sign-on are not available.** Customer
acknowledges that access is by email and password only.

> *The sign-in page displays a disabled "Enterprise SSO — coming soon" control. Stating the
> limitation here is better than a prospect discovering it at the login screen.*

## 3. Customer data and privacy

3.1 Customer retains all rights in data it submits or generates in the Service
("Customer Data"), including information about candidates.

3.2 Customer is the controller/business for candidate information and is responsible for:
having a proper basis to source and process it; providing required notices to candidates;
and handling candidates' requests. The **Data Processing Addendum** governs Mandate's
processing.

3.3 Mandate will not use Customer Data to train, fine-tune, benchmark or evaluate any
machine-learning model. See DPA clause 3(e).

3.4 **Backups.** `[DECISION: BACKUP-TERMS — the Service is currently hosted on a plan with
no backups at all, and no hosting plan backs up uploaded files. Until the recovery plan is
implemented, this clause must either disclaim backup responsibility and advise Customer to
retain its own copies, or commit to the implemented position. It must not promise what is
not running. See Schedule 2 of the DPA.]`

## 4. AI functionality — what Customer is buying

4.1 The Service uses artificial intelligence to assist assessment. **All AI output is
decision support.** It does not produce hiring verdicts, psychological or mental-health
assessments, or inferences about protected characteristics, and the Service is built to
prevent such outputs being produced or stored.

4.2 **Customer remains the decision-maker.** Customer must have a qualified person review,
edit and approve every AI-generated artefact before relying on it or disclosing it to a
third party. Certain artefacts require explicit approval in the Service before they can be
used.

4.3 **No accuracy warranty.** AI output may be incomplete, out of date, or wrong. Mandate
does not warrant the accuracy of any assessment, score, ranking, summary or draft.

> *This is not boilerplate caution — it is accurate. The evaluation quality harness has never
> been run and 23 of 37 AI capabilities have never executed in production (Annex K.3). A
> warranty here would be indefensible.*

4.4 **Employment-decision responsibility.** Customer is solely responsible for compliance
with laws applicable to its employment decisions and its use of the Service, including
anti-discrimination law and any law applicable to automated or algorithmic tools used in
hiring.

> **⚠️ CORRECTED 2026-10-07.** The previous annotation asserted that automated
> employment decision tool ("AEDT") rules apply and called it the likeliest regulatory
> surprise. **That was a categorical legal conclusion I am not in a position to reach**, and
> it has been replaced with the assessment below. Whether any such regime applies — and if
> so which, and to whom — is a question of law and fact that **requires qualified legal
> review**. Nothing here is a determination.
>
> `[DECISION: AEDT-ASSESSMENT — complete the assessment below with counsel before signature.]`
>
> **The facts counsel needs, and the factors that drive the answer:**
>
> **What the Service actually does** (verified, Annex K):
> - Produces per-candidate scores across named dimensions, a tier assignment, and a
>   leaderboard position; generates narrative assessments, comparisons and shortlists
> - **Does not** output a hire/no-hire verdict — verdict-shaped output is recursively
>   stripped before persistence, and output schemas cannot express one
> - **Does not** infer protected characteristics, and is built not to
> - **Does not** act: every artefact requires a human to review, edit and approve, with
>   several approval gates enforced by database triggers
> - **Accuracy is unvalidated** — the judgment harness has never been run. Relevant because
>   some regimes attach obligations to the *use* of a tool irrespective of its quality, and
>   because others require a published bias audit that would have to be performed
>
> **Factors that determine whether a regime applies, none of which I can settle:**
>
> | Factor | Why it matters | Status |
> |---|---|---|
> | Where the employer/client is located and hires | Several regimes are city- or state-scoped | `[DECISION]` — US-only is agreed; the specific state(s) and city(ies) are not |
> | Where candidates are located, and for which roles | Some regimes attach to the candidate's or the job's location, not the vendor's | `[DECISION]` |
> | Whether the tool "substantially assists or replaces" discretionary decision-making | The common statutory trigger. The human-review architecture is the argument *against*, but a score that orders a shortlist is a real input to a decision | **Needs counsel.** Do not assume the human gate is dispositive |
> | Who is the deployer vs the vendor | Obligations typically fall on the employer deploying the tool; vendors often carry disclosure and support duties | Mandate is the vendor; Customer is the deployer. Clause 4.4 allocates accordingly — **counsel should confirm that allocation is permissible in the relevant jurisdictions** |
> | Whether notice to candidates is required, and by whom | Affects the candidate privacy notice, which already discloses computer-assisted assessment | Draft notice §6 is written to be sufficient for a disclosure duty; **unverified against any specific regime** |
> | Whether a bias audit is required, and on what cadence | If so, it is a build-and-budget item, not a drafting one | **Unknown.** Would need to be scoped |
>
> **Why this cannot be resolved by drafting.** Allocating responsibility to Customer in 4.4
> does not by itself discharge a duty that a statute places on a vendor. Whether that
> allocation holds is precisely what counsel must advise on.

## 5. Acceptable use

Customer shall not: use the Service to make an automated decision about a person without
human review; attempt to derive protected characteristics; use it to contact individuals who
have objected; circumvent the Service's suppression, consent or approval controls; or
attempt to access another customer's data.

## 6. Fees and payment

`[DECISION: FEES — amount, currency, period, invoicing mechanism, payment terms, late
payment. For the pilot: manual invoice, since no payment integration exists. Note the
published pricing page advertises $399 / $999 / $1,899 per month; the pilot price should be
set deliberately rather than inherited from a page the product cannot yet bill against.]`

## 7. Support and availability

7.1 `[DECISION: SUPPORT — the pricing page promises "Email support" (Starter), "Priority
support" (Growth) and "Dedicated success partner" + "SLA" (Agency). None of these has a
defined response time or an operational process behind it. Define what is actually offered.]`

7.2 **No availability commitment.** The Service is provided without an uptime commitment.

> **⚠️ This clause is required by the infrastructure, not by caution.** Verified against
> Supabase's published pricing 2026-10-07: the current Free plan has no SLA, and **Pro at
> $25/month has no uptime SLA either** — SLAs first appear on Team at $599/month. Mandate
> cannot pass through a commitment it does not hold. Separately, nothing currently monitors
> the health endpoint, so Mandate could not measure an SLA it agreed to. **The published
> Agency tier promises an "SLA" and must not be sold until both change.**

## 8. Term and termination

8.1 `[DECISION: TERM — pilot length, renewal, notice period.]`

8.2 Either party may terminate for material breach not cured within {{CURE_DAYS}} days.

8.3 On termination, Mandate will make Customer Data available for export for
`[DECISION: EXPORT-WINDOW]` days, then delete or return it per DPA clause 9.

> **⚠️ There is no implemented bulk-export or account-deletion routine.** PDF export exists
> for individual documents. Satisfying 8.3 today is a manual database operation. Agree a
> window only if willing to perform it by hand.

## 9. Confidentiality

Mutual, standard. `[DECISION: standard form]`

## 10. Warranties and disclaimers

10.1 Each party warrants it has authority to enter this agreement.

10.2 Mandate warrants it will provide the Service with reasonable skill and care.

10.3 **Except as expressly stated, the Service is provided "as is".** Mandate disclaims all
other warranties, including fitness for a particular purpose and any warranty as to the
accuracy of AI output.

## 11. Liability

`[DECISION: LIABILITY-CAP — conventionally fees paid in the preceding 12 months. Note: this
interacts with insurance. Item L7 flagged that the founder's answer on whether cyber or
professional indemnity cover exists was internally inconsistent and needs confirmation. An
uncapped or high cap without cover behind it is a personal exposure.]`

## 12. General

Governing law, venue, assignment, notices, entire agreement, amendment.
`[DECISION: GOVERNING-LAW — depends on Mandate's entity jurisdiction and the client's.]`

---

## Schedule A — Entitlement

`[TO BE COMPLETED from docs/commercial/2026-10-07-launch-offer-and-promise-audit.md §4,
which defines the first-client feature set, access scope, usage boundaries, support
arrangement and success criteria. Do not copy the published pricing tiers into this
schedule — the audit found several of their promises unenforceable or inaccurate.]`

---

## Drafting notes for review — not part of the agreement

1. **Clauses 2.2, 3.4, 7.2 and 8.3 all exist because the product cannot do something.**
   Each is a disclosure, not defensive drafting. Removing any of them would make the
   agreement inaccurate rather than merely generous.
2. **Clause 4.4 is the highest-uncertainty open item in this draft, and it is a question for
   counsel, not for me.** The annotation sets out what the Service does, who deploys it, and
   the factors that determine whether any algorithmic-hiring regime applies — but it reaches
   no conclusion, by design. Two traps worth naming for the reviewer: allocating
   responsibility to Customer does not discharge a duty a statute places on a vendor; and
   the human-review architecture is an argument that the tool does not substantially replace
   discretionary decision-making, **not** a settled answer.
3. **Clause 7.2 contradicts the published Agency tier.** The pricing page sells an "SLA".
   Until the hosting plan supports one and monitoring can measure one, that tier should not
   be sold — see the promise audit.
4. **Clause 4.3 is honest and should stay honest.** It will be tempting to soften it once
   the judgment harness has been run once. One run is not a validation.
