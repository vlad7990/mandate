# FACTUAL ANNEXES FOR THE LEGAL PACK — 2026-10-07

**What this is.** The verified factual record a lawyer needs in order to draft Mandate's
terms, privacy notices, and data-processing addendum. Every statement here was checked
against the implementation, the live database, or the vendor's current published terms on
2026-10-07. Nothing is drawn from memory or inference.

**What this is not.** Not legal advice, not a compliance assertion, and not a draft of any
agreement. It makes no commitment on Mandate's behalf. The drafts in `docs/legal/drafts/`
are built from these annexes and are explicitly marked as review drafts.

**Scope decision applied throughout (founder, 2026-10-07):** first client and its
candidates are **United States only**, and Mandate's intended role for candidate data is
**processor / service provider acting for the recruiting agency**. The annexes therefore
analyse against US state privacy law (CCPA/CPRA as the lead regime) rather than UK/EU GDPR.
**The GDPR machinery in the product is not removed and not wasted** — see Annex K — and the
EU/UK analysis returns in full the moment a non-US candidate enters the database. That
trigger is named in Annex L as an open control.

**Verification legend:** `[CODE]` read in the implementation · `[DB]` queried on the live
database · `[VENDOR]` vendor's current published terms, fetched 2026-10-07 ·
`[FOUNDER]` founder's answer · `[OPEN]` unresolved, needs a decision or external evidence.

---

## Annex A — Data categories and purposes

Derived from `information_schema.columns` on the live database `[DB]`, cross-read against
the seams that populate each column `[CODE]`.

### A.1 Candidate personal data (the sensitive core)

| Category | Where it lives | Purpose |
|---|---|---|
| Identity | `candidates.full_name`, `network_profiles.display_name`, `identity_key` | Identify the person across mandates; dedupe |
| Contact | `candidates.email`, `phone`, `location`; `network_profiles.primary_email` | Outreach, and the suppression match key |
| Professional profile | `current_title`, `current_company`, `archetype` | Role fit assessment |
| Public web identifiers | `linkedin_url`, `github_url`, `twitter_url`, `website_url`, `source_url` | Sourcing provenance and verification |
| CV content | `candidates.cv_raw` (extracted text), `cv_structured` (jsonb), `cv_search` (lowercased search text), `cv_sha256` (dedupe hash); the file itself in Storage bucket `cvs` | Parsing, evaluation, ranking |
| Recruiter assessment | `candidates.recruiter_assessment` (jsonb) | Human judgment of record |
| AI-derived evaluation | `candidate_scores` (incl. `leadership_score`), `project_reports`, `prescreens.transcript` (jsonb) | Decision support for the recruiter |
| Call notes and audio | `candidate_notes.content`, `transcript`, `audio_path`, `consent_confirmed`, `call_duration_minutes`; file in Storage bucket `call-audio` | Interview and screening record |
| Outreach history | `candidate_outreach.subject`, `body`, `direction`, `delivery_status`, `includes_privacy_notice` | Communication record and audit |
| Relationship state | `network_profiles.relationship_state`, `disposition` (jsonb), `follow_up_note`, `last_meaningful_contact_at` | Pipeline and warmth tracking |
| Suppression / objection | `network_profiles.dnc`, `dnc_reason`, `dnc_set_at`; `network_suppressions.*`; `email_suppressions.address` | Honouring do-not-contact and deletion requests |
| Rights-request record | `candidate_erasure_requests.*` (incl. `requester_label`, `note`, `decline_kind`, `resolution_note`) | Handling and evidencing deletion requests |
| Notice timestamp | `candidates.subject_notified_at`, `sourced_at`, `source_kind` | Proving the candidate was told, and when |
| Sourcing results (pre-promotion) | `sourcing_run_results.full_name`, `email`, `location`, `profile_url`, `raw` (jsonb) | Staging area before a recruiter promotes a result to a candidate |

**Special categories / sensitive data.** No column is designed to hold health, religion,
political opinion, union membership, sexual orientation, biometric or precise geolocation
data. **But `cv_raw` is free text supplied by the data subject and can contain anything** —
a CV may disclose a disability, a nationality, or a religious affiliation unprompted. This
is an inherent-risk disclosure the notices must make honestly rather than a defect. The AI
layer is separately forbidden from inferring protected characteristics (Annex K).

No payment-card data is held anywhere. No government identifiers (SSN, passport) have a
column; they could appear in `cv_raw` for the same reason as above.

### A.2 Customer (agency staff) personal data

`users.email`, `full_name`, `avatar_url`, `role`, `status`, `manager_id`, `is_founder`,
`organization_id`/`client_id` (XOR-enforced) `[DB]`. Purpose: authentication,
authorization, attribution on the activity trail, reporting line.

### A.3 Client-company contact data

`client_contacts.full_name`, `email`, `phone`, `linkedin_url`, `title`; `client_notes`
(incl. `transcript`, `audio_path`, `consent_confirmed`) `[DB]`. Purpose: managing the
client relationship and the hiring-manager review loop.

### A.4 Prospect data

`waitlist.full_name`, `email`, `company`, `role`, `referral_source`, `use_case`,
`notes` `[DB]`. Purpose: access requests from `/request-access`.

### A.5 Operational and telemetry data

- `activity_events` — org-visible action trail, 142 rows `[DB]`
- `executive_audit_events` — EI diligence trail, append-only (Annex I)
- `inference_runs` — per-model-call tokens, latency, outcome, model, capability.
  **Contains no prompt or response content** `[CODE: src/lib/ai/inference.ts]`
- `rate_limit` — **salted SHA hash of IP address, never the raw address**
  `[CODE: src/lib/rate-limit/server.ts]`
- `ops_heartbeats` — cron liveness

### A.6 What is deliberately NOT collected

No analytics, product-telemetry, advertising or cross-site tracking data of any kind.
Verified by grep for `gtag`, `googletagmanager`, `plausible`, `posthog`, `mixpanel`,
`segment`, `hotjar`, `fathom`, `@vercel/analytics`, `@vercel/speed-insights` across `src/`
and `package.json` — **zero matches** `[CODE]`.

---

## Annex B — Candidate-data sources

`candidates.source_kind` is the controlling column, and the distinction carries a legal
consequence `[CODE: src/lib/candidates/notification.ts]`.

| Source | How data arrives | Notice duty |
|---|---|---|
| **Sourced** (`source_kind = 'sourced'`) | Recruiter or agent finds the person — boolean search output, AI web research, manual entry, sourcing-run import | Data obtained from someone **other than** the data subject. The product tracks a 30-day notification clock for exactly this case |
| **Applied** | Person submits themselves via `/apply/[token]` → `submit_application()` RPC | Collected from the data subject directly; notice is due at the point of collection |
| **Client-supplied** | Agency's client passes a name to the agency, which enters it | Treated as sourced by the product; the agency is the one with the relationship |
| **Portal self-service** | Candidate updates their own record via `/candidate/[token]` → `candidate_portal_update_contact()` | From the data subject |

**AI web research is a source.** Five capabilities call Anthropic's server-side
`web_search_20260209` tool and their output can land in `company_context`,
`client_psychology` and research reports: `run_candidate_research`,
`run_company_intelligence`, `run_hiring_manager_research`,
`run_executive_company_context`, `run_sourcing_search` `[CODE]`. One of the five
(`run_candidate_research`) researches a **named individual**. Only that one has ever run in
production — once `[DB: inference_runs]`. The notices must disclose that publicly available
web information about a candidate may be gathered and summarised.

---

## Annex C — Data flows and recipients

```
Candidate / CV  ──►  Vercel (Next.js server actions)  ──►  Supabase Postgres (us-east-1)
                              │                                      │
                              ├──► Supabase Storage (cvs, call-audio, invoice-assets)
                              │
                              ├──► Anthropic Claude API ── prompt text only ──► (+ web_search)
                              │        no Supabase client ever reaches the model layer
                              │
                              ├──► Resend ──► candidate / client inbox (email)
                              │
                              ├──► Sentry ── scrubbed error telemetry
                              │
                              └──► Cloudflare Turnstile (public form only, IP seen by Cloudflare)

DeepInfra (Whisper ASR) ── NOT PROVISIONED, no key in production ── call audio never leaves
```

**The architectural fact that bounds every flow** `[CODE: src/lib/ai/inference.ts:16-37]`:
the inference seam never holds a product database client. It receives prompt strings and
returns responses; all reads and writes happen in the caller under row-level security. The
model therefore cannot reach data the calling recruiter could not already read, and a change
of model or provider cannot widen data access.

**Recipients of candidate personal data, by category:**

| Recipient | What it receives | Basis |
|---|---|---|
| Anthropic | Prompt text containing CV content, recruiter notes, feedback — whatever the specific seam serialises | Processing on the agency's behalf; subprocessor |
| Resend | Recipient address, subject, body of outbound email | Subprocessor |
| Supabase (AWS) | All stored data at rest | Subprocessor / hosting |
| Vercel | All data in transit through the application; function logs | Subprocessor / hosting |
| Sentry | Error telemetry, **scrubbed** (Annex H) | Subprocessor |
| Cloudflare | IP address of visitors to `/request-access` only | Subprocessor for bot defence |
| The agency's own client | Shortlists, evaluations, reports the recruiter chooses to publish via portal or export | Disclosure directed by the controller |
| Hiring manager (token link) | Candidate records shared for a specific mandate | Disclosure directed by the controller |

---

## Annex D — Controller / processor roles by activity

**Founder's intended position `[FOUNDER]`:** Mandate is a **processor** (CCPA: **service
provider**) and the recruiting agency is the controller (CCPA: **business**) for candidate
data. The product's architecture supports that reading: everything is scoped to the agency's
organisation, the agency decides who to source and why, and Mandate's staff have no routine
access path into an agency's candidate records other than the platform-operator surface.

The analysis is **not uniform across activities**, and the three rows marked `[OPEN]` are
where a lawyer should concentrate.

| Activity | Mandate's role | Confidence |
|---|---|---|
| Hosting, storing, securing agency data | Processor | Clear |
| Running AI evaluation on the agency's instruction (recruiter clicks generate) | Processor | Clear |
| Sending outreach the recruiter composed and approved | Processor | Clear |
| Agency staff account administration | **Controller** (it is Mandate's own user base) | Clear |
| Waitlist / `/request-access` prospect data | **Controller** | Clear |
| `inference_runs` telemetry (tokens, latency, cost) | **Controller** — Mandate's own operational data, contains no candidate content | Clear |
| Sentry error telemetry | **Controller** for the operational record; scrubbed of candidate content | Clear |
| **AI web research about a named candidate** | `[OPEN]` — the agency instructs the search, but Mandate chose the tool, the provider and the prompt that determines what is gathered | **Argue carefully** |
| **Evaluation criteria baked into prompts** (what "good" means, dimension vocabulary) | `[OPEN]` — the agency sets weights; Mandate authored the underlying rubric and schema | **Argue carefully** |
| **Aggregate model benchmarking / eval harness** | `[OPEN]` today it uses founder-built fixtures and never customer data. If a customer's real records were ever used to benchmark, Mandate becomes a controller for that purpose and needs a separate basis | **Must stay prohibited or be papered** |

**Recommended contractual handling of the three open rows:** name them explicitly in the
DPA as processing carried out on documented instruction, with the instruction defined as
the agency's act of invoking the feature, and prohibit use of customer data for model
benchmarking or product improvement in the body of the agreement rather than in a policy
page. The third row is currently true in practice `[CODE: evals/fixtures/`, founder-built
and deleted fixtures per `docs/launch-readiness.md`]` — the contract should keep it true.

---

## Annex E — Hosting locations and international transfers

| Component | Location | Verified |
|---|---|---|
| Supabase Postgres + Storage | **AWS `us-east-1`** (N. Virginia, USA) | `[DB: get_project → region us-east-1]` |
| Vercel application | Region **not pinned** in `vercel.json` or `next.config.ts`; platform default applies | `[CODE]` |
| Anthropic API | `api.anthropic.com`; Anthropic is the data processor on the first-party API | `[VENDOR]` |
| Resend | US-based provider | `[VENDOR]` |
| Sentry | Region per account configuration — **not verified, see `[OPEN]`** | `[OPEN]` |
| Cloudflare Turnstile | Global edge network | `[VENDOR]` |

**Transfer analysis under the agreed US-only scope `[FOUNDER]`:** client and candidates are
in the United States and data is stored in the United States. **There is no restricted
international transfer to analyse.** No SCCs, no UK IDTA, no transfer risk assessment is
required for the first client.

**The condition on that conclusion, and it is a real one.** It holds only while every
candidate is a US data subject. Executive search does not respect borders: one EU-resident
candidate in the database re-opens the full GDPR analysis — Art. 13/14 notices, a lawful
basis, SCCs or the IDTA for the us-east-1 transfer, and a transfer risk assessment. Annex L
records this as an operational control that does not yet exist.

**Unresolved `[OPEN]`:** (1) Sentry's data region for this account. (2) Whether to pin
Vercel function regions, which would make the hosting statement precise rather than
"platform default". (3) Whether to pre-emptively move the database to an EU region — the
founder's answer makes this unnecessary now, and migrating later is more expensive than
choosing correctly now, so it is a commercial judgment rather than a legal one today.

---

## Annex F — Vendors and subprocessors

**Operational — required for the product to function. All are live in production, verified
by environment-variable name `[CODE]`:**

| Vendor | Function | Credential | Candidate data? |
|---|---|---|---|
| **Supabase** (on AWS) | Postgres, Auth, Storage | `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_*` | **Yes — all of it, at rest** |
| **Vercel** | Application hosting, serverless functions, cron | platform | **Yes — in transit** |
| **Anthropic** | All AI capabilities | `ANTHROPIC_API_KEY` | **Yes — prompt content** |
| **Resend** | Transactional and outreach email | `RESEND_API_KEY`, `RESEND_FROM` | **Yes — recipient and body** |
| **Sentry** | Error monitoring | `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN` | Scrubbed (Annex H) |
| **Cloudflare** | Turnstile bot defence on `/request-access` | `TURNSTILE_SECRET_KEY`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | No — visitor IP only |

**Optional / not provisioned — must NOT appear in a subprocessor list as active:**

| Vendor | Status |
|---|---|
| **DeepInfra** (Whisper ASR, call transcription) | `DEEPINFRA_API_KEY` **absent in production** `[CODE]`. The feature hides its own affordance and refuses if reached. No audio has ever been sent. List only if provisioned |
| **Stripe** | Not integrated at all. No dependency, no code |

**Orphaned credentials that must be resolved before any subprocessor statement is signed:**
`STITCH_API_KEY` and `WEBCLAW_API_KEY` are set in production and referenced **nowhere** in
`src/` `[CODE]`. Either they are dead and should be deleted, or something undocumented uses
them and the subprocessor list is incomplete. **This must be settled before the list is
published** — an incomplete subprocessor list is a contractual breach waiting to happen.

**DPA status with each vendor `[OPEN]`:** every operational vendor above publishes a DPA,
but **I have not verified that any has been executed for this account.** A processor cannot
flow down obligations it has not accepted upstream. Executing or confirming each is a
founder action and is listed in Annex L.

---

## Annex G — AI provider retention and training settings

> ### ⚠️ CORRECTION, 2026-10-07 — this annex previously overstated the retention position
>
> **The earlier version of this annex said that because no Covered Model is reachable, "the
> default — prompts and outputs not retained, never trained on — applies to every call
> Mandate makes today." That was wrong**, and it propagated into draft DPA clause 3(e)'s
> annotation, the subprocessor draft, the enterprise matrix and the assessment addendum. All
> have been corrected.
>
> **Two errors.** (1) It took a sentence about *feature-level* storage ("not retained by
> default") and used it as a general statement about API retention, when the governing
> commercial policy says inputs and outputs are deleted **within 30 days** — i.e. they *are*
> retained, for up to 30 days. (2) It treated the **absence of a retention-mandated model**
> as evidence of zero retention. It is not. Excluding Covered Models only means no model
> *forces* a 30-day floor; the standard policy still applies on top.
>
> **Mandate does not have a zero-data-retention agreement.** Nothing in this pack may say or
> imply otherwise.

**Verified against Anthropic's current published documentation, fetched 2026-10-07**
`[VENDOR]`: `platform.claude.com/docs/en/manage-claude/api-and-data-retention` and the
commercial retention policy at
`privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data`.

**Three things that must be stated separately, because they are separate.**

### G.1 Standard commercial retention — what applies to Mandate today

> **"we automatically delete inputs and outputs on our backend within 30 days of receipt or
> generation"** — Anthropic commercial data retention policy

**This is the position that applies to every Mandate API call.** Prompts — which contain CV
text, recruiter notes and hiring-manager feedback — and model outputs are **retained by
Anthropic for up to 30 days**, then deleted.

Stated exceptions to that 30-day deletion, per the same page:

| Exception | Effect |
|---|---|
| Features with longer retention under the customer's control (e.g. the Files API) | Retention set by the feature. **Mandate uses none of them** `[CODE]` |
| A separately agreed arrangement, e.g. a zero-data-retention agreement | Replaces the default. **Mandate has none — see G.3** |
| Usage Policy enforcement, where content is flagged | Retention extended **up to 2 years** |
| Legal compliance | As required by law |

**The honest one-line summary for a contract or notice:** *prompt and output content is held
by our AI provider for up to 30 days and then deleted, except where flagged under their
usage policy (up to 2 years) or required by law.*

### G.2 No model training — a separate, stronger, and verified commitment

> **"Retained data is never used for model training without your express permission."**

This is **independent of retention** and is the claim that is safe to make. Retention is
about *how long* data sits on the provider's backend; training is about *what it is used
for*. A vendor can retain for 30 days and never train — which is exactly the position here.

Commercial API usage is covered by Anthropic's Commercial Terms, under which content is not
used to train generative models absent express opt-in. **Mandate has not opted in** `[CODE:
no such setting is configured or exposed anywhere in the codebase]`.

**This is the differentiator. State it on its own, and never fuse it with a retention
claim.**

### G.3 Zero Data Retention — available, NOT held by Mandate

Under a ZDR arrangement Anthropic does not store prompts or responses at rest after the
response is returned. **It is a negotiated, per-organisation arrangement enabled by
Anthropic's sales team.**

| | |
|---|---|
| **Does Mandate have ZDR?** | **No.** Not requested, not negotiated, not enabled. There is no agreement to cite `[OPEN → confirmed absent]` |
| What would be needed | Contact Anthropic sales; enablement is per organisation and does not extend automatically to other organisations on the same account |
| **Covered Models** (Claude Fable 5.1, Mythos 5.1, Fable 5, Mythos 5) | Require 30-day retention and are **not ZDR-eligible** |
| Is Mandate exposed to that? | **No** — the capability map resolves only to `claude-sonnet-4-6`, `claude-sonnet-5` and `claude-haiku-4-5` `[CODE: src/lib/ai/model-map.ts]`, and the registry holds exactly those three active `[DB]` |

**⚠️ And that last row proves only what it says.** Not being exposed to a *mandatory* 30-day
floor is **not** the same as having zero retention. The standard G.1 position — up to 30 days
— applies regardless. **Do not cite Covered Model exclusion as evidence of ZDR, or of
non-retention, anywhere.**

**Retention regardless of arrangement:** flagged content and legal holds survive deletion
under **any** arrangement, including ZDR. So even a future ZDR agreement would not make the
retention statement absolute.

### G.4 If ZDR is ever pursued

Two questions to settle with Anthropic **before** it is mentioned to any client `[OPEN]`:

1. **Is the `web_search` tool ZDR-eligible?** Five Mandate capabilities use it. Features
   that ride on `/v1/messages` but are listed ineligible are not covered, so a partially
   covered deployment is possible and would be the worst outcome to discover later.
2. Confirm the agreement's scope in writing, per organisation.

CORS is not an obstacle: ZDR organisations do not support it, and Mandate calls the API
server-side only, which its architecture already requires `[CODE]`.

**Recommendation.** ZDR is **not required** for the first client — but the reason is that the
client accepts a 30-day provider retention window, **not** that retention does not happen.
That distinction belongs in the conversation with the client, not buried in an annex.

**Other vendors' retention `[OPEN]` — not verified, and the drafts must not state a number
until they are:** Resend message retention, Sentry event retention, Supabase log retention
(the plan page states 1 day on Free, 7 on Pro `[VENDOR]`), Vercel function-log retention.

---

## Annex H — Retention, deletion, backups, logs, suppression

### H.1 Retention in the product: there is none, by design

**No automatic deletion mechanism exists anywhere in Mandate.** Verified by searching all
159 migrations for `DELETE FROM`, `TRUNCATE`, purge jobs, TTL columns and retention sweeps:
the only matches are policy/trigger/function definitions, never a scheduled data-destroying
job `[CODE]`. The single daily cron does guarantee-fee maintenance and the Monday agent
sweep — it deletes nothing `[CODE: src/app/api/cron/maintenance/route.ts]`.

Time-based mechanics that exist and are **access** expiry, not data deletion:
`expires_at` on `hiring_manager_tokens`, `candidate_portal_tokens`, `invitations`,
`staff_invitations` (10 migrations use the column) `[CODE]`. An expired token stops working;
the underlying record is untouched.

**Consequence for the notices:** Mandate currently retains customer and candidate data for
as long as the agency's account exists. The notices must either say that plainly or the
product must gain a retention control. **Do not paper over this with a retention schedule
the code does not implement.**

### H.2 Deletion on request: suppression-first, human-resolved

A candidate erasure request is a **workflow**, not an automatic deletion
`[CODE: src/app/ops/erasure-actions.ts`, migration 152`]`:

1. Candidate requests erasure through the portal → `candidate_portal_request_erasure()`
2. A row lands in `candidate_erasure_requests` with status open
3. A **suppression is attached** — the person is immediately do-not-contact
4. A human at Mandate/the agency resolves it: honoured, or declined with one of two
   recorded decline reasons and a `resolution_note`
5. Suppression is **contagious across merges and never silently lowered**, carrying the
   original reason, actor and timestamp (migration 153; `merge_network_profiles` docstring
   confirms "suppression is contagious and never lowered") `[DB]`
6. A request covers three arms — `identity_key`, `network_profile_id`, and
   `covered_candidate_ids` — so it still binds after a merge, an identity edit, or a record
   that arrives later (migration 152 D1) `[CODE]`

**The legal question a lawyer must answer `[OPEN]`:** suppression plus human resolution is
not the same as deletion. Under CCPA a consumer's deletion right has enumerated exceptions
and a service provider acts on the business's instruction — so this design may well be
correct and even preferable (a suppression record is what prevents re-collection). But the
candidate-facing notice must describe **what actually happens**, and currently what happens
is "you are suppressed and a human decides". It must not say "we delete your data" unless
and until that is what the code does.

### H.3 Backups — the most serious gap in this annex

**Verified against Supabase's current published documentation and pricing page,
2026-10-07 `[VENDOR]`:**

Current production state: organisation `Stratum` is on the **Free** plan `[DB]`. On Free:

- **No backups of any kind**
- 1-day log retention
- **Project pauses after 1 week of inactivity**
- No SLA, community support only
- Supabase's own guidance for Free: *"We recommend that free tier plan projects regularly
  export their data using the Supabase CLI `db dump` command and maintain off-site backups"*

**And the finding that survives any plan upgrade:**

> "Database backups do not include objects you store via the Storage API, as the database
> only includes metadata about these objects."

> "Restoring an old backup does not restore objects you deleted after that backup."

**No Supabase plan — Free, Pro, Team or Enterprise — backs up the `cvs`, `call-audio` or
`invoice-assets` buckets.** The candidate CV files, which are the agency's primary working
material, have **no backup path on any plan**. This must be solved separately; it is
specified in `docs/infrastructure/2026-10-07-recovery-plan.md`.

Also verified: PITR is a **$100/month add-on per 7 days of retention**, available on Pro
and above, requires at least a Small compute add-on, and **replaces** daily backups rather
than supplementing them. Pro at $25/month includes **no uptime SLA** — SLAs first appear on
Team at $599/month.

### H.4 Logs

| Log | Retention | Contains candidate data? |
|---|---|---|
| Supabase platform logs | 1 day on Free, 7 days on Pro `[VENDOR]` | Possibly, in query text |
| Vercel function logs | Platform default, not verified `[OPEN]` | `console.error` paths exist; the honest-sentence doctrine keeps most payloads out |
| Sentry events | Account default, not verified `[OPEN]` | Scrubbed — see H.5 |
| `activity_events` | Indefinite, by design (it is the audit trail) | References, not content |
| `inference_runs` | Indefinite, no TTL | **No prompt or response content** |

### H.5 The Sentry PII boundary — a genuine control, worth describing

`src/lib/observability/scrub.ts` `[CODE]`, with its own test harness:

- A denylist of PII **keys** whose values are redacted: `full_name`, `name`, `email`,
  `summary`, `content`, `cv`, `cv_text`, `cv_structured`, `current_title`,
  `current_company`, `one_line_input`, `instructions`, `rationale`, `action`, `headline`
- A denylist of **container** keys where the message is truncated at first appearance,
  because bulk human material follows: `candidates`, `top_candidates`, `feedback`,
  `recent_feedback`, `notes`, `pipeline_moves`, `rank_moves`, `suggestions`,
  `boolean_queries`
- A **500-character cap** on provider error messages

The module's own reasoning is worth quoting in the notice discussion: *"an uncapped provider
error message is a candidate-data leak wearing a stack trace."*

---

## Annex I — Access controls and incident handling

### I.1 Access control (implemented and verified)

- **Three independent layers.** A route-capability table decides whether a page renders
  (`src/lib/auth/route-access.ts`); server actions wrap failures in `runAction`; **row-level
  security in Postgres decides whether the write happens.** `[CODE]`
- **RLS is capability-aware, not merely org-scoped.** Every human write policy across the
  14 tables sampled consults a role predicate (`can_write_*`, `is_org_admin`) `[DB]`.
- **Roles:** 5 staff (admin, manager, recruiter, researcher, viewer), 3 external
  (hiring_manager, client_hr, client_admin), 1 agent. 13 named capabilities. External
  principals carry `client_id` and hold **no org capability at all, not even `org:read`**,
  enforced by an XOR column constraint `[CODE]`.
- **AI agents are real database principals** — 25 live rows, each with its own credential,
  RLS reach and kill switch. An absent agent secret **refuses loudly and never falls back to
  the service-role key** `[CODE: src/lib/agents/session.ts]`.
- **Suspension is enforced in the database**, and
  `supabase/tests/suspended_account_invariants.sql` loops every RLS-enabled table so new
  tables inherit the guarantee.
- **Storage buckets are all private** — `cvs`, `call-audio`, `invoice-assets`, with MIME and
  size restrictions `[DB: storage.buckets]`.
- **Two-person rule for admin elevation** (`propose_admin_grant` / `approve_admin_grant`),
  migration 129.
- **Passwords:** application enforces 12 characters and all four character classes
  `[CODE: src/lib/auth/password-policy.ts]`. **The Supabase dashboard floor is still the
  default 6 with no class requirement**, so the anon key can bypass the app policy — an open
  item, Annex L.
- **MFA: not implemented. SSO: not implemented** — the sign-in page renders a disabled
  "Continue with Enterprise SSO" button titled "coming soon" `[CODE]`.
- **Rate limiting** is Postgres-backed with a tiered failure posture: money doors fail
  closed, identity doors fail open and loudly `[CODE]`.

### I.2 Incident handling — process does not exist

**There is no documented incident-response or breach-notification process.** No runbook, no
severity definitions, no notification timetable, no named responsible person, no customer
communication template. Searched `docs/` and the repo `[CODE]`.

What exists is **detection**: Sentry error monitoring, `/api/health` returning per-subsystem
status, a cron heartbeat in `ops_heartbeats`, and a `/status` page. **Nothing external polls
`/api/health`**, so time-to-detection for an outage is currently "until someone looks".

Any DPA will commit Mandate to notifying the controller of a security incident within a
defined window — commonly 24 to 72 hours. **Do not sign that commitment until the process
behind it exists.** This is the single largest contractual-readiness gap after the documents
themselves, and it is the subject of an action in Annex L.

---

## Annex J — Candidate notices and rights-request workflows

### J.1 The notification clock (built, and better than most)

`src/lib/candidates/notification.ts` `[CODE]` implements a 30-day notification deadline for
candidates whose data was obtained from a source other than themselves, with four states:
`not_required`, `notified`, `due`, `overdue`, plus days remaining and a due date. It
deliberately excludes candidates who applied, on the reasoning that they handed the data
over themselves and a different duty applies at the point of collection.

The module was written against **GDPR Article 14(3)(a)**. Under the agreed US-only scope
that specific article does not bind — but **the mechanism is exactly what a CCPA
notice-at-collection posture needs**, and it is the asset that makes the EU/UK question
cheap to answer later. Keep it.

Supporting fields: `candidates.subject_notified_at`, `sourced_at`, `source_kind`;
`candidate_outreach.includes_privacy_notice` records whether a given message carried the
notice `[DB]`.

### J.2 Rights-request surfaces that exist

| Right | Surface | Mechanism |
|---|---|---|
| Access / know | `/candidate/[token]` | `candidate_portal_context()`, `candidate_portal_list_searches()` |
| Correct | `/candidate/[token]` | `candidate_portal_update_contact()` |
| Delete | `/candidate/[token]` | `candidate_portal_request_erasure()` → human resolution (Annex H.2) |
| Opt out of contact | portal + recruiter UI | `set_network_dnc()`, suppression ledger |
| Withdraw from a search | `/candidate/[token]` | `candidate_portal_withdraw()` |
| Submit a CV | `/candidate/[token]` | `candidate_portal_record_cv()` |

These six RPCs are intentionally executable by `anon` — they are token-authenticated doors,
and migration 158 pins the anon-executable set to a ruled list of twelve `[DB]`.

### J.3 What is missing

- **No privacy notice exists to link to.** The portal can tell a candidate what is held, but
  there is no published notice explaining purposes, recipients, retention or how to complain.
  `candidate_outreach.includes_privacy_notice` is a boolean pointing at a document that does
  not exist.
- **No published rights-request intake for a candidate who does not have a token link.** A
  person who hears they are in the database has no route in. A CCPA-facing notice needs at
  least two designated methods, typically an email address and a web form.
- **No response-time commitment** anywhere in product or docs.
- **Zero candidates have ever been notified** — `subject_notified_at` is unexercised in a
  real search, consistent with 4 sample candidates `[DB]`.

---

## Annex K — AI assessments and the human-review boundary

This is Mandate's strongest story and it should be stated precisely, because overclaiming
here is the fastest route to a problem.

### K.1 Hard prohibitions, enforced in code

Standing doctrine (`CLAUDE.md`, `AGENTS.md`): all AI output is **decision support** — never
a hire/no-hire verdict, never a psychological or mental-health label, never an inference of
a protected characteristic. Humans review, edit and approve every artefact.

Enforcement is not merely a prompt instruction:

- `src/lib/comms/prescreen-merge.ts` **recursively strips any key matching
  `/score|pass|verdict|qualif/i`** from the model's output before persistence. The module's
  own comment: the closed schemas make a verdict inexpressible, *"this makes it impossible —
  belt and braces"* `[CODE]`
- Closed output schemas: **38 of 38 model-calling seams** use Anthropic structured output
  (`output_config`) plus a per-seam normaliser. Not one seam parses free-text JSON `[CODE]`
- `verify_evaluation` (§182) is an adversarial refuter that audits the evaluation seam's own
  judgment at the same model tier `[CODE]`

### K.2 Human approval gates — counted, not asserted

Across the 159 migrations: **19 `approved_at` and 47 `approved_by` column references**
`[CODE]`. Confirmed approval gates on: executive success profiles, executive interview plans,
executive assessments, core interview plans, client interviews, and outreach strategies.

Verified immutability (migration 034) `[CODE]`:
> `RAISE EXCEPTION 'Profile % is % and immutable. Create a new version instead.'`

and approval itself can only be performed through `approve_success_profile()`, not by a
direct status update. Guard triggers exist on `role_success_profiles`,
`executive_interview_plans`, `executive_assessments`, `interview_plans` and
`client_interviews` `[DB]`.

### K.3 Automated decision-making analysis

Mandate ranks and scores candidates, which looks like profiling. The defensible position —
and the honest one — is that **no decision with legal or significant effect is made by the
system**: a recruiter must act on every output, approval gates are enforced in the database,
and verdict vocabulary is stripped at the persistence layer.

**Two caveats the notices must carry honestly:**

1. **Scoring influences human decisions even without deciding.** A candidate ranked in a low
   tier is less likely to be advanced. The notice should disclose that automated analysis is
   used to assist assessment, and describe the human-review guarantee — rather than implying
   no automation is involved.
2. **AI output quality has never been independently validated.** The judgment harness
   (`evals/judgment-harness/`) was built and **has never been run** — no `output/` directory
   exists `[CODE]`. 23 of 37 capabilities have never executed in production `[DB]`. The
   accuracy of an evaluation is therefore **unmeasured**, and no document should imply
   otherwise.

### K.4 Where the model sits relative to the data boundary

The model never touches the database (Annex C). Skills — admin-authored runtime
instructions — may steer tone, emphasis and criteria but **may never expand authority**: no
new data access, no new tools, no bypassed gate. Skills arrive as prompt text and gain no
vocabulary to name a model, a provider or a tier `[CODE]`.

---

## Annex L — Cookies, tracking, and the consent question

**Inspected rather than assumed, per the brief.** Full cookie and tracking inventory `[CODE]`:

| Cookie / mechanism | Set by | Purpose | Classification |
|---|---|---|---|
| Supabase auth session cookies | `@supabase/ssr` via `src/lib/supabase-server.ts` | Keep a signed-in user signed in | Strictly necessary |
| `mandate_sample_dismissed` | First-party | Remembers the user dismissed sample-data banners | First-party preference |
| `mandate_tab_guides_seen` | First-party | Remembers which tab guides were shown | First-party preference |
| Cloudflare Turnstile | `challenges.cloudflare.com` script on `/request-access` **only** | Bot defence on a public form | Security |

**There is nothing else.** No analytics, no advertising, no cross-site tracking, no session
recording, no A/B framework. The only third-party script anywhere in the application is the
Turnstile widget `[CODE]`.

**Turnstile's cookie behaviour, verified with Cloudflare, 2026-10-07 `[VENDOR]`:** Cloudflare
states Turnstile *"does not use any cookies"* and *"never looks for cookies... or uses
cookies to collect or store information of any kind."* Cookies users sometimes observe come
from `cloudflare.com`/`dash.cloudflare.com`, not `challenges.cloudflare.com`. Turnstile does
process **IP addresses**, which Cloudflare describes as minimised to securing the site and
improving Turnstile.

**Assessment — and this is a recommendation, not a legal conclusion:** a consent banner is
very likely **not required**. There are no analytics or advertising cookies to consent to;
the auth cookies are strictly necessary; the two `mandate_*` cookies are first-party
preference cookies set as a consequence of a user action. Under the agreed US-only scope,
CCPA's opt-out mechanics are triggered by **selling or sharing** personal information for
cross-context behavioural advertising, and Mandate does neither — so no "Do Not Sell or
Share My Personal Information" link appears to be required either.

**What is still needed:** a short, accurate **cookie disclosure inside the privacy notice** —
listing the four items above — and a statement that Mandate does not sell or share personal
information. A banner that asks consent for cookies the product does not set would be worse
than nothing: it is a false statement about your own processing.

**`[OPEN]` for legal review:** confirm (a) the classification of the two `mandate_*` cookies
in the first client's state(s), (b) whether the Turnstile IP processing needs its own mention
in the notice (recommended: yes, as a named recipient), (c) that the no-sale/no-share
position is correctly stated for every state the client operates in.

---

## Annex M — Open items and who owns them

### M.1 Blocking the legal pack

| # | Item | Owner |
|---|---|---|
| L1 | **Qualified legal review of all five drafts.** Nothing in `docs/legal/drafts/` may be published or signed without it | Founder + lawyer |
| L2 | **Resolve `STITCH_API_KEY` and `WEBCLAW_API_KEY`** — delete, or identify what uses them. The subprocessor list cannot be signed while two production credentials are unexplained | Founder |
| L3 | **Execute or confirm a DPA with each operational vendor** (Supabase, Vercel, Anthropic, Resend, Sentry, Cloudflare). Obligations cannot be flowed down before they are accepted upstream | Founder |
| L4 | **Decide the retention position.** Today the answer is "indefinitely, while the account exists". Either state that, or build a retention control. Do not write a schedule the code does not implement | Founder |
| L5 | **Decide the deletion position.** Suppression + human resolution is what the code does. The candidate notice must match it | Founder + lawyer |
| L6 | **Write an incident-response process** before signing any breach-notification window | Founder |
| L7 | **Confirm the compliance inventory.** The answer given on 2026-10-07 selected "none of these exist" *together with* ICO registration, cyber insurance, and a pen test in progress. These are mutually exclusive; all four rows are recorded **UNKNOWN** in the enterprise matrix pending a clean answer | Founder |
| L8 | **Verify Sentry's data region**, and decide whether to pin Vercel function regions | Founder |
| L9 | **Ask Anthropic whether `web_search` is ZDR-eligible** before ZDR is offered to any client | Founder |

### M.2 Security items that affect what can be promised

| # | Item | Why it matters contractually |
|---|---|---|
| S1 | **Raise the Supabase dashboard password floor to 12 + four classes** to match the application | Until then the app policy is bypassable with the anon key, so "we enforce strong passwords" is not accurate |
| S2 | **Enable leaked-password protection** (requires Pro) | Routinely asked in security questionnaires |
| S3 | **Rotate `SUPABASE_SERVICE_ROLE_KEY`** — known prior terminal exposure | A known-exposed master credential is not a defensible position once a client's data is held |
| S4 | **Move `executive_audit_events` writes behind a SECURITY DEFINER RPC** and drop the direct INSERT policy | The EI tier advertises an "append-only audit trail". It *is* append-only, but a user can insert self-attributed rows, so it is not tamper-evident. If the trail is sold as evidence, close this first |
| S5 | **Set `SENTRY_AUTH_TOKEN`** | Production stack traces are currently minified, which lengthens incident response — directly relevant to any incident commitment |

### M.3 The EU/UK trigger — an operational control that does not exist

The US-only scope is what makes this pack short. **Nothing in the product enforces it.**
There is no field recording a candidate's jurisdiction, no warning when a non-US candidate
is added, and no block. The scope assumption is a commercial intention, not a technical
control.

**Recommended, in order of cost:** (1) a line in the first client's contract stating the
service is contracted for US-based candidate sourcing; (2) a written internal trigger that
one non-US candidate re-opens the GDPR analysis before the next search; (3) later, if it
matters, a jurisdiction field with a soft warning. Option 1 costs a sentence and is worth
having in the first agreement.

---

*Compiled 2026-10-07 against commit `815e0bf` plus migration 160. Vendor facts fetched the
same day from Supabase's pricing and backup documentation, Anthropic's API data-retention
documentation, and Cloudflare's Turnstile guidance. Live database facts read from project
`xipyqnltkbtywxqyxupf` (region `us-east-1`). No production setting was changed and no
secret value was read; credentials were checked by name only.*
