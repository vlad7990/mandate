# PRIVACY NOTICE (CUSTOMERS AND WEBSITE VISITORS) — REVIEW DRAFT

> **DRAFT — NOT APPROVED, NOT PUBLISHED, NOT LEGAL ADVICE.** Assembled 2026-10-07 from
> `../2026-10-07-factual-annexes.md`. Requires qualified legal review.
>
> **Scope of this notice:** people Mandate deals with **directly** — agency staff who hold
> accounts, and visitors to getmandate.io. It is where Mandate acts as controller/business
> (Annex D). **It is not the candidate notice** — candidate data is processed as a service
> provider for the agency, and that is `03-privacy-notice-candidates.DRAFT.md`. Keeping the
> two apart is what makes the role split legible; merging them would blur exactly the
> distinction the DPA depends on.

---

## Mandate — Privacy Notice

**Last updated: {{DATE}}**

### 1. Who this notice is for

This notice explains how Mandate handles information about **you** when you use our product
or visit our website.

**If you are a candidate** whose details are held in a recruiting firm's Mandate account,
this notice is not the right one. That firm decides what is held about you and why, and it
is responsible for telling you. Please contact the firm directly, or see
`{{CANDIDATE_NOTICE_URL}}`.

### 2. What we collect

**If you hold a Mandate account:** your name, email address, your role and status in your
organisation, your reporting line if set, and an avatar URL if you provide one. We also keep
a record of significant actions you take in the product, so your organisation has an
accurate audit trail.

**If you ask for access through our website:** your name, email address, company, role, how
you heard about us, and what you want to use Mandate for.

**Technical information when you use the product:** we record the volume, speed, cost and
outcome of AI operations your organisation runs. **This record contains no candidate
content and no prompt or response text** — only counts, timings and the name of the
operation. We also receive error reports when something goes wrong, from which personal
details are removed before they reach us (section 6).

**If you visit our public access-request form:** our bot-protection provider sees your IP
address.

### 3. What we do not do

- We do not use analytics, advertising or tracking technology of any kind. There is no
  Google Analytics, no advertising pixel, no session recording and no A/B testing tool on
  our website or in our product
- We do not sell or share personal information, and we receive no consideration for it
- We do not use your organisation's data — including candidate data — to train, fine-tune or
  evaluate AI models. This is a term of our customer agreement, not just a policy

### 4. Cookies

We use four things that store or read information in your browser, and nothing else:

| What | Why | Can you refuse it? |
|---|---|---|
| Sign-in session cookies | Keep you signed in. Without them the product cannot work | No — strictly necessary |
| `mandate_sample_dismissed` | Remembers that you dismissed a sample-data banner | It only appears after you dismiss something |
| `mandate_tab_guides_seen` | Remembers which in-product guides you have already seen | As above |
| Cloudflare Turnstile | Protects our public access-request form from automated abuse. Our provider states Turnstile **sets no cookies** and processes only an IP address | It runs only on that one form |

**We do not show a cookie consent banner, because we have nothing to ask you to consent
to.** There are no analytics or advertising cookies to accept or reject.
`[DECISION: COOKIE-CLASSIFICATION — a lawyer should confirm this position for the client's
states, and confirm the two preference cookies are correctly treated. Annex L.]`

### 5. Why we use it, and for how long

We use your information to provide and secure the product, to administer your account, to
respond to you, to invoice, and to operate and improve the service.

`[DECISION: RETENTION — Mandate currently has no automatic deletion mechanism for any data
(Annex H.1, verified across all 159 migrations). Account and telemetry records persist. Either
state that honestly or build a retention control. Item L4 — this is the same blank as in the
candidate notice and should be answered once, consistently, for both.]`

### 6. Who we share it with

Our service providers, under contract, who may not use it for their own purposes:

| Provider | What for | Where |
|---|---|---|
| Supabase (on AWS) | Database, sign-in, file storage | United States (`us-east-1`) |
| Vercel | Running the application | United States |
| Anthropic | AI analysis | United States |
| Resend | Sending email | United States |
| Sentry | Error monitoring — personal-data fields are stripped and message length capped before sending | `[DECISION: region not verified — item L8]` |
| Cloudflare | Bot protection on our public form | Global |

The current list is always at `{{SUBPROCESSOR_URL}}`.

We also share information where we are required to by law, or with professional advisers.

### 7. Where your information is held

**In the United States.** Our database and file storage are in Amazon Web Services'
`us-east-1` region.

### 8. Security

Access is controlled by role and enforced by our database, not only by our application. Each
customer organisation's data is isolated at the database level. Uploaded files are held in
private storage. AI operations run through a layer that holds no database access of its own,
so changing an AI model cannot widen what data is reachable.

**Being straightforward about two limits:** multi-factor authentication and single sign-on
are not yet available, and our current hosting plan does not include automated backups —
see our customer agreement, which addresses this directly.

> *Both sentences are accurate (Annex I.1, H.3). The second should be removed only once the
> recovery plan is implemented, not before.*

### 9. Your choices

You can ask us to tell you what we hold about you, correct it, or delete it. If you hold an
account, your organisation's administrator can also change or remove it.

`[DECISION: RIGHTS-INTAKE + RESPONSE-TIME — a published contact method and a stated
turnaround are needed. Same decision as the candidate notice; answer both together.]`

### 10. Changes and contact

`[DECISION: CONTACT — named contact, address, and how changes will be notified. Note: no
customer-notification mechanism exists today, which also affects DPA clause 5.3.]`

---

## Drafting notes for review — not part of the notice

1. **Section 1's redirect is load-bearing.** It is what keeps candidates from reading the
   controller notice and concluding Mandate decides things about them. Do not merge the two
   notices to save a page.
2. **Section 3 is a genuine competitive statement, not filler.** Zero analytics, zero
   tracking and a contractual no-training commitment are all verified and all unusual. Both
   sections 3 and 4 should be reused verbatim in security questionnaire responses.
3. **The telemetry description in section 2 is precise and should stay precise.**
   `inference_runs` really does hold no content — only capability, model, token counts,
   latency and outcome. That precision is what makes the claim credible.
4. **Two retention blanks, one decision.** Sections 5 here and 8 of the candidate notice must
   be answered consistently. Answering them differently would be noticed.
