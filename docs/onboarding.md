# Getting started with Mandate

For the first recruiter using the product on a live search. Written against
what the application actually does on 2026-10-09 — not the marketing
comps, which describe agents and limits that do not all exist.

If something here disagrees with the screen in front of you, **the screen is
right and this document is stale.** Tell someone.

---

## The one rule that governs everything

**Every AI output in Mandate is decision support. It is never a decision.**

No agent produces a hire/no-hire verdict. None assigns psychological or
mental-health labels. None infers protected characteristics. A human reads,
edits and approves every artifact before it reaches a client or a candidate.

This is not a disclaimer bolted on the end — it is built into the doors. The
places the product makes you stop and press something are the places a human
judgement is required, and they are listed in §4. If you find yourself
clicking through them without reading, the product is being used wrongly.

---

## 1. Before you start

You need:

- **An active account.** New signups land in `pending` and see nothing until
  a founder activates them and assigns an organisation. If you are stuck on
  a waiting screen, that is why — nobody has approved you yet, and no email
  is sent when they do.
- **A client record** (`/app/clients`) for whoever you are searching for.
  A mandate hangs off a client.
- **The CVs you intend to work with**, as PDF or DOCX.

You do *not* need to configure models, agents or skills. Those have defaults
that have been benchmarked, and changing them is a founder action with
evidence attached (`/app/settings/models` refuses a model nobody has
benchmarked).

---

## 2. The shape of a search

Mandate runs a mandate through a fixed sequence. Each step is gated on the
one before it, **and the gates are real** — the pages redirect or disable
their buttons rather than letting you run something on missing inputs.

```
  client  →  mandate  →  onboarding  →  calibration  →  job spec
                                                           ↓ (mark FINAL)
                           shortlist  ←  ranking  ←  candidates  ←  sourcing
                               ↓
                        hiring manager
```

### Step 1 — Create the mandate · `/app/projects/new`

One line describing the role is enough to start. The Intake Agent infers
structure, the Company Research Agent builds operating context from the
company name.

### Step 2 — Answer the onboarding questionnaire · `/app/projects/[id]/onboarding`

**This is the highest-leverage ten minutes in the whole product.** The
questionnaire is generated for this specific role, and what you put in it
becomes the scoring model every candidate is later judged against. Must-haves,
anti-patterns, priorities, stakeholders.

Vague answers here produce a vague scoring model, and the symptom shows up
three steps later as rankings that feel arbitrary. If you only read one
section of this document, read this paragraph.

Submitting it triggers calibration immediately.

### Step 3 — Review the calibration · on the mandate page, `/app/projects/[id]`

Calibration has no page of its own. It runs automatically when you submit the
questionnaire, and you review it on the mandate overview — the CALIBRATE tile
and the scoring-dimensions panel. (`/app/projects/[id]/calibration-history`
is a separate page, covered in step 7.)

The Calibration Agent proposes **dimension weights** — what matters and how
much — with its reasoning, plus up to three role-specific dimensions it
thinks this search needs.

Two things need you here:

- **The weights are editable.** They are a proposal from your own answers,
  not a result. Change them if they are wrong.
- **A proposed custom dimension scores nothing until a human with
  `mandates:write` approves it.** Deriving a weight tunes an axis a person
  wrote. Deriving a *dimension* invents the criterion people are ranked by,
  which is a different act and needs a different permission.

### Step 4 — Generate and finalise the job spec · `/app/projects/[id]/spec`

Requires calibration weights. Without them the page redirects away and the
SPEC tile reads `QUEUED` over a disabled button hinted *"Calibrate first"*.

The spec is versioned and fully editable. **Nothing downstream runs until you
mark a version FINAL** — that is the act that says a human stands behind this
description of the role.

> Marking a spec FINAL lets the Calibration Agent re-derive the mandate's
> *role identity* from it. That pass never touches your weights. It answers
> "which role is this", never "what matters in it".

### Step 5 — Sourcing · `/app/projects/[id]/sourcing`

Requires a **finalised** spec, not merely calibration. If there is no final
version the page tells you so rather than generating against a draft.

Produces LinkedIn Boolean, Google X-Ray and ATS queries in exact, broad and
adjacent variants. These are search strings for you to run — the product does
not scrape anyone.

### Step 6 — Get candidates in · `/app/projects/[id]/candidates/new` or `/app/candidates/intake`

Upload a CV and it is parsed into a structured profile, reviewed against the
role, and scored on the dimensions from step 3. Bulk intake exists at
`/app/candidates/intake`.

CV data lives in columns on the candidate — there is no separate CV table, and
a parse failure is recorded on the candidate rather than thrown away.

### Step 7 — Ranking, feedback, shortlist

- `/app/projects/[id]/ranking` — scores per dimension, tiers, leaderboard
- `/app/projects/[id]/feedback` — your reactions and the hiring manager's,
  interpreted into preference changes. **This is how the model learns the
  search**; it also flags contradictions and possible bias
- `/app/projects/[id]/shortlist` — the slate with trade-off analysis
- `/app/projects/[id]/comparison` — candidates side by side

Feedback recalibration changes weights. `/app/projects/[id]/calibration-history`
shows every move and why, so a ranking is never unexplainable.

### Step 8 — The hiring manager · `/app/projects/[id]/hiring-manager`

Generates a share link for the client's hiring manager. **The token in the URL
is the entire credential** — anyone holding the link sees the slate. Send it to
one person, not a distribution list, and never paste it anywhere public.

---

## 3. The other surfaces, briefly

| Where | What it is for |
|---|---|
| `/app/home` | Where you land. Current state across mandates |
| `/app/desk` | The working view — what needs you today |
| `/app/candidates/network` | People you already know, across mandates |
| `/app/candidates/search` | Ask for candidates from your own pool in plain language |
| `/app/analytics`, `/app/projects/[id]/metrics` | Funnel health, stalled searches |
| `/app/activity` | What happened, who did it, which agent |
| `/app/placements`, `/app/placements/invoices` | Placements and invoicing |
| `/app/executive-intelligence` | **Premium module.** Success profiles and interview plans for executive search. Independent of everything above |
| `/app/settings/skills` | Admin-authored instructions that steer agent judgment — tone, emphasis, framing. A skill can never widen what an agent may read or do |

---

## 4. Where a human must decide

These are the gates. Each exists because the alternative is a machine making a
call that is not a machine's to make.

| Gate | Why it is there |
|---|---|
| Approving a proposed **custom dimension** | Inventing a criterion people are ranked by |
| Marking a job spec **FINAL** | Says a person stands behind this description of the role |
| Editing **calibration weights** | The model proposes; you own what matters |
| Approving any **client-facing artifact** | Nothing reaches a client unread |
| Approving an executive **success profile** and **interview plan** | Both are versioned and require explicit human approval |

---

## 5. What is not ready yet — read this before promising anything

Being straight about this is cheaper than a retraction later.

- **No billing.** There is no Stripe integration, no plan, seat or quota
  enforcement anywhere. The pricing page describes tiers the application does
  not police. The first client is invoiced directly.
- **AI output quality is unmeasured.** The evaluation harness exists and has
  never been run; most capabilities have no eval behind them. The outputs are
  reviewed by you, which is the control that matters — but nobody should claim
  measured accuracy.
- **Bounce and delivery feedback is not wired.** Transactional email sends, but
  if a message bounces, nothing tells you.
- **Nothing external watches the status page.** `/status` and `/api/health` are
  live and honest; no alert fires if they go red.
- **Retention and deletion are undecided.** The product deletes nothing
  automatically. Do not promise a client a retention window — no policy has
  been settled with counsel.
- **Legal documents are unpublished drafts.** Every page under `/legal` says so
  on its face. None has been reviewed. Do not send one to a client.

### And the one that is not a feature gap

> **The production database has no backups** at the time of writing, and no
> storage backup has ever run. Until that changes, **do not load a client's
> candidate data into this system.** This is the single item that outranks
> everything else on the launch checklist, and it is not a code problem —
> it is a $25/month plan upgrade plus a backup destination.

---

## 6. If something breaks

- An agent failure shows a short sentence and logs the real error server-side.
  It never shows you a provider payload — if you ever see raw JSON with a
  `request_id` in it, that is a bug worth reporting.
- `/status` and `/api/health` tell you whether the database, auth and the
  scheduled job are alive.
- `/app/activity` is the audit trail — what ran, when, and which agent.
