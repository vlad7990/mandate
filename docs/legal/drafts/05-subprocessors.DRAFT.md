# SUBPROCESSORS — REVIEW DRAFT

> **DRAFT — NOT APPROVED, NOT PUBLISHED. ⚠️ THIS LIST CANNOT BE SIGNED OR PUBLISHED YET.**
>
> **Blocking reason (Annex F, item L2):** two credentials — `STITCH_API_KEY` and
> `WEBCLAW_API_KEY` — are set in the production environment and referenced **nowhere** in the
> application source. Either they are dead and should be removed, or something undocumented
> uses them and **this list is incomplete**. An incomplete subprocessor list is a
> contractual breach waiting to happen. Resolve before publishing.
>
> **Second blocker (item L3):** Mandate has not confirmed an executed DPA with each vendor
> below. The DPA's flow-down clause (5.2) cannot be truthfully given until it has.
>
> Assembled 2026-10-07 from verified production environment-variable names and the
> implementation. Vendor facts fetched the same day.

---

## Mandate — Subprocessors

**Last updated: {{DATE}}**

These are the third parties Mandate uses to provide the Service. All process data on
Mandate's behalf under contract and may not use it for their own purposes.

### Operational subprocessors — required for the Service to function

| Subprocessor | Purpose | Data processed | Location |
|---|---|---|---|
| **Supabase, Inc.** (on Amazon Web Services) | Database, authentication, file storage | All customer and candidate data, at rest, including CV files and call recordings | **AWS `us-east-1`, United States** |
| **Vercel, Inc.** | Application hosting, serverless compute, scheduled jobs | All data in transit through the application; function logs | United States `[DECISION: region not pinned in configuration — platform default applies. Pinning would make this statement precise. Item L8]` |
| **Anthropic PBC** | AI analysis — CV parsing, candidate assessment, ranking, report and draft generation, web research | Prompt content, which includes CV text, recruiter notes, and hiring-manager feedback, depending on the feature invoked | United States |
| **Resend, Inc.** | Transactional and outreach email delivery | Recipient address, subject, message body | United States |
| **Functional Software, Inc. (Sentry)** | Application error monitoring | Technical error telemetry. **Personal-data keys are redacted, bulk-content keys truncated, and provider messages capped at 500 characters before transmission** | `[DECISION: region per account configuration — NOT VERIFIED. Item L8]` |
| **Cloudflare, Inc.** | Bot protection on Mandate's public access-request form only | IP address of visitors to that form. Cloudflare states Turnstile sets no cookies | Global edge network |

### Not currently used

These are referenced in Mandate's codebase but are **not provisioned** and process no data.
They are listed for transparency and **must not be read as active subprocessors**.

| Provider | Intended purpose | Status |
|---|---|---|
| **Deep Infra, Inc.** | Speech-to-text transcription of call recordings (Whisper) | **Not provisioned.** No credential exists in production; the feature hides its own control and refuses if reached. **No audio has ever been transmitted.** Will be added to the table above if and when enabled |

### Specific notes on AI processing

> **⚠️ CORRECTED 2026-10-07.** This section previously stated that prompts and outputs are
> "not retained by default" and offered Covered-Model exclusion as support. Both were wrong.
> See Annex G. The corrected statements below separate **training** from **retention** and
> are the only versions that may be used.

- **Training — Mandate's AI provider does not use API content to train generative models.**
  Verified against Anthropic's published documentation, 2026-10-07: *"Retained data is never
  used for model training without your express permission."* Mandate has not given that
  permission.
- **Retention — prompt and output content is held for up to 30 days, then deleted.** The
  provider's commercial policy states it *"automatically delete[s] inputs and outputs on our
  backend within 30 days of receipt or generation."* Exceptions the provider names: content
  flagged under its usage policy may be retained **up to 2 years**, and retention may be
  extended as required by law.
- **Mandate does NOT hold a zero-data-retention agreement.** Zero data retention is a
  separately negotiated, per-organisation arrangement with the provider. Mandate has not
  requested or enabled it, and nothing in Mandate's materials should suggest otherwise.
  `[DECISION: ZDR — if it is ever pursued, first confirm whether the web-search tool is
  covered, because five Mandate features use it. Item L9]`
- Five Mandate features invoke the provider's server-side web-search tool, which retrieves
  publicly available web information. One of those researches a named individual.

### Changes to this list

Mandate will give notice at `{{NOTICE_METHOD}}` before adding or replacing a subprocessor.

> **⚠️ No notification mechanism exists** — no announcement list, no in-product notice, no
> changelog feed. This sentence commits Mandate to a process that has to be built first. It
> pairs with DPA clause 5.3.

---

## Drafting notes for review — not part of the list

1. **The "not currently used" section is the right pattern and worth keeping.** Most vendors
   silently list every integration as active or omit the inactive ones entirely. Naming
   DeepInfra as present-but-unprovisioned is both honest and pre-empts the question a
   security reviewer will ask when they see the credential name in a questionnaire response.
2. **The AI section is a selling point, but only the training half of it.** A verified
   no-training commitment is what most AI-adjacent vendors cannot state, and it should also
   appear in the customer privacy notice. **The retention half is a disclosure, not a
   selling point** — up to 30 days, longer if flagged. Presenting the two together as one
   favourable fact is the error this draft was corrected for on 2026-10-07; keep them in
   separate sentences.
3. **Two entries carry unverified regions** (Vercel, Sentry). Both are cheap to resolve and
   should be before publication — a subprocessor list with a guessed location is worse than
   one with a narrower claim.
4. **Nothing in this list may be published until L2 is resolved.** The two orphaned
   credentials are the single reason this document is blocked.
